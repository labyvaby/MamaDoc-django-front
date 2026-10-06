import type { Tone } from "../construction/format";

export { compactSum, isoDate, parseNumber } from "../construction/format";

export const handoverTone = (status: string): Tone => (status === "scheduled" ? "primary" : status === "inspected" ? "info" : status === "defects" ? "warning" : status === "done" ? "success" : null);
export const requestTone = (status: string): Tone => (status === "new" ? "warning" : status === "in_progress" ? "primary" : status === "done" ? "success" : status === "closed" ? null : null);
export const noticeTone = (status: string): Tone => (status === "sent" ? "success" : status === "scheduled" ? "info" : status === "cancelled" ? null : null);
