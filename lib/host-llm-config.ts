import type { HostLlmRoomConfig, Room } from "./types";

/** Safe subset returned to the room host in the lobby (no API keys). */
export type HostLlmSettingsPublic = {
  /** True when room has explicitly saved host LLM config. */
  hasRoomConfig: boolean;
  mode: "preset" | "custom";
  useCustomLlm: boolean;
  provider: "ollama" | "openai" | "gemini" | "custom";
  ollamaHost: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  hasOpenAiKey: boolean;
  geminiBaseUrl: string;
  geminiModel: string;
  hasGeminiKey: boolean;
  customBaseUrl: string;
  customPath: string;
  customMethod: "GET" | "POST" | "PUT" | "PATCH";
  customHeadersTemplate: string;
  customBodyTemplate: string;
  customResponsePath: string;
  customModel: string;
  hasCustomApiKey: boolean;
  presetReady: boolean;
  modelByAgent: Partial<Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>>;
};

const MAX_URL = 512;
const MAX_MODEL = 128;
const MAX_KEY = 4096;

export type EffectiveLlmConfig = {
  provider: "ollama" | "openai" | "gemini" | "custom";
  ollamaHost: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey?: string;
  geminiBaseUrl: string;
  geminiModel: string;
  geminiApiKey?: string;
  customBaseUrl: string;
  customPath: string;
  customMethod: "GET" | "POST" | "PUT" | "PATCH";
  customHeadersTemplate: string;
  customBodyTemplate: string;
  customResponsePath: string;
  customModel: string;
  customApiKey?: string;
  modelByAgent: Partial<Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>>;
};

export function getPresetLlmConfig(): EffectiveLlmConfig {
  const providerRaw = process.env.LLM_PRESET_PROVIDER?.trim().toLowerCase();
  const provider =
    providerRaw === "openai"
      ? "openai"
      : providerRaw === "gemini"
        ? "gemini"
        : "ollama";
  const ollamaHost = (
    process.env.LLM_PRESET_OLLAMA_HOST ?? "http://127.0.0.1:11434"
  ).trim();
  const ollamaModel = (
    process.env.LLM_PRESET_OLLAMA_MODEL ?? "qwen2.5:14b-instruct"
  ).trim();
  const openaiBaseUrl = (
    process.env.LLM_PRESET_OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ).trim();
  const openaiModel = (process.env.LLM_PRESET_OPENAI_MODEL ?? "gpt-4o-mini").trim();
  const openaiApiKey = process.env.LLM_PRESET_OPENAI_API_KEY?.trim() || undefined;
  const geminiBaseUrl = (
    process.env.LLM_PRESET_GEMINI_BASE_URL ??
    "https://generativelanguage.googleapis.com/v1beta"
  ).trim();
  const geminiModel = (process.env.LLM_PRESET_GEMINI_MODEL ?? "gemini-1.5-flash").trim();
  const geminiApiKey = process.env.LLM_PRESET_GEMINI_API_KEY?.trim() || undefined;
  return {
    provider,
    ollamaHost,
    ollamaModel,
    openaiBaseUrl,
    openaiModel,
    openaiApiKey,
    geminiBaseUrl,
    geminiModel,
    geminiApiKey,
    customBaseUrl: "",
    customPath: "",
    customMethod: "POST",
    customHeadersTemplate: "",
    customBodyTemplate: "",
    customResponsePath: "",
    customModel: "",
    customApiKey: undefined,
    modelByAgent: {},
  };
}

function isEffectiveLlmConfigReady(config: EffectiveLlmConfig): boolean {
  if (config.provider === "custom") {
    return Boolean(
      config.customBaseUrl.trim() &&
        config.customPath.trim() &&
        config.customMethod &&
        config.customResponsePath.trim()
    );
  }
  if (config.provider === "openai") {
    return Boolean(
      config.openaiBaseUrl.trim() &&
        config.openaiModel.trim() &&
        config.openaiApiKey?.trim()
    );
  }
  if (config.provider === "gemini") {
    return Boolean(
      config.geminiBaseUrl.trim() &&
        config.geminiModel.trim() &&
        config.geminiApiKey?.trim()
    );
  }
  return Boolean(config.ollamaHost.trim() && config.ollamaModel.trim());
}

