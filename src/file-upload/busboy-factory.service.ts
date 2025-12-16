import { Injectable } from "@nestjs/common";
import Busboy from "busboy";
import { IncomingHttpHeaders } from "http";

/**
 * Factory service for creating Busboy instances.
 * Encapsulates Busboy instantiation logic and allows for dependency injection,
 * following the Dependency Inversion Principle.
 */
@Injectable()
export class BusboyFactory {
  /**
   * Creates a new Busboy instance with the provided headers.
   *
   * @param headers - HTTP headers from the request
   * @returns A new Busboy instance configured with the provided headers
   */
  create(headers: IncomingHttpHeaders): Busboy.Busboy {
    return Busboy({ headers });
  }
}

