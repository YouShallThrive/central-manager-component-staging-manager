/**
 * Formatting helpers for the activity log template — status styling, action
 * labels, relative timestamps and the date-range cutoff. Part of the reusable
 * template (see README.md), so keep it free of app-specific imports.
 */
import { CheckCircle2, Info, XCircle } from "lucide-react";
import type { LogStatus } from "./types";

export const STATUS_CONFIG: Record<
  LogStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    color: string;
    badgeClass: string;
  }
> = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    color: "text-emerald-500",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  error: {
    label: "Error",
    icon: XCircle,
    color: "text-red-500",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  info: {
    label: "Info",
    icon: Info,
    color: "text-blue-500",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
};

export const STATUSES: LogStatus[] = ["success", "error", "info"];

/**
 * Human-readable action labels. Components pass their own map; unknown actions
 * fall back to a title-cased version of the raw value ("staging_fix" →
 * "Staging Fix").
 */
export function formatAction(
  action: string,
  labels?: Record<string, string>,
): string {
  return (
    labels?.[action] ??
    action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  );
}

export type DateRange = "all" | "24h" | "7d" | "30d";

export const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** Creation-time floor for a range, or 0 for "all". */
export function getDateCutoff(range: DateRange): number {
  if (range === "all") return 0;
  const ms = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return Date.now() - ms[range];
}

/** "Just now", "14m ago", "8h ago", then "Nov 18, 3:05 PM". */
export function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
