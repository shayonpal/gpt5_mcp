# GPT-5 MCP Server Development Plan

## Executive Summary
Development of a Model Context Protocol (MCP) server to enable Claude Code to interact with OpenAI's GPT-5 model for collaborative planning and coding tasks. The server will be built using Node.js/TypeScript, support Docker deployment, and include comprehensive cost management and reporting features.

## Project Overview

### Goals
1. Enable Claude Code to consult with GPT-5 for planning and coding tasks
2. Support bidirectional communication between Claude Code and GPT-5
3. Implement robust cost controls and usage reporting
4. Provide Docker containerization for easy deployment
5. Support configurable API parameters (temperature, reasoning effort)

### Key Features
- **GPT-5 Integration**: Full support for OpenAI's new Responses API
- **Cost Management**: Token usage caps (per-task and daily limits)
- **Real-time Cost Reporting**: Estimated costs for each interaction
- **Configurable Parameters**: Temperature, reasoning effort, and other model settings
- **Conversation Management**: Maintain context across multiple interactions
- **Docker Support**: Containerized deployment with environment variable configuration
- **Security**: Secure API key management via .env files

## Technical Architecture

### Technology Stack
- **Language**: TypeScript/Node.js
- **MCP SDK**: @modelcontextprotocol/sdk
- **OpenAI SDK**: openai (official SDK)
- **Build Tools**: TypeScript compiler, npm
- **Containerization**: Docker with multi-stage builds
- **Environment Management**: dotenv for API key handling

### API Integration Analysis

Based on the GPT-5 documentation (`gtp5.md`), the new OpenAI API uses:

#### 1. Responses API Structure
```javascript
client.responses.create({
  model: "gpt-5",
  input: "prompt or message array",
  instructions: "optional system instructions",
  reasoning: { effort: "low" | "medium" | "high" },
  tools: [], // optional tools array
  stream: false // optional streaming
})
```

#### 2. Key Differences from Previous APIs
- Uses `responses.create()` instead of `chat.completions.create()`
- `input` parameter instead of `messages`
- `output_text` property for accessing text responses
- New `reasoning` parameter for controlling reasoning effort
- Built-in MCP support via tools array

#### 3. Message Roles
- `developer`: High-priority system instructions
- `user`: User input
- `assistant`: Model responses

### Cost Management Architecture

#### Token Usage Tracking
```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number; // GPT-5 specific
  totalTokens: number;
  estimatedCost: number;
}

interface CostLimits {
  perTask?: number;      // Max USD per task
  daily?: number;         // Max USD per day
  tokenLimit?: number;    // Max tokens per request
}
```

#### Pricing Model (Estimated)
```typescript
const PRICING = {
  'gpt-5': {
    input: 0.02,      // per 1K tokens
    output: 0.06,     // per 1K tokens
    reasoning: 0.10   // per 1K reasoning tokens
  }
};
```

### MCP Server Architecture

#### Tool Definitions
```typescript
const tools = [
  {
    name: "consult_gpt5",
    description: "Consult GPT-5 for planning or coding assistance",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        context: { type: "string", optional: true },
        temperature: { type: "number", default: 0.7 },
        reasoning_effort: { 
          type: "string", 
          enum: ["low", "medium", "high"],
          default: "high"
        },
        max_tokens: { type: "number", default: 4000 },
        task_budget: { type: "number", optional: true }
      }
    }
  },
  {
    name: "start_conversation",
    description: "Start a new conversation with GPT-5",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        instructions: { type: "string", optional: true }
      }
    }
  },
  {
    name: "continue_conversation",
    description: "Continue an existing conversation",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        message: { type: "string" }
      }
    }
  },
  {
    name: "get_cost_report",
    description: "Get current cost usage report",
    inputSchema: {
      type: "object",
      properties: {
        period: { 
          type: "string",
          enum: ["current_task", "today", "week", "month"]
        }
      }
    }
  },
  {
    name: "set_cost_limits",
    description: "Configure cost limits",
    inputSchema: {
      type: "object",
      properties: {
        daily_limit: { type: "number", optional: true },
        task_limit: { type: "number", optional: true }
      }
    }
  }
];
```

