/**
 * Shared shape for the activity log template.
 *
 * Every central-manager component exposes the same query
 * (`api.actionLogs.listEnriched` in convex/actionLogs.ts) returning these
 * fields, so the template can be copied between components unchanged.
 */

export type LogStatus = "success" | "error" | "info";

export type ActivityEntry = {
  _id: string;
  _creationTime: number;
  action: string;
  details: string;
  status: LogStatus;
  siteDomain?: string;
};
