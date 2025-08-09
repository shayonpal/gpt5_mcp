#!/bin/bash

# GPT-5 MCP Server Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# Clear screen for better UX
clear

# Banner
echo -e "${CYAN}"
echo "┌─────────────────────────────────┐"
echo "│   GPT-5 MCP Server Launcher     │"
echo "└─────────────────────────────────┘"
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    print_error "No .env file found!"
    echo ""
    
    if [ -f .env.example ]; then
        print_info "Creating .env from .env.example..."
        cp .env.example .env
        print_success "Created .env file"
        echo ""
        print_warning "Please edit .env and add your OpenAI API key"
        echo "Run: ${CYAN}nano .env${NC} or ${CYAN}code .env${NC}"
        echo ""
        read -p "Press Enter to continue or Ctrl+C to exit..."
    else
        print_error ".env.example not found. Cannot proceed."
        exit 1
    fi
fi

# Check API key
if grep -q "sk-your-api-key-here" .env 2>/dev/null; then
    print_warning "OpenAI API key not configured in .env!"
    echo ""
    read -p "Would you like to add your API key now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your OpenAI API key (sk-...): " api_key
        if [[ $api_key == sk-* ]]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/sk-your-api-key-here/$api_key/" .env
            else
                sed -i "s/sk-your-api-key-here/$api_key/" .env
            fi
            print_success "API key configured"
        else
            print_error "Invalid API key format"
            exit 1
        fi
    fi
fi

# Check if dependencies are installed
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed"
        print_info "Installing dependencies..."
        pnpm install
        print_success "Dependencies installed"
        echo ""
    fi
}

# Check if TypeScript is built
check_build() {
    if [ ! -d "dist" ]; then
        print_warning "Project not built"
        print_info "Building project..."
        pnpm run build
        print_success "Build completed"
        echo ""
    fi
}

# Check if Docker image exists
check_docker_image() {
    if command -v docker &> /dev/null; then
        if ! docker images | grep -q "gpt5-mcp"; then
            return 1
        fi
        return 0
    fi
    return 1
}

# Start local server
start_local() {
    print_info "Starting local Node.js server..."
    check_dependencies
    check_build
    
    echo ""
    print_success "Starting GPT-5 MCP Server (Local)"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Load environment variables and start
    export $(grep -v '^#' .env | xargs)
    node dist/index.js
}

# Start Docker server
start_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed!"
        echo "Please install Docker from https://docker.com"
        exit 1
    fi
    
    # Check if image exists
    if ! check_docker_image; then
        print_warning "Docker image not found"
        print_info "Building Docker image..."
        docker build -t gpt5-mcp:latest . || {
            print_error "Docker build failed"
            exit 1
        }
        print_success "Docker image built"
        echo ""
    fi
    
    print_info "Starting Docker container..."
    echo ""
    print_success "Starting GPT-5 MCP Server (Docker)"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    docker run --rm -i --env-file .env --name gpt5-mcp gpt5-mcp:latest
}

# Start development mode
start_dev() {
    print_info "Starting in development mode with hot reload..."
    check_dependencies
    
    echo ""
    print_success "Starting GPT-5 MCP Server (Development)"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    pnpm run dev
}

# Main menu
show_menu() {
    echo "How would you like to run the GPT-5 MCP Server?"
    echo ""
    echo -e "  ${CYAN}1)${NC} Local (Production)"
    echo -e "  ${CYAN}2)${NC} Local (Development with hot reload)"
    echo -e "  ${CYAN}3)${NC} Docker Container"
    echo -e "  ${CYAN}4)${NC} Exit"
    echo ""
    read -p "Enter your choice [1-4]: " choice
    
    case $choice in
        1)
            start_local
            ;;
        2)
            start_dev
            ;;
        3)
            start_docker
            ;;
        4)
            print_info "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid choice. Please try again."
            echo ""
            show_menu
            ;;
    esac
}

# Handle Ctrl+C gracefully
trap 'echo ""; print_info "Server stopped"; exit 0' INT TERM

# Show current configuration
echo "Current Configuration:"
echo -e "  ${CYAN}•${NC} Working Directory: $(pwd)"

if [ -f .env ]; then
    # Extract some config values
    daily_limit=$(grep "DAILY_COST_LIMIT" .env | cut -d'=' -f2 || echo "10.00")
    task_limit=$(grep "TASK_COST_LIMIT" .env | cut -d'=' -f2 || echo "2.00")
    temperature=$(grep "DEFAULT_TEMPERATURE" .env | cut -d'=' -f2 || echo "0.7")
    
    echo -e "  ${CYAN}•${NC} Daily Cost Limit: \$$daily_limit"
    echo -e "  ${CYAN}•${NC} Task Cost Limit: \$$task_limit"
    echo -e "  ${CYAN}•${NC} Default Temperature: $temperature"
fi

echo ""

# Main execution
show_menu