## Implementation Plan

### Phase 1: Project Setup and Core Infrastructure
1. **Initialize Project Structure**
   ```
   gpt5-mcp/
   ├── src/
   │   ├── index.ts           # MCP server entry point
   │   ├── openai-client.ts   # OpenAI API wrapper
   │   ├── cost-manager.ts    # Cost tracking and limits
   │   ├── conversation.ts    # Conversation management
   │   ├── types.ts          # TypeScript interfaces
   │   └── utils.ts          # Utility functions
   ├── tests/
   │   ├── openai-client.test.ts
   │   ├── cost-manager.test.ts
   │   └── integration.test.ts
   ├── docker/
   │   └── Dockerfile
   ├── .env.example
   ├── .gitignore
   ├── package.json
   ├── tsconfig.json
   ├── README.md
   └── docker-compose.yml
   ```

2. **Package.json Configuration**
   ```json
   {
     "name": "@gpt5/mcp-server",
     "version": "1.0.0",
     "type": "module",
     "bin": {
       "gpt5-mcp": "dist/index.js"
     },
     "scripts": {
       "build": "tsc && chmod +x dist/*.js",
       "dev": "tsx watch src/index.ts",
       "test": "vitest",
       "docker:build": "docker build -t gpt5-mcp .",
       "docker:run": "docker run --env-file .env gpt5-mcp"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^0.5.0",
       "openai": "^4.0.0",
       "dotenv": "^16.0.0",
       "zod": "^3.22.0",
       "winston": "^3.11.0"
     }
   }
   ```

### Phase 2: OpenAI Client Implementation

#### OpenAI Client Wrapper (`openai-client.ts`)
```typescript
import OpenAI from 'openai';
import { TokenUsage, GPT5Response } from './types';

export class GPT5Client {
  private client: OpenAI;
  private defaultTemperature: number = 0.7;
  private defaultReasoningEffort: 'low' | 'medium' | 'high' = 'high';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createResponse(params: {
    input: string | any[];
    instructions?: string;
    temperature?: number;
    reasoning?: { effort: string };
    maxTokens?: number;
  }): Promise<GPT5Response> {
    const response = await this.client.responses.create({
      model: 'gpt-5',
      input: params.input,
      instructions: params.instructions,
      reasoning: params.reasoning || { effort: this.defaultReasoningEffort },
      temperature: params.temperature || this.defaultTemperature,
      max_tokens: params.maxTokens
    });

    return {
      text: response.output_text,
      usage: this.extractUsage(response),
      raw: response
    };
  }

  private extractUsage(response: any): TokenUsage {
    // Extract token usage from response
    const usage = response.usage || {};
    return {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      reasoningTokens: usage.reasoning_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      estimatedCost: this.calculateCost(usage)
    };
  }

  private calculateCost(usage: any): number {
    const inputCost = (usage.prompt_tokens || 0) * 0.02 / 1000;
    const outputCost = (usage.completion_tokens || 0) * 0.06 / 1000;
    const reasoningCost = (usage.reasoning_tokens || 0) * 0.10 / 1000;
    return inputCost + outputCost + reasoningCost;
  }
}
```

### Phase 3: Cost Management System

