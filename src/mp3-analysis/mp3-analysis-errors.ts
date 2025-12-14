/**
 * Error codes specific to MP3 analysis operations
 * This module is framework-agnostic and does not depend on NestJS or web server context
 */
export enum Mp3AnalysisErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  EMPTY_BUFFER = "EMPTY_BUFFER",
  FILE_TOO_SMALL = "FILE_TOO_SMALL",
  CORRUPTED_FRAME_HEADER = "CORRUPTED_FRAME_HEADER",
  TRUNCATED_FRAME = "TRUNCATED_FRAME",
  FRAME_ALIGNMENT_ERROR = "FRAME_ALIGNMENT_ERROR",
  CORRUPTED_FRAME = "CORRUPTED_FRAME",
  NO_VALID_FRAMES = "NO_VALID_FRAMES",
}

/**
 * Base error class for MP3 analysis errors
 * Framework-agnostic error that can be caught and converted to framework-specific exceptions
 */
export class Mp3AnalysisError extends Error {
  constructor(
    public readonly code: Mp3AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "Mp3AnalysisError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, Mp3AnalysisError);
    }
  }
}

/**
 * Error thrown when MP3 file format is invalid
 */
export class InvalidFormatError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.INVALID_FORMAT, message);
    this.name = "InvalidFormatError";
  }
}

/**
 * Error thrown when buffer is empty or null
 */
export class EmptyBufferError extends Mp3AnalysisError {
  constructor(message: string = "Invalid MP3 file: empty buffer") {
    super(Mp3AnalysisErrorCode.EMPTY_BUFFER, message);
    this.name = "EmptyBufferError";
  }
}

/**
 * Error thrown when file is too small to contain valid MP3 frames
 */
export class FileTooSmallError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.FILE_TOO_SMALL, message);
    this.name = "FileTooSmallError";
  }
}

/**
 * Error thrown when frame header is corrupted
 */
export class CorruptedFrameHeaderError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.CORRUPTED_FRAME_HEADER, message);
    this.name = "CorruptedFrameHeaderError";
  }
}

/**
 * Error thrown when frame is truncated
 */
export class TruncatedFrameError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.TRUNCATED_FRAME, message);
    this.name = "TruncatedFrameError";
  }
}

/**
 * Error thrown when frame alignment is incorrect
 */
export class FrameAlignmentError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.FRAME_ALIGNMENT_ERROR, message);
    this.name = "FrameAlignmentError";
  }
}

/**
 * Error thrown when a corrupted frame is detected
 */
export class CorruptedFrameError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.CORRUPTED_FRAME, message);
    this.name = "CorruptedFrameError";
  }
}

/**
 * Error thrown when no valid frames are found
 */
export class NoValidFramesError extends Mp3AnalysisError {
  constructor(message: string) {
    super(Mp3AnalysisErrorCode.NO_VALID_FRAMES, message);
    this.name = "NoValidFramesError";
  }
}

/**
 * Error codes for registry/configuration issues
 */
export enum RegistryErrorCode {
  PARSER_ALREADY_REGISTERED = "PARSER_ALREADY_REGISTERED",
}

/**
 * Error thrown when parser registry operations fail
 */
export class RegistryError extends Error {
  constructor(
    public readonly code: RegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegistryError);
    }
  }
}

/**
 * Error thrown when attempting to register a duplicate parser
 */
export class ParserAlreadyRegisteredError extends RegistryError {
  constructor(message: string) {
    super(RegistryErrorCode.PARSER_ALREADY_REGISTERED, message);
    this.name = "ParserAlreadyRegisteredError";
  }
}
