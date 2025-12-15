/**
 * Error codes specific to file upload API operations
 * These are domain-specific error codes beyond standard HTTP status codes
 */
export enum FileUploadErrorCode {
  FILE_REQUIRED = "FILE_REQUIRED",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  INVALID_FORMAT = "INVALID_FORMAT",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
}