#### Cost Manager (`cost-manager.ts`)
```typescript
export class CostManager {
  private dailyUsage: Map<string, number> = new Map();
  private taskUsage: Map<string, number> = new Map();
  private limits: CostLimits;

  constructor(limits: CostLimits = {}) {
    this.limits = limits;
    this.loadPersistedData();
  }

  async checkAndRecordUsage(
    taskId: string,
    usage: TokenUsage
  ): Promise<{ allowed: boolean; reason?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this.dailyUsage.get(today) || 0;
    const taskTotal = this.taskUsage.get(taskId) || 0;

    // Check limits
    if (this.limits.daily && dailyTotal + usage.estimatedCost > this.limits.daily) {
      return { 
        allowed: false, 
        reason: `Daily limit of $${this.limits.daily} would be exceeded` 
      };
    }

    if (this.limits.perTask && taskTotal + usage.estimatedCost > this.limits.perTask) {
      return { 
        allowed: false, 
        reason: `Task limit of $${this.limits.perTask} would be exceeded` 
      };
    }

    // Record usage
    this.dailyUsage.set(today, dailyTotal + usage.estimatedCost);
    this.taskUsage.set(taskId, taskTotal + usage.estimatedCost);
    await this.persistData();

    return { allowed: true };
  }

  generateReport(period: string): CostReport {
    // Generate detailed cost report
    return {
      period,
      totalCost: this.calculateTotalForPeriod(period),
      breakdown: this.getBreakdown(period),
      limits: this.limits,
      remaining: this.calculateRemaining()
    };
  }
}
```

### Phase 4: MCP Server Implementation

#### Main Server (`index.ts`)
```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GPT5Client } from './openai-client.js';
import { CostManager } from './cost-manager.js';
import { ConversationManager } from './conversation.js';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize components
const gpt5Client = new GPT5Client(API_KEY);
const costManager = new CostManager({
  daily: parseFloat(process.env.DAILY_COST_LIMIT || '10'),
  perTask: parseFloat(process.env.TASK_COST_LIMIT || '2')
});
const conversationManager = new ConversationManager();

// Create MCP server
const server = new Server(
  {
    name: 'gpt5-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'consult_gpt5',
      description: 'Consult GPT-5 for assistance',
      inputSchema: { /* schema */ }
    },
    // ... other tools
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'consult_gpt5':
      return handleConsultGPT5(args);
    case 'start_conversation':
      return handleStartConversation(args);
    case 'continue_conversation':
      return handleContinueConversation(args);
    case 'get_cost_report':
      return handleGetCostReport(args);
    case 'set_cost_limits':
      return handleSetCostLimits(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('GPT-5 MCP Server running');
```

### Phase 5: Docker Configuration

#### Dockerfile
```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy built files and package files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --production

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Run as non-root user
USER node

ENTRYPOINT ["node", "/app/dist/index.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  gpt5-mcp:
    build: .
    image: gpt5-mcp:latest
    container_name: gpt5-mcp-server
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=${LOG_LEVEL:-info}
    volumes:
      - ./data:/app/data  # For persisting cost data
    restart: unless-stopped
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

### Phase 6: Conversation Management

#### Conversation Manager (`conversation.ts`)
```typescript
interface Conversation {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'developer';
    content: string;
    timestamp: Date;
  }>;
  metadata: {
    created: Date;
    lastActive: Date;
    totalCost: number;
    tokenCount: number;
  };
}

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();

  startConversation(topic: string, instructions?: string): string {
    const id = this.generateId();
    const conversation: Conversation = {
      id,
      messages: instructions ? [
        { role: 'developer', content: instructions, timestamp: new Date() }
      ] : [],
      metadata: {
        created: new Date(),
        lastActive: new Date(),
        totalCost: 0,
        tokenCount: 0
      }
    };
    
    this.conversations.set(id, conversation);
    return id;
  }

  addMessage(conversationId: string, role: string, content: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push({
      role: role as any,
      content,
      timestamp: new Date()
    });
    conversation.metadata.lastActive = new Date();
  }

  getContext(conversationId: string, maxMessages: number = 10): any[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return conversation.messages.slice(-maxMessages);
  }

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Testing Strategy

### Unit Tests
1. **OpenAI Client Tests**
   - Mock API responses
   - Test error handling
   - Validate cost calculations

2. **Cost Manager Tests**
   - Test limit enforcement
   - Verify persistence
   - Test report generation

3. **Conversation Manager Tests**
   - Test conversation lifecycle
   - Verify context management
   - Test message ordering

### Integration Tests
1. **End-to-End MCP Tests**
   - Test tool registration
   - Verify request/response flow
   - Test error propagation

