import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  async extractText(filePath: string, fileType: string): Promise<string> {
    this.logger.log(`Extracting text from ${fileType} file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Uploaded file not found');
    }

    try {
      if (fileType === 'pdf') {
        return await this.extractPdfText(filePath);
      } else if (fileType === 'docx') {
        return await this.extractDocxText(filePath);
      } else {
        throw new BadRequestException(`Unsupported file type: ${fileType}`);
      }
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  private async extractPdfText(filePath: string): Promise<string> {
    try {
      const { PDFParse, VerbosityLevel } = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({
        verbosity: VerbosityLevel.ERRORS,
        data: dataBuffer,
      });
      const doc = await parser.load();
      const result = await parser.getText(doc);
      const pages = result?.pages || [];
      const text = pages.map((p: any) => p.text).join('\n');
      return text || '';
    } catch (error) {
      this.logger.warn(`pdf-parse failed for ${filePath}: ${error.message}`);
      throw new BadRequestException(
        `Failed to parse PDF document. Ensure it is a text-based PDF. Error: ${error.message}`,
      );
    }
  }

  private async extractDocxText(filePath: string): Promise<string> {
    return this.extractWithOfficeParser(filePath);
  }

  private async extractWithOfficeParser(filePath: string): Promise<string> {
    try {
      const { OfficeParser } = require('officeparser');
      const ast = await OfficeParser.parseOffice(filePath);
      return ast.toText();
    } catch (error) {
      this.logger.error(
        `Failed to parse document with officeparser: ${filePath}: ${error.message}`,
      );
      throw new BadRequestException(
        'Failed to parse DOCX document. Please ensure it is a valid DOCX file.',
      );
    }
  }
}
