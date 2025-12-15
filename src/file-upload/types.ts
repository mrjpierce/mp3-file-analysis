import { IMp3Parser, Mp3TypeInfo } from "../mp3-analysis/types";

/**
 * Injection token for the parser registry
 */
export const PARSER_REGISTRY_TOKEN = Symbol("IParserRegistry");

/**
 * Interface for parser registry
 * Allows registration and retrieval of parsers by file type
 */
export interface IParserRegistry {
  /**
   * Gets the appropriate parser for the given MP3 type
   * @param typeInfo - The detected MP3 type information
   * @returns The parser for this type, or null if no parser is registered
   */
  getParser(typeInfo: Mp3TypeInfo): IMp3Parser | null;

  /**
   * Registers a parser for a specific MP3 type
   * @param version - MPEG version
   * @param layer - MPEG layer
   * @param parser - The parser implementation
   */
  registerParser(
    version: Mp3TypeInfo["version"],
    layer: Mp3TypeInfo["layer"],
    parser: IMp3Parser,
  ): void;
}