export function resolveEffectiveLlmConfig(
  hostLlm: HostLlmRoomConfig | undefined | null
): EffectiveLlmConfig | null {
  const mode = hostLlm?.mode ?? (hostLlm?.useCustomLlm ? "custom" : "preset");
  if (mode === "preset") {
    const preset = getPresetLlmConfig();
    return isEffectiveLlmConfigReady(preset) ? preset : null;
  }
  if (!hostLlm?.useCustomLlm) return null;
  const custom: EffectiveLlmConfig = {
    provider: hostLlm.provider,
    ollamaHost: hostLlm.ollamaHost,
    ollamaModel: hostLlm.ollamaModel,
    openaiBaseUrl: hostLlm.openaiBaseUrl,
    openaiModel: hostLlm.openaiModel,
    openaiApiKey: hostLlm.openaiApiKey,
    geminiBaseUrl: hostLlm.geminiBaseUrl,
    geminiModel: hostLlm.geminiModel,
    geminiApiKey: hostLlm.geminiApiKey,
    customBaseUrl: hostLlm.customBaseUrl,
    customPath: hostLlm.customPath,
    customMethod: hostLlm.customMethod,
    customHeadersTemplate: hostLlm.customHeadersTemplate,
    customBodyTemplate: hostLlm.customBodyTemplate,
    customResponsePath: hostLlm.customResponsePath,
    customModel: hostLlm.customModel,
    customApiKey: hostLlm.customApiKey,
    modelByAgent: hostLlm.modelByAgent ?? {},
  };
  return isEffectiveLlmConfigReady(custom) ? custom : null;
}

export function isRoomHost(room: Room, playerId: string): boolean {
  const first = room.players[0];
  return Boolean(first && first.id === playerId);
}

export function hostLlmToPublicSettings(
  hostLlm: HostLlmRoomConfig | undefined
): HostLlmSettingsPublic {
  const h = hostLlm;
  const mode = h?.mode ?? (h?.useCustomLlm ? "custom" : "preset");
  const presetReady = Boolean(resolveEffectiveLlmConfig(undefined));
  return {
    hasRoomConfig: Boolean(h),
    mode,
    useCustomLlm: Boolean(h?.useCustomLlm),
    provider:
      h?.provider === "openai"
        ? "openai"
        : h?.provider === "gemini"
          ? "gemini"
        : h?.provider === "custom"
          ? "custom"
          : "ollama",
    ollamaHost: typeof h?.ollamaHost === "string" ? h.ollamaHost : "",
    ollamaModel: typeof h?.ollamaModel === "string" ? h.ollamaModel : "",
    openaiBaseUrl: typeof h?.openaiBaseUrl === "string" ? h.openaiBaseUrl : "",
    openaiModel: typeof h?.openaiModel === "string" ? h.openaiModel : "",
    hasOpenAiKey: Boolean(h?.openaiApiKey?.trim()),
    geminiBaseUrl: typeof h?.geminiBaseUrl === "string" ? h.geminiBaseUrl : "",
    geminiModel: typeof h?.geminiModel === "string" ? h.geminiModel : "",
    hasGeminiKey: Boolean(h?.geminiApiKey?.trim()),
    customBaseUrl: typeof h?.customBaseUrl === "string" ? h.customBaseUrl : "",
    customPath: typeof h?.customPath === "string" ? h.customPath : "",
    customMethod:
      h?.customMethod === "GET" ||
      h?.customMethod === "POST" ||
      h?.customMethod === "PUT" ||
      h?.customMethod === "PATCH"
        ? h.customMethod
        : "POST",
    customHeadersTemplate:
      typeof h?.customHeadersTemplate === "string" ? h.customHeadersTemplate : "",
    customBodyTemplate:
      typeof h?.customBodyTemplate === "string" ? h.customBodyTemplate : "",
    customResponsePath:
      typeof h?.customResponsePath === "string" ? h.customResponsePath : "",
    customModel: typeof h?.customModel === "string" ? h.customModel : "",
    hasCustomApiKey: Boolean(h?.customApiKey?.trim()),
    presetReady,
    modelByAgent: h?.modelByAgent ?? {},
  };
}

/** True when room config resolves to a complete effective LLM setup. */
export function isRoomLlmConfigured(
  hostLlm: HostLlmRoomConfig | undefined | null
): boolean {
  // No room-level config saved yet -> treat as unconfigured.
  if (!hostLlm) return false;
  return Boolean(resolveEffectiveLlmConfig(hostLlm));
}

