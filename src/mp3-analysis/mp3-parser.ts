import { BadRequestException } from "@nestjs/common";
import { IMp3Parser } from "./mp3-parser.interface";
import { COMMON_MP3_CONSTANTS } from "./mp3-frame-constants";

/**
 * Abstract class for MP3 parsers
 * Provides common functionality shared across all MP3 format types
 */
export abstract class Mp3Parser implements IMp3Parser {
  /**
   * Validates file integrity and detects corruption
   * Fast, lightweight validation that checks for common corruption patterns
   * @param buffer - The MP3 file buffer
   * @throws BadRequestException if the file is corrupted or invalid
   */
  validate(buffer: Buffer): void {
    // Reject null or empty buffers to prevent processing invalid data
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("Invalid MP3 file: empty buffer");
    }

    // Ensure file is large enough to contain at least one frame header
    // Prevents index out of bounds errors during frame detection
    if (buffer.length < this.getMinFrameSize()) {
      throw new BadRequestException(
        `Invalid MP3 file: file too small (${buffer.length} bytes)`,
      );
    }

    let position = Mp3Parser.skipId3v2Tag(buffer);
    let validFrameCount = 0;
    const maxFramesToCheck = 10; // Limit validation to first few frames for performance

    // Check frame alignment and detect corruption in initial frames
    // Validates file structure without scanning entire file
    while (
      position < buffer.length - this.getMinFrameSize() &&
      validFrameCount < maxFramesToCheck
    ) {
      if (this.isFrameSync(buffer, position)) {
        if (this.isFormatSpecificFrame(buffer, position)) {
          try {
            const frameLength = this.parseFrameHeader(buffer, position);

            // Detect truncated frames that would cause parsing errors
            if (frameLength <= 0) {
              throw new BadRequestException(
                "Invalid MP3 file: corrupted frame header (invalid frame length)",
              );
            }

            // Detect frames that extend beyond file boundaries
            // Indicates file truncation or corruption
            if (position + frameLength > buffer.length) {
              throw new BadRequestException(
                "Invalid MP3 file: truncated frame detected",
              );
            }

            // Validate frame alignment by checking next expected frame position
            // Detects gaps or overlapping frames that indicate corruption
            const nextPosition = position + frameLength;
            if (
              nextPosition < buffer.length &&
              !this.isHeaderFrame(buffer, position)
            ) {
              // Check if next frame starts at expected position (alignment check)
              // Allows small tolerance for padding but flags major misalignment
              const alignmentTolerance = 4;
              let foundNextFrame = false;
              for (
                let offset = 0;
                offset <= alignmentTolerance && nextPosition + offset < buffer.length;
                offset++
              ) {
                if (this.isFrameSync(buffer, nextPosition + offset)) {
                  foundNextFrame = true;
                  break;
                }
              }

              // If no frame found at expected position, file may be corrupted
              // But only throw if we've validated at least one frame (to avoid false positives)
              if (!foundNextFrame && validFrameCount > 0) {
                throw new BadRequestException(
                  "Invalid MP3 file: frame alignment error detected",
                );
              }
            }

            validFrameCount++;
            position += frameLength;
            continue;
          } catch (error) {
            // Re-throw BadRequestException from validation
            if (error instanceof BadRequestException) {
              throw error;
            }
            // Other errors indicate corrupted frame data
            throw new BadRequestException(
              `Invalid MP3 file: corrupted frame at position ${position}`,
            );
          }
        }
      }
      position++;
    }

    // Ensure at least one valid frame was found
    // Files with no valid frames are likely corrupted or wrong format
    if (validFrameCount === 0) {
      throw new BadRequestException(
        `Invalid MP3 file: no valid ${this.getFormatDescription()} frames found`,
      );
    }
  }

  /**
   * Counts MP3 frames in a buffer
   * @param buffer - The MP3 file buffer
   * @returns The number of frames found
   * @throws BadRequestException if the file is not valid for this parser's format
   */
  async countFrames(buffer: Buffer): Promise<number> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("Invalid MP3 file: empty buffer");
    }

    let position = Mp3Parser.skipId3v2Tag(buffer);
    let frameCount = 0;

    while (position < buffer.length - this.getMinFrameSize()) {
      if (this.isFrameSync(buffer, position)) {
        if (this.isFormatSpecificFrame(buffer, position)) {
          try {
            const frameLength = this.parseFrameHeader(buffer, position);
            if (frameLength > 0 && position + frameLength <= buffer.length) {
              if (!this.isHeaderFrame(buffer, position)) {
                frameCount++;
              }
              position += frameLength;
              continue;
            }
          } catch {
            // Invalid frame, continue searching
          }
        }
      }
      position++;
    }

    if (frameCount === 0) {
      throw new BadRequestException(
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
  protected isFrameSync(buffer: Buffer, position: number): boolean {
    return (
      buffer[position] === COMMON_MP3_CONSTANTS.SYNC_BYTE &&
      (buffer[position + 1] & COMMON_MP3_CONSTANTS.SYNC_MASK) ===
        COMMON_MP3_CONSTANTS.SYNC_MASK
    );
  }

  /**
   * Skips ID3v2 tags at the beginning of the file
   * Common to all MP3 files regardless of format
   * @param buffer - The MP3 file buffer
   * @returns The position after ID3v2 tags (or 0 if no ID3v2 tag found)
   */
  public static skipId3v2Tag(buffer: Buffer): number {
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
  protected isHeaderFrame(buffer: Buffer, position: number): boolean {
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
  protected abstract isFormatSpecificFrame(
    buffer: Buffer,
    position: number,
  ): boolean;

  /**
   * Abstract method: Parses MP3 frame header and returns frame length
   * Must be implemented by subclasses to handle format-specific header parsing
   * @param buffer - The buffer containing the frame
   * @param position - Position of the frame sync pattern
   * @returns Frame length in bytes
   * @throws Error if the frame header is invalid
   */
  protected abstract parseFrameHeader(
    buffer: Buffer,
    position: number,
  ): number;

  /**
   * Abstract method: Returns the minimum frame size for this format
   * Used for bounds checking during frame detection
   * @returns Minimum frame size in bytes
   */
  protected abstract getMinFrameSize(): number;

  /**
   * Abstract method: Returns a human-readable description of this format
   * Used in error messages
   * @returns Format description (e.g., "MPEG-1 Layer 3")
   */
  protected abstract getFormatDescription(): string;
}
