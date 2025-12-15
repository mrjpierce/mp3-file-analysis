import { Injectable, Logger } from "@nestjs/common";
import { Readable } from "stream";
import { S3Service } from "./s3.service";
import {
  FileStorageError,
  UploadError,
  ReadError,
  ObjectNotFoundError,
  ObjectEmptyError,
} from "./errors";

/**
 * High-level service for file storage operations.
 * Encapsulates S3 operations and provides a clean interface for file upload/retrieval.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Streams a file to storage and returns streams for processing.
   * The file is streamed directly from the request to S3, then streamed from S3 for processing.
   *
   * @param requestStream The readable stream from the HTTP request
   * @param contentType The content type of the file (e.g., 'audio/mpeg')
   * @param contentLength The content length from request headers (optional)
   * @returns An object containing the storage key and streams for type detection, validation and counting
   */
  async uploadAndGetStreams(
    requestStream: Readable,
    contentType?: string,
    contentLength?: number,
  ): Promise<{
    key: string;
    typeDetectionStream: Readable;
    validationStream: Readable;
    countingStream: Readable;
  }> {
    // Generate unique storage key using timestamp and unique ID
    const key = this.s3Service.generateKey("mp3-uploads");

    try {
      // Stream request directly to S3
      await this.s3Service.uploadStream(
        key,
        requestStream,
        contentType,
        contentLength,
      );
      this.logger.debug(`File streamed to storage with key: ${key}`);

      // Get streams from storage for processing
      // We need separate streams for type detection, validation, and counting
      const typeDetectionStream = await this.s3Service.getStream(key);
      const validationStream = await this.s3Service.getStream(key);
      const countingStream = await this.s3Service.getStream(key);

      return {
        key,
        typeDetectionStream,
        validationStream,
        countingStream,
      };
    } catch (error: any) {
      // If it's already a FileStorageError, re-throw it
      if (error instanceof FileStorageError) {
        throw error;
      }

      // Convert S3 service errors to FileStorageError
      if (error.message?.includes("not found") || error.name === "NoSuchKey") {
        throw new ObjectNotFoundError(
          `Storage object not found: ${error.message}`,
          key,
        );
      }

      if (error.message?.includes("empty")) {
        throw new ObjectEmptyError(
          `Storage object is empty: ${error.message}`,
          key,
        );
      }

      // Check if it's a read error (from getStream)
      if (error.message?.includes("Failed to get object")) {
        throw new ReadError(
          `Failed to read from storage: ${error.message}`,
          key,
        );
      }

      // Default to upload error for any other error during upload/read
      throw new UploadError(
        `Failed to upload file to storage: ${error.message}`,
        key,
      );
    }
  }
}

