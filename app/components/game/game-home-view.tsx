"use client";

import { BusyButton } from "@/app/components/ui/BusyButton";
import { JOIN_CODE_LENGTH } from "@/lib/game-api-constants";

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
    <div className="flex flex-col gap-6 w-full max-w-md items-center text-center">
      <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
        Create a room or join with a code
      </h2>
      <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200 w-full text-left">
        <span>Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          disabled={homeLocked}
          className="crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 pl-3 text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 disabled:opacity-60"
          suppressHydrationWarning
        />
      </label>
      <div className="flex w-full flex-col gap-3 rounded-xl border-2 border-violet-200/80 p-4 dark:border-violet-800/50">
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
      <div className="flex w-full flex-col gap-3 rounded-xl border-2 border-violet-200/80 p-4 dark:border-violet-800/50">
        <p className="text-left text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Join
        </p>
        <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200 w-full text-left">
          <span>Room code</span>
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
            className="crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 pl-3 font-mono tracking-widest text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 disabled:opacity-60"
            maxLength={JOIN_CODE_LENGTH}
            autoComplete="off"
            onKeyDown={(e) =>
              e.key === "Enter" && !homeLocked && void onJoinRoom()
            }
            suppressHydrationWarning
          />
        </label>
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
          loadingLabel="Joining room…"
          className={lobbyPrimaryBtnClass}
        >
          Join room
        </BusyButton>
      </div>
    </div>
  );
}

GameHomeView.displayName = "GameHomeView";
