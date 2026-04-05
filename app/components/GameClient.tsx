"use client";

import type { KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createSocket } from "@/lib/socket-client";
import { MAX_PLAYER_ACTION_LENGTH } from "@/lib/game-limits";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";
import {
  isMissionWon,
  isRuleFailed,
  isSystemProtagonistPlayable,
} from "@/lib/world-state";

type WorldState = Record<string, string | number | boolean>;

type VoteOutcome = {
  accusedId: string;
  imposterId: string;
  crewWon: boolean;
  tally: { playerId: string; count: number }[];
};

type VoteTieInfo = {
  tallies: { playerId: string; count: number }[];
  tiedPlayerIds: string[];
};

type RoomState = {
  id: string;
  players: { id: string; name: string; role?: "imposter" | "normal" }[];
  logs: { playerId: string; action: string; narrative?: string }[];
  currentTurn: number;
  roundIndex: number;
  phase: "lobby" | "playing" | "voting" | "end";
  worldState: WorldState;
  situation?: string;
  lobbyTheme: string;
  skipToVotePlayerIds: string[];
  votes: Record<string, string>;
  voteOutcome?: VoteOutcome;
  voteTieInfo?: VoteTieInfo;
};

function tallyStats(tallies: { playerId: string; count: number }[] | undefined) {
  const map = new Map<string, number>();
  let max = 0;
  if (tallies) {
    for (const t of tallies) {
      map.set(t.playerId, t.count);
      if (t.count > max) max = t.count;
    }
  }
  return { map, max };
}

function voteOutcomeSubtitle(
  role: "imposter" | "normal" | undefined,
  won: boolean | undefined
): string {
  if (won === undefined || !role) {
    return "This round is over.";
  }
  if (role === "imposter") {
    return won
      ? "You were the Imposter—and the crew never exposed you."
      : "You were the Imposter, but the group figured you out.";
  }
  return won
    ? "You were crew—and together you unmasked the Imposter."
    : "You were crew, but the vote missed the real Imposter.";
}

const ROLE_COPY: Record<
  "imposter" | "normal",
  { title: string; body: string; className: string }
> = {
  imposter: {
    title: "Imposter",
    body: "Blend in. You may steer the group toward failure.",
    className:
      "border-[3px] border-fuchsia-400/90 bg-gradient-to-b from-fuchsia-100/95 to-fuchsia-50/90 text-fuchsia-950 shadow-2xl shadow-fuchsia-950/15 ring-2 ring-fuchsia-300/60 dark:border-fuchsia-500/70 dark:from-fuchsia-950/80 dark:to-fuchsia-950/50 dark:text-fuchsia-50 dark:shadow-fuchsia-950/40 dark:ring-fuchsia-500/35",
  },
  normal: {
    title: "Crew",
    body: "Help the mission succeed for this scenario.",
    className:
      "border-[3px] border-emerald-400/90 bg-gradient-to-b from-emerald-100/95 to-emerald-50/90 text-emerald-950 shadow-2xl shadow-emerald-950/12 ring-2 ring-emerald-300/60 dark:border-emerald-500/70 dark:from-emerald-950/80 dark:to-emerald-950/50 dark:text-emerald-50 dark:shadow-emerald-950/40 dark:ring-emerald-500/35",
  },
};

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 pl-1 translate-y-px"
      aria-hidden
    >
      <span className="size-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-duration:1.1s]" />
      <span className="size-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-duration:1.1s] [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-duration:1.1s] [animation-delay:300ms]" />
    </span>
  );
}

TypingDots.displayName = "TypingDots";

type LobbyThemePickerProps = {
  labels: readonly string[];
  value: string;
  onSelect: (theme: string) => void;
  buttonClassName: string;
  "aria-labelledby"?: string;
};

