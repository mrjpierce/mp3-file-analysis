import { Module } from "@nestjs/common";
import { FileUploadController } from "./file-upload.controller";
import { Mp3ParserModule } from "../mp3-analysis/mp3-analysis.module";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { ParserRegistryService } from "./parser-registry.service";
import { Mpeg1Layer3ParserService } from "../mp3-analysis/mpeg1-layer3-parser.service";
import { PARSER_REGISTRY_TOKEN } from "./types";
import { Mp3Version, Mp3Layer } from "../mp3-analysis/types";

@Module({
  imports: [Mp3ParserModule, FileStorageModule],
  controllers: [FileUploadController],
  providers: [
    {
      provide: PARSER_REGISTRY_TOKEN,
      useFactory: (mpeg1Layer3Parser: Mpeg1Layer3ParserService) => {
        const registry = new ParserRegistryService();
        registry.registerParser(
          Mp3Version.MPEG1,
          Mp3Layer.Layer3,
          mpeg1Layer3Parser,
        );
        return registry;
      },
      inject: [Mpeg1Layer3ParserService],
    },
  ],
})
export class FileUploadModule {}
