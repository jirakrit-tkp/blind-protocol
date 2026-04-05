"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createSocket } from "@/lib/socket-client";
import { MAX_PLAYER_ACTION_LENGTH } from "@/lib/game-limits";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";
import {
  isMissionWon,
  isRuleFailed,
  isSystemProtagonistPlayable,
} from "@/lib/world-state";

type WorldState = Record<string, string | number | boolean>;

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
};

const ROLE_COPY: Record<
  "imposter" | "normal",
  { title: string; body: string; className: string }
> = {
  imposter: {
    title: "Imposter",
    body: "Blend in. You may steer the group toward failure.",
    className:
      "border-fuchsia-200 bg-fuchsia-50/90 text-fuchsia-950 dark:border-fuchsia-800/80 dark:bg-fuchsia-950/45 dark:text-fuchsia-100",
  },
  normal: {
    title: "Crew",
    body: "Help the mission succeed for this scenario.",
    className:
      "border-emerald-200 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100",
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

    socket.connect();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      for (const t of remoteTypingRef.current.values()) clearTimeout(t);
      remoteTypingRef.current.clear();
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
    roomState.players[roomState.currentTurn]?.id === socketRef.current?.id;

  const socketId = socketRef.current?.id;
  const myRole =
    roomState &&
    (roomState.phase === "playing" ||
      roomState.phase === "voting" ||
      roomState.phase === "end")
      ? roomState.players.find((p) => p.id === socketId)?.role
      : undefined;

  const showLocalComposing = Boolean(isMyTurn && actionInput.trim().length > 0);

  return (
    <section className="flex flex-col gap-4 max-w-2xl w-full p-6">
      <h1 className="text-2xl font-bold text-violet-950 dark:text-violet-100">
        Blind Protocol
      </h1>

      {error && (
        <p className="text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}

      {!roomState ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
            Enter passcode to access
          </h2>
          <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200">
            <span>Passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="border border-violet-200 dark:border-violet-800/60 px-3 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              suppressHydrationWarning
            />
          </label>
          <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="border border-violet-200 dark:border-violet-800/60 px-3 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              suppressHydrationWarning
            />
          </label>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!passcode.trim() || !name.trim()}
            className="px-4 py-2 rounded-lg w-fit font-medium bg-violet-400 text-violet-950 hover:bg-violet-300 disabled:opacity-50 dark:bg-violet-600 dark:text-violet-50 dark:hover:bg-violet-500"
          >
            Enter
          </button>
        </div>
      ) : roomState.phase === "lobby" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Players: {roomState.players.map((p) => p.name).join(", ") || "(none)"}
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Choose a theme — the room picks a random scenario from{" "}
              <code className="text-xs bg-violet-100/80 dark:bg-violet-950/50 px-1 rounded">
                scenarios
              </code>{" "}
              for everyone at once.
            </p>
            {SCENARIO_THEME_LABELS.length === 0 ? (
              <p className="text-sm text-rose-600 dark:text-rose-400" role="status">
                No themes in scenarios — add{" "}
                <code className="text-xs">data/scenarios.json</code>
              </p>
            ) : (
              <label className="flex flex-col gap-1 text-zinc-800 dark:text-zinc-200">
                <span className="text-sm font-medium">Theme</span>
                <select
                  value={
                    roomState.lobbyTheme &&
                    SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme)
                      ? roomState.lobbyTheme
                      : SCENARIO_THEME_LABELS[0] ?? ""
                  }
                  onChange={(e) => {
                    setError("");
                    socketRef.current?.emit("set_lobby_theme", {
                      theme: e.target.value,
                    });
                  }}
                  className="border border-violet-200 dark:border-violet-800/60 px-3 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100"
                >
                  {SCENARIO_THEME_LABELS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={
              roomState.players.length < 2 ||
              isStarting ||
              SCENARIO_THEME_LABELS.length === 0 ||
              !SCENARIO_THEME_LABELS.includes(roomState.lobbyTheme?.trim() ?? "")
            }
            className="px-4 py-2 rounded-lg w-fit font-medium bg-emerald-300 text-emerald-950 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-700 dark:text-emerald-50 dark:hover:bg-emerald-600"
          >
            {isStarting ? "Starting…" : "Start game"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 capitalize">
            Phase: {roomState.phase}
          </p>

          {myRole && (
            <div
              className={`text-sm font-medium rounded-lg border px-3 py-2 ${ROLE_COPY[myRole].className}`}
            >
              <p className="font-semibold">
                Role: {ROLE_COPY[myRole].title}
              </p>
              <p className="mt-1 font-normal opacity-95">{ROLE_COPY[myRole].body}</p>
            </div>
          )}

          <div className="rounded-xl border-2 border-violet-300/80 dark:border-violet-600/60 bg-violet-100/50 dark:bg-violet-950/40 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              Current turn
            </p>
            <p className="text-lg font-bold text-violet-950 dark:text-violet-50 mt-0.5">
              {roomState.players[roomState.currentTurn]?.name ?? "—"}
              {isMyTurn && (
                <span className="text-base font-semibold text-emerald-700 dark:text-emerald-300">
                  {" "}
                  (you)
                </span>
              )}
            </p>
          </div>

          {roomState.phase === "playing" && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Round {(roomState.roundIndex ?? 0) + 1}/3 — three turns per player
            </p>
          )}

          {roomState.situation && (
            <div className="rounded-lg border border-violet-200/80 dark:border-violet-800/50 bg-white/60 dark:bg-violet-950/25 p-3 text-sm">
              <p className="font-medium mb-1 text-violet-900 dark:text-violet-200">
                Situation
              </p>
              <p className="text-zinc-800 dark:text-zinc-200">{roomState.situation}</p>
            </div>
          )}

          {roomState.phase === "end" && (
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
          )}

          {Object.keys(roomState.worldState ?? {}).length > 0 && (
            <details className="text-sm text-zinc-700 dark:text-zinc-300">
              <summary className="cursor-pointer text-violet-800 dark:text-violet-300">
                World state
              </summary>
              <pre className="mt-1 p-2 rounded-lg border border-violet-200/60 dark:border-violet-800/40 bg-white/50 dark:bg-violet-950/20 overflow-x-auto">
                {JSON.stringify(roomState.worldState, null, 2)}
              </pre>
            </details>
          )}

          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-violet-900 dark:text-violet-200">
              Log
            </h2>
            {(remoteTypingNames.length > 0 || showLocalComposing) && (
              <p
                className="text-xs text-violet-700/90 dark:text-violet-300/90 flex flex-wrap items-center gap-x-2 gap-y-1"
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
            <div className="border border-violet-200/70 dark:border-violet-800/50 rounded-lg p-2 max-h-48 overflow-y-auto bg-white/50 dark:bg-violet-950/20">
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

          {roomState.phase === "playing" && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
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
                  className="flex-1 border border-violet-200 dark:border-violet-800/60 px-2 py-2 rounded-lg bg-white/80 dark:bg-violet-950/30 text-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={!isMyTurn || !actionInput.trim()}
                  className="px-4 py-2 rounded-lg font-medium bg-emerald-300 text-emerald-950 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-700 dark:text-emerald-50 dark:hover:bg-emerald-600"
                >
                  Send
                </button>
              </div>
              {isMyTurn && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {actionInput.length}/{MAX_PLAYER_ACTION_LENGTH} characters (keep it short
                  and directive)
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-violet-200/50 dark:border-violet-800/30">
            Players: {roomState.players.map((p) => p.name).join(", ") || "—"}
          </p>
        </div>
      )}
    </section>
  );
}

GameClient.displayName = "GameClient";

export default GameClient;
