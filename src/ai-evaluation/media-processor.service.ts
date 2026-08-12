import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaProcessorService implements OnModuleInit {
  private readonly logger = new Logger(MediaProcessorService.name);

  onModuleInit() {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.getAvailableFormats((err: any) => {
      if (err) {
        this.logger.error(
          'CRITICAL: FFmpeg binary not found on the system. Video processing will fail.',
          err,
        );
      } else {
        this.logger.log('FFmpeg binary validated and ready for processing.');
      }
    });
  }

  async processVideoAssets(
    filename: string,
    submissionId: number,
  ): Promise<{ audioPath: string; snapshotDir: string }> {
    const inputVideoPath = path.resolve('./uploads/test-videos', filename);
    const outputDir = path.resolve(
      `./uploads/VdoEva/submission_${submissionId}`,
    );
    const audioDir = path.join(outputDir, 'audio');
    const snapshotDir = path.join(outputDir, 'snap');
    const audioPath = path.join(audioDir, 'extracted_audio.mp3');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    this.logger.log(
      `Starting parallel extraction for submission ID: ${submissionId}`,
    );

    // 2 & 3. Split into two explicit, parallel processes to avoid flag bleeding
    try {
      await Promise.all([
        this.extractAudio(inputVideoPath, audioPath),
        this.extractSnapshots(inputVideoPath, snapshotDir),
      ]);

      this.logger.log(`Extraction complete. Assets saved to: ${outputDir}`);
      return { audioPath, snapshotDir };
    } catch (err) {
      this.logger.error(
        `Media processing failed for submission ${submissionId}`,
        err,
      );
      throw new InternalServerErrorException('Failed to process video assets');
    }
  }

  /**
   * Dedicated process exclusively for isolating the audio track
   */
  private extractAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .noVideo() // Perfectly safe here, isolated instance
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(16000)
        .on('end', () => resolve())
        .on('error', (err: any) => {
          this.logger.error(`Audio extraction error: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Dedicated process exclusively for grabbing video frames
   */
  private extractSnapshots(
    inputPath: string,
    snapshotDir: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(path.join(snapshotDir, 'snapshot_%03d.jpg'))
        .noAudio() // Strips audio to speed up frame processing
        .videoFilters('fps=1/20')
        .on('end', () => resolve())
        .on('error', (err: any) => {
          this.logger.error(`Snapshot extraction error: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }
}
