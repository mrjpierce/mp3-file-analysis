import { Readable, PassThrough } from "stream";

/**
 * StreamTee allows splitting a single source stream into multiple readable streams
 * that can be consumed independently. All data from the source stream is buffered
 * and distributed to all branches.
 *
 * This is useful when you need to read the same stream multiple times, such as
 * for validation and counting operations that must remain separate.
 */
export class StreamTee {
  private chunks: Buffer[] = [];
  private isEnded: boolean = false;
  private error: Error | null = null;
  private branches: PassThrough[] = [];
  private sourceStream: Readable;

  /**
   * Creates a new StreamTee that will buffer data from the source stream
   * @param sourceStream The source stream to tee
   */
  constructor(sourceStream: Readable) {
    this.sourceStream = sourceStream;
    this.setupSourceStream();
  }

  private setupSourceStream(): void {
    this.sourceStream.on("data", (chunk: Buffer) => {
      this.chunks.push(chunk);
      // Distribute to all active branches
      for (const branch of this.branches) {
        if (!branch.destroyed) {
          branch.write(chunk);
        }
      }
    });

    this.sourceStream.on("end", () => {
      this.isEnded = true;
      // End all active branches
      for (const branch of this.branches) {
        if (!branch.destroyed) {
          branch.end();
        }
      }
    });

    this.sourceStream.on("error", (error: Error) => {
      this.error = error;
      // Propagate error to all active branches
      for (const branch of this.branches) {
        if (!branch.destroyed) {
          branch.destroy(error);
        }
      }
    });

    // Resume source stream if paused
    if (this.sourceStream.isPaused()) {
      this.sourceStream.resume();
    }
  }

  /**
   * Gets a new readable stream that reads from the buffered data
   * Can be called multiple times to get multiple independent streams
   * @returns A readable stream that reads from the buffered data
   */
  getStream(): Readable {
    // If there was an error, propagate it immediately
    if (this.error) {
      const errorStream = new PassThrough();
      setImmediate(() => errorStream.destroy(this.error!));
      return errorStream;
    }

    const branch = new PassThrough();

    // Write all buffered chunks to the new branch
    for (const chunk of this.chunks) {
      if (!branch.destroyed) {
        branch.write(chunk);
      }
    }

    // If source stream already ended, end this branch too
    if (this.isEnded) {
      setImmediate(() => {
        if (!branch.destroyed) {
          branch.end();
        }
      });
    } else {
      // Add to active branches for future chunks
      this.branches.push(branch);
    }

    // Clean up branch when it's destroyed
    branch.on("close", () => {
      const index = this.branches.indexOf(branch);
      if (index > -1) {
        this.branches.splice(index, 1);
      }
    });

    return branch;
  }

  /**
   * Destroys the tee and cleans up resources
   */
  destroy(): void {
    // Destroy source stream
    if (!this.sourceStream.destroyed) {
      this.sourceStream.destroy();
    }

    // Destroy all branches
    for (const branch of this.branches) {
      if (!branch.destroyed) {
        branch.destroy();
      }
    }

    this.branches = [];
    this.chunks = [];
  }
}
