/**
 * Information about a detected MP3 frame
 */
export interface FrameInfo {
  /**
   * Position of the frame sync pattern in the stream/buffer
   */
  position: number;

  /**
   * 4-byte frame header
   */
  headerBytes: Buffer;

  /**
   * Calculated frame length in bytes
   */
  length: number;

  /**
   * Buffer containing the frame (for header frame detection and validation)
   */
  buffer: Buffer;
}

