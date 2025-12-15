import { Readable } from "stream";
import { StreamTee } from "../src/file-storage/stream-tee";

describe("StreamTee", () => {
  describe("getStream", () => {
    it("should return a stream that reads all data from source", (done) => {
      const sourceData = Buffer.from("test data");
      const sourceStream = Readable.from(sourceData);
      const tee = new StreamTee(sourceStream);

      const branch = tee.getStream();
      const chunks: Buffer[] = [];

      branch.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      branch.on("end", () => {
        const result = Buffer.concat(chunks);
        expect(result.toString()).toBe("test data");
        done();
      });

      branch.on("error", (error) => {
        done(error);
      });
    });

    it("should return multiple independent streams", (done) => {
      const sourceData = Buffer.from("test data");
      const sourceStream = Readable.from(sourceData);
      const tee = new StreamTee(sourceStream);

      const branch1 = tee.getStream();
      const branch2 = tee.getStream();

      const chunks1: Buffer[] = [];
      const chunks2: Buffer[] = [];

      let completed1 = false;
      let completed2 = false;

      const checkDone = () => {
        if (completed1 && completed2) {
          const result1 = Buffer.concat(chunks1).toString();
          const result2 = Buffer.concat(chunks2).toString();
          expect(result1).toBe("test data");
          expect(result2).toBe("test data");
          done();
        }
      };

      branch1.on("data", (chunk: Buffer) => {
        chunks1.push(chunk);
      });

      branch1.on("end", () => {
        completed1 = true;
        checkDone();
      });

      branch2.on("data", (chunk: Buffer) => {
        chunks2.push(chunk);
      });

      branch2.on("end", () => {
        completed2 = true;
        checkDone();
      });

      branch1.on("error", (error) => done(error));
      branch2.on("error", (error) => done(error));
    });

    it("should handle streams that are already ended", (done) => {
      const sourceData = Buffer.from("test data");
      const sourceStream = Readable.from(sourceData);
      const tee = new StreamTee(sourceStream);

      // Wait for source to end
      sourceStream.on("end", () => {
        const branch = tee.getStream();
        const chunks: Buffer[] = [];

        branch.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        branch.on("end", () => {
          const result = Buffer.concat(chunks).toString();
          expect(result).toBe("test data");
          done();
        });

        branch.on("error", (error) => {
          done(error);
        });
      });
    });

    it("should propagate errors to all branches", (done) => {
      const sourceStream = new Readable({
        read() {
          this.emit("error", new Error("Source error"));
        },
      });

      const tee = new StreamTee(sourceStream);
      const branch1 = tee.getStream();
      const branch2 = tee.getStream();

      let errorCount = 0;

      const checkDone = () => {
        if (errorCount === 2) {
          done();
        }
      };

      branch1.on("error", (error) => {
        expect(error.message).toBe("Source error");
        errorCount++;
        checkDone();
      });

      branch2.on("error", (error) => {
        expect(error.message).toBe("Source error");
        errorCount++;
        checkDone();
      });
    });

    it("should handle empty streams", (done) => {
      const sourceStream = Readable.from(Buffer.alloc(0));
      const tee = new StreamTee(sourceStream);

      const branch = tee.getStream();
      const chunks: Buffer[] = [];

      branch.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      branch.on("end", () => {
        const result = Buffer.concat(chunks);
        expect(result.length).toBe(0);
        done();
      });

      branch.on("error", (error) => {
        done(error);
      });
    });

    it("should handle large streams", (done) => {
      const largeData = Buffer.alloc(100000, "a");
      const sourceStream = Readable.from(largeData);
      const tee = new StreamTee(sourceStream);

      const branch = tee.getStream();
      let totalBytes = 0;

      branch.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
      });

      branch.on("end", () => {
        expect(totalBytes).toBe(100000);
        done();
      });

      branch.on("error", (error) => {
        done(error);
      });
    });

    it("should clean up branches when destroyed", (done) => {
      const sourceData = Buffer.from("test data");
      const sourceStream = Readable.from(sourceData);
      const tee = new StreamTee(sourceStream);

      const branch = tee.getStream();

      branch.on("close", () => {
        done();
      });

      branch.destroy();
    });
  });

  describe("destroy", () => {
    it("should destroy source stream and all branches", (done) => {
      const sourceStream = Readable.from(Buffer.from("test data"));
      const tee = new StreamTee(sourceStream);

      const branch1 = tee.getStream();
      const branch2 = tee.getStream();

      let destroyedCount = 0;

      const checkDone = () => {
        if (destroyedCount === 2) {
          expect(sourceStream.destroyed).toBe(true);
          done();
        }
      };

      branch1.on("close", () => {
        destroyedCount++;
        checkDone();
      });

      branch2.on("close", () => {
        destroyedCount++;
        checkDone();
      });

      tee.destroy();
    });
  });
});

