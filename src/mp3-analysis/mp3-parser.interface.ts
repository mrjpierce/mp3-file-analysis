import { Readable } from "stream";

/**
 * Generic interface for MP3 parser implementations
 */
export interface IMp3Parser {
  /**
   * Validates file integrity and detects corruption from a stream
   * @param stream - The MP3 file stream
   * @throws Mp3AnalysisError if the file is corrupted or invalid
   */
  validate(stream: Readable): Promise<void>;

  /**
   * Counts MP3 frames in a stream
   * @param stream - The MP3 file stream
   * @returns The number of frames found
   * @throws Mp3AnalysisError if the file is not valid for this parser's format
   */
  countFrames(stream: Readable): Promise<number>;
}
