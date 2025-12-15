import { Module } from "@nestjs/common";
import { Mpeg1Layer3ParserService } from "./mpeg1-layer3-parser.service";

@Module({
  providers: [Mpeg1Layer3ParserService],
  exports: [Mpeg1Layer3ParserService],
})
export class Mp3ParserModule {}
