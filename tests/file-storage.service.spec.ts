import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { FileStorageService, MP3_UPLOADS_PREFIX } from "../src/file-storage/file-storage.service";
import { S3Service } from "../src/file-storage/s3.service";
import { FileStorageModule } from "../src/file-storage/file-storage.module";
import { StreamTee } from "../src/file-storage/stream-tee";
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

  describe("uploadAndGetStream", () => {
    it("should upload stream and return stream tee", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const contentType = "audio/mpeg";
      const key = "test-key";
      const s3Stream = Readable.from(Buffer.from("test data"));

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      (s3Service.getStream as jest.Mock).mockResolvedValueOnce(s3Stream);

      const result = await service.uploadAndGetStream(
        requestStream,
        contentType,
      );

      expect(result.key).toBe(key);
      expect(result.streamTee).toBeInstanceOf(StreamTee);
      expect(s3Service.generateKey).toHaveBeenCalledWith(MP3_UPLOADS_PREFIX);
      expect(s3Service.uploadStream).toHaveBeenCalledWith(
        key,
        requestStream,
        contentType,
      );
      expect(s3Service.getStream).toHaveBeenCalledTimes(1);
      expect(s3Service.getStream).toHaveBeenCalledWith(key);

      // Verify stream tee works - can get multiple streams
      const branch1 = result.streamTee.getStream();
      const branch2 = result.streamTee.getStream();
      expect(branch1).toBeInstanceOf(Readable);
      expect(branch2).toBeInstanceOf(Readable);

      // Verify both streams can read the same data
      const chunks1: Buffer[] = [];
      const chunks2: Buffer[] = [];

      branch1.on("data", (chunk: Buffer) => chunks1.push(chunk));
      branch2.on("data", (chunk: Buffer) => chunks2.push(chunk));

      await new Promise<void>((resolve) => {
        let ended1 = false;
        let ended2 = false;
        const checkDone = () => {
          if (ended1 && ended2) {
            const data1 = Buffer.concat(chunks1).toString();
            const data2 = Buffer.concat(chunks2).toString();
            expect(data1).toBe("test data");
            expect(data2).toBe("test data");
            resolve();
          }
        };

        branch1.on("end", () => {
          ended1 = true;
          checkDone();
        });

        branch2.on("end", () => {
          ended2 = true;
          checkDone();
        });
      });
    });

    it("should handle upload errors and convert to UploadError", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockRejectedValue(
        new Error("Upload failed"),
      );

      await expect(
        service.uploadAndGetStream(requestStream),
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
        service.uploadAndGetStream(requestStream),
      ).rejects.toThrow(ReadError);
    });

    it("should handle object not found errors", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockResolvedValue(undefined);
      const error = Object.assign(new Error("not found"), {
        name: "NoSuchKey",
      });
      (s3Service.getStream as jest.Mock).mockRejectedValue(error);

      await expect(
        service.uploadAndGetStream(requestStream),
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
        service.uploadAndGetStream(requestStream),
      ).rejects.toThrow(ObjectEmptyError);
    });

    it("should re-throw FileStorageError instances", async () => {
      const requestStream = Readable.from(Buffer.from("test data"));
      const key = "test-key";
      const originalError = new UploadError("Original error", key);

      (s3Service.generateKey as jest.Mock).mockReturnValue(key);
      (s3Service.uploadStream as jest.Mock).mockRejectedValue(originalError);

      await expect(
        service.uploadAndGetStream(requestStream),
      ).rejects.toThrow(originalError);
    });
  });
});

