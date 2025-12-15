import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FileUploadModule } from "../../file-upload/file-upload.module";
import { FileStorageModule } from "../../file-storage/file-storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    FileUploadModule,
    FileStorageModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
