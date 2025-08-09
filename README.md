# GPT-5 MCP Server

A Model Context Protocol (MCP) server that enables Claude Code to interact with OpenAI's GPT-5 Responses API for advanced reasoning, coding assistance, and collaborative planning. Features intelligent model selection, comprehensive cost management, conversation handling, file processing, and Docker support.

## 🚀 Claude Code Quick Start

**Already using Claude Code? Get GPT-5 integration in 3 minutes:**

1. **One-command setup** (Docker):
```bash
git clone <repository-url> && cd gpt5-mcp
cp .env.example .env
# Edit .env: OPENAI_API_KEY=sk-your-key-here
pnpm install && pnpm run docker:build
claude mcp add gpt5 -s user -- docker run --rm -i --env-file $(pwd)/.env gpt5-mcp:latest
```

2. **Restart Claude Desktop** to load the server

3. **Verify integration**: You should see these tools available:
   - `consult_gpt5` - Get GPT-5 assistance with advanced reasoning
   - `start_conversation` - Begin multi-turn GPT-5 conversations  
   - `continue_conversation` - Continue GPT-5 conversations
   - `get_cost_report` - Monitor API usage and costs
   - `set_cost_limits` - Configure spending limits

4. **Test it**: Try asking Claude Code: *"Use GPT-5 to help me design a REST API for user authentication"*

