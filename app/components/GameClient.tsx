"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createSocket } from "@/lib/socket-client";

type RoomState = {
  id: string;
  players: { id: string; name: string; role?: "imposter" | "normal" }[];
  logs: { playerId: string; action: string; narrative?: string }[];
  currentTurn: number;
  phase: "lobby" | "playing" | "voting" | "end";
};

function GameClient() {
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("room_created", (id: string) => {
      setRoomId(id);
      setRoomState({
        id,
        players: [],
        logs: [],
        currentTurn: 0,
        phase: "lobby",
      });
    });

    socket.on("room_update", (state: RoomState) => {
      setRoomState(state);
    });

    socket.on("new_log", (logs: { playerId: string; action: string; narrative?: string }[]) => {
      setRoomState((prev) =>
        prev
          ? { ...prev, logs: [...prev.logs, ...logs] }
          : null
      );
    });

    socket.on("turn_change", () => {
      // Turn state comes from room_update
    });

    socket.on("phase_change", (phase: string) => {
      setRoomState((prev) => (prev ? { ...prev, phase: phase as RoomState["phase"] } : null));
    });

    socket.on("error", (payload: { message: string }) => {
      setError(payload.message);
    });

    socket.connect();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connect]);

  const handleCreateRoom = () => {
    setError("");
    socketRef.current?.emit("create_room");
  };

  const handleJoinRoom = () => {
    setError("");
    const idToUse = roomState?.id ?? roomId;
    if (!idToUse.trim() || !name.trim()) {
      setError("Room ID and name required");
      return;
    }
    socketRef.current?.emit("join_room", { roomId: idToUse.trim(), name: name.trim() });
  };

  const handleStartGame = () => {
    setError("");
    socketRef.current?.emit("start_game");
  };

  const handleAction = () => {
    setError("");
    if (!actionInput.trim() || !roomState) return;
    socketRef.current?.emit("action", {
      roomId: roomState.id,
      action: actionInput.trim(),
    });
    setActionInput("");
  };

  const isMyTurn =
    roomState &&
    roomState.phase === "playing" &&
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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCreateRoom}
            className="px-4 py-2 bg-blue-600 text-white rounded w-fit"
          >
            Create Room
          </button>
          <hr />
          <h2>Or join existing room</h2>
          <label>
            Room ID:
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
              className="ml-2 border px-2 py-1"
            />
          </label>
          <label>
            Your name:
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="ml-2 border px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={handleJoinRoom}
            className="px-4 py-2 bg-green-600 text-white rounded w-fit"
          >
            Join Room
          </button>
        </div>
      ) : roomState.phase === "lobby" ? (
        <div className="flex flex-col gap-2">
          <label>
            Room ID:
            <input
              type="text"
              value={roomState?.id ?? roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter or paste room ID"
              readOnly={!!roomState}
              className="ml-2 border px-2 py-1"
            />
          </label>
          <label>
            Your name:
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
              className="ml-2 border px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={handleJoinRoom}
            className="px-4 py-2 bg-green-600 text-white rounded w-fit"
          >
            Join Room
          </button>
          <p>Players: {roomState.players.map((p) => p.name).join(", ") || "(none)"}</p>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={roomState.players.length < 2}
            className="px-4 py-2 bg-purple-600 text-white rounded w-fit disabled:opacity-50"
          >
            Start Game
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p>Phase: {roomState.phase}</p>
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