function LobbyThemePicker({
  labels,
  value,
  onSelect,
  buttonClassName,
  "aria-labelledby": ariaLabelledBy,
}: LobbyThemePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const clampIndex = useCallback(
    (i: number) => Math.min(Math.max(0, i), labels.length - 1),
    [labels.length]
  );

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const idx = labels.indexOf(value);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [labels, value]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-theme-option="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const pick = (theme: string) => {
    onSelect(theme);
    closeMenu();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else setHighlight((h) => clampIndex(h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openMenu();
      else setHighlight((h) => clampIndex(h - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) pick(labels[highlight] ?? value);
      else openMenu();
    }
  };

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        className={`${buttonClassName} flex w-full cursor-pointer items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabelledBy ? undefined : "Scenario theme"}
        aria-activedescendant={
          open ? `${listId}-opt-${highlight}` : undefined
        }
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="min-w-0 truncate">{value}</span>
        <svg
          className={`size-5 shrink-0 text-violet-500 transition-transform duration-200 dark:text-violet-400 ${open ? "rotate-180" : ""}`}
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
      </button>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border-2 border-violet-200/90 bg-white/95 py-1 shadow-xl shadow-violet-950/15 backdrop-blur-sm dark:border-violet-700/55 dark:bg-violet-950/95 dark:shadow-black/40"
        >
          {labels.map((label, i) => {
            const selected = label === value;
            const active = i === highlight;
            return (
              <div
                key={label}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                data-theme-option={i}
                className={`mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors select-none ${
                  active
                    ? "bg-violet-100 text-violet-950 dark:bg-violet-800/55 dark:text-violet-50"
                    : "text-zinc-800 hover:bg-violet-50 dark:text-zinc-200 dark:hover:bg-violet-900/40"
                } ${selected ? "font-semibold" : "font-medium"}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(label)}
              >
                <span className="min-w-0 truncate">{label}</span>
                {selected ? (
                  <svg
                    className="size-4 shrink-0 text-violet-600 dark:text-violet-300"
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

LobbyThemePicker.displayName = "LobbyThemePicker";

function GameClient() {
  const [passcode, setPasscode] = useState("");
  const [name, setName] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [error, setError] = useState("");
  const [gmThinking, setGmThinking] = useState(false);
  /** Shown to everyone after a turn is submitted, until the beat is committed to logs */
  const [beatPending, setBeatPending] = useState<{
    actionLine: string;
    playerId: string;
  } | null>(null);
  const [remoteTypingNames, setRemoteTypingNames] = useState<string[]>([]);
  /** Synced on socket connect so role / turn UI re-renders when id is assigned */
  const [mySocketId, setMySocketId] = useState<string | undefined>(undefined);
  const [rolePanelOpen, setRolePanelOpen] = useState(true);
  /** Local pick before confirming vote (server stores vote only after Confirm). */
  const [voteSelectionId, setVoteSelectionId] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const flushTypingEmit = useCallback((typing: boolean) => {
    socketRef.current?.emit("player_typing", { typing });
  }, []);

  const scheduleTypingStop = useCallback(() => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      flushTypingEmit(false);
      typingIdleRef.current = null;
    }, 1200);
  }, [flushTypingEmit]);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("session_cleared", () => {
      setRoomState(null);
      setIsStarting(false);
      setBeatPending(null);
      setGmThinking(false);
      setRemoteTypingNames([]);
    });

    socket.on("room_update", (state: RoomState) => {
      setRoomState(state);
      if (state.phase !== "lobby") setIsStarting(false);
      setBeatPending((prev) => {
        if (!prev) return null;
        const hit = state.logs.some(
          (l) => l.playerId === prev.playerId && l.action === prev.actionLine
        );
        return hit ? null : prev;
      });
    });

    socket.on("action_pending", (payload: { playerId?: string; actionLine?: string }) => {
      const pid = payload?.playerId;
      const line = payload?.actionLine?.trim();
      if (!pid || !line) return;
      setBeatPending({ playerId: pid, actionLine: line });
    });

    socket.on("new_log", (logs: { playerId: string; action: string; narrative?: string }[]) => {
      setRoomState((prev) =>
        prev ? { ...prev, logs: [...prev.logs, ...logs] } : null
      );
      setBeatPending((prev) => {
        if (!prev) return null;
        if (logs.some((l) => l.playerId === prev.playerId && l.action === prev.actionLine)) {
          return null;
        }
        return prev;
      });
    });

    socket.on("phase_change", (phase: string) => {
      setRoomState((prev) => (prev ? { ...prev, phase: phase as RoomState["phase"] } : null));
    });

    socket.on("gm_thinking", (payload: { active?: boolean }) => {
      setGmThinking(Boolean(payload?.active));
    });

    socket.on("beat_aborted", () => {
      setBeatPending(null);
      setGmThinking(false);
    });

    socket.on(
      "player_typing",
      (payload: { playerId?: string; name?: string; typing?: boolean }) => {
        const pid = payload?.playerId;
        const pname = payload?.name?.trim();
        if (!pid || !pname) return;
        if (pid === socket.id) return;

        const existing = remoteTypingRef.current.get(pid);
        if (existing) clearTimeout(existing);

        if (!payload?.typing) {
          remoteTypingRef.current.delete(pid);
          setRemoteTypingNames((names) => names.filter((n) => n !== pname));
          return;
        }

        setRemoteTypingNames((names) =>
          names.includes(pname) ? names : [...names, pname]
        );

        const t = setTimeout(() => {
          remoteTypingRef.current.delete(pid);
          setRemoteTypingNames((names) => names.filter((n) => n !== pname));
        }, 2000);
        remoteTypingRef.current.set(pid, t);
      }
    );

    socket.on("error", (payload: { message: string }) => {
      setError(payload.message);
      setIsStarting(false);
      setBeatPending(null);
      setGmThinking(false);
    });

    socket.on("connect", () => {
      setMySocketId(socket.id ?? undefined);
    });
    socket.on("disconnect", () => {
      setMySocketId(undefined);
    });

    socket.connect();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      for (const t of remoteTypingRef.current.values()) clearTimeout(t);
      remoteTypingRef.current.clear();
      setMySocketId(undefined);
      socketRef.current?.disconnect();
    };
  }, [connect]);

  const handleEnter = () => {
    setError("");
    if (!passcode.trim() || !name.trim()) {
      setError("Passcode and name required");
      return;
    }
    socketRef.current?.emit("enter", {
      passcode: passcode.trim(),
      name: name.trim(),
    });
  };

  const handleAckSkipToVote = () => {
    socketRef.current?.emit("ack_skip_to_vote");
  };

  const confirmVote = () => {
    if (!voteSelectionId || !socketRef.current) return;
    socketRef.current.emit("vote", { targetId: voteSelectionId });
  };

  const handleResetGame = () => {
    socketRef.current?.emit("reset_game");
  };

  useEffect(() => {
    if (!roomState || roomState.phase !== "voting") {
      setVoteSelectionId(null);
      return;
    }
    if (
      mySocketId &&
      roomState.votes &&
      Object.hasOwn(roomState.votes, mySocketId)
    ) {
      setVoteSelectionId(null);
    }
  }, [roomState, mySocketId]);

  const handleStartGame = () => {
    setError("");
    if (!roomState) return;
    const themeToUse = roomState.lobbyTheme?.trim() ?? "";
    if (!themeToUse || !SCENARIO_THEME_LABELS.includes(themeToUse)) {
      setError("Pick a theme from the list");
      return;
    }
    setIsStarting(true);
    socketRef.current?.emit("start_game", { theme: themeToUse });
  };

  const handleAction = () => {
    setError("");
    if (!actionInput.trim() || !roomState) return;
    const socket = socketRef.current;
    if (!socket?.id) return;
    const currentPlayer = roomState.players[roomState.currentTurn];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const actionLine = `${currentPlayer.name}: ${actionInput.trim()}`;
    setBeatPending({ actionLine, playerId: socket.id });
    flushTypingEmit(false);
    socket.emit("action", { action: actionInput.trim() });
    setActionInput("");
  };

  const isMyTurn =
    roomState &&
    roomState.phase === "playing" &&
    isSystemProtagonistPlayable(roomState.worldState) &&
    roomState.players[roomState.currentTurn]?.id === mySocketId;

  const myRole =
    roomState &&
    mySocketId &&
    (roomState.phase === "playing" ||
      roomState.phase === "voting" ||
      roomState.phase === "end")
      ? roomState.players.find((p) => p.id === mySocketId)?.role
      : undefined;

  useEffect(() => {
    if (myRole) setRolePanelOpen(true);
  }, [myRole]);

  const showLocalComposing = Boolean(isMyTurn && actionInput.trim().length > 0);
  const themeFieldLabelId = useId();
  const rolePanelContentId = useId();

  const lobbyControlShell =
    "w-full min-h-12 rounded-xl border-2 px-4 py-3 text-base font-medium shadow-md shadow-violet-950/6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f0fc] dark:shadow-black/25 dark:focus-visible:ring-violet-500 dark:focus-visible:ring-offset-[#14101c]";
  const lobbySelectClass = `${lobbyControlShell} border-violet-200/90 bg-white/90 text-zinc-900 hover:border-violet-300 hover:bg-white dark:border-violet-700/55 dark:bg-violet-950/45 dark:text-zinc-100 dark:hover:border-violet-600 dark:hover:bg-violet-950/60`;
  const lobbyPrimaryBtnClass = `${lobbyControlShell} border-violet-400/90 bg-violet-400/95 text-violet-950 hover:border-violet-500 hover:bg-violet-300 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-600 dark:text-violet-50 dark:hover:border-violet-400 dark:hover:bg-violet-500`;
  const lobbyStartBtnClass = `${lobbyControlShell} border-emerald-400/85 bg-emerald-300 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-200 disabled:opacity-50 dark:border-emerald-600 dark:bg-emerald-700 dark:text-emerald-50 dark:hover:bg-emerald-600`;

  const showGameTitle =
    !roomState || roomState.phase !== "playing";

  return (
    <section className="flex flex-col gap-6 max-w-2xl w-full p-6 items-center">
      {showGameTitle ? (
        <h1 className="text-4xl sm:text-5xl font-bold text-violet-950 dark:text-violet-100 text-center tracking-tight">
          Blind Protocol
        </h1>
      ) : null}

      {error && (
        <p className="text-rose-600 dark:text-rose-400 text-center" role="alert">
          {error}
        </p>
      )}

      {!roomState ? (
        <div className="flex flex-col gap-4 w-full max-w-md items-center text-center">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
            Enter passcode to access
          </h2>
          <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200 w-full text-left">
            <span>Passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="border border-violet-200 dark:border-violet-800/60 px-3 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100 w-full"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              suppressHydrationWarning
            />
          </label>
          <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200 w-full text-left">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="border border-violet-200 dark:border-violet-800/60 px-3 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100 w-full"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              suppressHydrationWarning
            />
          </label>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!passcode.trim() || !name.trim()}
            className={lobbyPrimaryBtnClass}
          >
            Enter
          </button>
        </div>
      ) : roomState.phase === "lobby" ? (
        <div className="flex flex-col gap-6 w-full max-w-md items-center text-center">
          <div className="flex flex-wrap justify-center gap-3 w-full">
            {roomState.players.length === 0 ? (
              <div className="rounded-xl border border-dashed border-violet-300/80 dark:border-violet-700/50 bg-white/50 dark:bg-violet-950/25 px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                No players yet
              </div>
            ) : (
              roomState.players.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-violet-200/90 dark:border-violet-700/50 bg-white/90 dark:bg-violet-950/40 px-4 py-3 min-w-26 shadow-sm shadow-violet-950/5 dark:shadow-black/20"
                >
                  <p className="text-sm font-semibold text-violet-950 dark:text-violet-100">
                    {p.name}
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
                  setError("");
                  socketRef.current?.emit("set_lobby_theme", { theme });
                }}
                buttonClassName={lobbySelectClass}
                aria-labelledby={themeFieldLabelId}
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleStartGame}
            disabled={
              roomState.players.length < 2 ||
              isStarting ||
              SCENARIO_THEME_LABELS.length === 0 ||
              !SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme?.trim() ?? "")
            }
            className={lobbyStartBtnClass}
          >
            {isStarting ? "Starting…" : "Start game"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          {roomState.phase === "end" && roomState.voteOutcome ? null : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="capitalize">Phase: {roomState.phase}</span>
              {roomState.phase === "playing" ? (
                <span className="shrink-0 text-right">
                  Round {(roomState.roundIndex ?? 0) + 1}/3 — three turns per
                  player
                </span>
              ) : null}
            </p>
          )}

          {roomState.phase === "voting" && roomState.players.length > 0 ? (
            <div className="rounded-2xl border-2 border-violet-400/80 bg-linear-to-b from-violet-100/90 to-white/90 p-5 shadow-xl dark:border-violet-600/50 dark:from-violet-950/60 dark:to-violet-950/30">
              <h2 className="text-center text-xl font-bold text-violet-950 dark:text-violet-50">
                Vote for the Imposter
              </h2>
              {roomState.voteTieInfo ? (
                <div
                  className="mt-3 rounded-xl border-2 border-amber-400/70 bg-amber-50/95 px-3 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-50"
                  role="status"
                >
                  <p className="font-bold">Vote tied — vote again.</p>
                  <p className="mt-1 text-xs opacity-90">
                    Last-round counts are shown on each name below.
                  </p>
                </div>
              ) : null}
              <p className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
                {Object.keys(roomState.votes ?? {}).length}/
                {roomState.players.length} votes — select a player, then confirm
              </p>
              {mySocketId &&
              roomState.votes &&
              Object.hasOwn(roomState.votes, mySocketId) ? (
                <p className="mt-3 text-center text-sm font-semibold text-violet-800 dark:text-violet-200">
                  Your vote:{" "}
                  {roomState.players.find(
                    (x) => x.id === roomState.votes[mySocketId]
                  )?.name ?? "—"}
                </p>
              ) : voteSelectionId ? (
                <p className="mt-3 text-center text-sm text-violet-800 dark:text-violet-200">
                  Selected:{" "}
                  <span className="font-semibold">
                    {roomState.players.find((x) => x.id === voteSelectionId)
                      ?.name ?? "—"}
                  </span>
                  {" — "}
                  press Confirm to submit (cannot be changed).
                </p>
              ) : (
                <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Tap a name to select who you accuse as the Imposter.
                </p>
              )}
              <div
                className="mt-4 grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Choose who you think is the Imposter"
              >
                {roomState.players.map((p) => {
                  const hasVoted = Boolean(
                    mySocketId &&
                      roomState.votes &&
                      Object.hasOwn(roomState.votes, mySocketId)
                  );
                  const selected = voteSelectionId === p.id;
                  const { map: prevTallyMap, max: prevTop } = tallyStats(
                    roomState.voteTieInfo?.tallies
                  );
                  const prevCount = prevTallyMap.get(p.id) ?? 0;
                  const prevIsTop =
                    Boolean(roomState.voteTieInfo) &&
                    prevTop > 0 &&
                    prevCount === prevTop;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={hasVoted}
                      onClick={() =>
                        setVoteSelectionId((prev) =>
                          prev === p.id ? null : p.id
                        )
                      }
                      className={`rounded-xl border-2 bg-white/95 px-4 py-5 text-center text-lg font-bold shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-950/60 dark:text-violet-50 ${
                        selected
                          ? "border-violet-600 ring-2 ring-violet-500 ring-offset-2 ring-offset-violet-100 dark:border-violet-400 dark:ring-violet-400 dark:ring-offset-violet-950"
                          : prevIsTop
                            ? "border-amber-500/90 text-violet-950 dark:border-amber-500"
                            : "border-violet-400/70 text-violet-950 hover:border-violet-500 hover:bg-violet-50 dark:border-violet-600/50 dark:hover:bg-violet-900/50"
                      }`}
                    >
                      <span className="block">{p.name}</span>
                      {roomState.voteTieInfo ? (
                        <span className="mt-2 block text-sm font-semibold tabular-nums opacity-90">
                          Last round: {prevCount} vote
                          {prevCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {mySocketId &&
              roomState.votes &&
              !Object.hasOwn(roomState.votes, mySocketId) ? (
                <button
                  type="button"
                  onClick={confirmVote}
                  disabled={!voteSelectionId}
                  className="mt-4 w-full min-h-12 rounded-xl border-2 border-emerald-500/90 bg-emerald-400/95 px-4 py-3 text-base font-bold text-emerald-950 shadow-md hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-600 dark:bg-emerald-700 dark:text-emerald-50 dark:hover:bg-emerald-600"
                >
                  Confirm vote
                </button>
              ) : null}
            </div>
          ) : null}

          {roomState.phase === "end" && roomState.voteOutcome ? (
            <div className="flex flex-col gap-4">
              {(() => {
                const vo = roomState.voteOutcome;
                if (!vo) return null;
                const r = mySocketId
                  ? roomState.players.find((p) => p.id === mySocketId)?.role
                  : undefined;
                const won =
                  r === "imposter"
                    ? !vo.crewWon
                    : r === "normal"
                      ? vo.crewWon
                      : undefined;
                const youWin = won === true;
                const youLose = won === false;
                return (
                  <div
                    className={`rounded-2xl border-[3px] px-6 py-10 text-center ${
                      youWin
                        ? "border-emerald-500 bg-emerald-100/95 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/55 dark:text-emerald-50"
                        : youLose
                          ? "border-rose-500 bg-rose-100/95 text-rose-950 dark:border-rose-500 dark:bg-rose-950/50 dark:text-rose-50"
                          : "border-zinc-400 bg-zinc-100/90 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-100"
                    }`}
                    role="status"
                  >
                    <p className="text-4xl font-black tracking-tight sm:text-5xl">
                      {youWin
                        ? "YOU WIN"
                        : youLose
                          ? "YOU LOSE"
                          : "GAME OVER"}
                    </p>
                    <p className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed opacity-90 sm:text-lg">
                      {voteOutcomeSubtitle(r, won)}
                    </p>
                  </div>
                );
              })()}
              <div className="grid gap-3 sm:grid-cols-2">
                {roomState.players.map((p) => {
                  const { map: finalMap, max: finalTop } = tallyStats(
                    roomState.voteOutcome?.tally
                  );
                  const vCount = finalMap.get(p.id) ?? 0;
                  const isTopVote =
                    finalTop > 0 && vCount === finalTop;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border-2 px-4 py-4 text-center shadow-md ${
                        isTopVote
                          ? p.role === "imposter"
                            ? "border-emerald-400/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100"
                            : "border-fuchsia-400/80 bg-fuchsia-50/90 text-fuchsia-950 dark:border-fuchsia-700/60 dark:bg-fuchsia-950/45 dark:text-fuchsia-100"
                          : "border-zinc-300/80 bg-zinc-200/60 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/45 dark:text-zinc-400"
                      }`}
                    >
                      <p
                        className={`text-lg font-bold ${isTopVote ? "" : "text-zinc-700 dark:text-zinc-300"}`}
                      >
                        {p.name}
                      </p>
                      <p
                        className={`mt-1 text-sm font-semibold tabular-nums ${
                          isTopVote ? "opacity-90" : "text-zinc-500 dark:text-zinc-500"
                        }`}
                      >
                        {vCount} vote{vCount === 1 ? "" : "s"}
                      </p>
                      <p
                        className={`mt-2 text-sm font-semibold uppercase tracking-wide ${
                          isTopVote ? "opacity-90" : "text-zinc-500 dark:text-zinc-500"
                        }`}
                      >
                        {p.role === "imposter" ? "Imposter" : "Crew"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {myRole && !roomState.voteOutcome ? (
            <div
              className={`overflow-hidden rounded-2xl ${ROLE_COPY[myRole].className}`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/4 dark:hover:bg-white/6"
                onClick={() => setRolePanelOpen((open) => !open)}
                aria-expanded={rolePanelOpen}
                aria-controls={rolePanelContentId}
              >
                <span className="shrink-0 text-[11px] font-bold tracking-wide opacity-75">
                  You are
                </span>
                {!rolePanelOpen ? (
                  <span className="min-w-0 flex-1 truncate text-center text-lg font-bold tracking-tight">
                    {ROLE_COPY[myRole].title}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1" aria-hidden />
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold opacity-85">
                  {rolePanelOpen ? "Hide" : "Show"}
                  <svg
                    className={`size-4 transition-transform duration-200 ${rolePanelOpen ? "rotate-180" : ""}`}
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
                </span>
              </button>
              {rolePanelOpen ? (
                <div
                  id={rolePanelContentId}
                  className="border-t border-black/10 px-5 pb-5 pt-4 text-center dark:border-white/15"
                >
                  <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {ROLE_COPY[myRole].title}
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-base font-medium leading-relaxed opacity-90">
                    {ROLE_COPY[myRole].body}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {roomState.phase === "playing" ? (
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                Current turn
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-950 sm:text-3xl dark:text-violet-50">
                {roomState.players[roomState.currentTurn]?.name ?? "—"}
                {isMyTurn && (
                  <span className="text-xl font-semibold text-emerald-700 sm:text-2xl dark:text-emerald-300">
                    {" "}
                    (you)
                  </span>
                )}
              </p>
            </div>
          ) : null}

          {roomState.phase === "end" && !roomState.voteOutcome ? (
            <p
              className={`font-medium ${
                isMissionWon(roomState.worldState)
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
              role="status"
            >
              {isMissionWon(roomState.worldState)
                ? "Mission success — goal reached without breaking the rules."
                : isRuleFailed(roomState.worldState)
                  ? "Mission failed — a forbidden outcome triggered (rule)."
                  : "Mission failed — goal not met or the story cannot continue."}
            </p>
          ) : null}

          {!(
            roomState.phase === "end" && roomState.voteOutcome
          ) ? (
          <div className="rounded-lg border border-violet-200/80 dark:border-violet-800/50 bg-white/60 dark:bg-violet-950/25 p-3 text-sm">
            {roomState.situation ? (
              <div className="mb-3">
                <p className="font-medium mb-1 text-violet-900 dark:text-violet-200">
                  Situation
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {roomState.situation}
                </p>
              </div>
            ) : null}
            <div
              className={
                roomState.situation
                  ? "border-t border-violet-200/70 dark:border-violet-800/50 pt-3"
                  : ""
              }
            >
              <h2 className="text-base font-semibold text-violet-900 dark:text-violet-200">
                Log
              </h2>
              {(remoteTypingNames.length > 0 || showLocalComposing) && (
                <p
                  className="text-xs text-violet-700/90 dark:text-violet-300/90 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
                  aria-live="polite"
                >
                  {showLocalComposing && (
                    <span className="inline-flex items-center gap-1">
                      You are typing
                      <TypingDots />
                    </span>
                  )}
                  {remoteTypingNames.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      {remoteTypingNames.join(", ")} typing
                      <TypingDots />
                    </span>
                  )}
                </p>
              )}
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-white/40 dark:bg-violet-950/15 p-2">
                {roomState.logs.length === 0 && !beatPending && !gmThinking ? (
                  <p className="text-zinc-500 dark:text-zinc-400">No actions yet.</p>
                ) : (
                  <>
                    {roomState.logs.map((log, i) => (
                      <div key={i} className="mb-3 last:mb-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {log.action}
                        </p>
                        {log.narrative && (
                          <div className="mt-1.5 pl-2 border-l-2 border-emerald-300/90 dark:border-emerald-600/70">
                            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-0.5">
                              Narration
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              {log.narrative}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    {beatPending && (
                      <div className="mb-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {beatPending.actionLine}
                        </p>
                        {gmThinking && (
                          <p
                            className="mt-2 text-sm text-violet-700 dark:text-violet-300 inline-flex items-center"
                            aria-live="polite"
                          >
                            <span className="font-medium">Narration</span>
                            <TypingDots />
                          </p>
                        )}
                      </div>
                    )}
                    {gmThinking && !beatPending && (
                      <p
                        className="text-sm text-violet-700 dark:text-violet-300 flex items-center gap-1"
                        aria-live="polite"
                      >
                        <span className="font-medium">Narration</span>
                        <TypingDots />
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          ) : null}

          {roomState.phase === "playing" &&
          Object.keys(roomState.worldState ?? {}).length > 0 ? (
            <details className="text-sm text-zinc-700 dark:text-zinc-300">
              <summary className="cursor-pointer text-violet-800 dark:text-violet-300">
                World state
              </summary>
              <pre className="mt-1 p-2 rounded-lg border border-violet-200/60 dark:border-violet-800/40 bg-white/50 dark:bg-violet-950/20 overflow-x-auto">
                {JSON.stringify(roomState.worldState, null, 2)}
              </pre>
            </details>
          ) : null}

          {roomState.phase === "playing" && (
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  value={actionInput}
                  suppressHydrationWarning
                  onChange={(e) => {
                    const v = e.target.value.slice(0, MAX_PLAYER_ACTION_LENGTH);
                    setActionInput(v);
                    if (isMyTurn && v.trim().length > 0) {
                      flushTypingEmit(true);
                      scheduleTypingStop();
                    } else if (isMyTurn && v.trim().length === 0) {
                      if (typingIdleRef.current) {
                        clearTimeout(typingIdleRef.current);
                        typingIdleRef.current = null;
                      }
                      flushTypingEmit(false);
                    }
                  }}
                  onBlur={() => {
                    if (typingIdleRef.current) {
                      clearTimeout(typingIdleRef.current);
                      typingIdleRef.current = null;
                    }
                    flushTypingEmit(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleAction()}
                  placeholder={isMyTurn ? "Your action…" : "Waiting for your turn…"}
                  disabled={!isMyTurn}
                  maxLength={MAX_PLAYER_ACTION_LENGTH}
                  className={`w-full border border-violet-200 dark:border-violet-800/60 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100 ${
                    isMyTurn ? "pl-3 pr-14" : "px-3"
                  }`}
                  aria-describedby={
                    isMyTurn ? "action-char-count" : undefined
                  }
                />
                {isMyTurn ? (
                  <span
                    id="action-char-count"
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums text-zinc-400 dark:text-zinc-500"
                    aria-live="polite"
                  >
                    {actionInput.length}/{MAX_PLAYER_ACTION_LENGTH}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleAction}
                disabled={!isMyTurn || !actionInput.trim()}
                className="shrink-0 self-stretch px-4 py-2 rounded-lg font-medium bg-emerald-300 text-emerald-950 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-700 dark:text-emerald-50 dark:hover:bg-emerald-600"
              >
                Send
              </button>
            </div>
          )}

          {!(
            roomState.phase === "end" && roomState.voteOutcome
          ) ? (
            <div className="flex flex-col gap-2 pt-2 border-t border-violet-200/50 dark:border-violet-800/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Players
                </span>
                {roomState.phase === "playing" &&
                roomState.players.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleAckSkipToVote}
                    disabled={
                      !mySocketId ||
                      (roomState.skipToVotePlayerIds ?? []).includes(
                        mySocketId
                      ) ||
                      gmThinking ||
                      Boolean(beatPending)
                    }
                    aria-label="Confirm skip to voting phase; all players must confirm"
                    className="rounded-lg border border-violet-300/80 bg-violet-100/80 px-2.5 py-1 text-[11px] font-medium text-violet-900 hover:bg-violet-200/80 disabled:cursor-not-allowed disabled:opacity-45 dark:border-violet-700/50 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-900/50"
                  >
                    Skip to vote
                  </button>
                ) : null}
              </div>
              {roomState.phase === "playing" &&
              roomState.players.length > 0 ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {(roomState.skipToVotePlayerIds ?? []).length}/
                  {roomState.players.length} ready — everyone must confirm
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {roomState.players.length === 0 ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    —
                  </span>
                ) : (
                  roomState.players.map((p) => {
                    const voted = (
                      roomState.skipToVotePlayerIds ?? []
                    ).includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                          voted
                            ? "border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/25"
                            : "border-zinc-200/70 dark:border-zinc-700/40"
                        }`}
                      >
                        {voted ? (
                          <span
                            className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                            aria-hidden
                          >
                            ✓
                          </span>
                        ) : null}
                        <span className="text-[11px] font-normal leading-tight text-zinc-500 dark:text-zinc-500">
                          {p.name}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {(roomState.phase === "playing" ||
            roomState.phase === "voting" ||
            roomState.phase === "end") && (
            <div className="flex w-full justify-center border-t border-violet-200/50 pt-4 dark:border-violet-800/30">
              <button
                type="button"
                onClick={handleResetGame}
                className="rounded-lg border border-rose-300/90 bg-rose-100/90 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-200/90 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-100 dark:hover:bg-rose-900/50"
              >
                End game — reset room
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

GameClient.displayName = "GameClient";

export default GameClient;
