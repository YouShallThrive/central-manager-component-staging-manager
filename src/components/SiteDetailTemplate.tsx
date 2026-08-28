/**
 * SiteDetailTemplate — shared layout for site detail pages
 * across Staging Manager & Production Manager.
 *
 * Shared sections (always rendered by template):
 *   Header  →  StatusCake Card  →  Quick Stats  →  [children]
 *
 * Each manager provides its own sections via children.
 */
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  MinusCircle,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────── */

export interface DomainLink {
  url: string;
  label: string;
  extraIcon?: React.ReactNode;
}

export interface QuickStatItem {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
}

export interface StatusCakeData {
  status?: string | null;
  uptime?: number | null;
  lastChecked?: number | null;
  testId?: string | null;
}

export interface SyncMessage {
  text: string;
  isError: boolean;
}

export interface SiteDetailConfig {
  /** Back navigation handler */
  onBack: () => void;
  /** Primary title (domain name) */
  title: string;
  /** Clickable domain link shown under the title */
  domainLink?: DomainLink | null;
  /** Badge(s) shown next to the title (e.g. status badge, environment badge) */
  titleBadge?: React.ReactNode;
  /** Metadata items shown below the title (e.g. account, WP version, last synced) */
  metadata?: React.ReactNode;
  /** Sync/scan button config */
  syncLabel: string;
  syncingLabel: string;
  onSync: () => void;
  isSyncing: boolean;
  /** Optional sync message banner */
  syncMessage?: SyncMessage | null;
  onDismissSyncMessage?: () => void;
  /** StatusCake monitoring data */
  statuscake?: StatusCakeData | null;
  /** Quick stat cards */
  stats: QuickStatItem[];
  /** Environment-specific sections */
  children: React.ReactNode;
}

/* ─── Quick Stat Card (shared) ────────────────────────────── */

export function QuickStat({
  label,
  value,
  icon,
  highlight,
}: QuickStatItem) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30"
          : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/* ─── StatusCake Card (shared) ────────────────────────────── */

function StatusCakeCard({ data }: { data: StatusCakeData }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="size-4 text-emerald-600" />
        <h3 className="font-semibold text-sm">StatusCake Uptime</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            {data.status === "up" ? (
              <ArrowUpCircle className="size-5 text-emerald-500" />
            ) : data.status === "down" ? (
              <ArrowDownCircle className="size-5 text-red-500" />
            ) : (
              <MinusCircle className="size-5 text-muted-foreground" />
            )}
            <span
              className={`text-lg font-bold ${
                data.status === "up"
                  ? "text-emerald-600"
                  : data.status === "down"
                    ? "text-red-600"
                    : "text-muted-foreground"
              }`}
            >
              {data.status === "up"
                ? "Up"
                : data.status === "down"
                  ? "Down"
                  : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Status</p>
        </div>
        <div className="text-center">
          <p
            className={`text-lg font-bold ${
              data.uptime != null && data.uptime < 99.5
                ? "text-amber-600"
                : ""
            }`}
          >
            {data.uptime != null ? `${data.uptime}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Uptime</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-muted-foreground">
            {data.lastChecked
              ? new Date(data.lastChecked).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Last Check</p>
        </div>
      </div>
      {!data.testId && (
        <p className="text-xs text-muted-foreground mt-3 text-center italic">
          No StatusCake test linked. Configure the StatusCake integration to
          sync uptime data.
        </p>
      )}
    </div>
  );
}

/* ─── Main Template ──────────────────────────────────────── */

export default function SiteDetailTemplate(props: SiteDetailConfig) {
  const {
    onBack,
    title,
    domainLink,
    titleBadge,
    metadata,
    syncLabel,
    syncingLabel,
    onSync,
    isSyncing,
    syncMessage,
    onDismissSyncMessage,
    statuscake,
    stats,
    children,
  } = props;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-3 -ml-2"
        >
          <ArrowLeft className="size-4 mr-1" /> Back to Sites
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {titleBadge}
            </div>
            <div className="flex items-center gap-4 mt-1">
              {domainLink && (
                <a
                  href={domainLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground font-mono hover:text-foreground hover:underline transition-colors inline-flex items-center gap-1"
                  title="Open site"
                >
                  {domainLink.label}
                  <ExternalLink className="size-3" />
                  {domainLink.extraIcon}
                </a>
              )}
              {metadata}
            </div>
          </div>
          <Button
            onClick={onSync}
            disabled={isSyncing}
            variant="outline"
            className="gap-2 shrink-0"
          >
            <RefreshCw
              className={`size-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? syncingLabel : syncLabel}
          </Button>
        </div>

        {/* Sync message banner */}
        {syncMessage && (
          <div
            className={`rounded-lg px-4 py-2.5 flex items-center justify-between text-sm mt-3 ${
              syncMessage.isError
                ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                : "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
            }`}
          >
            <span>{syncMessage.text}</span>
            {onDismissSyncMessage && (
              <button
                onClick={onDismissSyncMessage}
                className="text-xs underline opacity-60 hover:opacity-100"
              >
                dismiss
              </button>
            )}
          </div>
        )}
      </div>

      {/* StatusCake Card */}
      {statuscake && <StatusCakeCard data={statuscake} />}

      {/* Quick Stats Row */}
      {stats.length > 0 && (
        <div
          className={`grid grid-cols-2 gap-3 ${
            stats.length <= 4
              ? "sm:grid-cols-4"
              : "md:grid-cols-6"
          }`}
        >
          {stats.map((s) => (
            <QuickStat key={s.label} {...s} />
          ))}
        </div>
      )}

      {/* Environment-specific content */}
      {children}
    </div>
  );
}
