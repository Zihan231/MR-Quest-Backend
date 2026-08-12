import { Module } from '@nestjs/common';
import { GeminiAnalysisService } from './gemini-analysis.service';
import { CloudStorageService } from './cloud-storage.service';
import { MediaProcessorService } from './media-processor.service';

@Module({
  providers: [
    GeminiAnalysisService,
    CloudStorageService,
    MediaProcessorService,
  ],
  exports: [GeminiAnalysisService, CloudStorageService, MediaProcessorService],
})
export class AiEvaluationModule {}
