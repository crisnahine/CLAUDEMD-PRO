/**
 * MCP Server
 *
 * Lightweight Model Context Protocol server using stdio transport (JSON-RPC
 * over stdin/stdout). Exposes claudemd-pro capabilities as MCP tools for
 * use with Claude Desktop and Claude Code.
 *
 * Protocol: reads newline-delimited JSON-RPC from stdin, writes JSON-RPC
 * responses to stdout. All diagnostic logging goes to stderr so it never
 * contaminates the protocol channel.
 */
declare function startMcpServer(): void;

export { startMcpServer };
