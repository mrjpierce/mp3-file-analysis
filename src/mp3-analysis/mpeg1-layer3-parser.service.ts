import { Injectable, BadRequestException } from "@nestjs/common";
import { IMp3Parser } from "./mp3-parser.interface";
import {
  MPEG1_LAYER3_CONSTANTS,
  MPEG1_LAYER3_BITRATES,
  MPEG1_SAMPLE_RATES,
} from "./mp3-frame-constants";

/**
 * Parser for MPEG Version 1 Audio Layer 3 files
 * Frame sync: 0xFF 0xFB or 0xFF 0xFA (11 bits set to 1)
 */
@Injectable()
export class Mpeg1Layer3ParserService implements IMp3Parser {
  /**
   * Validates that a buffer contains MPEG Version 1 Audio Layer 3 frames
   * @param buffer - The MP3 file buffer
   * @returns true if the file is valid MPEG-1 Layer 3
   */
  validate(buffer: Buffer): boolean {
    if (!buffer || buffer.length === 0) {
      return false;
    }

    let position = this.skipId3v2Tag(buffer);

    while (position < buffer.length - MPEG1_LAYER3_CONSTANTS.MIN_FRAME_SIZE) {
      if (
        buffer[position] === MPEG1_LAYER3_CONSTANTS.SYNC_BYTE &&
        (buffer[position + 1] & MPEG1_LAYER3_CONSTANTS.SYNC_MASK) ===
          MPEG1_LAYER3_CONSTANTS.SYNC_MASK
      ) {
        if (this.isMpeg1Layer3Frame(buffer, position)) {
          return true;
        }
      }
      position++;
    }

    return false;
  }

