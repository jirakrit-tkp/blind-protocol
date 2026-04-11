import { completeLlmPrompt } from "./llm-client";
import type { HostLlmRoomConfig, WorldState } from "./types";
import {
  MISSION_SUCCESS,
  SYSTEM_PROTAGONIST_ALIVE,
  defaultSystemWorldState,
} from "./world-state";

export async function askAI(
  prompt: string,
  hostLlm?: HostLlmRoomConfig | null
): Promise<string> {
  return completeLlmPrompt(prompt, hostLlm ?? null);
}

/** Generate situation + initial world state from theme + optional brief */
export async function generateGameSetup(
  theme: string,
  brief?: string,
  hostLlm?: HostLlmRoomConfig | null
): Promise<{ situation: string; worldState: WorldState }> {
  const briefPart = brief?.trim()
    ? `\nPlayers also provided this brief (use it to shape the situation): "${brief}"`
    : "";
  const prompt = `You are a game setup generator for Blind Protocol.

GAME CONTEXT: Blind Protocol is a multiplayer narrative game. All players control ONE shared protagonist ("เรา"). Players take turns suggesting what the protagonist does. One player is secretly the imposter—they may suggest harmful actions. Normal players want goals (goal_*) to succeed without triggering forbidden outcomes (rule_*). You generate the starting situation and world state. Later, a different AI will narrate each action neutrally (including harmful ones).

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

  const raw = await askAI(prompt, hostLlm);
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

function formatWorldState(ws: WorldState): string {
  return Object.entries(ws)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
}

/** Layer A — เล่าเรื่องเท่านั้น (ไม่มี state block) */
export function buildNarratorPrompt(
  situation: string,
  recentActions: string[],
  playerAction: string,
  worldState: WorldState
): string {
  return `You are the NARRATOR for Blind Protocol. Your ONLY job is to write story prose in Thai.

GAME CONTEXT: All players share one protagonist ("เรา"). One player is secretly the imposter. You must not reveal who. You do NOT output game state, JSON, or [STATE_UPDATES]. You do NOT say the crew won or lost.

Narration rules:
- Write ONLY in Thai script for the story. No Chinese, Japanese, Korean, or English sentences. No mixed-language explanations.
- NEVER add meta-text: do not mention character limits, prompts, instructions, "rewrite", "revise", "note that", or explain what you are doing. Never output a second draft or corrected version of the same scene.
- One single continuous story paragraph only—no labels, no bullet points, no quoted system messages.
- Use "เรา" (we) for the shared protagonist.
- **Action = deed (critical):** What the crew types is what **เรา actually do** in this beat—not a vague “attempt” or hypothetical unless their words themselves are tentative. Narrate the move **as executed**; do NOT erase or replace the crew’s chosen action (“undo”) to save the mission. **Resistance, interference, costs, and consequences** are handled by the opposition rule below—not by pretending we never really did the action. Harmful choices **play out for real.**
- **OPPOSITION & CONSEQUENCES (critical):** Read **situation** and **world state** for tension, opposition, stakes, and who controls space, attention, or tools (people, institutions, machines, nature, traps, time pressure, surveillance, crowds, etc.). **Do NOT default to blocking 100% every time**—that is as unrealistic as total passivity. **Vary outcomes:** sometimes opposition **fully stops** us when the scene makes that credible; sometimes we **push through** with **clear cost or fallout** (noise, injury, exposure, alarm, lost trust, wasted time, broken gear, legal/social heat); sometimes a **messy partial**—progress plus a new problem. If prior beats or state suggest **gaps, fatigue, distraction, distance, or weakened control**, or the action is **bold but still plausible**, **success with consequences** is allowed. Calibrate **how hard** we are stopped to **how guarded, how exposed, and how risky** this specific moment is—**not** “total block every beat” and **not** “no pushback ever.”
- **REQUIRED SHAPE (critical):** **One** flowing paragraph that **advances the story**—not a fresh summary of the whole world at this timestamp. Structure: **(1)** what **เรา** do **now** (from the typed action); **(2)** the **immediate result** of that deed; **(3)** **what shifts because of it** (others react, environment changes, a new pressure appears)—so the beat reads **action → consequence → what happens next**, even briefly. Include **at least one concrete observable beat** from the world or others (movement, voice, light, machine, crowd, weather) **tied to what we just did**—not vague mood alone. Opposition, when present, reacts **proportionately** (see rule above)—not automatic total shutdown every time, and not invisible.
- **NO RETREAD (critical):** Do **NOT** copy, closely paraphrase, or re-narrate long stretches of “Recent story so far.” Readers already read those lines. Add **only new** story for **this** beat; at most **one short bridging phrase** for continuity, then **move forward**.
- WORLD + US: This is still **one player action → one log**; do not add a separate "world turn". Pack the arc into the **same** narrative block.
- LOG LENGTH: One paragraph—aim for **2–4 short sentences**, roughly **about 220–420 Thai characters**. **No** full recap of earlier events; **no** repeating prior log sentences. Only **this** beat and its **forward** motion. Keep the world beat; do not pad. Never comment on length in the text.
- Never say success/failure explicitly.
- Do NOT include brackets like [STATE_UPDATES] or any machine-readable block—story text only.

Current world state (for continuity—reflect it in the story):
${formatWorldState(worldState) || "(none)"}

Situation:
${situation}

Recent story so far:
${recentActions.length > 0 ? recentActions.join("\n") : "(none yet)"}

Action the protagonist takes now:
${playerAction}`;
}

/** Layer A — aftermath: ไม่มี action จากผู้เล่น */
export function buildAftermathNarratorPrompt(
  situation: string,
  recentEvents: string[],
  worldState: WorldState
): string {
  return `You are the NARRATOR for Blind Protocol. Your ONLY job is to write story prose in Thai.

The shared protagonist can NO LONGER be controlled by players (system_protagonist_alive is no). There is NO new player suggestion—the world continues (other people, institutions, hazards, machines, environment).

You do NOT output [STATE_UPDATES] or any machine-readable block. Do NOT say the crew won or lost. Write ONLY narrative in Thai script; use "เรา" where the story is still from our perspective, but do not write voluntary actions unless reflex or others act on us.
- ONLY Thai for the story—no Chinese, Japanese, Korean, or English. No meta-commentary, no second draft, no explaining instructions or length limits.
- **NO RETREAD:** Do not repeat or re-summarize “Recent story” at length—only **new** continuation; one short bridge phrase at most, then **forward**.
- REQUIRED SHAPE (critical): **One paragraph** that **advances** the aftermath: what happens **to us** or around us **next**, plus **at least one clear beat** where others or the environment **move or change** in observable ways. Prefer **event → consequence → what shifts** rather than restating the whole situation. When the scene calls for it, show **proportionate** world reaction—not the same beat restated every step, and not total stasis.
- LOG LENGTH: Aim for **2–4 short sentences**, about **220–420 Thai characters**. No long recap of earlier logs. Do not comment on length.

Current world state:
${formatWorldState(worldState) || "(none)"}

Situation:
${situation}

Recent story:
${recentEvents.length > 0 ? recentEvents.join("\n") : "(none yet)"}

Continue the scene in Thai (prose only).`;
}

/** Layer B — อัปเดตเฉพาะฉาก (ห้าม rule_/goal_/system_/mission_success) */
export function buildSceneDeltaPrompt(
  situation: string,
  worldState: WorldState,
  narrativeThai: string,
  playerAction: string
): string {
  return `You are the SCENE STATE UPDATER for Blind Protocol. You do NOT write story prose.

Your ONLY output must be a [STATE_UPDATES] block (English keys, values as strings/numbers/booleans). No other text before or after the block.

Allowed keys:
- ONLY physical / discoverable scene state: keys that already appear below OR new snake_case keys for things the protagonist could perceive (use whatever prefixes fit the scenario—location_*, actor_*, antagonist_*, device_*, env_*, etc.).
- FORBIDDEN: any key starting with rule_, goal_, or system_, and the key "${MISSION_SUCCESS}" — do not output these.

Rules:
- Update values when the narrative implies a physical change. Add new keys only for new observable facts.
- Reflect **other actors and the environment** moving or changing (not only the protagonist), when the narrative describes them.
- In-progress beats (e.g. comms ringing, tool half-used, door straining) belong here as **scene** keys—do not use goal_*; Layer C sets goals only when fully won.
- NO counts, NO abstract event flags—only concrete environment/perception state.
- The narrative below is the source of truth for what changed.

Player action (context):
${playerAction}

Narrative (Thai, what just happened):
${narrativeThai}

Situation summary:
${situation}

Current world state:
${formatWorldState(worldState) || "(none)"}

Respond with ONLY:
[STATE_UPDATES]
key=value
[/STATE_UPDATES]`;
}

export function buildAftermathSceneDeltaPrompt(
  situation: string,
  worldState: WorldState,
  narrativeThai: string
): string {
  return `You are the SCENE STATE UPDATER for Blind Protocol. You do NOT write story prose.

Your ONLY output must be a [STATE_UPDATES] block. No other text.

Allowed keys: physical / observable scene state only (existing keys or new keys matching the scenario’s place, actors, devices, environment). FORBIDDEN: rule_, goal_, system_ prefixes and "${MISSION_SUCCESS}".
- Update state for **others and the environment** when the narrative shows them moving or changing.

There was NO player action this step—only automatic world continuation.

Narrative (Thai):
${narrativeThai}

Situation:
${situation}

Current world state:
${formatWorldState(worldState) || "(none)"}

[STATE_UPDATES]
key=value
[/STATE_UPDATES]`;
}

/** Layer C — rule, goal, protagonist alive, mission_success, MISSION_IMPOSSIBLE */
export function buildOutcomePrompt(
  situation: string,
  worldState: WorldState,
  narrativeThai: string,
  playerAction: string
): string {
  return `You are the OUTCOME ADJUDICATOR for Blind Protocol. You do NOT write story prose.

Output ONLY a [STATE_UPDATES] block plus optionally the tag [MISSION_IMPOSSIBLE] on its own line after the block if the mission can no longer succeed.

Allowed keys in [STATE_UPDATES] ONLY:
- rule_* / goal_* : **Only use keys that already appear in “Current world state” below.** Do **not** invent new rule_* or goal_* names (e.g. no rule_summoning_authorities_failed)—those belong in the narrative log, not as new state keys. If a setback happens but no existing rule_* applies, **omit** rule_* updates; Layer B can reflect facts with scene keys.
- rule_* : set to yes ONLY if a forbidden outcome for this scenario has clearly occurred (crew loses), using an **existing** rule_* key.
- goal_* : set to yes ONLY when that win condition is **fully and unambiguously complete** for this scenario—not on intent, first step, or “probably OK”—and only on an **existing** goal_* key.
  - **Conservative:** If the story shows only an **attempt** toward a goal (started a call, opened a channel, sent a message, began a ritual, triggered a signal) but does **not** clearly establish that the **stated win condition is actually fulfilled** (authority committed, escape complete, cure applied, seal done, backup truly en route per the scenario), **do not** set any goal_* to yes—**omit** goal_* lines so keys stay at previous values (usually no).
  - Apply the same bar to **every** goal_* key: yes only when the narrative **unambiguously** matches what that key means in **this** situation—not a single hopeful line without confirmation.
- ${MISSION_SUCCESS}=yes ONLY if success is clear but no goal_* key fits—same bar: **confirmed** outcome, not mid-action.
- ${SYSTEM_PROTAGONIST_ALIVE}=no ONLY if the shared protagonist can no longer be controlled (death, unconscious, etc.).

If nothing changed for these keys, output an empty [STATE_UPDATES] block still:
[STATE_UPDATES]
[/STATE_UPDATES]

If rule violation and goal both seem true, still set rule_*=yes (loss takes precedence).

Player action:
${playerAction}

Narrative (Thai):
${narrativeThai}

Situation:
${situation}

Current world state (after scene updates):
${formatWorldState(worldState) || "(none)"}`;
}

export function buildAftermathOutcomePrompt(
  situation: string,
  worldState: WorldState,
  narrativeThai: string
): string {
  return `You are the OUTCOME ADJUDICATOR for Blind Protocol. No story prose.

Output [STATE_UPDATES] with ONLY rule_*, goal_*, ${MISSION_SUCCESS}, ${SYSTEM_PROTAGONIST_ALIVE}. Optionally add [MISSION_IMPOSSIBLE] after the block.

**Never invent new rule_* or goal_* key names**—only update keys already listed in Current world state. goal_*=yes only when fully achieved; if unsure, omit goal_* updates.

No player action this step—aftermath only.

Narrative (Thai):
${narrativeThai}

Situation:
${situation}

Current world state:
${formatWorldState(worldState) || "(none)"}`;
}

const PROGRESS_LEGACY_REGEX = /\[PROGRESS:[+-]?\d+\]/gi;
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

export function parseStateUpdatesBlock(raw: string): WorldState {
  const stateUpdates: WorldState = {};
  const stateMatch = raw.trim().match(STATE_UPDATES_REGEX);
  if (!stateMatch) return stateUpdates;
  const block = stateMatch[1].trim();
  for (const line of block.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq).trim().replace(/\s+/g, "_");
      const value = parseValue(line.slice(eq + 1));
      if (key) stateUpdates[key] = value;
    }
  }
  return stateUpdates;
}

function isReservedForSceneOnly(key: string): boolean {
  return (
    key.startsWith("rule_") ||
    key.startsWith("goal_") ||
    key.startsWith("system_") ||
    key === MISSION_SUCCESS
  );
}

/** กรองเฉพาะคีย์ฉาก — ทิ้งคีย์ที่ห้ามในชั้น B */
export function filterSceneStateUpdates(updates: WorldState): WorldState {
  const out: WorldState = {};
  for (const [k, v] of Object.entries(updates)) {
    if (!isReservedForSceneOnly(k)) out[k] = v;
  }
  return out;
}

/**
 * กรองผลชั้น C — ยอมรับ rule_* / goal_* เฉพาะคีย์ที่มีอยู่แล้วใน knownWorldState (จาก scenario)
 * ป้องกันโมเดลสร้าง rule_* ใหม่ที่เป็นแค่ “log ของเหตุการณ์” แทนกติกาเรื่อง
 */
export function filterOutcomeStateUpdates(
  updates: WorldState,
  knownWorldState: WorldState
): WorldState {
  const out: WorldState = {};
  for (const [k, v] of Object.entries(updates)) {
    if (k.startsWith("rule_") || k.startsWith("goal_")) {
      if (Object.prototype.hasOwnProperty.call(knownWorldState, k)) {
        out[k] = v;
      }
      continue;
    }
    if (k === MISSION_SUCCESS || k === SYSTEM_PROTAGONIST_ALIVE) {
      out[k] = v;
    }
  }
  return out;
}

export function parseNarratorOutput(raw: string): string {
  let t = raw.trim();
  const idx = t.indexOf("[STATE_UPDATES]");
  if (idx !== -1) t = t.slice(0, idx).trim();
  t = t.replace(PROGRESS_LEGACY_REGEX, "").trim();
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

/** อักขระที่ไม่ใช่ไทย — ถ้ามีให้รัน pass แปลเป็นภาษาไทย (Layer A ขั้นที่สอง) */
const FOREIGN_SCRIPT_NORMALIZE_REGEX =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u0400-\u04FF\u0600-\u06FF]/;
const THAI_SCRIPT_REGEX = /[\u0e00-\u0e7f]/;

function narrativeNeedsThaiOnlyPass(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (FOREIGN_SCRIPT_NORMALIZE_REGEX.test(t)) return true;
  if (!THAI_SCRIPT_REGEX.test(t)) return true;
  return false;
}

/**
 * Layer A: ถ้าตรวจพบภาษาอื่น (หรือไม่มีอักษรไทยเลย) เรียก AI อีกครั้งให้รวมเป็นภาษาไทยล้วนหนึ่งย่อหน้า
 */
export async function ensureNarrativeThaiOnly(
  narrative: string,
  hostLlm?: HostLlmRoomConfig | null
): Promise<string> {
  const t = narrative.trim();
  if (!narrativeNeedsThaiOnlyPass(t)) return t;
  try {
    const prompt = `The text below may contain Chinese, English, Korean, or other languages alone or mixed with Thai. Rewrite as ONE continuous paragraph in Thai ONLY (Thai script). Preserve who does what, dialogue meaning, and tension; translate any non-Thai into natural Thai. No other scripts, no meta-commentary, no notes:

${t}`;
    return parseNarratorOutput(await askAI(prompt, hostLlm));
  } catch {
    return t;
  }
}

export function parseOutcomeMissionPossible(raw: string): boolean {
  return !MISSION_IMPOSSIBLE_REGEX.test(raw);
}

export type ThreeLayerGmResult = {
  narrative: string;
  missionPossible: boolean;
  sceneUpdates: WorldState;
  outcomeUpdates: WorldState;
};

/** 3 ชั้น: Narrator → Scene → Outcome (เทิร์นผู้เล่น) */
export async function runThreeLayerPlayerTurn(params: {
  situation: string;
  recentActions: string[];
  playerAction: string;
  worldState: WorldState;
  hostLlm?: HostLlmRoomConfig | null;
}): Promise<ThreeLayerGmResult> {
  const { situation, recentActions, playerAction, worldState, hostLlm } =
    params;

  let narrativeRaw: string;
  try {
    narrativeRaw = await askAI(
      buildNarratorPrompt(situation, recentActions, playerAction, worldState),
      hostLlm
    );
  } catch {
    narrativeRaw = `[ห้องสั่น — ระบบเล่าเรื่องไม่พร้อม]`;
  }
  let narrative = parseNarratorOutput(narrativeRaw);
  narrative = await ensureNarrativeThaiOnly(narrative, hostLlm);

  let sceneRaw = "";
  try {
    sceneRaw = await askAI(
      buildSceneDeltaPrompt(situation, worldState, narrative, playerAction),
      hostLlm
    );
  } catch {
    sceneRaw = "";
  }
  const sceneUpdates = filterSceneStateUpdates(parseStateUpdatesBlock(sceneRaw));

  const worldAfterScene: WorldState = { ...worldState, ...sceneUpdates };

  let outcomeRaw = "";
  try {
    outcomeRaw = await askAI(
      buildOutcomePrompt(situation, worldAfterScene, narrative, playerAction),
      hostLlm
    );
  } catch {
    outcomeRaw = "";
  }
  const missionPossible = parseOutcomeMissionPossible(outcomeRaw);
  const outcomeUpdates = filterOutcomeStateUpdates(
    parseStateUpdatesBlock(outcomeRaw),
    worldAfterScene
  );

  return { narrative, missionPossible, sceneUpdates, outcomeUpdates };
}

/** 3 ชั้น: หนึ่งสเต็ป aftermath */
export async function runThreeLayerAftermathStep(params: {
  situation: string;
  recentEvents: string[];
  worldState: WorldState;
  hostLlm?: HostLlmRoomConfig | null;
}): Promise<ThreeLayerGmResult> {
  const { situation, recentEvents, worldState, hostLlm } = params;

  let narrativeRaw: string;
  try {
    narrativeRaw = await askAI(
      buildAftermathNarratorPrompt(situation, recentEvents, worldState),
      hostLlm
    );
  } catch {
    narrativeRaw = `[เหตุการณ์ดำเนินต่อ — ระบบ AI ไม่พร้อม]`;
  }
  let narrative = parseNarratorOutput(narrativeRaw);
  narrative = await ensureNarrativeThaiOnly(narrative, hostLlm);

  let sceneRaw = "";
  try {
    sceneRaw = await askAI(
      buildAftermathSceneDeltaPrompt(situation, worldState, narrative),
      hostLlm
    );
  } catch {
    sceneRaw = "";
  }
  const sceneUpdates = filterSceneStateUpdates(parseStateUpdatesBlock(sceneRaw));

  const worldAfterScene: WorldState = { ...worldState, ...sceneUpdates };

  let outcomeRaw = "";
  try {
    outcomeRaw = await askAI(
      buildAftermathOutcomePrompt(situation, worldAfterScene, narrative),
      hostLlm
    );
  } catch {
    outcomeRaw = "";
  }
  const missionPossible = parseOutcomeMissionPossible(outcomeRaw);
  const outcomeUpdates = filterOutcomeStateUpdates(
    parseStateUpdatesBlock(outcomeRaw),
    worldAfterScene
  );

  return { narrative, missionPossible, sceneUpdates, outcomeUpdates };
}

/**
 * @deprecated ใช้ runThreeLayerPlayerTurn / runThreeLayerAftermathStep แทน
 */
export function parseActionResponse(raw: string): {
  narrative: string;
  stateUpdates: WorldState;
  missionPossible: boolean;
} {
  const missionPossible = parseOutcomeMissionPossible(raw);
  let text = raw.trim().replace(MISSION_IMPOSSIBLE_REGEX, "").trim();
  const stateUpdates = parseStateUpdatesBlock(text);
  text = text.replace(STATE_UPDATES_REGEX, "").trim();
  text = text.replace(PROGRESS_LEGACY_REGEX, "").trim();
  return { narrative: text, stateUpdates, missionPossible };
}
