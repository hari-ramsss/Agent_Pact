import { callLLM, LLMMessage } from './og-compute';
import { appendAuditEntry, stepAuditEntry } from './og-log';
import { ArbitrationCase, ReasoningStep } from './types';

const SYSTEM_PROMPT = `You are AgentPact Arbitrator, an autonomous AI judge for AI-to-AI work contracts.
Your job is to determine if the submitted work satisfies the task specification.
Be rigorous, concise, and economically careful. Output only what each step asks for.`;

async function runStep(
  cas: ArbitrationCase,
  steps: ReasoningStep[],
  history: LLMMessage[],
  step: number,
  name: string,
  input: string,
  maxTokens = 1000,
): Promise<string> {
  console.log(`[Arbitrator] Step ${step}: ${name}`);
  history.push({ role: 'user', content: input });
  const output = await callLLM([{ role: 'system', content: SYSTEM_PROMPT }, ...history], maxTokens);
  history.push({ role: 'assistant', content: output });

  const reasoningStep: ReasoningStep = { step, name, input, output };
  steps.push(reasoningStep);
  await appendAuditEntry(stepAuditEntry(cas.pactId, reasoningStep));
  return output;
}

export async function runReasoningLoop(
  cas: ArbitrationCase,
  taskSpec: string,
  submission: string,
): Promise<{ decision: 'Pass' | 'Fail'; confidence: number; steps: ReasoningStep[] }> {
  const steps: ReasoningStep[] = [];
  const history: LLMMessage[] = [];

  await runStep(
    cas,
    steps,
    history,
    1,
    'Parse Requirements',
    `TASK SPECIFICATION:\n\`\`\`\n${taskSpec}\n\`\`\`\n\nList the exact requirements this task must satisfy. Number each requirement. Be specific.`,
  );

  await runStep(
    cas,
    steps,
    history,
    2,
    'Analyze Submission',
    `SUBMISSION:\n\`\`\`\n${submission}\n\`\`\`\n\nFor each requirement you listed, state whether the submission satisfies it (YES/PARTIAL/NO) and explain why in one sentence.`,
  );

  await runStep(
    cas,
    steps,
    history,
    3,
    'Identify Critical Failures',
    'Based on your analysis, list any requirements marked NO that are critical to the task core purpose. If none, say "NO CRITICAL FAILURES".',
  );

  const confidenceText = await runStep(
    cas,
    steps,
    history,
    4,
    'Confidence Score',
    'On a scale of 0-100, how confident are you in your assessment? Consider task clarity, submission completeness, and ambiguity. Reply with only a number.',
    10,
  );

  const confidence = Math.min(100, Math.max(0, parseInt(confidenceText.trim(), 10) || 70));
  steps[3].confidence = confidence;

  const verdictText = await runStep(
    cas,
    steps,
    history,
    5,
    'Final Verdict',
    `Given your full analysis, deliver your final verdict.
Rules:
- PASS if all critical requirements are met, even if minor issues exist.
- FAIL if any critical requirement is not met.
Reply with exactly one word: PASS or FAIL.`,
    5,
  );

  const decision: 'Pass' | 'Fail' = verdictText.trim().toUpperCase().includes('PASS') ? 'Pass' : 'Fail';
  console.log(`[Arbitrator] Pact ${cas.pactId}: ${decision} (confidence ${confidence})`);

  return { decision, confidence, steps };
}
