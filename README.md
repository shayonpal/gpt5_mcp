# GPT-5 MCP Server

A Model Context Protocol (MCP) server that brings OpenAI's GPT-5 capabilities to Claude Code. Features advanced reasoning, cost management, and conversation handling with automatic GPT-4 fallback.

## Why Use This?

- **Collaborative AI**: Combine Claude's capabilities with GPT-5's advanced reasoning
- **Cost Control**: Built-in spending limits and usage tracking
- **Conversation Context**: Maintain multi-turn conversations with GPT-5
- **Automatic Fallback**: Seamlessly falls back to GPT-4 if GPT-5 is unavailable
- **File Support**: Process PDFs, images, and documents through Claude Code's @ syntax

## Prerequisites

- **OpenAI API Key** with GPT-5 access (or GPT-4 for fallback)
- **Node.js 18+** and **pnpm** (for local installation)
- **Docker** (optional, for containerized deployment)
- **Claude Code CLI** or Claude Desktop

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/andreahaku/gpt5_mcp
cd gpt5-mcp
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-your-key-here
```

### 2. Install and Build

```bash
pnpm install
pnpm run build
```

### 3. Add to Claude Code CLI

**Option A: Docker (Recommended)**
```bash
# Build Docker image
pnpm run docker:build

# Add to Claude Code
claude mcp add gpt5 -s user -- docker run --rm -i --env-file $(pwd)/.env gpt5-mcp:latest
```

**Option B: Local Installation**
```bash
# Add to Claude Code (replace with your actual path)
claude mcp add gpt5 -s user -- node /path/to/gpt5-mcp/dist/index.js
```

### 4. Restart Claude Desktop

Restart Claude Desktop to load the new MCP server.

## Alternative: Manual Configuration

Edit your Claude Desktop config file directly:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--env-file", "/absolute/path/to/.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}
```

## Configuration

### Environment Variables

Create a `.env` file with your OpenAI API key:

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional (defaults shown)
DAILY_COST_LIMIT=10.00        # Maximum daily spending (USD)
TASK_COST_LIMIT=2.00          # Maximum per-task spending
DEFAULT_REASONING_EFFORT=high # minimal, low, medium, or high
DEFAULT_VERBOSITY=medium      # low, medium, or high
```


## Available Tools

### 1. `consult_gpt5`
Get GPT-5 assistance with advanced reasoning and file support.

**Key parameters:**
- `prompt` (required): Your question or task
- `reasoning_effort`: minimal, low, medium, or high (default: high)
- `verbosity`: low, medium, or high (default: medium)
- `model`: gpt-5, gpt-5-mini, or gpt-5-nano
- `task_budget`: USD limit for this specific task

### 2. `start_conversation`
Begin a multi-turn conversation with GPT-5.

**Parameters:**
- `topic` (required): What the conversation is about
- `instructions`: Optional system-level guidance

### 3. `continue_conversation`
Continue an existing conversation thread.

**Parameters:**
- `conversation_id` (required): ID from start_conversation
- `message` (required): Your next message

### 4. `get_cost_report`
View usage statistics and costs.

**Parameters:**
- `period`: current_task, today, week, or month

### 5. `set_cost_limits`
Configure spending limits.

**Parameters:**
- `daily_limit`: Maximum daily spending in USD
- `task_limit`: Maximum per-task spending in USD

## Usage Examples

### Basic Usage
```
"Use GPT-5 to help me design a REST API for user authentication"
"Ask GPT-5 to review this code for security issues"
```

### File Analysis
```
"@config.json Ask GPT-5 to review this for security issues"
"@screenshot.png What UI improvements would GPT-5 suggest?"
```

### Multi-turn Conversations
```
"Start a GPT-5 conversation about optimizing database queries"
"Continue the conversation: What about indexing strategies?"
```


## Development Commands

```bash
# Development
pnpm run dev              # Start with hot reload
pnpm run build            # Compile TypeScript
pnpm test                 # Run tests

# Docker
pnpm run docker:build     # Build Docker image
pnpm run docker:run       # Run in Docker

# Setup
pnpm run install:setup    # Interactive installer
pnpm start               # Choose how to run (menu)
```

## Troubleshooting

### Common Issues

**Server not appearing in Claude Desktop:**
1. Verify config file location (see Alternative: Manual Configuration above)
2. Use absolute paths, not relative paths
3. Restart Claude Desktop completely (Quit → Restart)

**API Key Issues:**
- Ensure `.env` file exists with `OPENAI_API_KEY=sk-your-key`
- Key must start with `sk-`
- Server will fallback to GPT-4 if GPT-5 is unavailable

**Docker Issues:**
```bash
# Test Docker image
docker run --rm -i --env-file .env gpt5-mcp:latest

# Rebuild if needed
docker build --no-cache -t gpt5-mcp .
```

**Cost Limits:**
- Configure limits in `.env` file
- Use `get_cost_report` tool to monitor usage
- Daily default: $10, Task default: $2

## Project Structure

```
gpt5-mcp/
├── src/              # TypeScript source
├── dist/             # Compiled JavaScript
├── data/             # Persistent usage data
├── tests/            # Jest unit tests
└── docs/             # Additional documentation
```

## License

MIT License - see LICENSE file for details

## Support

For issues or questions, please open an issue on [GitHub](https://github.com/andreahaku/gpt5_mcp).

---

**Note**: This server uses OpenAI's GPT-5 Responses API when available and automatically falls back to GPT-4 with adjusted parameters if needed.
