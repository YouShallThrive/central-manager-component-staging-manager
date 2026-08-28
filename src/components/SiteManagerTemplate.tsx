/**
 * SiteManagerTemplate — shared layout for Staging Manager & Production Manager.
 *
 * Both dashboards use the identical visual structure:
 *   Header  →  Sync Progress  →  Stats Cards  →  Filters  →  Table
 *
 * Shared columns (Domain, Plugins, Guard, MU-Plugins, StatusCake) are defined
 * here via field accessors so they always match. Each dashboard can insert
 * extra environment-specific columns (e.g. Status for staging, Account for production).
 */
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhpVersionBadge } from "@/components/PhpVersionBadge";
import { RocketStatusBadge } from "@/components/RocketStatusBadge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RefreshCw,
  Search,
  Server,
  ExternalLink,
  Loader2,
  Plug,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  ShieldAlert,
  ArrowUpCircle,
  ArrowDownCircle,
  FileWarning,
  Bug,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────── */

export interface StatItem {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  render: (site: T) => React.ReactNode;
}

export interface SyncProgress {
  status: string;
  phase: string;
  total: number;
  completed: number;
  currentSite?: string;
  errors: number;
  errorSites?: string[];
}

export interface AccountOption {
  _id: string;
  label: string;
}

export interface StatusOption {
  value: string;
  label: string;
}

/** Generic extra filter dropdown — each dashboard defines its own */
export interface ExtraFilter {
  key: string;
  allLabel: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  width?: string;
}

/* ─── Field accessors: how each dashboard maps its data ──── */

export interface DomainLink {
  url: string;
  label: string;
  extraIcon?: React.ReactNode;
}

export interface SiteFieldAccessors<T> {
  /** Primary domain name displayed as bold title */
  getDomainLabel: (site: T) => string;
  /** Clickable link shown below the domain label (nullable = no link) */
  getDomainLink: (site: T) => DomainLink | null;
  /** Total plugin count */
  getPluginCount: (site: T) => number | null | undefined;
  /** Number of plugins with issues */
  getPluginIssueCount: (site: T) => number | undefined;
  /** Label for plugin issues badge, e.g. "to fix" or "outdated" */
  pluginIssueLabel: string;
  /** Whether guard/safety-net is installed */
  getGuardInstalled: (site: T) => boolean | null | undefined;
  /** Number of MU-plugin issues */
  getMuPluginIssues: (site: T) => number | null | undefined;
  /** StatusCake status string */
  getStatuscakeStatus: (site: T) => string | null | undefined;
  /** StatusCake uptime percentage */
  getStatuscakeUptime: (site: T) => number | null | undefined;
  /** WP_DEBUG enabled */
  getWpDebug: (site: T) => boolean | null | undefined;
  /** Timestamp of last WP_DEBUG check */
  getWpDebugCheckedAt: (site: T) => number | null | undefined;
  /** PHP version — when provided, a PHP column is rendered */
  getPhpVersion?: (site: T) => string | null | undefined;
  /** Second PHP version to compare against (e.g. production PHP next to staging PHP) */
  getSecondaryPhpVersion?: (site: T) => string | null | undefined;
  /** Label for the secondary PHP version, e.g. "live" */
  secondaryPhpLabel?: string;
  /** Timestamp of last PHP version check */
  getPhpCheckedAt?: (site: T) => number | null | undefined;
  /** Rocket.net presence: "ok" | "missing" | "auth_error" */
  getRocketStatus?: (site: T) => string | null | undefined;
  /** When the site was first seen missing from Rocket.net */
  getRocketMissingSince?: (site: T) => number | null | undefined;
}

/** Standard stat values shown on every site manager */
export interface SiteManagerStats {
  totalSites: number;
  guardInstalled: number;
  pluginIssues: number;
  muPluginIssues: number;
  debugOn: number;
  statuscakeUp: number;
  statuscakeDown: number;
}

