"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createTicket, deleteTicket } from "@/actions/tickets";
import { createAgentSession } from "@/actions/sessions";
import { db } from "@/db/client";
import { taskTemplates } from "@/db/schema";
import { parseAgentTeamMembers } from "@/lib/agent-launch";

/**
 * Create a ticket from a task template and start its agent immediately.
 * Returns ids so the client can open the ticket terminal.
 */
export async function executeTaskTemplate(
  templateId: string,
): Promise<{ ticketId: string; sessionDbId: string }> {
  const template = db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .get();
  if (!template) throw new Error("template not found");

  const { id: ticketId } = await createTicket({
    title: template.title,
    description: template.description,
    workingDir: template.workingDir,
  });

  try {
    const members = template.useAgentTeam
      ? parseAgentTeamMembers(template.agentTeamMembers)
      : [];

    const { sessionDbId } = await createAgentSession(ticketId, {
      agent: template.agent,
      basePrompt: template.mainPrompt,
      agentTeamMembers: members,
      claudeModel: template.claudeModel,
      claudeEffort: template.claudeEffort,
      cursorModel: template.cursorModel,
    });

    revalidatePath("/");
    revalidatePath(`/tickets/${ticketId}`);
    return { ticketId, sessionDbId };
  } catch (err) {
    await deleteTicket(ticketId);
    throw err;
  }
}
