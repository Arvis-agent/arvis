FROM node:22-slim

# Run as non-root for security
RUN useradd -m -u 1001 claude
WORKDIR /home/claude

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Workspace for file access (optional bind mount)
RUN mkdir -p /workspace && chown claude:claude /workspace

USER claude

# Entrypoint: claude CLI in --print mode
ENTRYPOINT ["claude", "--print"]
