import { Module } from "@nestjs/common";
import { S3Service } from "./s3.service";
import { FileStorageService } from "./file-storage.service";

@Module({
  providers: [S3Service, FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}

