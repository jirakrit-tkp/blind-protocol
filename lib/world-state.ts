import type { WorldState } from "./types";

/** playerId สำหรับ log ที่ระบบสร้างต่ออัตโนมัติหลังตัวละครหลักเล่นไม่ได้ */
export const SYSTEM_LOG_PLAYER_ID = "__system__";

/**
 * ระดับระบบ: ตัวละครหลักยัง “เล่นได้” (ผู้เล่นบังคับได้) หรือไม่ — ไม่ใช่กติกาเรื่อง (rule_*)
 * เมื่อเป็น `no` ผู้เล่นไม่ส่ง action ได้ และบันทึกจะต่อด้วยระบบอัตโนมัติ
 */
export const SYSTEM_PROTAGONIST_ALIVE = "system_protagonist_alive" as const;

export function defaultSystemWorldState(): WorldState {
  return { [SYSTEM_PROTAGONIST_ALIVE]: "yes" };
}

export function isSystemProtagonistPlayable(ws: WorldState): boolean {
  return ws[SYSTEM_PROTAGONIST_ALIVE] !== "no";
}

/** ตัวละครหลัก “ตาย” ในระบบ = เล่นไม่ได้ (ไม่รับ input) */
export function isSystemProtagonistDead(ws: WorldState): boolean {
  return ws[SYSTEM_PROTAGONIST_ALIVE] === "no";
}

/** ตัวอย่างคีย์ใน scenario ร้านทอง — ใช้อ้างอิงใน data/scenarios.json */
export const GOAL_CRISIS_RESOLVED_WITHOUT_LOOT_LOSS =
  "goal_crisis_resolved_without_loot_loss" as const;

/**
 * เมื่อ scenario ไม่ได้แยก goal_* ไว้ครบ — GM ตั้งเป็น yes เมื่อชนะตามเรื่อง (เช่น ชนะทาง rules ที่ไม่ได้ map เป็น goal)
 */
export const MISSION_SUCCESS = "mission_success" as const;

/** Set by `%SUCCESS%` / `%FAIL%` player commands — ends mission without LLM. */
export const SYSTEM_FORCED_OUTCOME = "system_forced_outcome" as const;

function isAffirmative(v: unknown): boolean {
  return v === "yes" || v === true;
}

/**
 * แพ้ตามกติกาเรื่อง — คีย์ `rule_*` ใด ๆ เป็น yes/true แปลว่าเหตุต้องห้ามของสถานการณ์เกิดแล้ว (ลำดับสำคัญกว่า goal)
 * ดู docs/scenario-design.md
 */
export function isRuleFailed(ws: WorldState): boolean {
  for (const [k, v] of Object.entries(ws)) {
    if (k.startsWith("rule_") && isAffirmative(v)) return true;
  }
  return false;
}

function hasGoalSucceeded(ws: WorldState): boolean {
  for (const [k, v] of Object.entries(ws)) {
    if (k.startsWith("goal_") && isAffirmative(v)) return true;
  }
  if (isAffirmative(ws[MISSION_SUCCESS])) return true;
  return false;
}

/**
 * ชนะภารกิจ — ไม่แพ้ rule และ (มี goal_* หรือ mission_success สำเร็จ)
 * เช็ค isMissionWon ก่อนถือว่าแพ้จากความตาย / หมดรอบ ฯลฯ (docs/scenario-design.md)
 */
export function isMissionWon(ws: WorldState): boolean {
  const forced = ws[SYSTEM_FORCED_OUTCOME];
  if (forced === "success") return true;
  if (forced === "fail") return false;
  if (isRuleFailed(ws)) return false;
  return hasGoalSucceeded(ws);
}

/** Single-line summary when the mission round ends (before imposter vote). */
export function getMissionOutcomeLine(ws: WorldState): string {
  const forced = ws[SYSTEM_FORCED_OUTCOME];
  if (forced === "success") {
    return "Mission success — goal reached without breaking the rules.";
  }
  if (forced === "fail") {
    return "Mission failed — goal not met or the story cannot continue.";
  }
  if (isMissionWon(ws)) {
    return "Mission success — goal reached without breaking the rules.";
  }
  if (isRuleFailed(ws)) {
    return "Mission failed — a forbidden outcome triggered (rule).";
  }
  return "Mission failed — goal not met or the story cannot continue.";
}

export function isForcedMissionFail(ws: WorldState): boolean {
  return ws[SYSTEM_FORCED_OUTCOME] === "fail";
}