**Alternative installations**: [NPX](#option-1-npx-quickstart) | [Local build](#manual-installation) | [Interactive setup](#option-2-interactive-installation)

## ⚠️ Important Requirements

**OpenAI API Key Required**: This server requires a valid OpenAI API key with GPT-5 access. The key must be configured in the `.env` file as:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**GPT-5 Responses API Compatibility**: This server uses OpenAI's new GPT-5 Responses API with advanced features:

- ✅ **reasoning.effort**: Controls reasoning depth - `minimal`, `low`, `medium`, `high`
- ✅ **text.verbosity**: Controls response length - `low`, `medium`, `high`
- ✅ **instructions**: System-level guidance and developer instructions
- ✅ **file inputs**: Direct support for PDFs, images, and documents via `input_file` type
- ✅ **model variants**: Full support for `gpt-5`, `gpt-5-mini`, and `gpt-5-nano`
- ❌ **temperature**: Not supported in GPT-5 Responses API (fallback only)
- ❌ **max_tokens**: Not supported in GPT-5 Responses API (fallback only)

**Automatic Fallback**: If GPT-5 is unavailable, the server automatically falls back to GPT-4o → GPT-4o-mini → GPT-4 with full parameter compatibility.

## Features

- 🧠 **Advanced GPT-5 Reasoning**: Full Responses API support with `minimal`, `low`, `medium`, and `high` reasoning effort
- 📝 **Verbosity Control**: Configurable response length from concise to detailed explanations
- 📁 **File Processing**: Direct support for PDFs, images, and documents via GPT-5's native file inputs
- 🎯 **Model Selection**: Intelligent routing across `gpt-5`, `gpt-5-mini`, and `gpt-5-nano` based on task requirements
- 💰 **Cost Management**: Token usage tracking with configurable daily and per-task spending limits
- 📊 **Real-time Analytics**: Detailed cost breakdowns, reasoning token usage, and performance metrics
- 💬 **Conversation Management**: Maintain context across multi-turn interactions with CoT preservation
- 🔄 **Fallback Architecture**: Automatic GPT-4 fallback with parameter compatibility
- 🐳 **Docker Support**: Easy containerized deployment with production-ready configuration
- 🔒 **Enterprise Security**: Environment-based API key management and input validation

## Installation

### Prerequisites

- Node.js 18+ (for local installation)
- pnpm package manager (`npm install -g pnpm` or `corepack enable`)
- Docker (optional, for containerized deployment)
- **OpenAI API key with GPT-5 access** - Required and must be set in `.env` file

### Installation Options

#### Option 1: NPX Quickstart

**Fastest way to try GPT-5 MCP server:**

```bash
# Install globally and run
npx gpt5-mcp-server --check  # Verify environment
npx gpt5-mcp-server --stdio  # Run server

# Add to Claude Code settings.json:
{
  "claude.mcpServers": {
    "gpt5": {
      "command": "npx",
      "args": ["gpt5-mcp-server", "--stdio"],
      "env": {
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "DAILY_COST_LIMIT": "10.00"
      }
    }
  }
}
```

#### Option 2: Claude Code CLI (Docker)

If you have Claude Code CLI installed:

```bash
# Clone and setup
git clone <repository-url>
cd gpt5-mcp
cp .env.example .env

# IMPORTANT: Edit .env and add your OpenAI API key:
# OPENAI_API_KEY=sk-your-actual-api-key-here

# Build the Docker image
pnpm install && pnpm run build
pnpm run docker:build

# Add to Claude Code (this configures but doesn't start the server)
claude mcp add gpt5 -s user -- docker run --rm -i --env-file /absolute/path/to/your/gpt5_mcp/.env gpt5-mcp:latest

# Restart Claude Desktop to load the new server
```

#### Option 2: Interactive Installation

```bash
# Clone the repository
git clone <repository-url>
cd gpt5-mcp

# Run the interactive installer
pnpm run install:setup

# Start the server with menu selection
pnpm start
# or
pnpm run start:local
```

The installer will:

- Set up your environment configuration
- Help you add your OpenAI API key
- Build the project (local or Docker)
- Configure Claude Desktop integration
- Test the installation

#### Manual Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd gpt5-mcp
```

2. Install dependencies:

```bash
pnpm install
```

3. Configure environment:

```bash
cp .env.example .env
# IMPORTANT: Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-actual-api-key-here
```

4. Build the project:

```bash
pnpm run build
```

5. Run the server:

```bash
# Interactive menu to choose how to run
pnpm start

# Or directly:
pnpm run dev              # Development mode with hot reload
node dist/index.js        # Production mode
pnpm run docker:run       # Docker mode
```

### Docker Installation

Build and run with Docker:

```bash
# Build the image
docker build -t gpt5-mcp .
# or
pnpm run docker:build

# Run the container
docker run --rm -i --env-file .env gpt5-mcp
# or
pnpm run docker:run
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Cost Limits (USD)
DAILY_COST_LIMIT=10.00       # Maximum daily spending
TASK_COST_LIMIT=2.00         # Maximum per-task spending

# Model Settings
DEFAULT_TEMPERATURE=0.7       # Used for GPT-4 fallback only (GPT-5 doesn't support temperature)
DEFAULT_REASONING_EFFORT=high # GPT-5 reasoning effort: minimal, low, medium, or high
DEFAULT_VERBOSITY=medium      # GPT-5 response verbosity: low, medium, or high

# Conversation Settings
MAX_CONVERSATIONS=50          # Maximum stored conversations
MAX_CONVERSATION_HISTORY=100  # Maximum messages per conversation

# Storage
DATA_DIR=./data              # Directory for persistent data
LOG_LEVEL=info               # debug, info, warn, error
```

**Parameter Usage Notes:**

- `DEFAULT_REASONING_EFFORT`: GPT-5 reasoning depth - `minimal` for speed, `high` for complex problems
- `DEFAULT_VERBOSITY`: Controls response length - `low` for concise, `high` for detailed explanations
- `DEFAULT_TEMPERATURE`: Only applied when falling back to GPT-4 models
- GPT-5 responses adapt naturally to task complexity rather than fixed token limits

## Integration with Claude Code

### Step 1: Prepare the Server

Before configuring Claude Desktop, ensure your server is ready:

```bash
# For Docker method: Build the image
pnpm run docker:build
# or
docker build -t gpt5-mcp .

# For Local method: Build the project
pnpm run build

# Ensure your .env file has your OpenAI API key
cp .env.example .env
# IMPORTANT: Edit .env and add your OpenAI API key:
# OPENAI_API_KEY=sk-your-actual-api-key-here
```

### Step 2: Locate Claude Desktop Configuration

The configuration file location depends on your operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Step 3: Configure Claude Desktop

Choose one of the methods below:

#### Method 1: Claude Code CLI Command (Easiest)

If you have Claude Code CLI installed, you can add the server configuration with a single command:

**Prerequisites:**

- Docker image must be built first: `pnpm run docker:build`
- `.env` file must exist with your OpenAI API key

```bash
claude mcp add gpt5 -s user -- docker run --rm -i --env-file /absolute/path/to/your/gpt5_mcp/.env gpt5-mcp:latest
```

**Example:**

```bash
# Replace with your actual path
claude mcp add gpt5 -s user -- docker run --rm -i --env-file /Users/administrator/Development/Claude/gpt5_mcp/.env gpt5-mcp:latest
```

**Important:** This command adds the server configuration to Claude Desktop. The Docker container will be started automatically when Claude Desktop needs to use the server. You still need to restart Claude Desktop after running this command.

#### Method 2: Manual Docker Configuration

Add this configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env-file",
        "/absolute/path/to/your/gpt5_mcp/.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}
```

**Important**: Replace `/absolute/path/to/your/gpt5_mcp/.env` with the actual absolute path to your `.env` file.

**Example for macOS/Linux**:

```json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env-file",
        "/Users/yourusername/path/to/gpt5_mcp/.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}
```

**Example for Windows**:

```json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env-file",
        "C:\\Users\\yourusername\\path\\to\\gpt5_mcp\\.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}
```

#### Method 3: Local Installation

```json
{
  "mcpServers": {
    "gpt5": {
      "command": "node",
      "args": ["/absolute/path/to/gpt5-mcp/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-your-actual-api-key-here",
        "DAILY_COST_LIMIT": "10.00",
        "TASK_COST_LIMIT": "2.00"
      }
    }
  }
}
```

### Step 4: Restart Claude Desktop

Close and restart Claude Desktop completely to load the new MCP server configuration.

### Step 5: Verify Integration

After restart, you should see the GPT-5 tools available in Claude Code:

- `consult_gpt5` - Get assistance from GPT-5
- `start_conversation` - Begin a conversation thread
- `continue_conversation` - Continue an existing conversation
- `get_cost_report` - View usage and costs
- `set_cost_limits` - Configure spending limits

### Alternative: Automated Setup

#### Option 1: Claude Code CLI (Recommended)

```bash
# First build the Docker image
pnpm run docker:build

# Then add to Claude Code (configures but doesn't start the server)
claude mcp add gpt5 -s user -- docker run --rm -i --env-file /absolute/path/to/your/gpt5_mcp/.env gpt5-mcp:latest

# Restart Claude Desktop to load the server configuration
```

#### Option 2: Interactive Setup Script

Use the interactive setup script for automatic configuration:

```bash
# Run the interactive installer
pnpm run install:setup
```

This script will:

- Guide you through environment setup
- Build the Docker image or local installation
- Automatically configure Claude Desktop for your OS
- Test the integration
- Provide troubleshooting guidance

### Configuration Tips

1. **Claude Code CLI**: Use `claude mcp add` command for the easiest setup (requires Docker image to be built first)
2. **Use Absolute Paths**: Always use absolute paths in configuration files and CLI commands
3. **Docker Image Name**: Ensure the Docker image name matches what you built (`gpt5-mcp:latest`)
4. **Environment Variables**: For local installation, you can set environment variables directly in the config
5. **Multiple Servers**: You can add other MCP servers alongside the GPT-5 server
6. **CLI Benefits**: The CLI command automatically handles JSON formatting and path validation
7. **Server Startup**: Claude Desktop starts the Docker container automatically when needed - no need to run containers manually

### Example Complete Configuration

Here's an example of a complete `claude_desktop_config.json` with the GPT-5 server:

````json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--env-file",
        "/Users/administrator/Development/Claude/gpt5_mcp/.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}

## File Processing & Input Types

This MCP server supports GPT-5's native file processing capabilities through Claude Code's @ syntax:

### Supported File Types
- **PDFs**: Research papers, documentation, reports, legal documents
- **Images**: Screenshots, diagrams, charts, code snippets
- **Text Files**: Configuration files, logs, code files, markdown
- **Office Documents**: Word docs, spreadsheets (converted to text)

### Usage Examples
```bash
# In Claude Code, use @ syntax to attach files:
@README.md Help me improve this documentation
@screenshot.png What UI elements do you see in this interface?
@analysis.pdf Summarize the key findings from this research
@config.json Review this configuration for security issues
````

### File Processing Features

- **Automatic Format Detection**: Server intelligently handles different file types
- **Content Extraction**: Text, tables, and structure preserved from PDFs
- **Image Analysis**: Visual elements, text recognition, and contextual understanding
- **Large File Handling**: Efficient processing of multi-page documents
- **Security**: Files processed securely without persistent storage

## 📚 End-to-End Examples

### Example 1: Quick Code Generation

**In Claude Code, try this:**

*Prompt*: "Generate a TypeScript function for validating email addresses with regex"

**Expected workflow:**
1. Claude Code calls `consult_gpt5` tool automatically
2. GPT-5 generates clean, well-documented code
3. Response appears directly in Claude Code chat

```typescript
// GPT-5 will generate something like:
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
}
```

### Example 2: Complex Architecture Design

**In Claude Code, try this:**

*Prompt*: "Design a scalable microservices architecture for an e-commerce platform. Consider authentication, inventory, orders, and payments."

**What happens:**
1. Claude Code invokes GPT-5 with `reasoning_effort: "high"`
2. GPT-5 analyzes requirements with deep reasoning
3. Returns detailed architecture with diagrams, trade-offs, and implementation notes
4. Includes specific technology recommendations and scaling strategies

### Example 3: File Analysis with @syntax

**In Claude Code:**

*Prompt*: `@config.json Review this configuration for security issues and performance optimizations`

**Expected workflow:**
1. Claude Code automatically attaches the file content
2. GPT-5 receives and analyzes the full file
3. Returns specific security recommendations and performance improvements
4. Provides concrete code suggestions for fixes

### Example 4: Multi-turn Problem Solving

**Start a conversation:**
*Prompt*: "I need to optimize my React app's performance. Start by analyzing the component structure."

**Continue the conversation:**
*Prompt*: "Now suggest specific optimizations for the UserList component you mentioned."

**What happens:**
1. First request starts a GPT-5 conversation thread
2. Context is maintained across multiple interactions
3. GPT-5 builds on previous analysis
4. Provides increasingly specific, contextual recommendations

## Available Tools

### 1. `consult_gpt5`

Consult GPT-5 for advanced reasoning, coding assistance, and complex problem solving with file support.

**Parameters:**

- `prompt` (string, required): The question or task
- `context` (string, optional): Additional context
- `reasoning_effort` (minimal/low/medium/high): Controls reasoning depth and speed
- `verbosity` (low/medium/high): Controls response length and detail level
- `model` (string, optional): Choose specific variant - `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- `temperature` (number, 0-2): Sampling temperature (GPT-4 fallback only)
- `max_tokens` (number): Maximum response tokens (GPT-4 fallback only)
- `task_budget` (number): Budget limit for this task

