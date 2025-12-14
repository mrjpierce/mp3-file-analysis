import { Module } from "@nestjs/common";
import { FileUploadController } from "./file-upload.controller";
import { Mp3ParserModule } from "../mp3-analysis/mp3-analysis.module";

@Module({
  imports: [Mp3ParserModule],
  controllers: [FileUploadController],
  providers: [],
})
export class FileUploadModule {}
