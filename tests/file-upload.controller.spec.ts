import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { readFileSync } from "fs";
import { join } from "path";
import { FileUploadController } from "../src/file-upload/file-upload.controller";
import { FileUploadModule } from "../src/file-upload/file-upload.module";

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

    it("should throw BadRequestException for invalid MP3 file", async () => {
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

      await expect(controller.uploadFile(mockFile)).rejects.toThrow();
    });

    it("should throw BadRequestException when file is missing", async () => {
      await expect(
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).rejects.toThrow();
    });
  });
});
