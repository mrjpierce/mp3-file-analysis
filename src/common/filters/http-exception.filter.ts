import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { ErrorResponseDto } from "../dto/error-response.dto";

/**
 * Global exception filter that formats all errors into a consistent structure
 * Only exceptions with structured ErrorResponseDto responses are returned to clients.
 * Unexpected exceptions are logged and return a generic 500 error.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Check if exception has structured error response
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      // If the exception already has a structured response with code and error, use it
      if (this.isStructuredErrorResponse(exceptionResponse)) {
        const status = exception.getStatus();
        response.status(status).json(exceptionResponse as ErrorResponseDto);
        return;
      }
    }

    // Log unexpected errors and return generic 500
    this.logger.error("Unexpected error format", exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error",
      code: HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR],
    });
  }

  /**
   * Checks if the response is in the expected ErrorResponseDto format
   */
  private isStructuredErrorResponse(
    response: unknown,
  ): response is ErrorResponseDto {
    return (
      typeof response === "object" &&
      response !== null &&
      "code" in response &&
      "error" in response &&
      typeof (response as ErrorResponseDto).code === "string" &&
      typeof (response as ErrorResponseDto).error === "string"
    );
  }
}
