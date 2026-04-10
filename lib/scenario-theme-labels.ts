import raw from "../data/scenarios.json";
import { isValidScenarioThemeTags } from "./scenario-theme-tags";

/** สอดคล้องกับการกรองใน lib/scenario-pool.ts (รายการที่โหลดไม่ได้จะไม่มีธีมในรายการนี้) */
function isValidScenarioRow(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (typeof o.situation !== "string" || o.situation.trim().length === 0) return false;
  if (!o.worldState || typeof o.worldState !== "object") return false;
  return isValidScenarioThemeTags(o.themes);
}

/**
 * แท็กธีมจาก data/scenarios.json ที่ผ่านการตรวจแบบเดียวกับ pool — ใช้ให้หน้า lobby เลือกได้เฉพาะธีมที่มี scenario
 */
export const SCENARIO_THEME_LABELS: string[] = (() => {
  const scenarios = (raw as { scenarios: unknown[] }).scenarios;
  const set = new Set<string>();
  for (const s of scenarios) {
    if (!isValidScenarioRow(s)) continue;
    const row = s as { themes: string[] };
    for (const t of row.themes) set.add(t.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
})();