**Reasoning Effort Levels:**

- **minimal**: Fastest responses, minimal reasoning tokens, ideal for simple tasks
- **low**: Balanced speed and reasoning for straightforward problems
- **medium**: Standard reasoning depth for most tasks (default)
- **high**: Maximum reasoning power for complex, multi-step problems

**Verbosity Levels:**

- **low**: Concise, direct answers
- **medium**: Balanced explanations (default)
- **high**: Detailed, comprehensive responses with examples

**File Support**: Automatically processes attached files (PDFs, images, documents) through Claude Code's @ syntax

**Examples:**

**Quick Code Generation:**

```typescript
const response = await mcp.call("consult_gpt5", {
  prompt: "Write a Python function to validate email addresses",
  reasoning_effort: "minimal", // Fast, direct code generation
  verbosity: "low", // Concise code with minimal comments
  model: "gpt-5-mini", // Cost-effective for simple tasks
});
```

**Complex Problem Solving:**

```typescript
const response = await mcp.call("consult_gpt5", {
  prompt:
    "Design a scalable microservices architecture for an e-commerce platform",
  reasoning_effort: "high", // Deep analysis and reasoning
  verbosity: "high", // Detailed explanations with examples
  model: "gpt-5", // Full model for complex reasoning
  task_budget: 5.0, // Higher budget for complex tasks
});
```

