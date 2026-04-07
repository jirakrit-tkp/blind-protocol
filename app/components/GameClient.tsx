"use client";

import type { KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createSocket } from "@/lib/socket-client";
import { MAX_PLAYER_ACTION_LENGTH } from "@/lib/game-limits";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";
import {
  isMissionWon,
  isSystemProtagonistPlayable,
  SYSTEM_LOG_PLAYER_ID,
} from "@/lib/world-state";
import { BLIND_PROTOCOL_ASCII } from "@/lib/blind-protocol-ascii";

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
  votes: Record<string, string>;
  voteOutcome?: VoteOutcome;
  voteTieInfo?: VoteTieInfo;
};

type UiTheme = "light" | "dark";

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
    className: "crt-card border-[3px]",
  },
  normal: {
    title: "Crew",
    body: "Help the mission succeed for this scenario.",
    className: "crt-card border-[3px]",
  },
};

function BlindProtocolAsciiTitle() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const fitAsciiFont = useCallback(() => {
    const wrap = wrapRef.current;
    const pre = preRef.current;
    if (!wrap || !pre) return;
    /** Padding for rounding / font metrics so UA <pre> scrollbars never appear. */
    const maxW = Math.max(0, wrap.clientWidth - 8);
    if (maxW < 12) return;

    const MIN_PX = 12;
    /** Cap keeps fit stable; layout uses full viewport width via bleed wrapper. */
    const MAX_PX = 128;
    let lo = MIN_PX;
    let hi = MAX_PX;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      wrap.style.setProperty("--ascii-title-font-size", `${mid}px`);
      if (pre.scrollWidth <= maxW) lo = mid;
      else hi = mid;
    }
    let best = Math.max(MIN_PX, Math.floor(lo * 10) / 10);
    wrap.style.setProperty("--ascii-title-font-size", `${best}px`);
    for (let step = 0; step < 40; step++) {
      if (
        pre.scrollWidth <= maxW &&
        pre.scrollHeight <= pre.clientHeight &&
        pre.scrollWidth <= pre.clientWidth
      ) {
        break;
      }
      best = Math.max(MIN_PX, Math.round((best - 0.25) * 100) / 100);
      wrap.style.setProperty("--ascii-title-font-size", `${best}px`);
    }
  }, []);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    fitAsciiFont();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(fitAsciiFont);
    });
    ro.observe(wrap);
    void document.fonts.ready.then(() => {
      requestAnimationFrame(fitAsciiFont);
    });
    return () => ro.disconnect();
  }, [fitAsciiFont]);

  return (
    <>
      <h1 className="crt-title-plain max-w-full px-1 text-center font-mono text-3xl font-semibold leading-snug tracking-normal normal-case sm:text-4xl md:sr-only">
        Blind Protocol
      </h1>
      <div
        ref={wrapRef}
        className="crt-title-ascii-wrap hidden w-full min-w-0 justify-center md:flex"
      >
        <pre
          ref={preRef}
          className="crt-title-ascii inline-block max-w-full min-w-0 text-left"
          aria-hidden
        >
          {BLIND_PROTOCOL_ASCII}
        </pre>
      </div>
    </>
  );
}

BlindProtocolAsciiTitle.displayName = "BlindProtocolAsciiTitle";

const TYPING_DOT_PHASES = [".", "..", "...", ""] as const;

function TypingEllipsis() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % TYPING_DOT_PHASES.length);
    }, 350);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono tracking-tight" aria-hidden>
      {TYPING_DOT_PHASES[phase]}
    </span>
  );
}

TypingEllipsis.displayName = "TypingEllipsis";

const NARRATION_SPIN_FRAMES = ["/", "-", "\\", "|"] as const;

function NarrationSpinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setI((x) => (x + 1) % NARRATION_SPIN_FRAMES.length);
    }, 90);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="inline-block min-w-[1ch] text-center font-mono"
      aria-hidden
    >
      {NARRATION_SPIN_FRAMES[i]}
    </span>
  );
}

NarrationSpinner.displayName = "NarrationSpinner";

type TypewriterBlockProps = {
  text: string;
  charDelayMs?: number;
  /** Extra ms before the first character (default: same as charDelayMs). */
  startDelayMs?: number;
  className?: string;
  /** When false, nothing is rendered (deferred reveal). */
  play?: boolean;
  onRevealComplete?: () => void;
};

