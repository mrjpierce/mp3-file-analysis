import { Test, TestingModule } from "@nestjs/testing";
import Busboy from "busboy";
import { BusboyFactory } from "../src/file-upload/busboy-factory.service";
import { IncomingHttpHeaders } from "http";

// Mock busboy module
jest.mock("busboy");

type MockBusboyInstance = Pick<Busboy.Busboy, "on" | "pipe">;

describe("BusboyFactory", () => {
  let service: BusboyFactory;
  let mockBusboyInstance: MockBusboyInstance;

  beforeEach(async () => {
    // Create a mock busboy instance
    mockBusboyInstance = {
      on: jest.fn(),
      pipe: jest.fn(),
    };

    // Mock the Busboy constructor
    (Busboy as jest.Mock).mockImplementation(() => mockBusboyInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [BusboyFactory],
    }).compile();

    service = module.get<BusboyFactory>(BusboyFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create and return Busboy instance with provided headers", () => {
      const headers: IncomingHttpHeaders = {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
      };

      const result = service.create(headers);

      expect(Busboy).toHaveBeenCalledWith({ headers });
      expect(result).toBe(mockBusboyInstance);
    });

    it("should create Busboy instance with empty headers", () => {
      const headers: IncomingHttpHeaders = {};

      const result = service.create(headers);

      expect(Busboy).toHaveBeenCalledWith({ headers });
      expect(result).toBe(mockBusboyInstance);
    });

    it("should create Busboy instance with multiple headers", () => {
      const headers: IncomingHttpHeaders = {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": "12345",
        "user-agent": "test-agent",
      };

      const result = service.create(headers);

      expect(Busboy).toHaveBeenCalledWith({ headers });
      expect(result).toBe(mockBusboyInstance);
    });
  });
});

