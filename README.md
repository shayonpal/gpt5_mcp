# GPT-5 MCP Server

A Model Context Protocol (MCP) server that enables Claude Code to interact with OpenAI's GPT-5 model for collaborative planning and coding tasks. Features comprehensive cost management, conversation handling, and Docker support.

## ⚠️ Important Notes

**GPT-5 API Compatibility**: This server is designed for OpenAI's GPT-5 Responses API. However, the GPT-5 API has specific parameter requirements that differ from traditional chat completions:

- ❌ **temperature**: Not supported in GPT-5 Responses API  
- ❌ **max_tokens**: Not supported in GPT-5 Responses API
- ✅ **reasoning**: Supported with `effort` levels (low/medium/high)
- ✅ **instructions**: Supported for system-level guidance

**Automatic Fallback**: If GPT-5 is not available, the server automatically falls back to GPT-4 Turbo with full parameter support including temperature and max_tokens.

## Features

- 🤖 **GPT-5 Integration**: Full support for OpenAI's new Responses API with intelligent fallback to GPT-4
- 💰 **Cost Management**: Token usage tracking with configurable daily and per-task spending limits
- 📊 **Real-time Reporting**: Detailed cost breakdowns and usage analytics
- 💬 **Conversation Management**: Maintain context across multiple interactions
- 🔧 **Configurable**: Adjustable reasoning effort and comprehensive parameter handling
- 🐳 **Docker Support**: Easy containerized deployment with full parameter compatibility
- 🔒 **Secure**: Environment-based API key management
- 🛡️ **Robust Error Handling**: Comprehensive parameter validation and API compatibility checks

## Installation

### Prerequisites

- Node.js 18+ (for local installation)
- pnpm package manager (`npm install -g pnpm` or `corepack enable`)
- Docker (optional, for containerized deployment)
- OpenAI API key with GPT-5 access

### Quick Start

#### Interactive Installation (Recommended)

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
# Edit .env with your OpenAI API key
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
DEFAULT_REASONING_EFFORT=high # GPT-5 reasoning effort: low, medium, or high
MAX_TOKENS_PER_REQUEST=4000   # Used for GPT-4 fallback only (GPT-5 doesn't support max_tokens)

# Conversation Settings
MAX_CONVERSATIONS=50          # Maximum stored conversations
MAX_CONVERSATION_HISTORY=100  # Maximum messages per conversation

# Storage
DATA_DIR=./data              # Directory for persistent data
LOG_LEVEL=info               # debug, info, warn, error
```

**Parameter Usage Notes:**
- `DEFAULT_TEMPERATURE`: Only applied when falling back to GPT-4 models
- `MAX_TOKENS_PER_REQUEST`: Only applied when falling back to GPT-4 models  
- `DEFAULT_REASONING_EFFORT`: GPT-5 specific parameter for controlling reasoning depth
- GPT-5 responses are not limited by traditional token limits but by the model's natural response boundaries

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
# Edit .env and add: OPENAI_API_KEY=sk-your-actual-api-key-here
```

### Step 2: Locate Claude Desktop Configuration

The configuration file location depends on your operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`  
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Step 3: Configure Claude Desktop

Choose one of the methods below:

#### Method 1: Docker (Recommended)

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

#### Method 2: Local Installation

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

1. **Use Absolute Paths**: Always use absolute paths in the configuration file
2. **Docker Image Name**: Ensure the Docker image name matches what you built (`gpt5-mcp:latest`)
3. **Environment Variables**: For local installation, you can set environment variables directly in the config
4. **Multiple Servers**: You can add other MCP servers alongside the GPT-5 server

### Example Complete Configuration

Here's an example of a complete `claude_desktop_config.json` with the GPT-5 server:

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
        "/Users/administrator/Development/Claude/gpt5_mcp/.env",
        "gpt5-mcp:latest"
      ]
    }
  }
}

## Available Tools

### 1. `consult_gpt5`
Consult GPT-5 for assistance with planning or coding tasks.

**Parameters:**
- `prompt` (string, required): The question or task
- `context` (string, optional): Additional context
- `temperature` (number, 0-2): Sampling temperature (GPT-4 fallback only)
- `reasoning_effort` (low/medium/high): GPT-5 reasoning depth
- `max_tokens` (number): Maximum response tokens (GPT-4 fallback only)
- `task_budget` (number): Budget limit for this task

**Parameter Behavior:**
- **GPT-5**: Only `reasoning_effort` is used; `temperature` and `max_tokens` are ignored
- **GPT-4 Fallback**: All parameters are supported when GPT-5 is unavailable

**Example:**
```typescript
const response = await mcp.call('consult_gpt5', {
  prompt: 'Design a REST API for user authentication',
  temperature: 0.7,          // Used only if falling back to GPT-4
  reasoning_effort: 'high',  // Primary parameter for GPT-5
  max_tokens: 2000          // Used only if falling back to GPT-4
});
```

### 2. `start_conversation`
Start a new conversation thread with GPT-5.

**Parameters:**
- `topic` (string, required): Conversation topic
- `instructions` (string, optional): System instructions

**Example:**
```typescript
const { conversation_id } = await mcp.call('start_conversation', {
  topic: 'Building a real-time chat application',
  instructions: 'Focus on scalability and performance'
});
```

### 3. `continue_conversation`
Continue an existing conversation.

**Parameters:**
- `conversation_id` (string, required): ID from start_conversation
- `message` (string, required): Your message

**Example:**
```typescript
const response = await mcp.call('continue_conversation', {
  conversation_id: 'conv_abc123',
  message: 'What database would you recommend?'
});
```

### 4. `get_cost_report`
Get detailed cost and usage reports.

**Parameters:**
- `period` (enum, required): 'current_task', 'today', 'week', or 'month'

**Example:**
```typescript
const report = await mcp.call('get_cost_report', {
  period: 'today'
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
await mcp.call('set_cost_limits', {
  daily_limit: 20.00,
  task_limit: 5.00
});
```

## Cost Management

### Pricing Model (Estimated)

**GPT-5 Pricing:**
- **Input tokens**: $0.02 per 1K tokens
- **Output tokens**: $0.06 per 1K tokens  
- **Reasoning tokens**: $0.10 per 1K tokens (GPT-5 specific)

**GPT-4 Fallback Pricing:**
- **GPT-4 Turbo**: $0.01 input / $0.03 output per 1K tokens
- **GPT-4**: $0.03 input / $0.06 output per 1K tokens
- **GPT-3.5 Turbo**: $0.0005 input / $0.0015 output per 1K tokens

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

### Connection Issues
- Verify your OpenAI API key is valid
- Check network connectivity
- Ensure GPT-5 access is enabled for your account (server will fallback to GPT-4 if unavailable)

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
