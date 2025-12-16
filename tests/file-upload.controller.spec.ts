import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { Request } from "express";
import { FileUploadController } from "../src/file-upload/file-upload.controller";
import { FileUploadService } from "../src/file-upload/file-upload.service";
import { Mp3ProcessingService } from "../src/file-upload/mp3-processing.service";
import {
  UnsupportedFormatError,
  UploadValidationError,
  FileUploadErrorCode,
} from "../src/file-upload/errors";
import { Mp3AnalysisError, Mp3AnalysisErrorCode } from "../src/mp3-analysis/errors";
import { UploadError, ReadError } from "../src/file-storage/errors";
import { Mp3Version, Mp3Layer } from "../src/mp3-analysis/types";

describe("FileUploadController", () => {
  let controller: FileUploadController;
  let fileUploadService: jest.Mocked<FileUploadService>;
  let mp3ProcessingService: jest.Mocked<Mp3ProcessingService>;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    fileUploadService = {
      processUpload: jest.fn<Promise<{ key: string }>, [Request]>(),
    } as unknown as jest.Mocked<FileUploadService>;

    mp3ProcessingService = {
      processFile: jest.fn<Promise<{ frameCount: number }>, [string]>(),
    } as unknown as jest.Mocked<Mp3ProcessingService>;

    mockRequest = {
      headers: {},
      body: {},
    } as Partial<Request>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileUploadController],
      providers: [
        {
          provide: FileUploadService,
          useValue: fileUploadService,
        },
        {
          provide: Mp3ProcessingService,
          useValue: mp3ProcessingService,
        },
      ],
    }).compile();

    controller = module.get<FileUploadController>(FileUploadController);
  });

  describe("uploadFile", () => {
    it("should return frame count for successful upload and processing", async () => {
      const key = "test-key";
      const frameCount = 5463;

      fileUploadService.processUpload.mockResolvedValue({ key });
      mp3ProcessingService.processFile.mockResolvedValue({ frameCount });

      const result = await controller.uploadFile(mockRequest as Request);

      expect(result).toEqual({ frameCount });
      expect(fileUploadService.processUpload).toHaveBeenCalledWith(mockRequest);
      expect(mp3ProcessingService.processFile).toHaveBeenCalledWith(key);
    });

    it("should throw BadRequestException with UNSUPPORTED_FORMAT code for UnsupportedFormatError", async () => {
      const key = "test-key";
      const typeInfo = {
        version: Mp3Version.MPEG2,
        layer: Mp3Layer.Layer2,
        description: "MPEG-2 Layer 2",
      };
      const error = new UnsupportedFormatError(typeInfo);

      fileUploadService.processUpload.mockResolvedValue({ key });
      mp3ProcessingService.processFile.mockRejectedValue(error);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const exception = e as BadRequestException;
        expect(exception.getResponse()).toEqual({
          error: error.message,
          code: FileUploadErrorCode.UNSUPPORTED_FORMAT,
        });
      }
    });

    it("should throw BadRequestException with FILE_REQUIRED code for UploadValidationError", async () => {
      const error = new UploadValidationError("File is required");

      fileUploadService.processUpload.mockRejectedValue(error);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const exception = e as BadRequestException;
        expect(exception.getResponse()).toEqual({
          error: error.message,
          code: FileUploadErrorCode.FILE_REQUIRED,
        });
      }
    });

    it("should throw BadRequestException with INVALID_FORMAT code for Mp3AnalysisError", async () => {
      const key = "test-key";
      const error = new Mp3AnalysisError(
        Mp3AnalysisErrorCode.INVALID_FORMAT,
        "Invalid MP3 format",
      );

      fileUploadService.processUpload.mockResolvedValue({ key });
      mp3ProcessingService.processFile.mockRejectedValue(error);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const exception = e as BadRequestException;
        expect(exception.getResponse()).toEqual({
          error: error.message,
          code: FileUploadErrorCode.INVALID_FORMAT,
        });
      }
    });

    it("should throw InternalServerErrorException with STORAGE_UPLOAD_ERROR code for FileStorageError with UPLOAD_ERROR", async () => {
      const key = "test-key";
      const error = new UploadError("Upload failed", key);

      fileUploadService.processUpload.mockRejectedValue(error);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        InternalServerErrorException,
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(InternalServerErrorException);
        const exception = e as InternalServerErrorException;
        expect(exception.getResponse()).toEqual({
          error: error.message,
          code: FileUploadErrorCode.STORAGE_UPLOAD_ERROR,
        });
      }
    });

    it("should throw InternalServerErrorException with STORAGE_READ_ERROR code for FileStorageError with READ_ERROR", async () => {
      const key = "test-key";
      const error = new ReadError("Read failed", key);

      fileUploadService.processUpload.mockResolvedValue({ key });
      mp3ProcessingService.processFile.mockRejectedValue(error);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        InternalServerErrorException,
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBeInstanceOf(InternalServerErrorException);
        const exception = e as InternalServerErrorException;
        expect(exception.getResponse()).toEqual({
          error: error.message,
          code: FileUploadErrorCode.STORAGE_READ_ERROR,
        });
      }
    });

    it("should re-throw unknown errors", async () => {
      const key = "test-key";
      const unknownError = new Error("Unknown error");

      fileUploadService.processUpload.mockResolvedValue({ key });
      mp3ProcessingService.processFile.mockRejectedValue(unknownError);

      await expect(controller.uploadFile(mockRequest as Request)).rejects.toThrow(
        "Unknown error",
      );

      try {
        await controller.uploadFile(mockRequest as Request);
      } catch (e) {
        expect(e).toBe(unknownError);
        expect(e).not.toBeInstanceOf(BadRequestException);
        expect(e).not.toBeInstanceOf(InternalServerErrorException);
      }
    });
  });
});

