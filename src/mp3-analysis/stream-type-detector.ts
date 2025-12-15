import { Readable } from "stream";
import { Mp3Parser } from "./mp3-parser";
import { COMMON_MP3_CONSTANTS } from "./consts";
import { Mp3Version, Mp3Layer, Mp3TypeInfo } from "./types";

/**
 * Map from MPEG version bit value to Mp3Version enum
 */
const VERSION_MAP: ReadonlyMap<number, Mp3Version> = new Map([
  [0x00, Mp3Version.MPEG25],
  [0x01, Mp3Version.Unknown],
  [0x02, Mp3Version.MPEG2],
  [0x03, Mp3Version.MPEG1],
]);

/**
 * Map from MPEG layer bit value to Mp3Layer enum
 */
const LAYER_MAP: ReadonlyMap<number, Mp3Layer> = new Map([
  [0x00, Mp3Layer.Unknown],
  [0x01, Mp3Layer.Layer3],
  [0x02, Mp3Layer.Layer2],
  [0x03, Mp3Layer.Layer1],
]);

/**
 * Detects MP3 type from a stream by reading the first chunk
 * This allows type detection without loading the entire file into memory
 */
export class Mp3TypeDetector {
  /**
   * Reads enough bytes from a stream to detect MP3 type
   * @param stream - The readable stream
   * @param minBytes - Minimum bytes to read (default: 8192, enough for ID3v2 + frame header)
   * @returns Promise resolving to the detected MP3 type info
   */
  static async detectTypeFromStream(
    stream: Readable,
    minBytes: number = 8192,
  ): Promise<Mp3TypeInfo> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        totalBytes += chunk.length;

        // Once we have enough bytes, try to detect type
        if (totalBytes >= minBytes) {
          cleanup();
          const buffer = Buffer.concat(chunks);
          const typeInfo = this.detectTypeFromBuffer(buffer);
          resolve(typeInfo);
        }
      };

      const onEnd = () => {
        cleanup();
        if (totalBytes === 0) {
          resolve({
            version: Mp3Version.Unknown,
            layer: Mp3Layer.Unknown,
            description: "Invalid file: empty stream",
          });
          return;
        }

        const buffer = Buffer.concat(chunks);
        const typeInfo = this.detectTypeFromBuffer(buffer);
        resolve(typeInfo);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        stream.removeListener("error", onError);
      };

      stream.on("data", onData);
      stream.on("end", onEnd);
      stream.on("error", onError);

      // Resume stream if paused
      if (stream.isPaused()) {
        stream.resume();
      }
    });
  }

  /**
   * Detects MP3 type from a buffer
   * @param buffer The buffer containing MP3 data (at least first 8KB recommended)
   * @returns The detected MP3 type info
   */
  public static detectTypeFromBuffer(buffer: Buffer): Mp3TypeInfo {
    if (!buffer || buffer.length < 4) {
      return {
        version: Mp3Version.Unknown,
        layer: Mp3Layer.Unknown,
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
      version: Mp3Version.Unknown,
      layer: Mp3Layer.Unknown,
      description: "No valid MP3 frame found",
    };
  }

  private static getVersionName(version: number): Mp3Version {
    return VERSION_MAP.get(version) ?? Mp3Version.Unknown;
  }

  private static getLayerName(layer: number): Mp3Layer {
    return LAYER_MAP.get(layer) ?? Mp3Layer.Unknown;
  }
}

