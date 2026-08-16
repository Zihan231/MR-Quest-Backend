import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
import * as fs from 'fs';
import * as path from 'path';
import { mediaSemaphore } from '../common/concurrency';

@Injectable()
export class MediaProcessorService implements OnModuleInit {
  private readonly logger = new Logger(MediaProcessorService.name);

  onModuleInit() {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
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

  private static readonly MAX_SNAPSHOTS = 8;
  private static readonly SNAPSHOT_INTERVAL_SEC = 60;

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

    try {
      await mediaSemaphore.run(async () => {
        await Promise.all([
          this.extractAudio(inputVideoPath, audioPath),
          this.extractSnapshots(inputVideoPath, snapshotDir),
        ]);
      });

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

  private probeDuration(inputPath: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
          if (err) {
            this.logger.warn(
              `ffprobe failed for ${inputPath}: ${err?.message}`,
            );
            resolve(0);
            return;
          }
          const duration = Number(
            metadata?.format?.duration || metadata?.streams?.[0]?.duration || 0,
          );
          resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
        });
      } catch (err) {
        this.logger.warn(`ffprobe threw for ${inputPath}: ${err}`);
        resolve(0);
      }
    });
  }

  private buildSnapshotTimes(duration: number): number[] {
    const times: number[] = [0];
    if (duration > 0) {
      times.push(duration * 0.5);
      const interval = MediaProcessorService.SNAPSHOT_INTERVAL_SEC;
      for (let t = interval; t < duration; t += interval) {
        times.push(t);
        if (times.length >= MediaProcessorService.MAX_SNAPSHOTS) break;
      }
    }
    const unique = Array.from(new Set(times.map((t) => Math.round(t)))).sort(
      (a, b) => a - b,
    );
    return unique.slice(0, MediaProcessorService.MAX_SNAPSHOTS);
  }

  /**
   * Dedicated process exclusively for isolating the audio track
   */
  private extractAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .output(outputPath)
        .noVideo() // Perfectly safe here, isolated instance
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(16000)
        .on('end', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err: any) => {
          clearTimeout(timeout);
          this.logger.error(`Audio extraction error: ${err.message}`);
          reject(err);
        });
      const timeout = setTimeout(() => {
        this.logger.error('Audio extraction timed out after 120s');
        command.kill('SIGKILL');
        reject(new Error('Audio extraction timed out after 120s'));
      }, 120000);
      command.run();
    });
  }

  /**
   * Fast seek-and-capture snapshot extraction: each snapshot decodes only a
   * few frames near its target timestamp instead of the entire video.
   */
  private async extractSnapshots(
    inputPath: string,
    snapshotDir: string,
  ): Promise<void> {
    const duration = await this.probeDuration(inputPath);
    const times = this.buildSnapshotTimes(duration);

    for (let i = 0; i < times.length; i++) {
      const seekSec = times[i];
      const snapshotPath = path.join(
        snapshotDir,
        `snapshot_${String(i + 1).padStart(3, '0')}.jpg`,
      );
      await this.extractSnapshotAt(inputPath, snapshotPath, seekSec);
    }

    this.logger.log(
      `Extracted ${times.length} snapshots into ${snapshotDir} (duration ${duration}s)`,
    );
  }

  private extractSnapshotAt(
    inputPath: string,
    snapshotPath: string,
    seekSec: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .seekInput(seekSec)
        .outputOptions('-frames:v 1')
        .videoFilters('scale=-2:360')
        .output(snapshotPath)
        .on('end', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err: any) => {
          clearTimeout(timeout);
          this.logger.error(
            `Snapshot extraction error at ${seekSec}s: ${err.message}`,
          );
          reject(err);
        });
      const timeout = setTimeout(() => {
        this.logger.error(`Snapshot extraction timed out at ${seekSec}s`);
        command.kill('SIGKILL');
        reject(new Error(`Snapshot extraction timed out at ${seekSec}s`));
      }, 120000);
      command.run();
    });
  }
}
