import { IFrameIterator } from "./frame-iterator.interface";

/**
 * Generic interface for MP3 parser implementations
 */
export interface IMp3Parser {
  /**
   * Validates file integrity and detects corruption from a frame iterator
   * @param iterator - The frame iterator
   * @throws Mp3AnalysisError if the file is corrupted or invalid
   */
  validate(iterator: IFrameIterator): Promise<void>;

  /**
   * Counts MP3 frames from a frame iterator
   * @param iterator - The frame iterator
   * @returns The number of frames found
   * @throws Mp3AnalysisError if the file is not valid for this parser's format
   */
  countFrames(iterator: IFrameIterator): Promise<number>;

  /**
   * Returns the minimum frame size for this format
   * Used for bounds checking during frame detection
   * @returns Minimum frame size in bytes
   */
  getMinFrameSize(): number;

  /**
   * Checks if a position contains a frame sync pattern
   * Common to all MP3 formats: 0xFF followed by byte with top 3 bits set (0xE0)
   * @param buffer - The MP3 file buffer
   * @param position - Position to check
   * @returns true if sync pattern is found
   */
  isFrameSync(buffer: Buffer, position: number): boolean;

  /**
   * Validates that a frame matches this parser's specific format
   * @param buffer - The MP3 file buffer
   * @param position - Position of the frame sync pattern
   * @returns true if this is a valid frame for this parser's format
   */
  isFormatSpecificFrame(buffer: Buffer, position: number): boolean;

  /**
   * Calculates frame length from header bytes (lightweight, no validation)
   * Used by traversal logic to advance position without throwing exceptions
   * @param headerBytes - 4-byte frame header
   * @returns Frame length in bytes, or 0 if invalid (no exceptions thrown)
   */
  calculateFrameLength(headerBytes: Buffer): number;
}
