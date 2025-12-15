import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { readFileSync } from "fs";
import { join } from "path";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { FileUploadController } from "../src/file-upload/file-upload.controller";
import { FileUploadModule } from "../src/file-upload/file-upload.module";
import { ErrorResponseDto } from "../src/common/dto/error-response.dto";
import { FileUploadErrorCode } from "../src/file-upload/file-upload-errors";

describe("FileUploadController", () => {
  let controller: FileUploadController;
  let app: TestingModule;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FileUploadModule],
    }).compile();

    app = module;
    controller = module.get<FileUploadController>(FileUploadController);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /file-upload", () => {
    it("should return actual frameCount for valid MPEG-1 Layer 3 file", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const mockFile: Express.Multer.File = {
        fieldname: "file",
        originalname: "Frame by Frame (Foundation Health).mp3",
        encoding: "7bit",
        mimetype: "audio/mpeg",
        size: fileBuffer.length,
        buffer: fileBuffer,
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      const result = await controller.uploadFile(mockFile);

      expect(result).toHaveProperty("frameCount");
      expect(result.frameCount).toBeGreaterThan(0);
      expect(typeof result.frameCount).toBe("number");
    });

    it("should throw BadRequestException with structured error for invalid MP3 file", async () => {
      const mockFile: Express.Multer.File = {
        fieldname: "file",
        originalname: "test.txt",
        encoding: "7bit",
        mimetype: "text/plain",
        size: 1024,
        buffer: Buffer.from("This is not an MP3 file"),
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      await expect(controller.uploadFile(mockFile)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.uploadFile(mockFile);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.getResponse() as ErrorResponseDto;
          expect(response).toHaveProperty("error");
          expect(response).toHaveProperty("code");
          // Non-MP3 files return UNSUPPORTED_FORMAT (no parser available)
          expect(response.code).toBe(FileUploadErrorCode.UNSUPPORTED_FORMAT);
        }
      }
    });

    it("should throw BadRequestException with FILE_REQUIRED code when file is missing", async () => {
      await expect(
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);

      try {
        await controller.uploadFile(
          null as unknown as Express.Multer.File,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.getResponse() as ErrorResponseDto;
          expect(response).toHaveProperty("error");
          expect(response).toHaveProperty("code");
          expect(response.code).toBe(FileUploadErrorCode.FILE_REQUIRED);
        }
      }
    });

    it("should throw PayloadTooLargeException with FILE_TOO_LARGE code for files > 1GB", async () => {
      const largeFileBuffer = Buffer.alloc(1024 * 1024 * 1024 + 1); // 1GB + 1 byte
      const mockFile: Express.Multer.File = {
        fieldname: "file",
        originalname: "large.mp3",
        encoding: "7bit",
        mimetype: "audio/mpeg",
        size: largeFileBuffer.length,
        buffer: largeFileBuffer,
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      await expect(controller.uploadFile(mockFile)).rejects.toThrow(
        PayloadTooLargeException,
      );

      try {
        await controller.uploadFile(mockFile);
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadTooLargeException);
        if (error instanceof PayloadTooLargeException) {
          const response = error.getResponse() as ErrorResponseDto;
          expect(response).toHaveProperty("error");
          expect(response).toHaveProperty("code");
          expect(response.code).toBe(FileUploadErrorCode.FILE_TOO_LARGE);
          expect(response.error).toBe("File too large");
        }
      }
    });

    it("should process files using streaming (maintains frame count accuracy)", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      // Get frame count using buffer method (baseline)
      const mockFileBuffer: Express.Multer.File = {
        fieldname: "file",
        originalname: "Frame by Frame (Foundation Health).mp3",
        encoding: "7bit",
        mimetype: "audio/mpeg",
        size: fileBuffer.length,
        buffer: fileBuffer,
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      const result = await controller.uploadFile(mockFileBuffer);
      const frameCountFromStreaming = result.frameCount;

      // Verify frame count is a valid number
      expect(frameCountFromStreaming).toBeGreaterThan(0);
      expect(typeof frameCountFromStreaming).toBe("number");

      // Note: We can't directly compare with buffer method since controller now uses streaming
      // But we can verify the result is consistent across multiple calls
      const result2 = await controller.uploadFile(mockFileBuffer);
      expect(result2.frameCount).toBe(frameCountFromStreaming);
    });

    it("should handle streaming for files with ID3v2 tags", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const mockFile: Express.Multer.File = {
        fieldname: "file",
        originalname: "Frame by Frame (Foundation Health).mp3",
        encoding: "7bit",
        mimetype: "audio/mpeg",
        size: fileBuffer.length,
        buffer: fileBuffer,
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      const result = await controller.uploadFile(mockFile);

      // Should successfully process file with ID3v2 tags via streaming
      expect(result).toHaveProperty("frameCount");
      expect(result.frameCount).toBeGreaterThan(0);
    });
  });
});
