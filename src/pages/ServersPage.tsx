import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import {
  Server,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const SERVER_MANAGEMENT_URL = import.meta.env.VITE_SERVER_MANAGEMENT_URL || "https://central.ystvps.com";

type Account = {
  _id: string;
  _creationTime: number;
  label: string;
  hasToken: boolean;
  tokenPreview: string;
  status: "connected" | "error" | "expired";
  siteCount?: number;
  stagingSiteCount?: number;
  lastSyncedAt?: number;
  lastError?: string;
};

function AccountCard({ account }: { account: Account }) {
  const syncAccount = useAction(api.sync.syncAccount);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAccount({ accountId: account._id as any });
      toast.success(
        `Synced ${result.sitesSynced} sites, scanned ${result.sitesScanned}${
          result.errors ? `, ${result.errors} errors` : ""
        }`,
      );
    } catch (err) {
      toast.error("Sync failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  const statusIcon =
    account.status === "connected" ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : account.status === "expired" ? (
      <Clock className="size-4 text-amber-500" />
    ) : (
      <AlertCircle className="size-4 text-red-500" />
    );

  const statusLabel =
    account.status === "connected"
      ? "Connected"
      : account.status === "expired"
        ? "Token Expired"
        : "Error";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Server className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{account.label}</h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                {statusIcon}
                <span>{statusLabel}</span>
                {account.hasToken && (
                  <span className="text-muted-foreground/50">· Token: {account.tokenPreview}</span>
                )}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2.5 rounded-md bg-muted/50">
            <div className="text-lg font-semibold">{account.siteCount ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">Total Sites</div>
          </div>
          <div className="text-center p-2.5 rounded-md bg-muted/50">
            <div className="text-lg font-semibold">{account.stagingSiteCount ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">With Staging</div>
          </div>
          <div className="text-center p-2.5 rounded-md bg-muted/50">
            <div className="text-lg font-semibold">
              {account.lastSyncedAt
                ? new Date(account.lastSyncedAt).toLocaleDateString()
                : "Never"}
            </div>
            <div className="text-[11px] text-muted-foreground">Last Sync</div>
          </div>
        </div>

        {/* Error display */}
        {account.lastError && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md p-2.5">
            <span className="font-medium">Error:</span> {account.lastError}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServersPage() {
  const accounts = useQuery(api.rocketAccounts.list);
  const syncAll = useAction(api.sync.syncEverything);
  const [syncing, setSyncing] = useState(false);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await syncAll();
      toast.success(`Synced ${result.sitesSynced} sites, scanned ${result.sitesScanned}${result.errors > 0 ? `, ${result.errors} errors` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rocket.net hosting accounts (managed in Server Management)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync All"}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(SERVER_MANAGEMENT_URL, "_blank")}
            className="gap-2"
          >
            <ExternalLink className="size-4" />
            Manage Credentials
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-800 p-4 flex items-start gap-3">
        <Server className="size-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-indigo-700 dark:text-indigo-300">
            Credentials are managed centrally
          </p>
          <p className="text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
            API keys are now stored in{" "}
            <a
              href={SERVER_MANAGEMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              Server Management
            </a>
            . Credentials sync automatically when you run a site sync.
          </p>
        </div>
      </div>

      {accounts === undefined ? (
        <div className="p-8 text-center text-muted-foreground">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <Server className="size-10 mx-auto text-muted-foreground/50" />
          <div>
            <h3 className="font-semibold">No accounts connected</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add a Rocket.net API key in Server Management, then sync here to start.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={() => window.open(SERVER_MANAGEMENT_URL, "_blank")}
              className="gap-2"
            >
              <ExternalLink className="size-4" />
              Open Server Management
            </Button>
            <Button
              variant="outline"
              onClick={handleSyncAll}
              disabled={syncing}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Credentials"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <AccountCard key={account._id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