/** Client-side mirror of {@link isRoomLlmConfigured} using redacted settings from GET /state. */
export function isRoomLlmReadyPublic(s: HostLlmSettingsPublic): boolean {
  if (s.mode === "preset") return s.hasRoomConfig && s.presetReady;
  if (!s.useCustomLlm) return false;
  if (s.provider === "custom") {
    return Boolean(
      s.customBaseUrl.trim() &&
        s.customPath.trim() &&
        s.customMethod &&
        s.customResponsePath.trim()
    );
  }
  if (s.provider === "openai") {
    return Boolean(
      s.openaiBaseUrl.trim() && s.openaiModel.trim() && s.hasOpenAiKey
    );
  }
  if (s.provider === "gemini") {
    return Boolean(s.geminiBaseUrl.trim() && s.geminiModel.trim() && s.hasGeminiKey);
  }
  return Boolean(s.ollamaHost.trim() && s.ollamaModel.trim());
}

function allowPrivateOllamaHosts(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.LLM_ALLOW_PRIVATE_OLLAMA_HOST === "true"
  );
}

/** Block obvious SSRF targets when the server will fetch the URL (production by default). */
export function assertOllamaHostAllowedForFetch(urlString: string): void {
  if (allowPrivateOllamaHosts()) return;
  let hostname: string;
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Ollama URL must use http or https");
    }
    hostname = u.hostname.toLowerCase();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("Invalid Ollama URL");
    }
    throw e;
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    throw new Error(
      "This Ollama host is not allowed on the deployed server. Use a public URL or tunnel, or set LLM_ALLOW_PRIVATE_OLLAMA_HOST=true if you accept the risk."
    );
  }

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    }
    if (a === 192 && b === 168) {
      throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    }
    if (a === 127) {
      throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    }
    if (a === 169 && b === 254) {
      throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    }
    if (a === 0) {
      throw new Error("Private IP ranges are not allowed for Ollama URL in production");
    }
  }

  if (hostname.endsWith(".local")) {
    throw new Error("Local hostnames are not allowed for Ollama URL in production");
  }
}

