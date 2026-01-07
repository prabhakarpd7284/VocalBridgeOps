# VocalBridge Ops

A multi-tenant AI Agent Gateway that integrates with mocked AI vendors, supports reliability features (timeouts/retries/fallback), and produces usage/billing analytics.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Setup

```bash
# Clone and enter the project
cd VocalBridgeOps

# Complete setup (install deps, start DB, migrate, seed)
make setup

# Start development servers
make dev
```

This will:
1. Install all dependencies
2. Start PostgreSQL in Docker
3. Run database migrations
4. Seed with demo data (2 tenants, 3 agents)
5. Start backend (http://localhost:3000) and frontend (http://localhost:5173)

### Manual Setup

If you prefer step-by-step:

```bash
# 1. Install dependencies
make install

# 2. Start PostgreSQL
make db-up

# 3. Run migrations
make db-migrate

# 4. Seed demo data
make db-seed

# 5. Start servers
make dev
```

## Demo Data

After seeding, you'll have:

### Tenant 1: Acme Corporation
- **API Key**: `vb_live_acme_demo_key_12345`
- **Role**: ADMIN

**Agents:**
1. **Support Bot** - VendorA primary, VendorB fallback, InvoiceLookup tool, voice enabled
2. **Sales Assistant** - VendorB only, no fallback, no tools

### Tenant 2: TechStart Inc
- **API Key**: `vb_live_tech_demo_key_67890`
- **Role**: ADMIN

**Agents:**
1. **Onboarding Guide** - VendorA primary, VendorA retry only, InvoiceLookup tool, voice enabled

## Sample curl Commands

### Get Tenant Info
```bash
curl -X GET http://localhost:3000/api/v1/tenants/me \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### List Agents
```bash
curl -X GET http://localhost:3000/api/v1/agents \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### Create a Session
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "X-API-Key: vb_live_acme_demo_key_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID_HERE",
    "customerId": "customer_123"
  }'
```

### Send a Message
```bash
curl -X POST http://localhost:3000/api/v1/sessions/SESSION_ID/messages \
  -H "X-API-Key: vb_live_acme_demo_key_12345" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: msg_$(date +%s)" \
  -d '{
    "content": "What is the status of my order #12345?"
  }'
```

### Send Async Message
```bash
curl -X POST http://localhost:3000/api/v1/sessions/SESSION_ID/messages/async \
  -H "X-API-Key: vb_live_acme_demo_key_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Analyze my account",
    "callbackUrl": "https://webhook.site/your-id"
  }'
```

### Get Job Status
```bash
curl -X GET http://localhost:3000/api/v1/jobs/JOB_ID \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### Get Session Transcript
```bash
curl -X GET http://localhost:3000/api/v1/sessions/SESSION_ID \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### Get Usage Summary
```bash
curl -X GET "http://localhost:3000/api/v1/usage?startDate=2024-01-01&endDate=2024-12-31" \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### Get Usage Breakdown by Provider
```bash
curl -X GET "http://localhost:3000/api/v1/usage/breakdown?startDate=2024-01-01&endDate=2024-12-31&groupBy=provider" \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

### Get Top Agents by Cost
```bash
curl -X GET "http://localhost:3000/api/v1/usage/top-agents?limit=10" \
  -H "X-API-Key: vb_live_acme_demo_key_12345"
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation including:
- High-Level Design (HLD)
- Low-Level Design (LLD) with database schema
- API contracts
- Reliability mechanisms (retry, fallback, idempotency)
- Bonus features design

## Features

### Core Features
- **Multi-Tenant Core**: API key authentication, tenant isolation, agent management
- **Unified Conversation API**: Sessions, messages, transcripts with idempotency
- **AI Integration**: Vendor-agnostic adapter pattern with VendorA/VendorB mocks
- **Reliability**: Timeouts, retries with exponential backoff, fallback providers
- **Usage & Billing**: Per-token pricing, cost tracking, analytics dashboard

### Bonus Features
- **Voice Bot Channel**: Browser audio recording → STT → Chat → TTS
- **Async Mode**: Job queue with polling and webhook callbacks
- **Tool/Plugin Framework**: InvoiceLookup tool with audit logging
- **Observability**: Correlation IDs, structured logging, metrics
- **RBAC**: Admin vs Analyst roles

## Development Commands

```bash
make help          # Show all available commands

# Development
make dev           # Start both backend and frontend
make backend       # Start only backend
make frontend      # Start only frontend

# Database
make db-up         # Start PostgreSQL
make db-down       # Stop PostgreSQL
make db-reset      # Reset database
make db-migrate    # Run migrations
make db-seed       # Seed demo data
make db-studio     # Open Prisma Studio

# Testing
make test          # Run all tests
make test-watch    # Run tests in watch mode
make test-coverage # Run tests with coverage

# Code Quality
make lint          # Run linter
make lint-fix      # Fix lint issues
make format        # Format code
make typecheck     # TypeScript type check

# Build
make build         # Build for production
make clean         # Clean all artifacts
```

## Project Structure

```
VocalBridgeOps/
├── packages/
│   ├── backend/           # Fastify API server
│   │   ├── prisma/        # Database schema & migrations
│   │   ├── src/
│   │   │   ├── routes/    # API route handlers
│   │   │   ├── services/  # Business logic
│   │   │   ├── providers/ # AI vendor adapters
│   │   │   ├── tools/     # Plugin framework
│   │   │   └── voice/     # STT/TTS services
│   │   └── tests/         # Unit & integration tests
│   │
│   └── frontend/          # React dashboard
│       └── src/
│           ├── pages/     # Page components
│           ├── components/# Reusable components
│           ├── hooks/     # React hooks
│           └── api/       # API client
│
├── docker-compose.yml     # PostgreSQL service
├── Makefile               # Development commands
└── ARCHITECTURE.md        # Detailed architecture docs
```

## Testing

```bash
# Run all tests
make test

# Run specific test file
cd packages/backend && npx vitest run tests/integration/message-billing.test.ts

# Run tests in watch mode
make test-watch
```

## API Documentation

When the backend is running, visit:
- Swagger UI: http://localhost:3000/docs

## Pricing

| Provider | Input (per 1K tokens) | Output (per 1K tokens) |
|----------|----------------------|------------------------|
| VendorA  | $0.002               | $0.004                 |
| VendorB  | $0.003               | $0.006                 |

## Troubleshooting

### PostgreSQL won't start
```bash
# Check if port 5432 is in use
lsof -i :5432

# Reset and try again
make db-reset
```

### Migrations failing
```bash
# Reset database completely
make db-reset
make db-migrate
```

### Frontend can't connect to backend
Ensure backend is running on port 3000. The frontend proxies `/api` requests to the backend.

