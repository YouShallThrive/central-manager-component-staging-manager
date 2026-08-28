import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, ShieldOff, CheckCircle2, Cpu, AlertTriangle } from "lucide-react";
import { PhpVersionBadge, matchesPhpFilter, PHP_FILTER_OPTIONS, PHP_FILTER_ALL_LABEL } from "@/components/PhpVersionBadge";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import SiteManagerTemplate, {
  StagingStatusBadge,
} from "@/components/SiteManagerTemplate";
import type { ColumnDef, SiteFieldAccessors, SiteManagerStats, SyncProgress, ExtraFilter } from "@/components/SiteManagerTemplate";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type SiteDoc = Doc<"sites">;

/** Build a staging site URL, embedding HTTP auth credentials when available */
function buildStagingUrl(site: SiteDoc): string | null {
  if (!site.stagingDomain) return null;
  const domain = site.stagingDomain;
  if (site.httpAuthEnabled && site.httpAuthUsername && site.httpAuthPassword) {
    const user = encodeURIComponent(site.httpAuthUsername);
    const pass = encodeURIComponent(site.httpAuthPassword);
    return `https://${user}:${pass}@${domain}`;
  }
  return `https://${domain}`;
}

/* ── Field accessors (how SM maps its data to shared columns) ── */

const fieldAccessors: SiteFieldAccessors<SiteDoc> = {
  getDomainLabel: (site) => site.productionDomain,
  getDomainLink: (site) => {
    const url = buildStagingUrl(site);
    if (!url || !site.stagingDomain) return null;
    return {
      url,
      label: site.stagingDomain,
      extraIcon: site.httpAuthEnabled ? (
        <Lock className="size-3 shrink-0 text-amber-500" />
      ) : undefined,
    };
  },
  getPluginCount: (site) => site.pluginSummary?.total,
  getPluginIssueCount: (site) => site.pluginSummary?.shouldDeactivate,
  pluginIssueLabel: "to fix",
  getGuardInstalled: (site) => site.guardInstalled,
  getMuPluginIssues: (site) => site.muPluginIssues,
  getStatuscakeStatus: (site) => site.statuscakeStatus,
  getStatuscakeUptime: (site) => site.statuscakeUptime,
  getWpDebug: (site) => site.wpDebug ?? null,
  getWpDebugCheckedAt: (site) => site.wpDebugCheckedAt ?? null,
  getPhpVersion: (site) => site.phpVersion,
  getSecondaryPhpVersion: (site) => site.productionPhpVersion,
  secondaryPhpLabel: "live",
  getPhpCheckedAt: (site) => site.phpCheckedAt,
};

/* ── Extra column: Status (staging-specific) ── */

const extraColumns: ColumnDef<SiteDoc>[] = [
  {
    key: "status",
    header: "Status",
    render: (site) => <StagingStatusBadge status={site.status} />,
  },
];

