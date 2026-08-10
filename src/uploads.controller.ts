import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

@Controller('uploads')
export class UploadsController {
  // Serve files in sub-folders: /uploads/thumbnails/file.jpg, /uploads/test-videos/file.mp4, etc.
  @Get(':folder/:filename')
  serveSubFolderFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: express.Response,
  ) {
    const filePath = join(process.cwd(), 'uploads', folder, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    return res.sendFile(filePath);
  }

  // Serve files directly in uploads root: /uploads/file.pdf (lesson materials, reference scripts)
  @Get(':filename')
  serveRootFile(
    @Param('filename') filename: string,
    @Res() res: express.Response,
  ) {
    const filePath = join(process.cwd(), 'uploads', filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    return res.sendFile(filePath);
  }
}
