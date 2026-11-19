/**
 * Reusable Activity Log page for the central manager.
 *
 * Same chrome in every component: title + subtitle, status summary pills,
 * search / action / site / time filters, then a bordered list of rows — status
 * icon, action badge, site domain, relative time, and the details body.
 *
 * Usage (see README.md):
 *   const entries = useQuery(api.actionLogs.listEnriched, { limit: 500 });
 *   <ActivityLog entries={entries} subtitle="…" actionLabels={LABELS} />
 *
 * `renderDetails` replaces the single muted paragraph with a richer body (the
 * Security Manager uses it to show per-item update results); return null from
 * it to fall back to the default. Everything else stays identical, which is
 * what keeps the look uniform.
 */

import { Clock, Globe, ListFilter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_RANGES,
  type DateRange,
  formatAction,
  formatTimestamp,
  getDateCutoff,
  STATUS_CONFIG,
  STATUSES,
} from "./format";
import type { ActivityEntry } from "./types";

export type ActivityLogProps = {
  /** Feed the query result straight in — `undefined` renders the loading state. */
  entries: ActivityEntry[] | undefined;
  title?: string;
  subtitle?: string;
  /** Component-specific action labels; unknown actions are title-cased. */
  actionLabels?: Record<string, string>;
  /** Replaces the default details paragraph for entries with structured text. */
  renderDetails?: (entry: ActivityEntry) => React.ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
};

export default function ActivityLog({
  entries,
  title = "Activity Log",
  subtitle = "Recent activity across all sites",
  actionLabels,
  renderDetails,
  searchPlaceholder = "Search actions, details, domains...",
  emptyMessage = "No activity yet.",
  className = "max-w-[1100px]",
}: ActivityLogProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | (typeof STATUSES)[number]
  >("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Filter options come from the data, so components don't declare them.
  const { actionTypes, siteDomains } = useMemo(() => {
    if (!entries)
      return { actionTypes: [] as string[], siteDomains: [] as string[] };
    return {
      actionTypes: [...new Set(entries.map(e => e.action))].sort(),
      siteDomains: [
        ...new Set(entries.filter(e => e.siteDomain).map(e => e.siteDomain!)),
      ].sort(),
    };
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return undefined;
    const cutoff = getDateCutoff(dateRange);
    const q = search.toLowerCase().trim();

    return entries.filter(log => {
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (siteFilter !== "all" && log.siteDomain !== siteFilter) return false;
      if (cutoff > 0 && log._creationTime < cutoff) return false;
      if (q) {
        const haystack = [log.action, log.details, log.siteDomain ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, statusFilter, actionFilter, siteFilter, dateRange]);

  const statusCounts = useMemo(() => {
    const counts = {
      success: 0,
      error: 0,
      info: 0,
      total: entries?.length ?? 0,
    };
    for (const e of entries ?? []) counts[e.status]++;
    return counts;
  }, [entries]);

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
    <div className={`p-6 mx-auto space-y-6 ${className}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Status summary pills */}
      {entries && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === "all"
                ? "bg-foreground text-background border-foreground"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            <ListFilter className="size-3" />
            All ({statusCounts.total})
          </button>
          {STATUSES.map(s => {
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
                    ? `${cfg.badgeClass} ring-2 ring-offset-1 ring-ring/30`
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
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

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map(a => (
              <SelectItem key={a} value={a}>
                {formatAction(a, actionLabels)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              {siteDomains.map(d => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={dateRange}
          onValueChange={v => setDateRange(v as DateRange)}
        >
          <SelectTrigger className="w-[150px]">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Time range" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map(r => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              {hasActiveFilters ? ` of ${entries?.length ?? 0}` : ""} entr
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
                  : emptyMessage}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-1 text-xs"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(log => {
              const cfg = STATUS_CONFIG[log.status];
              const Icon = cfg.icon;
              return (
                <div
                  key={log._id}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`size-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[11px] font-mono px-1.5 py-0 leading-5"
                      >
                        {formatAction(log.action, actionLabels)}
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
                    {renderDetails?.(log) ?? (
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">
                        {log.details}
                      </p>
                    )}
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
