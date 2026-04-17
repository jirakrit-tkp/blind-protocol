"use client";

import {
  type FormEvent,
  useEffect,
  useId,
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
  /** Resolves save result; error is shown inside this panel. */
  onSave: (body: SetHostLlmBody) => Promise<{ ok: boolean; error?: string }>;
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
  actionLabel?: string;
  onAction?: () => void;
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
  actionLabel,
  onAction,
}: InputWithUseButtonProps) {
  const canUsePlaceholder = placeholder.trim().length > 0;
  const hasValue = value.trim().length > 0;
  const useValue = placeholder.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  const hasCustomAction = Boolean(actionLabel && onAction);
  const showUseClearAction = canUsePlaceholder && !hasCustomAction;
  return (
    <div className="relative w-full">
      <input
        type={type}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputClass} w-full ${showUseClearAction || hasCustomAction ? "pr-14" : ""}`}
      />
      {hasCustomAction ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 border-0 bg-transparent! p-0 text-xs font-medium text-zinc-400 underline underline-offset-2 shadow-none! transition-colors hover:bg-transparent! hover:text-zinc-500 dark:text-zinc-500 dark:hover:bg-transparent! dark:hover:text-zinc-400"
          onClick={() => onAction?.()}
        >
          {actionLabel}
        </button>
      ) : showUseClearAction ? (
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

function guessInitialSource(s: HostLlmSettingsPublic): "preset" | "local" | "api" {
  if (s.mode === "preset" && !s.hasRoomConfig) return "api";
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
  const [source, setSource] = useState<"preset" | "local" | "api">(() =>
    guessInitialSource(settings)
  );
  const [presetPasscode, setPresetPasscode] = useState("");
  const [presetPasscodeVerified, setPresetPasscodeVerified] = useState(false);
  /** True until a successful Save after changing Type, or when the initial Type draft matches saved server intent. */
  const [typeNeedsSave, setTypeNeedsSave] = useState(false);
  const [provider, setProvider] = useState<
    "ollama" | "openai" | "gemini" | "custom"
  >(() => (settings.hasRoomConfig ? settings.provider : "openai"));
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
  const [validateBusy, setValidateBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

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
  const canValidateSaved = canRunSavedTest && !hasUnsavedChanges;
  const canTestSaved = canTestNow && !hasUnsavedChanges;
  const presetPasscodeTrimmed = presetPasscode.trim();
  const presetPasscodeRequired = source === "preset";
  const presetPasscodeMissing = presetPasscodeRequired && !presetPasscodeTrimmed;
  const canRunPresetActions =
    source !== "preset" || presetPasscodeVerified;
  const busyNow = validateBusy || testBusy;

  useEffect(() => {
    if (!busyNow) {
      setSpinnerFrame(0);
      return;
    }
    const id = window.setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % 4);
    }, 130);
    return () => window.clearInterval(id);
  }, [busyNow]);

  const inputClass =
    "crt-action-input rounded-lg border-2 border-violet-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100";
  const pickerButtonClass =
    "crt-card w-full rounded-lg border-2 px-3 py-2 font-mono text-xs text-zinc-900 transition-colors hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)] dark:text-zinc-100";
  const sourceLabels = ["API", "Local", "Preset"] as const;
  const adapterLabels = ["Custom", "Gemini", "Ollama", "OpenAI"] as const;
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
    ? "Keep existing key"
    : "sk-...";
  const geminiEndpointPlaceholder =
    "https://generativelanguage.googleapis.com/v1beta";
  const geminiModelPlaceholder = "gemini-1.5-flash";
  const geminiKeyPlaceholder = settings.hasGeminiKey
    ? "Keep existing key"
    : "AIza...";
  const customEndpointPlaceholder = "https://provider.example.com";
  const customPathPlaceholder = "v1/generate";
  const customModelPlaceholder = "any-model-name";
  const customResponsePathPlaceholder = "data.output.text";
  const customApiKeyPlaceholder = settings.hasCustomApiKey
    ? "Keep existing key"
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

  const buildCurrentCustomBody = (): SetHostLlmBody => ({
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
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (source === "preset") {
      setSaveMessage(null);
      setTestMessage(null);
      const result = await onSave({
        mode: "preset",
        useCustomLlm: false,
        presetPasscode: presetPasscodeTrimmed,
      });
      if (result.ok) {
        setTypeNeedsSave(false);
        setPresetPasscode("");
        setPresetPasscodeVerified(true);
      } else if (result.error) {
        setPresetPasscodeVerified(false);
        setSaveMessage(result.error);
      }
      return;
    }
    const body: SetHostLlmBody = buildCurrentCustomBody();
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
    setSaveMessage(null);
    setTestMessage(null);
    const result = await onSave(body);
    if (result.ok) {
      setTypeNeedsSave(false);
      setOpenaiKeyInput("");
      setGeminiKeyInput("");
      setCustomApiKeyInput("");
      setClearOpenAiKey(false);
      setClearGeminiKey(false);
      setClearCustomApiKey(false);
    } else if (result.error) {
      setSaveMessage(result.error);
    }
  };

  const handleRemoveStoredKeyNow = async (
    keyKind: "openai" | "gemini" | "custom"
  ) => {
    if (!canEdit || saving) return;
    setSaveMessage(null);
    setTestMessage(null);
    const body: SetHostLlmBody = buildCurrentCustomBody();
    body.allowIncompleteSave = true;
    if (keyKind === "openai") body.openaiApiKey = "";
    if (keyKind === "gemini") body.geminiApiKey = "";
    if (keyKind === "custom") body.customApiKey = "";
    const result = await onSave(body);
    if (result.ok) {
      setTypeNeedsSave(false);
      if (keyKind === "openai") {
        setOpenaiKeyInput("");
        setClearOpenAiKey(false);
      }
      if (keyKind === "gemini") {
        setGeminiKeyInput("");
        setClearGeminiKey(false);
      }
      if (keyKind === "custom") {
        setCustomApiKeyInput("");
        setClearCustomApiKey(false);
      }
    } else if (result.error) {
      setSaveMessage(result.error);
    }
  };

  const handleTestSaved = async () => {
    if (!canRunSavedTest) return;
    setSaveMessage(null);
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

  const handleValidateSaved = async () => {
    if (!canRunSavedTest) return;
    setSaveMessage(null);
    setValidateBusy(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/game/host-llm/validate", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setTestMessage(data.error ?? "Connection validation failed");
        return;
      }
      setTestMessage(data.message ?? "Endpoint validation passed");
    } catch {
      setTestMessage("Could not reach the server");
    } finally {
      setValidateBusy(false);
    }
  };

  const spinnerChar = ["|", "/", "-", "\\"][spinnerFrame] ?? "|";
  const busyStatusMessage = validateBusy
    ? `Validating endpoint... ${spinnerChar}`
    : testBusy
      ? `Running prompt test... ${spinnerChar}`
      : null;
  const sectionSaveError = !busyNow ? saveMessage : null;
  const presetPasscodeError =
    source === "preset" ? sectionSaveError : null;
  const adapterSectionError =
    source !== "preset" ? sectionSaveError : null;
  const bottomStatusMessage = testMessage;

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
                if (next === "preset") {
                  setPresetPasscodeVerified(false);
                }
                setTypeNeedsSave(true);
              }}
              buttonClassName={pickerButtonClass}
              buttonAriaLabel="AI source type"
            />
          </label>

          {source === "preset" ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Preset passcode
                </span>
                <input
                  value={presetPasscode}
                  onChange={(ev) => {
                    setPresetPasscode(ev.target.value);
                    setPresetPasscodeVerified(false);
                  }}
                  placeholder="Enter passcode"
                  autoComplete="off"
                  className={`${inputClass} w-full`}
                  type="password"
                />
              </label>
              {presetPasscodeError ? (
                <p
                  className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
                  role="status"
                >
                  {presetPasscodeError}
                </p>
              ) : null}
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
                      onChange={(value) => {
                        setOpenaiKeyInput(value);
                        if (clearOpenAiKey) setClearOpenAiKey(false);
                      }}
                      placeholder={openaiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
                      actionLabel={settings.hasOpenAiKey ? "Remove key" : undefined}
                      onAction={
                        settings.hasOpenAiKey
                          ? () => void handleRemoveStoredKeyNow("openai")
                          : undefined
                      }
                    />
                  </label>
                </>
              ) : provider === "gemini" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      API key
                    </span>
                    <InputWithUseButton
                      value={geminiKeyInput}
                      onChange={(value) => {
                        setGeminiKeyInput(value);
                        if (clearGeminiKey) setClearGeminiKey(false);
                      }}
                      placeholder={geminiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
                      actionLabel={settings.hasGeminiKey ? "Remove key" : undefined}
                      onAction={
                        settings.hasGeminiKey
                          ? () => void handleRemoveStoredKeyNow("gemini")
                          : undefined
                      }
                    />
                  </label>
                </>
              ) : provider === "custom" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      API key
                    </span>
                    <InputWithUseButton
                      value={customApiKeyInput}
                      onChange={(value) => {
                        setCustomApiKeyInput(value);
                        if (clearCustomApiKey) setClearCustomApiKey(false);
                      }}
                      placeholder={customApiKeyPlaceholder}
                      inputClass={inputClass}
                      type="password"
                      actionLabel={settings.hasCustomApiKey ? "Remove key" : undefined}
                      onAction={
                        settings.hasCustomApiKey
                          ? () => void handleRemoveStoredKeyNow("custom")
                          : undefined
                      }
                    />
                  </label>
                </>
              ) : null}
              {adapterSectionError ? (
                <p
                  className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
                  role="status"
                >
                  {adapterSectionError}
                </p>
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
              disabled={presetPasscodeMissing}
              className="crt-btn-cta w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Save
            </BusyButton>
            {canEdit ? (
              <div className="mt-2 grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleValidateSaved()}
                  disabled={
                    !canValidateSaved ||
                    !canRunPresetActions ||
                    validateBusy ||
                    testBusy ||
                    saving
                  }
                  className="crt-btn-cta w-full rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
                  aria-busy={validateBusy}
                >
                  {validateBusy
                    ? `${spinnerChar} Validating...`
                    : "Validate endpoint"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestSaved()}
                  disabled={
                    !canTestSaved ||
                    !canRunPresetActions ||
                    testBusy ||
                    validateBusy ||
                    saving
                  }
                  className="crt-btn-cta w-full rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
                  aria-busy={testBusy}
                >
                  {testBusy ? `${spinnerChar} Running...` : "Run prompt test"}
                </button>
              </div>
            ) : null}
          </fieldset>
        </section>
        {busyStatusMessage || bottomStatusMessage ? (
          <p
            className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
            role="status"
          >
            {busyStatusMessage ?? bottomStatusMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}

HostLlmPanel.displayName = "HostLlmPanel";