**File Analysis:**

```typescript
// Use with Claude Code @ syntax: @document.pdf
const response = await mcp.call("consult_gpt5", {
  prompt: "Summarize the key findings and recommendations",
  reasoning_effort: "medium",
  verbosity: "medium",
  // Files attached via @ syntax are automatically processed
});
```

### 2. `start_conversation`

Start a new conversation thread with GPT-5.

**Parameters:**

- `topic` (string, required): Conversation topic
- `instructions` (string, optional): System instructions

**Example:**

```typescript
const { conversation_id } = await mcp.call("start_conversation", {
  topic: "Building a real-time chat application",
  instructions: "Focus on scalability and performance",
});
```

### 3. `continue_conversation`

Continue an existing conversation.

**Parameters:**

- `conversation_id` (string, required): ID from start_conversation
- `message` (string, required): Your message

**Example:**

```typescript
const response = await mcp.call("continue_conversation", {
  conversation_id: "conv_abc123",
  message: "What database would you recommend?",
});
```

### 4. `get_cost_report`

Get detailed cost and usage reports.

**Parameters:**

- `period` (enum, required): 'current_task', 'today', 'week', or 'month'

**Example:**

```typescript
const report = await mcp.call("get_cost_report", {
  period: "today",
});
// Returns: total cost, token usage, remaining budget
```

