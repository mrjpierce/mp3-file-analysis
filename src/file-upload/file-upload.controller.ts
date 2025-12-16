import {
  Controller,
  Post,
  Req,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { Request } from "express";
import { UploadResponseDto } from "./dto/upload-response.dto";
import { FileUploadService } from "./file-upload.service";
import { Mp3ProcessingService } from "./mp3-processing.service";
import {
  UnsupportedFormatError,
  UploadValidationError,
} from "./errors";
import { Mp3AnalysisError } from "../mp3-analysis/errors";
import { FileStorageError } from "../file-storage/errors";
import { FileUploadErrorCode } from "./errors";

@Controller("file-upload")
export class FileUploadController {
  constructor(
    private readonly fileUploadService: FileUploadService,
    private readonly mp3ProcessingService: Mp3ProcessingService,
  ) {}

  @Post()
  async uploadFile(@Req() req: Request): Promise<UploadResponseDto> {
    try {
      // Upload file to S3 and get the key
      const { key } = await this.fileUploadService.processUpload(req);

      // Process the MP3 file
      const result = await this.mp3ProcessingService.processFile(key);

      // Convert domain result to DTO
      return { frameCount: result.frameCount } as UploadResponseDto;
    } catch (error) {
      // Convert domain errors to HTTP exceptions
      if (error instanceof UnsupportedFormatError) {
        throw new BadRequestException({
          error: error.message,
          code: FileUploadErrorCode.UNSUPPORTED_FORMAT,
        });
      }

      if (error instanceof UploadValidationError) {
        throw new BadRequestException({
          error: error.message,
          code: FileUploadErrorCode.FILE_REQUIRED,
        });
      }

      if (error instanceof Mp3AnalysisError) {
        throw new BadRequestException({
          error: error.message,
          code: FileUploadErrorCode.INVALID_FORMAT,
        });
      }

      if (error instanceof FileStorageError) {
        throw new InternalServerErrorException({
          error: error.message,
          code:
            error.code === "UPLOAD_ERROR"
              ? FileUploadErrorCode.STORAGE_UPLOAD_ERROR
              : FileUploadErrorCode.STORAGE_READ_ERROR,
        });
      }

      // Re-throw unknown errors (will be handled by exception filter)
      throw error;
    }
  }
}
