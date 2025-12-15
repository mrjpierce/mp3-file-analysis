import { Readable } from "stream";
import { FrameInfo, IMp3Parser, IFrameIterator } from "./types";
import { Mp3Parser } from "./mp3-parser";
import { COMMON_MP3_CONSTANTS } from "./consts";

/**
 * Iterator for traversing MP3 frames in a stream
 * Handles stream traversal logic: event handling, chunk management, window buffers
 */
export class Mp3FrameIterator implements IFrameIterator {
  private buffer: Buffer = Buffer.alloc(0);
  private currentPosition: number = 0;
  private id3v2Skipped: boolean = false;
  private isEnded: boolean = false;
  private windowSize: number = 4; // For sync detection across chunks
  private pendingResolve: ((value: FrameInfo | null) => void) | null = null;
  private pendingReject: ((reason?: any) => void) | null = null;
  private streamError: Error | null = null;

  constructor(
    private readonly stream: Readable,
    private readonly parser: IMp3Parser,
  ) {
    this.setupStreamListeners();
  }

  private setupStreamListeners(): void {
    this.stream.on("data", this.onData.bind(this));
    this.stream.on("end", this.onEnd.bind(this));
    this.stream.on("error", this.onError.bind(this));
    
    // Resume stream if it's paused
    if (this.stream.isPaused()) {
      this.stream.resume();
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.processBuffer();
  }

  private onEnd(): void {
    this.isEnded = true;
    this.processBuffer(); // Process any remaining data
    
    // If there's a pending promise and no more frames, resolve it with null
    if (this.pendingResolve) {
      // Check one more time if there are frames after processing
      const frame = this.findNextFrame();
      if (frame) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve(frame);
      } else {
        // No more frames, resolve with null
        this.pendingResolve(null);
        this.pendingResolve = null;
        this.pendingReject = null;
      }
    }
  }

  private onError(error: Error): void {
    this.streamError = error;
    if (this.pendingReject) {
      this.pendingReject(error);
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }

  private processBuffer(): void {
    // Skip ID3v2 tag on first chunk only
    if (!this.id3v2Skipped && this.buffer.length >= COMMON_MP3_CONSTANTS.ID3V2_HEADER_SIZE) {
      const tagEndPosition = Mp3Parser.findId3v2TagEnd(this.buffer);
      if (tagEndPosition > 0) {
        this.id3v2Skipped = true;
        this.buffer = this.buffer.subarray(tagEndPosition);
        this.currentPosition = 0;
      } else {
        this.id3v2Skipped = true;
      }
    }

    // Try to find and yield frames if there's a pending promise
    if (this.pendingResolve) {
      const frameInfo = this.findNextFrame();
      if (frameInfo) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve(frameInfo);
        return;
      }
      
      // No frame found, but if stream ended, resolve with null
      if (this.isEnded) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve(null);
        return;
      }
    }

    // Trim buffer if it's too large (keep processed data + windowSize bytes)
    // Only trim data before currentPosition to avoid losing unprocessed frames
    const maxBufferSize = this.parser.getMinFrameSize() * 10; // Keep reasonable buffer
    if (this.buffer.length > maxBufferSize && this.currentPosition > this.windowSize) {
      const trimAmount = this.currentPosition - this.windowSize;
      this.buffer = this.buffer.subarray(trimAmount);
      this.currentPosition = this.windowSize;
    }
  }

  private findNextFrame(): FrameInfo | null {
    const minFrameSize = this.parser.getMinFrameSize();

    while (this.currentPosition < this.buffer.length - minFrameSize) {
      if (!this.parser.isFrameSync(this.buffer, this.currentPosition)) {
        this.currentPosition++;
        continue;
      }

      if (!this.parser.isFormatSpecificFrame(this.buffer, this.currentPosition)) {
        this.currentPosition++;
        continue;
      }

      const headerBytes = this.buffer.subarray(
        this.currentPosition,
        this.currentPosition + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE,
      );

      const frameLength = this.parser.calculateFrameLength(headerBytes);

      if (frameLength <= 0) {
        this.currentPosition++;
        continue;
      }

      // Check if we have enough data for the full frame
      if (this.currentPosition + frameLength > this.buffer.length) {
        // Frame extends beyond current buffer, need more data
        // Don't advance position, wait for more data
        return null;
      }

      const frameInfo: FrameInfo = {
        position: this.currentPosition,
        headerBytes,
        length: frameLength,
        buffer: this.buffer,
      };

      // Optimization: Jump directly to next expected frame position
      // This skips byte-by-byte scanning between frames for well-formed MP3s
      // If the next frame is aligned, it will be found immediately on the next call
      // If not aligned, the algorithm will fall back to byte-by-byte scanning
      this.currentPosition += frameLength;

      return frameInfo;
    }

    return null;
  }

  /**
   * Checks if there are more frames available
   * @returns true if more frames might be available
   */
  hasNext(): boolean {
    if (this.streamError) {
      return false;
    }

    if (this.isEnded) {
      // Stream ended, check if we have enough buffer for a frame
      return (
        this.currentPosition <
        this.buffer.length - this.parser.getMinFrameSize()
      );
    }

    // Stream not ended, might have more data
    return true;
  }

  /**
   * Gets the next frame from the iterator
   * @returns Promise that resolves to FrameInfo if a frame is found, null if no more frames
   */
  async next(): Promise<FrameInfo | null> {
    if (this.streamError) {
      throw this.streamError;
    }

    // If we already have a frame ready, return it immediately
    const immediateFrame = this.findNextFrame();
    if (immediateFrame) {
      return immediateFrame;
    }

    // If stream ended, check one more time and return null if no frames
    if (this.isEnded) {
      return null;
    }

    // Wait for more data or stream end
    return new Promise<FrameInfo | null>((resolve, reject) => {
      // Check again in case stream ended between the check above and creating the promise
      if (this.isEnded) {
        resolve(null);
        return;
      }

      // If there's already a pending promise, that's an error
      if (this.pendingResolve) {
        reject(new Error("Multiple concurrent calls to next() are not supported"));
        return;
      }

      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Try processing again in case data arrived between checks
      this.processBuffer();
    });
  }

}
