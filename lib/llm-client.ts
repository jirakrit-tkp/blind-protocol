/** Server-side LLM: Ollama (/api/generate) or OpenAI-compatible Chat Completions. */

import { assertOllamaHostAllowedForFetch } from "./host-llm-config";
import type { HostLlmRoomConfig } from "./types";

export type LlmProvider = "ollama" | "openai";

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getLlmProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER?.toLowerCase().trim();
  if (p === "openai") return "openai";
  return "ollama";
}

function envOllamaBaseUrl(): string {
  const raw = process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
  return stripTrailingSlashes(raw);
}

function envOllamaModel(): string {
  return (
    process.env.OLLAMA_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "qwen2.5:14b-instruct"
  );
}

function envOpenAiBaseUrl(): string {
  const raw =
    process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  return stripTrailingSlashes(raw);
}

function envOpenAiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

type ResolvedLlmCall = {
  provider: LlmProvider;
  ollamaBase: string;
  ollamaModel: string;
  openAiBase: string;
  openAiModel: string;
  openAiKey: string;
  /** Room supplied a non-empty Ollama host — enforce SSRF rules on fetch. */
  userSuppliedOllamaHost: boolean;
};

function normalizeOllamaInputHost(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const withProto = t.includes("://") ? t : `http://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return stripTrailingSlashes(`${u.protocol}//${u.host}`);
  } catch {
    return "";
  }
}

function resolveLlmCall(hostLlm?: HostLlmRoomConfig | null): ResolvedLlmCall {
  if (!hostLlm?.useCustomLlm) {
    return {
      provider: getLlmProvider(),
      ollamaBase: envOllamaBaseUrl(),
      ollamaModel: envOllamaModel(),
      openAiBase: envOpenAiBaseUrl(),
      openAiModel: envOpenAiModel(),
      openAiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
      userSuppliedOllamaHost: false,
    };
  }

  const provider: LlmProvider =
    hostLlm.provider === "openai" ? "openai" : "ollama";
  const customOllama = normalizeOllamaInputHost(hostLlm.ollamaHost ?? "");
  const ollamaBase = customOllama || envOllamaBaseUrl();
  const ollamaModel =
    hostLlm.ollamaModel?.trim() || envOllamaModel();
  const openAiBaseRaw = hostLlm.openaiBaseUrl?.trim();
  const openAiBase = openAiBaseRaw
    ? stripTrailingSlashes(
        openAiBaseRaw.includes("://")
          ? openAiBaseRaw
          : `https://${openAiBaseRaw}`
      )
    : envOpenAiBaseUrl();
  const openAiModel = hostLlm.openaiModel?.trim() || envOpenAiModel();
  const openAiKey =
    hostLlm.openaiApiKey?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";

  return {
    provider,
    ollamaBase,
    ollamaModel,
    openAiBase,
    openAiModel,
    openAiKey,
    userSuppliedOllamaHost: Boolean(customOllama),
  };
}

async function completeOllamaAt(
  baseUrl: string,
  model: string,
  prompt: string
): Promise<string> {
  const url = `${stripTrailingSlashes(baseUrl)}/api/generate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}

type OpenAiChatJson = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

async function completeOpenAiAt(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string
): Promise<string> {
  if (!apiKey) {
    throw new Error("OpenAI API key is missing for this room or server");
  }

  const url = `${stripTrailingSlashes(baseUrl)}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });

  const data = (await response.json()) as OpenAiChatJson;

  if (!response.ok) {
    const msg = data.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`OpenAI API error: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Single completion used by the game master (Blind Protocol prompts).
 * @param hostLlm Room override when `useCustomLlm`; otherwise server env defaults.
 */
export async function completeLlmPrompt(
  prompt: string,
  hostLlm?: HostLlmRoomConfig | null
): Promise<string> {
  const r = resolveLlmCall(hostLlm ?? null);
  if (r.userSuppliedOllamaHost) {
    assertOllamaHostAllowedForFetch(`${r.ollamaBase}/api/generate`);
  }
  if (r.provider === "openai") {
    return completeOpenAiAt(r.openAiBase, r.openAiModel, r.openAiKey, prompt);
  }
  return completeOllamaAt(r.ollamaBase, r.ollamaModel, prompt);
}
