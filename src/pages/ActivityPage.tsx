import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  Info,
  Search,
  ListFilter,
  Clock,
  Globe,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type LogStatus = "success" | "error" | "info";

const STATUS_CONFIG: Record<
  LogStatus,
  { label: string; icon: typeof CheckCircle2; color: string; badgeClass: string }
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

/** Human-readable labels for action types */
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

function formatAction(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

type DateRange = "all" | "24h" | "7d" | "30d";

function getDateCutoff(range: DateRange): number {
  if (range === "all") return 0;
  const now = Date.now();
  const ms: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return now - ms[range];
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // Less than 1 minute
  if (diff < 60_000) return "Just now";
  // Less than 1 hour
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  // Less than 24 hours
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  // Show date + time
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const logs = useQuery(api.actionLogs.listEnriched, { limit: 500 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Derive unique action types and site domains from the data
  const { actionTypes, siteDomains } = useMemo(() => {
    if (!logs) return { actionTypes: [], siteDomains: [] };
    const actions = [...new Set(logs.map((l) => l.action))].sort();
    const domains = [
      ...new Set(logs.filter((l) => l.siteDomain).map((l) => l.siteDomain!)),
    ].sort();
    return { actionTypes: actions, siteDomains: domains };
  }, [logs]);

  // Filter logs
  const filtered = useMemo(() => {
    if (!logs) return undefined;

    const cutoff = getDateCutoff(dateRange);
    const q = search.toLowerCase().trim();

    return logs.filter((log) => {
      // Status filter
      if (statusFilter !== "all" && log.status !== statusFilter) return false;

      // Action type filter
      if (actionFilter !== "all" && log.action !== actionFilter) return false;

      // Site filter
      if (siteFilter !== "all" && log.siteDomain !== siteFilter) return false;

      // Date range filter
      if (cutoff > 0 && log._creationTime < cutoff) return false;

      // Text search — matches action, details, or site domain
      if (q) {
        const haystack = [log.action, log.details, log.siteDomain ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [logs, search, statusFilter, actionFilter, siteFilter, dateRange]);

  // Status counts for quick-filter badges
  const statusCounts = useMemo(() => {
    if (!logs) return { success: 0, error: 0, info: 0, total: 0 };
    const counts = { success: 0, error: 0, info: 0, total: logs.length };
    for (const log of logs) {
      counts[log.status]++;
    }
    return counts;
  }, [logs]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    actionFilter !== "all" ||
    siteFilter !== "all" ||
    dateRange !== "all" ||
    search !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setActionFilter("all");
    setSiteFilter("all");
    setDateRange("all");
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent sync and prep actions across all staging sites
        </p>
      </div>

      {/* Status summary badges */}
      {logs && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "all" ? "all" : "all")}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === "all"
                ? "bg-foreground text-background border-foreground"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            <ListFilter className="size-3" />
            All ({statusCounts.total})
          </button>
          {(["success", "error", "info"] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            const isActive = statusFilter === s;
            return (
              <button
                type="button"
                key={s}
                onClick={() => setStatusFilter(isActive ? "all" : s)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? cfg.badgeClass + " ring-2 ring-offset-1 ring-ring/30"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <Icon className="size-3" />
                {cfg.label} ({statusCounts[s]})
              </button>
            );
          })}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, details, domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Action type filter */}
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map((a) => (
              <SelectItem key={a} value={a}>
                {formatAction(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Site filter */}
        {siteDomains.length > 1 && (
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-1.5 truncate">
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All sites" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {siteDomains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range filter */}
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[150px]">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Time range" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear filters + result count */}
        <div className="flex items-center gap-2 ml-auto">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
          {filtered && (
            <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
              {filtered.length}
              {hasActiveFilters ? ` of ${logs?.length ?? 0}` : ""} entr
              {filtered.length === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
      </div>

      {/* Log list */}
      <div className="rounded-lg border overflow-hidden bg-card">
        {filtered === undefined ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="flex flex-col items-center gap-2">
              <Search className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "No activity matches your filters"
                  : "No activity yet. Sync some sites to see logs here."}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1 text-xs">
                  Clear all filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((log) => {
              const cfg = STATUS_CONFIG[log.status];
              const Icon = cfg.icon;
              return (
                <div
                  key={log._id}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`size-4 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[11px] font-mono px-1.5 py-0 leading-5"
                      >
                        {formatAction(log.action)}
                      </Badge>
                      {log.siteDomain && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {log.siteDomain}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground/70 ml-auto shrink-0">
                        {formatTimestamp(log._creationTime)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 break-words">
                      {log.details}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
