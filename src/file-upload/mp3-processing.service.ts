import { Injectable } from "@nestjs/common";
import { ProcessingResult } from "./types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { Mp3TypeDetector } from "../mp3-analysis/mp3-type-detector";
import { ParserRegistryService } from "./parser-registry.service";
import { Mp3FrameIterator } from "../mp3-analysis/mp3-frame-iterator";
import { UnsupportedFormatError } from "./errors";

/**
 * Service responsible for processing MP3 files.
 * Handles type detection, validation, and frame counting from S3 streams.
 */
@Injectable()
export class Mp3ProcessingService {
  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly parserRegistry: ParserRegistryService,
  ) {}

  /**
   * Processes an MP3 file from S3.
   * Performs type detection, validation, and frame counting.
   *
   * @param key The S3 key of the file to process
   * @returns Promise resolving to processing result with frame count
   * @throws UnsupportedFormatError when no parser is available for the detected format
   * @throws Mp3AnalysisError when file validation or analysis fails
   */
  async processFile(key: string): Promise<ProcessingResult> {
    // Get stream from S3 for processing
    const streamTee = await this.fileStorageService.getStreamTee(key);

    // Type detection from stream tee (reads first 8KB and stops)
    const typeDetectionStream = streamTee.getStream();
    const typeInfo = await Mp3TypeDetector.detectTypeFromStream(
      typeDetectionStream,
    );

    // Get the appropriate parser for this file type
    const parser = this.parserRegistry.getParser(typeInfo);

    if (!parser) {
      throw new UnsupportedFormatError(typeInfo);
    }

    // Get validation stream from tee
    const validationStream = streamTee.getStream();
    const validationIterator = new Mp3FrameIterator(
      validationStream,
      parser,
    );

    // Validate file integrity and detect corruption using iterator
    await parser.validate(validationIterator);

    // Get counting stream from tee
    const countingStream = streamTee.getStream();
    const countingIterator = new Mp3FrameIterator(
      countingStream,
      parser,
    );

    // Count frames using iterator
    const frameCount = await parser.countFrames(countingIterator);

    return { frameCount };
  }
}
