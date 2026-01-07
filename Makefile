.PHONY: help install dev build test clean db-up db-down db-reset db-migrate db-seed db-studio backend frontend lint format

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

help: ## Show this help message
	@echo "$(CYAN)VocalBridge Ops - Development Commands$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'

# =============================================================================
# Installation & Setup
# =============================================================================

install: ## Install all dependencies
	@echo "$(CYAN)Installing root dependencies...$(RESET)"
	npm install
	@echo "$(CYAN)Installing backend dependencies...$(RESET)"
	cd packages/backend && npm install
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd packages/frontend && npm install
	@echo "$(GREEN)All dependencies installed!$(RESET)"

setup: install db-up db-migrate db-seed ## Complete setup: install deps, start DB, run migrations, seed data
	@echo "$(GREEN)Setup complete! Run 'make dev' to start development servers.$(RESET)"

# =============================================================================
# Development
# =============================================================================

dev: ## Start both backend and frontend in development mode
	@echo "$(CYAN)Starting development servers...$(RESET)"
	npm run dev

backend: ## Start only the backend server
	@echo "$(CYAN)Starting backend server...$(RESET)"
	cd packages/backend && npm run dev

frontend: ## Start only the frontend server
	@echo "$(CYAN)Starting frontend server...$(RESET)"
	cd packages/frontend && npm run dev

# =============================================================================
# Build
# =============================================================================

build: ## Build both backend and frontend for production
	@echo "$(CYAN)Building for production...$(RESET)"
	npm run build

build-backend: ## Build only the backend
	cd packages/backend && npm run build

build-frontend: ## Build only the frontend
	cd packages/frontend && npm run build

# =============================================================================
# Database Management
# =============================================================================

db-up: ## Start PostgreSQL container
	@echo "$(CYAN)Starting PostgreSQL...$(RESET)"
	docker-compose up -d postgres
	@echo "$(YELLOW)Waiting for PostgreSQL to be ready...$(RESET)"
	@sleep 3
	@docker-compose exec -T postgres pg_isready -U vocalbridge -d vocalbridge || (echo "$(YELLOW)Waiting a bit more...$(RESET)" && sleep 5)
	@echo "$(GREEN)PostgreSQL is ready!$(RESET)"

db-down: ## Stop PostgreSQL container
	@echo "$(CYAN)Stopping PostgreSQL...$(RESET)"
	docker-compose down

db-reset: ## Reset database (drop and recreate)
	@echo "$(YELLOW)Resetting database...$(RESET)"
	docker-compose down -v
	docker-compose up -d postgres
	@sleep 3
	@echo "$(CYAN)Running migrations...$(RESET)"
	cd packages/backend && npx prisma migrate reset --force
	@echo "$(GREEN)Database reset complete!$(RESET)"

db-migrate: ## Run database migrations
	@echo "$(CYAN)Running migrations...$(RESET)"
	cd packages/backend && npx prisma migrate dev

db-migrate-prod: ## Run migrations in production mode
	@echo "$(CYAN)Running production migrations...$(RESET)"
	cd packages/backend && npx prisma migrate deploy

db-seed: ## Seed the database with demo data
	@echo "$(CYAN)Seeding database...$(RESET)"
	cd packages/backend && npx prisma db seed
	@echo "$(GREEN)Database seeded!$(RESET)"

db-studio: ## Open Prisma Studio (database GUI)
	@echo "$(CYAN)Opening Prisma Studio...$(RESET)"
	cd packages/backend && npx prisma studio

db-generate: ## Generate Prisma client
	@echo "$(CYAN)Generating Prisma client...$(RESET)"
	cd packages/backend && npx prisma generate

# =============================================================================
# Testing
# =============================================================================

test: ## Run all tests
	@echo "$(CYAN)Running all tests...$(RESET)"
	npm run test

test-backend: ## Run backend tests
	@echo "$(CYAN)Running backend tests...$(RESET)"
	cd packages/backend && npm run test

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(RESET)"
	cd packages/backend && npm run test:watch

test-coverage: ## Run tests with coverage report
	@echo "$(CYAN)Running tests with coverage...$(RESET)"
	cd packages/backend && npm run test:coverage

# =============================================================================
# Code Quality
# =============================================================================

lint: ## Run linter on all packages
	@echo "$(CYAN)Running linter...$(RESET)"
	npm run lint

lint-fix: ## Run linter and fix issues
	@echo "$(CYAN)Fixing lint issues...$(RESET)"
	npm run lint:fix

format: ## Format code with Prettier
	@echo "$(CYAN)Formatting code...$(RESET)"
	npm run format

typecheck: ## Run TypeScript type checking
	@echo "$(CYAN)Type checking...$(RESET)"
	npm run typecheck

# =============================================================================
# Utilities
# =============================================================================

clean: ## Clean all build artifacts and node_modules
	@echo "$(YELLOW)Cleaning build artifacts...$(RESET)"
	rm -rf node_modules
	rm -rf packages/backend/node_modules
	rm -rf packages/backend/dist
	rm -rf packages/frontend/node_modules
	rm -rf packages/frontend/dist
	@echo "$(GREEN)Cleaned!$(RESET)"

logs: ## Show logs from all containers
	docker-compose logs -f

logs-db: ## Show PostgreSQL logs
	docker-compose logs -f postgres

curl-test: ## Run sample curl commands to test the API
	@echo "$(CYAN)Testing API endpoints...$(RESET)"
	@echo ""
	@echo "$(YELLOW)1. Get tenant info:$(RESET)"
	@echo 'curl -X GET http://localhost:3000/api/v1/tenants/me -H "X-API-Key: YOUR_API_KEY"'
	@echo ""
	@echo "$(YELLOW)2. List agents:$(RESET)"
	@echo 'curl -X GET http://localhost:3000/api/v1/agents -H "X-API-Key: YOUR_API_KEY"'
	@echo ""
	@echo "$(YELLOW)3. Create session:$(RESET)"
	@echo 'curl -X POST http://localhost:3000/api/v1/sessions -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '\''{"agentId": "AGENT_ID", "customerId": "customer_123"}'\'''
	@echo ""
	@echo "$(YELLOW)4. Send message:$(RESET)"
	@echo 'curl -X POST http://localhost:3000/api/v1/sessions/SESSION_ID/messages -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -H "X-Idempotency-Key: msg_001" -d '\''{"content": "Hello!"}'\'''