export interface SiteManagerConfig<T> {
  /** Page title, e.g. "Staging Sites" or "Production Sites" */
  title: string;
  /** Subtitle description */
  subtitle: string;
  /** Standard stat values (template builds the cards) */
  siteStats: SiteManagerStats | null;
  /** Field accessors for building standard columns */
  fieldAccessors: SiteFieldAccessors<T>;
  /** Extra columns to insert after domain (e.g. Status, Account) */
  extraColumns?: ColumnDef<T>[];
  /** Sites data (undefined = loading) */
  sites: T[] | undefined;
  /** Account filter options */
  accounts?: AccountOption[];
  /** Extra filter dropdowns (e.g. Status for staging, StatusCake/Plugin Health for production) */
  extraFilters?: ExtraFilter[];
  /** Search value */
  search: string;
  /** Search handler */
  onSearchChange: (v: string) => void;
  /** Account filter value */
  accountFilter: string;
  /** Account filter handler */
  onAccountFilterChange: (v: string) => void;
  /** Extra buttons rendered left of the Sync button */
  headerActions?: React.ReactNode;
  /** Panel rendered between the stats row and the filters (e.g. PHP version summary) */
  summaryPanel?: React.ReactNode;
  /** Sync handler */
  onSync: () => void;
  /** Is sync currently running */
  isSyncing: boolean;
  /** Sync progress (reactive, optional) */
  syncProgress?: SyncProgress | null;
  /** Navigate to site detail */
  onSiteClick: (site: T) => void;
  /** Get unique key for each site */
  getSiteKey: (site: T) => string;
  /** Enable row selection checkboxes */
  enableSelection?: boolean;
  /** Currently selected site keys */
  selectedKeys?: Set<string>;
  /** Selection change handler */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Render a per-row action button (column added before the external link icon) */
  renderRowAction?: (site: T) => React.ReactNode;
  /** Bulk action bar content (shown above the table when items are selected) */
  bulkActionBar?: React.ReactNode;
}

/* ─── Reusable sub-components ────────────────────────────── */

function StatsCard({ label, value, icon: Icon, className }: StatItem) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── StatusCake badge (shared) ──────────────────────────── */

