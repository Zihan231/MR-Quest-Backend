import { Injectable, Logger } from '@nestjs/common';
import * as speech from '@google-cloud/speech';
import * as fs from 'fs';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private speechClient: speech.v1.SpeechClient;

  constructor() {
    // The Google library automatically detects the GOOGLE_APPLICATION_CREDENTIALS
    // environment variable from your .env file to authorize requests.
    this.speechClient = new speech.v1.SpeechClient();
  }

  async transcribeAudio(audioFilePath: string): Promise<string> {
    this.logger.log(
      `Starting dual-language parallel transcription for: ${audioFilePath}`,
    );

    try {
      // 1. Read and encode the audio file
      const fileBuffer = fs.readFileSync(audioFilePath);
      const audioBytes = fileBuffer.toString('base64');

      // 2. Try Bangla transcription first (as it is the most common language)
      this.logger.log('Attempting Bangla transcription...');
      const banglaRes = await this.runTranscription(audioBytes, 'bn-BD');
      const bnConfidence = this.getAverageConfidence(banglaRes);

      let bestResponse = banglaRes;
      let chosenLang = 'Bangla';

      // 3. If Bangla confidence is low (< 0.80), fall back to English transcription
      if (bnConfidence < 0.8) {
        this.logger.log(
          `Bangla confidence is low (${bnConfidence.toFixed(4)}). Attempting English fallback...`,
        );
        try {
          const englishRes = await this.runTranscription(audioBytes, 'en-US');
          const enConfidence = this.getAverageConfidence(englishRes);
          this.logger.log(
            `English transcription completed with confidence: ${enConfidence.toFixed(4)}`,
          );

          if (enConfidence > bnConfidence) {
            bestResponse = englishRes;
            chosenLang = 'English';
          }
        } catch (enErr) {
          this.logger.warn(
            'English fallback transcription failed, staying with Bangla results.',
            enErr,
          );
        }
      } else {
        this.logger.log(
          `Bangla transcription accepted with high confidence: ${bnConfidence.toFixed(4)}`,
        );
      }

      this.logger.log(`Selected transcription language: ${chosenLang}`);

      // Log the raw chosen response payload
      console.log('=== RAW GOOGLE SPEECH RESPONSE ===');
      console.log(JSON.stringify(bestResponse, null, 2));
      console.log('==================================');

      // 4. Aggregate the individual text blocks into a uniform string
      const transcription =
        bestResponse.results
          ?.map((result) => result.alternatives?.[0]?.transcript)
          .join('\n') || '';

      // Map and log the aggregated text block to the console as well
      console.log('=== EXTRACTED TRANSCRIPT BLOCK ===');
      console.log(transcription);
      console.log('==================================');

      this.logger.log('Transcription completed successfully.');
      return transcription;
    } catch (error) {
      this.logger.error('Google Speech-to-Text API pipeline failed:', error);
      throw error;
    }
  }

  private async runTranscription(audioBytes: string, langCode: string) {
    const request = {
      audio: {
        content: audioBytes,
      },
      config: {
        encoding: 'MP3' as const,
        sampleRateHertz: 16000,
        languageCode: langCode,
        enableWordTimeOffsets: true,
      },
    };
    const [operation] = await this.speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();
    return response;
  }

  private getAverageConfidence(response: any): number {
    if (!response || !response.results || response.results.length === 0) {
      return 0;
    }
    let totalConfidence = 0;
    let count = 0;
    for (const result of response.results) {
      const alternative = result.alternatives?.[0];
      if (alternative && typeof alternative.confidence === 'number') {
        totalConfidence += alternative.confidence;
        count++;
      }
    }
    return count > 0 ? totalConfidence / count : 0;
  }
}
