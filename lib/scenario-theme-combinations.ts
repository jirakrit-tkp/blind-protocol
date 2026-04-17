import raw from "../data/scenarios.json";
import { isValidScenarioThemeTags } from "./scenario-theme-tags";

type ScenarioThemeRow = {
  themes: string[];
};

function normalize(themes: readonly string[]): string[] {
  return Array.from(
    new Set(
      themes
        .map((theme) => theme.trim())
        .filter((theme) => theme.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "th"));
}

function loadRows(): ScenarioThemeRow[] {
  const rawRows = (raw as { scenarios?: unknown[] }).scenarios ?? [];
  const rows: ScenarioThemeRow[] = [];
  for (const entry of rawRows) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { themes?: unknown };
    if (!isValidScenarioThemeTags(candidate.themes)) continue;
    rows.push({ themes: normalize(candidate.themes) });
  }
  return rows;
}

const SCENARIO_THEME_ROWS = loadRows();

export function hasScenarioThemeCombination(selectedThemes: readonly string[]): boolean {
  const selected = normalize(selectedThemes);
  if (selected.length === 0) return false;
  return SCENARIO_THEME_ROWS.some((row) =>
    selected.every((theme) => row.themes.includes(theme))
  );
}

export function getThemeOptionsForSelection(
  selectedThemes: readonly string[]
): string[] {
  const selected = normalize(selectedThemes);
  if (selected.length === 0) {
    const all = new Set<string>();
    for (const row of SCENARIO_THEME_ROWS) {
      for (const theme of row.themes) all.add(theme);
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b, "th"));
  }

  const out = new Set<string>();
  for (const row of SCENARIO_THEME_ROWS) {
    const hasAll = selected.every((theme) => row.themes.includes(theme));
    if (!hasAll) continue;
    for (const theme of row.themes) out.add(theme);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b, "th"));
}
