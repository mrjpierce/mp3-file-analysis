import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadResponseDto } from "./dto/upload-response.dto";
import { Inject } from "@nestjs/common";
import { Mp3TypeDetector } from "../mp3-analysis/mp3-type-detector";
import { IParserRegistry } from "../mp3-analysis/parser-registry.interface";

@Controller("file-upload")
export class FileUploadController {
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
      throw new BadRequestException("File is required");
    }

    // Detect the MP3 file type
    const typeInfo = Mp3TypeDetector.detectType(file.buffer);

    // Get the appropriate parser for this file type
    const parser = this.parserRegistry.getParser(typeInfo);

    if (!parser) {
      throw new BadRequestException(
        `Unsupported MP3 file type: ${typeInfo.description}. No parser available for this format.`,
      );
    }

    // Validate the file format
    if (!parser.validate(file.buffer)) {
      throw new BadRequestException(
        `Invalid ${typeInfo.description} file format.`,
      );
    }

    // Count frames using the appropriate parser
    const frameCount = await parser.countFrames(file.buffer);

    return { frameCount };
  }
}
