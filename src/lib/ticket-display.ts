import type { TicketStatus } from "../db/schema";

/** Human-readable column / status names. Single source of truth for the UI. */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  todo: "To Do",
  doing: "Doing",
  wip: "WIP",
  done: "Done",
};
