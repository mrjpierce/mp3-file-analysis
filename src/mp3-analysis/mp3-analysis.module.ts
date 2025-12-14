import { Module } from "@nestjs/common";
import { Mpeg1Layer3ParserService } from "./mpeg1-layer3-parser.service";
import { ParserRegistryService } from "./parser-registry.service";

@Module({
  providers: [
    Mpeg1Layer3ParserService,
    {
      provide: "IParserRegistry",
      useFactory: (mpeg1Layer3Parser: Mpeg1Layer3ParserService) => {
        const registry = new ParserRegistryService();
        registry.registerParser("MPEG-1", "Layer 3", mpeg1Layer3Parser);
        return registry;
      },
      inject: [Mpeg1Layer3ParserService],
    },
  ],
  exports: [Mpeg1Layer3ParserService, "IParserRegistry"],
})
export class Mp3ParserModule {}
