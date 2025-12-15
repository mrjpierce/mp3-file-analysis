import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
  S3ClientConfig,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import {
  isAWSNotFoundError,
  isNoSuchLifecycleConfigurationError,
  isNoSuchKeyError,
} from "./errors";

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    const endpoint = process.env.AWS_ENDPOINT || undefined;
    const region = process.env.AWS_REGION || "us-east-1";
    this.bucketName = process.env.S3_BUCKET_NAME || "mp3-uploads-local";

    const clientConfig: S3ClientConfig = {
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
    await this.ensureLifecyclePolicy();
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
    } catch (error: unknown) {
      if (!isAWSNotFoundError(error)) {
        this.logger.error(
          `Error checking S3 bucket '${this.bucketName}':`,
          error,
        );
        throw error;
      }

      // Expected error, bucket doesn't exist, create it
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucketName }),
        );
        this.logger.log(`Created S3 bucket '${this.bucketName}'`);
      } catch (createError: unknown) {
        this.logger.error(
          `Failed to create S3 bucket '${this.bucketName}':`,
          createError,
        );
        throw createError;
      }
    }
  }

  /**
   * Ensures the S3 bucket has a lifecycle policy to delete files after 1 day
   */
  private async ensureLifecyclePolicy(): Promise<void> {
    try {
      try {
        const existingPolicy = await this.s3Client.send(
          new GetBucketLifecycleConfigurationCommand({
            Bucket: this.bucketName,
          }),
        );

        const hasExpirationRule = existingPolicy.Rules?.some(
          (rule) => rule.ID === "DeleteAfterOneHour",
        );

        if (hasExpirationRule) {
          this.logger.log(
            `Lifecycle policy 'DeleteAfterOneHour' already exists for bucket '${this.bucketName}'`,
          );
          return;
        }
      } catch (error: unknown) {
        if (!isNoSuchLifecycleConfigurationError(error)) {
          this.logger.error(
            `Error checking lifecycle policy for bucket '${this.bucketName}':`,
            error,
          );  
        }
        // Silently continue if it's an expected error
      }

      await this.s3Client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucketName,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "DeleteAfterOneHour",
                Status: "Enabled",
                Filter: {},
                Expiration: {
                  Days: 1,
                },
              },
            ],
          },
        }),
      );
      this.logger.log(
        `Configured lifecycle policy 'DeleteAfterOneHour' for bucket '${this.bucketName}' (expires after 1 day - minimum AWS granularity)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure lifecycle policy for bucket '${this.bucketName}':`,
        error,
      );
    }
  }

  /**
   * Upload a stream or buffer to S3
   * @param key S3 object key
   * @param body Stream or Buffer to upload
   * @param contentType Optional content type
   * @param contentLength Optional content length (if not provided, uses multipart upload for streams)
   * @returns Promise that resolves when upload is complete
   */
  async uploadStream(
    key: string,
    body: Readable | Buffer,
    contentType?: string,
    contentLength?: number,
  ): Promise<void> {
    try {
      // If we have contentLength, use simple PutObject
      if (contentLength !== undefined || body instanceof Buffer) {
        const commandOptions: any = {
          Bucket: this.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
        };

        if (contentLength !== undefined) {
          commandOptions.ContentLength = contentLength;
        } else if (body instanceof Buffer) {
          commandOptions.ContentLength = body.length;
        }

        const command = new PutObjectCommand(commandOptions);
        await this.s3Client.send(command);
        this.logger.debug(`Uploaded object '${key}' to S3`);
        return;
      }

      // For streams without contentLength, use multipart upload
      if (body instanceof Readable) {
        await this.uploadStreamMultipart(key, body, contentType);
        return;
      }

      throw new Error("Invalid body type: expected Readable or Buffer");
    } catch (error) {
      this.logger.error(`Failed to upload object '${key}' to S3:`, error);
      throw error;
    }
  }

  /**
   * Upload a stream to S3 using multipart upload (for streams without known length)
   * @param key S3 object key
   * @param stream Readable stream to upload
   * @param contentType Optional content type
   * @returns Promise that resolves when upload is complete
   */
  private async uploadStreamMultipart(
    key: string,
    stream: Readable,
    contentType?: string,
  ): Promise<void> {
    const partSize = 5 * 1024 * 1024; // 5MB per part (minimum for multipart)
    let uploadId: string | undefined;
    const parts: Array<{ ETag: string; PartNumber: number }> = [];

    try {
      // Initialize multipart upload
      const createCommand = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const createResponse = await this.s3Client.send(createCommand);
      uploadId = createResponse.UploadId;

      if (!uploadId) {
        throw new Error("Failed to create multipart upload");
      }

      // Upload parts by reading from stream in chunks
      let partNumber = 1;
      let buffer = Buffer.alloc(0);
      let isUploading = false;
      let uploadQueue: Array<() => Promise<void>> = [];

      const processUploadQueue = async () => {
        if (isUploading || uploadQueue.length === 0) {
          return;
        }

        isUploading = true;
        while (uploadQueue.length > 0) {
          const uploadFn = uploadQueue.shift();
          if (uploadFn) {
            try {
              await uploadFn();
            } catch (error) {
              isUploading = false;
              throw error;
            }
          }
        }
        isUploading = false;
      };

      return new Promise((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);

          // Upload part when buffer reaches part size
          while (buffer.length >= partSize) {
            const partBuffer = buffer.subarray(0, partSize);
            buffer = buffer.subarray(partSize);
            const currentPartNumber = partNumber++;

            uploadQueue.push(async () => {
              try {
                const uploadPartCommand = new UploadPartCommand({
                  Bucket: this.bucketName,
                  Key: key,
                  UploadId: uploadId!,
                  PartNumber: currentPartNumber,
                  Body: partBuffer,
                });

                const partResponse = await this.s3Client.send(uploadPartCommand);
                if (partResponse.ETag) {
                  parts.push({
                    ETag: partResponse.ETag,
                    PartNumber: currentPartNumber,
                  });
                }
              } catch (error) {
                stream.destroy();
                reject(error);
                throw error;
              }
            });

            // Process queue (non-blocking)
            processUploadQueue().catch((error) => {
              stream.destroy();
              reject(error);
            });
          }
        });

        stream.on("end", async () => {
          try {
            // Wait for all queued uploads to complete
            await processUploadQueue();

            // Upload remaining buffer as final part
            if (buffer.length > 0) {
              const uploadPartCommand = new UploadPartCommand({
                Bucket: this.bucketName,
                Key: key,
                UploadId: uploadId!,
                PartNumber: partNumber,
                Body: buffer,
              });

              const partResponse = await this.s3Client.send(uploadPartCommand);
              if (partResponse.ETag) {
                parts.push({
                  ETag: partResponse.ETag,
                  PartNumber: partNumber,
                });
              }
            }

            // Complete multipart upload
            const completeCommand = new CompleteMultipartUploadCommand({
              Bucket: this.bucketName,
              Key: key,
              UploadId: uploadId!,
              MultipartUpload: { Parts: parts },
            });

            await this.s3Client.send(completeCommand);
            this.logger.debug(
              `Uploaded object '${key}' to S3 using multipart upload`,
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        stream.on("error", async (error) => {
          // Abort multipart upload on stream error
          if (uploadId) {
            try {
              await this.s3Client.send(
                new AbortMultipartUploadCommand({
                  Bucket: this.bucketName,
                  Key: key,
                  UploadId: uploadId,
                }),
              );
            } catch (abortError) {
              this.logger.error(
                `Failed to abort multipart upload for '${key}':`,
                abortError,
              );
            }
          }
          reject(error);
        });
      });
    } catch (error) {
      // Abort multipart upload on error
      if (uploadId) {
        try {
          await this.s3Client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucketName,
              Key: key,
              UploadId: uploadId,
            }),
          );
        } catch (abortError) {
          this.logger.error(
            `Failed to abort multipart upload for '${key}':`,
            abortError,
          );
        }
      }
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

      const stream = response.Body as Readable;
      this.logger.debug(`Retrieved object '${key}' from S3`);
      return stream;
    } catch (error: unknown) {
      if (isNoSuchKeyError(error) || isAWSNotFoundError(error)) {
        throw new Error(`Object '${key}' not found`);
      }
      this.logger.error(`Failed to get object '${key}' from S3:`, error);
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
    } catch (error: unknown) {
      if (isAWSNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate a unique S3 key for a file upload using timestamp and unique ID
   * @param prefix Optional prefix for the key
   * @returns Unique key string in format: prefix/timestamp-uniqueId
   */
  generateKey(prefix = "uploads"): string {
    const timestamp = Date.now();
    // Generate a unique ID using random string
    const uniqueId = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    return `${prefix}/${timestamp}-${uniqueId}`;
  }
}

