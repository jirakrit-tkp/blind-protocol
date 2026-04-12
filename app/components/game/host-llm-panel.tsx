"use client";

import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import {
  type HostLlmSettingsPublic,
  isRoomLlmReadyPublic,
  type SetHostLlmBody,
} from "@/lib/host-llm-config";

export type HostLlmPanelProps = {
  settings: HostLlmSettingsPublic;
  saving: boolean;
  onSave: (body: SetHostLlmBody) => Promise<void>;
  /** When false, form is read-only (only the host can save in the lobby). */
  canEdit?: boolean;
  /** Optional message when read-only (e.g. game already started). */
  readOnlyNotice?: string;
};

export function HostLlmPanel({
  settings,
  saving,
  onSave,
  canEdit = true,
  readOnlyNotice,
}: HostLlmPanelProps) {
  const formId = useId();
  const [provider, setProvider] = useState<"ollama" | "openai">(
    settings.provider
  );
  const [ollamaHost, setOllamaHost] = useState(settings.ollamaHost);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(settings.openaiBaseUrl);
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [clearOpenAiKey, setClearOpenAiKey] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const canRunSavedTest = Boolean(
    canEdit && isRoomLlmReadyPublic(settings)
  );

  const inputClass =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const body: SetHostLlmBody = {
      useCustomLlm: true,
      provider,
      ollamaHost,
      ollamaModel,
      openaiBaseUrl,
      openaiModel,
    };
    if (provider === "openai") {
      if (clearOpenAiKey) {
        body.openaiApiKey = "";
      } else if (openaiKeyInput.trim()) {
        body.openaiApiKey = openaiKeyInput.trim();
      }
    }
    setTestMessage(null);
    await onSave(body);
  };

  const handleClearCredentials = async () => {
    if (!canEdit) return;
    setTestMessage(null);
    await onSave({ useCustomLlm: false });
  };

  const handleTestSaved = async () => {
    if (!canRunSavedTest) return;
    setTestBusy(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/game/host-llm/test", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        replyPreview?: string;
        error?: string;
      };
      if (!res.ok) {
        setTestMessage(data.error ?? "Connection test failed");
        return;
      }
      setTestMessage(
        data.replyPreview
          ? `Model reply: ${data.replyPreview}`
          : "Connected (empty reply)"
      );
    } catch {
      setTestMessage("Could not reach the server");
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        Each room supplies its own credentials — no server env fallback. API
        keys are not sent back to the browser after save.
      </p>
      {!canEdit ? (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {readOnlyNotice ??
            "Read-only — only the room host can save, and only in the lobby."}
        </p>
      ) : null}

      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <section
          className="crt-card w-full rounded-xl border-2 px-4 py-3"
          aria-label="LLM connection"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Provider
          </p>
          <div
            className="mt-2 inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-600"
            role="group"
            aria-label="LLM provider"
          >
            <button
              type="button"
              onClick={() => setProvider("ollama")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                provider === "ollama"
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              aria-pressed={provider === "ollama"}
            >
              Ollama
            </button>
            <button
              type="button"
              onClick={() => setProvider("openai")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                provider === "openai"
                  ? "bg-violet-600 text-white dark:bg-violet-500"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              aria-pressed={provider === "openai"}
            >
              OpenAI-compatible
            </button>
          </div>

          {provider === "ollama" ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Ollama
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Host URL
                </span>
                <input
                  type="text"
                  value={ollamaHost}
                  onChange={(ev) => setOllamaHost(ev.target.value)}
                  placeholder="http://127.0.0.1:11434"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Model
                </span>
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(ev) => setOllamaModel(ev.target.value)}
                  placeholder="qwen2.5:14b-instruct"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                On public hosting, private URLs (localhost / 192.168.x) may be
                blocked — use a tunnel or set LLM_ALLOW_PRIVATE_OLLAMA_HOST on
                the server if you accept the risk.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3 border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                OpenAI-compatible
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Base URL
                </span>
                <input
                  type="text"
                  value={openaiBaseUrl}
                  onChange={(ev) => setOpenaiBaseUrl(ev.target.value)}
                  placeholder="https://api.openai.com/v1"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Model
                </span>
                <input
                  type="text"
                  value={openaiModel}
                  onChange={(ev) => setOpenaiModel(ev.target.value)}
                  placeholder="gpt-4o-mini"
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  API key
                </span>
                <input
                  type="password"
                  value={openaiKeyInput}
                  onChange={(ev) => setOpenaiKeyInput(ev.target.value)}
                  placeholder={
                    settings.hasOpenAiKey
                      ? "Leave blank to keep existing key"
                      : "sk-…"
                  }
                  autoComplete="off"
                  className={inputClass}
                />
              </label>
              {settings.hasOpenAiKey ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={clearOpenAiKey}
                    onChange={(ev) => setClearOpenAiKey(ev.target.checked)}
                    className="h-4 w-4 rounded border-zinc-400"
                  />
                  <span>Remove stored API key for this room</span>
                </label>
              ) : null}
            </div>
          )}

          <fieldset
            disabled={!canEdit}
            className="m-0 mt-4 border-0 border-t border-violet-200/50 p-0 pt-4 dark:border-violet-800/30"
          >
            <BusyButton
              type="submit"
              loading={saving}
              loadingLabel="Saving…"
              className="crt-btn-cta w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Save connection
            </BusyButton>
            {canEdit ? (
              <button
                type="button"
                onClick={() => void handleClearCredentials()}
                disabled={saving || !settings.useCustomLlm}
                className="mt-2 w-full rounded-lg border-2 border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-200 dark:hover:bg-rose-950/40"
              >
                Clear room credentials
              </button>
            ) : null}
          </fieldset>
        </section>

        {canEdit ? (
          <section
            className="crt-card-muted rounded-xl border border-dashed px-5 py-4 text-left"
            aria-label="Connection test"
          >
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Test uses values already saved on the server (save first).
            </p>
            <button
              type="button"
              onClick={() => void handleTestSaved()}
              disabled={!canRunSavedTest || testBusy || saving}
              className="crt-btn-cta mt-3 w-full rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
            >
              {testBusy ? "Testing…" : "Test connection"}
            </button>
          </section>
        ) : null}
        {testMessage ? (
          <p
            className="crt-card rounded-lg border px-3 py-2 font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
            role="status"
          >
            {testMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}

HostLlmPanel.displayName = "HostLlmPanel";
