"use client";

import { BusyButton } from "@/app/components/ui/BusyButton";
import { LobbyThemePicker } from "@/app/components/game/lobby-theme-picker";
import type { PublicRoomState as RoomState } from "@/lib/public-room-state";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";

export type GameLobbyViewProps = {
  roomState: RoomState;
  displayJoinCode: string | undefined;
  myPlayerId: string | undefined;
  themeFieldLabelId: string;
  lobbySelectClass: string;
  lobbyStartBtnClass: string;
  isStarting: boolean;
  lobbyThemeSaving: boolean;
  hostLlmSaving: boolean;
  onStartGame: () => void;
  onSetLobbyTheme: (theme: string) => Promise<void>;
  onOpenEndGameConfirm: () => void;
};

export function GameLobbyView({
  roomState,
  displayJoinCode,
  myPlayerId,
  themeFieldLabelId,
  lobbySelectClass,
  lobbyStartBtnClass,
  isStarting,
  lobbyThemeSaving,
  hostLlmSaving,
  onStartGame,
  onSetLobbyTheme,
  onOpenEndGameConfirm,
}: GameLobbyViewProps) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-md items-center text-center">
      {displayJoinCode ? (
        <div className="crt-card w-full rounded-xl border-2 px-4 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Room code
          </p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-zinc-900 dark:text-zinc-100">
            {displayJoinCode}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Others can open this app and enter the code, or use{" "}
            <span className="font-mono text-[11px]">
              ?join={displayJoinCode}
            </span>{" "}
            in the URL.
          </p>
        </div>
      ) : null}
      <p className="w-full text-left text-xs font-semibold tracking-wide">
        Players:
      </p>
      <div className="flex flex-wrap justify-center gap-3 w-full">
        {roomState.players.length === 0 ? (
          <div className="crt-card-muted rounded-xl border border-dashed px-5 py-4 text-sm">
            No players yet
          </div>
        ) : (
          roomState.players.map((p) => (
            <div
              key={p.id}
              className="crt-card rounded-xl border px-4 py-3 min-w-26"
            >
              <p className="text-sm font-semibold">
                {p.name}
                {p.id === myPlayerId ? " (YOU)" : ""}
              </p>
            </div>
          ))
        )}
      </div>
      {SCENARIO_THEME_LABELS.length === 0 ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="status">
          No themes in scenarios — add{" "}
          <code className="text-xs bg-violet-100/80 dark:bg-violet-950/50 px-1 rounded">
            data/scenarios.json
          </code>
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-zinc-800 dark:text-zinc-200 w-full text-left">
          <span className="text-sm font-medium" id={themeFieldLabelId}>
            Theme
          </span>
          <LobbyThemePicker
            labels={SCENARIO_THEME_LABELS}
            value={
              roomState.lobbyTheme &&
              SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme)
                ? roomState.lobbyTheme
                : SCENARIO_THEME_LABELS[0] ?? ""
            }
            onSelect={(theme) => {
              void onSetLobbyTheme(theme);
            }}
            isApplying={lobbyThemeSaving}
            buttonClassName={lobbySelectClass}
            aria-labelledby={themeFieldLabelId}
          />
        </div>
      )}
      <BusyButton
        type="button"
        onClick={() => void onStartGame()}
        disabled={
          roomState.players.length < 2 ||
          isStarting ||
          lobbyThemeSaving ||
          hostLlmSaving ||
          SCENARIO_THEME_LABELS.length === 0 ||
          !SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme?.trim() ?? "")
        }
        loading={isStarting}
        loadingLabel="Starting…"
        className={lobbyStartBtnClass}
      >
        Start game
      </BusyButton>
      <div className="flex w-full justify-center border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
        <button
          type="button"
          onClick={onOpenEndGameConfirm}
          className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
        >
          End game
        </button>
      </div>
    </div>
  );
}

GameLobbyView.displayName = "GameLobbyView";
