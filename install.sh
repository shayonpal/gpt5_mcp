#!/bin/bash

# GPT-5 MCP Server Installation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║       GPT-5 MCP Server Installer      ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check for required tools
check_requirements() {
    local missing_tools=()
    
    if ! command -v node &> /dev/null; then
        missing_tools+=("Node.js")
    fi
    
    if ! command -v pnpm &> /dev/null; then
        missing_tools+=("pnpm")
    fi
    
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not found - Docker installation will not be available"
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        echo "Please install the missing tools and run this script again."
        exit 1
    fi
}

# Setup environment file
setup_env() {
    if [ ! -f .env ]; then
        print_info "Setting up environment configuration..."
        
        if [ -f .env.example ]; then
            cp .env.example .env
            print_info "Created .env file from .env.example"
            
            echo ""
            print_warning "Please edit the .env file and add your OpenAI API key"
            echo "You can do this by running: nano .env"
            echo ""
            
            read -p "Would you like to add your OpenAI API key now? (y/n): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                read -p "Enter your OpenAI API key (sk-...): " api_key
                if [[ $api_key == sk-* ]]; then
                    # Use sed to replace the API key
                    if [[ "$OSTYPE" == "darwin"* ]]; then
                        # macOS
                        sed -i '' "s/OPENAI_API_KEY=.*/OPENAI_API_KEY=$api_key/" .env
                    else
                        # Linux
                        sed -i "s/OPENAI_API_KEY=.*/OPENAI_API_KEY=$api_key/" .env
                    fi
                    print_success "API key configured"
                else
                    print_error "Invalid API key format. Please edit .env manually."
                fi
            fi
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_info ".env file already exists"
    fi
}

# Build local installation
build_local() {
    print_info "Building local installation..."
    
    # Install dependencies
    print_info "Installing dependencies..."
    pnpm install
    
    # Build TypeScript
    print_info "Building TypeScript..."
    pnpm run build
    
    print_success "Local build completed successfully!"
}

# Build Docker image
build_docker() {
    print_info "Building Docker image..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        return 1
    fi
    
    docker build -t gpt5-mcp:latest .
    
    print_success "Docker image built successfully!"
}

# Configure Claude Desktop
configure_claude() {
    print_info "Configuring Claude Desktop integration..."
    
    local config_file=""
    local server_config=""
    local current_dir=$(pwd)
    
    # Determine config file location based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        config_file="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        config_file="$HOME/.config/Claude/claude_desktop_config.json"
    else
        print_error "Unsupported operating system"
        return 1
    fi
    
    # Ask user for installation type
    echo ""
    echo "How would you like to run the GPT-5 MCP server?"
    echo "1) Local Node.js installation"
    echo "2) Docker container"
    echo "3) Skip Claude configuration"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            server_config=$(cat <<EOF
    "gpt5": {
      "command": "node",
      "args": ["$current_dir/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "YOUR_API_KEY_HERE",
        "DAILY_COST_LIMIT": "10.00",
        "TASK_COST_LIMIT": "2.00"
      }
    }
EOF
            )
            ;;
        2)
            server_config=$(cat <<EOF
    "gpt5": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--env-file", "$current_dir/.env", "gpt5-mcp:latest"]
    }
EOF
            )
            ;;
        3)
            print_info "Skipping Claude configuration"
            return 0
            ;;
        *)
            print_error "Invalid choice"
            return 1
            ;;
    esac
    
    # Create config directory if it doesn't exist
    mkdir -p "$(dirname "$config_file")"
    
    # Check if config file exists
    if [ -f "$config_file" ]; then
        print_warning "Claude config file already exists at: $config_file"
        echo ""
        echo "Add the following configuration to your mcpServers section:"
        echo ""
        echo "$server_config"
        echo ""
        echo "You can edit the file manually with: nano \"$config_file\""
    else
        # Create new config file
        cat > "$config_file" <<EOF
{
  "mcpServers": {
$server_config
  }
}
EOF
        print_success "Claude configuration created at: $config_file"
        
        if [ "$choice" == "1" ]; then
            print_warning "Remember to update the OPENAI_API_KEY in the configuration file!"
        fi
    fi
}

# Test the installation
test_installation() {
    print_info "Testing installation..."
    
    echo ""
    echo "How would you like to test the server?"
    echo "1) Local Node.js"
    echo "2) Docker"
    echo "3) Skip testing"
    echo ""
    read -p "Enter your choice (1-3): " test_choice
    
    case $test_choice in
        1)
            print_info "Starting local server test..."
            echo "The server will start and you should see 'GPT-5 MCP Server is running'"
            echo "Press Ctrl+C to stop the test"
            echo ""
            timeout 5 node dist/index.js 2>&1 | head -20 || true
            print_success "Local server test completed"
            ;;
        2)
            if ! command -v docker &> /dev/null; then
                print_error "Docker is not installed"
                return 1
            fi
            
            print_info "Starting Docker server test..."
            echo "The server will start in Docker and you should see 'GPT-5 MCP Server is running'"
            echo ""
            timeout 5 docker run --rm -i --env-file .env gpt5-mcp:latest 2>&1 | head -20 || true
            print_success "Docker server test completed"
            ;;
        3)
            print_info "Skipping tests"
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
}

# Main installation flow
main() {
    check_requirements
    
    echo ""
    print_info "Starting GPT-5 MCP Server installation..."
    echo ""
    
    # Setup environment
    setup_env
    
    echo ""
    echo "Choose installation type:"
    echo "1) Local installation only"
    echo "2) Docker installation only"
    echo "3) Both local and Docker"
    echo ""
    read -p "Enter your choice (1-3): " install_choice
    
    case $install_choice in
        1)
            build_local
            ;;
        2)
            build_docker
            ;;
        3)
            build_local
            build_docker
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    echo ""
    configure_claude
    
    echo ""
    test_installation
    
    echo ""
    print_success "Installation completed!"
    echo ""
    echo "Next steps:"
    echo "1. Ensure your OpenAI API key is set in the .env file"
    echo "2. Restart Claude Desktop to load the new MCP server"
    echo "3. Use the GPT-5 tools in Claude"
    echo ""
    echo "Available tools:"
    echo "  - consult_gpt5: Get assistance from GPT-5"
    echo "  - start_conversation: Start a new conversation"
    echo "  - continue_conversation: Continue an existing conversation"
    echo "  - get_cost_report: View usage and costs"
    echo "  - set_cost_limits: Configure spending limits"
    echo ""
    print_info "For more information, see README.md"
}

# Run main function
main