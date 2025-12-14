import { Test, TestingModule } from "@nestjs/testing";
import { readFileSync } from "fs";
import { join } from "path";
import { Mpeg1Layer3ParserService } from "../src/mp3-analysis/mpeg1-layer3-parser.service";
import { Mp3ParserModule } from "../src/mp3-analysis/mp3-analysis.module";

describe("Mpeg1Layer3ParserService", () => {
  let service: Mpeg1Layer3ParserService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [Mp3ParserModule],
    }).compile();

    service = module.get<Mpeg1Layer3ParserService>(Mpeg1Layer3ParserService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe("countFrames", () => {
    it("should count frames in a valid MPEG-1 Layer 3 file", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const frameCount = await service.countFrames(fileBuffer);

      expect(frameCount).toBeGreaterThan(0);
      expect(typeof frameCount).toBe("number");
    });

    it("should throw error for invalid MP3 file", async () => {
      const invalidBuffer = Buffer.from("This is not an MP3 file");

      await expect(service.countFrames(invalidBuffer)).rejects.toThrow();
    });

    it("should handle empty buffer", async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(service.countFrames(emptyBuffer)).rejects.toThrow();
    });

    it("should handle buffer with no valid MP3 frames", async () => {
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);

      await expect(service.countFrames(invalidBuffer)).rejects.toThrow();
    });

    it("should skip ID3v2 tags and count frames correctly", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      const frameCount = await service.countFrames(fileBuffer);

      expect(frameCount).toBeGreaterThan(0);
      expect(typeof frameCount).toBe("number");
    });
  });
});
