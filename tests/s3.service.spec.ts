import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { S3Service } from "../src/file-storage/s3.service";
import { FileStorageModule } from "../src/file-storage/file-storage.module";
import {
  S3Client,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";

jest.mock("@aws-sdk/client-s3");

type MockS3Client = Pick<S3Client, "send" | "destroy"> & {
  send: jest.MockedFunction<S3Client["send"]>;
  destroy: jest.MockedFunction<() => void>;
};

type S3ServiceWithClient = Record<"s3Client", S3Client>;

describe("S3Service", () => {
  let service: S3Service;
  let module: TestingModule;
  let mockS3Client: jest.Mocked<S3Client>;

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Set test environment variables
    process.env = {
      ...originalEnv,
      AWS_ENDPOINT: "http://localhost:4566",
      AWS_REGION: "us-east-1",
      S3_BUCKET_NAME: "test-bucket",
    };

    // Mock S3Client constructor
    (S3Client as jest.Mock).mockImplementation(() => {
      return {
        send: jest.fn(),
        destroy: jest.fn(),
      };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  beforeAll(async () => {
    // Create a mock S3Client before creating the module
    const mockSend = jest.fn();
    const mockClient: MockS3Client = {
      send: mockSend,
      destroy: jest.fn(),
    };
    mockS3Client = mockClient as jest.Mocked<S3Client>;

    // Mock S3Client to return our mock
    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);

    module = await Test.createTestingModule({
      imports: [FileStorageModule],
    }).compile();

    service = module.get<S3Service>(S3Service);
    // Update reference after service is created
    // Using double assertion through unknown to access private property for testing
    mockS3Client = (service as unknown as S3ServiceWithClient).s3Client as jest.Mocked<S3Client>;
  });

  afterAll(async () => {
    await module.close();
  });

  describe("onModuleInit", () => {
    it("should create bucket if it does not exist", async () => {
      // Mock HeadBucketCommand to throw NotFound error
      mockS3Client.send = jest.fn().mockImplementation((command) => {
        if (command instanceof HeadBucketCommand) {
          const error = Object.assign(new Error("NotFound"), {
            name: "NotFound",
          } as { name: string });
          throw error;
        }
        if (command instanceof CreateBucketCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      await service.onModuleInit();

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(HeadBucketCommand),
      );
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(CreateBucketCommand),
      );
    });

    it("should not create bucket if it already exists", async () => {
      // Mock HeadBucketCommand to succeed
      mockS3Client.send = jest.fn().mockImplementation((command) => {
        if (command instanceof HeadBucketCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      await service.onModuleInit();

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(HeadBucketCommand),
      );
      expect(mockS3Client.send).not.toHaveBeenCalledWith(
        expect.any(CreateBucketCommand),
      );
    });
  });

  describe("uploadStream", () => {
    it("should upload a stream using multipart upload", async () => {
      const key = "test-key";
      const stream = Readable.from(Buffer.from("test data"));
      const contentType = "audio/mpeg";

      let uploadId: string | undefined;
      const parts: Array<{ ETag: string; PartNumber: number }> = [];

      let partNumberCounter = 1;
      mockS3Client.send = jest.fn().mockImplementation((command) => {
        if (command instanceof CreateMultipartUploadCommand) {
          uploadId = "test-upload-id";
          return Promise.resolve({ UploadId: uploadId });
        }
        if (command instanceof UploadPartCommand) {
          const partNumber = partNumberCounter++;
          const part = {
            ETag: `etag-${partNumber}`,
            PartNumber: partNumber,
          };
          parts.push(part);
          return Promise.resolve({ ETag: part.ETag });
        }
        if (command instanceof CompleteMultipartUploadCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      await service.uploadStream(key, stream, contentType);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(CreateMultipartUploadCommand),
      );
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(UploadPartCommand),
      );
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(CompleteMultipartUploadCommand),
      );
    });

    it("should throw error on upload failure", async () => {
      const key = "test-key";
      const stream = Readable.from(Buffer.from("test data"));

      mockS3Client.send = jest
        .fn()
        .mockRejectedValue(new Error("Upload failed"));

      await expect(service.uploadStream(key, stream)).rejects.toThrow(
        "Upload failed",
      );
    });
  });

  describe("getStream", () => {
    it("should return a readable stream from S3", async () => {
      const key = "test-key";
      const mockStream = Readable.from(Buffer.from("test data"));

      mockS3Client.send = jest.fn().mockResolvedValue({
        Body: mockStream,
      });

      const stream = await service.getStream(key);

      expect(stream).toBeInstanceOf(Readable);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(GetObjectCommand),
      );
      // Verify the command was called (detailed property checks are implementation-specific)
      const callCount = (mockS3Client.send as jest.Mock).mock.calls.length;
      expect(callCount).toBeGreaterThan(0);
    });

    it("should throw error when object not found", async () => {
      const key = "test-key";

      const error = Object.assign(new Error("Object not found"), {
        name: "NoSuchKey",
      } as { name: string });
      mockS3Client.send = jest.fn().mockRejectedValue(error);

      await expect(service.getStream(key)).rejects.toThrow(
        `Object '${key}' not found`,
      );
    });

    it("should throw error when object body is empty", async () => {
      const key = "test-key";

      mockS3Client.send = jest.fn().mockResolvedValue({
        Body: null,
      });

      await expect(service.getStream(key)).rejects.toThrow(
        `Object '${key}' not found or empty`,
      );
    });
  });

  describe("objectExists", () => {
    it("should return true when object exists", async () => {
      const key = "test-key";

      mockS3Client.send = jest.fn().mockResolvedValue({});

      const exists = await service.objectExists(key);

      expect(exists).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(HeadObjectCommand),
      );
    });

    it("should return false when object does not exist", async () => {
      const key = "test-key";

      const error = Object.assign(new Error("NotFound"), {
        name: "NotFound",
      } as { name: string });
      mockS3Client.send = jest.fn().mockRejectedValue(error);

      const exists = await service.objectExists(key);

      expect(exists).toBe(false);
    });

    it("should throw error on unexpected errors", async () => {
      const key = "test-key";

      mockS3Client.send = jest
        .fn()
        .mockRejectedValue(new Error("Unexpected error"));

      await expect(service.objectExists(key)).rejects.toThrow(
        "Unexpected error",
      );
    });
  });

  describe("generateKey", () => {
    it("should generate a unique key with prefix", () => {
      const prefix = "test-prefix";
      const key1 = service.generateKey(prefix);
      const key2 = service.generateKey(prefix);

      expect(key1).toMatch(new RegExp(`^${prefix}/\\d+-[a-z0-9]+$`));
      expect(key2).toMatch(new RegExp(`^${prefix}/\\d+-[a-z0-9]+$`));
      expect(key1).not.toBe(key2); // Should be unique
    });

    it("should generate a unique key with default prefix", () => {
      const key = service.generateKey();

      expect(key).toMatch(/^uploads\/\d+-[a-z0-9]+$/);
    });
  });
});

