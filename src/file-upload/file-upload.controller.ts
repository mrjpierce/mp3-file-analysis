import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Readable } from "stream";
import { UploadResponseDto } from "./dto/upload-response.dto";
import { Inject } from "@nestjs/common";
import { Mp3TypeDetector } from "../mp3-analysis/mp3-type-detector";
import { IParserRegistry } from "../mp3-analysis/parser-registry.interface";
import { Mp3AnalysisError } from "../mp3-analysis/mp3-analysis.errors";
import { FileUploadErrorCode } from "./file-upload-errors";

// Maximum file size: 1GB (1,073,741,824 bytes)
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

@Controller("file-upload")
export class FileUploadController {
  private readonly logger = new Logger(FileUploadController.name);

  constructor(
    @Inject("IParserRegistry")
    private readonly parserRegistry: IParserRegistry,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException({
        error: "File is required",
        code: FileUploadErrorCode.FILE_REQUIRED,
      });
    }

    // Validate file size (reject files > 1GB)
    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException({
        error: "File too large",
        code: FileUploadErrorCode.FILE_TOO_LARGE,
      });
    }

    // Detect the MP3 file type
    const typeInfo = Mp3TypeDetector.detectType(file.buffer);

    // Get the appropriate parser for this file type
    const parser = this.parserRegistry.getParser(typeInfo);

    if (!parser) {
      throw new BadRequestException({
        error: `Unsupported MP3 file type: ${typeInfo.description}. No parser available for this format.`,
        code: FileUploadErrorCode.UNSUPPORTED_FORMAT,
      });
    }

    try {
      // Create stream from buffer for processing
      const processingStream = Readable.from(file.buffer);

      // Validate file integrity and detect corruption using stream
      await parser.validateStream(processingStream);

      // Create stream for frame counting
      const countingStream = Readable.from(file.buffer);

      // Count frames using stream-based method
      const frameCount = await parser.countFramesStream(countingStream);


      return { frameCount };
    } catch (error) {
      // Convert mp3-analysis module errors to NestJS exceptions
      if (error instanceof Mp3AnalysisError) {
        // Log the original error for debugging before hiding details from client
        this.logger.error(
          `MP3 analysis error: ${error.message}`,
          error.stack,
          FileUploadController.name,
        );
        throw new BadRequestException({
          error: error.message,
          code: FileUploadErrorCode.INVALID_FORMAT,
        });
      }
      // Re-throw other errors
      throw error;
    }
  }
}
