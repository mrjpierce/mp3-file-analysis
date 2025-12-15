/**
 * Error codes specific to file storage operations
 * This module is framework-agnostic and does not depend on NestJS or web server context
 */
export enum FileStorageErrorCode {
  UPLOAD_ERROR = "UPLOAD_ERROR",
  READ_ERROR = "READ_ERROR",
  OBJECT_NOT_FOUND = "OBJECT_NOT_FOUND",
  OBJECT_EMPTY = "OBJECT_EMPTY",
  STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE",
}

/**
 * Base error class for file storage errors
 * Framework-agnostic error that can be caught and converted to framework-specific exceptions
 */
export class FileStorageError extends Error {
  constructor(
    public readonly code: FileStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileStorageError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileStorageError);
    }
  }
}

/**
 * Error thrown when file upload to storage fails
 */
export class UploadError extends FileStorageError {
  constructor(message: string, public readonly key?: string) {
    super(FileStorageErrorCode.UPLOAD_ERROR, message);
    this.name = "UploadError";
  }
}

/**
 * Error thrown when reading from storage fails
 */
export class ReadError extends FileStorageError {
  constructor(message: string, public readonly key?: string) {
    super(FileStorageErrorCode.READ_ERROR, message);
    this.name = "ReadError";
  }
}

/**
 * Error thrown when a storage object is not found
 */
export class ObjectNotFoundError extends FileStorageError {
  constructor(message: string, public readonly key?: string) {
    super(FileStorageErrorCode.OBJECT_NOT_FOUND, message);
    this.name = "ObjectNotFoundError";
  }
}

/**
 * Error thrown when a storage object is empty
 */
export class ObjectEmptyError extends FileStorageError {
  constructor(message: string, public readonly key?: string) {
    super(FileStorageErrorCode.OBJECT_EMPTY, message);
    this.name = "ObjectEmptyError";
  }
}

/**
 * Error thrown when storage is unavailable or unreachable
 */
export class StorageUnavailableError extends FileStorageError {
  constructor(message: string) {
    super(FileStorageErrorCode.STORAGE_UNAVAILABLE, message);
    this.name = "StorageUnavailableError";
  }
}

/**
 * Type representing AWS SDK error structure
 */
type AwsSdkError = {
  name?: string;
  message?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
};

/**
 * Type guard to check if an error is an AWS SDK "not found" error
 * Checks for NotFound error name or 404 HTTP status code
 */
export function isAWSNotFoundError(error: unknown): error is AwsSdkError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorObj = error as Record<string, unknown>;
  const metadata =
    errorObj.$metadata && typeof errorObj.$metadata === "object"
      ? (errorObj.$metadata as Record<string, unknown>)
      : null;

  return (
    errorObj.name === "NotFound" || metadata?.httpStatusCode === 404
  );
}

/**
 * Type guard to check if an error is a "NoSuchLifecycleConfiguration" AWS SDK error
 */
export function isNoSuchLifecycleConfigurationError(
  error: unknown,
): error is AwsSdkError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorObj = error as Record<string, unknown>;
  return errorObj.name === "NoSuchLifecycleConfiguration";
}

/**
 * Type guard to check if an error is a "NoSuchKey" AWS SDK error
 */
export function isNoSuchKeyError(error: unknown): error is AwsSdkError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorObj = error as Record<string, unknown>;
  return errorObj.name === "NoSuchKey";
}
