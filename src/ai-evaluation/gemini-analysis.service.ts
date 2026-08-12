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
    accuracyMax: number,
    scriptText?: string,
  ): Promise<any> {
    // We dynamically inject the max marks into the prompt instructions and schema
    const promptText = `
      You are an expert evaluator assessing a candidate's medical detailing performance for a pharmaceutical product.

      IMPORTANT: This is a medical/pharmaceutical context. You MUST be extremely precise about medical terminology, drug names, therapeutic areas, mechanism of action, dosing guidance, and clinical claims. Any mispronunciation, incorrect terminology, or inaccurate medical statement must be flagged.

      I have provided:
      1. The extracted audio track of the candidate speaking.
      2. A series of image snapshots taken at 20-second intervals from the video (for context only).
      3. The reference script document (which may be a bilingual mix of English and Bengali/Banglish).

      Your evaluation must be based on a SINGLE marking category: Script Accuracy.

      SCRIPT ACCURACY ANALYSIS:
      - First, analyze the provided reference script to dynamically identify the key information, including:
        * The specific product/brand name.
        * The target conditions or therapeutic areas.
        * The core benefits or mechanism of action.
        * The key advantages, features, or unique selling points (USPs) of the product.
        * Key medical terms and their correct pronunciation.
        * The call to action or recommendation to the doctor.
      - Listen carefully to the audio and assess:
        * Did the candidate say the key words/terms correctly?
        * Did the candidate cover all key topics from the script?
        * Were medical terms pronounced correctly?
        * Did the candidate use the correct generic/brand names?
        * Were any medical statements inaccurate, misleading, or dangerous?
        * Was the call to action / doctor recommendation delivered?
      - Do NOT perform a strict word-for-word check. Instead, assess whether the candidate intelligently covers the dynamically identified key concepts, keywords, and selling points from the script.
      - Be STRICT about medical accuracy: flag any incorrect drug name, wrong therapeutic area, inaccurate dosage, or mispronounced medical term.

      SCORING RULES:
      - Script Accuracy Score: A number between 0 and ${accuracyMax} based ONLY on script accuracy.
      - The overall score is the same as the script accuracy score.
      - Round the score to 2 decimal places.

      You must generate TWO distinct types of feedback - one for the student (motivational and constructive) and one for the admin (actual detailed technical feedback).

      STUDENT FEEDBACK RULES (studentFeedback):
      - MUST be highly motivating and encouraging. NEVER demotivate the student.
      - NEVER say things like "you did badly", "your performance was poor", "you failed".
      - Acknowledge what the student did well first.
      - Gently identify areas for improvement and provide actionable suggestions.
      - Frame mistakes as opportunities to improve.
      - Keep the tone positive, supportive, and professional.

      ADMIN FEEDBACK RULES (adminFeedback):
      - This is the ACTUAL detailed technical feedback for the evaluator/admin.
      - Provide a comprehensive breakdown including:
        * Specific topics/key facts covered from the script.
        * Specific topics/key facts MISSED from the script.
        * Medical terms said correctly.
        * Medical terms said incorrectly (include the student's pronunciation and the correct term).
        * Any inaccurate or unsafe medical statements made.
        * Score analysis explaining why the score was awarded.
        * Improvement suggestions for the candidate.
        * Additional feedback or observations.
      - Be direct, factual, and thorough.

      You must respond ONLY with a valid JSON object matching this exact schema:
      {
        "accuracyScore": <number between 0 and ${accuracyMax}>,
        "studentFeedback": {
          "encouragement": "<motivational praise acknowledging what the student did well, under 30 words>",
          "mistakesIdentified": "<gentle list of areas to improve, framed positively, under 30 words>",
          "improvementSuggestions": "<actionable suggestions on how to improve, under 30 words>"
        },
        "adminFeedback": {
          "breakdown": {
            "topicsCovered": ["<key topic covered>"],
            "topicsMissed": ["<key topic missed>"],
            "medicalTermsCorrect": ["<medical term said correctly>"],
            "medicalTermsIncorrect": [{"studentSaid": "<spoken term>", "correctTerm": "<correct medical term>"}],
            "inaccurateStatements": ["<any inaccurate or unsafe medical statements>"],
            "keyMessagesCovered": ["<key selling points or messages covered>"],
            "keyMessagesMissed": ["<key selling points or messages missed>"]
          },
          "scoreAnalysis": "<detailed reasoning for the score, under 40 words>",
          "improvementSuggestions": "<AI suggestions for improvement, under 40 words>",
          "additionalFeedback": "<extra observations, under 30 words>"
        },
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
        `Dispatching multimodal payload to Gemini. Max marks: A:${accuracyMax}`,
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