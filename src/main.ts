process.env.TZ = 'UTC'; // Force Node to use UTC so DB timestamps aren't shifted by local timezone

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import * as fs from 'fs';
import { join } from 'path';

// Tell all Google Cloud SDKs where to find your credentials
process.env.GOOGLE_APPLICATION_CREDENTIALS = join(
  process.cwd(),
  'google-credentials.json',
);

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Ensure uploads directories exist
  const uploadDir = join(process.cwd(), 'uploads');
  const thumbnailsDir = join(uploadDir, 'thumbnails');
  const usersDpDir = join(uploadDir, 'users_dp');
  const certificatesDir = join(uploadDir, 'certificates');

  [uploadDir, thumbnailsDir, usersDpDir, certificatesDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  app.use(cookieParser());
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips non-decorated properties from DTOs
      transform: true, // Auto-transforms payloads to be DTO instances
    }),
  );

  const port = process.env.PORT ?? 3000;
  const server = await app.listen(port, '0.0.0.0');

  // Fix for Axios Network Error (ECONNRESET) on Chrome/Node keep-alive race condition
  // Chrome uses a 60s keep-alive. Setting Node to 61s prevents Node from closing the connection first.
  server.keepAliveTimeout = 61000;
  server.headersTimeout = 65000;

  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
