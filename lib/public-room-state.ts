import type { Room } from "./types";

export type PublicRoomState = {
  id: string;
  players: { id: string; name: string; role?: "imposter" | "normal" }[];
  logs: { playerId: string; action: string; narrative?: string }[];
  currentTurn: number;
  roundIndex: number;
  phase: "lobby" | "playing" | "voting" | "end";
  worldState: Record<string, string | number | boolean>;
  situation?: string;
  lobbyThemes: string[];
  lobbyUseAiScenario: boolean;
  lobbyMode: "imposter" | "mission";
  votes: Record<string, string>;
  voteOutcome?: Room["voteOutcome"];
  voteTieInfo?: Room["voteTieInfo"];
};

export function getPublicRoomState(
  room: Room,
  viewerPlayerId?: string
): PublicRoomState {
  return {
    id: room.id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role:
        room.phase === "lobby"
          ? undefined
          : room.phase === "end" && room.voteOutcome
            ? p.role
            : viewerPlayerId && p.id === viewerPlayerId
              ? p.role
              : undefined,
    })),
    logs: room.logs,
    currentTurn: room.currentTurn,
    roundIndex: room.roundIndex ?? 0,
    phase: room.phase,
    worldState: room.worldState,
    situation: room.situation,
    lobbyThemes: [...room.lobbyThemes],
    lobbyUseAiScenario: room.lobbyUseAiScenario,
    lobbyMode: room.lobbyMode,
    votes: { ...(room.votes ?? {}) },
    voteOutcome: room.voteOutcome,
    voteTieInfo: room.voteTieInfo
      ? {
          tallies: room.voteTieInfo.tallies.map((t) => ({ ...t })),
          tiedPlayerIds: [...room.voteTieInfo.tiedPlayerIds],
        }
      : undefined,
  };
}
