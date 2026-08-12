import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiAnalysisService {
  private readonly logger = new Logger(GeminiAnalysisService.name);

  private ai: GoogleGenAI;

  private projectId = 'gen-lang-client-0247762738';

  private location = 'global';

  constructor() {
    this.ai = new GoogleGenAI({
      vertexai: true,

      project: this.projectId,

      location: this.location,
    });
  }

  async evaluateCandidate(
    audioGcsUri: string,
    snapshotUris: string[],
    scriptDocumentGcsUri: string,
    scriptMimeType: string,
    postureMax: number,
    voiceMax: number,
    accuracyMax: number,
    scriptText?: string,
  ): Promise<any> {
    // We dynamically inject the max marks into the prompt instructions and schema
    const promptText = `
      You are an expert evaluator assessing a candidate's medical detailing performance.
      
      I have provided:
      1. The extracted audio track of the candidate speaking.
      2. A series of image snapshots taken at 20-second intervals from the video.
      3. The reference script document (which may be a bilingual mix of English and Bengali/Banglish).
      
      Your evaluation must assess the candidate based on these three criteria:

      1. Posture & Dress Code: Analyze the visual snapshots for professionalism, dress code, attitude, posture, and facial expressions.
      
      2. Voice Tone & Filler Words: Listen to the audio to detect confidence, voice clarity, tone, and identify verbal fillers like "aaa", "ummm", "ah", or long hesitations/pauses. Mention the count and specific instances of these fillers.
      
      3. Script Accuracy & Key Info Coverage:
         - The reference script is a medical detailing document (which could be about any medicine, brand, or company, and is often a bilingual mix of English and Bengali/Banglish).
         - First, analyze the provided reference script to dynamically identify the key information, including:
           * The specific product/brand name.
           * The target conditions or therapeutic areas.
           * The core benefits or mechanism of action.
           * The key advantages, features, or unique selling points (USPs) of the product.
           * The call to action or recommendation to the doctor.
         - Do NOT perform a strict word-for-word check. Instead, assess whether the candidate intelligently covers the dynamically identified key concepts, keywords, and selling points from the script.
         - In the accuracy feedback, detail which specific key facts, product features, and concepts from the script the candidate successfully covered, and which ones they missed.

      SCORING RULES:
      You must rate each of the three criteria individually based on their specific maximum marks:
      - Posture & Dress Code Score: A number between 0 and ${postureMax}
      - Voice Tone & Filler Words Score: A number between 0 and ${voiceMax}
      - Script Accuracy Score: A number between 0 and ${accuracyMax}

      The overall score must be calculated as the mathematical sum of the three criteria scores: (postureScore + attitudeScore + accuracyScore).
      Round the overall score to 2 decimal places.
      
      You must respond ONLY with a valid JSON object matching this exact schema:
      {
        "postureScore": <number between 0 and ${postureMax}>,
        "postureFeedback": "<string detailing visual analysis, strictly under 30 words>",
        "attitudeScore": <number between 0 and ${voiceMax}>,
        "attitudeFeedback": "<string detailing tone, clarity, and hesitations, strictly under 30 words>",
        "accuracyScore": <number between 0 and ${accuracyMax}>,
        "accuracyFeedback": "<string detailing which key concepts/keywords were covered or missed, strictly under 30 words>",
        "overallScore": <calculated overall sum score as a number>
      }
    `;

    // Map all modalities into the payload: Text + Audio + PDF/Images (DOCX/PPTX passed as text)

    const parts: any[] = [
      { text: promptText },

      { fileData: { mimeType: 'audio/mp3', fileUri: audioGcsUri } },

      ...snapshotUris.map((uri) => ({
        fileData: { mimeType: 'image/jpeg', fileUri: uri },
      })),
    ];

    if (scriptText) {
      parts.push({
        text: `\n\nREFERENCE SCRIPT DOCUMENT TEXT:\n${scriptText}`,
      });
    } else {
      parts.push({
        fileData: { mimeType: scriptMimeType, fileUri: scriptDocumentGcsUri },
      });
    }

    try {
      this.logger.log(
        `Dispatching multimodal payload to Gemini. Max marks: P:${postureMax}, V:${voiceMax}, A:${accuracyMax}`,
      );

      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',

        contents: [{ role: 'user', parts }],

        config: {
          temperature: 0.1,

          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text;

      if (!rawText) {
        throw new Error('Gemini API returned an empty text response.');
      }

      this.logger.log('Successfully received evaluation from Gemini.');

      const cleanedText = rawText
        .replace(/```json/gi, '')
        .replace(/```/gi, '')
        .trim();

      return JSON.parse(cleanedText);
    } catch (error) {
      this.logger.error('Gemini Analysis failed:', error);

      throw new InternalServerErrorException(
        'Failed to analyze candidate performance.',
      );
    }
  }
}
