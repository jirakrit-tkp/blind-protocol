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
};