function trimLen(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export type SetHostLlmBody = {
  /** Clear room-level AI config and fall back to unconfigured state. */
  reset?: boolean;
  /** Allow partial/incomplete custom config for immediate key removal flows. */
  allowIncompleteSave?: boolean;
  mode?: "preset" | "custom";
  useCustomLlm?: boolean;
  /** Required when switching/saving preset mode on protected deployments. */
  presetPasscode?: string;
  provider?: "ollama" | "openai" | "gemini" | "custom";
  ollamaHost?: string;
  ollamaModel?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  /** Omit = keep existing. Empty string = clear stored key. */
  openaiApiKey?: string;
  geminiBaseUrl?: string;
  geminiModel?: string;
  geminiApiKey?: string;
  customBaseUrl?: string;
  customPath?: string;
  customMethod?: "GET" | "POST" | "PUT" | "PATCH";
  customHeadersTemplate?: string;
  customBodyTemplate?: string;
  customResponsePath?: string;
  customModel?: string;
  customApiKey?: string;
  modelByAgent?: Partial<Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>>;
};

function sanitizeModelByAgent(
  input: SetHostLlmBody["modelByAgent"] | HostLlmRoomConfig["modelByAgent"] | undefined
): Partial<Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>> {
  const out: Partial<Record<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test", string>> = {};
  const src = input ?? {};
  const keys: Array<"setup" | "narrator" | "scene" | "outcome" | "translator" | "test"> = [
    "setup",
    "narrator",
    "scene",
    "outcome",
    "translator",
    "test",
  ];
  for (const key of keys) {
    const raw = src[key];
    if (typeof raw !== "string") continue;
    const trimmed = trimLen(raw, MAX_MODEL);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

export function mergeHostLlmUpdate(
  existing: HostLlmRoomConfig | undefined,
  body: SetHostLlmBody
):
  | { ok: true; config: HostLlmRoomConfig }
  | { ok: false; error: string } {
  const useCustomLlm = Boolean(body.useCustomLlm);
  const mode = body.mode === "preset" ? "preset" : "custom";

  if (!useCustomLlm || mode === "preset") {
    return {
      ok: true,
      config: {
        mode: "preset",
        useCustomLlm: false,
        provider: "ollama",
        ollamaHost: "",
        ollamaModel: "",
        openaiBaseUrl: "",
        openaiModel: "",
        openaiApiKey: undefined,
        geminiBaseUrl: "",
        geminiModel: "",
        geminiApiKey: undefined,
        customBaseUrl: "",
        customPath: "",
        customMethod: "POST",
        customHeadersTemplate: "",
        customBodyTemplate: "",
        customResponsePath: "",
        customModel: "",
        customApiKey: undefined,
        modelByAgent: {},
      },
    };
  }

  const provider =
    body.provider === "openai"
      ? "openai"
      : body.provider === "gemini"
        ? "gemini"
      : body.provider === "custom"
        ? "custom"
        : "ollama";

  const ollamaHost = trimLen(body.ollamaHost ?? "", MAX_URL);
  const ollamaModel = trimLen(body.ollamaModel ?? "", MAX_MODEL);
  const openaiBaseUrl = trimLen(body.openaiBaseUrl ?? "", MAX_URL);
  const openaiModel = trimLen(body.openaiModel ?? "", MAX_MODEL);
  const geminiBaseUrl = trimLen(body.geminiBaseUrl ?? "", MAX_URL);
  const geminiModel = trimLen(body.geminiModel ?? "", MAX_MODEL);
  const customBaseUrl = trimLen(body.customBaseUrl ?? "", MAX_URL);
  const customPath = trimLen(body.customPath ?? "", MAX_URL);
  const customMethod = body.customMethod ?? "POST";
  const customHeadersTemplate = trimLen(body.customHeadersTemplate ?? "", MAX_KEY);
  const customBodyTemplate = trimLen(body.customBodyTemplate ?? "", MAX_KEY);
  const customResponsePath = trimLen(body.customResponsePath ?? "", MAX_MODEL);
  const customModel = trimLen(body.customModel ?? "", MAX_MODEL);

  if (useCustomLlm && provider === "ollama") {
    if (!ollamaHost) {
      return { ok: false, error: "Ollama host is required" };
    }
    if (!ollamaModel) {
      return { ok: false, error: "Ollama model is required" };
    }
    try {
      assertOllamaHostAllowedForFetch(
        ollamaHost.includes("://") ? ollamaHost : `http://${ollamaHost}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Ollama URL";
      return { ok: false, error: msg };
    }
  }

  if (useCustomLlm && provider === "openai") {
    if (!openaiBaseUrl) {
      return { ok: false, error: "OpenAI base URL is required" };
    }
    if (!openaiModel) {
      return { ok: false, error: "OpenAI model is required" };
    }
    try {
      const u = new URL(openaiBaseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: "OpenAI base URL must use http or https" };
      }
    } catch {
      return { ok: false, error: "Invalid OpenAI base URL" };
    }
  }

  if (useCustomLlm && provider === "custom") {
    if (!customBaseUrl) {
      return { ok: false, error: "Custom base URL is required" };
    }
    if (!customPath) {
      return { ok: false, error: "Custom path is required" };
    }
    if (!customResponsePath) {
      return { ok: false, error: "Custom response path is required" };
    }
    try {
      const u = new URL(customBaseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: "Custom base URL must use http or https" };
      }
    } catch {
      return { ok: false, error: "Invalid custom base URL" };
    }
  }
  if (useCustomLlm && provider === "gemini") {
    if (!geminiBaseUrl) return { ok: false, error: "Gemini base URL is required" };
    if (!geminiModel) return { ok: false, error: "Gemini model is required" };
    try {
      const u = new URL(geminiBaseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: "Gemini base URL must use http or https" };
      }
    } catch {
      return { ok: false, error: "Invalid Gemini base URL" };
    }
  }

  let openaiApiKey = existing?.openaiApiKey;
  if (body.openaiApiKey !== undefined) {
    const k = body.openaiApiKey.trim();
    if (k === "") {
      openaiApiKey = undefined;
    } else {
      openaiApiKey = trimLen(k, MAX_KEY);
    }
  }
  let customApiKey = existing?.customApiKey;
  if (body.customApiKey !== undefined) {
    const k = body.customApiKey.trim();
    customApiKey = k ? trimLen(k, MAX_KEY) : undefined;
  }
  let geminiApiKey = existing?.geminiApiKey;
  if (body.geminiApiKey !== undefined) {
    const k = body.geminiApiKey.trim();
    geminiApiKey = k ? trimLen(k, MAX_KEY) : undefined;
  }

  if (!body.allowIncompleteSave && useCustomLlm && provider === "openai") {
    const hasKey = Boolean(openaiApiKey?.trim());
    if (!hasKey) {
      return {
        ok: false,
        error: "OpenAI-compatible API key is required for this room.",
      };
    }
  }
  if (!body.allowIncompleteSave && useCustomLlm && provider === "gemini") {
    const hasKey = Boolean(geminiApiKey?.trim());
    if (!hasKey) {
      return { ok: false, error: "Gemini API key is required for this room." };
    }
  }

  const config: HostLlmRoomConfig = {
    mode: "custom",
    useCustomLlm,
    provider,
    ollamaHost,
    ollamaModel,
    openaiBaseUrl,
    openaiModel,
    openaiApiKey,
    geminiBaseUrl,
    geminiModel,
    geminiApiKey,
    customBaseUrl,
    customPath,
    customMethod,
    customHeadersTemplate,
    customBodyTemplate,
    customResponsePath,
    customModel,
    customApiKey,
    modelByAgent: sanitizeModelByAgent(body.modelByAgent ?? existing?.modelByAgent),
  };

  if (!body.allowIncompleteSave && useCustomLlm && !isRoomLlmConfigured(config)) {
    return { ok: false, error: "LLM configuration is incomplete" };
  }

  return { ok: true, config };
}

export function coerceHostLlmFromSnapshot(
  raw: unknown
): HostLlmRoomConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const useCustomLlm = Boolean(o.useCustomLlm);
  const mode =
    o.mode === "preset" || o.mode === "custom"
      ? o.mode
      : useCustomLlm
        ? "custom"
        : "preset";
  return {
    mode,
    useCustomLlm,
    provider:
      o.provider === "openai"
        ? "openai"
        : o.provider === "gemini"
          ? "gemini"
        : o.provider === "custom"
          ? "custom"
          : "ollama",
    ollamaHost: typeof o.ollamaHost === "string" ? o.ollamaHost : "",
    ollamaModel: typeof o.ollamaModel === "string" ? o.ollamaModel : "",
    openaiBaseUrl: typeof o.openaiBaseUrl === "string" ? o.openaiBaseUrl : "",
    openaiModel: typeof o.openaiModel === "string" ? o.openaiModel : "",
    openaiApiKey:
      typeof o.openaiApiKey === "string" && o.openaiApiKey.trim()
        ? o.openaiApiKey
        : undefined,
    geminiBaseUrl: typeof o.geminiBaseUrl === "string" ? o.geminiBaseUrl : "",
    geminiModel: typeof o.geminiModel === "string" ? o.geminiModel : "",
    geminiApiKey:
      typeof o.geminiApiKey === "string" && o.geminiApiKey.trim()
        ? o.geminiApiKey
        : undefined,
    customBaseUrl: typeof o.customBaseUrl === "string" ? o.customBaseUrl : "",
    customPath: typeof o.customPath === "string" ? o.customPath : "",
    customMethod:
      o.customMethod === "GET" ||
      o.customMethod === "POST" ||
      o.customMethod === "PUT" ||
      o.customMethod === "PATCH"
        ? o.customMethod
        : "POST",
    customHeadersTemplate:
      typeof o.customHeadersTemplate === "string" ? o.customHeadersTemplate : "",
    customBodyTemplate:
      typeof o.customBodyTemplate === "string" ? o.customBodyTemplate : "",
    customResponsePath:
      typeof o.customResponsePath === "string" ? o.customResponsePath : "",
    customModel: typeof o.customModel === "string" ? o.customModel : "",
    customApiKey:
      typeof o.customApiKey === "string" && o.customApiKey.trim()
        ? o.customApiKey
        : undefined,
    modelByAgent: sanitizeModelByAgent(
      o.modelByAgent && typeof o.modelByAgent === "object"
        ? (o.modelByAgent as HostLlmRoomConfig["modelByAgent"])
        : undefined
    ),
  };
}
