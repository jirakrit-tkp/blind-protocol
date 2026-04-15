/** Server-side LLM: Ollama, OpenAI, Gemini, or custom HTTP adapter. */

import {
  assertOllamaHostAllowedForFetch,
  resolveEffectiveLlmConfig,
} from "./host-llm-config";
import type { HostLlmRoomConfig } from "./types";

export type LlmProvider = "ollama" | "openai" | "gemini" | "custom";
export type LlmAgentKind =
  | "setup"
  | "narrator"
  | "scene"
  | "outcome"
  | "translator"
  | "test";

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
  geminiBase: string;
  geminiModel: string;
  geminiKey: string;
  customBaseUrl: string;
  customPath: string;
  customMethod: "GET" | "POST" | "PUT" | "PATCH";
  customHeadersTemplate: string;
  customBodyTemplate: string;
  customResponsePath: string;
  customModel: string;
  customApiKey: string;
  modelByAgent: Partial<
    Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>
  >;
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
  const effective = resolveEffectiveLlmConfig(hostLlm ?? null);
  if (!effective) {
    throw new Error(
      "Room LLM is not configured. Choose preset AI or save room credentials in the lobby (AI · GM)."
    );
  }
  const provider: LlmProvider =
    effective.provider === "openai"
      ? "openai"
      : effective.provider === "gemini"
        ? "gemini"
        : effective.provider === "custom"
          ? "custom"
          : "ollama";

  if (provider === "openai") {
    const openAiBaseRaw = effective.openaiBaseUrl.trim();
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
      openAiModel: effective.openaiModel.trim(),
      openAiKey: effective.openaiApiKey?.trim() ?? "",
      geminiBase: "",
      geminiModel: "",
      geminiKey: "",
      customBaseUrl: "",
      customPath: "",
      customMethod: "POST",
      customHeadersTemplate: "",
      customBodyTemplate: "",
      customResponsePath: "",
      customModel: "",
      customApiKey: "",
      modelByAgent: effective.modelByAgent,
      userSuppliedOllamaHost: false,
    };
  }
  if (provider === "custom") {
    return {
      provider: "custom",
      ollamaBase: "",
      ollamaModel: "",
      openAiBase: "",
      openAiModel: "",
      openAiKey: "",
      geminiBase: "",
      geminiModel: "",
      geminiKey: "",
      customBaseUrl: effective.customBaseUrl.trim(),
      customPath: effective.customPath.trim(),
      customMethod: effective.customMethod,
      customHeadersTemplate: effective.customHeadersTemplate,
      customBodyTemplate: effective.customBodyTemplate,
      customResponsePath: effective.customResponsePath.trim(),
      customModel: effective.customModel.trim(),
      customApiKey: effective.customApiKey?.trim() ?? "",
      modelByAgent: effective.modelByAgent,
      userSuppliedOllamaHost: false,
    };
  }
  if (provider === "gemini") {
    return {
      provider: "gemini",
      ollamaBase: "",
      ollamaModel: "",
      openAiBase: "",
      openAiModel: "",
      openAiKey: "",
      geminiBase: stripTrailingSlashes(effective.geminiBaseUrl.trim()),
      geminiModel: effective.geminiModel.trim(),
      geminiKey: effective.geminiApiKey?.trim() ?? "",
      customBaseUrl: "",
      customPath: "",
      customMethod: "POST",
      customHeadersTemplate: "",
      customBodyTemplate: "",
      customResponsePath: "",
      customModel: "",
      customApiKey: "",
      modelByAgent: effective.modelByAgent,
      userSuppliedOllamaHost: false,
    };
  }

  const rawHost = effective.ollamaHost.trim();
  const customOllama = normalizeOllamaInputHost(rawHost);
  const ollamaBase =
    customOllama ||
    stripTrailingSlashes(
      rawHost.includes("://") ? rawHost : `http://${rawHost}`
    );
  const ollamaModel = effective.ollamaModel.trim();

  return {
    provider: "ollama",
    ollamaBase,
    ollamaModel,
    openAiBase: "",
    openAiModel: "",
    openAiKey: "",
    geminiBase: "",
    geminiModel: "",
    geminiKey: "",
    customBaseUrl: "",
    customPath: "",
    customMethod: "POST",
    customHeadersTemplate: "",
    customBodyTemplate: "",
    customResponsePath: "",
    customModel: "",
    customApiKey: "",
    modelByAgent: effective.modelByAgent,
    userSuppliedOllamaHost: Boolean(customOllama),
  };
}

