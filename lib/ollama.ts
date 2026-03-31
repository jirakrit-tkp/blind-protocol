export async function askAI(prompt: string): Promise<string> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen2.5:14b-instruct",
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? "";
}

import type { WorldState } from "./types";
import { SYSTEM_PROTAGONIST_ALIVE, defaultSystemWorldState } from "./world-state";

/** Generate situation + initial world state from theme + optional brief */
export async function generateGameSetup(
  theme: string,
  brief?: string
): Promise<{ situation: string; worldState: WorldState }> {
  const briefPart = brief?.trim()
    ? `\nPlayers also provided this brief (use it to shape the situation): "${brief}"`
    : "";
  const prompt = `You are a game setup generator for Blind Protocol.

GAME CONTEXT: Blind Protocol is a multiplayer narrative game. All players control ONE shared protagonist ("เรา"). Players take turns suggesting what the protagonist does. One player is secretly the imposter—they may suggest harmful actions. Normal players want the mission to succeed (100% progress). You generate the starting situation and world state. Later, a different AI will narrate each action neutrally (including harmful ones).

Theme (genre/category only): "${theme}"
${briefPart}

Generate a game setup. Write EVERYTHING in Thai.

1. situation: 2-3 sentences. Use "เรา" (we)—start with "เราคือ..." or "เราเป็น...". The MISSION must be CONCRETE and ACTIONABLE—a specific task we can do right away. NOT vague investigation.
   - Good: "ภารกิจคือเปิดประตูห้องควบคุม", "ภารกิจคือซ่อมเครื่องยนต์ให้ทำงาน", "ภารกิจคือนำกุญแจ 3 ดอกมาที่ประตูหลัก"
   - Bad: "ค้นหาเหตุผลการหายตัว", "สอบสวนเรื่องราวประหลาด", "สำรวจสถานีลึกลับ"—too vague, no clear action.
2. worldState: 4-8 key-value pairs. MUST include system_protagonist_alive: "yes". Use snake_case keys.

World state rules (critical):
- ALWAYS include system_protagonist_alive: "yes" (required) — system: players can still control the shared protagonist
- Store environment conditions: locked/unlocked, damaged/intact, on/off, level (0-100)
- NO counts, NO event flags, NO mental/social state

Respond with ONLY valid JSON. situation must be in Thai:
{"situation":"เราคือ...","worldState":{"key":"value","key2":123}}`;

  const raw = await askAI(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      situation: `เราเป็นตัวละครหลัก ภารกิจของเราคือเรื่องที่เกี่ยวกับ: ${theme}`,
      worldState: { ...defaultSystemWorldState(), theme, ready: false },
    };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      situation?: string;
      worldState?: Record<string, unknown>;
    };
    const situation =
      typeof parsed.situation === "string"
        ? parsed.situation
        : `เราเป็นตัวละครหลัก ภารกิจของเราคือเรื่องที่เกี่ยวกับ: ${theme}`;
    const worldState: WorldState = { ...defaultSystemWorldState() };
    if (parsed.worldState && typeof parsed.worldState === "object") {
      for (const [k, v] of Object.entries(parsed.worldState)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          worldState[k] = v;
        } else {
          worldState[k] = String(v);
        }
      }
    }
    if (!(SYSTEM_PROTAGONIST_ALIVE in worldState)) worldState[SYSTEM_PROTAGONIST_ALIVE] = "yes";
    return { situation, worldState };
  } catch {
    return {
      situation: `เราเป็นตัวละครหลัก ภารกิจของเราคือเรื่องที่เกี่ยวกับ: ${theme}`,
      worldState: { ...defaultSystemWorldState(), theme, ready: false },
    };
  }
}

