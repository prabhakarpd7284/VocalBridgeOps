/**
 * Voice routes (Browser-based STT/TTS)
 * - Browser handles STT via Web Speech API
 * - Backend processes transcript through message pipeline
 * - Browser handles TTS via Speech Synthesis API
 * - Optional: Store audio for audit/playback
 */

import { FastifyPluginAsync } from 'fastify';
import {
  processUserVoiceInput,
  getAudioArtifact,
  getAudioFileData,
} from '../services/voice.service.js';
import { sendMessage } from '../services/message.service.js';
import { getSessionById } from '../services/session.service.js';
import { authenticate } from '../plugins/auth.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Process voice transcript (browser-based STT)
   * POST /sessions/:sessionId/voice/transcript
   *
   * Browser does STT, sends transcript to backend,
   * backend processes message, returns text response,
   * browser does TTS on response
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: { transcript: string };
  }>(
    '/sessions/:sessionId/voice/transcript',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const { transcript } = request.body;
      const tenantId = request.tenant!.id;
      const correlationId = request.correlationId;
      const log = logger.child({ correlationId, tenantId, sessionId });

      log.info({ transcript }, 'Processing voice transcript (browser STT)');

      // Verify session exists and belongs to tenant
      const session = await getSessionById(tenantId, sessionId);

      if (session.status !== 'ACTIVE') {
        throw new ValidationError('Cannot send message to ended session');
      }

      // Get idempotency key from header
      const idempotencyKey = request.headers['x-idempotency-key'] as string | undefined;

      // Send the transcript through normal message flow
      const messageResponse = await sendMessage(tenantId, sessionId, {
        content: transcript,
        idempotencyKey,
        correlationId,
      });

      log.info({ messageId: messageResponse.id }, 'Voice message processed');

      return {
        transcript,
        message: {
          id: messageResponse.id,
          content: messageResponse.content,
        },
        metadata: messageResponse.metadata,
      };
    }
  );

  /**
   * Store audio for audit/playback (optional)
   * POST /sessions/:sessionId/voice/store-audio
   *
   * Browser can optionally upload recorded audio for backend storage
   */
  fastify.post<{
    Params: { sessionId: string };
  }>(
    '/sessions/:sessionId/voice/store-audio',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const tenantId = request.tenant!.id;
      const correlationId = request.correlationId;
      const log = logger.child({ correlationId, tenantId, sessionId });

      log.info('Storing audio for audit');

      // Verify session exists and belongs to tenant
      await getSessionById(tenantId, sessionId);

      // Get uploaded file
      const data = await request.file();

      if (!data) {
        throw new ValidationError('No audio file provided');
      }

      // Get transcript from form data (optional)
      const fields = data.fields as any;
      const transcript = fields?.transcript?.value || '';

      // Read file buffer
      const audioBuffer = await data.toBuffer();
      const mimeType = data.mimetype;

      // Determine format from mime type
      let format = 'webm';
      if (mimeType.includes('wav')) format = 'wav';
      else if (mimeType.includes('mp3')) format = 'mp3';
      else if (mimeType.includes('ogg')) format = 'ogg';
      else if (mimeType.includes('webm')) format = 'webm';

      log.info({ fileSize: audioBuffer.length, format }, 'Storing audio file');

      // Store audio with transcript
      const result = await processUserVoiceInput(
        sessionId,
        audioBuffer,
        format,
        transcript
      );

      log.info({ artifactId: result.artifact.id }, 'Audio stored');

      return {
        artifactId: result.artifact.id,
        stored: true,
      };
    }
  );

  /**
   * Get audio artifact
   * GET /sessions/:sessionId/voice/:artifactId
   */
  fastify.get<{
    Params: { sessionId: string; artifactId: string };
  }>(
    '/sessions/:sessionId/voice/:artifactId',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { sessionId, artifactId } = request.params;
      const tenantId = request.tenant!.id;

      const artifact = await getAudioArtifact(tenantId, sessionId, artifactId);

      if (!artifact.filePath) {
        throw new NotFoundError('Audio file not found');
      }

      const audioData = await getAudioFileData(artifact.filePath);

      // Set appropriate content type
      const contentType =
        artifact.format === 'wav'
          ? 'audio/wav'
          : artifact.format === 'mp3'
          ? 'audio/mpeg'
          : artifact.format === 'ogg'
          ? 'audio/ogg'
          : 'audio/webm';

      reply.type(contentType);
      return audioData;
    }
  );

  /**
   * Get audio artifact metadata
   * GET /sessions/:sessionId/voice/:artifactId/metadata
   */
  fastify.get<{
    Params: { sessionId: string; artifactId: string };
  }>(
    '/sessions/:sessionId/voice/:artifactId/metadata',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { sessionId, artifactId } = request.params;
      const tenantId = request.tenant!.id;

      const artifact = await getAudioArtifact(tenantId, sessionId, artifactId);

      return {
        id: artifact.id,
        type: artifact.type,
        durationMs: artifact.durationMs,
        format: artifact.format,
        sampleRate: artifact.sampleRate,
        provider: artifact.provider,
        transcript: artifact.transcript,
        latencyMs: artifact.latencyMs,
        createdAt: artifact.createdAt,
      };
    }
  );
};

export default voiceRoutes;
