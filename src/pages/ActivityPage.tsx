import { useQuery } from "convex/react";
import ActivityLog from "@/components/activity-log/ActivityLog";
import { api } from "../../convex/_generated/api";

/** Action labels for this component; unknown actions are title-cased. */
const ACTION_LABELS: Record<string, string> = {
  full_sync: "Full Sync",
  sync_sites: "Site Sync",
  auto_sync: "Auto Sync",
  scan_error: "Scan Error",
  content_diff: "Content Diff",
  http_auth_enabled: "HTTP Auth On",
  http_auth_disabled: "HTTP Auth Off",
  http_auth_updated: "HTTP Auth Updated",
  asana_linked: "Asana Linked",
  daily_sync_check: "Daily Sync Check",
  sync_check_all: "Sync Check All",
  staging_created: "Staging Created",
  staging_deleted: "Staging Deleted",
  backup_created: "Backup Created",
  plugin_activate: "Plugin Activate",
  plugin_deactivate: "Plugin Deactivate",
  bulk_plugin_activate: "Bulk Plugin Activate",
  bulk_plugin_deactivate: "Bulk Plugin Deactivate",
};

/**
 * Same page as every other central-manager component — the chrome, filters and
 * rows all live in the shared template (src/components/activity-log/).
 */
export default function ActivityPage() {
  const entries = useQuery(api.actionLogs.listEnriched, { limit: 500 });

  return (
    <ActivityLog
      entries={entries}
      subtitle="Recent sync and prep actions across all staging sites"
      actionLabels={ACTION_LABELS}
      searchPlaceholder="Search actions, details, domains..."
      emptyMessage="No activity yet. Sync some sites to see logs here."
    />
  );
}
