import {
  Controller,
  Post,
  Req,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { Readable } from "stream";
import Busboy from "busboy";
import { UploadResponseDto } from "./dto/upload-response.dto";
import { Inject } from "@nestjs/common";
import { StreamTypeDetector } from "../mp3-analysis/stream-type-detector";
import {
  IParserRegistry,
  PARSER_REGISTRY_TOKEN,
} from "./parser-registry.interface";
import { Mp3AnalysisError } from "../mp3-analysis/mp3-analysis.errors";
import { FileStorageError } from "../file-storage/file-storage.errors";
import { FileUploadErrorCode } from "./file-upload.errors";
import { StreamFrameIterator } from "../mp3-analysis/stream-frame-iterator";
import { FileStorageService } from "../file-storage/file-storage.service";

@Controller("file-upload")
export class FileUploadController {
  private readonly logger = new Logger(FileUploadController.name);

  constructor(
    @Inject(PARSER_REGISTRY_TOKEN)
    private readonly parserRegistry: IParserRegistry,
    private readonly fileStorageService: FileStorageService,
  ) {}

  @Post()
  async uploadFile(@Req() req: Request): Promise<UploadResponseDto> {
    return new Promise((resolve, reject) => {
      // Check if it's multipart/form-data
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        reject(
          new BadRequestException({
            error: "Invalid content type. Expected multipart/form-data",
            code: FileUploadErrorCode.FILE_REQUIRED,
          }),
        );
        return;
      }

      const busboy = Busboy({ headers: req.headers });
      let uploadPromise: Promise<{
        typeDetectionStream: Readable;
        validationStream: Readable;
        countingStream: Readable;
      }> | null = null;
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
        uploadPromise = this.fileStorageService.uploadAndGetStreams(
          stream,
          fileContentType,
          undefined, // Content length not available for multipart
        );
      });

      busboy.on("finish", async () => {
        if (!fileReceived) {
          reject(
            new BadRequestException({
              error: "File is required",
              code: FileUploadErrorCode.FILE_REQUIRED,
            }),
          );
          return;
        }

        if (!uploadPromise) {
          reject(
            new BadRequestException({
              error: "File stream was not received",
              code: FileUploadErrorCode.FILE_REQUIRED,
            }),
          );
          return;
        }

        try {
          // Wait for upload to complete and get streams from S3
          const { typeDetectionStream, validationStream, countingStream } =
            await uploadPromise;

          // Detect the MP3 file type from a dedicated stream
          const typeInfo = await StreamTypeDetector.detectTypeFromStream(
            typeDetectionStream,
          );

          // Get the appropriate parser for this file type
          const parser = this.parserRegistry.getParser(typeInfo);

          if (!parser) {
            reject(
              new BadRequestException({
                error: `Unsupported MP3 file type: ${typeInfo.description}. No parser available for this format.`,
                code: FileUploadErrorCode.UNSUPPORTED_FORMAT,
              }),
            );
            return;
          }

          // Create iterator for validation
          const validationIterator = new StreamFrameIterator(
            validationStream,
            parser,
          );

          // Validate file integrity and detect corruption using iterator
          await parser.validate(validationIterator);

          // Create iterator for counting
          const countingIterator = new StreamFrameIterator(
            countingStream,
            parser,
          );

          // Count frames using iterator
          const frameCount = await parser.countFrames(countingIterator);

          resolve({ frameCount });
        } catch (error) {
          // Convert mp3-analysis module errors to NestJS exceptions
          if (error instanceof Mp3AnalysisError) {
            this.logger.error(
              `MP3 analysis error: ${error.message}`,
              error.stack,
              FileUploadController.name,
            );
            reject(
              new BadRequestException({
                error: error.message,
                code: FileUploadErrorCode.INVALID_FORMAT,
              }),
            );
            return;
          }

          // Convert file storage errors to NestJS exceptions
          if (error instanceof FileStorageError) {
            this.logger.error(
              `File storage error: ${error.message}`,
              error.stack,
              FileUploadController.name,
            );
            reject(
              new InternalServerErrorException({
                error: error.message,
                code:
                  error.code === "UPLOAD_ERROR"
                    ? FileUploadErrorCode.STORAGE_UPLOAD_ERROR
                    : FileUploadErrorCode.STORAGE_READ_ERROR,
              }),
            );
            return;
          }

          reject(error);
        }
      });

      busboy.on("error", (error: Error) => {
        this.logger.error(`Busboy error: ${error.message}`, error.stack);
        reject(
          new BadRequestException({
            error: `Failed to parse multipart form data: ${error.message}`,
            code: FileUploadErrorCode.FILE_REQUIRED,
          }),
        );
      });

      // Pipe the request to busboy for parsing
      req.pipe(busboy);
    });
  }
}
