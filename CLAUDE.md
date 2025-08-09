# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that enables Claude Code to interact with OpenAI's GPT-5 model. The server features comprehensive cost management, conversation handling, and provides 5 MCP tools for collaborative AI assistance.

## Development Commands

```bash
# Package management (uses pnpm)
pnpm install                 # Install dependencies
pnpm run build              # Compile TypeScript to dist/
pnpm run dev                # Development mode with hot reload
pnpm start                  # Interactive launcher (choose local/Docker/dev)
pnpm run clean              # Remove build artifacts

# Testing
pnpm test                   # Run all Jest tests
pnpm run test:watch         # Watch mode for testing
pnpm run test:coverage      # Generate coverage report
jest tests/cost-manager.test.ts  # Run specific test file

# Docker
pnpm run docker:build       # Build Docker image
pnpm run docker:run         # Run in Docker container

# Setup
pnpm run install:setup      # Interactive installation wizard
```

## Architecture Overview

### Core Components (src/)

**MCP Server (`index.ts`)**: Main entry point that initializes and orchestrates the three core managers:
- Registers 5 MCP tools: `consult_gpt5`, `start_conversation`, `continue_conversation`, `get_cost_report`, `set_cost_limits`
- Uses Zod schemas for input validation and zodToJsonSchema for MCP tool definitions
- Handles Winston logging and environment validation

**OpenAI Client (`openai-client.ts`)**: Wrapper for OpenAI API with GPT-5 Responses API support:
- Primary: Uses new `client.responses.create()` endpoint for GPT-5
- Fallback: Automatically falls back to `chat.completions.create()` for GPT-4 models
- Calculates token usage costs based on input/output/reasoning tokens
- Configurable temperature (default 0.7) and reasoning effort (default 'high')

**Cost Manager (`cost-manager.ts`)**: Token usage tracking and spending limits:
- Persistent storage in `./data/usage.json` with automatic cleanup (30-day retention)
- Enforces daily ($10 default) and per-task ($2 default) spending limits
- Provides detailed cost reports and warnings at 80% of limits
- Thread-safe usage recording with task ID tracking

**Conversation Manager (`conversation.ts`)**: Multi-turn conversation context:
- Maintains conversation threads with unique IDs (`conv_timestamp_random`)
- Preserves developer instructions as first message (role: 'developer')
- Automatic message trimming (max 100 messages per conversation, max 50 conversations)
- Export/import functionality for conversation persistence

### Data Flow

1. **MCP Request** → Zod validation → Tool handler
2. **Tool Handler** → Cost check → OpenAI API call → Cost recording → Response
3. **Conversation Tools** → Context retrieval → API formatting → Response storage

### Environment Configuration

Required: `OPENAI_API_KEY`
Cost limits: `DAILY_COST_LIMIT`, `TASK_COST_LIMIT` 
Model settings: `DEFAULT_TEMPERATURE`, `DEFAULT_REASONING_EFFORT`, `MAX_TOKENS_PER_REQUEST`

## Key Implementation Details

### Cost Management
- Token pricing: Input $0.02/1K, Output $0.06/1K, Reasoning $0.10/1K (GPT-5 estimated)
- Usage tracked by task ID and daily totals
- Persistent across server restarts via JSON file storage

### MCP Integration
- Uses stdio transport for Claude Desktop communication  
- Tools return `{ content: [result] }` format as per MCP specification
- Input schemas auto-generated from Zod definitions

### OpenAI API Handling
- Detects GPT-5 availability and falls back gracefully to GPT-4 models
- Handles both string and message array inputs
- Extracts text from complex response formats (`output_text` or parsed output array)

### Conversation Context
- API format: Excludes developer messages from input array, returns as `instructions` parameter
- Context retrieval: Always includes developer instructions + recent messages (configurable limit)
- Message roles: 'user', 'assistant', 'developer' (developer instructions are system-level)

## Testing Strategy

Tests use Jest with ts-jest preset. Mock external dependencies (fs, OpenAI client).

Key test areas:
- Cost limit enforcement and usage recording
- Conversation lifecycle and context management  
- Token usage calculations and cost reporting
- Error handling and edge cases

## Deployment

Interactive scripts handle setup:
- `./install.sh`: Complete installation wizard with Claude Desktop integration
- `./start.sh`: Runtime launcher with local/Docker/dev options
- Docker: Multi-stage build with pnpm, runs as non-root user with persistent data volume