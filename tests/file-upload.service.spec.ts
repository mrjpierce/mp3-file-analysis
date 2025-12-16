import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { Request } from "express";
import { FileUploadService } from "../src/file-upload/file-upload.service";
import { FileStorageService } from "../src/file-storage/file-storage.service";
import { BusboyFactory } from "../src/file-upload/busboy-factory.service";
import { UploadValidationError } from "../src/file-upload/errors";
import { FileStorageError, UploadError } from "../src/file-storage/errors";

type FileInfo = { filename: string; encoding: string; mimeType: string };

interface MockBusboy {
  on: jest.Mock;
  pipe: jest.Mock;
}

describe("FileUploadService", () => {
  let service: FileUploadService;
  let fileStorageService: Pick<FileStorageService, "uploadStream">;
  let busboyFactory: Pick<BusboyFactory, "create">;
  let mockRequest: Partial<Request>;
  let mockBusboy: MockBusboy;

  beforeEach(async () => {
    // Create mock busboy instance
    mockBusboy = {
      on: jest.fn(),
      pipe: jest.fn(),
    };

    busboyFactory = {
      create: jest.fn().mockReturnValue(mockBusboy),
    };

    fileStorageService = {
      uploadStream: jest.fn<Promise<string>, [Readable, string?]>(),
    };

    mockRequest = {
      headers: {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
      },
      pipe: jest.fn(),
    } as Partial<Request>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: FileStorageService,
          useValue: fileStorageService,
        },
        {
          provide: BusboyFactory,
          useValue: busboyFactory,
        },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
  });

  describe("processUpload", () => {
    it("should successfully process upload and return key", async () => {
      const key = "test-key";
      const fileStream = Readable.from(Buffer.from("test file data"));
      const filename = "test.mp3";
      const mimeType = "audio/mpeg";
      const encoding = "7bit";

      (fileStorageService.uploadStream as jest.Mock).mockResolvedValue(key);

      // Set up event handlers
      let fileHandler: (name: string, stream: Readable, info: FileInfo) => void;
      let finishHandler: () => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "file" && handler) {
            fileHandler = handler as (name: string, stream: Readable, info: FileInfo) => void;
          } else if (event === "finish" && handler) {
            finishHandler = handler as () => void;
          }
        },
      );

      // Start the upload process
      const uploadPromise = service.processUpload(mockRequest as Request);

      // Simulate file event
      fileHandler!("file", fileStream, { filename, encoding, mimeType });

      // Simulate finish event
      finishHandler!();

      const result = await uploadPromise;

      expect(result).toEqual({ key });
      expect(busboyFactory.create).toHaveBeenCalledWith(mockRequest.headers);
      expect(fileStorageService.uploadStream).toHaveBeenCalledWith(
        fileStream,
        mimeType,
      );
      expect(mockRequest.pipe).toHaveBeenCalledWith(mockBusboy);
    });

    it("should throw UploadValidationError for invalid content type", async () => {
      mockRequest.headers = {
        "content-type": "application/json",
      };

      await expect(service.processUpload(mockRequest as Request)).rejects.toThrow(
        UploadValidationError,
      );

      try {
        await service.processUpload(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(UploadValidationError);
        expect((e as UploadValidationError).message).toContain("multipart/form-data");
      }
    });

    it("should throw UploadValidationError when no file is received", async () => {
      let finishHandler: () => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "finish" && handler) {
            finishHandler = handler as () => void;
          }
        },
      );

      const uploadPromise = service.processUpload(mockRequest as Request);

      // Simulate finish event without file event
      finishHandler!();

      await expect(uploadPromise).rejects.toThrow(UploadValidationError);

      try {
        await uploadPromise;
      } catch (e) {
        expect(e).toBeInstanceOf(UploadValidationError);
        expect((e as UploadValidationError).message).toBe("File is required");
      }
    });


    it("should throw UploadValidationError when busboy emits error", async () => {
      const busboyError = new Error("Busboy parsing error");
      let errorHandler: (error: Error) => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "error" && handler) {
            errorHandler = handler as (error: Error) => void;
          }
        },
      );

      const uploadPromise = service.processUpload(mockRequest as Request);

      // Simulate busboy error
      errorHandler!(busboyError);

      await expect(uploadPromise).rejects.toThrow(UploadValidationError);

      try {
        await uploadPromise;
      } catch (e) {
        expect(e).toBeInstanceOf(UploadValidationError);
        expect((e as UploadValidationError).message).toContain("Failed to parse multipart form data");
        expect((e as UploadValidationError).message).toContain(busboyError.message);
      }
    });

    it("should re-throw FileStorageError from upload", async () => {
      const key = "test-key";
      const fileStream = Readable.from(Buffer.from("test file data"));
      const storageError = new UploadError("Storage upload failed", key);

      (fileStorageService.uploadStream as jest.Mock).mockRejectedValue(storageError);

      let fileHandler: (name: string, stream: Readable, info: FileInfo) => void;
      let finishHandler: () => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "file" && handler) {
            fileHandler = handler as (name: string, stream: Readable, info: FileInfo) => void;
          } else if (event === "finish" && handler) {
            finishHandler = handler as () => void;
          }
        },
      );

      const uploadPromise = service.processUpload(mockRequest as Request);

      fileHandler!("file", fileStream, {
        filename: "test.mp3",
        encoding: "7bit",
        mimeType: "audio/mpeg",
      });

      finishHandler!();

      await expect(uploadPromise).rejects.toThrow(FileStorageError);
      await expect(uploadPromise).rejects.toThrow(storageError);
    });

    it("should re-throw non-FileStorageError from upload", async () => {
      const fileStream = Readable.from(Buffer.from("test file data"));
      const genericError = new Error("Generic error");

      (fileStorageService.uploadStream as jest.Mock).mockRejectedValue(genericError);

      let fileHandler: (name: string, stream: Readable, info: FileInfo) => void;
      let finishHandler: () => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "file" && handler) {
            fileHandler = handler as (name: string, stream: Readable, info: FileInfo) => void;
          } else if (event === "finish" && handler) {
            finishHandler = handler as () => void;
          }
        },
      );

      const uploadPromise = service.processUpload(mockRequest as Request);

      fileHandler!("file", fileStream, {
        filename: "test.mp3",
        encoding: "7bit",
        mimeType: "audio/mpeg",
      });

      finishHandler!();

      await expect(uploadPromise).rejects.toThrow("Generic error");
    });

    it("should ignore non-file fields", async () => {
      const key = "test-key";
      const fileStream = Readable.from(Buffer.from("test file data"));

      (fileStorageService.uploadStream as jest.Mock).mockResolvedValue(key);

      let fileHandler: (name: string, stream: Readable, info: FileInfo) => void;
      let finishHandler: () => void;

      mockBusboy.on.mockImplementation(
        (event: string, handler: ((...args: unknown[]) => void) | undefined) => {
          if (event === "file" && handler) {
            fileHandler = handler as (name: string, stream: Readable, info: FileInfo) => void;
          } else if (event === "finish" && handler) {
            finishHandler = handler as () => void;
          }
        },
      );

      const uploadPromise = service.processUpload(mockRequest as Request);

      // Simulate non-file field (should be ignored)
      const nonFileStream = Readable.from(Buffer.from("field value"));
      const resumeSpy = jest.spyOn(nonFileStream, "resume");
      fileHandler!("otherField", nonFileStream, {
        filename: "",
        encoding: "7bit",
        mimeType: "",
      });

      // Simulate actual file field
      fileHandler!("file", fileStream, {
        filename: "test.mp3",
        encoding: "7bit",
        mimeType: "audio/mpeg",
      });

      finishHandler!();

      const result = await uploadPromise;

      expect(result).toEqual({ key });
      expect(resumeSpy).toHaveBeenCalled(); // Non-file field should be drained
      expect(fileStorageService.uploadStream).toHaveBeenCalledTimes(1);
      expect(fileStorageService.uploadStream).toHaveBeenCalledWith(
        fileStream,
        "audio/mpeg",
      );
    });
  });
});

