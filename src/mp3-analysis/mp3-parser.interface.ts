/**
 * Generic interface for MP3 parser implementations
 */
export interface IMp3Parser {
  /**
   * Counts MP3 frames in a buffer
   * @param buffer - The MP3 file buffer
   * @returns The number of frames found
   * @throws BadRequestException if the file is not valid for this parser's format
   */
  countFrames(buffer: Buffer): Promise<number>;
}
