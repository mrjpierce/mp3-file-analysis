/**
 * Generic interface for MP3 parser implementations
 */
export interface IMp3Parser {
  /**
   * Validates file integrity and detects corruption
   * @param buffer - The MP3 file buffer
   * @throws Mp3AnalysisError if the file is corrupted or invalid
   */
  validate(buffer: Buffer): void;

  /**
   * Counts MP3 frames in a buffer
   * @param buffer - The MP3 file buffer
   * @returns The number of frames found
   * @throws Mp3AnalysisError if the file is not valid for this parser's format
   */
  countFrames(buffer: Buffer): Promise<number>;
}
