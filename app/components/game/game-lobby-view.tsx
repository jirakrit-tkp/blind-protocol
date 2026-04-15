"use client";

import { useId, useState } from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import { LobbyThemePicker } from "@/app/components/game/lobby-theme-picker";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/game-limits";
import type { PublicRoomState as RoomState } from "@/lib/public-room-state";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";

const LOBBY_MODE_OPTIONS = [
  { label: "Imposter", value: "imposter" },
  { label: "Mission", value: "mission" },
] as const;

export type GameLobbyViewProps = {
  roomState: RoomState;
  displayJoinCode: string | undefined;
  myPlayerId: string | undefined;
  themeFieldLabelId: string;
  lobbySelectClass: string;
  lobbyStartBtnClass: string;
  isStarting: boolean;
  lobbyThemeSaving: boolean;
  lobbyModeSaving: boolean;
  hostLlmSaving: boolean;
  /** True when room snapshot has complete per-room LLM credentials */
  roomAiReady: boolean;
  isRoomHost: boolean;
  renameSaving: boolean;
  onStartGame: () => void;
  onSetLobbyTheme: (theme: string) => Promise<void>;
  onSetLobbyMode: (mode: "imposter" | "mission") => Promise<void>;
  /** Resolves true when the server accepted the new name. */
  onRenameDisplayName: (name: string) => Promise<boolean>;
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
  lobbyModeSaving,
  hostLlmSaving,
  roomAiReady,
  isRoomHost,
  renameSaving,
  onStartGame,
  onSetLobbyTheme,
  onSetLobbyMode,
  onRenameDisplayName,
  onOpenEndGameConfirm,
}: GameLobbyViewProps) {
  const renameDialogId = useId();
  const renameTitleId = useId();
  const modeFieldLabelId = useId();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState("");

  const myName =
    myPlayerId && roomState.players.find((p) => p.id === myPlayerId)?.name;

  const openRenameModal = () => {
    if (!myPlayerId) return;
    setDraftName(myName ?? "");
    setRenameOpen(true);
  };

  const closeRenameModal = () => {
    setRenameOpen(false);
    setDraftName("");
  };

  return (
    <div className="flex w-full flex-col items-center gap-5 text-center sm:gap-6">
      {displayJoinCode ? (
        <div className="w-full rounded-none border-x-0 border-y-2 border-violet-300/90 bg-transparent px-4 py-5 text-center dark:border-violet-700/55">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Room code
          </p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-zinc-900 sm:text-5xl sm:tracking-[0.4em] dark:text-zinc-100">
            {displayJoinCode}
          </p>
        </div>
      ) : null}

      {SCENARIO_THEME_LABELS.length === 0 ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="status">
          No themes in scenarios — add{" "}
          <code className="text-xs bg-violet-100/80 dark:bg-violet-950/50 px-1 rounded">
            data/scenarios.json
          </code>
        </p>
      ) : (
        <div className="grid w-full grid-cols-1 gap-4 text-left text-zinc-800 sm:grid-cols-2 dark:text-zinc-200">
          <div className="flex min-w-0 flex-col gap-2">
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
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium" id={modeFieldLabelId}>
              Mode
            </span>
            <LobbyThemePicker
              labels={LOBBY_MODE_OPTIONS.map((o) => o.label)}
              value={
                LOBBY_MODE_OPTIONS.find((o) => o.value === roomState.lobbyMode)
                  ?.label ?? "Imposter"
              }
              onSelect={(label) => {
                const mode =
                  LOBBY_MODE_OPTIONS.find((o) => o.label === label)?.value ??
                  "imposter";
                void onSetLobbyMode(mode);
              }}
              isApplying={lobbyModeSaving}
              uppercaseLabels
              buttonClassName={lobbySelectClass}
              aria-labelledby={modeFieldLabelId}
            />
          </div>
        </div>
      )}

      <p className="w-full text-left text-xs font-semibold tracking-wide">
        Players:
      </p>
      <div className="flex w-full flex-wrap justify-center gap-3">
        {roomState.players.length === 0 ? (
          <div className="crt-card-muted rounded-xl border border-dashed px-5 py-4 text-sm">
            No players yet
          </div>
        ) : (
          roomState.players.map((p) => {
            const isMe = p.id === myPlayerId;
            if (isMe) {
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={openRenameModal}
                  className="crt-card min-w-26 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)]"
                  aria-label={`Change your display name (${p.name})`}
                  aria-haspopup="dialog"
                  aria-expanded={renameOpen}
                  aria-controls={renameDialogId}
                >
                  <p className="text-sm font-semibold">
                    {p.name}
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      (YOU)
                    </span>
                  </p>
                </button>
              );
            }
            return (
              <div
                key={p.id}
                className="crt-card min-w-26 rounded-xl border px-4 py-3"
              >
                <p className="text-sm font-semibold">{p.name}</p>
              </div>
            );
          })
        )}
      </div>

      <BusyButton
        type="button"
        onClick={() => void onStartGame()}
        disabled={
          roomState.players.length < 2 ||
          isStarting ||
          lobbyThemeSaving ||
          lobbyModeSaving ||
          hostLlmSaving ||
          !roomAiReady ||
          SCENARIO_THEME_LABELS.length === 0 ||
          !SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme?.trim() ?? "")
        }
        loading={isStarting}
        loadingLabel="Starting…"
        className={lobbyStartBtnClass}
      >
        {(() => {
          const themeOk =
            SCENARIO_THEME_LABELS.length > 0 &&
            SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme?.trim() ?? "");
          if (!roomAiReady) {
            return isRoomHost ? "Set up AI" : "Waiting for host AI";
          }
          if (!themeOk) return "Pick a theme";
          if (roomState.players.length < 2) return "Need more players";
          return "Start game";
        })()}
      </BusyButton>

      <div className="flex w-full justify-end border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
        <button
          type="button"
          onClick={onOpenEndGameConfirm}
          className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
        >
          End game
        </button>
      </div>

      {renameOpen ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4 py-4 sm:px-5 sm:py-5"
          role="presentation"
          onClick={() => closeRenameModal()}
        >
          <div
            id={renameDialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={renameTitleId}
            className="crt-card max-w-sm w-full rounded-2xl border-2 p-5 shadow-none"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeRenameModal();
            }}
          >
            <h2
              id={renameTitleId}
              className="text-base font-semibold uppercase tracking-wide"
            >
              Change display name
            </h2>
            <label className="mt-4 flex flex-col gap-1 text-left text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Name</span>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                className="crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 pl-3 text-zinc-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-medium"
                onClick={() => closeRenameModal()}
                disabled={renameSaving}
              >
                Cancel
              </button>
              <BusyButton
                type="button"
                className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
                disabled={!draftName.trim()}
                loading={renameSaving}
                loadingLabel="Saving…"
                onClick={() =>
                  void (async () => {
                    const ok = await onRenameDisplayName(draftName.trim());
                    if (ok) closeRenameModal();
                  })()
                }
              >
                Save
              </BusyButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

GameLobbyView.displayName = "GameLobbyView";
