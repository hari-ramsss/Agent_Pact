import axios from 'axios';

export const registerAutomationTool = {
  name: "register_automation",
  description: "Registers an automation job with KeeperHub via its API.",
  parameters: {
    type: "object",
    properties: {
      jobId: { type: "string", description: "A unique identifier for the job" },
      contractAddress: { type: "string", description: "The smart contract address" },
      eventSignature: { type: "string", description: "The event signature to listen for (if applicable)" },
      webhookURL: { type: "string", description: "The Webhook URL to trigger (if applicable)" },
      description: { type: "string", description: "A description of the automation job" },
    },
    required: ["jobId", "contractAddress", "description"]
  },
  execute: async (args: any, context?: any) => {
    const apiUrl = process.env.KEEPERHUB_API_URL;
    const apiKey = process.env.KEEPERHUB_API_KEY;
    
    if (!apiUrl) {
      throw new Error("KEEPERHUB_API_URL is missing from environment variables");
    }
    
    try {
      const response = await axios.post(`${apiUrl}/jobs`, args, {
        headers: { Authorization: `Bearer ${apiKey || ""}` }
      });
      return JSON.stringify({ success: true, data: response.data });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }
};

export const triggerExecutionTool = {
  name: "trigger_execution",
  description: "Triggers a KeeperHub manual webhook execution with a payload.",
  parameters: {
    type: "object",
    properties: {
      webhookUrl: { type: "string", description: "The KeeperHub Webhook URL to trigger" },
      payload: { type: "object", description: "The JSON payload to send to the webhook" }
    },
    required: ["webhookUrl", "payload"]
  },
  execute: async (args: any, context?: any) => {
    const authKey = (process.env.KEEPERHUB_WEBHOOK_KEY || process.env.KEEPERHUB_API_KEY)?.trim();
    console.log(`[DEBUG] Executing webhook POST...`);
    console.log(`[DEBUG] URL: ${args.webhookUrl}`);
    console.log(`[DEBUG] Headers being sent:`, {
      'Content-Type': 'application/json',
      ...(authKey ? { Authorization: `Bearer ${authKey.substring(0, 5)}...` } : {})
    });

    try {
      const response = await axios.post(args.webhookUrl, args.payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(authKey ? { Authorization: `Bearer ${authKey}` } : {})
        }
      });
      return JSON.stringify({ success: true, data: response.data });
    } catch (error: any) {
      if (error.response) {
        console.error("[DEBUG] Axios error response data:", error.response.data);
      }
      return JSON.stringify({ success: false, error: error.message });
    }
  }
};
