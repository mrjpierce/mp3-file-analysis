import { Mp3TypeInfo } from "../mp3-analysis/types";

/**
 * Domain error thrown when no parser is available for a detected MP3 format.
 * Framework-agnostic error that can be converted to HTTP exceptions in the API layer.
 */
export class UnsupportedFormatError extends Error {
  constructor(public readonly typeInfo: Mp3TypeInfo) {
    super(
      `Unsupported MP3 file type: ${typeInfo.description}. No parser available for this format.`,
    );
    this.name = "UnsupportedFormatError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsupportedFormatError);
    }
  }
}

/**
 * Domain error thrown when upload validation fails.
 * Framework-agnostic error that can be converted to HTTP exceptions in the API layer.
 */
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UploadValidationError);
    }
  }
}

/**
 * Error codes specific to file upload API operations.
 * These are HTTP/API layer error codes used for HTTP responses.
 * Domain errors (UnsupportedFormatError, UploadValidationError, etc.) are converted
 * to HTTP exceptions with these codes in the controller layer.
 */
export enum FileUploadErrorCode {
  FILE_REQUIRED = "FILE_REQUIRED",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  INVALID_FORMAT = "INVALID_FORMAT",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  STORAGE_UPLOAD_ERROR = "STORAGE_UPLOAD_ERROR",
  STORAGE_READ_ERROR = "STORAGE_READ_ERROR",
}