export function StatusCakeBadge({
  status,
  uptime,
}: {
  status?: string | null;
  uptime?: number | null;
}) {
  if (status === "up") {
    return (
      <Badge
        variant="outline"
        className="text-xs border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 gap-0.5"
      >
        <ArrowUpCircle className="size-3" />
        {uptime != null ? `${uptime}%` : "Up"}
      </Badge>
    );
  }
  if (status === "down") {
    return (
      <Badge
        variant="outline"
        className="text-xs border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 gap-0.5"
      >
        <ArrowDownCircle className="size-3" />
        Down
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

/* ─── Plugin count cell (shared) ─────────────────────────── */

export function PluginCountCell({
  count,
  issueCount,
  issueLabel,
}: {
  count?: number | null;
  issueCount?: number;
  issueLabel?: string;
}) {
  if (count == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Plug className="size-3 text-muted-foreground" />
        <span className="text-xs tabular-nums">{count}</span>
      </div>
      {(issueCount ?? 0) > 0 && (
        <Badge
          variant="outline"
          className="text-xs border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 gap-1"
        >
          <AlertTriangle className="size-3" />
          {issueCount} {issueLabel ?? "issues"}
        </Badge>
      )}
      {issueCount === 0 && count > 0 && (
        <Badge
          variant="outline"
          className="text-xs border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 gap-1"
        >
          <CheckCircle2 className="size-3" />
          clean
        </Badge>
      )}
    </div>
  );
}

/* ─── Guard badge (shared) ───────────────────────────────── */

export function GuardBadge({ installed }: { installed?: boolean | null }) {
  if (installed === true) return <Shield className="size-4 text-emerald-600" />;
  if (installed === false) return <ShieldAlert className="size-4 text-red-500" />;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/* ─── MU-Plugin cell (shared) ────────────────────────────── */

export function MuPluginCell({ issues }: { issues?: number | null }) {
  if ((issues ?? -1) > 0) {
    return (
      <Badge
        variant="outline"
        className="text-xs border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
      >
        {issues} to remove
      </Badge>
    );
  }
  if (issues === 0) return <CheckCircle2 className="size-3.5 text-emerald-600" />;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/* ─── WP_DEBUG badge (shared) ────────────────────────────── */

export function DebugBadge({
  wpDebug,
  checkedAt,
}: {
  wpDebug?: boolean | null;
  checkedAt?: number | null;
}) {
  if (wpDebug == null) return <span className="text-xs text-muted-foreground">—</span>;
  if (!wpDebug) return <CheckCircle2 className="size-3.5 text-emerald-600" />;

  const hoursOn = checkedAt ? (Date.now() - checkedAt) / (1000 * 60 * 60) : 0;
  if (hoursOn >= 24) {
    return (
      <Badge
        variant="outline"
        className="text-xs border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 gap-1"
      >
        <Bug className="size-3" />
        ⚠️ {Math.floor(hoursOn)}h
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-xs border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1"
    >
      <Bug className="size-3" />
      ON
    </Badge>
  );
}

/* ─── Outdated badge (shared) ────────────────────────────── */

export function OutdatedBadge({
  outdated,
  hasPlugins,
}: {
  outdated?: number | null;
  hasPlugins?: boolean;
}) {
  if ((outdated ?? 0) > 0) {
    return (
      <Badge
        variant="outline"
        className="text-xs border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1"
      >
        <AlertTriangle className="size-3" />
        {outdated}
      </Badge>
    );
  }
  if (hasPlugins) return <span className="text-xs text-emerald-600">✓</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/* ─── Status badge (staging-specific) ────────────────────── */

export function StagingStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    {
      label: string;
      variant: "default" | "outline" | "destructive";
      className: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    prepped: {
      label: "Prepped",
      variant: "default",
      className: "bg-emerald-600 hover:bg-emerald-700 text-white border-0",
      icon: CheckCircle2,
    },
    unprepped: {
      label: "Unprepped",
      variant: "outline",
      className: "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30",
      icon: AlertTriangle,
    },
    in_progress: {
      label: "In Progress",
      variant: "outline",
      className: "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30",
      icon: Clock,
    },
    error: {
      label: "Error",
      variant: "destructive",
      className: "",
      icon: ShieldAlert,
    },
  };

  const c = config[status] ?? config.error;
  const Icon = c.icon;

  return (
    <Badge variant={c.variant} className={`gap-1 text-xs font-medium ${c.className}`}>
      <Icon className="size-3" />
      {c.label}
    </Badge>
  );
}

/* ─── Build standard stat cards ──────────────────────────── */

function buildStatItems(s: SiteManagerStats): StatItem[] {
  return [
    { label: "Total Sites", value: s.totalSites, icon: Server },
    { label: "Guard Installed", value: s.guardInstalled, icon: Shield },
    {
      label: "Plugin Issues",
      value: s.pluginIssues,
      icon: Plug,
      className:
        s.pluginIssues > 0
          ? "border-amber-200 dark:border-amber-900/30"
          : "",
    },
    {
      label: "MU-Plugin Issues",
      value: s.muPluginIssues,
      icon: FileWarning,
      className:
        s.muPluginIssues > 0
          ? "border-amber-200 dark:border-amber-900/30"
          : "",
    },
    {
      label: "Debug ON",
      value: s.debugOn,
      icon: Bug,
      className:
        s.debugOn > 0
          ? "border-red-200 dark:border-red-900/30"
          : "",
    },
    {
      label: "StatusCake Up",
      value: s.statuscakeUp,
      icon: ArrowUpCircle,
    },
    {
      label: "StatusCake Down",
      value: s.statuscakeDown,
      icon: ArrowDownCircle,
      className:
        s.statuscakeDown > 0
          ? "border-red-200 dark:border-red-900/30"
          : "",
    },
  ];
}

/* ─── Build standard columns from field accessors ────────── */

function buildStandardColumns<T>(
  acc: SiteFieldAccessors<T>,
  extraColumns?: ColumnDef<T>[],
): ColumnDef<T>[] {
  const domainCol: ColumnDef<T> = {
    key: "domain",
    header: "Domain",
    render: (site) => {
      const link = acc.getDomainLink(site);
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{acc.getDomainLabel(site)}</span>
            <RocketStatusBadge
              status={acc.getRocketStatus?.(site) ?? undefined}
              missingSince={acc.getRocketMissingSince?.(site) ?? undefined}
            />
          </div>
          {link && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-foreground hover:underline transition-colors inline-flex items-center gap-1"
                title="Open site"
              >
                {link.label}
                <ExternalLink className="size-3 shrink-0" />
                {link.extraIcon}
              </a>
            </span>
          )}
        </div>
      );
    },
  };

  const phpCol: ColumnDef<T> = {
    key: "php",
    header: "PHP",
    render: (site) => {
      const primary = acc.getPhpVersion?.(site) ?? undefined;
      const secondary = acc.getSecondaryPhpVersion?.(site) ?? undefined;
      const checkedAt = acc.getPhpCheckedAt?.(site) ?? undefined;
      const mismatch = !!primary && !!secondary && primary !== secondary;

      return (
        <div className="flex items-center gap-1.5">
          <PhpVersionBadge version={primary} checkedAt={checkedAt} />
          {mismatch && (
            <span
              className="text-xs text-amber-600"
              title={`Staging is on PHP ${primary}, ${acc.secondaryPhpLabel ?? "live"} is on PHP ${secondary}`}
            >
              ≠ {secondary}
            </span>
          )}
        </div>
      );
    },
  };

  const pluginsCol: ColumnDef<T> = {
    key: "plugins",
    header: "Plugins",
    render: (site) => (
      <PluginCountCell
        count={acc.getPluginCount(site)}
        issueCount={acc.getPluginIssueCount(site)}
        issueLabel={acc.pluginIssueLabel}
      />
    ),
  };

  const guardCol: ColumnDef<T> = {
    key: "guard",
    header: "Guard",
    render: (site) => <GuardBadge installed={acc.getGuardInstalled(site)} />,
  };

  const muPluginsCol: ColumnDef<T> = {
    key: "mu-plugins",
    header: "MU-Plugins",
    render: (site) => <MuPluginCell issues={acc.getMuPluginIssues(site)} />,
  };

  const debugCol: ColumnDef<T> = {
    key: "wp-debug",
    header: "WP_DEBUG",
    render: (site) => (
      <DebugBadge
        wpDebug={acc.getWpDebug(site)}
        checkedAt={acc.getWpDebugCheckedAt(site)}
      />
    ),
  };

  const statuscakeCol: ColumnDef<T> = {
    key: "statuscake",
    header: "StatusCake",
    render: (site) => (
      <StatusCakeBadge
        status={acc.getStatuscakeStatus(site)}
        uptime={acc.getStatuscakeUptime(site)}
      />
    ),
  };

  // Domain → [extra columns] → Plugins → Guard → MU-Plugins → WP_DEBUG → StatusCake
  return [
    domainCol,
    ...(extraColumns ?? []),
    ...(acc.getPhpVersion ? [phpCol] : []),
    pluginsCol,
    guardCol,
    muPluginsCol,
    debugCol,
    statuscakeCol,
  ];
}

/* ─── Main template ──────────────────────────────────────── */

export default function SiteManagerTemplate<T>(props: SiteManagerConfig<T>) {
  const {
    title,
    subtitle,
    siteStats,
    fieldAccessors,
    extraColumns,
    sites,
    accounts,
    extraFilters,
    search,
    onSearchChange,
    accountFilter,
    onAccountFilterChange,
    onSync,
    headerActions,
    summaryPanel,
    isSyncing,
    syncProgress,
    onSiteClick,
    getSiteKey,
    enableSelection,
    selectedKeys,
    onSelectionChange,
    renderRowAction,
    bulkActionBar,
  } = props;

  const columns = buildStandardColumns(fieldAccessors, extraColumns);
  const stats = siteStats ? buildStatItems(siteStats) : [];

  const hasSyncProgress = syncProgress && (syncProgress.status === "syncing" || syncProgress.status === "done");
  const isDone = syncProgress?.status === "done";

  // Auto-toast on sync completion
  useEffect(() => {
    if (isDone && syncProgress) {
      const t = setTimeout(() => {
        toast.success(
          `Sync complete: ${syncProgress.completed} of ${syncProgress.total} sites scanned` +
            (syncProgress.errors > 0 ? ` (${syncProgress.errors} errors)` : ""),
        );
      }, 500);
      return () => clearTimeout(t);
    }
  }, [isDone]);

  useEffect(() => {
    if (syncProgress?.status === "error" && syncProgress?.phase) {
      toast.error(syncProgress.phase);
    }
  }, [syncProgress?.status]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
        {headerActions}
        <Button
          onClick={onSync}
          disabled={isSyncing}
          variant="outline"
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {isSyncing ? "Syncing..." : "Sync"}
        </Button>
        </div>
      </div>

      {/* Sync Progress Bar (reactive) */}
      {hasSyncProgress && syncProgress && (
        <div className="rounded-lg border bg-card p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {syncProgress.status === "syncing" ? (
                <Loader2 className="size-4 animate-spin text-orange-500" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-600" />
              )}
              <span className="text-sm font-medium">{syncProgress.phase}</span>
              {syncProgress.currentSite && syncProgress.status === "syncing" && (
                <span className="text-sm text-muted-foreground">
                  — {syncProgress.currentSite}
                </span>
              )}
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {syncProgress.total > 0
                ? `${syncProgress.completed} / ${syncProgress.total}`
                : ""}
            </span>
          </div>
          <Progress
            value={
              syncProgress.total > 0
                ? (syncProgress.completed / syncProgress.total) * 100
                : syncProgress.status === "syncing"
                  ? 5
                  : 0
            }
            className="h-2"
          />
          {syncProgress.errors > 0 && (
            <p className="text-xs text-amber-600">
              {syncProgress.errors} site{syncProgress.errors > 1 ? "s" : ""} failed to scan
              {syncProgress.errorSites?.length
                ? `: ${syncProgress.errorSites.join(", ")}`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Stats Row */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {stats.map((s) => (
            <StatsCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {summaryPanel}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search domains..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {accounts && accounts.length > 1 && (
          <Select value={accountFilter} onValueChange={onAccountFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {extraFilters?.map((f) => (
          <Select key={f.key} value={f.value} onValueChange={f.onChange}>
            <SelectTrigger className={f.width ?? "w-[160px]"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.allLabel}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {sites && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {sites.length} site{sites.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Bulk Action Bar */}
      {enableSelection && selectedKeys && selectedKeys.size > 0 && bulkActionBar && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-900/30 p-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedKeys.size} site{selectedKeys.size !== 1 ? "s" : ""} selected
          </span>
          {bulkActionBar}
        </div>
      )}

      {/* Sites Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              {enableSelection && (
                <th className="py-2.5 px-3 w-10">
                  <Checkbox
                    checked={
                      sites && sites.length > 0 && selectedKeys
                        ? selectedKeys.size === sites.length
                          ? true
                          : selectedKeys.size > 0
                            ? "indeterminate"
                            : false
                        : false
                    }
                    onCheckedChange={(checked) => {
                      if (!sites || !onSelectionChange) return;
                      if (checked) {
                        onSelectionChange(new Set(sites.map(getSiteKey)));
                      } else {
                        onSelectionChange(new Set());
                      }
                    }}
                    aria-label="Select all"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${col.width ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
              {renderRowAction && (
                <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              )}
              <th className="py-2.5 px-4 w-10" />
            </tr>
          </thead>
          <tbody>
            {sites === undefined ? (
              <tr>
                <td
                  colSpan={columns.length + 1 + (enableSelection ? 1 : 0) + (renderRowAction ? 1 : 0)}
                  className="py-12 text-center text-muted-foreground"
                >
                  Loading...
                </td>
              </tr>
            ) : sites.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1 + (enableSelection ? 1 : 0) + (renderRowAction ? 1 : 0)} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Server className="size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {search || accountFilter !== "all" || extraFilters?.some((f) => f.value !== "all")
                        ? "No sites match your filters"
                        : `No sites yet. Click "Sync" to pull site data.`}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              sites.map((site) => {
                const siteKey = getSiteKey(site);
                const isSelected = selectedKeys?.has(siteKey) ?? false;
                return (
                  <tr
                    key={siteKey}
                    onClick={() => onSiteClick(site)}
                    className={`border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50/50 dark:bg-blue-950/10" : ""
                    }`}
                  >
                    {enableSelection && (
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (!onSelectionChange || !selectedKeys) return;
                            const next = new Set(selectedKeys);
                            if (checked) {
                              next.add(siteKey);
                            } else {
                              next.delete(siteKey);
                            }
                            onSelectionChange(next);
                          }}
                          aria-label={`Select site`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="py-3 px-4">
                        {col.render(site)}
                      </td>
                    ))}
                    {renderRowAction && (
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {renderRowAction(site)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
