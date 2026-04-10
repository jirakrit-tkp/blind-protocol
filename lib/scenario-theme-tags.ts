/**
 * แท็กธีมมาจาก data/scenarios.json เท่านั้น — ไม่มีไฟล์ catalog แยก
 */
export function isValidScenarioThemeTags(themes: unknown): themes is string[] {
  if (!Array.isArray(themes) || themes.length === 0) return false;
  for (const tag of themes) {
    if (typeof tag !== "string" || tag.trim().length === 0) return false;
  }
  return true;
}
