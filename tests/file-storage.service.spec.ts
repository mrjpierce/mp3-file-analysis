import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { FileStorageService } from "../src/file-storage/file-storage.service";
import { S3Service } from "../src/file-storage/s3.service";
import { FileStorageModule } from "../src/file-storage/file-storage.module";
import {
  UploadError,
  ReadError,
  ObjectNotFoundError,
  ObjectEmptyError,
} from "../src/file-storage/errors";

describe("FileStorageService", () => {
  let service: FileStorageService;
  let s3Service: S3Service;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [FileStorageModule],
    })
      .overrideProvider(S3Service)
      .useValue({
        generateKey: jest.fn(),
        uploadStream: jest.fn(),
        getStream: jest.fn(),
      })
      .compile();

    service = module.get<FileStorageService>(FileStorageService);
    s3Service = module.get<S3Service>(S3Service);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("uploadAndGetStreams", () => {
    it("should upload stream and return multiple streams for processing", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const contentType = "audio/mpeg";
      const key = "test-key";
      const stream1 = Readable.from(Buffer.from("test data"));
      const stream2 = Readable.from(Buffer.from("test data"));
      const stream3 = Readable.from(Buffer.from("test data"));

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      (s3Service.getStream as jest.Mock)
        .mockResolvedValueOnce(stream1)
        .mockResolvedValueOnce(stream2)
        .mockResolvedValueOnce(stream3);

      const result = await service.uploadAndGetStreams(
        requestStream,
        contentType,
      );

      expect(result.key).toBe(key);
      expect(result.typeDetectionStream).toBe(stream1);
      expect(result.validationStream).toBe(stream2);
      expect(result.countingStream).toBe(stream3);
      expect(s3Service.generateKey).toHaveBeenCalledWith("mp3-uploads");
      expect(s3Service.uploadStream).toHaveBeenCalledWith(
        key,
        requestStream,
        contentType,
        undefined,
      );
      expect(s3Service.getStream).toHaveBeenCalledTimes(3);
      expect(s3Service.getStream).toHaveBeenCalledWith(key);
    });

    it("should handle upload errors and convert to UploadError", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockRejectedValue(
        new Error("Upload failed"),
      );

      await expect(
        service.uploadAndGetStreams(requestStream),
      ).rejects.toThrow(UploadError);
    });

    it("should handle read errors and convert to ReadError", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      (s3Service.getStream as jest.Mock).mockRejectedValue(
        new Error("Failed to get object"),
      );

      await expect(
        service.uploadAndGetStreams(requestStream),
      ).rejects.toThrow(ReadError);
    });

    it("should handle object not found errors", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      const error = new Error("not found");
      (error as any).name = "NoSuchKey";
      (s3Service.getStream as jest.Mock).mockRejectedValue(error);

      await expect(
        service.uploadAndGetStreams(requestStream),
      ).rejects.toThrow(ObjectNotFoundError);
    });

    it("should handle empty object errors", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      (s3Service.getStream as jest.Mock).mockRejectedValue(
        new Error("empty"),
      );

      await expect(
        service.uploadAndGetStreams(requestStream),
      ).rejects.toThrow(ObjectEmptyError);
    });

    it("should re-throw FileStorageError instances", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";
      const originalError = new UploadError("Original error", key);

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockRejectedValue(originalError);

      await expect(
        service.uploadAndGetStreams(requestStream),
      ).rejects.toThrow(originalError);
    });
  });
});

