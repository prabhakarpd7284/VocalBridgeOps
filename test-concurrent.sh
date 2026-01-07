#!/bin/bash

ADMIN_KEY="vb_live_0MnndbBHRzGaKDPxPLNuiGs5qNoUbeMk"
AGENT_ID="45430cb3-9d34-4f23-8334-55fb394f73f4"

echo "=== Creating new session ==="
SESSION_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/sessions" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"'"$AGENT_ID"'","customerId":"test-concurrent-'"$(date +%s)"'","channel":"CHAT"}')

echo "$SESSION_RESPONSE" | head -c 500
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo ""
echo "Session ID: $SESSION_ID"

echo ""
echo "=== Sending 5 concurrent messages to test sequence generation and locking ==="
for i in 1 2 3 4 5; do
  (curl -s -X POST "http://localhost:3000/api/v1/sessions/$SESSION_ID/messages" \
    -H "X-API-Key: $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: concurrent-test-$i-$(date +%s%N)" \
    -d '{"content":"Test message '"$i"'"}' > /tmp/response-$i.json) &
done

wait
echo "All requests completed"

echo ""
echo "=== Results ==="
for i in 1 2 3 4 5; do
  echo "Response $i:"
  cat /tmp/response-$i.json | head -c 300
  echo ""
done

echo ""
echo "=== Get session transcript to verify sequence numbers ==="
curl -s "http://localhost:3000/api/v1/sessions/$SESSION_ID" \
  -H "X-API-Key: $ADMIN_KEY" | grep -o '"sequenceNumber":[0-9]*' | head -10
