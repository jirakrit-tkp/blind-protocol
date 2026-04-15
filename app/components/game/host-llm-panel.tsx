"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import { LobbyThemePicker } from "@/app/components/game/lobby-theme-picker";
import {
  type HostLlmSettingsPublic,
  isRoomLlmReadyPublic,
  type SetHostLlmBody,
} from "@/lib/host-llm-config";

export type HostLlmPanelProps = {
  settings: HostLlmSettingsPublic;
  saving: boolean;
  /** Resolves true when the server accepted the update. */
  onSave: (body: SetHostLlmBody) => Promise<boolean>;
  /** When false, form is read-only (only the host can save in the lobby). */
  canEdit?: boolean;
  /** Optional message when read-only (e.g. game already started). */
  readOnlyNotice?: string;
};

type InputWithUseButtonProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputClass: string;
  type?: "text" | "password";
};

type TextareaWithUseButtonProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  textareaClass: string;
  rows: number;
};

function InputWithUseButton({
  value,
  onChange,
  placeholder,
  inputClass,
  type = "text",
}: InputWithUseButtonProps) {
  const canUsePlaceholder = placeholder.trim().length > 0;
  const hasValue = value.trim().length > 0;
  const useValue = placeholder.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return (
    <div className="relative w-full">
      <input
        type={type}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputClass} w-full ${canUsePlaceholder ? "pr-14" : ""}`}
      />
      {canUsePlaceholder ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 border-0 bg-transparent! p-0 text-xs font-medium text-zinc-400 underline underline-offset-2 shadow-none! transition-colors hover:bg-transparent! hover:text-zinc-500 dark:text-zinc-500 dark:hover:bg-transparent! dark:hover:text-zinc-400"
          onClick={() => onChange(hasValue ? "" : useValue)}
        >
          {hasValue ? "Clear" : "Use"}
        </button>
      ) : null}
    </div>
  );
}

InputWithUseButton.displayName = "InputWithUseButton";

function TextareaWithUseButton({
  value,
  onChange,
  placeholder,
  textareaClass,
  rows,
}: TextareaWithUseButtonProps) {
  const canUsePlaceholder = placeholder.trim().length > 0;
  const hasValue = value.trim().length > 0;
  const useValue = placeholder.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return (
    <div className="relative w-full">
      <textarea
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        className={`${textareaClass} w-full ${canUsePlaceholder ? "pr-14" : ""}`}
        rows={rows}
      />
      {canUsePlaceholder ? (
        <button
          type="button"
          className="absolute right-2 top-2 border-0 bg-transparent! p-0 text-xs font-medium text-zinc-400 underline underline-offset-2 shadow-none! transition-colors hover:bg-transparent! hover:text-zinc-500 dark:text-zinc-500 dark:hover:bg-transparent! dark:hover:text-zinc-400"
          onClick={() => onChange(hasValue ? "" : useValue)}
        >
          {hasValue ? "Clear" : "Use"}
        </button>
      ) : null}
    </div>
  );
}

TextareaWithUseButton.displayName = "TextareaWithUseButton";

function endpointForProvider(s: HostLlmSettingsPublic): string {
  if (s.provider === "openai") return s.openaiBaseUrl;
  if (s.provider === "gemini") return s.geminiBaseUrl;
  if (s.provider === "custom") return s.customBaseUrl;
  return s.ollamaHost;
}

/** How the saved room config maps to the Type control (matches server truth). */
function sourceFromServerSettings(s: HostLlmSettingsPublic): "preset" | "local" | "api" {
  if (s.mode === "preset") return "preset";
  const endpoint = endpointForProvider(s);
  const low = endpoint.toLowerCase();
  if (
    low.includes("localhost") ||
    low.includes("127.0.0.1") ||
    low.includes("192.168.") ||
    low.includes("10.") ||
    low.includes("172.")
  ) {
    return "local";
  }
  return "api";
}

/** Initial Type when opening the form: API by default when the room still uses server preset. */
function guessInitialSource(s: HostLlmSettingsPublic): "preset" | "local" | "api" {
  if (s.mode === "preset") return "api";
  return sourceFromServerSettings(s);
}

export function HostLlmPanel({
  settings,
  saving,
  onSave,
  canEdit = true,
  readOnlyNotice,
}: HostLlmPanelProps) {
  const formId = useId();
  const pendingResetUiRef = useRef(false);
  const [source, setSource] = useState<"preset" | "local" | "api">(() =>
    guessInitialSource(settings)
  );
  /** True until a successful Save after changing Type, or when the initial Type draft matches saved server intent. */
  const [typeNeedsSave, setTypeNeedsSave] = useState(
    () => guessInitialSource(settings) !== sourceFromServerSettings(settings)
  );
  const [provider, setProvider] = useState<
    "ollama" | "openai" | "gemini" | "custom"
  >(
    settings.provider
  );
  const [ollamaHost, setOllamaHost] = useState(settings.ollamaHost);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(settings.openaiBaseUrl);
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [clearOpenAiKey, setClearOpenAiKey] = useState(false);
  const [geminiBaseUrl, setGeminiBaseUrl] = useState(settings.geminiBaseUrl);
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [clearGeminiKey, setClearGeminiKey] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState(settings.customBaseUrl);
  const [customPath, setCustomPath] = useState(settings.customPath);
  const [customMethod, setCustomMethod] = useState<
    "GET" | "POST" | "PUT" | "PATCH"
  >(settings.customMethod);
  const [customHeadersTemplate, setCustomHeadersTemplate] = useState(
    settings.customHeadersTemplate
  );
  const [customBodyTemplate, setCustomBodyTemplate] = useState(
    settings.customBodyTemplate
  );
  const [customResponsePath, setCustomResponsePath] = useState(
    settings.customResponsePath
  );
  const [customModel, setCustomModel] = useState(settings.customModel);
  const [customApiKeyInput, setCustomApiKeyInput] = useState("");
  const [clearCustomApiKey, setClearCustomApiKey] = useState(false);
  const [modelSetup, setModelSetup] = useState(settings.modelByAgent.setup ?? "");
  const [modelNarrator, setModelNarrator] = useState(
    settings.modelByAgent.narrator ?? ""
  );
  const [modelScene, setModelScene] = useState(settings.modelByAgent.scene ?? "");
  const [modelOutcome, setModelOutcome] = useState(
    settings.modelByAgent.outcome ?? ""
  );
  const [modelTranslator, setModelTranslator] = useState(
    settings.modelByAgent.translator ?? ""
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const applySettingsFromServer = useCallback(
    (s: HostLlmSettingsPublic, opts?: { afterReset?: boolean }) => {
      const nextSource =
        opts?.afterReset && s.mode === "preset"
          ? "api"
          : s.mode === "preset"
            ? "preset"
            : sourceFromServerSettings(s);
      setSource(nextSource);
      setProvider(s.provider);
      setOllamaHost(s.ollamaHost);
      setOllamaModel(s.ollamaModel);
      setOpenaiBaseUrl(s.openaiBaseUrl);
      setOpenaiModel(s.openaiModel);
      setOpenaiKeyInput("");
      setClearOpenAiKey(false);
      setGeminiBaseUrl(s.geminiBaseUrl);
      setGeminiModel(s.geminiModel);
      setGeminiKeyInput("");
      setClearGeminiKey(false);
      setCustomBaseUrl(s.customBaseUrl);
      setCustomPath(s.customPath);
      setCustomMethod(s.customMethod);
      setCustomHeadersTemplate(s.customHeadersTemplate);
      setCustomBodyTemplate(s.customBodyTemplate);
      setCustomResponsePath(s.customResponsePath);
      setCustomModel(s.customModel);
      setCustomApiKeyInput("");
      setClearCustomApiKey(false);
      setModelSetup(s.modelByAgent.setup ?? "");
      setModelNarrator(s.modelByAgent.narrator ?? "");
      setModelScene(s.modelByAgent.scene ?? "");
      setModelOutcome(s.modelByAgent.outcome ?? "");
      setModelTranslator(s.modelByAgent.translator ?? "");
      if (opts?.afterReset) {
        setAdvancedOpen(false);
        setTypeNeedsSave(false);
      }
      setTestMessage(null);
    },
    []
  );

  const prevSavingRef = useRef(false);
  useEffect(() => {
    if (prevSavingRef.current && !saving && pendingResetUiRef.current) {
      pendingResetUiRef.current = false;
      applySettingsFromServer(settings, { afterReset: true });
    }
    prevSavingRef.current = saving;
  }, [saving, settings, applySettingsFromServer]);

  const canRunSavedTest = Boolean(
    canEdit && isRoomLlmReadyPublic(settings)
  );
  const hasOpenAiKeyAvailable = Boolean(
    (!clearOpenAiKey && settings.hasOpenAiKey) || openaiKeyInput.trim()
  );
  const hasGeminiKeyAvailable = Boolean(
    (!clearGeminiKey && settings.hasGeminiKey) || geminiKeyInput.trim()
  );
  const hasCustomKeyAvailable = Boolean(
    (!clearCustomApiKey && settings.hasCustomApiKey) || customApiKeyInput.trim()
  );
  const draftLooksTestable =
    source === "preset"
      ? settings.mode === "preset" &&
        settings.presetReady &&
        !typeNeedsSave
      : provider === "ollama"
        ? Boolean(ollamaHost.trim() && ollamaModel.trim())
        : provider === "openai"
          ? Boolean(
              openaiBaseUrl.trim() && openaiModel.trim() && hasOpenAiKeyAvailable
            )
          : provider === "gemini"
            ? Boolean(
                geminiBaseUrl.trim() &&
                  geminiModel.trim() &&
                  hasGeminiKeyAvailable
              )
            : Boolean(
                customBaseUrl.trim() &&
                  customPath.trim() &&
                  customResponsePath.trim() &&
                  (hasCustomKeyAvailable || !settings.hasCustomApiKey)
              );
  const canTestNow = canRunSavedTest && draftLooksTestable;
  const advancedModelsChanged = Boolean(
    (modelSetup.trim() || "") !== (settings.modelByAgent.setup ?? "") ||
      (modelNarrator.trim() || "") !== (settings.modelByAgent.narrator ?? "") ||
      (modelScene.trim() || "") !== (settings.modelByAgent.scene ?? "") ||
      (modelOutcome.trim() || "") !== (settings.modelByAgent.outcome ?? "") ||
      (modelTranslator.trim() || "") !== (settings.modelByAgent.translator ?? "")
  );
  const keysChanged = Boolean(
    clearOpenAiKey ||
      clearGeminiKey ||
      clearCustomApiKey ||
      openaiKeyInput.trim() ||
      geminiKeyInput.trim() ||
      customApiKeyInput.trim()
  );
  const hasUnsavedChanges =
    typeNeedsSave ||
    (source !== "preset" &&
      (settings.mode !== "custom" ||
        provider !== settings.provider ||
        advancedModelsChanged ||
        keysChanged ||
        (provider === "ollama"
          ? ollamaHost.trim() !== settings.ollamaHost ||
            ollamaModel.trim() !== settings.ollamaModel
          : provider === "openai"
            ? openaiBaseUrl.trim() !== settings.openaiBaseUrl ||
              openaiModel.trim() !== settings.openaiModel
            : provider === "gemini"
              ? geminiBaseUrl.trim() !== settings.geminiBaseUrl ||
                geminiModel.trim() !== settings.geminiModel
              : customBaseUrl.trim() !== settings.customBaseUrl ||
                customPath.trim() !== settings.customPath ||
                customMethod !== settings.customMethod ||
                customHeadersTemplate.trim() !== settings.customHeadersTemplate ||
                customBodyTemplate.trim() !== settings.customBodyTemplate ||
                customResponsePath.trim() !== settings.customResponsePath ||
                customModel.trim() !== settings.customModel)));
  const canTestSaved = canTestNow && !hasUnsavedChanges;

  const inputClass =
    "crt-action-input rounded-lg border-2 border-violet-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100";
  const pickerButtonClass =
    "crt-card w-full rounded-lg border-2 px-3 py-2 font-mono text-xs text-zinc-900 transition-colors hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)] dark:text-zinc-100";
  const sourceLabels = ["API", "Local", "Preset"] as const;
  const adapterLabels = ["Ollama", "OpenAI", "Gemini", "Custom"] as const;
  const methodLabels = ["POST", "PUT", "PATCH", "GET"] as const;
  const simpleAdvancedToggleClass =
    "crt-mode-toggle inline-flex shrink-0 items-center rounded-md border";
  const modelModeButtonBaseClass =
    "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide first:rounded-l-sm last:rounded-r-sm";
  const ollamaEndpointPlaceholder = "http://127.0.0.1:11434";
  const ollamaModelPlaceholder = "qwen2.5:14b-instruct";
  const openaiEndpointPlaceholder = "https://api.openai.com/v1";
  const openaiModelPlaceholder = "gpt-4o-mini";
  const openaiKeyPlaceholder = settings.hasOpenAiKey
    ? "Leave blank to keep existing key"
    : "sk-...";
  const geminiEndpointPlaceholder =
    "https://generativelanguage.googleapis.com/v1beta";
  const geminiModelPlaceholder = "gemini-1.5-flash";
  const geminiKeyPlaceholder = settings.hasGeminiKey
    ? "Leave blank to keep existing key"
    : "AIza...";
  const customEndpointPlaceholder = "https://provider.example.com";
  const customPathPlaceholder = "v1/generate";
  const customModelPlaceholder = "any-model-name";
  const customResponsePathPlaceholder = "data.output.text";
  const customApiKeyPlaceholder = settings.hasCustomApiKey
    ? "Leave blank to keep existing key"
    : "optional";
  const customHeadersPlaceholder =
    '{"Content-Type":"application/json","Authorization":"Bearer {{api_key}}"}';
  const customBodyPlaceholder = '{"model":"{{model}}","prompt":"{{prompt}}"}';
  const advancedAgentModelPlaceholders: Record<
    "ollama" | "openai" | "gemini" | "custom",
    {
      setup: string;
      narrator: string;
      scene: string;
      outcome: string;
      translator: string;
    }
  > = {
    ollama: {
      setup: "qwen2.5:14b-instruct (quality-first setup)",
      narrator: "qwen2.5:14b-instruct (best story quality)",
      scene: "qwen2.5:7b-instruct (structured scene updates)",
      outcome: "qwen2.5:7b-instruct (rule adjudication)",
      translator: "qwen2.5:3b-instruct (lowest cost rewrite)",
    },
    openai: {
      setup: "gpt-4.1-mini (quality-first setup)",
      narrator: "gpt-4.1-mini (better narration quality)",
      scene: "gpt-4o-mini (structured extraction)",
      outcome: "gpt-4o-mini (rules + consistency)",
      translator: "gpt-4o-mini (fast rewrite)",
    },
    gemini: {
      setup: "gemini-1.5-pro (quality-first setup)",
      narrator: "gemini-1.5-pro (best narration quality)",
      scene: "gemini-1.5-flash (state extraction)",
      outcome: "gemini-1.5-flash (rule checks)",
      translator: "gemini-1.5-flash-8b (lowest rewrite cost)",
    },
    custom: {
      setup: "quality model alias (setup)",
      narrator: "quality model alias (narration)",
      scene: "cheap model alias (scene updates)",
      outcome: "cheap model alias (rules/outcome)",
      translator: "lowest-cost model alias (rewrite)",
    },
  };
  const providerForAdvancedPlaceholder: "ollama" | "openai" | "gemini" | "custom" =
    provider;
  const agentPlaceholders =
    advancedAgentModelPlaceholders[providerForAdvancedPlaceholder];
  const currentDefaultModel =
    provider === "ollama"
      ? ollamaModel
      : provider === "openai"
        ? openaiModel
        : provider === "gemini"
          ? geminiModel
          : customModel;
  const setCurrentDefaultModel = (value: string) => {
    if (provider === "ollama") {
      setOllamaModel(value);
      return;
    }
    if (provider === "openai") {
      setOpenaiModel(value);
      return;
    }
    if (provider === "gemini") {
      setGeminiModel(value);
      return;
    }
    setCustomModel(value);
  };
  const currentDefaultModelPlaceholder =
    provider === "ollama"
      ? ollamaModelPlaceholder
      : provider === "openai"
        ? openaiModelPlaceholder
        : provider === "gemini"
          ? geminiModelPlaceholder
          : customModelPlaceholder;
  const advancedPanel = advancedOpen ? (
    <div className="rounded-lg border border-violet-200/60 px-3 py-2 dark:border-violet-800/40">
      <div className="mt-3 grid grid-cols-1 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Default model
          </span>
          <InputWithUseButton
            value={currentDefaultModel}
            onChange={setCurrentDefaultModel}
            placeholder={currentDefaultModelPlaceholder}
            inputClass={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Scenario setup model
          </span>
          <InputWithUseButton
            value={modelSetup}
            onChange={setModelSetup}
            placeholder={agentPlaceholders.setup}
            inputClass={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Narration model
          </span>
          <InputWithUseButton
            value={modelNarrator}
            onChange={setModelNarrator}
            placeholder={agentPlaceholders.narrator}
            inputClass={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Scene state model
          </span>
          <InputWithUseButton
            value={modelScene}
            onChange={setModelScene}
            placeholder={agentPlaceholders.scene}
            inputClass={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Outcome rules model
          </span>
          <InputWithUseButton
            value={modelOutcome}
            onChange={setModelOutcome}
            placeholder={agentPlaceholders.outcome}
            inputClass={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            Thai rewrite model
          </span>
          <InputWithUseButton
            value={modelTranslator}
            onChange={setModelTranslator}
            placeholder={agentPlaceholders.translator}
            inputClass={inputClass}
          />
        </label>
      </div>
    </div>
  ) : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (source === "preset") {
      setTestMessage(null);
      const ok = await onSave({ mode: "preset", useCustomLlm: false });
      if (ok) setTypeNeedsSave(false);
      return;
    }
    const body: SetHostLlmBody = {
      mode: "custom",
      useCustomLlm: true,
      provider,
      ollamaHost,
      ollamaModel,
      openaiBaseUrl,
      openaiModel,
      geminiBaseUrl,
      geminiModel,
      customBaseUrl,
      customPath,
      customMethod,
      customHeadersTemplate,
      customBodyTemplate,
      customResponsePath,
      customModel,
      modelByAgent: {
        setup: modelSetup,
        narrator: modelNarrator,
        scene: modelScene,
        outcome: modelOutcome,
        translator: modelTranslator,
      },
    };
    if (provider === "openai") {
      if (clearOpenAiKey) {
        body.openaiApiKey = "";
      } else if (openaiKeyInput.trim()) {
        body.openaiApiKey = openaiKeyInput.trim();
      }
    }
    if (provider === "gemini") {
      if (clearGeminiKey) {
        body.geminiApiKey = "";
      } else if (geminiKeyInput.trim()) {
        body.geminiApiKey = geminiKeyInput.trim();
      }
    }
    if (provider === "custom") {
      if (clearCustomApiKey) {
        body.customApiKey = "";
      } else if (customApiKeyInput.trim()) {
        body.customApiKey = customApiKeyInput.trim();
      }
    }
    setTestMessage(null);
    const ok = await onSave(body);
    if (ok) setTypeNeedsSave(false);
  };

  const handleClearCredentials = async () => {
    if (!canEdit) return;
    setTestMessage(null);
    pendingResetUiRef.current = true;
    const ok = await onSave({ mode: "preset", useCustomLlm: false });
    if (!ok) pendingResetUiRef.current = false;
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
        <section aria-label="LLM connection">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Source
          </p>
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Type
            </span>
            <LobbyThemePicker
              labels={sourceLabels}
              value={
                source === "api" ? "API" : source === "local" ? "Local" : "Preset"
              }
              onSelect={(label) => {
                const next =
                  label === "API"
                    ? "api"
                    : label === "Local"
                      ? "local"
                      : "preset";
                setSource(next);
                setTypeNeedsSave(true);
              }}
              buttonClassName={pickerButtonClass}
              buttonAriaLabel="AI source type"
            />
          </label>

          {source === "preset" ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Preset uses server defaults that you already prepared.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {settings.presetReady
                  ? "Preset AI is ready."
                  : "Preset AI is not ready on this server yet."}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3 border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Adapter
                </span>
                <LobbyThemePicker
                  labels={adapterLabels}
                  value={
                    provider === "ollama"
                      ? "Ollama"
                      : provider === "openai"
                        ? "OpenAI"
                        : provider === "gemini"
                          ? "Gemini"
                          : "Custom"
                  }
                  onSelect={(label) => {
                    const next =
                      label === "Ollama"
                        ? "ollama"
                        : label === "OpenAI"
                          ? "openai"
                          : label === "Gemini"
                            ? "gemini"
                            : "custom";
                    setProvider(next);
                  }}
                  buttonClassName={pickerButtonClass}
                  buttonAriaLabel="LLM adapter"
                />
              </label>
              {provider === "ollama" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Endpoint
                    </span>
                    <InputWithUseButton
                      value={ollamaHost}
                      onChange={setOllamaHost}
                      placeholder={ollamaEndpointPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Model
                      </span>
                      <div className={simpleAdvancedToggleClass} role="group" aria-label="Model mode">
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            !advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(false)}
                        >
                          Simple
                        </button>
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(true)}
                        >
                          Advanced
                        </button>
                      </div>
                    </div>
                    {!advancedOpen ? (
                      <InputWithUseButton
                        value={ollamaModel}
                        onChange={setOllamaModel}
                        placeholder={ollamaModelPlaceholder}
                        inputClass={inputClass}
                      />
                    ) : null}
                  </label>
                  {advancedPanel}
                </>
              ) : provider === "openai" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Endpoint
                    </span>
                    <InputWithUseButton
                      value={openaiBaseUrl}
                      onChange={setOpenaiBaseUrl}
                      placeholder={openaiEndpointPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Model
                      </span>
                      <div className={simpleAdvancedToggleClass} role="group" aria-label="Model mode">
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            !advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(false)}
                        >
                          Simple
                        </button>
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(true)}
                        >
                          Advanced
                        </button>
                      </div>
                    </div>
                    {!advancedOpen ? (
                      <InputWithUseButton
                        value={openaiModel}
                        onChange={setOpenaiModel}
                        placeholder={openaiModelPlaceholder}
                        inputClass={inputClass}
                      />
                    ) : null}
                  </label>
                  {advancedPanel}
                </>
              ) : provider === "gemini" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Endpoint
                    </span>
                    <InputWithUseButton
                      value={geminiBaseUrl}
                      onChange={setGeminiBaseUrl}
                      placeholder={geminiEndpointPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Model
                      </span>
                      <div className={simpleAdvancedToggleClass} role="group" aria-label="Model mode">
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            !advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(false)}
                        >
                          Simple
                        </button>
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(true)}
                        >
                          Advanced
                        </button>
                      </div>
                    </div>
                    {!advancedOpen ? (
                      <InputWithUseButton
                        value={geminiModel}
                        onChange={setGeminiModel}
                        placeholder={geminiModelPlaceholder}
                        inputClass={inputClass}
                      />
                    ) : null}
                  </label>
                  {advancedPanel}
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Base URL
                    </span>
                    <InputWithUseButton
                      value={customBaseUrl}
                      onChange={setCustomBaseUrl}
                      placeholder={customEndpointPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Path
                    </span>
                    <InputWithUseButton
                      value={customPath}
                      onChange={setCustomPath}
                      placeholder={customPathPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Method
                    </span>
                    <LobbyThemePicker
                      labels={methodLabels}
                      value={customMethod}
                      onSelect={(label) => {
                        setCustomMethod(label as "GET" | "POST" | "PUT" | "PATCH");
                      }}
                      buttonClassName={pickerButtonClass}
                      buttonAriaLabel="HTTP method"
                      uppercaseLabels
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Model
                      </span>
                      <div className={simpleAdvancedToggleClass} role="group" aria-label="Model mode">
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            !advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(false)}
                        >
                          Simple
                        </button>
                        <button
                          type="button"
                          className={`${modelModeButtonBaseClass} ${
                            advancedOpen
                              ? "is-active"
                              : ""
                          }`}
                          onClick={() => setAdvancedOpen(true)}
                        >
                          Advanced
                        </button>
                      </div>
                    </div>
                    {!advancedOpen ? (
                      <InputWithUseButton
                        value={customModel}
                        onChange={setCustomModel}
                        placeholder={customModelPlaceholder}
                        inputClass={inputClass}
                      />
                    ) : null}
                  </label>
                  {advancedPanel}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Response path
                    </span>
                    <InputWithUseButton
                      value={customResponsePath}
                      onChange={setCustomResponsePath}
                      placeholder={customResponsePathPlaceholder}
                      inputClass={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Headers template (JSON)
                    </span>
                    <TextareaWithUseButton
                      value={customHeadersTemplate}
                      onChange={setCustomHeadersTemplate}
                      placeholder={customHeadersPlaceholder}
                      textareaClass={inputClass}
                      rows={3}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Body template
                    </span>
                    <TextareaWithUseButton
                      value={customBodyTemplate}
                      onChange={setCustomBodyTemplate}
                      placeholder={customBodyPlaceholder}
                      textareaClass={inputClass}
                      rows={4}
                    />
                  </label>
                </>
              )}
              {provider === "openai" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      API key
                    </span>
                    <InputWithUseButton
                      value={openaiKeyInput}
                      onChange={setOpenaiKeyInput}
                      placeholder={openaiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
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
                </>
              ) : provider === "gemini" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      API key
                    </span>
                    <InputWithUseButton
                      value={geminiKeyInput}
                      onChange={setGeminiKeyInput}
                      placeholder={geminiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
                    />
                  </label>
                  {settings.hasGeminiKey ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={clearGeminiKey}
                        onChange={(ev) => setClearGeminiKey(ev.target.checked)}
                        className="h-4 w-4 rounded border-zinc-400"
                      />
                      <span>Remove stored Gemini API key</span>
                    </label>
                  ) : null}
                </>
              ) : provider === "custom" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      API key
                    </span>
                    <InputWithUseButton
                      value={customApiKeyInput}
                      onChange={setCustomApiKeyInput}
                      placeholder={customApiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
                    />
                  </label>
                  {settings.hasCustomApiKey ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={clearCustomApiKey}
                        onChange={(ev) => setClearCustomApiKey(ev.target.checked)}
                        className="h-4 w-4 rounded border-zinc-400"
                      />
                      <span>Remove stored custom API key</span>
                    </label>
                  ) : null}
                </>
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
              Save
            </BusyButton>
            {canEdit ? (
              <button
                type="button"
                onClick={() => void handleClearCredentials()}
                disabled={saving}
                className="mt-2 w-full rounded-lg border-2 border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-200 dark:hover:bg-rose-950/40"
              >
                Reset
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => void handleTestSaved()}
                disabled={!canTestSaved || testBusy || saving}
                className="crt-btn-cta mt-2 w-full rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
              >
                {testBusy ? "Testing…" : "Test connection"}
              </button>
            ) : null}
          </fieldset>
        </section>
        {testMessage ? (
          <p
            className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
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