### 5. `set_cost_limits`

Configure spending limits dynamically.

**Parameters:**

- `daily_limit` (number, optional): Daily spending cap in USD
- `task_limit` (number, optional): Per-task spending cap in USD

**Example:**

```typescript
await mcp.call("set_cost_limits", {
  daily_limit: 20.0,
  task_limit: 5.0,
});
```

## GPT-5 Model Variants

Choose the right GPT-5 model for your specific use case:

### Model Selection Guide

| Variant        | Best For                                 | Use Cases                                                        | Cost        |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------- | ----------- |
| **gpt-5**      | Complex reasoning, broad world knowledge | Multi-step problem solving, code architecture, research analysis | Standard    |
| **gpt-5-mini** | Cost-optimized reasoning and chat        | Balanced tasks requiring reasoning but cost-sensitive            | 80% cheaper |
| **gpt-5-nano** | High-throughput, simple tasks            | Classification, simple instructions, basic code generation       | 96% cheaper |

### When to Use Each Model

**gpt-5 (Full Model):**

- Complex software architecture decisions
- Multi-step problem solving with dependencies
- Research analysis requiring broad knowledge
- Code refactoring with business logic understanding

**gpt-5-mini:**

- Code reviews and optimization suggestions
- Technical documentation generation
- Debugging with contextual analysis
- API design and integration planning

**gpt-5-nano:**

- Code completion and simple generation
- Text classification and data extraction
- Format conversion and validation
- Quick questions with direct answers

## Cost Management

### Pricing Model (Official OpenAI Standard Tier Rates)

**GPT-5 Pricing (per 1M tokens):**

- **Input tokens**: $1.25 per 1M tokens ($0.00125 per 1K tokens)
- **Output tokens**: $10.00 per 1M tokens ($0.01 per 1K tokens)
- **Cached input**: $0.125 per 1M tokens ($0.000125 per 1K tokens)

**Alternative GPT-5 Models:**

- **GPT-5 Mini**: $0.25 input / $2.00 output per 1M tokens (80% cost reduction)
- **GPT-5 Nano**: $0.05 input / $0.40 output per 1M tokens (96% cost reduction)

**GPT-4 Fallback Pricing (per 1M tokens):**

- **GPT-4o**: $2.50 input / $10.00 output per 1M tokens (primary fallback)
- **GPT-4o-mini**: $0.15 input / $0.60 output per 1M tokens (most cost-effective)
- **GPT-4 Turbo**: $10.00 input / $30.00 output per 1M tokens
- **GPT-4 (legacy)**: $30.00 input / $60.00 output per 1M tokens
- **GPT-3.5 Turbo**: $0.50 input / $1.50 output per 1M tokens

**Cost Comparison**: GPT-5 is significantly more cost-effective than originally estimated. GPT-4o-mini remains the most economical fallback option at 6x cheaper input costs than GPT-5.

**Processing Tiers Available**:

