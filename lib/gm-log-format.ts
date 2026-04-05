import type { RoomLog } from "./types";

/**
 * แปลง logs ทั้งหมดเป็นบรรทัดเดียวต่อเหตุการณ์ (เรียงจากเก่า → ใหม่) สำหรับ prompt GM
 * ไม่ตัดความยาว — ส่งข้อความเต็มเพื่อความต่อเนื่อง
 */
export function formatLogsForGmPrompt(logs: RoomLog[]): string[] {
  return logs.map((l) => {
    const suggestedAction = l.action.includes(": ")
      ? l.action.split(": ").slice(1).join(": ").trim()
      : l.action;
    return `${suggestedAction}${l.narrative ? ` → ${l.narrative}` : ""}`;
  });
}
