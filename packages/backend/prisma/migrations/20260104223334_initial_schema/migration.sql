-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('ADMIN', 'ANALYST');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('VENDOR_A', 'VENDOR_B');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('CHAT', 'VOICE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "ProviderCallStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SEND_MESSAGE', 'VOICE_PROCESS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "AudioType" AS ENUM ('USER_INPUT', 'ASSISTANT_OUTPUT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "TenantRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primaryProvider" "ProviderType" NOT NULL,
    "fallbackProvider" "ProviderType",
    "systemPrompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "enabledTools" JSONB NOT NULL DEFAULT '[]',
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voiceConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'CHAT',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "audioArtifactId" TEXT,
    "providerCallId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_calls" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "status" "ProviderCallStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "idempotencyKey" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "callbackUrl" TEXT,
    "callbackSent" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "toolOutput" JSONB,
    "status" "ToolExecutionStatus" NOT NULL,
    "errorMessage" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_artifacts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "AudioType" NOT NULL,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "durationMs" INTEGER,
    "format" TEXT,
    "sampleRate" INTEGER,
    "provider" TEXT,
    "transcript" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "agents_tenantId_idx" ON "agents"("tenantId");

-- CreateIndex
CREATE INDEX "agents_tenantId_isActive_idx" ON "agents"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_agentId_idx" ON "sessions"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_customerId_idx" ON "sessions"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_createdAt_idx" ON "sessions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_sessionId_idx" ON "messages"("sessionId");

-- CreateIndex
CREATE INDEX "messages_sessionId_createdAt_idx" ON "messages"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sessionId_idempotencyKey_key" ON "messages"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sessionId_sequenceNumber_key" ON "messages"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "provider_calls_sessionId_idx" ON "provider_calls"("sessionId");

-- CreateIndex
CREATE INDEX "provider_calls_correlationId_idx" ON "provider_calls"("correlationId");

-- CreateIndex
CREATE INDEX "provider_calls_createdAt_idx" ON "provider_calls"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_providerCallId_key" ON "usage_events"("providerCallId");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_idx" ON "usage_events"("tenantId");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_agentId_idx" ON "usage_events"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_createdAt_idx" ON "usage_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_agentId_createdAt_idx" ON "usage_events"("tenantId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_tenantId_idx" ON "jobs"("tenantId");

-- CreateIndex
CREATE INDEX "jobs_tenantId_status_idx" ON "jobs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "jobs_status_lockExpiresAt_idx" ON "jobs"("status", "lockExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_tenantId_idempotencyKey_key" ON "jobs"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "tool_executions_sessionId_idx" ON "tool_executions"("sessionId");

-- CreateIndex
CREATE INDEX "tool_executions_correlationId_idx" ON "tool_executions"("correlationId");

-- CreateIndex
CREATE INDEX "tool_executions_toolName_createdAt_idx" ON "tool_executions"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "audio_artifacts_sessionId_idx" ON "audio_artifacts"("sessionId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_audioArtifactId_fkey" FOREIGN KEY ("audioArtifactId") REFERENCES "audio_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_providerCallId_fkey" FOREIGN KEY ("providerCallId") REFERENCES "provider_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_providerCallId_fkey" FOREIGN KEY ("providerCallId") REFERENCES "provider_calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_artifacts" ADD CONSTRAINT "audio_artifacts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
