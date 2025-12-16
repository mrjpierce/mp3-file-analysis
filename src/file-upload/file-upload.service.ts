import { Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { Readable } from "stream";
import { FileStorageError } from "../file-storage/errors";
import { FileStorageService } from "../file-storage/file-storage.service";
import { UploadValidationError } from "./errors";
import { BusboyFactory } from "./busboy-factory.service";

/**
 * Service responsible for handling file uploads to S3.
 * Handles multipart/form-data parsing and uploads files to S3 storage.
 */
@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly busboyFactory: BusboyFactory,
  ) {}

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

      const busboy = this.busboyFactory.create(req.headers);
      let uploadPromise: Promise<string> | null = null;
      let fileReceived = false;

      busboy.on(
        "file",
        this.handleFileEvent.bind(this, {
          setFileReceived: (value: boolean) => {
            fileReceived = value;
          },
          setUploadPromise: (value: Promise<string> | null) => {
            uploadPromise = value;
          },
        }),
      );

      busboy.on(
        "finish",
        this.handleFinishEvent.bind(this, {
          fileReceived: () => fileReceived,
          uploadPromise: () => uploadPromise,
          resolve,
          reject,
        }),
      );

      busboy.on("error", this.handleBusboyError.bind(this, reject));

      // Pipe the request to busboy for parsing
      req.pipe(busboy);
    });
  }

  /**
   * Handles the "file" event from Busboy.
   * @private
   */
  private handleFileEvent(
    state: {
      setFileReceived: (value: boolean) => void;
      setUploadPromise: (value: Promise<string> | null) => void;
    },
    name: string,
    stream: Readable,
    info: { filename: string; encoding: string; mimeType: string },
  ): void {
    const { filename, encoding, mimeType } = info;
    if (name !== "file") {
      stream.resume(); // Drain non-file fields
      return;
    }

    state.setFileReceived(true);

    this.logger.debug(
      `Received file upload: ${filename}, type: ${mimeType}, encoding: ${encoding}`,
    );

    // Start uploading to S3 immediately while the stream is active
    // Don't wait for the finish event - the stream will be consumed by the upload
    const uploadPromise = this.fileStorageService.uploadStream(
      stream,
      mimeType,
    );
    state.setUploadPromise(uploadPromise);
  }

  /**
   * Handles the "finish" event from Busboy.
   * @private
   */
  private async handleFinishEvent(
    state: {
      fileReceived: () => boolean;
      uploadPromise: () => Promise<string> | null;
      resolve: (value: { key: string }) => void;
      reject: (reason?: unknown) => void;
    },
  ): Promise<void> {
    if (!state.fileReceived()) {
      state.reject(new UploadValidationError("File is required"));
      return;
    }

    const uploadPromise = state.uploadPromise();
    if (!uploadPromise) {
      state.reject(new UploadValidationError("File stream was not received"));
      return;
    }

    try {
      // Wait for upload to complete and get the S3 key
      const key = await uploadPromise;
      state.resolve({ key });
    } catch (error) {
      // Re-throw FileStorageError as-is (let controller handle conversion)
      if (error instanceof FileStorageError) {
        this.logger.error(
          `File storage error: ${error.message}`,
          error.stack,
          FileUploadService.name,
        );
        state.reject(error);
        return;
      }

      state.reject(error);
    }
  }

  /**
   * Handles the "error" event from Busboy.
   * @private
   */
  private handleBusboyError(
    reject: (reason?: unknown) => void,
    error: Error,
  ): void {
    this.logger.error(`Busboy error: ${error.message}`, error.stack);
    reject(
      new UploadValidationError(
        `Failed to parse multipart form data: ${error.message}`,
      ),
    );
  }
}
