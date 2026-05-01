import { ReasoningStep, Verdict } from './types';
import { uploadContent } from '../og-storage';

export interface AuditEntry {
  pactId: number;
  type: 'case_opened' | 'step_complete' | 'verdict_final';
  timestamp: number;
  blockNumber?: number;
  data: unknown;
}

export async function writeVerdictToStorage(verdict: Verdict): Promise<string> {
  const payload = {
    schemaVersion: '1.0',
    pactId: verdict.pactId,
    decision: verdict.decision,
    confidence: verdict.confidence,
    timestamp: verdict.timestamp,
    reasoning: verdict.reasoning,
    taskSpec: verdict.taskSpec,
    submission: verdict.submission,
  };

  const uri = await uploadContent(payload, `verdict-pact-${verdict.pactId}`);
  console.log(`[0G Log] Verdict for pact ${verdict.pactId} stored at ${uri}`);
  return uri;
}

export async function appendAuditEntry(entry: AuditEntry): Promise<string> {
  const uri = await uploadContent(entry, `audit-pact-${entry.pactId}-${entry.type}-${Date.now()}`);
  console.log(`[0G Log] Audit entry written: ${entry.type} (${uri})`);
  return uri;
}

export function stepAuditEntry(
  pactId: number,
  step: ReasoningStep,
): AuditEntry {
  return {
    pactId,
    type: 'step_complete',
    timestamp: Date.now(),
    data: step,
  };
}