function TypewriterBlock({
  text,
  charDelayMs = 10,
  startDelayMs,
  className,
  play = true,
  onRevealComplete,
}: TypewriterBlockProps) {
  const [n, setN] = useState(0);
  const onCompleteRef = useRef(onRevealComplete);
  const firedRef = useRef(false);

  useLayoutEffect(() => {
    onCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  useLayoutEffect(() => {
    firedRef.current = false;
  }, [text, play]);

  useLayoutEffect(() => {
    if (!play) return;
    if (!text) return;
    let i = 0;
    let id: number | undefined;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      i += 1;
      setN(Math.min(i, text.length));
      if (i < text.length) {
        id = window.setTimeout(run, charDelayMs);
      }
    };
    const firstDelay =
      startDelayMs !== undefined ? startDelayMs : charDelayMs;
    id = window.setTimeout(run, firstDelay);
    return () => {
      cancelled = true;
      if (id !== undefined) clearTimeout(id);
    };
  }, [text, charDelayMs, startDelayMs, play]);

  useEffect(() => {
    if (!play || !text.length) return;
    if (n === text.length && !firedRef.current) {
      firedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [n, text, play]);

  if (!play) return null;

  const visible = text.slice(0, n);
  const showCursor = text.length > 0 && n < text.length;

  return (
    <span className={className}>
      {visible}
      {showCursor ? (
        <span className="crt-typewriter-cursor" aria-hidden />
      ) : null}
    </span>
  );
}

TypewriterBlock.displayName = "TypewriterBlock";

/** When mission outcome follows a log line with action only (no narrative), unlock after paint. */
type MissionChainUnlockProps = {
  onUnlock: () => void;
};

function MissionChainUnlock({ onUnlock }: MissionChainUnlockProps) {
  useLayoutEffect(() => {
    onUnlock();
  }, [onUnlock]);
  return null;
}

MissionChainUnlock.displayName = "MissionChainUnlock";

type EndGameConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function EndGameConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: EndGameConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-confirm-title"
        className="crt-card max-w-sm w-full rounded-2xl border-2 p-5 shadow-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <h2
          id="end-game-confirm-title"
          className="text-base font-semibold uppercase tracking-wide"
        >
          End game?
        </h2>
        <p className="mt-3 text-sm leading-relaxed opacity-90">
          {
            "This will end the session for everyone and return to the lobby."
          }
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-medium"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
            onClick={onConfirm}
          >
            End game
          </button>
        </div>
      </div>
    </div>
  );
}

EndGameConfirmDialog.displayName = "EndGameConfirmDialog";

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
      </button>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="crt-card absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border-2 py-1 backdrop-blur-sm"
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
                className={`mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent! px-3 py-2.5 text-left text-sm transition-colors hover:border-(--crt-soft)! hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)] select-none ${
                  selected ? "font-semibold" : "font-medium"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(label)}
              >
                <span className="min-w-0 truncate">{label}</span>
                {selected ? (
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

LobbyThemePicker.displayName = "LobbyThemePicker";

const THEME_STORAGE_KEY = "blind-protocol-ui-theme";
const THEME_CHANGE_EVENT = "blind-protocol-ui-theme-change";

function readClientTheme(): UiTheme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeThemeChange(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== THEME_STORAGE_KEY) return;
    onStoreChange();
  };
  const onLocalThemeChange = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onLocalThemeChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onLocalThemeChange);
  };
}

function GameClient() {
  const uiTheme = useSyncExternalStore(
    subscribeThemeChange,
    readClientTheme,
    () => "dark"
  );
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
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
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

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
  }, [uiTheme]);

  const handleThemeChange = (theme: UiTheme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

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

  const confirmVote = () => {
    if (!voteSelectionId || !socketRef.current) return;
    socketRef.current.emit("vote", { targetId: voteSelectionId });
  };

  const handleResetGame = () => {
    socketRef.current?.emit("reset_game");
    setEndGameConfirmOpen(false);
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
  const myPlayerName =
    roomState && mySocketId
      ? roomState.players.find((p) => p.id === mySocketId)?.name
      : undefined;

  useEffect(() => {
    if (myRole) setRolePanelOpen(true);
  }, [myRole]);

  const themeFieldLabelId = useId();
  const rolePanelContentId = useId();

  const logs = roomState?.logs;
  const missionOutcomeIdx = useMemo(() => {
    if (!logs?.length) return -1;
    return logs.findIndex(
      (l) =>
        l.playerId === SYSTEM_LOG_PLAYER_ID &&
        l.action === "[MISSION OUTCOME]"
    );
  }, [logs]);

  const [missionChainDone, setMissionChainDone] = useState(false);

  useEffect(() => {
    /* Reset typed-chain unlock when the mission outcome row appears or is removed. */
    /* eslint-disable react-hooks/set-state-in-effect */
    if (missionOutcomeIdx <= 0) {
      setMissionChainDone(true);
    } else {
      setMissionChainDone(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [missionOutcomeIdx]);

  const missionOutcomeUnlocked =
    missionOutcomeIdx <= 0 || missionChainDone;

  const unlockMissionOutcome = useCallback(() => {
    setMissionChainDone(true);
  }, []);

  const lobbyControlShell =
    "w-full min-h-12 rounded-xl border-2 px-4 py-3 text-base font-medium transition-colors";
  const lobbySelectClass = `${lobbyControlShell} crt-card hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)]`;
  /** Hover via `.crt-btn-cta` in globals — beats `.crt-card` / `.crt-ui button` !important. */
  const lobbyPrimaryBtnClass = `${lobbyControlShell} crt-btn-cta disabled:opacity-50`;
  const lobbyStartBtnClass = `${lobbyControlShell} crt-btn-cta disabled:opacity-50`;

  /** Title only on login + lobby (hidden during play / vote / end). */
  const showGameTitle =
    !roomState || roomState.phase === "lobby";

  return (
    <section className="crt-ui flex max-w-2xl w-full flex-col items-center gap-6 p-6">
      <header className="flex w-full items-center justify-end">
        <div
          className="crt-mode-toggle inline-flex items-center rounded-md border"
          role="group"
          aria-label="Choose light or dark theme"
        >
          <button
            type="button"
            onClick={() => handleThemeChange("light")}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              uiTheme === "light" ? "is-active" : ""
            }`}
            aria-pressed={uiTheme === "light"}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange("dark")}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              uiTheme === "dark" ? "is-active" : ""
            }`}
            aria-pressed={uiTheme === "dark"}
          >
            Dark
          </button>
        </div>
      </header>
      {showGameTitle ? (
        <div className="crt-title-ascii-bleed self-stretch w-full min-w-0">
          <div className="relative left-1/2 box-border w-svw max-w-svw shrink-0 -translate-x-1/2 overflow-hidden px-3 sm:px-6">
            <BlindProtocolAsciiTitle />
          </div>
        </div>
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
                    {p.id === mySocketId ? " (YOU)" : ""}
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
              {roomState.phase === "playing" &&
              roomState.players.length > 0 ? (
                <span className="shrink-0 text-right">
                  Turn{" "}
                  {(roomState.roundIndex ?? 0) * roomState.players.length +
                    roomState.currentTurn +
                    1}
                  /{3 * roomState.players.length}
                </span>
              ) : null}
            </p>
          )}

          {roomState.phase === "voting" && roomState.players.length > 0 ? (
            <div className="crt-vote-panel rounded-2xl border-2 p-5">
              <h2 className="text-center text-xl font-bold">
                Vote for the Imposter
              </h2>
              {roomState.voteTieInfo ? (
                <div
                  className="crt-vote-tie-banner mt-3 px-3 py-3 text-sm"
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
                <p className="mt-3 text-center text-sm font-semibold">
                  Your vote:{" "}
                  {roomState.players.find(
                    (x) => x.id === roomState.votes[mySocketId]
                  )?.name ?? "—"}
                </p>
              ) : null}
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
                      className={`crt-vote-target rounded-xl border-2 px-4 py-5 text-center text-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        selected ? "crt-vote-target--selected" : ""
                      } ${
                        prevIsTop && !selected
                          ? "crt-vote-target--tie-hint"
                          : ""
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
                  className="crt-btn-cta mt-4 w-full min-h-12 rounded-xl border-2 px-4 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
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
                    className="crt-hr-border px-6 py-10 text-center"
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
                      className={`crt-end-tally px-4 py-4 text-center ${
                        isTopVote ? "crt-end-tally--top" : "opacity-85"
                      }`}
                    >
                      <p className="text-lg font-bold">{p.name}</p>
                      <p
                        className={`mt-1 text-sm font-semibold tabular-nums ${
                          isTopVote ? "" : "opacity-70"
                        }`}
                      >
                        {vCount} vote{vCount === 1 ? "" : "s"}
                      </p>
                      <p
                        className={`mt-2 text-sm font-semibold uppercase tracking-wide ${
                          isTopVote ? "" : "opacity-70"
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
                  {myPlayerName ? `${myPlayerName}. You are:` : "You are:"}
                </span>
                <span className="min-w-0 flex-1" aria-hidden />
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
                  className="crt-role-panel-body px-5 pb-5 pt-4 text-center"
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

          {!(
            roomState.phase === "end" && roomState.voteOutcome
          ) ? (
          <div className="crt-readable-surface rounded-lg border p-3 text-sm">
            {roomState.situation ? (
              <div className="mb-3">
                <p className="mb-1 font-medium">
                  Situation
                </p>
                <p>
                  <TypewriterBlock
                    key={roomState.situation}
                    text={roomState.situation}
                    charDelayMs={8}
                  />
                </p>
              </div>
            ) : null}
            <div
              className={
                roomState.situation
                  ? "border-t border-(--crt-border) pt-3"
                  : ""
              }
            >
              <h2 className="text-base font-semibold">
                Log
              </h2>
              {remoteTypingNames.length > 0 ? (
                <p
                  className="crt-typing-indicator mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{remoteTypingNames.join(", ")}</span>
                    <TypingEllipsis />
                    <span className="sr-only">typing</span>
                  </span>
                </p>
              ) : null}
              <div className="mt-2 max-h-48 overflow-y-auto py-1">
                {roomState.logs.length === 0 && !beatPending && !gmThinking ? (
                  <p className="opacity-70">No actions yet.</p>
                ) : (
                  <>
                    {roomState.logs.map((log, i) => {
                      const isMissionOutcome =
                        log.playerId === SYSTEM_LOG_PLAYER_ID &&
                        log.action === "[MISSION OUTCOME]";
                      if (isMissionOutcome) {
                        if (!missionOutcomeUnlocked) return null;
                        const won = isMissionWon(roomState.worldState);
                        return (
                          <div
                            key={`${i}-mission`}
                            className="mb-4 mt-10 w-full last:mb-0 sm:mt-12"
                            role="status"
                          >
                            <p
                              className={`w-full text-center font-medium ${
                                won
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              <TypewriterBlock
                                key={log.narrative ?? "mission"}
                                text={log.narrative ?? ""}
                                charDelayMs={10}
                                startDelayMs={550}
                                className="inline-block max-w-full text-center"
                              />
                            </p>
                          </div>
                        );
                      }
                      const chainFromThis =
                        missionOutcomeIdx > 0 && i === missionOutcomeIdx - 1;
                      return (
                        <div key={i} className="mb-4 last:mb-0">
                          <p className="font-medium">{log.action}</p>
                          {chainFromThis && !log.narrative ? (
                            <MissionChainUnlock
                              onUnlock={unlockMissionOutcome}
                            />
                          ) : null}
                          {log.narrative ? (
                            <div className="mt-1.5">
                              <p className="mb-0.5 text-xs font-semibold">
                                Narration
                              </p>
                              <p className="text-sm opacity-85">
                                <TypewriterBlock
                                  key={`${i}-n-${log.narrative}`}
                                  text={log.narrative}
                                  charDelayMs={10}
                                  onRevealComplete={
                                    chainFromThis
                                      ? unlockMissionOutcome
                                      : undefined
                                  }
                                />
                              </p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {beatPending ? (
                      <div className="mb-2">
                        <p className="font-medium">{beatPending.actionLine}</p>
                        {gmThinking ? (
                          <div className="mt-1.5">
                            <p className="mb-0.5 text-xs font-semibold">
                              Narration
                            </p>
                            <p
                              className="text-sm opacity-85 inline-flex min-h-[1.25em] flex-wrap items-baseline gap-x-1.5"
                              aria-live="polite"
                            >
                              <NarrationSpinner />
                              <span className="sr-only">
                                Generating narration
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {gmThinking && !beatPending ? (
                      <div className="mb-2">
                        <p className="mb-0.5 text-xs font-semibold">
                          Narration
                        </p>
                        <p
                          className="text-sm opacity-85 inline-flex min-h-[1.25em] flex-wrap items-baseline gap-x-1.5"
                          aria-live="polite"
                        >
                          <NarrationSpinner />
                          <span className="sr-only">Generating narration</span>
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
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
                  className={`crt-action-input w-full rounded-lg border-2 border-violet-200 py-2 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-zinc-100 ${
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
                className="crt-btn-cta shrink-0 self-stretch rounded-lg px-4 py-2 font-medium disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}

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

          {!(
            roomState.phase === "end" && roomState.voteOutcome
          ) ? (
            <div className="flex flex-col gap-2 border-t border-violet-200/50 pt-2 dark:border-violet-800/30">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Players
              </span>
              <div className="flex flex-wrap gap-1.5">
                {roomState.players.length === 0 ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    —
                  </span>
                ) : (
                  roomState.players.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center rounded-md border border-zinc-200/70 px-1.5 py-0.5 dark:border-zinc-700/40"
                    >
                      <span className="text-[11px] font-normal leading-tight text-zinc-500 dark:text-zinc-500">
                        {p.name}
                      </span>
                    </div>
                  ))
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
                onClick={() => setEndGameConfirmOpen(true)}
                className="crt-btn-cta rounded-lg px-4 py-2 text-sm font-semibold"
              >
                End game
              </button>
            </div>
          )}
        </div>
      )}
      <EndGameConfirmDialog
        open={endGameConfirmOpen}
        onCancel={() => setEndGameConfirmOpen(false)}
        onConfirm={handleResetGame}
      />
    </section>
  );
}

GameClient.displayName = "GameClient";

export default GameClient;
