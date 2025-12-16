import { Test, TestingModule } from "@nestjs/testing";
import { readFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { Mpeg1Layer3ParserService } from "../src/mp3-analysis/mpeg1-layer3-parser.service";
import { Mp3ParserModule } from "../src/mp3-analysis/mp3-analysis.module";
import { Mp3FrameIterator } from "../src/mp3-analysis/mp3-frame-iterator";
import {
  NoValidFramesError,
  CorruptedFrameHeaderError,
} from "../src/mp3-analysis/errors";
import { COMMON_MP3_CONSTANTS } from "../src/mp3-analysis/consts";

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
      const stream = Readable.from(fileBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      const frameCount = await service.countFrames(iterator);

      expect(frameCount).toBe(5463);
    });

    it("should throw error for invalid MP3 file", async () => {
      const invalidBuffer = Buffer.from("This is not an MP3 file");
      const stream = Readable.from(invalidBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.countFrames(iterator)).rejects.toThrow();
    });

    it("should handle empty buffer", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const stream = Readable.from(emptyBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.countFrames(iterator)).rejects.toThrow();
    });

    it("should handle buffer with no valid MP3 frames", async () => {
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
      const stream = Readable.from(invalidBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.countFrames(iterator)).rejects.toThrow(
        NoValidFramesError,
      );
    });

    it("should skip ID3v2 tags and count frames correctly", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);
      const stream = Readable.from(fileBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      const frameCount = await service.countFrames(iterator);

      expect(frameCount).toBeGreaterThan(0);
      expect(typeof frameCount).toBe("number");
    });

    it("should handle chunked stream data correctly", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);

      // Create a stream that emits data in chunks
      const chunks: Buffer[] = [];
      const chunkSize = 1024;
      for (let i = 0; i < fileBuffer.length; i += chunkSize) {
        chunks.push(fileBuffer.subarray(i, i + chunkSize));
      }

      const stream = new Readable({
        read() {
          const chunk = chunks.shift();
          if (chunk) {
            this.push(chunk);
          } else {
            this.push(null);
          }
        },
      });

      const iterator = new Mp3FrameIterator(stream, service);
      const frameCount = await service.countFrames(iterator);

      expect(frameCount).toBeGreaterThan(0);
    });
  });

  describe("validate", () => {
    it("should validate a valid MPEG-1 Layer 3 file", async () => {
      const testFilePath = join(
        __dirname,
        "../test-data/Frame by Frame (Foundation Health).mp3",
      );
      const fileBuffer = readFileSync(testFilePath);
      const stream = Readable.from(fileBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.validate(iterator)).resolves.not.toThrow();
    });

    it("should throw error for invalid MP3 file", async () => {
      const invalidBuffer = Buffer.from("This is not an MP3 file");
      const stream = Readable.from(invalidBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.validate(iterator)).rejects.toThrow();
    });

    it("should throw error for empty buffer", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const stream = Readable.from(emptyBuffer);
      const iterator = new Mp3FrameIterator(stream, service);

      await expect(service.validate(iterator)).rejects.toThrow();
    });
  });

  describe("isFormatSpecificFrame", () => {
    it("should return true for valid MPEG-1 Layer 3 frame", () => {
      const buffer = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const result = service.isFormatSpecificFrame(buffer, 0);
      expect(result).toBe(true);
    });

    it("should return false for MPEG-2 frame", () => {
      // MPEG-2 Layer 3: version bits = 10
      const buffer = Buffer.from([0xff, 0xf3, 0x90, 0x00]);
      const result = service.isFormatSpecificFrame(buffer, 0);
      expect(result).toBe(false);
    });

    it("should return false for invalid bitrate index", () => {
      // Bitrate index = 0 (invalid)
      const buffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
      const result = service.isFormatSpecificFrame(buffer, 0);
      expect(result).toBe(false);
    });

    it("should return false for invalid sample rate index", () => {
      // Sample rate index = 3 (invalid)
      const buffer = Buffer.from([0xff, 0xfb, 0xfc, 0x00]);
      const result = service.isFormatSpecificFrame(buffer, 0);
      expect(result).toBe(false);
    });

    it("should return false when buffer is too small", () => {
      const buffer = Buffer.from([0xff, 0xfb]);
      const result = service.isFormatSpecificFrame(buffer, 0);
      expect(result).toBe(false);
    });
  });

  describe("calculateFrameLength", () => {
    it("should calculate frame length for valid header", () => {
      const headerBytes = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const length = service.calculateFrameLength(headerBytes);
      expect(length).toBeGreaterThan(0);
    });

    it("should return 0 for invalid header", () => {
      const headerBytes = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
      const length = service.calculateFrameLength(headerBytes);
      expect(length).toBe(0);
    });

    it("should return 0 when header is too small", () => {
      const headerBytes = Buffer.from([0xff, 0xfb]);
      const length = service.calculateFrameLength(headerBytes);
      expect(length).toBe(0);
    });
  });

  describe("parseFrameHeader", () => {
    it("should parse valid frame header", () => {
      const buffer = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const length = service.parseFrameHeader(buffer, 0);
      expect(length).toBeGreaterThan(0);
    });

    it("should throw error for invalid bitrate", () => {
      const buffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
      expect(() => service.parseFrameHeader(buffer, 0)).toThrow(
        CorruptedFrameHeaderError,
      );
    });

    it("should throw error when buffer is too small", () => {
      const buffer = Buffer.from([0xff, 0xfb]);
      expect(() => service.parseFrameHeader(buffer, 0)).toThrow(
        CorruptedFrameHeaderError,
      );
    });
  });

  describe("getMinFrameSize", () => {
    it("should return minimum frame size", () => {
      const minSize = service.getMinFrameSize();
      expect(minSize).toBeGreaterThan(0);
      expect(typeof minSize).toBe("number");
    });
  });

  describe("isFrameSync", () => {
    it("should detect valid sync pattern", () => {
      const buffer = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE,
        0xfb,
        0x00,
        0x00,
      ]);
      const result = service.isFrameSync(buffer, 0);
      expect(result).toBe(true);
    });

    it("should not detect invalid sync pattern", () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = service.isFrameSync(buffer, 0);
      expect(result).toBe(false);
    });
  });
});
