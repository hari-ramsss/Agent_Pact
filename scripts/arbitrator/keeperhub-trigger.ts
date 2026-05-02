import axios from 'axios';
import { Verdict, VerdictEnum } from './types';

function resolveKeeperHubEndpoint(): string {
  const explicitVerdictUrl = process.env.KEEPERHUB_VERDICT_URL;
  if (explicitVerdictUrl) {
    return explicitVerdictUrl;
  }

  const webhookUrl = process.env.KEEPERHUB_WEBHOOK_URL;
  if (webhookUrl) {
    return webhookUrl;
  }

  const apiBaseUrl = process.env.KEEPERHUB_API_URL;
  if (apiBaseUrl) {
    return `${apiBaseUrl.replace(/\/+$/, '')}/verdicts`;
  }

  throw new Error(
    'Set one of KEEPERHUB_VERDICT_URL, KEEPERHUB_WEBHOOK_URL, or KEEPERHUB_API_URL in .env',
  );
}

export async function triggerKeeperHub(verdict: Verdict): Promise<string> {
  const endpoint = resolveKeeperHubEndpoint();
  const keeperHubApiKey = process.env.KEEPERHUB_API_KEY;
  const verdictEnum = verdict.decision === 'Pass' ? VerdictEnum.Pass : VerdictEnum.Fail;

  const payload = {
    event: 'arbitrator_verdict',
    data: {
      pactId: verdict.pactId,
      verdict: verdictEnum,
      confidence: verdict.confidence,
      verdictURI: verdict.verdictURI,
      decision: verdict.decision,
      timestamp: verdict.timestamp,
    },
  };

  console.log(`[KeeperHub] Dispatching verdict for pact ${verdict.pactId}: ${verdict.decision}`);
  const authKey = (process.env.KEEPERHUB_WEBHOOK_KEY || process.env.KEEPERHUB_API_KEY)?.trim();
  const response = await axios.post(endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...(authKey ? { Authorization: `Bearer ${authKey}` } : {}),
    },
    timeout: 30_000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`KeeperHub dispatch failed with status ${response.status}`);
  }

  const dispatchId = String(
    response.data?.requestId ?? response.data?.id ?? response.data?.runId ?? 'keeperhub-dispatched',
  );
  console.log(`[KeeperHub] Verdict dispatched (${dispatchId})`);
  return dispatchId;
}
