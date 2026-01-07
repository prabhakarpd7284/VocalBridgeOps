/**
 * Voice service
 * Handles STT (Speech-to-Text) and TTS (Text-to-Speech)
 *
 * Modes:
 * - browser: Client handles STT/TTS using Web Speech API (default)
 * - mock: Server provides mock STT/TTS for testing
 */

import { AudioArtifact } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// =======================
// CONFIG
// =======================

const AUDIO_STORAGE_DIR =
  process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'data', 'audio');

// Voice mode: 'browser' (default) or 'mock'
const VOICE_MODE = process.env.VOICE_MODE || 'browser';

// =======================
// INIT
// =======================

async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(AUDIO_STORAGE_DIR, { recursive: true });
  } catch (err) {
    logger.error({ err }, 'Failed to create audio storage directory');
  }
}

ensureStorageDir();

// =======================
// SPEECH TO TEXT (MOCK)
// =======================

export async function speechToText(
  audioBuffer: Buffer,
  format: string = 'webm'
): Promise<{
  transcript: string;
  durationMs: number;
  latencyMs: number;
}> {
  const startTime = Date.now();

  // Simulate processing delay
  await new Promise(r => setTimeout(r, 300));

  const mockTranscripts = [
    'What is the status of my order?',
    'Can you help me with my account?',
    'I need to update my shipping address.',
    'How do I reset my password?',
    'What are your business hours?',
  ];

  const transcript =
    mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];

  const latencyMs = Date.now() - startTime;

  logger.info(
    { latencyMs, provider: 'mock-stt' },
    'STT completed (mock)'
  );

  return {
    transcript,
    durationMs: Math.max(1000, audioBuffer.length / 16),
    latencyMs,
  };
}

// =======================
// TEXT TO SPEECH (MOCK)
// =======================

export async function textToSpeech(
  text: string,
  voice: string = 'default'
): Promise<{
  audioBuffer: Buffer;
  durationMs: number;
  latencyMs: number;
  format: string;
  sampleRate: number;
}> {
  const startTime = Date.now();

  // Simulate processing delay
  await new Promise(r => setTimeout(r, 400));

  const estimatedDurationSec = Math.max(2, text.split(' ').length / 1.67);
  const bufferSize = Math.round(estimatedDurationSec * 32 * 1024);

  const audioBuffer = Buffer.alloc(bufferSize);
  audioBuffer.fill(128); // Fill with neutral audio data

  const latencyMs = Date.now() - startTime;

  logger.info(
    { latencyMs, provider: 'mock-tts', textLength: text.length },
    'TTS completed (mock)'
  );

  return {
    audioBuffer,
    durationMs: Math.round(estimatedDurationSec * 1000),
    latencyMs,
    format: 'wav',
    sampleRate: 16000,
  };
}

// =======================
// PROCESS USER INPUT
// =======================

export async function processUserVoiceInput(
  sessionId: string,
  audioBuffer: Buffer,
  format: string = 'webm',
  transcript?: string
): Promise<{
  artifact: AudioArtifact;
  transcript: string;
}> {
  const log = logger.child({ sessionId, format });
  log.info({ size: audioBuffer.length }, 'Processing user voice input');

  const filename = `${uuidv4()}.${format}`;
  const filePath = path.join(AUDIO_STORAGE_DIR, filename);

  await fs.writeFile(filePath, audioBuffer);
  log.info({ filePath }, 'Audio file saved');

  // If transcript is provided (from browser), use it
  // Otherwise, use mock STT
  let finalTranscript: string;
  let stt: Awaited<ReturnType<typeof speechToText>>;

  if (transcript) {
    finalTranscript = transcript;
    stt = {
      transcript,
      durationMs: Math.max(1000, audioBuffer.length / 16),
      latencyMs: 0,
    };
    log.info({ transcript }, 'Using provided transcript (browser STT)');
  } else {
    stt = await speechToText(audioBuffer, format);
    finalTranscript = stt.transcript;
    log.info({ transcript: finalTranscript }, 'Generated transcript (mock STT)');
  }

  const artifact = await prisma.audioArtifact.create({
    data: {
      sessionId,
      type: 'USER_INPUT',
      filePath,
      fileSize: audioBuffer.length,
      durationMs: stt.durationMs,
      format,
      sampleRate: 16000,
      provider: transcript ? 'browser-stt' : 'mock-stt',
      transcript: finalTranscript,
      latencyMs: stt.latencyMs,
    },
  });

  log.info({ artifactId: artifact.id, transcript: finalTranscript }, 'User voice artifact created');

  return { artifact, transcript: finalTranscript };
}

// =======================
// ASSISTANT OUTPUT
// =======================

export async function generateAssistantVoiceOutput(
  sessionId: string,
  text: string,
  voice: string = 'default'
): Promise<AudioArtifact> {
  const log = logger.child({ sessionId, textLength: text.length, voice });
  log.info('Generating assistant voice output (mock)');

  const tts = await textToSpeech(text, voice);

  const filename = `${uuidv4()}.${tts.format}`;
  const filePath = path.join(AUDIO_STORAGE_DIR, filename);

  await fs.writeFile(filePath, tts.audioBuffer);
  log.info({ filePath, size: tts.audioBuffer.length }, 'TTS audio file saved');

  const artifact = await prisma.audioArtifact.create({
    data: {
      sessionId,
      type: 'ASSISTANT_OUTPUT',
      filePath,
      fileSize: tts.audioBuffer.length,
      durationMs: tts.durationMs,
      format: tts.format,
      sampleRate: tts.sampleRate,
      provider: 'mock-tts',
      latencyMs: tts.latencyMs,
    },
  });

  log.info({ artifactId: artifact.id }, 'Assistant voice artifact created');

  return artifact;
}

// =======================
// AUDIO RETRIEVAL
// =======================

export async function getAudioArtifact(
  tenantId: string,
  sessionId: string,
  artifactId: string
): Promise<AudioArtifact> {
  // Verify session belongs to tenant
  const session = await prisma.session.findFirst({
    where: { id: sessionId, tenantId },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  const artifact = await prisma.audioArtifact.findFirst({
    where: {
      id: artifactId,
      sessionId,
    },
  });

  if (!artifact) {
    throw new Error('Audio artifact not found');
  }

  return artifact;
}

export async function getAudioFileData(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to read audio file');
    throw new Error('Audio file not found');
  }
}

// =======================
// CLEANUP
// =======================

export async function cleanupOldAudioFiles(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const oldArtifacts = await prisma.audioArtifact.findMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  let deletedCount = 0;

  for (const artifact of oldArtifacts) {
    if (artifact.filePath) {
      try {
        await fs.unlink(artifact.filePath);
        deletedCount++;
      } catch (err) {
        logger.warn({ err, filePath: artifact.filePath }, 'Failed to delete audio file');
      }
    }
  }

  // Delete database records
  await prisma.audioArtifact.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  logger.info({ deletedCount, olderThanDays }, 'Cleaned up old audio files');

  return deletedCount;
}
