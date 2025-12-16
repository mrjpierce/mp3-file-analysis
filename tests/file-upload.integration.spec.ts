import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { readFileSync } from "fs";
import { join } from "path";
import { AppModule } from "../src/tasks/file-upload/app.module";

describe("FileUploadController (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /file-upload", () => {
    it("should return frame count for valid MP3 file", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const response = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", fileBuffer, "test.mp3")
        .expect(201);

      expect(response.body).toHaveProperty("frameCount");
      expect(response.body.frameCount).toBe(5463);
    });

    it("should return 400 for missing file", async () => {
      const response = await request(app.getHttpServer())
        .post("/file-upload")
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("code");
      expect(response.body.code).toBe("FILE_REQUIRED");
    });

    it("should return 400 for invalid file type", async () => {
      const invalidFile = Buffer.from("This is not an MP3 file");

      const response = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", invalidFile, "test.txt")
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("code");
      expect(response.body.code).toBe("UNSUPPORTED_FORMAT");
    });

    it("should return 400 for non-multipart request", async () => {
      const response = await request(app.getHttpServer())
        .post("/file-upload")
        .set("Content-Type", "application/json")
        .send({ file: "data" })
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("code");
    });

    it("should handle multiple file uploads sequentially", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const response1 = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", fileBuffer, "test1.mp3")
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", fileBuffer, "test2.mp3")
        .expect(201);

      expect(response1.body.frameCount).toBe(response2.body.frameCount);
    });

    it("should return consistent frame count for same file", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const response1 = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", fileBuffer, "test.mp3")
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post("/file-upload")
        .attach("file", fileBuffer, "test.mp3")
        .expect(201);

      expect(response1.body.frameCount).toBe(response2.body.frameCount);
    });
  });
});

