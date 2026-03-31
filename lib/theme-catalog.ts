import themeCatalogJson from "../data/themes.json";

export type ThemeEntry = {
  id: string;
  label: string;
};

const catalog = themeCatalogJson as { themes: ThemeEntry[] };

export const THEME_CATALOG: ThemeEntry[] = catalog.themes;

export const THEME_LABELS: string[] = THEME_CATALOG.map((t) => t.label);

/** ค่าเริ่มต้นเมื่อผู้เล่นไม่เลือกธีม — ต้องตรงกับ label ใน data/themes.json */
export const DEFAULT_THEME_LABEL = THEME_CATALOG[0]?.label ?? "ผจญภัย";

const labelSet = new Set(THEME_LABELS);

export function isKnownThemeLabel(label: string): boolean {
  return labelSet.has(label.trim());
}
