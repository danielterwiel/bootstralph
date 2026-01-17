/**
 * Docker Compose YAML template generator
 * Generates docker-compose.yml for custom Claude Code container approach
 */

// ============================================================================
// Types
// ============================================================================

export interface DockerComposeConfig {
  /** Project name for container naming */
  projectName: string;
  /** Include network filtering capability (requires cap_add: NET_ADMIN) */
  includeNetworkFiltering?: boolean;
  /** Working directory inside container */
  workDir?: string;
  /** Additional environment variables */
  additionalEnvVars?: Record<string, string>;
  /** Node.js version for base image */
  nodeVersion?: string;
}

// ============================================================================
// Template Generators
// ============================================================================

/**
 * Generate docker-compose.yml content
 */
export function generateDockerComposeYml(config: DockerComposeConfig): string {
  const {
    projectName,
    includeNetworkFiltering = false,
    workDir = '/workspace',
    additionalEnvVars = {},
  } = config;

  const lines: string[] = [
    "version: '3.8'",
    '',
    'services:',
    '  claude-dev:',
    '    build:',
    '      context: .',
    '      dockerfile: Dockerfile',
    `    container_name: \${PROJECT_NAME:-${projectName}}`,
    '    volumes:',
    '      # Mount project workspace',
    `      - .:${workDir}`,
    '      # Persist Claude configuration between restarts',
    '      - claude-config:/home/node/.claude',
    '      # Persist Claude data (conversation history, etc.)',
    '      - claude-data:/mnt/claude-data',
    '    environment:',
    '      # API key from .env file or host environment',
    '      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}',
    '      # Optional: for GitHub operations',
    '      - GITHUB_TOKEN=${GITHUB_TOKEN:-}',
    '      # Development environment',
    '      - NODE_ENV=development',
  ];

  // Add additional environment variables
  for (const [key, defaultValue] of Object.entries(additionalEnvVars)) {
    lines.push(`      - ${key}=\${${key}:-${defaultValue}}`);
  }

  lines.push(`    working_dir: ${workDir}`);
  lines.push('    # Keep container running for interactive use');
  lines.push('    stdin_open: true');
  lines.push('    tty: true');

  // Add network filtering capability if requested
  if (includeNetworkFiltering) {
    lines.push('    # Network filtering capability (for domain whitelisting)');
    lines.push('    cap_add:');
    lines.push('      - NET_ADMIN');
  }

  lines.push('    # Optional: restrict network (uncomment for isolation)');
  lines.push('    # network_mode: none');
  lines.push('');
  lines.push('volumes:');
  lines.push('  # Named volumes for persistence across container restarts');
  lines.push('  claude-config:');
  lines.push(`    name: \${PROJECT_NAME:-${projectName}}-config`);
  lines.push('  claude-data:');
  lines.push(`    name: \${PROJECT_NAME:-${projectName}}-data`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate Dockerfile content for Claude Code container
 */
export function generateDockerfile(config: DockerComposeConfig): string {
  const {
    nodeVersion = '20',
    includeNetworkFiltering = false,
  } = config;

  const lines: string[] = [
    `FROM node:${nodeVersion}`,
    '',
    '# Install development tools',
    'RUN apt-get update && apt-get install -y \\',
    '    git zsh vim \\',
    '    ripgrep fd-find jq \\',
    '    curl wget \\',
  ];

  if (includeNetworkFiltering) {
    lines.push('    iptables dnsutils \\');
  }

  lines.push('    && rm -rf /var/lib/apt/lists/*');
  lines.push('');
  lines.push('# Install Claude Code globally');
  lines.push('RUN npm install -g @anthropic-ai/claude-code');
  lines.push('');
  lines.push('# Create non-root user workspace');
  lines.push('WORKDIR /workspace');
  lines.push('RUN chown -R node:node /workspace');
  lines.push('');
  lines.push('# Switch to non-root user');
  lines.push('USER node');
  lines.push('');
  lines.push('# Default command');
  lines.push('CMD ["claude"]');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate .env.example content
 */
export function generateEnvExample(config: DockerComposeConfig): string {
  const { additionalEnvVars = {} } = config;

  const lines: string[] = [
    '# Claude Code Docker Environment',
    '# Copy this file to .env and fill in your values',
    '# NEVER commit .env to version control!',
    '',
    '# Required: Your Anthropic API key',
    '# Get one at: https://console.anthropic.com/',
    'ANTHROPIC_API_KEY=',
    '',
    '# Optional: GitHub personal access token for git operations',
    '# Create at: https://github.com/settings/tokens',
    'GITHUB_TOKEN=',
    '',
    '# Optional: Custom project name for container naming',
    '# PROJECT_NAME=my-project',
    '',
  ];

  // Add additional environment variables
  if (Object.keys(additionalEnvVars).length > 0) {
    lines.push('# Project-specific environment variables');
    for (const [key, defaultValue] of Object.entries(additionalEnvVars)) {
      lines.push(`${key}=${defaultValue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate devcontainer.json content
 */
export function generateDevcontainerJson(config: DockerComposeConfig): string {
  const { nodeVersion = '20' } = config;

  const devcontainer = {
    name: 'Claude Code Dev',
    image: `node:${nodeVersion}`,
    features: {
      'ghcr.io/anthropics/devcontainer-features/claude-code:1': {},
    },
    remoteUser: 'node',
    customizations: {
      vscode: {
        extensions: [
          'dbaeumer.vscode-eslint',
          'esbenp.prettier-vscode',
          'bradlc.vscode-tailwindcss',
        ],
      },
    },
    postCreateCommand: 'npm install',
  };

  return JSON.stringify(devcontainer, null, 2) + '\n';
}

/**
 * Generate minimal devcontainer.json (no base image, uses features)
 */
export function generateMinimalDevcontainerJson(): string {
  const devcontainer = {
    name: 'Claude Code Dev',
    features: {
      'ghcr.io/devcontainers/features/node:1': {},
      'ghcr.io/anthropics/devcontainer-features/claude-code:1': {},
    },
  };

  return JSON.stringify(devcontainer, null, 2) + '\n';
}

/**
 * Generate start-claude.sh shell script for docker sandbox approach
 */
export function generateStartClaudeScript(config: DockerComposeConfig): string {
  const { projectName } = config;

  return `#!/bin/bash
# Start Claude Code in Docker Sandbox
# This script provides a convenient way to run Claude Code in a containerized environment

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_NAME="${projectName}"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

echo_info() {
    echo -e "\${GREEN}[INFO]\${NC} $1"
}

echo_warn() {
    echo -e "\${YELLOW}[WARN]\${NC} $1"
}

echo_error() {
    echo -e "\${RED}[ERROR]\${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo_error "Docker is not installed."
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo_error "Docker daemon is not running."
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if docker sandbox is available
if ! docker sandbox --help &> /dev/null 2>&1; then
    echo_warn "Docker sandbox feature not available."
    echo "Consider updating Docker Desktop to the latest version."
    echo ""
    echo "Falling back to docker compose approach..."
    echo "Run: docker compose up -d && docker compose exec claude-dev claude"
    exit 1
fi

# Parse arguments
CLAUDE_ARGS=""
USE_CONTINUE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--continue)
            USE_CONTINUE=true
            shift
            ;;
        *)
            CLAUDE_ARGS="$CLAUDE_ARGS $1"
            shift
            ;;
    esac
done

# Run Claude in Docker sandbox
echo_info "Starting Claude Code in Docker sandbox..."
echo_info "Project: $PROJECT_NAME"
echo_info "Workspace: $PROJECT_DIR"
echo ""

if [ "$USE_CONTINUE" = true ]; then
    docker sandbox run -w "$PROJECT_DIR" claude -c $CLAUDE_ARGS
else
    docker sandbox run -w "$PROJECT_DIR" claude $CLAUDE_ARGS
fi
`;
}

/**
 * Generate firewall-setup.sh for network filtering inside container
 */
export function generateFirewallScript(): string {
  return `#!/bin/bash
# Firewall setup for Claude Code container
# Implements domain whitelisting to prevent data exfiltration
# REQUIRES: cap_add: NET_ADMIN in docker-compose.yml

set -e

echo "Setting up network firewall..."

# Default deny policy for outgoing traffic
iptables -P OUTPUT DROP

# Allow loopback
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# REQUIRED: Anthropic API (without this, Claude Code won't work)
iptables -A OUTPUT -p tcp -d api.anthropic.com --dport 443 -j ACCEPT
iptables -A OUTPUT -p tcp -d claude.ai --dport 443 -j ACCEPT

# REQUIRED: Package registries (for npm install)
iptables -A OUTPUT -p tcp -d registry.npmjs.org --dport 443 -j ACCEPT

# REQUIRED: Git operations
iptables -A OUTPUT -p tcp -d github.com --dport 443 -j ACCEPT
iptables -A OUTPUT -p tcp -d github.com --dport 22 -j ACCEPT

# DNS resolution (required for domain names to work)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Log and drop everything else
iptables -A OUTPUT -j LOG --log-prefix "BLOCKED: " --log-level 4
iptables -A OUTPUT -j DROP

echo "Firewall configured. Allowed domains:"
echo "  - api.anthropic.com (Claude API)"
echo "  - claude.ai (Claude web)"
echo "  - registry.npmjs.org (npm packages)"
echo "  - github.com (Git operations)"
echo ""
echo "All other outgoing connections will be blocked."
`;
}

/**
 * Generate .dockerignore content
 */
export function generateDockerignore(): string {
  return `# Git
.git
.gitignore

# Node modules (will be installed in container)
node_modules
.pnpm-store

# Build outputs
dist
build
.next
.nuxt
.output

# Environment files (for security)
.env
.env.*
!.env.example

# IDE
.vscode
.idea
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Test coverage
coverage

# Claude artifacts (rebuild in container)
.claude/settings.local.json
`;
}
