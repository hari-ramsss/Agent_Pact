export interface ArbitrationCase {
  pactId: number;
  taskSpecURI: string;
  submissionURI: string;
  agentB: string;
  requestedAt: number;
}

export interface ReasoningStep {
  step: number;
  name: string;
  input: string;
  output: string;
  confidence?: number;
}

export interface Verdict {
  pactId: number;
  decision: 'Pass' | 'Fail';
  confidence: number;
  reasoning: ReasoningStep[];
  taskSpec: string;
  submission: string;
  verdictURI: string;
  timestamp: number;
}

export enum VerdictEnum {
  Pass = 0,
  Fail = 1,
}

export interface AgentHistory {
  lastPactId?: number;
  lastVerdict?: 'Pass' | 'Fail';
  totalCases?: number;
  verdicts?: Array<{
    pactId: number;
    decision: 'Pass' | 'Fail';
    confidence: number;
    timestamp: number;
  }>;
}
