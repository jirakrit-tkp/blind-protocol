"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { BlindProtocolAsciiTitle } from "@/app/components/game/blind-protocol-ascii-title";
import { EndGameConfirmDialog } from "@/app/components/game/end-game-confirm-dialog";
import { GameContentColumn } from "@/app/components/game/game-content-column";
import { GameHomeView } from "@/app/components/game/game-home-view";
import { GameLobbyView } from "@/app/components/game/game-lobby-view";
import { GameSessionView } from "@/app/components/game/game-session-view";
import { RoomAiGmMenu } from "@/app/components/game/room-ai-gm-menu";
import type { PublicRoomState as RoomState } from "@/lib/public-room-state";
import {
  GAME_SESSION_STORAGE_KEY,
  JOIN_CODE_LENGTH,
} from "@/lib/game-api-constants";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import {
  hostLlmToPublicSettings,
  type HostLlmSettingsPublic,
  isRoomLlmReadyPublic,
  type SetHostLlmBody,
} from "@/lib/host-llm-config";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";

type UiTheme = "light" | "dark";

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
  const searchParams = useSearchParams();
  const uiTheme = useSyncExternalStore(
    subscribeThemeChange,
    readClientTheme,
    () => "dark"
  );
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [name, setName] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(
    undefined
  );
  const [displayJoinCode, setDisplayJoinCode] = useState<string | undefined>(
    undefined
  );
  const [isStarting, setIsStarting] = useState(false);
  /** Home screen: waiting on create/join API */
  const [homeBusy, setHomeBusy] = useState<null | "create" | "join">(null);
  const homeLocked = homeBusy !== null;
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
  const [myPlayerId, setMyPlayerId] = useState<string | undefined>(undefined);
  const [rolePanelOpen, setRolePanelOpen] = useState(true);
  /** Local pick before confirming vote (server stores vote only after Confirm). */
  const [voteSelectionId, setVoteSelectionId] = useState<string | null>(null);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [lobbyThemeSaving, setLobbyThemeSaving] = useState(false);
  const [lobbyModeSaving, setLobbyModeSaving] = useState(false);
  const [hostLlmSettings, setHostLlmSettings] =
    useState<HostLlmSettingsPublic | null>(null);
  const [hostLlmSaving, setHostLlmSaving] = useState(false);
  const [lobbyRenameSaving, setLobbyRenameSaving] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const supabaseConfigWarning =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
      ? ""
      : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or PUBLISHABLE_KEY) for live sync.";

  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingReadyRef = useRef(false);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const myPlayerIdRef = useRef<string | undefined>(undefined);
  const roomStateRef = useRef<RoomState | null>(null);
  const tickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasJoinedRef = useRef(false);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const pullGameState = useCallback(async () => {
    const res = await fetch("/api/game/state", { credentials: "include" });
    const data = (await res.json()) as {
      joined?: boolean;
      roomId?: string;
      joinCode?: string;
      playerId?: string;
      state?: RoomState;
      hostLlmSettings?: HostLlmSettingsPublic;
      error?: string;
    };
    if (!res.ok) {
      if (data.error) setError(data.error);
      return;
    }
    if (!data.joined) {
      if (wasJoinedRef.current) {
        void fetch("/api/game/leave", {
          method: "POST",
          credentials: "include",
        });
      }
      wasJoinedRef.current = false;
      setActiveRoomId(undefined);
      setDisplayJoinCode(undefined);
      setRoomState(null);
      setMyPlayerId(undefined);
      setIsStarting(false);
      setHomeBusy(null);
      setVoteSubmitting(false);
      setActionSubmitting(false);
      setLobbyThemeSaving(false);
      setLobbyModeSaving(false);
      setLobbyRenameSaving(false);
      setHostLlmSettings(null);
      setHostLlmSaving(false);
      setResetSubmitting(false);
      setBeatPending(null);
      setGmThinking(false);
      setRemoteTypingNames([]);
      try {
        sessionStorage.removeItem(GAME_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    wasJoinedRef.current = true;
    if (data.roomId) setActiveRoomId(data.roomId);
    if (data.joinCode) setDisplayJoinCode(data.joinCode);
    setRoomState(data.state ?? null);
    setHostLlmSettings(
      data.hostLlmSettings ?? hostLlmToPublicSettings(undefined)
    );
    if (data.playerId) {
      setMyPlayerId(data.playerId);
      try {
        sessionStorage.setItem(
          GAME_SESSION_STORAGE_KEY,
          JSON.stringify({
            roomId: data.roomId,
            playerId: data.playerId,
            joinCode: data.joinCode,
          })
        );
      } catch {
        /* ignore */
      }
    }
    if (data.state && data.state.phase !== "lobby") setIsStarting(false);
    setBeatPending((prev) => {
      if (!prev || !data.state) return null;
      const hit = data.state.logs.some(
        (l) => l.playerId === prev.playerId && l.action === prev.actionLine
      );
      return hit ? null : prev;
    });
  }, []);

  useEffect(() => {
    fetchRef.current = pullGameState;
  }, [pullGameState]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- bootstrap from GET /api/game/state */
    void pullGameState();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pullGameState]);

  const scheduleTickRefetch = useCallback(() => {
    if (tickDebounceRef.current) clearTimeout(tickDebounceRef.current);
    tickDebounceRef.current = setTimeout(() => {
      tickDebounceRef.current = null;
      void fetchRef.current?.();
    }, 80);
  }, []);

  useEffect(() => {
    if (!activeRoomId) return;
    const sb = createBrowserSupabase();
    if (!sb) return;

    const ch = sb
      .channel(`game-room-tick-${activeRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_room_ticks",
          filter: `room_id=eq.${activeRoomId}`,
        },
        () => {
          scheduleTickRefetch();
        }
      )
      .subscribe();

    return () => {
      if (tickDebounceRef.current) clearTimeout(tickDebounceRef.current);
      void sb.removeChannel(ch);
    };
  }, [activeRoomId, scheduleTickRefetch]);

  useEffect(() => {
    if (!activeRoomId) return;
    const sb = createBrowserSupabase();
    if (!sb) return;

    const ch = sb
      .channel(`blind-protocol-typing-${activeRoomId}`, {
        config: { broadcast: { ack: false } },
      })
      .on(
        "broadcast",
        { event: "typing" },
        (payload: { payload?: Record<string, unknown> }) => {
          const pl = payload?.payload;
          if (!pl || typeof pl !== "object") return;
          const pid = typeof pl.playerId === "string" ? pl.playerId : "";
          const pname =
            typeof pl.name === "string" ? pl.name.trim() : "";
          const typing = Boolean(pl.typing);
          if (!pid || !pname) return;
          if (pid === myPlayerIdRef.current) return;

          const existing = remoteTypingRef.current.get(pid);
          if (existing) clearTimeout(existing);

          if (!typing) {
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
      )
      .subscribe((status) => {
        typingReadyRef.current = status === "SUBSCRIBED";
      });

    typingChannelRef.current = ch;
    const typingTimeouts = remoteTypingRef.current;
    return () => {
      typingReadyRef.current = false;
      typingChannelRef.current = null;
      for (const t of typingTimeouts.values()) clearTimeout(t);
      typingTimeouts.clear();
      void sb.removeChannel(ch);
    };
  }, [activeRoomId]);

  const flushTypingEmit = useCallback((typing: boolean) => {
    const ch = typingChannelRef.current;
    if (!ch || !typingReadyRef.current) return;
    const id = myPlayerIdRef.current;
    if (!id) return;
    const rs = roomStateRef.current;
    const pname = rs?.players.find((p) => p.id === id)?.name?.trim();
    if (!pname) return;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { playerId: id, name: pname, typing },
    });
  }, []);

  const scheduleTypingStop = useCallback(() => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      flushTypingEmit(false);
      typingIdleRef.current = null;
    }, 1200);
  }, [flushTypingEmit]);

  useEffect(() => {
    const sendLeave = () => {
      if (typeof navigator.sendBeacon !== "function") return;
      navigator.sendBeacon(
        `${window.location.origin}/api/game/leave`,
        new Blob([], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", sendLeave);
    return () => window.removeEventListener("beforeunload", sendLeave);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
  }, [uiTheme]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync join field from ?join= / ?code= */
    const raw = searchParams.get("join") ?? searchParams.get("code");
    if (!raw) return;
    const normalized = raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, JOIN_CODE_LENGTH);
    if (normalized.length > 0) setJoinCodeInput(normalized);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchParams]);

  const handleThemeChange = (theme: UiTheme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  const handleCreateRoom = async () => {
    setError("");
    if (!name.trim()) {
      setError("Enter your display name");
      return;
    }
    setHomeBusy("create");
    try {
      const res = await fetch("/api/game/rooms/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        roomId?: string;
        joinCode?: string;
        playerId?: string;
        state?: RoomState;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not create room");
        return;
      }
      if (data.roomId) setActiveRoomId(data.roomId);
      if (data.joinCode) setDisplayJoinCode(data.joinCode);
      if (data.playerId) setMyPlayerId(data.playerId);
      if (data.state) setRoomState(data.state);
      if (data.roomId && data.playerId) {
        try {
          sessionStorage.setItem(
            GAME_SESSION_STORAGE_KEY,
            JSON.stringify({
              roomId: data.roomId,
              playerId: data.playerId,
              joinCode: data.joinCode,
            })
          );
        } catch {
          /* ignore */
        }
      }
      wasJoinedRef.current = true;
    } finally {
      setHomeBusy(null);
    }
  };

  const handleJoinRoom = async () => {
    setError("");
    if (!name.trim()) {
      setError("Enter your display name");
      return;
    }
    const code = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== JOIN_CODE_LENGTH) {
      setError(`Join code must be ${JOIN_CODE_LENGTH} characters`);
      return;
    }
    setHomeBusy("join");
    try {
      const res = await fetch("/api/game/rooms/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joinCode: code,
          displayName: name.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        roomId?: string;
        joinCode?: string;
        playerId?: string;
        state?: RoomState;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not join room");
        return;
      }
      if (data.roomId) setActiveRoomId(data.roomId);
      if (data.joinCode) setDisplayJoinCode(data.joinCode);
      if (data.playerId) setMyPlayerId(data.playerId);
      if (data.state) setRoomState(data.state);
      if (data.roomId && data.playerId) {
        try {
          sessionStorage.setItem(
            GAME_SESSION_STORAGE_KEY,
            JSON.stringify({
              roomId: data.roomId,
              playerId: data.playerId,
              joinCode: data.joinCode,
            })
          );
        } catch {
          /* ignore */
        }
      }
      wasJoinedRef.current = true;
    } finally {
      setHomeBusy(null);
    }
  };

  const confirmVote = async () => {
    if (!voteSelectionId) return;
    setVoteSubmitting(true);
    try {
      const res = await fetch("/api/game/vote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: voteSelectionId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Vote failed");
        return;
      }
      await pullGameState();
    } finally {
      setVoteSubmitting(false);
    }
  };

  const handleResetGame = async () => {
    setResetSubmitting(true);
    try {
      const res = await fetch("/api/game/reset", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Reset failed");
        return;
      }
      setEndGameConfirmOpen(false);
      setMyPlayerId(undefined);
      setActiveRoomId(undefined);
      setDisplayJoinCode(undefined);
      try {
        sessionStorage.removeItem(GAME_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      await pullGameState();
    } finally {
      setResetSubmitting(false);
    }
  };

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync vote UI with server votes */
    if (!roomState || roomState.phase !== "voting") {
      setVoteSelectionId(null);
      return;
    }
    if (
      myPlayerId &&
      roomState.votes &&
      Object.hasOwn(roomState.votes, myPlayerId)
    ) {
      setVoteSelectionId(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [roomState, myPlayerId]);

  const handleSaveHostLlm = async (body: SetHostLlmBody) => {
    setHostLlmSaving(true);
    try {
      const res = await fetch("/api/game/host-llm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        return {
          ok: false,
          error: data.error ?? "Could not save AI settings",
        };
      }
      await pullGameState();
      return { ok: true };
    } finally {
      setHostLlmSaving(false);
    }
  };

  const handleSetLobbyTheme = async (theme: string) => {
    setError("");
    setLobbyThemeSaving(true);
    try {
      const res = await fetch("/api/game/set-lobby-theme", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set theme");
        return;
      }
      await pullGameState();
    } finally {
      setLobbyThemeSaving(false);
    }
  };

  const handleSetLobbyMode = async (mode: "imposter" | "mission") => {
    setError("");
    setLobbyModeSaving(true);
    try {
      const res = await fetch("/api/game/set-lobby-mode", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set mode");
        return;
      }
      await pullGameState();
    } finally {
      setLobbyModeSaving(false);
    }
  };

  const handleRenameLobbyDisplayName = async (
    displayName: string
  ): Promise<boolean> => {
    setError("");
    setLobbyRenameSaving(true);
    try {
      const res = await fetch("/api/game/rename-display-name", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not change name");
        return false;
      }
      await pullGameState();
      return true;
    } catch {
      setError("Could not change name");
      return false;
    } finally {
      setLobbyRenameSaving(false);
    }
  };

  const handleStartGame = async () => {
    setError("");
    if (!roomState) return;
    const themeToUse = roomState.lobbyTheme?.trim() ?? "";
    if (!themeToUse || !SCENARIO_THEME_LABELS.includes(themeToUse)) {
      setError("Pick a theme from the list");
      return;
    }
    setIsStarting(true);
    const res = await fetch("/api/game/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: themeToUse,
        mode: roomState.lobbyMode ?? "imposter",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setIsStarting(false);
      setError(data.error ?? "Could not start");
      return;
    }
    await pullGameState();
  };

  const handleAction = async () => {
    setError("");
    if (!actionInput.trim() || !roomState) return;
    if (!myPlayerId) return;
    const currentPlayer = roomState.players[roomState.currentTurn];
    if (!currentPlayer || currentPlayer.id !== myPlayerId) return;

    const actionLine = `${currentPlayer.name}: ${actionInput.trim()}`;
    setActionSubmitting(true);
    setBeatPending({ actionLine, playerId: myPlayerId });
    flushTypingEmit(false);
    const actionText = actionInput.trim();
    setActionInput("");
    setGmThinking(true);
    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionText }),
      });
      const data = (await res.json()) as {
        error?: string;
        beatAborted?: boolean;
      };
      if (!res.ok) {
        if (data.beatAborted) {
          setBeatPending(null);
        }
        setError(data.error ?? "Action failed");
        return;
      }
      await pullGameState();
    } finally {
      setGmThinking(false);
      setActionSubmitting(false);
    }
  };

  const myRole =
    roomState &&
    myPlayerId &&
    (roomState.phase === "playing" ||
      roomState.phase === "voting" ||
      roomState.phase === "end")
      ? roomState.players.find((p) => p.id === myPlayerId)?.role
      : undefined;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- open role panel when role is assigned */
    if (myRole) setRolePanelOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [myRole]);

  const themeFieldLabelId = useId();
  const rolePanelContentId = useId();
  const logScrollContainerRef = useRef<HTMLDivElement>(null);

  const lobbyControlShell =
    "w-full min-h-12 rounded-xl border-2 px-4 py-3 text-base font-medium transition-colors";
  const lobbySelectClass = `${lobbyControlShell} crt-card hover:bg-[color-mix(in_srgb,var(--crt-panel)_70%,var(--crt-bg)_30%)]`;
  /** Hover via `.crt-btn-cta` in globals — beats `.crt-card` / `.crt-ui button` !important. */
  const lobbyPrimaryBtnClass = `${lobbyControlShell} crt-btn-cta disabled:opacity-50`;
  const lobbyStartBtnClass = `${lobbyControlShell} crt-btn-cta disabled:opacity-50`;

  /** ASCII title block only before joining a room (home). */
  const showAsciiTitle = !roomState;

  /** Plain “Blind Protocol” in header whenever joined (lobby matches in-game bar). */
  const showPlainHeaderTitle = Boolean(roomState);

  const isRoomHost = Boolean(
    roomState && myPlayerId && roomState.players[0]?.id === myPlayerId
  );
  const canEditRoomLlm = Boolean(
    isRoomHost && roomState?.phase === "lobby"
  );
  const roomAiReady = Boolean(
    hostLlmSettings && isRoomLlmReadyPublic(hostLlmSettings)
  );
  const roomLlmReadOnlyNotice =
    !canEditRoomLlm &&
    isRoomHost &&
    roomState &&
    roomState.phase !== "lobby"
      ? "Game in progress — AI settings can only be changed in the lobby before Start."
      : undefined;

  return (
    <section className="crt-ui mx-auto flex w-full min-w-0 max-w-2xl flex-col items-stretch gap-4 sm:gap-5">
      <header className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center justify-start">
          {showPlainHeaderTitle ? (
            <h1 className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
              Blind Protocol
            </h1>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {roomState && isRoomHost ? (
            <RoomAiGmMenu
              settings={hostLlmSettings ?? hostLlmToPublicSettings(undefined)}
              saving={hostLlmSaving}
              onSave={handleSaveHostLlm}
              canEdit={canEditRoomLlm}
              readOnlyNotice={roomLlmReadOnlyNotice}
            />
          ) : null}
          <div
            className="crt-mode-toggle inline-flex shrink-0 items-center rounded-md border"
            role="group"
            aria-label="Choose light or dark theme"
          >
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide first:rounded-l-sm last:rounded-r-sm ${
                uiTheme === "light" ? "is-active" : ""
              }`}
              aria-pressed={uiTheme === "light"}
              suppressHydrationWarning
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide first:rounded-l-sm last:rounded-r-sm ${
                uiTheme === "dark" ? "is-active" : ""
              }`}
              aria-pressed={uiTheme === "dark"}
              suppressHydrationWarning
            >
              Dark
            </button>
          </div>
        </div>
      </header>
      {supabaseConfigWarning ? (
        <p
          className="w-full rounded-lg border border-amber-600/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {supabaseConfigWarning}
        </p>
      ) : null}
      {showAsciiTitle ? (
        <div className="crt-title-ascii-bleed self-stretch w-full min-w-0">
          <div className="relative left-1/2 box-border w-svw max-w-svw shrink-0 -translate-x-1/2 overflow-hidden px-4 sm:px-5">
            <BlindProtocolAsciiTitle />
          </div>
        </div>
      ) : null}

      {error && (
        <p className="text-rose-600 dark:text-rose-400 text-center" role="alert">
          {error}
        </p>
      )}

      <GameContentColumn>
        {!roomState ? (
          <GameHomeView
            name={name}
            setName={setName}
            joinCodeInput={joinCodeInput}
            setJoinCodeInput={setJoinCodeInput}
            homeLocked={homeLocked}
            homeBusy={homeBusy}
            lobbyPrimaryBtnClass={lobbyPrimaryBtnClass}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        ) : roomState.phase === "lobby" ? (
          <GameLobbyView
            roomState={roomState}
            displayJoinCode={displayJoinCode}
            myPlayerId={myPlayerId}
            themeFieldLabelId={themeFieldLabelId}
            lobbySelectClass={lobbySelectClass}
            lobbyStartBtnClass={lobbyStartBtnClass}
            isStarting={isStarting}
            lobbyThemeSaving={lobbyThemeSaving}
            lobbyModeSaving={lobbyModeSaving}
            hostLlmSaving={hostLlmSaving}
            roomAiReady={roomAiReady}
            isRoomHost={isRoomHost}
            renameSaving={lobbyRenameSaving}
            onStartGame={handleStartGame}
            onSetLobbyTheme={handleSetLobbyTheme}
            onSetLobbyMode={handleSetLobbyMode}
            onRenameDisplayName={handleRenameLobbyDisplayName}
            onOpenEndGameConfirm={() => setEndGameConfirmOpen(true)}
          />
        ) : (
          <GameSessionView
            roomState={roomState}
            myPlayerId={myPlayerId}
            voteSelectionId={voteSelectionId}
            setVoteSelectionId={setVoteSelectionId}
            voteSubmitting={voteSubmitting}
            onConfirmVote={() => void confirmVote()}
            actionInput={actionInput}
            setActionInput={setActionInput}
            actionSubmitting={actionSubmitting}
            onSendAction={() => void handleAction()}
            flushTypingEmit={flushTypingEmit}
            scheduleTypingStop={scheduleTypingStop}
            typingIdleRef={typingIdleRef}
            rolePanelOpen={rolePanelOpen}
            setRolePanelOpen={setRolePanelOpen}
            rolePanelContentId={rolePanelContentId}
            logScrollContainerRef={logScrollContainerRef}
            remoteTypingNames={remoteTypingNames}
            beatPending={beatPending}
            gmThinking={gmThinking}
            onOpenEndGameConfirm={() => setEndGameConfirmOpen(true)}
          />
        )}
      </GameContentColumn>
      <EndGameConfirmDialog
        open={endGameConfirmOpen}
        confirmLoading={resetSubmitting}
        onCancel={() => setEndGameConfirmOpen(false)}
        onConfirm={() => void handleResetGame()}
      />
    </section>
  );
}

GameClient.displayName = "GameClient";

export default GameClient;