export function buildGameMasterPrompt(
  situation: string,
  recentActions: string[],
  playerAction: string,
  worldState: WorldState,
  missionProgress: number
): string {
  const worldStateStr = Object.entries(worldState)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `You are the game master for Blind Protocol. Respond ONLY in Thai.

GAME CONTEXT: Blind Protocol—players control one shared protagonist ("เรา"). They take turns suggesting actions. One is secretly the imposter and may suggest harmful actions. Your job: narrate what happens neutrally. Do NOT favor the mission; harmful actions happen as suggested. Mission progress 100% = success (tracked separately).

Rules:
- "เรา" (we) is the shared protagonist. All actions are performed by us. The story is continuous.
- Never say success or failure explicitly. Never reveal who is the imposter.
- Write narrative in Thai from our perspective (use เรา, เราทำ, เราพบ)
- CRITICAL: Each suggestion is what we ACTUALLY DO. Do NOT protect the mission. Do NOT have us "realize it was wrong" and undo it. If someone suggests throwing equipment away, we throw it away—describe that. Harmful actions have real consequences. Be neutral; do not bias toward saving the mission.
- Use and respect the world state. Imply state changes in narrative (e.g. "สลักหลุดในที่สุด").
- End your response with:
  1. A line: [PROGRESS:X] where X is -20 to +20. Use 0 if neutral.
  2. [STATE_UPDATES] block: key=value (one per line), then [/STATE_UPDATES].

State update rules (critical): Store ONLY environment state that EXISTS. NO counts, NO event flags.
- When the shared protagonist DIES (no longer controllable by players), set system_protagonist_alive=no in STATE_UPDATES.
- When mission becomes IMPOSSIBLE (critical equipment destroyed, no path to success), add [MISSION_IMPOSSIBLE] anywhere at the end of your response.
- Update keys when physical state changes. ADD new keys when protagonist discovers something. Use: strings, numbers, booleans.

Current world state:
${worldStateStr || "(none)"}

Mission progress: ${missionProgress}% (100% = mission passed)

Situation:
${situation}

Recent events (protagonist's story so far):
${recentActions.length > 0 ? recentActions.join("\n") : "(none yet)"}

Next action the protagonist takes (suggested by crew):
${playerAction}`;
}

/** หลัง system_protagonist_alive = no — ไม่มี input จากผู้เล่น; โลกดำเนินต่อ (ตำรวจ โจร ฯลฯ) */
export function buildAftermathPrompt(
  situation: string,
  recentEvents: string[],
  worldState: WorldState,
  missionProgress: number
): string {
  const worldStateStr = Object.entries(worldState)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `You are the game master for Blind Protocol. Respond ONLY in Thai.

The shared protagonist can NO LONGER be controlled by players (system_protagonist_alive is no). There is NO player suggestion this turn—the world continues on its own (police, robbers, environment, bystanders, etc.).

Rules:
- Do NOT write as if "เรา" is still taking voluntary actions unless it is unconscious reflex or others' actions on us.
- Narrate what happens next neutrally in Thai.
- End with [PROGRESS:X] and [STATE_UPDATES]...[/STATE_UPDATES] like the normal game master.
- When mission becomes IMPOSSIBLE, add [MISSION_IMPOSSIBLE].

Current world state:
${worldStateStr || "(none)"}

Mission progress: ${missionProgress}%

Situation:
${situation}

Recent events:
${recentEvents.length > 0 ? recentEvents.join("\n") : "(none yet)"}

Continue the scene with NO player input—automatic continuation.`;
}

const PROGRESS_REGEX = /\[PROGRESS:([+-]?\d+)\]\s*$/im;
const STATE_UPDATES_REGEX = /\[STATE_UPDATES\]\s*([\s\S]*?)\s*\[\/STATE_UPDATES\]/i;
const MISSION_IMPOSSIBLE_REGEX = /\[MISSION_IMPOSSIBLE\]/i;

function parseValue(v: string): string | number | boolean {
  const trimmed = v.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const n = Number(trimmed);
  if (!Number.isNaN(n) && trimmed !== "") return n;
  return trimmed;
}

export function parseActionResponse(raw: string): {
  narrative: string;
  progressDelta: number;
  stateUpdates: WorldState;
  missionPossible: boolean;
} {
  let text = raw.trim();
  const stateUpdates: WorldState = {};
  const missionPossible = !MISSION_IMPOSSIBLE_REGEX.test(text);
  text = text.replace(MISSION_IMPOSSIBLE_REGEX, "").trim();

  const stateMatch = text.match(STATE_UPDATES_REGEX);
  if (stateMatch) {
    text = text.replace(STATE_UPDATES_REGEX, "").trim();
    const block = stateMatch[1].trim();
    for (const line of block.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const key = line.slice(0, eq).trim().replace(/\s+/g, "_");
        const value = parseValue(line.slice(eq + 1));
        if (key) stateUpdates[key] = value;
      }
    }
  }

  const progressMatch = text.match(PROGRESS_REGEX);
  const progressDelta = progressMatch
    ? Math.max(-20, Math.min(20, parseInt(progressMatch[1], 10) || 0))
    : 0;
  const narrative = text.replace(PROGRESS_REGEX, "").trim();

  return { narrative, progressDelta, stateUpdates, missionPossible };
}
