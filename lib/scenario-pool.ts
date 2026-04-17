import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { WorldState } from "./types";
import { isValidScenarioThemeTags } from "./scenario-theme-tags";
import { SYSTEM_PROTAGONIST_ALIVE, defaultSystemWorldState } from "./world-state";

const libDir = dirname(fileURLToPath(import.meta.url));

type ScenarioFileEntry = {
  /** แท็กธีมจาก scenario (สตริงไทยหรืออื่น ๆ) อย่างน้อย 1 รายการ */
  themes: string[];
  situation: string;
  worldState: WorldState;
};

type ScenarioFile = {
  scenarios: ScenarioFileEntry[];
};

let cached: ScenarioFileEntry[] | null = null;

function scenarioPoolPath(): string {
  return join(libDir, "..", "data", "scenarios.json");
}

function isValidScenarioEntry(s: unknown): s is ScenarioFileEntry {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (typeof o.situation !== "string" || o.situation.trim().length === 0) return false;
  if (!o.worldState || typeof o.worldState !== "object") return false;
  if (!isValidScenarioThemeTags(o.themes)) {
    console.warn(
      "[scenario-pool] skip: themes must be a non-empty array of non-empty strings"
    );
    return false;
  }
  return true;
}

function loadPool(): ScenarioFileEntry[] {
  if (cached) return cached;
  try {
    const raw = readFileSync(scenarioPoolPath(), "utf-8");
    const parsed = JSON.parse(raw) as ScenarioFile;
    const list = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
    cached = list.filter(isValidScenarioEntry);
  } catch {
    cached = [];
  }
  return cached;
}

function normalizeWorldState(ws: WorldState): WorldState {
  const out: WorldState = { ...defaultSystemWorldState() };
  for (const [k, v] of Object.entries(ws)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  if (!(SYSTEM_PROTAGONIST_ALIVE in out)) out[SYSTEM_PROTAGONIST_ALIVE] = "yes";
  return out;
}

function matchesTheme(entry: ScenarioFileEntry, theme: string): boolean {
  const t = theme.trim();
  return entry.themes.some((tag) => tag === t);
}

function normalizeThemeSelection(themes: readonly string[]): string[] {
  return Array.from(
    new Set(
      themes
        .map((theme) => theme.trim())
        .filter((theme) => theme.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "th"));
}

/** แท็กธีมจาก pool ที่โหลดได้ (ไม่ซ้ำ เรียงตาม locale) — ใช้สำหรับ UI / ตรวจ server */
export function getThemeLabelsFromScenarioPool(): string[] {
  const pool = loadPool();
  const set = new Set<string>();
  for (const e of pool) {
    for (const t of e.themes) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
}

export function getThemeOptionsForSelectionFromScenarioPool(
  selectedThemes: readonly string[]
): string[] {
  const pool = loadPool();
  if (pool.length === 0) return [];
  const selected = normalizeThemeSelection(selectedThemes);
  if (selected.length === 0) return getThemeLabelsFromScenarioPool();

  const options = new Set<string>();
  for (const entry of pool) {
    const hasAllSelected = selected.every((theme) => matchesTheme(entry, theme));
    if (!hasAllSelected) continue;
    for (const theme of entry.themes) options.add(theme);
  }
  return Array.from(options).sort((a, b) => a.localeCompare(b, "th"));
}

export function hasScenarioCombinationInPool(
  selectedThemes: readonly string[]
): boolean {
  const pool = loadPool();
  if (pool.length === 0) return false;
  const selected = normalizeThemeSelection(selectedThemes);
  if (selected.length === 0) return false;
  return pool.some((entry) => selected.every((theme) => matchesTheme(entry, theme)));
}

/**
 * สุ่มสถานการณ์จากไฟล์ data/scenarios.json ที่มีแท็กธีมตรงกับ `theme` (ต้องตรงทุกตัวอักษร)
 * ไม่มีแมตช์หรือไม่มี pool → คืน null
 */
export function pickRandomScenarioFromPool(theme: string): {
  situation: string;
  worldState: WorldState;
} | null {
  const pool = loadPool();
  if (pool.length === 0) return null;

  const t = theme.trim();
  if (!t) return null;

  const matched = pool.filter((e) => matchesTheme(e, t));
  if (matched.length === 0) return null;

  const i = Math.floor(Math.random() * matched.length);
  const chosen = matched[i];
  return {
    situation: chosen.situation.trim(),
    worldState: normalizeWorldState(chosen.worldState),
  };
}

export function pickRandomScenarioFromPoolByThemes(
  selectedThemes: readonly string[]
): {
  situation: string;
  worldState: WorldState;
} | null {
  const pool = loadPool();
  if (pool.length === 0) return null;
  const selected = normalizeThemeSelection(selectedThemes);
  if (selected.length === 0) return null;

  const matched = pool.filter((entry) =>
    selected.every((theme) => matchesTheme(entry, theme))
  );
  if (matched.length === 0) return null;

  const i = Math.floor(Math.random() * matched.length);
  const chosen = matched[i];
  return {
    situation: chosen.situation.trim(),
    worldState: normalizeWorldState(chosen.worldState),
  };
}

/** สำหรับเทส / reload หลังแก้ไฟล์ */
export function clearScenarioPoolCache(): void {
  cached = null;
}
