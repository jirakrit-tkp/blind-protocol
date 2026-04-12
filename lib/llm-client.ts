/** Server-side LLM: Ollama (/api/generate) or OpenAI-compatible Chat Completions. */

import {
  assertOllamaHostAllowedForFetch,
  isRoomLlmConfigured,
} from "./host-llm-config";
import type { HostLlmRoomConfig } from "./types";

export type LlmProvider = "ollama" | "openai";

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
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
  if (!isRoomLlmConfigured(hostLlm)) {
    throw new Error(
      "Room LLM is not configured. The host must save Ollama or OpenAI credentials in the lobby (AI · GM)."
    );
  }

  const h = hostLlm!;
  const provider: LlmProvider =
    h.provider === "openai" ? "openai" : "ollama";

  if (provider === "openai") {
    const openAiBaseRaw = h.openaiBaseUrl.trim();
    const openAiBase = stripTrailingSlashes(
      openAiBaseRaw.includes("://")
        ? openAiBaseRaw
        : `https://${openAiBaseRaw}`
    );
    return {
      provider: "openai",
      ollamaBase: "",
      ollamaModel: "",
      openAiBase,
      openAiModel: h.openaiModel.trim(),
      openAiKey: h.openaiApiKey!.trim(),
      userSuppliedOllamaHost: false,
    };
  }

  const rawHost = h.ollamaHost.trim();
  const customOllama = normalizeOllamaInputHost(rawHost);
  const ollamaBase =
    customOllama ||
    stripTrailingSlashes(
      rawHost.includes("://") ? rawHost : `http://${rawHost}`
    );
  const ollamaModel = h.ollamaModel.trim();

  return {
    provider: "ollama",
    ollamaBase,
    ollamaModel,
    openAiBase: "",
    openAiModel: "",
    openAiKey: "",
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
