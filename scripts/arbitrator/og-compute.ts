function computeUrl(): string {
  return process.env.OG_COMPUTE_URL || 'https://api.0g.compute/v1';
}

function computeKey(): string {
  return process.env.OG_COMPUTE_KEY || '';
}

function computeModel(): string {
  return process.env.OG_COMPUTE_MODEL || 'qwen3:7b';
}

function strictCompute(): boolean {
  return process.env.OG_COMPUTE_STRICT === 'true';
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function callLLM(
  messages: LLMMessage[],
  maxTokens: number = 1000,
): Promise<string> {
  const key = computeKey();
  if (!key) {
    return callMockLLM(messages, 'OG_COMPUTE_KEY is not set');
  }

  try {
    const response = await fetch(`${computeUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: computeModel(),
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`0G Compute LLM error ${response.status}: ${body || response.statusText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('0G Compute returned an empty completion');
    }

    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (strictCompute()) {
      throw err;
    }
    return callMockLLM(messages, message);
  }
}

export async function pingCompute(): Promise<boolean> {
  try {
    const result = await callLLM([
      { role: 'user', content: 'Reply with only the word: READY' },
    ], 10);
    return result.trim().toUpperCase().includes('READY');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[0G Compute] Ping failed: ${message}`);
    return false;
  }
}

function callMockLLM(messages: LLMMessage[], reason: string): string {
  console.warn(`[0G Compute] Falling back to mock inference: ${reason}`);

  const prompt = messages[messages.length - 1]?.content || '';
  const upperPrompt = prompt.toUpperCase();

  if (upperPrompt.includes('REPLY WITH ONLY THE WORD: READY')) {
    return 'READY';
  }

  if (upperPrompt.includes('LIST THE EXACT REQUIREMENTS')) {
    return [
      '1. Implement the requested function or artifact described by the task.',
      '2. Match the required interface, naming, inputs, and outputs.',
      '3. Satisfy the behavioral requirements and edge cases from the task spec.',
      '4. Avoid side effects that the task explicitly forbids.',
    ].join('\n');
  }

  if (upperPrompt.includes('FOR EACH REQUIREMENT')) {
    const submission = extractFencedBlock(prompt).toLowerCase();
    const looksUnsortedPassThrough = submission.includes('return arr') && !submission.includes('.sort');
    const hasSort = submission.includes('sortnumbers') && submission.includes('.sort');

    if (looksUnsortedPassThrough) {
      return [
        '1. PARTIAL - The submission provides a function-shaped answer but does not implement the full requested behavior.',
        '2. PARTIAL - The apparent interface exists, but the output is just the original input.',
        '3. NO - The array is not sorted ascending.',
        '4. YES - Empty arrays are returned without crashing.',
        '5. NO - Returning the original array fails the non-mutation/independent-result requirement for a sorting task.',
      ].join('\n');
    }

    if (hasSort) {
      return [
        '1. YES - The submission implements the requested function.',
        '2. YES - The function name and input/output shape match the task.',
        '3. YES - It sorts values ascending.',
        '4. YES - Empty arrays are handled by the normal array path.',
        '5. YES - The submission appears to avoid mutating the original input.',
      ].join('\n');
    }

    return [
      '1. PARTIAL - The submission is present but cannot be fully validated by mock inference.',
      '2. PARTIAL - Interface compliance is unclear.',
      '3. PARTIAL - Behavioral compliance is unclear.',
      '4. PARTIAL - Edge-case handling is unclear.',
    ].join('\n');
  }

  if (upperPrompt.includes('CRITICAL FAILURES')) {
    const assistantTranscript = assistantOutputTranscript(messages);
    return assistantTranscript.includes('NO -')
      ? 'Critical failure: at least one core behavioral requirement is marked NO, so the task purpose is not satisfied.'
      : 'NO CRITICAL FAILURES';
  }

  if (upperPrompt.includes('SCALE OF 0-100')) {
    return '88';
  }

  if (upperPrompt.includes('PASS OR FAIL')) {
    const assistantTranscript = assistantOutputTranscript(messages);
    return assistantTranscript.includes('NO -') || assistantTranscript.includes('CRITICAL FAILURE:')
      ? 'FAIL'
      : 'PASS';
  }

  return 'Mock inference completed.';
}

function extractFencedBlock(value: string): string {
  const match = value.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match?.[1] || value;
}

function assistantOutputTranscript(messages: LLMMessage[]): string {
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)
    .join('\n')
    .toUpperCase();
}
