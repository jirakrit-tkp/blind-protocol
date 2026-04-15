import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { HostLlmRoomConfig } from "./types";

const ENC_PREFIX = "enc:v1:";
const KEY_FIELDS: Array<"openaiApiKey" | "geminiApiKey" | "customApiKey"> = [
  "openaiApiKey",
  "geminiApiKey",
  "customApiKey",
];

function getSecretsMasterKey(): Buffer | null {
  const raw =
    process.env.LLM_SECRETS_KEY?.trim() ?? process.env.GAME_PASSCODE?.trim() ?? "";
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isSecretsEncryptionConfigured(): boolean {
  return Boolean(getSecretsMasterKey());
}

function encryptSecret(plain: string): string {
  const key = getSecretsMasterKey();
  if (!key) {
    throw new Error(
      "LLM_SECRETS_KEY (or GAME_PASSCODE fallback) is required to store room API keys securely"
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  return `${ENC_PREFIX}${packed}`;
}

function decryptSecret(stored: string): string | undefined {
  if (!stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext values remain readable; rewritten encrypted on next save.
    return stored.trim() ? stored : undefined;
  }
  const key = getSecretsMasterKey();
  if (!key) return undefined;
  const packed = stored.slice(ENC_PREFIX.length);
  try {
    const raw = Buffer.from(packed, "base64");
    if (raw.length < 29) return undefined;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8"
    );
    return plain.trim() ? plain : undefined;
  } catch {
    return undefined;
  }
}

export function encryptHostLlmSecretsForStorage(
  hostLlm: HostLlmRoomConfig | undefined
): HostLlmRoomConfig | undefined {
  if (!hostLlm) return undefined;
  const out: HostLlmRoomConfig = { ...hostLlm };
  for (const keyField of KEY_FIELDS) {
    const raw = out[keyField];
    if (!raw?.trim()) {
      out[keyField] = undefined;
      continue;
    }
    if (raw.startsWith(ENC_PREFIX)) continue;
    out[keyField] = encryptSecret(raw);
  }
  return out;
}

export function hasAnyHostLlmSecret(hostLlm: HostLlmRoomConfig | undefined): boolean {
  if (!hostLlm) return false;
  return KEY_FIELDS.some((k) => Boolean(hostLlm[k]?.trim()));
}

export function decryptHostLlmSecretsFromStorage(
  hostLlm: HostLlmRoomConfig | undefined
): HostLlmRoomConfig | undefined {
  if (!hostLlm) return undefined;
  const out: HostLlmRoomConfig = { ...hostLlm };
  for (const keyField of KEY_FIELDS) {
    const raw = out[keyField];
    if (!raw?.trim()) {
      out[keyField] = undefined;
      continue;
    }
    out[keyField] = decryptSecret(raw);
  }
  return out;
}
