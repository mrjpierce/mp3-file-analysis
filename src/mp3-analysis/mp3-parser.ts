import { IMp3Parser, IFrameIterator } from "./types";
import { COMMON_MP3_CONSTANTS } from "./consts";
import {
  EmptyBufferError,
  NoValidFramesError,
  CorruptedFrameHeaderError,
  TruncatedFrameError,
  FrameAlignmentError,
  CorruptedFrameError,
  Mp3AnalysisError,
} from "./errors";

/**
 * Abstract class for MP3 parsers
 * Provides common functionality shared across all MP3 format types
 */
export abstract class Mp3Parser implements IMp3Parser {
  private readonly formatDescription: string;

  constructor(formatDescription: string) {
    this.formatDescription = formatDescription;
  }

  /**
   * Validates file integrity and detects corruption from a frame iterator
   * Validates first few frames to detect corruption patterns
   * @param iterator - The frame iterator
   * @throws Mp3AnalysisError if the file is corrupted or invalid
   */
  async validate(iterator: IFrameIterator): Promise<void> {
    let validFrameCount = 0;
    let framesChecked = 0;
    const maxFramesToCheck = 10;
    let frameFound = false;

    while (true) {
      const frameInfo = await iterator.next();
      if (frameInfo === null) {
        // No more frames
        break;
      }

      frameFound = true;

      // Limit validation to first few frames for performance
      if (framesChecked >= maxFramesToCheck) {
        break;
      }

      try {
        // Parse frame header with full validation
        const frameLength = this.parseFrameHeader(
          frameInfo.buffer,
          frameInfo.position,
        );

        // Detect truncated frames that would cause parsing errors
        if (frameLength <= 0) {
          throw new CorruptedFrameHeaderError(
            "Invalid MP3 file: corrupted frame header (invalid frame length)",
          );
        }

        // Detect frames that extend beyond buffer boundaries
        if (frameInfo.position + frameLength > frameInfo.buffer.length) {
          throw new TruncatedFrameError(
            "Invalid MP3 file: truncated frame detected",
          );
        }

        // Validate frame alignment by checking next expected frame position
        const nextPosition = frameInfo.position + frameLength;
        if (
          nextPosition < frameInfo.buffer.length &&
          !this.isHeaderFrame(frameInfo.buffer, frameInfo.position)
        ) {
          // Check if next frame starts at expected position (alignment check)
          const alignmentTolerance = 4;
          let foundNextFrame = false;
          for (
            let offset = 0;
            offset <= alignmentTolerance &&
            nextPosition + offset < frameInfo.buffer.length;
            offset++
          ) {
            if (this.isFrameSync(frameInfo.buffer, nextPosition + offset)) {
              foundNextFrame = true;
              break;
            }
          }

          // If no frame found at expected position, file may be corrupted
          if (!foundNextFrame && validFrameCount > 0) {
            throw new FrameAlignmentError(
              "Invalid MP3 file: frame alignment error detected",
            );
          }
        }

        validFrameCount++;
        framesChecked++;
      } catch (error) {
        // Re-throw Mp3AnalysisError instances
        if (error instanceof Mp3AnalysisError) {
          throw error;
        }
        // All other errors indicate corrupted frame data
        throw new CorruptedFrameError(
          `Invalid MP3 file: corrupted frame at position ${frameInfo.position}`,
        );
      }
    }

    // If no frames were found, throw error
    if (!frameFound) {
      throw new EmptyBufferError();
    }

    // Finalize validation - ensure at least one valid frame was found
    if (validFrameCount === 0) {
      throw new NoValidFramesError(
        `Invalid MP3 file: no valid ${this.getFormatDescription()} frames found`,
      );
    }
  }


  /**
   * Counts MP3 frames from a frame iterator
   * Processes frames from the iterator to avoid loading entire file into memory
   * @param iterator - The frame iterator
   * @returns The number of frames found
   * @throws Mp3AnalysisError if the file is not valid for this parser's format
   */
  async countFrames(iterator: IFrameIterator): Promise<number> {
    let frameCount = 0;

    while (true) {
      const frameInfo = await iterator.next();
      if (frameInfo === null) {
        // No more frames
        break;
      }

      // Skip header frames (Xing/LAME/VBRI metadata frames)
      if (!this.isHeaderFrame(frameInfo.buffer, frameInfo.position)) {
        frameCount++;
      }
    }

    if (frameCount === 0) {
      throw new NoValidFramesError(
        `Invalid MP3 file: no valid ${this.getFormatDescription()} frames found`,
      );
    }

    return frameCount;
  }

  /**
   * Checks if a position contains a frame sync pattern
   * Common to all MP3 formats: 0xFF followed by byte with top 3 bits set (0xE0)
   * @param buffer - The MP3 file buffer
   * @param position - Position to check
   * @returns true if sync pattern is found
   */
  public isFrameSync(buffer: Buffer, position: number): boolean {
    return (
      buffer[position] === COMMON_MP3_CONSTANTS.SYNC_BYTE &&
      (buffer[position + 1] & COMMON_MP3_CONSTANTS.SYNC_MASK) ===
        COMMON_MP3_CONSTANTS.SYNC_MASK
    );
  }

