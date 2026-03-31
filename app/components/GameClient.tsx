"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createSocket } from "@/lib/socket-client";
import { SCENARIO_THEME_LABELS } from "@/lib/scenario-theme-labels";
import { isSystemProtagonistPlayable } from "@/lib/world-state";

type WorldState = Record<string, string | number | boolean>;

type RoomState = {
  id: string;
  players: { id: string; name: string; role?: "imposter" | "normal" }[];
  logs: { playerId: string; action: string; narrative?: string }[];
  currentTurn: number;
  roundIndex: number;
  phase: "lobby" | "playing" | "voting" | "end";
  missionProgress: number;
  worldState: WorldState;
  situation?: string;
};

function GameClient() {
  const [passcode, setPasscode] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState(SCENARIO_THEME_LABELS[0] ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("room_update", (state: RoomState) => {
      setRoomState(state);
      if (state.phase !== "lobby") setIsStarting(false);
    });

    socket.on("new_log", (logs: { playerId: string; action: string; narrative?: string }[]) => {
      setRoomState((prev) =>
        prev
          ? { ...prev, logs: [...prev.logs, ...logs] }
          : null
      );
    });

    socket.on("phase_change", (phase: string) => {
      setRoomState((prev) => (prev ? { ...prev, phase: phase as RoomState["phase"] } : null));
    });

    socket.on("error", (payload: { message: string }) => {
      setError(payload.message);
      setIsStarting(false);
    });

    socket.connect();
  }, []);

  useEffect(() => {
    connect();
    return () => {
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
    const themeToUse = theme.trim();
    if (!themeToUse || !SCENARIO_THEME_LABELS.includes(themeToUse)) {
      setError("เลือกธีมจากรายการ");
      return;
    }
    setIsStarting(true);
    socketRef.current?.emit("start_game", { theme: themeToUse });
  };

  const handleAction = () => {
    setError("");
    if (!actionInput.trim() || !roomState) return;
    socketRef.current?.emit("action", { action: actionInput.trim() });
    setActionInput("");
  };

  const isMyTurn =
    roomState &&
    roomState.phase === "playing" &&
    isSystemProtagonistPlayable(roomState.worldState) &&
    roomState.players[roomState.currentTurn]?.id === socketRef.current?.id;

  return (
    <section className="flex flex-col gap-4 max-w-2xl w-full p-6">
      <h1 className="text-2xl font-bold">Blind Protocol</h1>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      {!roomState ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Enter passcode to access</h2>
          <label className="flex flex-col gap-1">
            <span>Passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="border px-3 py-2 rounded"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="border px-3 py-2 rounded"
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
            />
          </label>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!passcode.trim() || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded w-fit disabled:opacity-50"
          >
            Enter
          </button>
        </div>
      ) : roomState.phase === "lobby" ? (
        <div className="flex flex-col gap-4">
          <p>Players: {roomState.players.map((p) => p.name).join(", ") || "(none)"}</p>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              เลือกธีม — สุ่มสถานการณ์จากไฟล์ scenarios ตามธีมที่เลือก
            </p>
            <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
              <legend className="block text-sm font-medium mb-1">ธีม</legend>
              <div className="flex flex-wrap gap-2">
                {SCENARIO_THEME_LABELS.length === 0 ? (
                  <p className="text-sm text-red-600" role="status">
                    ยังไม่มีธีมใน scenarios — เพิ่ม data/scenarios.json
                  </p>
                ) : (
                  SCENARIO_THEME_LABELS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTheme(label)}
                      className={`px-3 py-1.5 rounded text-sm ${
                        theme === label
                          ? "bg-purple-600 text-white"
                          : "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))
                )}
              </div>
            </fieldset>
          </div>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={
              roomState.players.length < 2 ||
              isStarting ||
              SCENARIO_THEME_LABELS.length === 0 ||
              !SCENARIO_THEME_LABELS.includes(theme.trim())
            }
            className="px-4 py-2 bg-purple-600 text-white rounded w-fit disabled:opacity-50"
          >
            {isStarting ? "กำลังเริ่ม…" : "Start Game"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p>Phase: {roomState.phase}</p>
          {roomState.phase === "playing" && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Round {(roomState.roundIndex ?? 0) + 1}/3 — 3 turns per player
            </p>
          )}
          {roomState.situation && (
            <div className="rounded bg-zinc-100 dark:bg-zinc-800 p-3 text-sm">
              <p className="font-medium mb-1">Situation</p>
              <p className="text-zinc-700 dark:text-zinc-300">{roomState.situation}</p>
            </div>
          )}
          <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Mission progress: {roomState.missionProgress ?? 0}%
              </p>
              <div className="mt-1 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-green-600 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, roomState.missionProgress ?? 0))}%` }}
                />
              </div>
            </div>
          {roomState.phase === "end" && (
            <p
              className={`font-medium ${
                (roomState.missionProgress ?? 0) >= 100 ? "text-green-600" : "text-red-600"
              }`}
              role="status"
            >
              {(roomState.missionProgress ?? 0) >= 100
                ? "Mission passed."
                : "Mission failed."}
            </p>
          )}
          {Object.keys(roomState.worldState ?? {}).length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                World state
              </summary>
              <pre className="mt-1 p-2 rounded bg-zinc-100 dark:bg-zinc-800 overflow-x-auto">
                {JSON.stringify(roomState.worldState, null, 2)}
              </pre>
            </details>
          )}
          <p>Players: {roomState.players.map((p) => p.name).join(", ")}</p>
          <p>
            Current turn: {roomState.players[roomState.currentTurn]?.name ?? "—"}
            {isMyTurn && " (you)"}
          </p>

          <div className="flex flex-col gap-1">
            <h2>Logs</h2>
            <div className="border rounded p-2 max-h-48 overflow-y-auto bg-zinc-50 dark:bg-zinc-900">
              {roomState.logs.length === 0 ? (
                <p className="text-zinc-500">No actions yet.</p>
              ) : (
                roomState.logs.map((log, i) => (
                  <div key={i} className="mb-2">
                    <p className="font-medium">{log.action}</p>
                    {log.narrative && (
                      <p className="text-zinc-600 dark:text-zinc-400 pl-2">
                        {log.narrative}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {roomState.phase === "playing" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAction()}
                placeholder={isMyTurn ? "Your action..." : "Waiting for turn..."}
                disabled={!isMyTurn}
                className="flex-1 border px-2 py-1 rounded"
              />
              <button
                type="button"
                onClick={handleAction}
                disabled={!isMyTurn || !actionInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                Send
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