- **Batch**: 50% discount (slower processing)
- **Flex**: 50% discount (variable latency)
- **Standard**: Listed prices (normal processing)
- **Priority**: 2x cost (faster processing)

_See `docs/openai_api_costs.md` for complete pricing details across all tiers and models._

### Cost Controls

- **Daily limits**: Prevent exceeding daily budget
- **Task limits**: Cap spending per individual task
- **Model-aware pricing**: Accurate cost calculation based on actual model used
- **Warnings**: Alerts when approaching limits (80% threshold)
- **Fallback cost tracking**: Separate tracking for GPT-4/3.5 usage when GPT-5 unavailable

### Persistent Tracking

- Cost data is saved to `./data/usage.json`
- Model-specific usage statistics (GPT-5 vs GPT-4 fallback)
- Reasoning token usage tracking (GPT-5 only)
- Survives server restarts
- 30-day retention period
- Automatic cleanup of old data

## Development

### Project Structure

```
gpt5-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── openai-client.ts   # OpenAI API wrapper
│   ├── cost-manager.ts    # Cost tracking and limits
│   ├── conversation.ts    # Conversation management
│   └── types.ts          # TypeScript interfaces
├── tests/                 # Jest unit tests
├── docs/
│   ├── openai_api_costs.md # Complete OpenAI pricing reference
│   └── *.md              # Additional documentation
├── dist/                  # Compiled JavaScript
├── data/                  # Persistent storage
├── Dockerfile            # Docker configuration
└── jest.config.js        # Jest configuration
```

### Running Tests

```bash
pnpm test                  # Run all tests
pnpm run test:watch       # Watch mode
pnpm run test:coverage    # Generate coverage report
```

### Development Mode

```bash
pnpm run dev              # Start with hot reload
```

### Building

```bash
pnpm run build            # Compile TypeScript
pnpm run clean            # Remove build artifacts
```

## Troubleshooting

### Quick Diagnostics

**Health Check Command:**
```bash
# Test your setup before integrating with Claude Code
pnpm run docker:build && docker run --rm -i --env-file .env gpt5-mcp:latest --check

# Or for local installation:
pnpm run build && node dist/index.js --check
```

**Expected output:**
```
✅ OpenAI API connection successful
✅ GPT-5 access confirmed (or fallback to GPT-4)  
✅ MCP server ready (stdio transport)
✅ Cost limits configured: Daily $10.00, Task $2.00
```

### Claude Code Integration Issues

**Server not visible in Claude Desktop:**

1. **Check configuration file location:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Validate JSON syntax:**
   ```bash
   # Test your config file
   jq . ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. **Common config mistakes:**
   ```json
   // ❌ Wrong: Relative paths
   "command": "./dist/index.js"
   
   // ✅ Correct: Absolute paths
   "command": "/Users/you/projects/gpt5-mcp/dist/index.js"
   ```

4. **Restart Claude Desktop completely** (Quit → Restart, not just refresh)

**Tools not appearing:**
- Verify server appears in MCP panel
- Check for error messages in Claude Desktop logs
- Ensure OpenAI API key is valid and has GPT-5 access

### Connection Issues

- **Verify your OpenAI API key is valid** and set in `.env` file as `OPENAI_API_KEY=sk-your-key`
- **Check API key format**: Must start with `sk-` and be the full key from OpenAI
- **Verify GPT-5 access**: Ensure GPT-5 access is enabled for your account (server will fallback to GPT-4 if unavailable)
- **Check network connectivity**: Ensure the server can reach api.openai.com
- **Test API key**: You can test with: `docker run --rm -i --env-file .env gpt5-mcp:latest`

### Parameter Errors

**GPT-5 API Parameter Issues:**

- ❌ `Unknown parameter: 'max_tokens'` - This is expected for GPT-5, server will fallback to GPT-4
- ❌ `Unsupported parameter: 'temperature'` - This is expected for GPT-5, server will fallback to GPT-4
- ✅ Server automatically handles parameter compatibility between GPT-5 and GPT-4 APIs

### Cost Overruns

- Review daily/task limits in `.env`
- Check cost reports with `get_cost_report`
- Note: GPT-5 doesn't respect `max_tokens` limits - use `task_budget` instead
- Monitor reasoning token usage for GPT-5 (can be significant)

### Docker Issues

```bash
# View logs
docker logs <container-id>

