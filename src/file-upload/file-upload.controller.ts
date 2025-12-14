import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadResponseDto } from "./dto/upload-response.dto";

@Controller("file-upload")
export class FileUploadController {
  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    // Hardcoded response for Milestone 2
    return { frameCount: 42 };
  }
}
