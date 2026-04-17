"use client";

import { BusyButton } from "@/app/components/ui/BusyButton";
import { JOIN_CODE_LENGTH } from "@/lib/game-api-constants";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/game-limits";

export type GameHomeViewProps = {
  name: string;
  setName: (v: string) => void;
  joinCodeInput: string;
  setJoinCodeInput: (v: string) => void;
  homeLocked: boolean;
  homeBusy: null | "create" | "join";
  lobbyPrimaryBtnClass: string;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

export function GameHomeView({
  name,
  setName,
  joinCodeInput,
  setJoinCodeInput,
  homeLocked,
  homeBusy,
  lobbyPrimaryBtnClass,
  onCreateRoom,
  onJoinRoom,
}: GameHomeViewProps) {
  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <label className="flex w-full flex-col gap-1 text-left text-zinc-800 dark:text-zinc-200">
        <span>Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          disabled={homeLocked}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          className="crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 pl-3 text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 disabled:opacity-60"
          suppressHydrationWarning
        />
      </label>
      <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border-2 border-violet-200/80 p-4 dark:border-violet-800/50">
          <p className="text-left text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Create
          </p>
          <BusyButton
            type="button"
            onClick={() => void onCreateRoom()}
            disabled={!name.trim() || homeLocked}
            loading={homeBusy === "create"}
            loadingLabel="Creating room…"
            className={lobbyPrimaryBtnClass}
          >
            New room
          </BusyButton>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border-2 border-violet-200/80 p-4 dark:border-violet-800/50">
          <p className="text-left text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Join
          </p>
          <div className="flex w-full min-w-0 flex-row items-stretch gap-2">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) =>
                setJoinCodeInput(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, JOIN_CODE_LENGTH)
                )
              }
              placeholder={`${JOIN_CODE_LENGTH}-character code`}
              disabled={homeLocked}
              aria-label="Room code"
              className="crt-action-input box-border min-h-12 min-w-0 flex-1 rounded-xl border-2 border-violet-200 py-3 pl-3 font-mono text-base tracking-widest text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 disabled:opacity-60"
              maxLength={JOIN_CODE_LENGTH}
              autoComplete="off"
              onKeyDown={(e) =>
                e.key === "Enter" && !homeLocked && void onJoinRoom()
              }
              suppressHydrationWarning
            />
            <BusyButton
              type="button"
              onClick={() => void onJoinRoom()}
              disabled={
                !name.trim() ||
                homeLocked ||
                joinCodeInput.replace(/[^A-Z0-9]/g, "").length !==
                  JOIN_CODE_LENGTH
              }
              loading={homeBusy === "join"}
              loadingLabel="Joining…"
              className="crt-btn-cta inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border-2 px-4 py-3 text-base font-medium whitespace-nowrap transition-colors disabled:opacity-50"
            >
              Join
            </BusyButton>
          </div>
        </div>
      </div>
    </div>
  );
}

GameHomeView.displayName = "GameHomeView";
