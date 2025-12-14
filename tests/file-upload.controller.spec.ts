import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
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
    it("should return hardcoded frameCount of 42 when file is provided", async () => {
      const mockFile: Express.Multer.File = {
        fieldname: "file",
        originalname: "test.mp3",
        encoding: "7bit",
        mimetype: "audio/mpeg",
        size: 1024,
        buffer: Buffer.from("test file content"),
        destination: "",
        filename: "",
        path: "",
        stream: null as unknown as Readable,
      };

      const result = await controller.uploadFile(mockFile);

      expect(result).toEqual({ frameCount: 42 });
    });

    it("should throw BadRequestException when file is missing", async () => {
      await expect(
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).rejects.toThrow();
    });
  });
});
