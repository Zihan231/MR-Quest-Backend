import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);
  private storage: Storage;
  private bucketName = 'trxcel';

  constructor() {
    // Explicitly pass the path to your JSON key file in the root directory
    this.storage = new Storage({
      projectId: 'gen-lang-client-0247762738',
      keyFilename: path.resolve(process.cwd(), 'google-credentials.json'),
    });
  }

  async uploadFile(filePath: string, destination: string): Promise<string> {
    try {
      await this.storage.bucket(this.bucketName).upload(filePath, {
        destination,
      });
      const gcsUri = `gs://${this.bucketName}/${destination}`;
      this.logger.log(`Uploaded ${filePath} to ${gcsUri}`);
      return gcsUri;
    } catch (error) {
      this.logger.error(`Failed to upload ${filePath}`, error);
      throw error;
    }
  }

  async uploadSnapshots(
    snapshotDir: string,
    submissionId: number,
  ): Promise<string[]> {
    try {
      const files = fs.readdirSync(snapshotDir);

      // Filter for JPGs and map them directly into an array of upload Promises
      const uploadPromises = files
        .filter((file) => file.endsWith('.jpg'))
        .map((file) => {
          const filePath = path.join(snapshotDir, file);
          const destination = `evaluations/submission_${submissionId}/snapshots/${file}`;
          return this.uploadFile(filePath, destination);
        });

      // Wait for all uploads to finish simultaneously
      const gcsUris = await Promise.all(uploadPromises);

      this.logger.log(
        `Successfully uploaded ${gcsUris.length} snapshots for submission ID: ${submissionId}`,
      );
      return gcsUris;
    } catch (error) {
      this.logger.error(
        `Failed to process snapshot directory for submission ID: ${submissionId}`,
        error,
      );
      throw error;
    }
  }
}
