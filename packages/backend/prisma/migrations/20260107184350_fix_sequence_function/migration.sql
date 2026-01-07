-- Fix get_next_message_sequence function to use TEXT instead of UUID
-- Prisma stores UUIDs as TEXT, not native PostgreSQL UUID type

DROP FUNCTION IF EXISTS get_next_message_sequence(uuid);

CREATE OR REPLACE FUNCTION get_next_message_sequence(p_session_id text)
RETURNS integer AS $$
DECLARE
  next_seq integer;
BEGIN
  -- Lock the session row to serialize sequence generation
  -- This ensures only one thread can generate a sequence at a time per session
  PERFORM id FROM sessions WHERE id = p_session_id FOR UPDATE;

  -- Get next sequence number
  -- Note: Prisma uses camelCase for column names
  SELECT COALESCE(MAX("sequenceNumber"), 0) + 1
  INTO next_seq
  FROM messages
  WHERE "sessionId" = p_session_id;

  RETURN next_seq;
END;
$$ LANGUAGE plpgsql;

-- Create a comment on the function for documentation
COMMENT ON FUNCTION get_next_message_sequence(text) IS
'Atomically generates the next sequence number for a message in a session. Uses row-level lock on session to prevent concurrent sequence generation race conditions.';
