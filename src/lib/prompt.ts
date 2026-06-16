/**
 * Build the single prompt string handed to the agent CLI on first launch.
 *
 * The agent receives no other framing, so the message labels each piece and
 * states the relationship between them: a short preamble identifies this as an
 * inady KANBAN ticket, the ticket (title + description) is the background/goal, and
 * the user's main prompt is the instruction to act on now. The description
 * block is dropped when empty. Returned as one string so callers pass it as a
 * single argv element (no shell expansion).
 */
export function wrapPrompt(
  title: string,
  description: string,
  mainPrompt: string,
): string {
  const desc = description.trim();
  const parts = [
    "The following is a ticket from the inady KANBAN board. Read it and make sure you understand it first.",
    "",
    `# Ticket: ${title.trim()}`,
  ];
  if (desc) parts.push("", desc);
  parts.push("", "# Request", "", mainPrompt.trim());
  return parts.join("\n");
}