  /**
   * Finds the end position of ID3v2 tags at the beginning of the file
   * Common to all MP3 files regardless of format
   * @param buffer - The MP3 file buffer
   * @returns The position after ID3v2 tags (or 0 if no ID3v2 tag found)
   */
  public static findId3v2TagEnd(buffer: Buffer): number {
    if (buffer.length < COMMON_MP3_CONSTANTS.ID3V2_HEADER_SIZE) {
      return 0;
    }

    if (
      buffer[0] === COMMON_MP3_CONSTANTS.ID3V2_MAGIC[0] &&
      buffer[1] === COMMON_MP3_CONSTANTS.ID3V2_MAGIC[1] &&
      buffer[2] === COMMON_MP3_CONSTANTS.ID3V2_MAGIC[2]
    ) {
      const sizeByte6 = buffer[6];
      const sizeByte7 = buffer[7];
      const sizeByte8 = buffer[8];
      const sizeByte9 = buffer[9];

      const tagSize =
        (sizeByte6 << 21) |
        (sizeByte7 << 14) |
        (sizeByte8 << 7) |
        sizeByte9;

      const totalSize =
        COMMON_MP3_CONSTANTS.ID3V2_HEADER_SIZE + tagSize;

      if (totalSize <= buffer.length) {
        return totalSize;
      }
    }

    return 0;
  }

  /**
   * Checks if a frame is a Xing/LAME/VBRI header frame (metadata, not audio)
   * Common to all MP3 formats
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a header frame that should be skipped
   */
  public isHeaderFrame(buffer: Buffer, position: number): boolean {
    if (position + 40 > buffer.length) {
      return false;
    }

    const channelMode = (buffer[position + 3] >> 6) & 0x03;
    const sideInfoLength =
      channelMode === COMMON_MP3_CONSTANTS.CHANNEL_MODE_MONO
        ? COMMON_MP3_CONSTANTS.SIDE_INFO_MONO
        : COMMON_MP3_CONSTANTS.SIDE_INFO_STEREO;

    const headerStart =
      position + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE + sideInfoLength;

    if (
      headerStart + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length
    ) {
      return false;
    }

    // Check for Xing/Info header
    if (
      (buffer[headerStart] === COMMON_MP3_CONSTANTS.XING_MAGIC[0] &&
        buffer[headerStart + 1] === COMMON_MP3_CONSTANTS.XING_MAGIC[1] &&
        buffer[headerStart + 2] === COMMON_MP3_CONSTANTS.XING_MAGIC[2] &&
        buffer[headerStart + 3] === COMMON_MP3_CONSTANTS.XING_MAGIC[3]) ||
      (buffer[headerStart] === COMMON_MP3_CONSTANTS.INFO_MAGIC[0] &&
        buffer[headerStart + 1] === COMMON_MP3_CONSTANTS.INFO_MAGIC[1] &&
        buffer[headerStart + 2] === COMMON_MP3_CONSTANTS.INFO_MAGIC[2] &&
        buffer[headerStart + 3] === COMMON_MP3_CONSTANTS.INFO_MAGIC[3])
    ) {
      return true;
    }

    // Check for VBRI header
    if (
      buffer[headerStart] === COMMON_MP3_CONSTANTS.VBRI_MAGIC[0] &&
      buffer[headerStart + 1] === COMMON_MP3_CONSTANTS.VBRI_MAGIC[1] &&
      buffer[headerStart + 2] === COMMON_MP3_CONSTANTS.VBRI_MAGIC[2] &&
      buffer[headerStart + 3] === COMMON_MP3_CONSTANTS.VBRI_MAGIC[3]
    ) {
      return true;
    }

    return false;
  }

  /**
   * Abstract method: Validates that a frame matches this parser's specific format
   * Must be implemented by subclasses to check format-specific requirements
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a valid frame for this parser's format
   */
  public abstract isFormatSpecificFrame(
    buffer: Buffer,
    position: number,
  ): boolean;

  /**
   * Abstract method: Calculates frame length from header bytes (lightweight, no validation)
   * Used by traversal logic to advance position without throwing exceptions
   * @param headerBytes - 4-byte frame header
   * @returns Frame length in bytes, or 0 if invalid (no exceptions thrown)
   */
  public abstract calculateFrameLength(headerBytes: Buffer): number;

  /**
   * Abstract method: Parses MP3 frame header and returns frame length
   * Must be implemented by subclasses to handle format-specific header parsing
   * @param buffer - The buffer containing the frame
   * @param position - Position of the frame sync pattern
   * @returns Frame length in bytes
   * @throws Mp3AnalysisError if the frame header is invalid
   */
  public abstract parseFrameHeader(
    buffer: Buffer,
    position: number,
  ): number;

  /**
   * Abstract method: Returns the minimum frame size for this format
   * Used for bounds checking during frame detection
   * @returns Minimum frame size in bytes
   */
  public abstract getMinFrameSize(): number;

  /**
   * Returns a human-readable description of this format
   * Used in error messages
   * @returns Format description (e.g., "MPEG-1 Layer 3")
   */
  public getFormatDescription(): string {
    return this.formatDescription;
  }
}
