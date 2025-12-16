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
  isAWSNotFoundError,
  isNoSuchKeyError,
  isObjectEmptyError,
  isReadError,
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
   * Uploads a file stream to storage.
   * The file is streamed directly from the request to S3.
   *
   * @param requestStream The readable stream from the HTTP request
   * @param contentType The content type of the file (e.g., 'audio/mpeg')
   * @returns The S3 key where the file was uploaded
   * @throws FileStorageError if the upload fails
   */
  async uploadStream(
    requestStream: Readable,
    contentType?: string,
  ): Promise<string> {
    const key = this.s3Service.generateKey(MP3_UPLOADS_PREFIX);

    try {
      await this.s3Service.uploadStream(key, requestStream, contentType);
      this.logger.debug(`File streamed to storage with key: ${key}`);
      return key;
    } catch (error: unknown) {
      // If it's already a FileStorageError, re-throw it
      if (error instanceof FileStorageError) {
        throw error;
      }

      // Convert S3 service errors to FileStorageError
      throw new UploadError(
        `Failed to upload file to storage: ${error instanceof Error ? error.message : String(error)}`,
        key,
      );
    }
  }

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
    const key = this.s3Service.generateKey(MP3_UPLOADS_PREFIX);

    try {
      await this.s3Service.uploadStream(key, requestStream, contentType);
      this.logger.debug(`File streamed to storage with key: ${key}`);

      const s3Stream = await this.s3Service.getStream(key);

      const streamTee = new StreamTee(s3Stream);

      return {
        key,
        streamTee,
      };
    } catch (error: unknown) {
      // If it's already a FileStorageError, re-throw it
      if (error instanceof FileStorageError) {
        throw error;
      }

      // Convert S3 service errors to FileStorageError using type guards
      if (isNoSuchKeyError(error) || isAWSNotFoundError(error)) {
        throw new ObjectNotFoundError(
          `Storage object not found: ${error instanceof Error ? error.message : String(error)}`,
          key,
        );
      }

      if (isObjectEmptyError(error)) {
        throw new ObjectEmptyError(
          `Storage object is empty: ${error.message}`,
          key,
        );
      }

      if (isReadError(error)) {
        throw new ReadError(
          `Failed to read from storage: ${error.message}`,
          key,
        );
      }

      // Default to upload error for any other error during upload/read
      throw new UploadError(
        `Failed to upload file to storage: ${error instanceof Error ? error.message : String(error)}`,
        key,
      );
    }
  }

  /**
   * Gets a StreamTee from S3 for processing.
   * Retrieves a file from S3 and creates a StreamTee that can be used to get multiple streams
   * for type detection, validation, and counting.
   *
   * @param key The S3 object key
   * @returns A StreamTee that can be used to get multiple streams from the S3 object
   * @throws FileStorageError if the object cannot be retrieved
   */
  async getStreamTee(key: string): Promise<StreamTee> {
    try {
      const s3Stream = await this.s3Service.getStream(key);
      this.logger.debug(`Retrieved stream from S3 with key: ${key}`);
      return new StreamTee(s3Stream);
    } catch (error: unknown) {
      // If it's already a FileStorageError, re-throw it
      if (error instanceof FileStorageError) {
        throw error;
      }

      // Convert S3 service errors to FileStorageError using type guards
      if (isNoSuchKeyError(error) || isAWSNotFoundError(error)) {
        throw new ObjectNotFoundError(
          `Storage object not found: ${error instanceof Error ? error.message : String(error)}`,
          key,
        );
      }

      if (isObjectEmptyError(error)) {
        throw new ObjectEmptyError(
          `Storage object is empty: ${error.message}`,
          key,
        );
      }

      if (isReadError(error)) {
        throw new ReadError(
          `Failed to read from storage: ${error.message}`,
          key,
        );
      }

      // Default to read error for any other error
      throw new ReadError(
        `Failed to get stream from storage: ${error instanceof Error ? error.message : String(error)}`,
        key,
      );
    }
  }
}
