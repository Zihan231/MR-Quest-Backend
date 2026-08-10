import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      vertexai: true,
      project: 'gen-lang-client-0247762738',
      location: 'global',
    });
  }

  async generateMcqs(
    context: string,
    count: number,
    fileBuffer?: { data: string; mimeType: string },
  ): Promise<any[]> {
    const parts: any[] = [];

    if (fileBuffer) {
      parts.push({ text: `You are an expert test generator. Based on the attached document, generate ${count} multiple-choice questions. Each question must have exactly 4 options and exactly 1 correct answer.\n\nRespond in JSON array format only:\n[\n  {\n    "questionText": "string",\n    "options": ["option1", "option2", "option3", "option4"],\n    "correctAnswers": ["option2"],\n    "marks": 1\n  }\n]\n\nRules:\n- Only return valid JSON array.\n- Do not include explanations or markdown fences.\n- correctAnswers must contain exactly one option from options.` });
      parts.push({ inlineData: { mimeType: fileBuffer.mimeType, data: fileBuffer.data } });
    } else {
      const prompt = `
You are an expert test generator. Based on the following content, generate ${count} multiple-choice questions.
Each question must have exactly 4 options and exactly 1 correct answer.

Content:
"""
${context}
"""

Respond in JSON array format only:
[
  {
    "questionText": "string",
    "options": ["option1", "option2", "option3", "option4"],
    "correctAnswers": ["option2"],
    "marks": 1
  }
]

Rules:
- Only return valid JSON array.
- Do not include explanations or markdown fences.
- correctAnswers must contain exactly one option from options.
`;
      parts.push({ text: prompt });
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const rawText = response.text?.trim() || '{}';
      const cleanedText = rawText
        .replace(/```json/gi, '')
        .replace(/```/gi, '')
        .trim();
      const parsed = JSON.parse(cleanedText);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      return parsed.slice(0, count);
    } catch (error) {
      this.logger.error(`Failed to generate MCQs: ${error.message}`);
      throw new BadRequestException(
        `Failed to generate MCQs: ${error.message}`,
      );
    }
  }

  async generateCqWithScript(
    context: string,
    count: number,
    fileBuffer?: { data: string; mimeType: string },
  ): Promise<{ questions: any[]; referenceScript: string }> {
    const parts: any[] = [];

    if (fileBuffer) {
      parts.push({ text: `You are an expert test generator. Based on the attached document, generate ${count} creative questions (CQ) and a reference script suitable for spoken assessment.\n\nRespond with exactly this JSON:\n{\n  "referenceScript": "string",\n  "questions": [\n    {\n      "questionText": "string",\n      "correctAnswers": ["model answer phrase"],\n      "marks": 2\n    }\n  ]\n}\n\nRules:\n- referenceScript should be a coherent paragraph a learner can read aloud.\n- questions should ask the learner to speak or write based on the content.\n- Only return valid JSON. Do not include markdown fences or explanations.` });
      parts.push({ inlineData: { mimeType: fileBuffer.mimeType, data: fileBuffer.data } });
    } else {
      const prompt = `
You are an expert test generator. Based on the following content, generate ${count} creative questions (CQ) and a reference script suitable for spoken assessment.

Content:
"""
${context}
"""

Respond with exactly this JSON:
{
  "referenceScript": "string",
  "questions": [
    {
      "questionText": "string",
      "correctAnswers": ["model answer phrase"],
      "marks": 2
    }
  ]
}

Rules:
- referenceScript should be a coherent paragraph a learner can read aloud.
- questions should ask the learner to speak or write based on the content.
- Only return valid JSON. Do not include markdown fences or explanations.
`;
      parts.push({ text: prompt });
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const rawText = response.text?.trim() || '{}';
      const cleanedText = rawText
        .replace(/```json/gi, '')
        .replace(/```/gi, '')
        .trim();
      const parsed = JSON.parse(cleanedText);
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('Missing questions array');
      }
      return {
        referenceScript: parsed.referenceScript || '',
        questions: parsed.questions.slice(0, count),
      };
    } catch (error) {
      this.logger.error(`Failed to generate CQ: ${error.message}`);
      throw new BadRequestException(
        `Failed to generate creative questions: ${error.message}`,
      );
    }
  }

  async evaluateCqAnswer(
    pdf: { data: string; mimeType: string } | null,
    questionText: string,
    learnerAnswer: string,
    maxMarks: number,
    referenceText?: string,
  ): Promise<{ marksAwarded: number; feedback: string }> {
    const parts: any[] = [];

    if (referenceText) {
      const prompt = `You are an expert evaluator. Based on the following reference material, evaluate the learner's answer to the question.

Reference Material:
"""
${referenceText}
"""

Question: "${questionText}"

Learner's answer: "${learnerAnswer}"

Score the answer from 0 to ${maxMarks} based on:
- Accuracy: Does the answer correctly reflect the information in the reference material?
- Relevance: Does the answer directly address the question?
- Completeness: Does the answer cover the key points from the material?

Respond with JSON only:
{
  "marksAwarded": <number between 0 and ${maxMarks}>,
  "feedback": "<brief explanation of the score, under 50 words>"
}

Do not include markdown fences or explanations.`;
      parts.push({ text: prompt });
    } else if (pdf) {
      const prompt = `You are an expert evaluator. Based on the attached reference document, evaluate the learner's answer to the following question.

Question: "${questionText}"

Learner's answer: "${learnerAnswer}"

Score the answer from 0 to ${maxMarks} based on:
- Accuracy: Does the answer correctly reflect the information in the reference document?
- Relevance: Does the answer directly address the question?
- Completeness: Does the answer cover the key points from the document?

Respond with JSON only:
{
  "marksAwarded": <number between 0 and ${maxMarks}>,
  "feedback": "<brief explanation of the score, under 50 words>"
}

Do not include markdown fences or explanations.`;
      parts.push({ text: prompt });
      parts.push({ inlineData: { mimeType: pdf.mimeType, data: pdf.data } });
    } else {
      throw new Error('Either pdf or referenceText must be provided');
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      const rawText = response.text?.trim() || '{}';
      const cleanedText = rawText
        .replace(/```json/gi, '')
        .replace(/```/gi, '')
        .trim();
      const parsed = JSON.parse(cleanedText);
      return {
        marksAwarded: parsed.marksAwarded ?? 0,
        feedback: parsed.feedback || '',
      };
    } catch (error) {
      this.logger.error(`Failed to evaluate CQ answer: ${error.message}`);
      throw new BadRequestException(
        `Failed to evaluate CQ answer: ${error.message}`,
      );
    }
  }

  async generateVideoScript(
    context: string,
    fileBuffer?: { data: string; mimeType: string },
  ): Promise<string> {
    const parts: any[] = [];

    if (fileBuffer) {
      parts.push({ text: `You are an expert test designer. Based on the attached document, generate a short speaking script that a learner can read aloud in front of the camera.\n\nReturn ONLY the script text. No markdown fences, no JSON, no headings. Just the script paragraph(s) suitable for a 60-90 second video response.` });
      parts.push({ inlineData: { mimeType: fileBuffer.mimeType, data: fileBuffer.data } });
    } else {
      const prompt = `
You are an expert test designer. Based on the following content, generate a short speaking script that a learner can read aloud in front of the camera.

Content:
"""
${context}
"""

Return ONLY the script text. No markdown fences, no JSON, no headings. Just the script paragraph(s) suitable for a 60-90 second video response.
`;
      parts.push({ text: prompt });
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts }],
        config: { temperature: 0.1 },
      });
      return (response.text?.trim() || '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();
    } catch (error) {
      this.logger.error(`Failed to generate video script: ${error.message}`);
      throw new BadRequestException(
        `Failed to generate video script: ${error.message}`,
      );
    }
  }
}
