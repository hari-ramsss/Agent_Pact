import { KeeperHubConnector } from './src/index';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runTest() {
  console.log("🤖 1. Instantiating KeeperHubConnector...");
  const connector = new KeeperHubConnector();
  
  console.log("🛠️  2. Fetching tools...");
  const tools = connector.getTools();
  console.log(`   Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);

  // Find the trigger_execution tool
  const triggerTool = tools.find(t => t.name === "trigger_execution");
  if (!triggerTool) {
    throw new Error("trigger_execution tool not found");
  }

  console.log("\n🚀 3. Testing 'trigger_execution' tool...");
  const webhookUrl = process.env.KEEPERHUB_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("   ⚠️ Skipping actual POST request: KEEPERHUB_WEBHOOK_URL not found in .env");
    return;
  }

  // We send a dummy payload to verify the tool successfully makes the HTTP call.
  // Note: KeeperHub will receive this. If it tries to execute resolveDispute for Pact 9999,
  // it will revert on-chain (since that pact doesn't exist), but the tool execution itself will be a success!
  const testPayload = {
    event: "arbitrator_verdict",
    data: {
      pactId: 9999, // dummy pact ID
      verdict: 1,
      confidence: 100,
      verdictURI: "0g://test-from-openclaw-plugin"
    }
  };

  console.log(`   Calling webhook: ${webhookUrl}`);
  const result = await triggerTool.execute({
    webhookUrl: webhookUrl,
    payload: testPayload
  });

  console.log("\n✅ 4. Tool Execution Result:");
  console.log(result);
}

runTest().catch(console.error);
