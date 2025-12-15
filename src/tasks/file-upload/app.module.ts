import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FileUploadModule } from "../../file-upload/file-upload.module";
import { S3Module } from "../../s3/s3.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    FileUploadModule,
    S3Module,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
