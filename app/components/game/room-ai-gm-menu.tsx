"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HostLlmPanel } from "@/app/components/game/host-llm-panel";
import {
  type HostLlmSettingsPublic,
  isRoomLlmReadyPublic,
  type SetHostLlmBody,
} from "@/lib/host-llm-config";

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-zinc-700 transition-colors dark:text-zinc-200"
      aria-hidden
    >
      <path
        className="fill-transparent transition-[fill] group-hover:fill-current group-focus-visible:fill-current"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.379-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path className="fill-background" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

GearIcon.displayName = "GearIcon";

export type RoomAiGmMenuProps = {
  settings: HostLlmSettingsPublic;
  saving: boolean;
  onSave: (body: SetHostLlmBody) => Promise<boolean>;
  canEdit: boolean;
  /** Shown when the viewer cannot edit (not host or not in lobby). */
  readOnlyNotice?: string;
};

export function RoomAiGmMenu({
  settings,
  saving,
  onSave,
  canEdit,
  readOnlyNotice,
}: RoomAiGmMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const dialogId = useId();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const aiReady = isRoomLlmReadyPublic(settings);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        id={triggerId}
        className="group m-0 inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-zinc-700 transition-colors hover:bg-zinc-200/60 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-200 dark:hover:bg-zinc-700/50"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-label={
          aiReady
            ? "AI / GM settings (ready)"
            : "AI / GM settings (not configured)"
        }
        title="AI / GM"
        onClick={() => setOpen(true)}
      >
        <GearIcon />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4 py-4 sm:px-5 sm:py-5"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="crt-card max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border-2 p-5 shadow-none"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-violet-200/50 pb-3 dark:border-violet-800/30">
              <div className="min-w-0 text-left">
                <h2
                  id={titleId}
                  className="text-base font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100"
                >
                  AI configuration
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="crt-btn-cta shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>
            <HostLlmPanel
              settings={settings}
              saving={saving}
              onSave={onSave}
              canEdit={canEdit}
              readOnlyNotice={readOnlyNotice}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

RoomAiGmMenu.displayName = "RoomAiGmMenu";
