"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BusyButton } from "@/app/components/ui/BusyButton";
import { LobbyThemePicker } from "@/app/components/game/lobby-theme-picker";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/game-limits";
import type { PublicRoomState as RoomState } from "@/lib/public-room-state";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";
import {
  getThemeOptionsForSelection,
  hasScenarioThemeCombination,
} from "@/lib/scenario-theme-combinations";

const LOBBY_MODE_OPTIONS = [
  { label: "Imposter", value: "imposter" },
  { label: "Mission", value: "mission" },
] as const;

type ThemeMultiPickerProps = {
  labels: readonly string[];
  selected: readonly string[];
  isApplying: boolean;
  buttonClassName: string;
  ariaLabelledBy: string;
  canSelectTheme: (theme: string) => boolean;
  onToggle: (theme: string) => void;
};

function ThemeMultiPicker({
  labels,
  selected,
  isApplying,
  buttonClassName,
  ariaLabelledBy,
  canSelectTheme,
  onToggle,
}: ThemeMultiPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const buttonLabel =
    selected.length > 0 ? selected.join(", ") : "Select themes";

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  return (
    <div className="relative w-full" ref={rootRef}>
      <BusyButton
        type="button"
        className={`${buttonClassName} flex w-full cursor-pointer items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open && !isApplying}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        onClick={() => {
          if (isApplying) return;
          setOpen((prev) => !prev);
        }}
        loading={isApplying}
        loadingLabel="Updating themes…"
      >
        <span className="min-w-0 truncate">{buttonLabel}</span>
        <svg
          className={`size-5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </BusyButton>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="crt-card absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border-2 py-1 backdrop-blur-sm"
        >
          {labels.map((label) => {
            const isSelected = selectedSet.has(label);
            const isEnabled = isSelected || canSelectTheme(label);
            return (
              <div
                key={label}
                role="option"
                aria-selected={isSelected}
                className={`mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent! px-3 py-2.5 text-left text-sm transition-colors hover:border-(--crt-soft)! hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)] select-none ${
                  isSelected ? "font-semibold" : "font-medium"
                } ${!isEnabled ? "opacity-40" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onPointerUp={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isApplying) return;
                  if (!isEnabled) return;
                  onToggle(label);
                }}
                onClick={() => {
                  if (isApplying) return;
                  if (!isEnabled) return;
                  onToggle(label);
                }}
              >
                <span className="min-w-0 truncate">{label}</span>
                {isSelected ? (
                  <svg
                    className="size-4 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

ThemeMultiPicker.displayName = "ThemeMultiPicker";

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
  onSetLobbyThemes: (themes: string[]) => Promise<void>;
  onSetLobbyUseAiScenario: (useAiScenario: boolean) => Promise<void>;
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
  onSetLobbyThemes,
  onSetLobbyUseAiScenario,
  onSetLobbyMode,
  onRenameDisplayName,
  onOpenEndGameConfirm,
}: GameLobbyViewProps) {
  const renameDialogId = useId();
  const renameTitleId = useId();
  const modeFieldLabelId = useId();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const selectedThemes = roomState.lobbyThemes ?? [];
  const nextThemeOptions = getThemeOptionsForSelection(selectedThemes);
  const nextThemeOptionSet = new Set(nextThemeOptions);
  const canSelectTheme = (theme: string): boolean => {
    if (roomState.lobbyUseAiScenario) return true;
    return selectedThemes.includes(theme) || nextThemeOptionSet.has(theme);
  };
  const themesValid = selectedThemes.every((theme) =>
    SCENARIO_THEME_LABELS.includes(theme)
  );
  const hasSelectedThemes = selectedThemes.length > 0;
  const minPlayersRequired = roomState.lobbyMode === "mission" ? 1 : 2;
  const playersReady = roomState.players.length >= minPlayersRequired;
  const nonAiComboValid =
    hasSelectedThemes && hasScenarioThemeCombination(selectedThemes);
  const themeReady = roomState.lobbyUseAiScenario
    ? hasSelectedThemes && themesValid
    : hasSelectedThemes && themesValid && nonAiComboValid;

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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" id={themeFieldLabelId}>
                Theme
              </span>
              <div
                className="crt-mode-toggle inline-flex shrink-0 items-center rounded-md border"
                role="group"
                aria-label="Scenario source mode"
              >
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide first:rounded-l-sm last:rounded-r-sm ${
                    !roomState.lobbyUseAiScenario ? "is-active" : ""
                  }`}
                  disabled={lobbyThemeSaving}
                  onClick={() => void onSetLobbyUseAiScenario(false)}
                >
                  Prebuilt
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide first:rounded-l-sm last:rounded-r-sm ${
                    roomState.lobbyUseAiScenario ? "is-active" : ""
                  }`}
                  disabled={lobbyThemeSaving}
                  onClick={() => void onSetLobbyUseAiScenario(true)}
                >
                  Generative
                </button>
              </div>
            </div>
            <ThemeMultiPicker
              labels={SCENARIO_THEME_LABELS}
              selected={selectedThemes}
              isApplying={lobbyThemeSaving}
              buttonClassName={lobbySelectClass}
              ariaLabelledBy={themeFieldLabelId}
              canSelectTheme={canSelectTheme}
              onToggle={(theme) => {
                const selected = selectedThemes.includes(theme);
                if (selected) {
                  const next = selectedThemes.filter((t) => t !== theme);
                  void onSetLobbyThemes(next);
                  return;
                }
                if (!canSelectTheme(theme)) return;
                const next = [...selectedThemes, theme].sort((a, b) =>
                  a.localeCompare(b, "th")
                );
                void onSetLobbyThemes(next);
              }}
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
          !playersReady ||
          isStarting ||
          lobbyThemeSaving ||
          lobbyModeSaving ||
          hostLlmSaving ||
          !roomAiReady ||
          SCENARIO_THEME_LABELS.length === 0 ||
          !hasSelectedThemes ||
          !themeReady
        }
        loading={isStarting}
        loadingLabel="Starting…"
        className={lobbyStartBtnClass}
      >
        {(() => {
          const themeOk = SCENARIO_THEME_LABELS.length > 0 && themeReady;
          if (!roomAiReady) {
            return isRoomHost ? "Set up AI" : "Waiting for host AI";
          }
          if (!hasSelectedThemes) return "Pick theme(s)";
          if (!themeOk) {
            return roomState.lobbyUseAiScenario
              ? "Pick a theme"
              : "Pick valid theme combo";
          }
          if (!playersReady) return "Need more players";
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
