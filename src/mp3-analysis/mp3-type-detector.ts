import { COMMON_MP3_CONSTANTS } from "./mp3-frame.consts";
import { Mp3Parser } from "./mp3-parser";

/**
 * MP3 file type detection result
 */
export interface Mp3TypeInfo {
  version: "MPEG-1" | "MPEG-2" | "MPEG-2.5" | "Unknown";
  layer: "Layer 1" | "Layer 2" | "Layer 3" | "Unknown";
  description: string;
}

/**
 * Detects the type of MP3 file from frame headers
 */
export class Mp3TypeDetector {
  /**
   * Detects the MP3 file type from the first valid frame
   * @param buffer - The MP3 file buffer
   * @returns Information about the detected MP3 type
   */
  static detectType(buffer: Buffer): Mp3TypeInfo {
    if (!buffer || buffer.length < 4) {
      return {
        version: "Unknown",
        layer: "Unknown",
        description: "Invalid file: insufficient data",
      };
    }

    // Find position after ID3v2 tags
    let position = Mp3Parser.findId3v2TagEnd(buffer);

    // Search for first frame sync
    while (position < buffer.length - COMMON_MP3_CONSTANTS.FRAME_HEADER_SIZE) {
      if (
        buffer[position] === COMMON_MP3_CONSTANTS.SYNC_BYTE &&
        (buffer[position + 1] & COMMON_MP3_CONSTANTS.SYNC_MASK) ===
          COMMON_MP3_CONSTANTS.SYNC_MASK
      ) {
        const version = (buffer[position + 1] >> 3) & 0x03;
        const layer = (buffer[position + 1] >> 1) & 0x03;

        const versionName = this.getVersionName(version);
        const layerName = this.getLayerName(layer);

        return {
          version: versionName,
          layer: layerName,
          description: `${versionName} ${layerName}`,
        };
      }
      position++;
    }

    return {
      version: "Unknown",
      layer: "Unknown",
      description: "No valid MP3 frame found",
    };
  }

  private static getVersionName(version: number): "MPEG-1" | "MPEG-2" | "MPEG-2.5" | "Unknown" {
    switch (version) {
      case 0x00:
        return "MPEG-2.5";
      case 0x01:
        return "Unknown";
      case 0x02:
        return "MPEG-2";
      case 0x03:
        return "MPEG-1";
      default:
        return "Unknown";
    }
  }

  private static getLayerName(layer: number): "Layer 1" | "Layer 2" | "Layer 3" | "Unknown" {
    switch (layer) {
      case 0x00:
        return "Unknown";
      case 0x01:
        return "Layer 3";
      case 0x02:
        return "Layer 2";
      case 0x03:
        return "Layer 1";
      default:
        return "Unknown";
    }
  }
}
