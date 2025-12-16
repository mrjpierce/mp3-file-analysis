import { Test, TestingModule } from "@nestjs/testing";
import { ParserRegistryService } from "../src/file-upload/parser-registry.service";
import { ParserAlreadyRegisteredError } from "../src/mp3-analysis/errors";
import { Mp3Version, Mp3Layer, IMp3Parser, IFrameIterator } from "../src/mp3-analysis/types";

describe("ParserRegistryService", () => {
  let service: ParserRegistryService;
  let mockParser: jest.Mocked<IMp3Parser>;

  beforeEach(async () => {
    mockParser = {
      validate: jest.fn<Promise<void>, [IFrameIterator]>(),
      countFrames: jest.fn<Promise<number>, [IFrameIterator]>(),
      getMinFrameSize: jest.fn<number, []>(),
      isFrameSync: jest.fn<boolean, [Buffer, number]>(),
      isFormatSpecificFrame: jest.fn<boolean, [Buffer, number]>(),
      calculateFrameLength: jest.fn<number, [Buffer]>(),
    } as jest.Mocked<IMp3Parser>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ParserRegistryService],
    }).compile();

    service = module.get<ParserRegistryService>(ParserRegistryService);
  });

  describe("getParser", () => {
    it("should return registered parser for version and layer", () => {
      service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);

      const result = service.getParser({
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      });

      expect(result).toBe(mockParser);
    });

    it("should return null for unregistered version and layer combination", () => {
      const result = service.getParser({
        version: Mp3Version.MPEG2,
        layer: Mp3Layer.Layer2,
        description: "MPEG-2 Layer 2",
      });

      expect(result).toBeNull();
    });

    it("should return null when no parsers are registered", () => {
      const result = service.getParser({
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      });

      expect(result).toBeNull();
    });
  });

  describe("registerParser", () => {
    it("should successfully register parser for version and layer", () => {
      expect(() => {
        service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);
      }).not.toThrow();

      const result = service.getParser({
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      });

      expect(result).toBe(mockParser);
    });

    it("should throw ParserAlreadyRegisteredError when registering duplicate parser", () => {
      service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);

      expect(() => {
        service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);
      }).toThrow(ParserAlreadyRegisteredError);

      try {
        service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);
      } catch (e) {
        expect(e).toBeInstanceOf(ParserAlreadyRegisteredError);
        expect((e as ParserAlreadyRegisteredError).message).toContain("already registered");
        expect((e as ParserAlreadyRegisteredError).message).toContain("MPEG-1");
        expect((e as ParserAlreadyRegisteredError).message).toContain("Layer 3");
      }
    });

    it("should allow registering different parsers for different version/layer combinations", () => {
      const mockParser2: jest.Mocked<IMp3Parser> = {
        validate: jest.fn<Promise<void>, [IFrameIterator]>(),
        countFrames: jest.fn<Promise<number>, [IFrameIterator]>(),
        getMinFrameSize: jest.fn<number, []>(),
        isFrameSync: jest.fn<boolean, [Buffer, number]>(),
        isFormatSpecificFrame: jest.fn<boolean, [Buffer, number]>(),
        calculateFrameLength: jest.fn<number, [Buffer]>(),
      } as jest.Mocked<IMp3Parser>;

      service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);
      service.registerParser(Mp3Version.MPEG2, Mp3Layer.Layer2, mockParser2);

      const parser1 = service.getParser({
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      });

      const parser2 = service.getParser({
        version: Mp3Version.MPEG2,
        layer: Mp3Layer.Layer2,
        description: "MPEG-2 Layer 2",
      });

      expect(parser1).toBe(mockParser);
      expect(parser2).toBe(mockParser2);
    });

    it("should use correct key format (version:layer)", () => {
      service.registerParser(Mp3Version.MPEG1, Mp3Layer.Layer3, mockParser);

      // Verify that the key generation works correctly by checking
      // that different version/layer combinations don't conflict
      const mockParser2: jest.Mocked<IMp3Parser> = {
        validate: jest.fn<Promise<void>, [IFrameIterator]>(),
        countFrames: jest.fn<Promise<number>, [IFrameIterator]>(),
        getMinFrameSize: jest.fn<number, []>(),
        isFrameSync: jest.fn<boolean, [Buffer, number]>(),
        isFormatSpecificFrame: jest.fn<boolean, [Buffer, number]>(),
        calculateFrameLength: jest.fn<number, [Buffer]>(),
      } as jest.Mocked<IMp3Parser>;

      // These should not conflict
      service.registerParser(Mp3Version.MPEG2, Mp3Layer.Layer3, mockParser2);

      const parser1 = service.getParser({
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      });

      const parser2 = service.getParser({
        version: Mp3Version.MPEG2,
        layer: Mp3Layer.Layer3,
        description: "MPEG-2 Layer 3",
      });

      expect(parser1).toBe(mockParser);
      expect(parser2).toBe(mockParser2);
    });
  });
});