2. **Docker Tests**
   - Build verification
   - Environment variable handling
   - Container networking

## Security Considerations

### API Key Management
- Never commit API keys to version control
- Use environment variables for all secrets
- Implement key rotation reminders

### Input Validation
- Sanitize all user inputs
- Implement rate limiting
- Validate request sizes

### Data Privacy
- Don't log sensitive information
- Implement data retention policies
- Ensure GDPR compliance

## Monitoring and Observability

### Logging
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### Metrics
- Request latency
- Token usage per request
- Cost accumulation
- Error rates
- Conversation duration

## Configuration

### Environment Variables
```bash
# .env.example
OPENAI_API_KEY=sk-...
DAILY_COST_LIMIT=10.00
TASK_COST_LIMIT=2.00
DEFAULT_TEMPERATURE=0.7
DEFAULT_REASONING_EFFORT=high
MAX_TOKENS_PER_REQUEST=4000
LOG_LEVEL=info
DATA_DIR=./data
ENABLE_CONVERSATION_PERSISTENCE=true
MAX_CONVERSATION_HISTORY=50
```

## Usage Examples

### Basic Consultation
```typescript
// Claude Code using the MCP server
const response = await mcp.call('consult_gpt5', {
  prompt: 'Help me design a REST API for a task management system',
  temperature: 0.7,
  reasoning_effort: 'high'
});
```

### Conversation Flow
```typescript
// Start a planning session
const convId = await mcp.call('start_conversation', {
  topic: 'Building a real-time chat application',
  instructions: 'Act as a senior architect focusing on scalability'
});

// Continue the conversation
await mcp.call('continue_conversation', {
  conversation_id: convId,
  message: 'What database would you recommend for message storage?'
});
```

### Cost Management
```typescript
// Check current costs
const report = await mcp.call('get_cost_report', {
  period: 'today'
});

// Set stricter limits for expensive operations
await mcp.call('set_cost_limits', {
  task_limit: 5.00,
  daily_limit: 20.00
});
```

## Deployment Guide

### Local Development
```bash
# Clone and setup
git clone <repo>
cd gpt5-mcp
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API key

# Run in development
npm run dev
```

### Docker Deployment
```bash
# Build the image
docker build -t gpt5-mcp .

# Run with environment file
docker run --env-file .env gpt5-mcp

# Or use docker-compose
docker-compose up -d
```

### Integration with Claude Code
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "gpt5": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--env-file", "/path/to/.env", "gpt5-mcp"]
    }
  }
}
```

## Future Enhancements

### Version 1.1
- Streaming responses support
- Multi-model support (GPT-4, GPT-5)
- Conversation export/import
- Web UI for cost monitoring

### Version 1.2
- Team collaboration features
- Conversation templates
- Advanced prompt engineering tools
- Integration with OpenAI Assistants API

### Version 2.0
- Multi-tenant support
- Advanced analytics dashboard
- Custom model fine-tuning integration
- Plugin system for extensibility

## Maintenance and Support

### Regular Tasks
1. **Weekly**: Review cost reports and optimize usage
2. **Monthly**: Update OpenAI SDK and dependencies
3. **Quarterly**: Review and update pricing models
4. **Annually**: Security audit and key rotation

### Troubleshooting Guide
1. **Connection Issues**: Check API key and network connectivity
2. **Cost Overruns**: Review conversation logs and adjust limits
3. **Performance Issues**: Monitor token usage and optimize prompts
4. **Docker Issues**: Check logs with `docker logs gpt5-mcp`

## Conclusion

This GPT-5 MCP server will provide Claude Code with a powerful consultation interface to OpenAI's latest model. The implementation focuses on:
- **Reliability**: Robust error handling and recovery
- **Cost Control**: Comprehensive usage tracking and limits
- **Flexibility**: Configurable parameters and conversation management
- **Security**: Secure API key handling and input validation
- **Observability**: Detailed logging and metrics

The modular architecture ensures easy maintenance and future enhancements while the Docker support enables straightforward deployment across different environments.