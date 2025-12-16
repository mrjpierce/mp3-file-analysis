# MP3 File Analysis

NestJS backend API that accepts MP3 file uploads and returns the frame count. Streams to and from S3 to handle large files.

## Explanation of App Design

### API Layer
The only endpoint is `/file-upload` in the [FileUploadController](./src/file-upload/file-upload.controller.ts). It is properly segregated by the business logic and handles minimal orchestration. Its main responsibility is the hiding of domain errors from the requester through catching and replacing them.

### Orchestration Layer
The rest of the files in the `file-upload` module orchestrate the bulk of the upload and processing by interacting with injected services from the `file-storage` storage layer and determinining which parser to use in the `mp3-analysis` utility module for analysis (NOTE: Only once parser provided as the instructions state the processing of other mp3 types is out of scope for this project).

### Storage Layer
`file-storage` provides interaction with the AWS S3 service including multi-part streaming (upload) and bi/trifurcating the (download) stream to allow multiple services to parse the same stream.

### Domain Layer
The `mp3-analysis` module provides all the utility required to detect, validate, and parse mp3s

## Explanation of Infratructure Design
While the instructions did not specifically state how large these mp3 files could be I thought a more robust solution was better to communicate my skill set and posed far more intereseting problems to solve. Assume I wouldn't have designed this to be as scalable as it is without proper reason.

### Compute
For the compute I chose to run the web-server on AWS Fargate (The GCP equivalent is Google Cloud Run) because of its auto-scaling policies, flexibility, and it still being a serverless solution. I didn't use AWS Lambda (GCP Cloud Functions) beause of the 15 minute timeout which would have put a hard cap on the time spent processing a single file.

### Storage
To ease in the processing of large files I am streaming the uploaded mp3 directly into S3 (GCP: Google Cloud Storage) and then streaming it back as its processed. This keeps large files in their entierty out of memory and uncaps the file size limit further.

## Development process
I produced a high level [Design Document](./.cursor/rules/design-document.mdc) exploring the requirements. Next, I produced a list of [Milestones](./.cursor/rules/milestones.mdc) from that document, making sure they pointed to an end-to-end "walking skeleton" solution quickly. I then introduced complexity making sure to keep tests green and the main endpoint functional as I did so, refactoring as needed. Each milestone was a git branch I merged into master.

## F.A.Q.
- **There are portions in the design and milestones not completed** The original plan was to write some IaC to implment a full fargate task group with auto-scaling, ALB, s3, and some observability through CloudWatch, but I have hit a time constraint. I have left the non-critical milestones uncompleted. Thankfully, because I got end-to-end quickly I was able to find a nice stopping point. The application is runable locally using [localstack](https://www.localstack.cloud/) to host a mock S3 service in a docker container and by running the Node.js web-server.

- **If I'm streaming the upload, why place it in S3?** Uploading to S3 allows us to decouple the upload and processing computation. While not necessary now, it allows for event driven async processing in a distributed system that could be implemented later. This is how I would have designed the system if it weren't for the strict API contract requirements.

## Quick Start

### Prerequisites

1. **Install Node.js 20.x or later**
   - Download from https://nodejs.org/ or use a version manager (nvm, fnm, etc.)
   - Verify: `node --version` (should be >= 20.0.0)

2. **Install Docker and Docker Compose**
   - Docker Desktop: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version` and `docker-compose --version`

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Copy the `.env.example` to `.env` in the project root.

### Run

1. **Start LocalStack (AWS services emulator)**
   ```bash
   npm run localstack:up
   ```
   Wait ~30 seconds for LocalStack to initialize.

2. **Build and start the file-upload task**
   ```bash
   npm run file-upload:start:dev
   ```
   The server starts on `http://localhost:3000`

2. **Test the endpoint using the test song**
   ```bash
   curl -X POST http://localhost:3000/file-upload -F "file=@test-data/Frame by Frame (Foundation Health).mp3"
   ```
   Expected response: `{"frameCount": 5463}`

### Test

Run the test suite:
```bash
npm test
```

### Lint

Run the test suite:
```bash
npm run lint
```

### Cleanup

Stop LocalStack:
```bash
npm run localstack:down
```
