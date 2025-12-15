import { Injectable } from "@nestjs/common";
import { Mp3Parser } from "./mp3-parser";
import {
  COMMON_MP3_CONSTANTS,
  MPEG1_LAYER3_CONSTANTS,
  MPEG1_LAYER3_BITRATES,
  MPEG1_SAMPLE_RATES,
} from "./consts";
import { CorruptedFrameHeaderError } from "./errors";

/**
 * Parser for MPEG Version 1 Audio Layer 3 files
 * Frame sync: 0xFF 0xFB or 0xFF 0xFA (11 bits set to 1)
 */
@Injectable()
export class Mpeg1Layer3ParserService extends Mp3Parser {
  constructor() {
    super("MPEG-1 Layer 3");
  }

  /**
   * Validates that a frame is exactly MPEG Version 1 Audio Layer 3
   * Rejects MPEG-2, MPEG-2.5, and other layers
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a valid MPEG-1 Layer 3 frame
   */
  public isFormatSpecificFrame(buffer: Buffer, position: number): boolean {
    if (position + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length) {
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
   * Calculates frame length from header bytes (lightweight, no validation)
   * Used by traversal logic to advance position without throwing exceptions
   * @param headerBytes - 4-byte frame header
   * @returns Frame length in bytes, or 0 if invalid (no exceptions thrown)
   */
  public calculateFrameLength(headerBytes: Buffer): number {
    if (headerBytes.length < COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE) {
      return 0;
    }

    const header = headerBytes.readUInt32BE(0);

    const bitrateIndex = (header >> 12) & 0x0f;
    const sampleRateIndex = (header >> 10) & 0x03;
    const padding = (header >> 9) & 0x01;

    const bitrate = MPEG1_LAYER3_BITRATES[bitrateIndex];
    const sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];

    // Return 0 if invalid (no exceptions)
    if (bitrate === 0 || sampleRate === 0) {
      return 0;
    }

    const frameLength =
      Math.floor(
        (MPEG1_LAYER3_CONSTANTS.FRAME_LENGTH_MULTIPLIER * bitrate * 1000) /
          sampleRate,
      ) + padding;

    return frameLength;
  }

  /**
   * Parses MP3 frame header and returns frame length
   * @param buffer - The buffer containing the frame
   * @param position - Position of the frame sync pattern
   * @returns Frame length in bytes
   * @throws Mp3AnalysisError if the frame header is invalid
   */
  public parseFrameHeader(buffer: Buffer, position: number): number {
    if (
      position + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE > buffer.length
    ) {
      throw new CorruptedFrameHeaderError(
        "Insufficient data for frame header",
      );
    }

    const headerBytes = buffer.subarray(
      position,
      position + COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE,
    );
    const frameLength = this.calculateFrameLength(headerBytes);

    if (frameLength === 0) {
      throw new CorruptedFrameHeaderError("Invalid bitrate or sample rate");
    }

    return frameLength;
  }

  /**
   * Returns the minimum frame size for MPEG-1 Layer 3
   * @returns Minimum frame size in bytes
   */
  public getMinFrameSize(): number {
    return MPEG1_LAYER3_CONSTANTS.MIN_FRAME_SIZE;
  }
}