# Check container status
docker ps

# Rebuild image after fixes
docker build --no-cache -t gpt5-mcp .

# Test connection manually
docker run --rm -i --env-file .env gpt5-mcp:latest
```

### MCP Connection Issues

**Server not appearing in Claude Code:**

1. Verify Claude Desktop configuration file location and format
2. Ensure JSON syntax is correct (use a JSON validator)
3. Check that all paths are absolute, not relative
4. Restart Claude Desktop completely after configuration changes

**Docker-specific issues:**

```bash
# Test Docker image exists
docker images | grep gpt5-mcp

# Test Docker run manually
docker run --rm -i --env-file .env gpt5-mcp:latest

# Check Docker permissions
docker ps
```

**Environment variable issues:**

- Verify `.env` file exists and has correct API key format (`sk-...`)
- Ensure absolute path to `.env` file in Docker configuration
- Check file permissions on `.env` file

**Testing the connection:**

```bash
# Test server locally first
pnpm start
# Choose option 1 (Local) and verify it starts without errors

# Test Docker separately
pnpm run docker:run
# Should start and show "GPT-5 MCP Server is running"
```

## Security

- **API Keys**: Never commit `.env` files
- **Docker**: Runs as non-root user
- **Input Validation**: All inputs are validated with Zod schemas
- **Cost Limits**: Prevents unexpected charges
- **Data Privacy**: No sensitive data is logged

## Monitoring

### Logs

- Console output in development
- JSON format in production
- Configurable log levels

### Metrics Tracked

- Request latency
- Token usage per request
- Cost accumulation
- Error rates
- Conversation duration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:

- Open an issue on GitHub
- Check existing issues first
- Include relevant logs and configuration

## Implementation Notes

### Differences from Original Requirements

**Package Manager**: Changed from npm/jest to **pnpm** as requested by user for better performance and space efficiency.

**GPT-5 API Compatibility**:

- **Original assumption**: GPT-5 would support standard parameters like `temperature` and `max_tokens`
- **Reality discovered**: GPT-5 Responses API has a different parameter structure
- **Solution implemented**: Robust parameter handling with automatic fallback architecture

**Testing Framework**:

- **Original**: Included vitest for Vue.js style testing
- **Corrected**: Switched to Jest for Node.js applications as requested

**Docker Implementation**:

- **Challenge**: Multi-stage builds with pnpm lifecycle scripts
- **Solution**: Careful management of prepare scripts and build dependencies

**Error Handling**: Enhanced beyond original scope to handle GPT-5 API parameter differences gracefully.

## Roadmap

### Version 1.1 (Planned)

- [ ] Streaming response support (when GPT-5 API supports it)
- [ ] Enhanced multi-model support (GPT-4, Claude, custom models)
- [ ] Web UI for monitoring GPT-5 vs GPT-4 usage
- [ ] Conversation templates with reasoning effort presets

### Version 1.2 (Future)

- [ ] Team collaboration features with shared budgets
- [ ] Advanced analytics dashboard for reasoning token usage
- [ ] Plugin system for custom model integrations
- [ ] Webhook notifications for cost limit alerts

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Powered by [OpenAI API](https://platform.openai.com/)
- Inspired by the MCP ecosystem

---

## Version History

**v1.0.0** - Initial release with complete GPT-5 Responses API integration

- ✅ Full GPT-5 Responses API support with parameter compatibility
- ✅ Intelligent fallback to GPT-4 Turbo/GPT-4/GPT-3.5
- ✅ Robust parameter handling (temperature/max_tokens for fallback only)
- ✅ pnpm package manager integration
- ✅ Docker multi-stage builds with lifecycle script management
- ✅ Comprehensive cost management with model-aware pricing
- ✅ Interactive setup and launcher scripts
- ✅ Reasoning token usage tracking (GPT-5 specific)

**Note**: This server is optimized for GPT-5's Responses API structure. If GPT-5 is not available, it automatically falls back to GPT-4 Turbo with full parameter compatibility and adjusted pricing.# gpt5_mcp
