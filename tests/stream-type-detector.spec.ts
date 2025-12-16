import { Readable } from "stream";
import { Mp3TypeDetector } from "../src/mp3-analysis/mp3-type-detector";
import { Mp3Version, Mp3Layer } from "../src/mp3-analysis/types";
import { COMMON_MP3_CONSTANTS } from "../src/mp3-analysis/consts";

describe("Mp3TypeDetector", () => {
  describe("detectTypeFromStream", () => {
    it("should detect MPEG-1 Layer 3 from stream", async () => {
      // Create a minimal MPEG-1 Layer 3 frame header
      // Version bits: 11 (MPEG-1), Layer bits: 01 (Layer 3)
      const frameHeader = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE, // 0xFF
        0xfb, // 0xFB = 1111 1011 (sync mask + MPEG-1 + Layer 3)
        0x90,
        0x00,
      ]);
      const buffer = Buffer.concat([frameHeader, Buffer.alloc(100)]);
      const stream = Readable.from(buffer);

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.MPEG1);
      expect(typeInfo.layer).toBe(Mp3Layer.Layer3);
      expect(typeInfo.description).toBe("MPEG-1 Layer 3");
    });

    it("should detect MPEG-2 Layer 3 from stream", async () => {
      // MPEG-2 Layer 3: Version bits: 10 (MPEG-2), Layer bits: 01 (Layer 3)
      const frameHeader = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE, // 0xFF
        0xf3, // 0xF3 = 1111 0011 (sync mask + MPEG-2 + Layer 3)
        0x90,
        0x00,
      ]);
      const buffer = Buffer.concat([frameHeader, Buffer.alloc(100)]);
      const stream = Readable.from(buffer);

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.MPEG2);
      expect(typeInfo.layer).toBe(Mp3Layer.Layer3);
      expect(typeInfo.description).toBe("MPEG-2 Layer 3");
    });

    it("should skip ID3v2 tags before detecting type", async () => {
      // ID3v2 header
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, // "ID3"
        0x03, 0x00, // version
        0x00, // flags
        0x00, 0x00, 0x00, 0x0a, // size (10 bytes)
      ]);
      const id3Data = Buffer.alloc(10);
      const frameHeader = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE,
        0xfb, // MPEG-1 Layer 3
        0x90,
        0x00,
      ]);
      const buffer = Buffer.concat([
        id3Header,
        id3Data,
        frameHeader,
        Buffer.alloc(100),
      ]);
      const stream = Readable.from(buffer);

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.MPEG1);
      expect(typeInfo.layer).toBe(Mp3Layer.Layer3);
    });

    it("should return Unknown for empty stream", async () => {
      const stream = Readable.from(Buffer.alloc(0));

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.Unknown);
      expect(typeInfo.layer).toBe(Mp3Layer.Unknown);
      expect(typeInfo.description).toBe("Invalid file: empty stream");
    });

    it("should return Unknown for stream with insufficient data", async () => {
      const stream = Readable.from(Buffer.from([0x00, 0x01, 0x02]));

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.Unknown);
      expect(typeInfo.layer).toBe(Mp3Layer.Unknown);
      expect(typeInfo.description).toBe("Invalid file: insufficient data");
    });

    it("should return Unknown when no valid MP3 frame found", async () => {
      const buffer = Buffer.alloc(100).fill(0x00);
      const stream = Readable.from(buffer);

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.Unknown);
      expect(typeInfo.layer).toBe(Mp3Layer.Unknown);
      expect(typeInfo.description).toBe("No valid MP3 frame found");
    });

    it("should handle stream errors", async () => {
      const stream = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      });

      await expect(
        Mp3TypeDetector.detectTypeFromStream(stream),
      ).rejects.toThrow("Stream error");
    });

    it("should handle chunked stream data", async () => {
      const frameHeader = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE,
        0xfb, // MPEG-1 Layer 3
        0x90,
        0x00,
      ]);
      const buffer = Buffer.concat([frameHeader, Buffer.alloc(100)]);

      // Create a stream that emits data in chunks
      const chunks = [
        buffer.subarray(0, 50),
        buffer.subarray(50, 100),
        buffer.subarray(100),
      ];
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

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream);

      expect(typeInfo.version).toBe(Mp3Version.MPEG1);
      expect(typeInfo.layer).toBe(Mp3Layer.Layer3);
    });

    it("should work with custom minBytes parameter", async () => {
      const frameHeader = Buffer.from([
        COMMON_MP3_CONSTANTS.SYNC_BYTE,
        0xfb, // MPEG-1 Layer 3
        0x90,
        0x00,
      ]);
      const buffer = Buffer.concat([frameHeader, Buffer.alloc(50)]);
      const stream = Readable.from(buffer);

      const typeInfo = await Mp3TypeDetector.detectTypeFromStream(stream, 20);

      expect(typeInfo.version).toBe(Mp3Version.MPEG1);
      expect(typeInfo.layer).toBe(Mp3Layer.Layer3);
    });
  });
});

