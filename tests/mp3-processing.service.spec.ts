import { Test, TestingModule } from "@nestjs/testing";
import { Readable } from "stream";
import { Mp3ProcessingService } from "../src/file-upload/mp3-processing.service";
import { FileStorageService } from "../src/file-storage/file-storage.service";
import { StreamTee } from "../src/file-storage/stream-tee";
import { Mp3TypeDetector } from "../src/mp3-analysis/mp3-type-detector";
import { ParserRegistryService } from "../src/file-upload/parser-registry.service";
import {
  Mp3AnalysisError,
  Mp3AnalysisErrorCode,
} from "../src/mp3-analysis/errors";
import { UnsupportedFormatError } from "../src/file-upload/errors";
import { ProcessingResult } from "../src/file-upload/types";
import { Mp3Version, Mp3Layer, Mp3TypeInfo } from "../src/mp3-analysis/types";
import { IMp3Parser } from "../src/mp3-analysis/types";

describe("Mp3ProcessingService", () => {
  let service: Mp3ProcessingService;
  let fileStorageService: jest.Mocked<FileStorageService>;
  let parserRegistry: jest.Mocked<ParserRegistryService>;
  let mockParser: jest.Mocked<IMp3Parser>;

  beforeEach(async () => {
    // Create mock parser
    mockParser = {
      validate: jest.fn().mockResolvedValue(undefined),
      countFrames: jest.fn().mockResolvedValue(42),
      getMinFrameSize: jest.fn().mockReturnValue(4),
      isFrameSync: jest.fn(),
      isFormatSpecificFrame: jest.fn(),
      calculateFrameLength: jest.fn(),
    };

    // Create mock parser registry
    parserRegistry = {
      getParser: jest.fn<IMp3Parser | null, [Mp3TypeInfo]>().mockReturnValue(mockParser),
      registerParser: jest.fn<void, [Mp3Version, Mp3Layer, IMp3Parser]>(),
    } as unknown as jest.Mocked<ParserRegistryService>;

    // Create mock file storage service
    const mockStream = Readable.from(Buffer.from("test mp3 data"));
    const mockStreamTee = new StreamTee(mockStream);
    fileStorageService = {
      getStreamTee: jest.fn<Promise<StreamTee>, [string]>().mockResolvedValue(mockStreamTee),
    } as unknown as jest.Mocked<FileStorageService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Mp3ProcessingService,
        {
          provide: FileStorageService,
          useValue: fileStorageService,
        },
        {
          provide: ParserRegistryService,
          useValue: parserRegistry,
        },
      ],
    }).compile();

    service = module.get<Mp3ProcessingService>(Mp3ProcessingService);
  });

  describe("processFile", () => {
    it("should process file successfully and return frame count", async () => {
      const key = "test-key";
      const typeInfo: Mp3TypeInfo = {
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      };

      // Mock type detection
      jest
        .spyOn(Mp3TypeDetector, "detectTypeFromStream")
        .mockResolvedValue(typeInfo);

      const result: ProcessingResult = await service.processFile(key);

      expect(result).toEqual({ frameCount: 42 });
      expect(result).toHaveProperty("frameCount");
      expect(fileStorageService.getStreamTee).toHaveBeenCalledWith(key);
      expect(Mp3TypeDetector.detectTypeFromStream).toHaveBeenCalled();
      expect(parserRegistry.getParser).toHaveBeenCalledWith(typeInfo);
      expect(mockParser.validate).toHaveBeenCalled();
      expect(mockParser.countFrames).toHaveBeenCalled();
    });

    it("should throw UnsupportedFormatError when no parser is found", async () => {
      const key = "test-key";
      const typeInfo: Mp3TypeInfo = {
        version: Mp3Version.MPEG2,
        layer: Mp3Layer.Layer2,
        description: "MPEG-2 Layer 2",
      };

      parserRegistry.getParser.mockReturnValue(null);

      jest
        .spyOn(Mp3TypeDetector, "detectTypeFromStream")
        .mockResolvedValue(typeInfo);

      await expect(service.processFile(key)).rejects.toThrow(
        UnsupportedFormatError,
      );

      const error = await service.processFile(key).catch((e) => e);
      expect(error).toBeInstanceOf(UnsupportedFormatError);
      expect(error.typeInfo).toEqual(typeInfo);
      expect(error.message).toContain(typeInfo.description);
    });

    it("should re-throw Mp3AnalysisError as-is", async () => {
      const key = "test-key";
      const typeInfo: Mp3TypeInfo = {
        version: Mp3Version.MPEG1,
        layer: Mp3Layer.Layer3,
        description: "MPEG-1 Layer 3",
      };

      jest
        .spyOn(Mp3TypeDetector, "detectTypeFromStream")
        .mockResolvedValue(typeInfo);

      const mp3Error = new Mp3AnalysisError(
        Mp3AnalysisErrorCode.INVALID_FORMAT,
        "Invalid MP3 format",
      );
      mockParser.validate.mockRejectedValue(mp3Error);

      await expect(service.processFile(key)).rejects.toThrow(Mp3AnalysisError);

      const error = await service.processFile(key).catch((e) => e);
      expect(error).toBeInstanceOf(Mp3AnalysisError);
      expect(error).toBe(mp3Error);
      expect(error.message).toBe("Invalid MP3 format");
    });
  });
});

