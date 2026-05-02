import { registerAutomationTool, triggerExecutionTool } from './tools';

/**
 * KeeperHubConnector
 * 
 * An OpenClaw compatible plugin that wraps KeeperHub MCP server calls 
 * and exposes them as OpenClaw tools.
 * 
 * Usage:
 * const connector = new KeeperHubConnector();
 * const tools = connector.getTools();
 */
export class KeeperHubConnector {
  getTools() {
    return [
      registerAutomationTool,
      triggerExecutionTool
    ];
  }
}

export default KeeperHubConnector;
