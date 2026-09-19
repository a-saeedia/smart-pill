export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RouteOptions {
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export type RouteResult =
  | { ok: true; content: string; model: string }
  | { ok: false; error: string };

/** Minimal OpenAI-compatible client for OpenRouter escalation. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: RouteOptions,
): Promise<RouteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        max_tokens: opts.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `OpenRouter ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "OpenRouter returned no content" };
    return { ok: true, content, model: data.model ?? opts.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.includes("abort") ? "request timed out" : msg };
  } finally {
    clearTimeout(timer);
  }
}