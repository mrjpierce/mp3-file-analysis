import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    const endpoint = process.env.AWS_ENDPOINT || undefined;
    const region = process.env.AWS_REGION || "us-east-1";
    this.bucketName = process.env.S3_BUCKET_NAME || "mp3-uploads-local";

    const clientConfig: any = {
      region,
      forcePathStyle: true, // Required for LocalStack
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      this.logger.log(`Using LocalStack endpoint: ${endpoint}`);
    }

    this.s3Client = new S3Client(clientConfig);
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  /**
   * Ensures the S3 bucket exists, creates it if it doesn't
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
      this.logger.log(`S3 bucket '${this.bucketName}' already exists`);
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        try {
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: this.bucketName }),
          );
          this.logger.log(`Created S3 bucket '${this.bucketName}'`);
        } catch (createError) {
          this.logger.error(
            `Failed to create S3 bucket '${this.bucketName}':`,
            createError,
          );
          throw createError;
        }
      } else {
        this.logger.error(
          `Error checking S3 bucket '${this.bucketName}':`,
          error,
        );
        throw error;
      }
    }
  }

  /**
   * Upload a stream to S3
   * @param key S3 object key
   * @param stream Readable stream to upload
   * @param contentType Optional content type
   * @returns Promise that resolves when upload is complete
   */
  async uploadStream(
    key: string,
    stream: Readable,
    contentType?: string,
  ): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.debug(`Uploaded object '${key}' to S3`);
    } catch (error) {
      this.logger.error(`Failed to upload object '${key}' to S3:`, error);
      throw error;
    }
  }

  /**
   * Get a readable stream from S3
   * @param key S3 object key
   * @returns Readable stream
   */
  async getStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new Error(`Object '${key}' not found or empty`);
      }

      // Convert the response body to a Readable stream
      const stream = response.Body as Readable;
      this.logger.debug(`Retrieved object '${key}' from S3`);
      return stream;
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        throw new Error(`Object '${key}' not found`);
      }
      this.logger.error(`Failed to get object '${key}' from S3:`, error);
      throw error;
    }
  }

  /**
   * Delete an object from S3
   * @param key S3 object key
   */
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.debug(`Deleted object '${key}' from S3`);
    } catch (error) {
      this.logger.error(`Failed to delete object '${key}' from S3:`, error);
      throw error;
    }
  }

  /**
   * Check if an object exists in S3
   * @param key S3 object key
   * @returns true if object exists, false otherwise
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate a unique key for a file upload
   * @param prefix Optional prefix for the key
   * @returns Unique key string
   */
  generateKey(prefix = "uploads"): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}/${timestamp}-${random}`;
  }
}