export default function DashboardPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [phpFilter, setPhpFilter] = useState<string>("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Track which sites are currently being deactivated (by site _id)
  const [deactivating, setDeactivating] = useState<Set<string>>(new Set());
  const [bulkDeactivating, setBulkDeactivating] = useState(false);

  const navigate = useNavigate();

  const accounts = useQuery(api.rocketAccounts.list);
  const stats = useQuery(api.sites.stats);
  const sites = useQuery(api.sites.list, {
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as "unprepped" | "prepped" | "in_progress" | "error"),
    search: search || undefined,
    accountId: accountFilter !== "all" ? (accountFilter as any) : undefined,
  });
  const syncEverything = useAction(api.sync.syncEverything);
  const hasAccounts = useQuery(api.rocketAccounts.hasAny);
  const syncProgress = useQuery(api.settings.getSyncProgress);
  const deactivateAll = useAction(api.pluginActions.deactivateAllForSite);
  const phpSummary = useQuery(api.phpVersions.summary);
  const phpPanel = phpSummary && phpSummary.total > 0 ? (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">PHP versions (staging)</span>
          {phpSummary.critical > 0 && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50 dark:bg-red-950/30 gap-1">
              <AlertTriangle className="size-3" />
              {phpSummary.critical} end-of-life
            </Badge>
          )}
          {phpSummary.mismatches > 0 && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 gap-1">
              <AlertTriangle className="size-3" />
              {phpSummary.mismatches} staging ≠ live
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {phpSummary.unknown > 0 && `${phpSummary.unknown} not synced · `}
          {phpSummary.lastCheckedAt
            ? `checked ${new Date(phpSummary.lastCheckedAt).toLocaleString()}`
            : "never checked — runs with the next Sync"}
        </span>
      </div>
      {phpSummary.byVersion.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {phpSummary.byVersion.map((row) => (
            <div key={row.version} className="flex items-center gap-1.5">
              <PhpVersionBadge version={row.version} />
              <span className="text-xs tabular-nums text-muted-foreground">×{row.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const handleSync = useCallback(async () => {
    if (!hasAccounts) {
      toast.error("No Rocket.net accounts connected. Go to Servers to add one.", {
        action: {
          label: "Go to Servers",
          onClick: () => navigate("/servers"),
        },
      });
      return;
    }
    syncEverything().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Connection lost")) {
        const match = msg.match(/Uncaught Error: (.+?)(?:\. at |\n|$)/);
        toast.error(match ? match[1] : `Sync failed. Check your API token.`);
      }
    });
    toast.info("Sync started…");
  }, [syncEverything, hasAccounts, navigate]);

  // Deactivate all "to fix" plugins for a single site
  const handleDeactivateSite = useCallback(async (siteId: string, domain: string) => {
    setDeactivating((prev) => new Set(prev).add(siteId));
    try {
      const result = await deactivateAll({ siteId: siteId as Id<"sites"> });
      if (result.success) {
        toast.success(`${domain}: ${result.deactivated} plugin${result.deactivated !== 1 ? "s" : ""} deactivated`);
      } else {
        toast.error(
          `${domain}: ${result.deactivated} deactivated, ${result.failed} failed`,
          { description: result.errors.map((e) => e.slug).join(", ") },
        );
      }
    } catch (e) {
      toast.error(`${domain}: Deactivation failed`, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDeactivating((prev) => {
        const next = new Set(prev);
        next.delete(siteId);
        return next;
      });
    }
  }, [deactivateAll]);

  // Bulk deactivate all "to fix" plugins for selected sites
  const handleBulkDeactivate = useCallback(async () => {
    if (!sites || selectedKeys.size === 0) return;

    const selectedSites = sites.filter(
      (s) => selectedKeys.has(s._id) && (s.pluginSummary?.shouldDeactivate ?? 0) > 0,
    );

    if (selectedSites.length === 0) {
      toast.info("No selected sites have plugins to deactivate");
      return;
    }

    setBulkDeactivating(true);
    // Mark all selected sites as "deactivating" so only their buttons show Working…
    setDeactivating((prev) => {
      const next = new Set(prev);
      for (const site of selectedSites) next.add(site._id);
      return next;
    });

    let totalDeactivated = 0;
    let totalFailed = 0;
    let sitesDone = 0;

    const toastId = toast.loading(
      `Deactivating plugins: 0/${selectedSites.length} sites processed…`,
    );

    for (const site of selectedSites) {
      try {
        const result = await deactivateAll({ siteId: site._id });
        totalDeactivated += result.deactivated;
        totalFailed += result.failed;
      } catch {
        totalFailed++;
      }
      // Remove this site from "deactivating" when done
      setDeactivating((prev) => {
        const next = new Set(prev);
        next.delete(site._id);
        return next;
      });
      sitesDone++;
      toast.loading(
        `Deactivating plugins: ${sitesDone}/${selectedSites.length} sites processed…`,
        { id: toastId },
      );
    }

    toast.dismiss(toastId);

    if (totalFailed === 0) {
      toast.success(
        `Bulk deactivation complete: ${totalDeactivated} plugins deactivated across ${sitesDone} sites`,
      );
    } else {
      toast.error(
        `Bulk deactivation: ${totalDeactivated} deactivated, ${totalFailed} failed across ${sitesDone} sites`,
      );
    }

    setSelectedKeys(new Set());
    setBulkDeactivating(false);
  }, [sites, selectedKeys, deactivateAll]);

  const siteStats: SiteManagerStats | null = stats
    ? {
        totalSites: stats.total,
        guardInstalled: stats.guardInstalled,
        pluginIssues: stats.withPluginIssues,
        muPluginIssues: stats.withMuIssues,
        debugOn: stats.debugOn ?? 0,
        statuscakeUp: stats.statuscakeUp,
        statuscakeDown: stats.statuscakeDown,
      }
    : null;

  const visibleSites = useMemo(() => {
    if (!sites) return undefined;
    if (phpFilter === "all") return sites;
    return sites.filter((s) => matchesPhpFilter(s.phpVersion, phpFilter));
  }, [sites, phpFilter]);

  const extraFilters: ExtraFilter[] = useMemo(() => [
    {
      key: "status",
      allLabel: "All statuses",
      options: [
        { value: "unprepped", label: "Unprepped" },
        { value: "prepped", label: "Prepped" },
        { value: "in_progress", label: "In Progress" },
        { value: "error", label: "Error" },
      ],
      value: statusFilter,
      onChange: setStatusFilter,
      width: "w-[160px]",
    },
      {
      key: "php",
      allLabel: PHP_FILTER_ALL_LABEL,
      options: PHP_FILTER_OPTIONS,
      value: phpFilter,
      onChange: setPhpFilter,
      width: "w-[170px]",
    },
], [statusFilter, phpFilter]);

  // Per-row "Deactivate All" button
  const renderRowAction = useCallback((site: SiteDoc) => {
    const issueCount = site.pluginSummary?.shouldDeactivate ?? 0;
    const isRunning = deactivating.has(site._id);

    if (issueCount === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="size-3.5" />
          OK
        </span>
      );
    }

    return (
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2.5 text-xs gap-1.5"
        disabled={isRunning}
        onClick={() => handleDeactivateSite(site._id, site.productionDomain)}
      >
        {isRunning ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ShieldOff className="size-3" />
        )}
        {isRunning ? "Working…" : `Deactivate All (${issueCount})`}
      </Button>
    );
  }, [deactivating, bulkDeactivating, handleDeactivateSite]);

  // Count selected sites that actually have issues
  const selectedWithIssues = useMemo(() => {
    if (!sites) return 0;
    return sites.filter(
      (s) => selectedKeys.has(s._id) && (s.pluginSummary?.shouldDeactivate ?? 0) > 0,
    ).length;
  }, [sites, selectedKeys]);

  // Bulk action bar content
  const bulkActionBar = useMemo(() => (
    <div className="flex items-center gap-2 ml-auto">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => setSelectedKeys(new Set())}
      >
        Clear selection
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 text-xs gap-1.5"
        disabled={bulkDeactivating || selectedWithIssues === 0}
        onClick={handleBulkDeactivate}
      >
        {bulkDeactivating ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ShieldOff className="size-3" />
        )}
        {bulkDeactivating
          ? "Deactivating…"
          : `Deactivate All on ${selectedWithIssues} site${selectedWithIssues !== 1 ? "s" : ""}`}
      </Button>
    </div>
  ), [bulkDeactivating, selectedWithIssues, handleBulkDeactivate]);

  return (
    <SiteManagerTemplate<SiteDoc>
      title="Staging Sites"
      subtitle="Manage Rocket.net staging environments and plugin states"
      siteStats={siteStats}
      fieldAccessors={fieldAccessors}
      extraColumns={extraColumns}
      extraFilters={extraFilters}
      sites={visibleSites ?? undefined}
      accounts={accounts}
      search={search}
      onSearchChange={setSearch}
      accountFilter={accountFilter}
      onAccountFilterChange={setAccountFilter}
      onSync={handleSync}
      summaryPanel={phpPanel}
      isSyncing={syncProgress?.status === "syncing"}
      syncProgress={syncProgress as SyncProgress | null | undefined}
      onSiteClick={(site) => navigate(`/site/${site._id}`)}
      getSiteKey={(site) => site._id}
      enableSelection
      selectedKeys={selectedKeys}
      onSelectionChange={setSelectedKeys}
      renderRowAction={renderRowAction}
      bulkActionBar={bulkActionBar}
    />
  );
}
