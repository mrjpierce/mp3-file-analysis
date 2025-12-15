import { Injectable, Logger } from "@nestjs/common";
import { Readable } from "stream";
import { S3Service } from "./s3.service";
import { StreamTee } from "./stream-tee";
import {
  FileStorageError,
  UploadError,
  ReadError,
  ObjectNotFoundError,
  ObjectEmptyError,
} from "./errors";

/**
 * S3 key prefix for MP3 file uploads
 */
export const MP3_UPLOADS_PREFIX = "mp3-uploads";

/**
 * High-level service for file storage operations.
 * Encapsulates S3 operations and provides a clean interface for file upload/retrieval.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Streams a file to storage and returns a StreamTee for processing.
   * The file is streamed directly from the request to S3, then streamed from S3 for processing.
   * The StreamTee can be used to get multiple streams for type detection, validation, and counting.
   *
   * @param requestStream The readable stream from the HTTP request
   * @param contentType The content type of the file (e.g., 'audio/mpeg')
   * @returns An object containing the storage key and StreamTee for processing
   */
  async uploadAndGetStream(
    requestStream: Readable,
    contentType?: string,
  ): Promise<{
    key: string;
    streamTee: StreamTee;
  }> {
    // Generate unique storage key using timestamp and unique ID
    const key = this.s3Service.generateKey(MP3_UPLOADS_PREFIX);

    try {
      // Stream request directly to S3
      await this.s3Service.uploadStream(key, requestStream, contentType);
      this.logger.debug(`File streamed to storage with key: ${key}`);

      // Get single stream from S3
      const s3Stream = await this.s3Service.getStream(key);

      // Create StreamTee from S3 stream
      // The StreamTee will buffer all data and can provide multiple streams
      const streamTee = new StreamTee(s3Stream);

      return {
        key,
        streamTee,
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
