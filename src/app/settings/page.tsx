import SettingsView from "@/components/SettingsView";
import {
  listEditors,
  listRepositories,
  listTags,
  listTaskTemplates,
  listTeamTemplates,
  readWorkingDirs,
} from "@/lib/inady-kanban-config";
import {
  readAgentTools,
  readClaudeDefaults,
  readCursorModelSelection,
  readDateFormat,
} from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const claudeDefaults = readClaudeDefaults();
  const cursorModelSelection = readCursorModelSelection();
  const dateFormat = readDateFormat();
  const agentTools = readAgentTools();
  const taskTemplates = listTaskTemplates();
  const teamTemplates = listTeamTemplates();
  const workingDirs = readWorkingDirs();
  const repositories = listRepositories();
  const editors = listEditors();
  const tags = listTags();

  return (
    <SettingsView
      claudeDefaults={claudeDefaults}
      cursorModelSelection={cursorModelSelection}
      dateFormat={dateFormat}
      agentTools={agentTools}
      taskTemplates={taskTemplates}
      teamTemplates={teamTemplates}
      workingDirs={workingDirs}
      repositories={repositories}
      editors={editors}
      tags={tags}
    />
  );
}
