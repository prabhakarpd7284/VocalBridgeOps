-- Production Readiness Fixes Migration
-- 1. Performance indexes for hot queries
-- 2. PostgreSQL function for atomic sequence generation

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Messages: Idempotency lookups
CREATE INDEX IF NOT EXISTS "idx_messages_idempotency" ON "messages"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- Messages: Conversation history filtering
CREATE INDEX IF NOT EXISTS "idx_messages_conversation" ON "messages"("sessionId", "role", "createdAt");

-- ProviderCalls: Billing queries (check unbilled calls)
CREATE INDEX IF NOT EXISTS "idx_provider_calls_billing" ON "provider_calls"("billed", "createdAt");

-- ProviderCalls: Status filtering
CREATE INDEX IF NOT EXISTS "idx_provider_calls_status" ON "provider_calls"("status", "createdAt");

-- ProviderCalls: Session history with time
CREATE INDEX IF NOT EXISTS "idx_provider_calls_session_time" ON "provider_calls"("sessionId", "createdAt");

-- ProviderCalls: Provider analytics
CREATE INDEX IF NOT EXISTS "idx_provider_calls_analytics" ON "provider_calls"("provider", "status", "createdAt");

-- UsageEvents: Provider analytics
CREATE INDEX IF NOT EXISTS "idx_usage_events_provider" ON "usage_events"("provider", "createdAt");

-- UsageEvents: Tenant provider breakdown
CREATE INDEX IF NOT EXISTS "idx_usage_events_tenant_provider" ON "usage_events"("tenantId", "provider", "createdAt");

-- ============================================================================
-- ATOMIC SEQUENCE GENERATION FUNCTION
-- ============================================================================

-- Create function to atomically get next message sequence number
-- This prevents race conditions when multiple threads try to generate
-- the next sequence number for the same session concurrently.
CREATE OR REPLACE FUNCTION get_next_message_sequence(p_session_id uuid)
RETURNS integer AS $$
DECLARE
  next_seq integer;
BEGIN
  -- Lock the session row to serialize sequence generation
  -- This ensures only one thread can generate a sequence at a time per session
  PERFORM id FROM sessions WHERE id = p_session_id FOR UPDATE;

  -- Get next sequence number
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO next_seq
  FROM messages
  WHERE session_id = p_session_id;

  RETURN next_seq;
END;
$$ LANGUAGE plpgsql;

-- Create a comment on the function for documentation
COMMENT ON FUNCTION get_next_message_sequence(uuid) IS
'Atomically generates the next sequence number for a message in a session. Uses row-level lock on session to prevent concurrent sequence generation race conditions.';
