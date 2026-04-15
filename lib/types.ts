export type Player = {
  id: string;
  name: string;
  role?: "imposter" | "normal";
};

export type RoomLog = {
  playerId: string;
  action: string;
  narrative?: string;
};

/** World state - situation-specific key-value store (e.g. cockpit_lock_status, engine_condition) */
export type WorldState = Record<string, string | number | boolean>;

/** Host-only LLM overrides; stored in room snapshot, never sent in public client state. */
export type HostLlmRoomConfig = {
  useCustomLlm: boolean;
  provider: "ollama" | "openai";
  ollamaHost: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey?: string;
};

export type Room = {
  id: string;
  players: Player[];
  logs: RoomLog[];
  currentTurn: number;
  /** Current round (0–2). 3 rounds = 3 turns per player. */
  roundIndex: number;
  phase: "lobby" | "playing" | "voting" | "end";
  /** Environment/situation state for AI and game logic */
  worldState: WorldState;
  /** Narrative situation (generated from theme by LLM) */
  situation?: string;
  /** Selected scenario theme in lobby; broadcast to all players in real time */
  lobbyTheme: string;
  /** Lobby mode: with Imposter (default) or mission-only. */
  lobbyMode: "imposter" | "mission";
  /** Server-only in practice: excluded from `getPublicRoomState`. */
  hostLlm?: HostLlmRoomConfig;
  /** During `voting`: voter socket id → accused player id (one vote per voter). */
  votes: Record<string, string>;
  /** After a tied vote: counts and who tied; votes cleared for a new round. */
  voteTieInfo?: {
    tallies: { playerId: string; count: number }[];
    tiedPlayerIds: string[];
  };
  /** Set when voting resolves (single top vote vs imposter). */
  voteOutcome?: {
    accusedId: string;
    imposterId: string;
    crewWon: boolean;
    /** Mission succeeded before voting (from world state at resolution). */
    missionSucceeded?: boolean;
    tally: { playerId: string; count: number }[];
  };
};
