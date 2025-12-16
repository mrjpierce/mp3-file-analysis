import { Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import Busboy from "busboy";
import { FileStorageError } from "../file-storage/errors";
import { FileStorageService } from "../file-storage/file-storage.service";
import { UploadValidationError } from "./errors";

/**
 * Service responsible for handling file uploads to S3.
 * Handles multipart/form-data parsing and uploads files to S3 storage.
 */
@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(private readonly fileStorageService: FileStorageService) {}

  /**
   * Processes a multipart/form-data file upload request and uploads to S3.
   * Handles Busboy parsing and uploads the file to S3 storage.
   *
   * @param req - Express request object containing multipart/form-data
   * @returns Promise resolving to the S3 key where the file was uploaded
   * @throws UploadValidationError for invalid requests (invalid content type, missing file, etc.)
   * @throws FileStorageError for storage errors
   */
  async processUpload(req: Request): Promise<{ key: string }> {
    return new Promise((resolve, reject) => {
      // Validate content type
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        reject(
          new UploadValidationError(
            "Invalid content type. Expected multipart/form-data",
          ),
        );
        return;
      }

      const busboy = Busboy({ headers: req.headers });
      let uploadPromise: Promise<string> | null = null;
      let fileContentType: string | undefined;
      let fileReceived = false;

      busboy.on("file", (name, stream, info) => {
        const { filename, encoding, mimeType } = info;
        if (name !== "file") {
          stream.resume(); // Drain non-file fields
          return;
        }

        fileReceived = true;
        fileContentType = mimeType;

        this.logger.debug(
          `Received file upload: ${filename}, type: ${mimeType}, encoding: ${encoding}`,
        );

        // Start uploading to S3 immediately while the stream is active
        // Don't wait for the finish event - the stream will be consumed by the upload
        uploadPromise = this.fileStorageService.uploadStream(
          stream,
          fileContentType,
        );
      });

      busboy.on("finish", async () => {
        if (!fileReceived) {
          reject(new UploadValidationError("File is required"));
          return;
        }

        if (!uploadPromise) {
          reject(new UploadValidationError("File stream was not received"));
          return;
        }

        try {
          // Wait for upload to complete and get the S3 key
          const key = await uploadPromise;
          resolve({ key });
        } catch (error) {
          // Re-throw FileStorageError as-is (let controller handle conversion)
          if (error instanceof FileStorageError) {
            this.logger.error(
              `File storage error: ${error.message}`,
              error.stack,
              FileUploadService.name,
            );
            reject(error);
            return;
          }

          reject(error);
        }
      });

      busboy.on("error", (error: Error) => {
        this.logger.error(`Busboy error: ${error.message}`, error.stack);
        reject(
          new UploadValidationError(
            `Failed to parse multipart form data: ${error.message}`,
          ),
        );
      });

      // Pipe the request to busboy for parsing
      req.pipe(busboy);
    });
  }
}

