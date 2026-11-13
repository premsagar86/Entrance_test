import { z } from "zod";

export const EVENT_TYPES = ["TAB_HIDDEN", "TAB_VISIBLE", "WINDOW_BLUR", "FULLSCREEN_EXIT"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const eventSchema = z.strictObject({ type: z.enum(EVENT_TYPES) });

/** Max events stored per attempt, so a misbehaving client cannot fill the table. */
export const MAX_EVENTS_PER_ATTEMPT = 200;

export interface EventSummary {
  tabSwitches: number;
  blurs: number;
  total: number;
}

export function summarizeEvents(types: string[]): EventSummary {
  return {
    tabSwitches: types.filter((t) => t === "TAB_HIDDEN").length,
    blurs: types.filter((t) => t === "WINDOW_BLUR").length,
    total: types.length,
  };
}