  /**
   * Counts MPEG Version 1 Audio Layer 3 frames in a buffer
   * @param buffer - The MP3 file buffer
   * @returns The number of frames found
   * @throws BadRequestException if the file is not valid MPEG-1 Layer 3
   */
  async countFrames(buffer: Buffer): Promise<number> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("Invalid MP3 file: empty buffer");
    }

    let position = this.skipId3v2Tag(buffer);

    let frameCount = 0;

    while (position < buffer.length - MPEG1_LAYER3_CONSTANTS.MIN_FRAME_SIZE) {
      if (
        buffer[position] === MPEG1_LAYER3_CONSTANTS.SYNC_BYTE &&
        (buffer[position + 1] & MPEG1_LAYER3_CONSTANTS.SYNC_MASK) ===
          MPEG1_LAYER3_CONSTANTS.SYNC_MASK
      ) {
        if (this.isMpeg1Layer3Frame(buffer, position)) {
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
          }
        }
      }
      position++;
    }

    if (frameCount === 0) {
      throw new BadRequestException(
        "Invalid MP3 file: no valid MPEG-1 Layer 3 frames found",
      );
    }

    return frameCount;
  }

  /**
   * Validates that a frame is exactly MPEG Version 1 Audio Layer 3
   * Rejects MPEG-2, MPEG-2.5, and other layers
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a valid MPEG-1 Layer 3 frame
   */
  private isMpeg1Layer3Frame(buffer: Buffer, position: number): boolean {
    if (position + MPEG1_LAYER3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length) {
      return false;
    }

    const version = (buffer[position + 1] >> 3) & 0x03;
    const layer = (buffer[position + 1] >> 1) & 0x03;

    if (version !== MPEG1_LAYER3_CONSTANTS.MPEG1_VERSION) {
      return false;
    }

    if (layer !== MPEG1_LAYER3_CONSTANTS.LAYER3) {
      return false;
    }

    try {
      const header = buffer.readUInt32BE(position);

      const bitrateIndex = (header >> 12) & 0x0f;
      const sampleRateIndex = (header >> 10) & 0x03;
      const emphasis = buffer[position + 3] & 0x03;

      if (bitrateIndex === 0 || bitrateIndex === 15) {
        return false;
      }

      if (sampleRateIndex === 3) {
        return false;
      }

      if (emphasis === 2) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parses MP3 frame header and returns frame length
   * @param buffer - The buffer containing the frame
   * @param position - Position of the frame sync pattern
   * @returns Frame length in bytes
   */
  private parseFrameHeader(buffer: Buffer, position: number): number {
    if (
      position + MPEG1_LAYER3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length
    ) {
      throw new Error("Insufficient data for frame header");
    }

    const header = buffer.readUInt32BE(position);

    const bitrateIndex = (header >> 12) & 0x0f;
    const sampleRateIndex = (header >> 10) & 0x03;
    const padding = (header >> 9) & 0x01;

    const bitrate = MPEG1_LAYER3_BITRATES[bitrateIndex];
    const sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];

    if (bitrate === 0 || sampleRate === 0) {
      throw new Error("Invalid bitrate or sample rate");
    }

    const frameLength =
      Math.floor(
        (MPEG1_LAYER3_CONSTANTS.FRAME_LENGTH_MULTIPLIER * bitrate * 1000) /
          sampleRate,
      ) + padding;

    return frameLength;
  }

  /**
   * Skips ID3v2 tags at the beginning of the file
   * @param buffer - The MP3 file buffer
   * @returns The position after ID3v2 tags (or 0 if no ID3v2 tag found)
   */
  private skipId3v2Tag(buffer: Buffer): number {
    if (buffer.length < MPEG1_LAYER3_CONSTANTS.ID3V2_HEADER_SIZE) {
      return 0;
    }

    if (
      buffer[0] === MPEG1_LAYER3_CONSTANTS.ID3V2_MAGIC[0] &&
      buffer[1] === MPEG1_LAYER3_CONSTANTS.ID3V2_MAGIC[1] &&
      buffer[2] === MPEG1_LAYER3_CONSTANTS.ID3V2_MAGIC[2]
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

      const totalSize = MPEG1_LAYER3_CONSTANTS.ID3V2_HEADER_SIZE + tagSize;

      if (totalSize <= buffer.length) {
        return totalSize;
      }
    }

    return 0;
  }

  /**
   * Checks if a frame is a Xing/LAME/VBRI header frame (metadata, not audio)
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a header frame that should be skipped
   */
  private isHeaderFrame(buffer: Buffer, position: number): boolean {
    if (position + 40 > buffer.length) {
      return false;
    }

    const channelMode = (buffer[position + 3] >> 6) & 0x03;
    const sideInfoLength =
      channelMode === MPEG1_LAYER3_CONSTANTS.CHANNEL_MODE_MONO
        ? MPEG1_LAYER3_CONSTANTS.SIDE_INFO_MONO
        : MPEG1_LAYER3_CONSTANTS.SIDE_INFO_STEREO;

    const headerStart =
      position + MPEG1_LAYER3_CONSTANTS.FRAME_HEADER_SIZE + sideInfoLength;

    if (
      headerStart + MPEG1_LAYER3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length
    ) {
      return false;
    }

    if (
      (buffer[headerStart] === MPEG1_LAYER3_CONSTANTS.XING_MAGIC[0] &&
        buffer[headerStart + 1] === MPEG1_LAYER3_CONSTANTS.XING_MAGIC[1] &&
        buffer[headerStart + 2] === MPEG1_LAYER3_CONSTANTS.XING_MAGIC[2] &&
        buffer[headerStart + 3] === MPEG1_LAYER3_CONSTANTS.XING_MAGIC[3]) ||
      (buffer[headerStart] === MPEG1_LAYER3_CONSTANTS.INFO_MAGIC[0] &&
        buffer[headerStart + 1] === MPEG1_LAYER3_CONSTANTS.INFO_MAGIC[1] &&
        buffer[headerStart + 2] === MPEG1_LAYER3_CONSTANTS.INFO_MAGIC[2] &&
        buffer[headerStart + 3] === MPEG1_LAYER3_CONSTANTS.INFO_MAGIC[3])
    ) {
      return true;
    }

    if (
      buffer[headerStart] === MPEG1_LAYER3_CONSTANTS.VBRI_MAGIC[0] &&
      buffer[headerStart + 1] === MPEG1_LAYER3_CONSTANTS.VBRI_MAGIC[1] &&
      buffer[headerStart + 2] === MPEG1_LAYER3_CONSTANTS.VBRI_MAGIC[2] &&
      buffer[headerStart + 3] === MPEG1_LAYER3_CONSTANTS.VBRI_MAGIC[3]
    ) {
      return true;
    }

    return false;
  }
}