function selectModelForAgent(
  call: ResolvedLlmCall,
  defaultModel: string,
  agent: LlmAgentKind
): string {
  const override = call.modelByAgent[agent]?.trim() ?? "";
  return override || defaultModel;
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

type GeminiJson = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

async function completeGeminiAt(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string
): Promise<string> {
  if (!apiKey) {
    throw new Error("Gemini API key is missing for this room or server");
  }
  const url = `${stripTrailingSlashes(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  const data = (await response.json()) as GeminiJson;
  if (!response.ok) {
    const msg = data.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`Gemini API error: ${msg}`);
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return text;
}

function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return vars[key] ?? "";
  });
}

function getByDotPath(obj: unknown, path: string): unknown {
  const keys = path.split(".").map((s) => s.trim()).filter(Boolean);
  let cur: unknown = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== "object") return undefined;
    const rec = cur as Record<string, unknown>;
    cur = rec[key];
  }
  return cur;
}

function resolveCustomUrl(base: string, path: string): string {
  const cleanBase = stripTrailingSlashes(base);
  const cleanPath = path.trim().replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

async function completeCustomAt(params: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headersTemplate: string;
  bodyTemplate: string;
  responsePath: string;
  model: string;
  apiKey: string;
  prompt: string;
}): Promise<string> {
  const vars = {
    prompt: params.prompt,
    model: params.model,
    api_key: params.apiKey,
  };
  const headersRaw = params.headersTemplate.trim()
    ? interpolateTemplate(params.headersTemplate, vars)
    : '{"Content-Type":"application/json"}';
  let headers: Record<string, string>;
  try {
    headers = JSON.parse(headersRaw) as Record<string, string>;
  } catch {
    throw new Error("Invalid custom headers template (must be JSON object)");
  }

  const requestInit: RequestInit = {
    method: params.method,
    headers,
  };
  if (params.method !== "GET") {
    const bodyRaw = params.bodyTemplate.trim()
      ? interpolateTemplate(params.bodyTemplate, vars)
      : JSON.stringify({ model: vars.model, prompt: vars.prompt });
    requestInit.body = bodyRaw;
  }

  const response = await fetch(resolveCustomUrl(params.baseUrl, params.path), requestInit);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`Custom API error: ${response.status} ${response.statusText}`);
    }
    return text;
  }
  if (!response.ok) {
    throw new Error(`Custom API error: ${response.status} ${response.statusText}`);
  }
  const picked = getByDotPath(json, params.responsePath);
  if (typeof picked === "string") return picked;
  if (picked === undefined || picked === null) return "";
  return String(picked);
}

/**
 * Single completion used by the game master (Blind Protocol prompts).
 * @param hostLlm Room override when `useCustomLlm`; otherwise server env defaults.
 */
export async function completeLlmPrompt(
  prompt: string,
  hostLlm?: HostLlmRoomConfig | null,
  agent: LlmAgentKind = "narrator"
): Promise<string> {
  const r = resolveLlmCall(hostLlm ?? null);
  if (r.userSuppliedOllamaHost) {
    assertOllamaHostAllowedForFetch(`${r.ollamaBase}/api/generate`);
  }
  if (r.provider === "openai") {
    return completeOpenAiAt(
      r.openAiBase,
      selectModelForAgent(r, r.openAiModel, agent),
      r.openAiKey,
      prompt
    );
  }
  if (r.provider === "gemini") {
    return completeGeminiAt(
      r.geminiBase,
      selectModelForAgent(r, r.geminiModel, agent),
      r.geminiKey,
      prompt
    );
  }
  if (r.provider === "custom") {
    return completeCustomAt({
      baseUrl: r.customBaseUrl,
      path: r.customPath,
      method: r.customMethod,
      headersTemplate: r.customHeadersTemplate,
      bodyTemplate: r.customBodyTemplate,
      responsePath: r.customResponsePath,
      model: selectModelForAgent(r, r.customModel, agent),
      apiKey: r.customApiKey,
      prompt,
    });
  }
  return completeOllamaAt(
    r.ollamaBase,
    selectModelForAgent(r, r.ollamaModel, agent),
    prompt
  );
}
