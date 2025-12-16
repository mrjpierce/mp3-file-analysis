import { Readable } from "stream";
import { Mp3FrameIterator } from "../src/mp3-analysis/mp3-frame-iterator";
import { Mpeg1Layer3ParserService } from "../src/mp3-analysis/mpeg1-layer3-parser.service";

describe("Mp3FrameIterator", () => {
  let parser: Mpeg1Layer3ParserService;

  beforeAll(() => {
    parser = new Mpeg1Layer3ParserService();
  });

  describe("next", () => {
    it("should find and return frames from a stream", async () => {
      // Create a minimal valid MP3 frame header
      // MPEG-1 Layer 3 frame: 0xFF 0xFB (sync pattern)
      const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const frameData = Buffer.alloc(417); // Typical frame size
      const buffer = Buffer.concat([frameHeader, frameData]);

      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      const frame = await iterator.next();

      expect(frame).not.toBeNull();
      expect(frame?.position).toBe(0);
      expect(frame?.length).toBeGreaterThan(0);
    });

    it("should return null when no more frames are available", async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      const frame = await iterator.next();

      expect(frame).toBeNull();
    });

    it("should handle streams with ID3v2 tags", async () => {
      // ID3v2 header: "ID3" + version + flags + size (10 bytes)
      const id3Header = Buffer.from([
        0x49, 0x44, 0x33, // "ID3"
        0x03, 0x00, // version
        0x00, // flags
        0x00, 0x00, 0x00, 0x0a, // size (10 bytes)
      ]);
      const id3Data = Buffer.alloc(10);
      const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const frameData = Buffer.alloc(417);
      const buffer = Buffer.concat([
        id3Header,
        id3Data,
        frameHeader,
        frameData,
      ]);

      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      const frame = await iterator.next();

      expect(frame).not.toBeNull();
      // Frame should be found (ID3v2 tag should be skipped by iterator)
      expect(frame?.position).toBeGreaterThanOrEqual(0);
    });

    it("should handle chunked stream data", async () => {
      const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const frameData = Buffer.alloc(417);
      const buffer = Buffer.concat([frameHeader, frameData]);

      // Create a stream that emits data in chunks
      const chunks = [
        buffer.subarray(0, 100),
        buffer.subarray(100, 200),
        buffer.subarray(200),
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

      const iterator = new Mp3FrameIterator(stream, parser);

      const frame = await iterator.next();

      expect(frame).not.toBeNull();
    });

    it("should throw error when stream errors", async () => {
      const stream = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      });

      const iterator = new Mp3FrameIterator(stream, parser);

      await expect(iterator.next()).rejects.toThrow("Stream error");
    });

    it("should handle multiple frames in sequence", async () => {
      // Create two frames
      const frame1 = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        Buffer.alloc(417),
      ]);
      const frame2 = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        Buffer.alloc(417),
      ]);
      const buffer = Buffer.concat([frame1, frame2]);

      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      const frame1Result = await iterator.next();
      expect(frame1Result).not.toBeNull();

      const frame2Result = await iterator.next();
      expect(frame2Result).not.toBeNull();
      expect(frame2Result?.position).toBeGreaterThan(frame1Result?.position || 0);
    });

    it("should not allow concurrent next() calls", async () => {
      const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const frameData = Buffer.alloc(417);
      const buffer = Buffer.concat([frameHeader, frameData]);

      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      // Start two concurrent calls
      iterator.next(); // First call (not awaited)
      const promise2 = iterator.next();

      await expect(promise2).rejects.toThrow(
        "Multiple concurrent calls to next() are not supported",
      );
    });
  });

  describe("hasNext", () => {
    it("should return true when stream has not ended", () => {
      const stream = Readable.from(Buffer.from([0x00, 0x01]));
      const iterator = new Mp3FrameIterator(stream, parser);

      expect(iterator.hasNext()).toBe(true);
    });

    it("should return false when stream has ended and no frames remain", async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02]);
      const stream = Readable.from(buffer);
      const iterator = new Mp3FrameIterator(stream, parser);

      // Wait for stream to end
      await new Promise((resolve) => stream.on("end", resolve));

      expect(iterator.hasNext()).toBe(false);
    });

    it("should return false when stream has error", () => {
      const stream = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      });

      const iterator = new Mp3FrameIterator(stream, parser);

      // Wait a bit for error to propagate
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(iterator.hasNext()).toBe(false);
          resolve();
        }, 10);
      });
    });
  });
});

