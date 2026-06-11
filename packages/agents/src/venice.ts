import { config, requireReal } from '@aliran/core';

/**
 * Venice client — OpenAI-compatible chat completions + image generation.
 * Base URL https://api.venice.ai/api/v1, bearer auth.
 *
 * MOCK_MODE: returns realistic canned responses keyed by an intent label, so
 * agents reason deterministically offline. Real mode calls the live API.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface VeniceTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  raw?: unknown;
  mocked: boolean;
}

/** A canned-response provider for mock mode, supplied per call. */
export type MockResponder = (messages: ChatMessage[]) => ChatResult;

export async function veniceChat(opts: {
  messages: ChatMessage[];
  tools?: VeniceTool[];
  toolChoice?: 'auto' | 'required' | 'none';
  temperature?: number;
  /** Required in MOCK_MODE: produce the canned response. */
  mock?: MockResponder;
}): Promise<ChatResult> {
  if (config.MOCK_MODE) {
    if (!opts.mock) {
      return { content: '[mock] no responder supplied', toolCalls: [], mocked: true };
    }
    return opts.mock(opts.messages);
  }

  requireReal({ VENICE_API_KEY: config.VENICE_API_KEY, VENICE_MODEL: config.VENICE_MODEL });
  const res = await fetch(`${config.VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.VENICE_MODEL,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice ?? (opts.tools ? 'auto' : undefined),
      temperature: opts.temperature ?? 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`Venice chat failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
  };
  const msg = json.choices?.[0]?.message;
  return {
    content: msg?.content ?? null,
    toolCalls: msg?.tool_calls ?? [],
    raw: json,
    mocked: false,
  };
}

export async function veniceImage(opts: {
  prompt: string;
  mock?: () => string; // returns a mock image URL/data string
}): Promise<{ url: string; mocked: boolean }> {
  if (config.MOCK_MODE) {
    return { url: opts.mock?.() ?? 'mock://image/treasury-report-cover.png', mocked: true };
  }
  requireReal({ VENICE_API_KEY: config.VENICE_API_KEY, VENICE_IMAGE_MODEL: config.VENICE_IMAGE_MODEL });
  const res = await fetch(`${config.VENICE_BASE_URL}/image/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.VENICE_API_KEY}`,
    },
    body: JSON.stringify({ model: config.VENICE_IMAGE_MODEL, prompt: opts.prompt }),
  });
  if (!res.ok) throw new Error(`Venice image failed: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { url?: string }[] };
  return { url: json.data?.[0]?.url ?? '', mocked: false };
}

/** Helper: make an OpenAI-style tool-call result for mock responders. */
export function mockToolCall(name: string, args: Record<string, unknown>): ChatResult {
  return {
    content: null,
    toolCalls: [
      { id: `mock_${name}_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ],
    mocked: true,
  };
}
