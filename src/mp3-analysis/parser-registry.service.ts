import { Injectable } from "@nestjs/common";
import { IMp3Parser } from "./mp3-parser.interface";
import { IParserRegistry } from "./parser-registry.interface";
import { Mp3TypeInfo } from "./mp3-type-detector";
import { ParserAlreadyRegisteredError } from "./mp3-analysis.errors";

/**
 * Registry service for MP3 parsers
 * Maps file types to parser implementations
 */
@Injectable()
export class ParserRegistryService implements IParserRegistry {
  private readonly parsers = new Map<string, IMp3Parser>();

  /**
   * Gets the appropriate parser for the given MP3 type
   * @param typeInfo - The detected MP3 type information
   * @returns The parser for this type, or null if no parser is registered
   */
  getParser(typeInfo: Mp3TypeInfo): IMp3Parser | null {
    const key = this.getKey(typeInfo.version, typeInfo.layer);
    return this.parsers.get(key) || null;
  }

  /**
   * Registers a parser for a specific MP3 type
   * @param version - MPEG version
   * @param layer - MPEG layer
   * @param parser - The parser implementation
   * @throws ParserAlreadyRegisteredError if a parser is already registered for this version/layer combination
   */
  registerParser(
    version: Mp3TypeInfo["version"],
    layer: Mp3TypeInfo["layer"],
    parser: IMp3Parser,
  ): void {
    const key = this.getKey(version, layer);
    if (this.parsers.has(key)) {
      throw new ParserAlreadyRegisteredError(
        `Parser already registered for ${version} ${layer}. Cannot register duplicate parser.`,
      );
    }
    this.parsers.set(key, parser);
  }

  /**
   * Creates a unique key for a version/layer combination
   */
  private getKey(
    version: Mp3TypeInfo["version"],
    layer: Mp3TypeInfo["layer"],
  ): string {
    return `${version}:${layer}`;
  }
}
