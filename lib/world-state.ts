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

/** เป้าหมาย “เรียกตำรวจ” ใน scenario ร้านทอง */
export const GOAL_POLICE_SUMMONED = "goal_police_summoned" as const;

/**
 * ชนะภารกิจ — รวมกรณีตำรวจมาถึงแม้ system_protagonist_alive เป็น no
 */
export function isMissionWon(ws: WorldState, missionProgress: number): boolean {
  if (missionProgress >= 100) return true;
  if (ws[GOAL_POLICE_SUMMONED] === "yes") return true;
  return false;
}
