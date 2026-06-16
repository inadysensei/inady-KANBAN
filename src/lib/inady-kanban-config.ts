import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  editors,
  repositories,
  tags,
  taskTemplates,
  teamTemplates,
  ticketTags,
} from "../db/schema";
import type {
  Editor,
  Repository,
  Tag,
  TaskTemplate,
  TeamTemplate,
} from "../db/schema";
import { type TagChip, groupTagsByTicket } from "./tags";
import { parseWorkingDirs } from "./working-dirs";

export function listTaskTemplates(): TaskTemplate[] {
  return db
    .select()
    .from(taskTemplates)
    .orderBy(asc(taskTemplates.position))
    .all();
}

export function listTeamTemplates(): TeamTemplate[] {
  return db
    .select()
    .from(teamTemplates)
    .orderBy(asc(teamTemplates.name))
    .all();
}

/** Configured repositories (working dirs), in display order — full rows for the
 *  Settings editor. */
export function listRepositories(): Repository[] {
  return db
    .select()
    .from(repositories)
    .orderBy(asc(repositories.position))
    .all();
}

/** Working-dir paths for the ticket/template dropdowns — normalized (absolute,
 *  de-duplicated) via the same pure helper the import path uses. */
export function readWorkingDirs(): string[] {
  return parseWorkingDirs(listRepositories().map((r) => r.path));
}

/** "Open with" editors, in display order. */
export function listEditors(): Editor[] {
  return db.select().from(editors).orderBy(asc(editors.position)).all();
}

/** All tags, in display order — for Settings and the ticket tag pickers. */
export function listTags(): Tag[] {
  return db.select().from(tags).orderBy(asc(tags.position)).all();
}

/** ticketId → its tag chips (tag display order), for the board. One join,
 *  folded by the pure groupTagsByTicket. */
export function readTicketTags(): Record<string, TagChip[]> {
  const rows = db
    .select({
      ticketId: ticketTags.ticketId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(ticketTags)
    .innerJoin(tags, eq(ticketTags.tagId, tags.id))
    .orderBy(asc(tags.position))
    .all();
  return groupTagsByTicket(rows);
}

/** The tag ids currently attached to one ticket — for the edit form. */
export function readTicketTagIds(ticketId: string): string[] {
  return db
    .select({ tagId: ticketTags.tagId })
    .from(ticketTags)
    .where(eq(ticketTags.ticketId, ticketId))
    .all()
    .map((r) => r.tagId);
}
