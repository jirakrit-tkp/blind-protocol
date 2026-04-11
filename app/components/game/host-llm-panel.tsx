"use client";

import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import type {
  HostLlmSettingsPublic,
  SetHostLlmBody,
} from "@/lib/host-llm-config";

export type HostLlmPanelProps = {
  settings: HostLlmSettingsPublic;
  saving: boolean;
  onSave: (body: SetHostLlmBody) => Promise<void>;
  /** false = ดูอย่างเดียว (เฉพาะโฮสต์บันทึกได้) */
  canEdit?: boolean;
  /** แทนข้อความสี amber เมื่ออ่านอย่างเดียว */
  readOnlyNotice?: string;
};

export function HostLlmPanel({
  settings,
  saving,
  onSave,
  canEdit = true,
  readOnlyNotice,
}: HostLlmPanelProps) {
  const legendId = useId();
  const [useCustom, setUseCustom] = useState(settings.useCustomLlm);
  const [provider, setProvider] = useState<"ollama" | "openai">(
    settings.provider
  );
  const [ollamaHost, setOllamaHost] = useState(settings.ollamaHost);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(settings.openaiBaseUrl);
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [clearOpenAiKey, setClearOpenAiKey] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const body: SetHostLlmBody = {
      useCustomLlm: useCustom,
      provider,
      ollamaHost,
      ollamaModel,
      openaiBaseUrl,
      openaiModel,
    };
    if (clearOpenAiKey) {
      body.openaiApiKey = "";
    } else if (openaiKeyInput.trim()) {
      body.openaiApiKey = openaiKeyInput.trim();
    }
    await onSave(body);
  };

  return (
    <section
      className="crt-card w-full rounded-xl border-2 px-4 py-3 text-left"
      aria-labelledby={legendId}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
        id={legendId}
      >
        AI / GM (ห้องนี้)
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        ค่าเริ่มต้นใช้การตั้งค่าบนเซิร์ฟเวอร์ (env) โฮสต์สามารถตั้งค่า Ollama หรือ
        OpenAI สำหรับห้องนี้ได้ — คีย์ API ไม่ถูกส่งให้ client
      </p>
      {!canEdit ? (
        <p
          className="mt-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {readOnlyNotice ??
            "ดูการตั้งค่าได้อย่างเดียว — เฉพาะโฮสต์ (ผู้สร้างห้อง) เท่านั้นที่บันทึกได้"}
        </p>
      ) : null}
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <fieldset
          disabled={!canEdit}
          className="min-w-0 border-0 p-0 m-0 flex flex-col gap-3"
        >
        <label className={`flex items-center gap-2 text-sm ${canEdit ? "cursor-pointer" : "cursor-default opacity-90"}`}>
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(ev) => setUseCustom(ev.target.checked)}
            className="h-4 w-4 rounded border-zinc-400"
          />
          <span>ใช้ credential ของห้องนี้ (ไม่ใช้ค่า default ของเซิร์ฟเวอร์)</span>
        </label>

        {useCustom ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Provider
              </span>
              <select
                value={provider}
                onChange={(ev) =>
                  setProvider(ev.target.value === "openai" ? "openai" : "ollama")
                }
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                aria-label="เลือกผู้ให้บริการ LLM"
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI-compatible</option>
              </select>
            </div>

            {provider === "ollama" ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Ollama host
                  </span>
                  <input
                    type="text"
                    value={ollamaHost}
                    onChange={(ev) => setOllamaHost(ev.target.value)}
                    placeholder="http://127.0.0.1:11434"
                    autoComplete="off"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Model
                  </span>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(ev) => setOllamaModel(ev.target.value)}
                    placeholder="qwen2.5:14b-instruct"
                    autoComplete="off"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  บน hosting สาธารณะ URL ภายใน (localhost / 192.168.x) อาจถูกบล็อก —
                  ใช้ tunnel หรือตั้ง LLM_ALLOW_PRIVATE_OLLAMA_HOST บนเซิร์ฟเวอร์
                </p>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Base URL
                  </span>
                  <input
                    type="text"
                    value={openaiBaseUrl}
                    onChange={(ev) => setOpenaiBaseUrl(ev.target.value)}
                    placeholder="https://api.openai.com/v1"
                    autoComplete="off"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Model
                  </span>
                  <input
                    type="text"
                    value={openaiModel}
                    onChange={(ev) => setOpenaiModel(ev.target.value)}
                    placeholder="gpt-4o-mini"
                    autoComplete="off"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    API key
                  </span>
                  <input
                    type="password"
                    value={openaiKeyInput}
                    onChange={(ev) => setOpenaiKeyInput(ev.target.value)}
                    placeholder={
                      settings.hasOpenAiKey
                        ? "ว่างไว้ = คงคีย์เดิม"
                        : "sk-…"
                    }
                    autoComplete="off"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                {settings.hasOpenAiKey ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={clearOpenAiKey}
                      onChange={(ev) => setClearOpenAiKey(ev.target.checked)}
                      className="h-4 w-4 rounded border-zinc-400"
                    />
                    <span>ลบ API key ที่บันทึกไว้ในห้องนี้</span>
                  </label>
                ) : null}
              </>
            )}
          </>
        ) : null}

        <BusyButton
          type="submit"
          loading={saving}
          loadingLabel="กำลังบันทึก…"
          className="crt-btn-cta w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          บันทึกการตั้งค่า AI
        </BusyButton>
        </fieldset>
      </form>
    </section>
  );
}

HostLlmPanel.displayName = "HostLlmPanel";
