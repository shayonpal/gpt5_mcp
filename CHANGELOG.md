# Changelog

All notable changes to the GPT-5 MCP Server project will be documented in this file.

## [1.0.0] - 2025-08-09

### Added
- Initial release of GPT-5 MCP Server
- Complete GPT-5 Responses API integration with fallback architecture
- Comprehensive cost management with model-aware pricing
- Conversation management with context preservation
- Docker support with multi-stage builds
- Interactive setup and launcher scripts
- pnpm package manager support
- TypeScript implementation with full type safety
- Winston logging with configurable levels
- Zod schema validation for all inputs
- Persistent data storage for costs and conversations

### Technical Implementation
- **GPT-5 Responses API**: Full support for OpenAI's new responses.create() endpoint
- **Fallback Architecture**: Automatic fallback to GPT-4 Turbo → GPT-4 → GPT-3.5 Turbo
- **Parameter Compatibility**: Smart parameter handling between GPT-5 and GPT-4 APIs
- **Cost Tracking**: Model-specific pricing with reasoning token support (GPT-5)
- **MCP Integration**: Full Model Context Protocol server with 5 tools

### Issues Resolved During Development

#### Package Manager Migration
- **Issue**: Initial setup used npm and vitest (Vue.js testing framework)
- **User Request**: Switch to pnpm for better performance
- **Resolution**: Complete migration to pnpm with updated scripts and Docker configuration

#### GPT-5 API Parameter Compatibility
- **Issue**: `max_tokens` parameter caused `400 Unknown parameter` error
- **Root Cause**: GPT-5 Responses API doesn't support traditional chat completion parameters
- **Resolution**: Removed `max_tokens` and `temperature` parameters from GPT-5 API calls
- **Impact**: Parameters only used in GPT-4 fallback scenarios

#### Docker Build Challenges
- **Issue**: TypeScript compiler couldn't find source files during Docker build
- **Resolution**: Reordered Dockerfile to copy source files before running pnpm install
- **Additional Issue**: Production stage tried to run prepare script without dev dependencies
- **Resolution**: Added `--ignore-scripts` flag to production pnpm install

#### Testing Framework Correction
- **Issue**: Included vitest for a Node.js application
- **User Feedback**: "this is a nodejs application and not a vuejs one. so use jest"
- **Resolution**: Switched to Jest with proper Node.js configuration

### API Behavior Changes

#### GPT-5 Responses API
- **Supported Parameters**: `model`, `input`, `instructions`, `reasoning`
- **Unsupported Parameters**: `temperature`, `max_tokens`, `top_p`, `frequency_penalty`
- **New Parameters**: `reasoning.effort` with values: low, medium, high

#### Fallback Behavior
- **Trigger**: Any 404 error or "responses" related error from GPT-5 API
- **Models Tried**: gpt-4-turbo-preview, gpt-4-turbo, gpt-4, gpt-3.5-turbo
- **Full Parameter Support**: All traditional parameters supported in fallback mode

### Configuration Updates
- **Environment Variables**: Added parameter usage documentation
- **Docker Configuration**: Optimized for pnpm with proper lifecycle script handling
- **Claude Desktop Integration**: Complete setup instructions for all operating systems

### Development Tools
- **Package Manager**: pnpm with lockfile support
- **Build System**: TypeScript with ES modules
- **Testing**: Jest with ts-jest
- **Linting**: Basic TypeScript compiler validation
- **Container**: Docker multi-stage builds with Alpine Linux
- **Process Management**: dumb-init for proper signal handling
- **Security**: Non-root user execution in containers

### Known Limitations
1. **GPT-5 Access Required**: Server requires OpenAI API access to GPT-5 (fallback available)
2. **Parameter Restrictions**: GPT-5 doesn't support temperature or token limit controls
3. **Response Length**: GPT-5 responses not bound by traditional token limits
4. **Reasoning Costs**: GPT-5 reasoning tokens can be expensive (10¢ per 1K tokens)

### Breaking Changes
- None (initial release)

### Migration Guide
- Not applicable (initial release)

---

## Development Process Documentation

### Key Decision Points

1. **Architecture Pattern**: Chose fallback architecture over parameter validation rejection
2. **Error Handling**: Implemented graceful degradation rather than hard failures
3. **Cost Management**: Model-aware pricing instead of unified pricing
4. **Parameter Strategy**: Conditional parameter inclusion rather than universal parameters

### User-Driven Changes
- Package manager migration: npm → pnpm
- Testing framework: vitest → jest  
- Docker optimization for production deployment
- Comprehensive documentation with OS-specific examples

### Technical Challenges Overcome
- GPT-5 API parameter incompatibility
- Docker multi-stage builds with pnpm
- MCP server integration with multiple model support
- Cost tracking across different model pricing structures
- Interactive setup scripts for user-friendly deployment

---

*This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.*