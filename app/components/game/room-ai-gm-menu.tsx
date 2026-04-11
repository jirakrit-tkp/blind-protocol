"use client";

import { useId, useState } from "react";
import { HostLlmPanel } from "@/app/components/game/host-llm-panel";
import type {
  HostLlmSettingsPublic,
  SetHostLlmBody,
} from "@/lib/host-llm-config";

export type RoomAiGmMenuProps = {
  settings: HostLlmSettingsPublic;
  formNonce: number;
  saving: boolean;
  onSave: (body: SetHostLlmBody) => Promise<void>;
  canEdit: boolean;
  /** แสดงเมื่อ canEdit เป็น false (เช่น ไม่ใช่โฮสต์ หรือไม่ใช่ lobby) */
  readOnlyNotice?: string;
};

export function RoomAiGmMenu({
  settings,
  formNonce,
  saving,
  onSave,
  canEdit,
  readOnlyNotice,
}: RoomAiGmMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const panelId = useId();

  const panelKey = `${[
    settings.useCustomLlm,
    settings.provider,
    settings.hasOpenAiKey,
    settings.ollamaHost,
    settings.ollamaModel,
    settings.openaiBaseUrl,
    settings.openaiModel,
  ].join("|")}|${formNonce}`;

  return (
    <div
      className={`flex min-w-0 flex-col items-end gap-2 ${open ? "w-full" : ""}`}
    >
      <button
        type="button"
        id={triggerId}
        className="crt-card w-44 rounded-lg border-2 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-[color-mix(in_srgb,var(--crt-panel)_75%,var(--crt-bg)_25%)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
          <span aria-hidden>{open ? "▲" : "▼"}</span>
          <span>AI · GM</span>
        </span>
        <span className="mt-0.5 block font-normal normal-case tracking-normal text-[11px] text-zinc-500 dark:text-zinc-400">
          ตั้งค่าห้อง
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          className="min-w-0 w-full"
        >
          <HostLlmPanel
            key={panelKey}
            settings={settings}
            saving={saving}
            onSave={onSave}
            canEdit={canEdit}
            readOnlyNotice={readOnlyNotice}
          />
        </div>
      ) : null}
    </div>
  );
}

RoomAiGmMenu.displayName = "RoomAiGmMenu";
