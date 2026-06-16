import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // Internal notes (e.g. Slack URLs) — never sent to agent prompts.
    memo: text("memo").notNull().default(""),
    status: text("status", {
      enum: ["todo", "doing", "wip", "done"],
    }).notNull(),
    workingDir: text("working_dir").notNull(),
    // Fractional ordering within a column. Insert between neighbors by
    // averaging; rebalanced to integers when the gap gets too small.
    position: real("position").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    // When the ticket entered the Done column (null until completed). Stamped
    // by moveTicket/reorderColumn and cleared if it leaves Done. Nullable, so
    // db:push adds it cleanly; existing done tickets stay null (no accurate
    // historical value to backfill).
    doneAt: integer("done_at"),
    // Optional deadline, as the local-midnight epoch of the chosen day (date
    // only — set via an <input type="date">). Null = no deadline; nullable so
    // db:push adds it cleanly and existing tickets stay unset. The board card
    // renders it through formatDate + daysUntil (date-format.ts).
    deadline: integer("deadline"),
  },
  (t) => [index("tickets_status_position_idx").on(t.status, t.position)],
);

/**
 * Internal notes attached to a ticket (e.g. Slack/Notion URLs) — never sent to
 * agent prompts. A ticket holds many memos, shown oldest-first, each added /
 * edited / deleted inline on the detail page. Supersedes the legacy single
 * `tickets.memo` column (kept, unused, since db:push has no migrations).
 */
export const ticketMemos = sqliteTable(
  "ticket_memos",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("ticket_memos_ticket_created_idx").on(t.ticketId, t.createdAt)],
);

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    // Which CLI drives this session.
    agent: text("agent", { enum: ["cursor", "claude"] })
      .notNull()
      .default("cursor"),
    // Conversation UUID — pre-issued via `cursor-agent create-chat` (cursor) or
    // generated locally and pinned with --session-id (claude). The physical
    // column name predates claude support; kept to avoid a destructive rename
    // (db:push has no migration files).
    agentSessionId: text("cursor_session_id").notNull().unique(),
    mainPrompt: text("main_prompt").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    status: text("status", {
      // "killed" = stopped intentionally by the user; "error" = real failure.
      enum: ["running", "finished", "error", "killed"],
    }).notNull(),
    exitCode: integer("exit_code"),
    // Hook-reported overlay on `running` (orthogonal to `status`, which tracks
    // the process): "busy" = agent working, "awaiting" = paused for the user.
    // null = no hook configured/reported → UI shows the classic green dot
    // rather than guessing. Driven by the CLI's SessionStart/UserPromptSubmit
    // (busy) and Stop/Notification (awaiting) hooks via
    // POST /api/agent-sessions/:id/activity/*; cleared when a session
    // (re)starts or ends.
    activity: text("activity", { enum: ["busy", "awaiting"] }),
    // Claude-only launch flags (null for cursor sessions).
    claudeModel: text("model"),
    claudeEffort: text("effort"),
  },
  (t) => [
    index("agent_sessions_ticket_started_idx").on(t.ticketId, t.startedAt),
  ],
);

/** Reusable routine task the board can execute in one click. */
export const taskTemplates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    workingDir: text("working_dir").notNull(),
    agent: text("agent", { enum: ["cursor", "claude"] })
      .notNull()
      .default("claude"),
    claudeModel: text("model"),
    claudeEffort: text("effort"),
    mainPrompt: text("prompt").notNull().default(""),
    useAgentTeam: integer("team_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    agentTeamMembers: text("subagents").notNull().default("[]"),
    position: real("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("templates_position_idx").on(t.position)],
);

/** Saved agent-team member lists for quick reuse in the agent panel. */
export const teamTemplates = sqliteTable("team_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  members: text("subagents").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Single-row Claude defaults. */
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  claudeModel: text("claude_model").notNull().default("opus"),
  claudeEffort: text("claude_effort").notNull().default("xhigh"),
  // How dates render across the board/UI. Default YYYY/MM/DD; the user picks a
  // locale-appropriate format in Settings. Parsed through parseDateFormat
  // (date-format.ts) on read, so an unknown value falls back to the default.
  dateFormat: text("date_format").notNull().default("YYYY/MM/DD"),
  // Which AI tools (Cursor / Claude) the launch form offers, and in what order.
  // JSON array of { agent, enabled } in display order (JSON-in-text, same as
  // agent team members). Default "[]" → parseAgentTools fills in every kind
  // enabled, so an existing seeded row picks up "both on" with no migration.
  agentTools: text("agent_tools").notNull().default("[]"),
  // One-shot flag: 1 once `bootstrapDefaults` has imported the legacy
  // working-dirs file and seeded the default editors. Guards against re-seeding
  // after the user intentionally clears those lists.
  seeded: integer("seeded").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

/**
 * Selectable working directories (repositories), managed from the Settings
 * screen. Replaces the legacy `data/working-dirs.json` file — that file is
 * imported once into this table at boot (see `bootstrapDefaults`).
 */
export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull().unique(),
    position: real("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("repositories_position_idx").on(t.position)],
);

/**
 * "Open with" editor commands, managed from Settings. Exactly one row is the
 * default (the split button's primary action). `command` is run by a shell with
 * cwd set to the ticket's working dir, so `.` resolves there (e.g.
 * `cursor --classic .`). The path is never interpolated into the string.
 */
export const editors = sqliteTable(
  "editors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    command: text("command").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    position: real("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("editors_position_idx").on(t.position)],
);

/**
 * Ticket labels (e.g. priority High/Mid/Low), managed from Settings. `color` is
 * a normalized lowercase `#rrggbb` hex (see normalizeTagColor in tags.ts); the
 * default priority set is seeded once at boot (bootstrapDefaults). A ticket
 * carries many tags via the `ticket_tags` join below.
 */
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color").notNull(),
    position: real("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("tags_position_idx").on(t.position)],
);

/**
 * Many-to-many join between tickets and tags. The composite primary key (the
 * pair) stops a tag attaching to the same ticket twice; both sides cascade-
 * delete, so removing a ticket or a tag cleans up its links.
 */
export const ticketTags = sqliteTable(
  "ticket_tags",
  {
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.tagId] }),
    index("ticket_tags_tag_idx").on(t.tagId),
  ],
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketMemo = typeof ticketMemos.$inferSelect;
export type NewTicketMemo = typeof ticketMemos.$inferInsert;
export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type NewTaskTemplate = typeof taskTemplates.$inferInsert;
export type TeamTemplate = typeof teamTemplates.$inferSelect;
export type NewTeamTemplate = typeof teamTemplates.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Editor = typeof editors.$inferSelect;
export type NewEditor = typeof editors.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TicketTag = typeof ticketTags.$inferSelect;
export type NewTicketTag = typeof ticketTags.$inferInsert;

export type TicketStatus = Ticket["status"];
export type AgentKind = AgentSession["agent"];
export type SessionStatus = AgentSession["status"];
/** Hook-reported activity overlay on a running session (null = no hook). */
export type SessionActivity = NonNullable<AgentSession["activity"]>;

export const TICKET_STATUSES: TicketStatus[] = [
  "todo",
  "doing",
  "wip",
  "done",
];

export const AGENT_KINDS: AgentKind[] = ["cursor", "claude"];
