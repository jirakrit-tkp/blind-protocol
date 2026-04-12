import type { HostLlmRoomConfig, Room } from "./types";

/** Safe subset returned to the room host in the lobby (no API keys). */
export type HostLlmSettingsPublic = {
  useCustomLlm: boolean;
  provider: "ollama" | "openai";
  ollamaHost: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  hasOpenAiKey: boolean;
};

const MAX_URL = 512;
const MAX_MODEL = 128;
const MAX_KEY = 4096;

export function isRoomHost(room: Room, playerId: string): boolean {
  const first = room.players[0];
  return Boolean(first && first.id === playerId);
}

export function hostLlmToPublicSettings(
  hostLlm: HostLlmRoomConfig | undefined
): HostLlmSettingsPublic {
  const h = hostLlm;
  return {
    useCustomLlm: Boolean(h?.useCustomLlm),
    provider: h?.provider === "openai" ? "openai" : "ollama",
    ollamaHost: typeof h?.ollamaHost === "string" ? h.ollamaHost : "",
    ollamaModel: typeof h?.ollamaModel === "string" ? h.ollamaModel : "",
    openaiBaseUrl: typeof h?.openaiBaseUrl === "string" ? h.openaiBaseUrl : "",
    openaiModel: typeof h?.openaiModel === "string" ? h.openaiModel : "",
    hasOpenAiKey: Boolean(h?.openaiApiKey?.trim()),
  };
}

/** True when this room snapshot has a complete LLM setup (no server env fallback). */
export function isRoomLlmConfigured(
  hostLlm: HostLlmRoomConfig | undefined | null
): boolean {
  if (!hostLlm?.useCustomLlm) return false;
  if (hostLlm.provider === "openai") {
    const base = hostLlm.openaiBaseUrl?.trim() ?? "";
    const model = hostLlm.openaiModel?.trim() ?? "";
    const key = hostLlm.openaiApiKey?.trim() ?? "";
    return Boolean(base && model && key);
  }
  const host = hostLlm.ollamaHost?.trim() ?? "";
  const model = hostLlm.ollamaModel?.trim() ?? "";
  return Boolean(host && model);
}

/** Client-side mirror of {@link isRoomLlmConfigured} using redacted settings from GET /state. */
export function isRoomLlmReadyPublic(s: HostLlmSettingsPublic): boolean {
  if (!s.useCustomLlm) return false;
  if (s.provider === "openai") {
    return Boolean(
      s.openaiBaseUrl.trim() && s.openaiModel.trim() && s.hasOpenAiKey
    );
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
  useCustomLlm?: boolean;
  provider?: string;
  ollamaHost?: string;
  ollamaModel?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  /** Omit = keep existing. Empty string = clear stored key. */
  openaiApiKey?: string;
};

export function mergeHostLlmUpdate(
  existing: HostLlmRoomConfig | undefined,
  body: SetHostLlmBody
):
  | { ok: true; config: HostLlmRoomConfig }
  | { ok: false; error: string } {
  const useCustomLlm = Boolean(body.useCustomLlm);

  if (!useCustomLlm) {
    return {
      ok: true,
      config: {
        useCustomLlm: false,
        provider: "ollama",
        ollamaHost: "",
        ollamaModel: "",
        openaiBaseUrl: "",
        openaiModel: "",
        openaiApiKey: undefined,
      },
    };
  }

  const provider =
    body.provider?.toLowerCase().trim() === "openai" ? "openai" : "ollama";

  const ollamaHost = trimLen(body.ollamaHost ?? "", MAX_URL);
  const ollamaModel = trimLen(body.ollamaModel ?? "", MAX_MODEL);
  const openaiBaseUrl = trimLen(body.openaiBaseUrl ?? "", MAX_URL);
  const openaiModel = trimLen(body.openaiModel ?? "", MAX_MODEL);

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

  let openaiApiKey = existing?.openaiApiKey;
  if (body.openaiApiKey !== undefined) {
    const k = body.openaiApiKey.trim();
    if (k === "") {
      openaiApiKey = undefined;
    } else {
      openaiApiKey = trimLen(k, MAX_KEY);
    }
  }

  if (useCustomLlm && provider === "openai") {
    const hasKey = Boolean(openaiApiKey?.trim());
    if (!hasKey) {
      return {
        ok: false,
        error: "OpenAI-compatible API key is required for this room.",
      };
    }
  }

  const config: HostLlmRoomConfig = {
    useCustomLlm,
    provider,
    ollamaHost,
    ollamaModel,
    openaiBaseUrl,
    openaiModel,
    openaiApiKey,
  };

  if (useCustomLlm && !isRoomLlmConfigured(config)) {
    return { ok: false, error: "LLM configuration is incomplete" };
  }

  return { ok: true, config };
}

export function coerceHostLlmFromSnapshot(
  raw: unknown
): HostLlmRoomConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    useCustomLlm: Boolean(o.useCustomLlm),
    provider: o.provider === "openai" ? "openai" : "ollama",
    ollamaHost: typeof o.ollamaHost === "string" ? o.ollamaHost : "",
    ollamaModel: typeof o.ollamaModel === "string" ? o.ollamaModel : "",
    openaiBaseUrl: typeof o.openaiBaseUrl === "string" ? o.openaiBaseUrl : "",
    openaiModel: typeof o.openaiModel === "string" ? o.openaiModel : "",
    openaiApiKey:
      typeof o.openaiApiKey === "string" && o.openaiApiKey.trim()
        ? o.openaiApiKey
        : undefined,
  };
}
