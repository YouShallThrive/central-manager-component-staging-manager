import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PhpVersionBadge } from "@/components/PhpVersionBadge";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plug,
  Trash2,
  ExternalLink,
  Clock,
  FileCode,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  ClipboardList,
  GitCompare,
  Database,
  Download,
  RotateCcw,
  Plus,
  Power,
  PowerOff,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../convex/_generated/dataModel";
import SiteDetailTemplate from "@/components/SiteDetailTemplate";
import type { QuickStatItem } from "@/components/SiteDetailTemplate";

/* ─── Helper components (staging-specific) ─────────────────── */

function CategoryBadge({ category }: { category: string }) {
  const config: Record<string, { label: string; className: string }> = {
    tracking: {
      label: "Tracking",
      className:
        "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800",
    },
    management: {
      label: "Management",
      className:
        "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
    },
    email: {
      label: "Email",
      className:
        "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    },
    keep: {
      label: "Keep",
      className:
        "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    },
    other: {
      label: "Other",
      className:
        "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700",
    },
  };

  const c = config[category] ?? config.other;
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function PluginStatusIcon({ status, inDeactivateList }: { status: string; inDeactivateList: boolean }) {
  if (status === "active" && inDeactivateList) {
    return <XCircle className="size-4 text-red-500" />;
  }
  if (status === "active") {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  if (status === "inactive" && inDeactivateList) {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  return <div className="size-4 rounded-full border-2 border-muted-foreground/30" />;
}

function PluginToggleButton({
  site,
  plugin,
}: {
  site: { _id: Id<"sites">; stagingId: number; accountId?: Id<"rocketAccounts"> };
  plugin: { slug: string; status: string };
}) {
  const togglePlugin = useAction(api.pluginActions.togglePlugin);
  const [loading, setLoading] = useState(false);

  const isActive = plugin.status === "active";
  const isMustUse = plugin.status === "must-use";

  if (isMustUse || !site.accountId) return null;

  const handleToggle = async () => {
    setLoading(true);
    try {
      const result = await togglePlugin({
        siteId: site._id,
        stagingId: site.stagingId,
        accountId: site.accountId!,
        pluginSlug: plugin.slug,
        activate: !isActive,
      });
      if (result.success) {
        toast.success(`${plugin.slug} ${isActive ? "deactivated" : "activated"}`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={isActive ? "outline" : "default"}
      size="sm"
      className={`h-7 text-xs gap-1.5 min-w-[100px] ${
        isActive
          ? "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
          : "bg-emerald-600 hover:bg-emerald-700 text-white"
      }`}
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : isActive ? (
        <PowerOff className="size-3" />
      ) : (
        <Power className="size-3" />
      )}
      {loading ? "Working..." : isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}

function BulkDeactivateButton({
  site,
  pluginSlugs,
}: {
  site: { _id: Id<"sites">; stagingId: number; accountId?: Id<"rocketAccounts"> };
  pluginSlugs: string[];
}) {
  const bulkToggle = useAction(api.pluginActions.bulkTogglePlugins);
  const [loading, setLoading] = useState(false);

  if (!site.accountId || pluginSlugs.length === 0) return null;

  const handleBulk = async () => {
    setLoading(true);
    try {
      const result = await bulkToggle({
        siteId: site._id,
        stagingId: site.stagingId,
        accountId: site.accountId!,
        pluginSlugs,
        activate: false,
      });
      if (result.success) {
        toast.success(`Deactivated ${result.succeeded.length} plugins`);
      } else {
        toast.error(
          `${result.succeeded.length} succeeded, ${result.failed.length} failed`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk deactivate failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      className="h-7 text-xs gap-1.5"
      onClick={handleBulk}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <PowerOff className="size-3" />
      )}
      {loading ? `Deactivating ${pluginSlugs.length}...` : `Deactivate All (${pluginSlugs.length})`}
    </Button>
  );
}

function StatusBadgeLarge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    prepped: {
      label: "Prepped",
      className: "bg-emerald-600 text-white border-0",
      icon: CheckCircle2,
    },
    unprepped: {
      label: "Unprepped",
      className: "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30",
      icon: AlertTriangle,
    },
    in_progress: {
      label: "In Progress",
      className: "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30",
      icon: Clock,
    },
    error: {
      label: "Error",
      className: "bg-red-600 text-white border-0",
      icon: XCircle,
    },
  };

  const c = config[status] ?? config.unprepped;
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={`gap-1.5 ${c.className}`}>
      <Icon className="size-3.5" />
      {c.label}
    </Badge>
  );
}

/* ─── Main page ──────────────────────────────────────────── */

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  const siteId = id as Id<"sites">;
  const site = useQuery(api.sites.get, { id: siteId });
  const plugins = useQuery(api.sitePlugins.listBySite, { siteId });
  const muPlugins = useQuery(api.siteMuPlugins.listBySite, { siteId });
  const logs = useQuery(api.actionLogs.listBySite, { siteId });
  const syncDetail = useAction(api.sync.syncSiteDetail);
  const hasAccounts = useQuery(api.rocketAccounts.hasAny);

  const handleSyncDetail = useCallback(async () => {
    if (!site) return;
    if (!hasAccounts) {
      toast.error("No Rocket.net accounts connected. Go to Servers to add one.", {
        action: {
          label: "Go to Servers",
          onClick: () => navigate("/servers"),
        },
      });
      return;
    }
    setSyncing(true);
    try {
      const result = await syncDetail({
        siteId,
        stagingId: site.stagingId,
      });
      toast.success(
        `Synced: ${result.pluginCount} plugins, ${result.muPluginCount} MU-plugins` +
          (result.shouldDeactivate > 0
            ? ` (${result.shouldDeactivate} need deactivation)`
            : ""),
      );
    } catch (e) {
      toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, [site, syncDetail, siteId, hasAccounts, navigate]);

  if (site === undefined) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (site === null) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="gap-2 mb-4">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="text-center py-12 text-muted-foreground">Site not found</div>
      </div>
    );
  }

  const summary = site.pluginSummary;
  const deactivateListPlugins = plugins?.filter((p) => p.inDeactivateList) ?? [];
  const otherPlugins = plugins?.filter((p) => !p.inDeactivateList) ?? [];
  const needsAction = deactivateListPlugins.filter((p) => p.status === "active");
  const alreadyHandled = deactivateListPlugins.filter((p) => p.status === "inactive");
  const needsUpdate = plugins?.filter((p) => p.updateAvailable) ?? [];

  // Build staging URL with optional HTTP auth
  const stagingUrl = site.stagingDomain
    ? site.httpAuthEnabled && site.httpAuthUsername && site.httpAuthPassword
      ? `https://${encodeURIComponent(site.httpAuthUsername)}:${encodeURIComponent(site.httpAuthPassword)}@${site.stagingDomain}`
      : `https://${site.stagingDomain}`
    : null;

  const stats: QuickStatItem[] = [
    {
      label: "Total Plugins",
      value: summary?.total ?? "—",
      icon: <Plug className="size-4" />,
    },
    {
      label: "Active",
      value: summary?.active ?? "—",
      icon: <CheckCircle2 className="size-4 text-emerald-500" />,
    },
    {
      label: "Need Deactivation",
      value: summary?.shouldDeactivate ?? "—",
      icon: <AlertTriangle className="size-4 text-red-500" />,
      highlight: summary?.shouldDeactivate ? summary.shouldDeactivate > 0 : false,
    },
    {
      label: "Need Update",
      value: needsUpdate.length,
      icon: <ArrowUpCircle className="size-4 text-amber-500" />,
      highlight: needsUpdate.length > 0,
    },
    {
      label: "Guard Status",
      value: site.guardInstalled === true ? "Installed" : site.guardInstalled === false ? "Missing" : "—",
      icon: site.guardInstalled ? (
        <ShieldCheck className="size-4 text-emerald-500" />
      ) : (
        <ShieldAlert className="size-4 text-red-500" />
      ),
      highlight: site.guardInstalled === false,
    },
    {
      label: "MU Issues",
      value: site.muPluginIssues ?? "—",
      icon: <Trash2 className="size-4 text-amber-500" />,
      highlight: (site.muPluginIssues ?? 0) > 0,
    },
    {
      label: "StatusCake",
      value:
        site.statuscakeStatus === "up"
          ? site.statuscakeUptime != null
            ? `${site.statuscakeUptime}%`
            : "Up"
          : site.statuscakeStatus === "down"
            ? "Down"
            : "—",
      icon:
        site.statuscakeStatus === "up" ? (
          <ArrowUpCircle className="size-4 text-emerald-500" />
        ) : site.statuscakeStatus === "down" ? (
          <ArrowDownCircle className="size-4 text-red-500" />
        ) : (
          <Activity className="size-4 text-muted-foreground" />
        ),
      highlight: site.statuscakeStatus === "down",
    },
  ];

  return (
    <SiteDetailTemplate
      onBack={() => navigate("/dashboard")}
      title={site.productionDomain}
      domainLink={
        stagingUrl && site.stagingDomain
          ? {
              url: stagingUrl,
              label: site.stagingDomain,
              extraIcon: site.httpAuthEnabled ? (
                <Lock className="size-3 text-amber-500" />
              ) : undefined,
            }
          : null
      }
      titleBadge={<StatusBadgeLarge status={site.status} />}
      metadata={
        <>
          <span className="text-sm text-muted-foreground">
            ID: {site.stagingId}
          </span>
          <span className="flex items-center gap-1.5">
            <PhpVersionBadge version={site.phpVersion} checkedAt={site.phpCheckedAt} />
            {site.phpVersion && site.productionPhpVersion && site.phpVersion !== site.productionPhpVersion && (
              <span
                className="text-xs text-amber-600"
                title={`Live site runs PHP ${site.productionPhpVersion}`}
              >
                live: PHP {site.productionPhpVersion}
              </span>
            )}
          </span>
          {site.lastSyncedAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              Last synced {new Date(site.lastSyncedAt).toLocaleString()}
            </span>
          )}
        </>
      }
      syncLabel="Scan Plugins"
      syncingLabel="Syncing..."
      onSync={handleSyncDetail}
      isSyncing={syncing}
      statuscake={null}
      stats={stats}
    >
      {/* HTTP Auth Management */}
      {site && <HttpAuthSection site={site} />}

      {/* Asana STAGE Tasks */}
      {site && <AsanaTasksSection site={site} />}

      {/* Content Diff */}
      {site && <ContentDiffSection site={site} />}

      {/* Staging Management (Backup / Delete / Recreate) */}
      {site && <StagingManageSection site={site} />}

      {/* Plugins needing action */}
      {plugins !== undefined && needsAction.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-200 dark:border-red-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-500" />
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
                Plugins to Deactivate ({needsAction.length})
              </h2>
            </div>
            {site && (
              <BulkDeactivateButton
                site={site}
                pluginSlugs={needsAction.map((p) => p.slug)}
              />
            )}
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/20">
            {needsAction.map((p) => (
              <div key={p._id} className="px-4 py-2.5 flex items-center gap-3">
                <XCircle className="size-4 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.slug}</span>
                    <CategoryBadge category={p.category} />
                  </div>
                  {p.version && (
                    <span className="text-xs text-muted-foreground">v{p.version}</span>
                  )}
                </div>
                {site && (
                  <PluginToggleButton site={site} plugin={p} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Already handled plugins */}
      {plugins !== undefined && alreadyHandled.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-200 dark:border-emerald-900/30 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Correctly Deactivated ({alreadyHandled.length})
            </h2>
          </div>
          <div className="divide-y divide-emerald-100 dark:divide-emerald-900/20">
            {alreadyHandled.map((p) => (
              <div key={p._id} className="px-4 py-2.5 flex items-center gap-3">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{p.slug}</span>
                    <CategoryBadge category={p.category} />
                  </div>
                </div>
                {site && (
                  <PluginToggleButton site={site} plugin={p} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plugins needing update */}
      {plugins !== undefined && needsUpdate.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="size-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Plugins Needing Update ({needsUpdate.length})
              </h2>
            </div>
            {site && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                onClick={() => {
                  const isPreview = window.location.hostname.startsWith("preview-");
                  const baseUrl = isPreview
                    ? "https://preview-wp-updates-dashboard-77490250.viktor.space"
                    : "https://wp-updates-dashboard-77490250.viktor.space";
                  window.open(
                    `${baseUrl}/sites/by-rocket/${site.stagingId}?scan=true`,
                    "_blank",
                  );
                }}
              >
                <ArrowUpCircle className="size-3" />
                Update plugins
              </Button>
            )}
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900/20">
            {needsUpdate.map((p) => (
              <div key={p._id} className="px-4 py-2.5 flex items-center gap-3">
                <ArrowUpCircle className="size-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.displayName || p.slug}</span>
                    <CategoryBadge category={p.category} />
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        p.status === "active"
                          ? "border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
                          : "border-gray-300 text-gray-500"
                      }`}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  {p.version && (
                    <span className="text-xs text-muted-foreground">
                      Current: v{p.version}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MU-Plugins Section */}
      {muPlugins !== undefined && muPlugins.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <FileCode className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              MU-Plugins ({muPlugins.length})
            </h2>
          </div>
          <div className="divide-y">
            {muPlugins.map((m) => (
              <div key={m._id} className="px-4 py-2.5 flex items-center gap-3">
                {m.isGuard ? (
                  <Shield className="size-4 text-emerald-500 shrink-0" />
                ) : m.inRemoveList ? (
                  <Trash2 className="size-4 text-amber-500 shrink-0" />
                ) : (
                  <FileCode className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-mono flex-1">{m.filename}</span>
                {m.isGuard && (
                  <Badge className="text-xs bg-emerald-600 text-white border-0">
                    Guard
                  </Badge>
                )}
                {m.inRemoveList && !m.isGuard && (
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                    should remove
                  </Badge>
                )}
                {!m.inRemoveList && !m.isGuard && (
                  <Badge variant="outline" className="text-xs">
                    keep
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All other plugins */}
      {plugins !== undefined && otherPlugins.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              Other Plugins ({otherPlugins.length})
            </h2>
          </div>
          <div className="divide-y">
            {otherPlugins.map((p) => (
              <div key={p._id} className="px-4 py-2.5 flex items-center gap-3">
                <PluginStatusIcon status={p.status} inDeactivateList={p.inDeactivateList} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.slug}</span>
                    <CategoryBadge category={p.category} />
                    {p.version && (
                      <span className="text-xs text-muted-foreground">v{p.version}</span>
                    )}
                  </div>
                </div>
                {site && (
                  <PluginToggleButton site={site} plugin={p} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for plugins */}
      {plugins !== undefined && plugins.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <Plug className="size-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No plugin data yet. Click "Scan Plugins" to fetch plugin information.
          </p>
        </div>
      )}

      {/* Activity Log */}
      {logs !== undefined && logs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Activity Log</h2>
          </div>
          <div className="divide-y max-h-[300px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log._id} className="px-4 py-2.5 flex items-start gap-3">
                <div className="mt-0.5">
                  {log.status === "success" ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  ) : log.status === "error" ? (
                    <XCircle className="size-3.5 text-red-500" />
                  ) : (
                    <ExternalLink className="size-3.5 text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{log.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log._creationTime).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SiteDetailTemplate>
  );
}

/* ─── Staging-specific sections ──────────────────────────── */

function ContentDiffSection({ site }: { site: any }) {
  const runDiff = useAction(api.contentDiff.runDiff);
  const latestDiff = useQuery(api.contentDiff.getLatest, { siteId: site._id });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleRunDiff = async () => {
    if (!site.productionId || !site.accountId) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runDiff({
        siteId: site._id,
        productionId: site.productionId,
        stagingId: site.stagingId,
        accountId: site.accountId,
      });
      if (!result.success) setError(result.error ?? "Diff failed");
      else toast.success("Content diff complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  };

  const parsed = latestDiff?.details ? (() => {
    try {
      const raw = JSON.parse(latestDiff.details);
      if (Array.isArray(raw)) return { items: raw, typeBreakdown: null };
      return { items: raw.items ?? [], typeBreakdown: raw.typeBreakdown ?? null };
    } catch { return { items: [], typeBreakdown: null }; }
  })() : { items: [], typeBreakdown: null };

  const details: Array<{
    slug: string; title: string; postType: string;
    location: string; prodModified?: string; stagingModified?: string;
    prodUrl?: string; stagingUrl?: string; modified: boolean;
  }> = parsed.items;
  const typeBreakdown: Record<string, { production: number; staging: number }> | null = parsed.typeBreakdown;

  const modifiedItems = details.filter((d) => d.modified);
  const prodOnly = details.filter((d) => d.location === "production_only");
  const stagingOnly = details.filter((d) => d.location === "staging_only");

  const typeLabels: Record<string, string> = {
    page: "Pages",
    post: "Posts",
    elementor_library: "Templates",
    "e-landing-page": "Landing Pages",
    product: "Products",
  };

  return (
    <div className={`rounded-lg border overflow-hidden ${
      latestDiff && !latestDiff.inSync
        ? "border-orange-200 bg-orange-50/30 dark:bg-orange-950/10 dark:border-orange-900/30"
        : ""
    }`}>
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className={`size-4 ${latestDiff && !latestDiff.inSync ? "text-orange-500" : "text-muted-foreground"}`} />
          <h2 className="text-sm font-semibold">Content Diff</h2>
          {latestDiff && (
            <Badge variant={latestDiff.inSync ? "outline" : "destructive"} className="text-[10px]">
              {latestDiff.inSync ? "In Sync" : "Out of Sync"}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleRunDiff}
          disabled={running || !site.productionId || !site.accountId}
        >
          {running ? <RefreshCw className="size-3 animate-spin mr-1" /> : <GitCompare className="size-3 mr-1" />}
          {running ? "Comparing..." : "Run Diff"}
        </Button>
      </div>
      <div className="p-4 space-y-3">
        {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-2.5">{error}</p>}

        {!latestDiff && !running && (
          <p className="text-xs text-muted-foreground">No content diff has been run yet. Click "Run Diff" to compare production vs staging.</p>
        )}

        {latestDiff && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md border p-2.5 text-center">
                <p className="text-lg font-bold">{latestDiff.productionCount}</p>
                <p className="text-[10px] text-muted-foreground">Production</p>
              </div>
              <div className="rounded-md border p-2.5 text-center">
                <p className="text-lg font-bold">{latestDiff.stagingCount}</p>
                <p className="text-[10px] text-muted-foreground">Staging</p>
              </div>
              <div className="rounded-md border p-2.5 text-center">
                <p className="text-lg font-bold text-emerald-600">{latestDiff.matchingCount}</p>
                <p className="text-[10px] text-muted-foreground">Matching</p>
              </div>
              <div className="rounded-md border p-2.5 text-center">
                <p className={`text-lg font-bold ${(latestDiff.modifiedCount + latestDiff.onlyProductionCount + latestDiff.onlyStagingCount) > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                  {latestDiff.modifiedCount + latestDiff.onlyProductionCount + latestDiff.onlyStagingCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Differences</p>
              </div>
            </div>

            {!latestDiff.inSync && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {latestDiff.modifiedCount > 0 && <p>• {latestDiff.modifiedCount} page(s) modified since clone</p>}
                {latestDiff.onlyProductionCount > 0 && <p>• {latestDiff.onlyProductionCount} page(s) only on production</p>}
                {latestDiff.onlyStagingCount > 0 && <p>• {latestDiff.onlyStagingCount} page(s) only on staging</p>}
              </div>
            )}

            {details.length > 0 && !latestDiff.inSync && (
              <div>
                <button
                  className="text-xs text-blue-500 hover:underline"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? "Hide details" : `Show ${modifiedItems.length + prodOnly.length + stagingOnly.length} differences`}
                </button>

                {expanded && (
                  <div className="mt-2 divide-y rounded-md border overflow-hidden max-h-64 overflow-y-auto">
                    {modifiedItems.map((item) => (
                      <div key={`mod-${item.slug}`} className="px-3 py-2 text-xs flex items-center gap-2">
                        <Badge className="text-[9px] bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">Modified</Badge>
                        <span className="font-medium truncate flex-1">{item.title}</span>
                        <span className="text-muted-foreground shrink-0">{typeLabels[item.postType] ?? item.postType}</span>
                        {item.prodUrl && (
                          <a href={item.prodUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0" title="View on production">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ))}
                    {prodOnly.map((item) => (
                      <div key={`prod-${item.slug}`} className="px-3 py-2 text-xs flex items-center gap-2">
                        <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">Prod Only</Badge>
                        <span className="font-medium truncate flex-1">{item.title}</span>
                        <span className="text-muted-foreground shrink-0">{typeLabels[item.postType] ?? item.postType}</span>
                        {item.prodUrl && (
                          <a href={item.prodUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0" title="View on production">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ))}
                    {stagingOnly.map((item) => (
                      <div key={`stg-${item.slug}`} className="px-3 py-2 text-xs flex items-center gap-2">
                        <Badge className="text-[9px] bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800">Staging Only</Badge>
                        <span className="font-medium truncate flex-1">{item.title}</span>
                        <span className="text-muted-foreground shrink-0">{typeLabels[item.postType] ?? item.postType}</span>
                        {item.stagingUrl && (
                          <a href={item.stagingUrl} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:text-purple-700 shrink-0" title="View on staging">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {typeBreakdown && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                {Object.entries(typeBreakdown)
                  .sort(([, a], [, b]) => (b.production + b.staging) - (a.production + a.staging))
                  .map(([type, counts]) => (
                  <span key={type}>
                    {typeLabels[type] ?? type}: {counts.production} prod / {counts.staging} staging
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Last checked: {new Date(latestDiff.ranAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StagingManageSection({ site }: { site: any }) {
  const listBackups = useAction(api.stagingManage.listBackups);
  const createBackup = useAction(api.stagingManage.createBackup);
  const deleteStaging = useAction(api.stagingManage.deleteStaging);
  const createStaging = useAction(api.stagingManage.createStaging);

  const [backups, setBackups] = useState<Array<{ id: number; label: string; downloadLink?: string; createdAt?: string }> | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupLabel, setBackupLabel] = useState("");
  const [deletingStaging, setDeletingStaging] = useState(false);
  const [creatingStagingEnv, setCreatingStagingEnv] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!site.productionId || !site.accountId) {
    return null;
  }

  const handleLoadBackups = async () => {
    setLoadingBackups(true);
    setError(null);
    try {
      const result = await listBackups({
        productionId: site.productionId!,
        accountId: site.accountId!,
      });
      if (result.success) {
        setBackups(result.backups);
      } else {
        setError(result.error ?? "Failed to load backups");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    const label = backupLabel.trim() || `staging-manager-${new Date().toISOString().split("T")[0]}`;
    setCreatingBackup(true);
    setError(null);
    try {
      const result = await createBackup({
        siteId: site._id,
        productionId: site.productionId!,
        accountId: site.accountId!,
        label,
      });
      if (result.success) {
        setSuccess(`Backup "${label}" started. It may take several minutes to complete.`);
        setBackupLabel("");
        toast.success("Backup creation started");
      } else {
        setError(result.error ?? "Failed to create backup");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteAndRecreate = async () => {
    setDeletingStaging(true);
    setError(null);
    setSuccess(null);
    try {
      const delResult = await deleteStaging({
        siteId: site._id,
        productionId: site.productionId!,
        accountId: site.accountId!,
      });
      if (!delResult.success) {
        setError(`Delete failed: ${delResult.error}`);
        setDeletingStaging(false);
        return;
      }

      setSuccess("Staging deleted. Creating fresh staging...");
      setCreatingStagingEnv(true);
      setDeletingStaging(false);

      const createResult = await createStaging({
        siteId: site._id,
        productionId: site.productionId!,
        accountId: site.accountId!,
      });
      if (createResult.success) {
        setSuccess("Fresh staging environment is being created. This may take several minutes. Refresh the page after a few minutes.");
        toast.success("Staging recreation started");
      } else {
        setError(`Staging creation failed: ${createResult.error}. You may need to create staging manually from Rocket.net.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeletingStaging(false);
      setCreatingStagingEnv(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Staging Management</h2>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-2.5">{error}</p>}
        {success && <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-md p-2.5">{success}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Production Backups</p>
            <Button
              variant="outline" size="sm" className="h-7 text-xs"
              onClick={handleLoadBackups}
              disabled={loadingBackups}
            >
              {loadingBackups ? <RefreshCw className="size-3 animate-spin mr-1" /> : <Download className="size-3 mr-1" />}
              {backups === null ? "Load Backups" : "Refresh"}
            </Button>
          </div>

          {backups !== null && (
            <div className="space-y-1">
              {backups.length === 0 ? (
                <p className="text-xs text-muted-foreground">No backups found</p>
              ) : (
                <div className="divide-y rounded-md border overflow-hidden max-h-40 overflow-y-auto">
                  {backups.map((b) => (
                    <div key={b.id} className="px-3 py-2 text-xs flex items-center justify-between">
                      <span className="font-medium">{b.label}</span>
                      {b.downloadLink && (
                        <a href={b.downloadLink} target="_blank" rel="noopener noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-1">
                          <Download className="size-3" /> Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Backup label (optional)"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Button
              variant="outline" size="sm" className="h-7 text-xs shrink-0"
              onClick={handleCreateBackup}
              disabled={creatingBackup}
            >
              {creatingBackup ? <RefreshCw className="size-3 animate-spin mr-1" /> : <Plus className="size-3 mr-1" />}
              Create Backup
            </Button>
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <p className="text-xs font-medium">Delete & Recreate Staging</p>
          <p className="text-xs text-muted-foreground">
            Deletes the current staging environment and creates a fresh clone from production. A backup is recommended first.
          </p>

          {!confirmDelete ? (
            <Button
              variant="destructive" size="sm" className="h-7 text-xs"
              onClick={() => setConfirmDelete(true)}
            >
              <RotateCcw className="size-3 mr-1" />
              Delete & Recreate Staging
            </Button>
          ) : (
            <div className="flex items-center gap-2 p-2.5 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30">
              <AlertTriangle className="size-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400 flex-1">
                This will permanently delete the staging site and all its data. Are you sure?
              </p>
              <Button
                variant="destructive" size="sm" className="h-7 text-xs"
                onClick={handleDeleteAndRecreate}
                disabled={deletingStaging || creatingStagingEnv}
              >
                {(deletingStaging || creatingStagingEnv) && <RefreshCw className="size-3 animate-spin mr-1" />}
                {deletingStaging ? "Deleting..." : creatingStagingEnv ? "Creating..." : "Confirm"}
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          )}

          {site.lastBackupAt && (
            <p className="text-[10px] text-muted-foreground">
              Last backup: {site.lastBackupLabel} ({new Date(site.lastBackupAt).toLocaleDateString()})
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AsanaTasksSection({ site }: { site: any }) {
  const linkProject = useAction(api.asana.linkProject);
  const getStageTasks = useAction(api.asana.getStageTasks);
  const hasAsanaPat = useQuery(api.settings.has, { key: "asana_pat" });
  const navigate = useNavigate();

  const [linking, setLinking] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasks, setTasks] = useState<
    Array<{ gid: string; name: string; assignee?: string; dueOn?: string; completed: boolean; url: string }>
  | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLinked = !!site.asanaProjectId;
  const hasStageSection = !!site.asanaStageSectionId;

  const handleLink = async () => {
    setLinking(true);
    setError(null);
    try {
      const result = await linkProject({
        siteId: site._id,
        productionDomain: site.productionDomain,
      });
      if (!result.found) {
        setError(result.error ?? "Project not found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link");
    } finally {
      setLinking(false);
    }
  };

  const handleLoadTasks = async () => {
    if (!site.asanaStageSectionId) return;
    setLoadingTasks(true);
    setError(null);
    try {
      const result = await getStageTasks({ sectionId: site.asanaStageSectionId });
      setTasks(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoadingTasks(false);
    }
  };

  if (!hasAsanaPat) {
    return (
      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Asana STAGE Tasks</h2>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground">
            No Asana token configured.{" "}
            <button onClick={() => navigate("/settings")} className="text-blue-500 hover:underline">
              Go to Settings
            </button>{" "}
            to add your Asana PAT.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      tasks && tasks.length > 0
        ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900/30"
        : ""
    }`}>
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className={`size-4 ${tasks && tasks.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          <h2 className="text-sm font-semibold">Asana STAGE Tasks</h2>
          {isLinked && site.asanaProjectName && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {site.asanaProjectName}
            </Badge>
          )}
          {tasks && tasks.length > 0 && (
            <Badge className="text-xs bg-amber-600 text-white border-0">
              {tasks.length} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLinked && hasStageSection && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleLoadTasks}
              disabled={loadingTasks}
            >
              {loadingTasks ? (
                <RefreshCw className="size-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="size-3 mr-1" />
              )}
              Refresh
            </Button>
          )}
          {!isLinked && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleLink}
              disabled={linking}
            >
              {linking ? (
                <RefreshCw className="size-3 animate-spin mr-1" />
              ) : (
                <ExternalLink className="size-3 mr-1" />
              )}
              Link Asana Project
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-2.5">{error}</p>
        )}

        {!isLinked && !error && (
          <p className="text-xs text-muted-foreground">
            Click "Link Asana Project" to find the matching Asana project for <strong>{site.productionDomain}</strong>.
          </p>
        )}

        {isLinked && !hasStageSection && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2.5">
            Project "{site.asanaProjectName}" found but no "STAGE Website Production Tasks" section exists.
          </p>
        )}

        {isLinked && hasStageSection && tasks === null && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={handleLoadTasks} disabled={loadingTasks}>
            {loadingTasks ? "Loading..." : "Load STAGE tasks"}
          </Button>
        )}

        {tasks !== null && tasks.length === 0 && (
          <div className="flex items-center gap-2 py-1">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <p className="text-sm text-emerald-600 dark:text-emerald-400">No active STAGE tasks — safe to manage staging.</p>
          </div>
        )}

        {tasks !== null && tasks.length > 0 && (
          <div className="divide-y rounded-md border overflow-hidden">
            {tasks.map((t) => (
              <a
                key={t.gid}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.assignee && (
                      <span className="text-xs text-muted-foreground">{t.assignee}</span>
                    )}
                    {t.dueOn && (
                      <span className="text-xs text-muted-foreground">Due: {t.dueOn}</span>
                    )}
                  </div>
                </div>
                <ExternalLink className="size-3 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        )}

        {tasks !== null && tasks.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠️ Do not delete or recreate staging while these tasks are active!
          </p>
        )}
      </div>
    </div>
  );
}

function HttpAuthSection({ site }: { site: any }) {
  const enableAuth = useAction(api.httpAuth.enableAuth);
  const disableAuth = useAction(api.httpAuth.disableAuth);
  const updateAuth = useAction(api.httpAuth.updateAuth);
  const probeAuth = useAction(api.httpAuth.probeAuth);

  const [username, setUsername] = useState(site.httpAuthUsername ?? "");
  const [password, setPassword] = useState(site.httpAuthPassword ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [probing, setProbing] = useState(false);
  const probeRan = useRef(false);

  useEffect(() => {
    if (probeRan.current || !site.accountId) return;
    probeRan.current = true;
    setProbing(true);
    probeAuth({
      siteId: site._id,
      stagingId: site.stagingId,
      accountId: site.accountId,
    })
      .catch(() => {})
      .finally(() => setProbing(false));
  }, [site._id, site.stagingId, site.accountId, probeAuth]);

  const isEnabled = site.httpAuthEnabled === true;
  const hasCredentials = username.trim() && password.trim();
  const hasAccountId = !!site.accountId;

  const handleToggle = async (checked: boolean) => {
    if (!hasAccountId) {
      toast.error("This site is not linked to a Rocket.net account. Sync first.");
      return;
    }
    setLoading(true);
    try {
      if (checked) {
        if (!hasCredentials) {
          toast.error("Enter a username and password first.");
          setLoading(false);
          return;
        }
        const result = await enableAuth({
          siteId: site._id,
          stagingId: site.stagingId,
          accountId: site.accountId,
          username: username.trim(),
          password: password.trim(),
        });
        if (result.success) {
          toast.success("HTTP Auth enabled");
        } else {
          toast.error(result.error ?? "Failed to enable auth");
        }
      } else {
        const result = await disableAuth({
          siteId: site._id,
          stagingId: site.stagingId,
          accountId: site.accountId,
        });
        if (result.success) {
          toast.success("HTTP Auth disabled");
        } else {
          toast.error(result.error ?? "Failed to disable auth");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setLoading(false);
      setEditing(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!hasAccountId || !hasCredentials) return;
    setLoading(true);
    try {
      const result = await updateAuth({
        siteId: site._id,
        stagingId: site.stagingId,
        accountId: site.accountId,
        username: username.trim(),
        password: password.trim(),
      });
      if (result.success) {
        toast.success("Credentials updated");
        setEditing(false);
      } else {
        toast.error(result.error ?? "Failed to update");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        isEnabled
          ? "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-900/30"
          : ""
      }`}
    >
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <Lock className="size-4 text-emerald-500" />
          ) : (
            <LockOpen className="size-4 text-muted-foreground" />
          )}
          <h2 className="text-sm font-semibold">HTTP Authentication</h2>
          {isEnabled && (
            <Badge className="text-xs bg-emerald-600 text-white border-0">Active</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(loading || probing) && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
          {probing && <span className="text-[10px] text-muted-foreground">checking…</span>}
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={loading || probing || (!isEnabled && !hasCredentials) || !hasAccountId}
          />
        </div>
      </div>
      <div className="p-4 space-y-3">
        {!hasAccountId && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2.5">
            This site is not linked to a Rocket.net account. Run a sync to associate it.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="auth-user" className="text-xs">
              Username
            </Label>
            <Input
              id="auth-user"
              placeholder="staging_user"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (isEnabled) setEditing(true);
              }}
              disabled={loading}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-pass" className="text-xs">
              Password
            </Label>
            <div className="relative">
              <Input
                id="auth-pass"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (isEnabled) setEditing(true);
                }}
                disabled={loading}
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
        </div>
        {isEnabled && editing && hasCredentials && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleUpdateCredentials}
              disabled={loading}
            >
              Update Credentials
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {isEnabled
            ? "HTTP Basic Auth is active. Visitors must enter credentials to view the staging site."
            : "Enable to require HTTP Basic Auth credentials to access this staging site. Uses an MU-plugin deployed via the Rocket.net API."}
        </p>
      </div>
    </div>
  );
}
