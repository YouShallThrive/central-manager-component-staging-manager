/**
 * Sync actions — pull staging site data directly from Rocket.net API.
 *
 * Uses a Rocket.net API token stored in the settings table.
 * API docs: https://api.rocket.net/v1
 */
import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const ROCKET_API_BASE = "https://api.rocket.net/v1";

// Plugin categorization maps (must match stage_prep.py)
const DEACTIVATE_PLUGINS = new Set([
  // Tracking / Analytics
  "google-site-kit",
  "google-analytics-for-wordpress",
  "google-analytics-dashboard-for-wp",
  "exactmetrics",
  "analytify",
  "facebook-for-wordpress",
  "official-facebook-pixel",
  "insert-headers-and-footers",
  "wpcode-premium",
  "header-footer-code-manager",
  "accessibe",
  "accesswidget",
  "google-listings-and-ads",
  "nimbata-call-tracking",
  "hubspot",
  "hubspot-all-in-one-marketing",
  "google-tag-manager",
  // Management / Security
  "wordfence",
  "wordfence-assistant",
  "worker",
  "updraftplus",
  "wp-health",
  "malcare-security",
  "jetpack",
  "sucuri-scanner",
  "ithemes-security",
  "better-wp-security",
  "all-in-one-wp-security-and-firewall",
  "wpvivid-backup-plugin",
  "backwpup",
  "patchstack",
  // Email / SMTP
  "yaysmtp",
  "yaysmtp-pro",
  "wp-mail-smtp",
  "wp-mail-smtp-pro",
  "fluent-smtp",
  "post-smtp",
  "smtp-mailer",
  "easy-wp-smtp",
  "bnfw",
]);

const TRACKING_PLUGINS = new Set([
  "google-site-kit",
  "google-analytics-for-wordpress",
  "google-analytics-dashboard-for-wp",
  "exactmetrics",
  "analytify",
  "facebook-for-wordpress",
  "official-facebook-pixel",
  "insert-headers-and-footers",
  "wpcode-premium",
  "header-footer-code-manager",
  "accessibe",
  "accesswidget",
  "google-listings-and-ads",
  "nimbata-call-tracking",
  "hubspot",
  "hubspot-all-in-one-marketing",
  "google-tag-manager",
]);

const MANAGEMENT_PLUGINS = new Set([
  "wordfence",
  "wordfence-assistant",
  "worker",
  "updraftplus",
  "wp-health",
  "malcare-security",
  "jetpack",
  "sucuri-scanner",
  "ithemes-security",
  "better-wp-security",
  "all-in-one-wp-security-and-firewall",
  "wpvivid-backup-plugin",
  "backwpup",
  "patchstack",
]);

const EMAIL_PLUGINS = new Set([
  "yaysmtp",
  "yaysmtp-pro",
  "wp-mail-smtp",
  "wp-mail-smtp-pro",
  "fluent-smtp",
  "post-smtp",
  "smtp-mailer",
  "easy-wp-smtp",
  "bnfw",
]);

const KEEP_PLUGINS = new Set(["wordpress-seo", "contact-form-7"]);

const REMOVE_MU_PLUGINS = new Set([
  "0-worker.php",
  "0-developer.php",
  "InitUmbrella.php",
  "_patchstack.php",
]);

const GUARD_FILENAME = "yst-staging-guard.php";

function categorizePlugin(
  slug: string,
): "tracking" | "management" | "email" | "keep" | "other" {
  if (KEEP_PLUGINS.has(slug)) return "keep";
  if (TRACKING_PLUGINS.has(slug)) return "tracking";
  if (MANAGEMENT_PLUGINS.has(slug)) return "management";
  if (EMAIL_PLUGINS.has(slug)) return "email";
  return "other";
}

// Direct Rocket.net API call
// Retry once on 401 — Rocket.net occasionally returns a transient 401 mid-sync.
async function rocketFetch(url: string, init: RequestInit): Promise<Response> {
  const resp = await fetch(url, init);
  if (resp.status !== 401) return resp;
  await new Promise((r) => setTimeout(r, 1500));
  return await fetch(url, init);
}

async function rocketGet(
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(`${ROCKET_API_BASE}${path}`);
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      url.searchParams.set(k, val);
    }
  }

  const resp = await rocketFetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      throw new Error(
        `Sync error (401 from Rocket.net). Check the sync logs for details.`,
      );
    }
    if (resp.status === 403) {
      throw new Error(
        `Sync error (403 from Rocket.net). Check the sync logs for details.`,
      );
    }
    const text = await resp.text();
    // Try to extract messages from JSON response
    try {
      const json = JSON.parse(text);
      if (json.messages?.length) {
        throw new Error(`Rocket.net error: ${json.messages.join(", ")}`);
      }
    } catch {
      // not JSON, use raw text
    }
    throw new Error(`Sync error (${resp.status} from Rocket.net). Check the sync logs for details.`);
  }

  return (await resp.json()) as Record<string, unknown>;
}

// Direct Rocket.net API POST call (for WP-CLI etc.)
async function rocketPost(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${ROCKET_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Rocket.net POST error (${resp.status})`);
  }

  return (await resp.json()) as Record<string, unknown>;
}

// Fetch all sites (paginated)
async function fetchAllSites(
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const allSites: Array<Record<string, unknown>> = [];
  let page = 1;

  while (true) {
    const body = await rocketGet(token, "/sites", {
      page: String(page),
      per_page: "100",
    });
    const sites = (body.result ?? []) as Array<Record<string, unknown>>;
    allSites.push(...sites);
    if (sites.length < 100) break;
    page++;
  }

  return allSites;
}

// Fetch plugins for a site
async function fetchSitePlugins(
  token: string,
  siteId: number,
): Promise<Array<Record<string, unknown>>> {
  const body = await rocketGet(token, `/sites/${siteId}/plugins`);
  return (body.result ?? []) as Array<Record<string, unknown>>;
}

// Fetch MU-plugin files for a site
async function fetchMuPlugins(
  token: string,
  siteId: number,
): Promise<Array<Record<string, unknown>>> {
  const body = await rocketGet(token, `/sites/${siteId}/files`, {
    path: "/wp-content/mu-plugins",
  });
  const result = (body.result ?? body) as Record<string, unknown>;
  return (result.files ?? []) as Array<Record<string, unknown>>;
}

// Helper to get token for an account
async function getAccountToken(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  accountId: string,
): Promise<string> {
  const account = await ctx.runQuery(internal.rocketAccounts.get, { id: accountId });
  if (!account) {
    throw new Error("Rocket.net account not found.");
  }
  if (!account.apiToken) {
    throw new Error(`No API token configured for account "${account.label}".`);
  }
  return account.apiToken;
}

// Helper to get the stored API token (legacy fallback for single-account mode)
async function getToken(ctx: { runQuery: (ref: any, args: any) => Promise<any> }): Promise<string> {
  // Try accounts first
  const accounts = await ctx.runQuery(internal.rocketAccounts.listAll, {});
  if (accounts.length > 0 && accounts[0].apiToken) {
    return accounts[0].apiToken;
  }
  // Legacy fallback
  const token = await ctx.runQuery(internal.settings.getInternal, {
    key: "rocket_api_token",
  });
  if (!token) {
    throw new Error("No Rocket.net accounts configured. Go to Servers to add an account.");
  }
  return token;
}

// ─── Public Actions (callable from UI) ────────────────────────

// Sync all staging sites (metadata only, fast)
export const syncAllSites = action({
  args: {},
  returns: v.object({
    synced: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    // Pull latest credentials from Server Management first
    const credResult = await ctx.runAction(internal.credentialSync.pullFromServerManagement, {});
    if (credResult.error) {
      console.warn("Credential sync warning:", credResult.error);
    }
    const token = await getToken(ctx);
    let synced = 0;
    let errors = 0;

    try {
      const allSites = await fetchAllSites(token);

      // Find sites with staging
      const stagingSites = allSites.filter((s) => {
        const staging = s.staging as Record<string, unknown> | undefined;
        return staging?.staging_id;
      });

      for (const site of stagingSites) {
        try {
          const staging = site.staging as Record<string, number>;
          const stagingId = staging.staging_id;

          await ctx.runMutation(internal.sites.upsert, {
            stagingId,
            productionId: site.id as number,
            productionDomain: (site.domain as string) ?? "unknown",
            rocketUrl: site.rocket_url as string | undefined,
            status: "unprepped",
          });
          synced++;
        } catch (e) {
          errors++;
          console.error("Failed to upsert site:", e);
        }
      }

      await ctx.runMutation(internal.actionLogs.add, {
        action: "sync_sites",
        details: `Synced ${synced} staging sites from Rocket.net (${errors} errors)`,
        status: errors > 0 ? "error" : "success",
      });
    } catch (e) {
      await ctx.runMutation(internal.actionLogs.add, {
        action: "sync_sites",
        details: `Failed to sync: ${e instanceof Error ? e.message : String(e)}`,
        status: "error",
      });
      throw e;
    }

    return { synced, errors };
  },
});

// Sync detailed plugin/MU-plugin data for a single site
export const syncSiteDetail = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.optional(v.id("rocketAccounts")),
  },
  returns: v.object({
    pluginCount: v.number(),
    muPluginCount: v.number(),
    shouldDeactivate: v.number(),
    guardInstalled: v.boolean(),
    muPluginIssues: v.number(),
    httpAuthEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const token = args.accountId
      ? await getAccountToken(ctx, args.accountId as string)
      : await getToken(ctx);
    return await scanSitePlugins(ctx, token, args.siteId as any, args.stagingId, args.accountId as string | undefined);
  },
});

// ─── Progress Tracking Helpers ────────────────────────────────

async function setProgress(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  progress: {
    status: "syncing" | "idle" | "error" | "done";
    phase: string;
    total: number;
    completed: number;
    currentSite?: string;
    errors: number;
    errorSites?: string[];
    startedAt?: number;
  },
) {
  await ctx.runMutation(internal.settings.setInternal, {
    key: "sync_progress",
    value: JSON.stringify(progress),
  });
}

// ─── Shared scan logic ───────────────────────────────────────

const AUTH_MU_FILENAME = "yst-staging-auth.php";

// Fetch staging site domain from its detail endpoint
async function fetchStagingDomain(
  token: string,
  stagingId: number,
): Promise<string | undefined> {
  try {
    const body = await rocketGet(token, `/sites/${stagingId}`);
    const result = (body.result ?? body) as Record<string, unknown>;
    return (result.domain as string) || (result.display_domain as string) || undefined;
  } catch {
    return undefined;
  }
}

async function scanSitePlugins(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  token: string,
  docId: string,
  stagingId: number,
  accountId?: string,
) {
  // Fetch staging site domain (staging sites don't appear in the /sites list)
  const stagingDomain = await fetchStagingDomain(token, stagingId);

  // Check WP_DEBUG status via WP-CLI (best-effort, non-blocking)
  try {
    const debugChecks = await Promise.allSettled([
      rocketPost(token, `/sites/${stagingId}/wpcli`, { command: "config get WP_DEBUG" }),
      rocketPost(token, `/sites/${stagingId}/wpcli`, { command: "config get WP_DEBUG_LOG" }),
    ]);

    let wpDebug = false;
    let wpDebugLog = false;

    if (debugChecks[0].status === "fulfilled") {
      const resp = debugChecks[0].value;
      const val = (resp.result as any)?.response;
      if (val) {
        try {
          const parsed = JSON.parse(val);
          const d = parsed?.data;
          wpDebug = d === "1" || d === "true" || d === true || d === 1;
        } catch { /* not defined or parse error — treat as false */ }
      }
    }
    if (debugChecks[1].status === "fulfilled") {
      const resp = debugChecks[1].value;
      const val = (resp.result as any)?.response;
      if (val) {
        try {
          const parsed = JSON.parse(val);
          const d = parsed?.data;
          wpDebugLog = d === "1" || d === "true" || d === true || d === 1;
        } catch { /* not defined or parse error — treat as false */ }
      }
    }

    await ctx.runMutation(internal.sync.updateWpDebugStatus, {
      siteId: docId as any,
      wpDebug,
      wpDebugLog,
    });
  } catch {
    // WP_DEBUG check is best-effort — don't fail the whole scan
  }

  // Fetch plugins
  const rawPlugins = await fetchSitePlugins(token, stagingId);
  const plugins = rawPlugins.map((p) => {
    const slug = (p.name as string) ?? "";
    const status = (p.status as string) ?? "inactive";
    return {
      slug,
      displayName: (p.title as string) ?? slug,
      status:
        status === "must-use"
          ? ("must-use" as const)
          : status === "active"
            ? ("active" as const)
            : ("inactive" as const),
      category: categorizePlugin(slug),
      inDeactivateList: DEACTIVATE_PLUGINS.has(slug),
      version: p.version as string | undefined,
      updateAvailable:
        p.update !== "none" &&
        p.update !== undefined &&
        p.update !== null &&
        p.update !== "",
    };
  });

  // Fetch MU-plugins
  let rawMuPlugins: Array<Record<string, unknown>> = [];
  try {
    rawMuPlugins = await fetchMuPlugins(token, stagingId);
  } catch {
    /* ignore */
  }

  const muPlugins = rawMuPlugins.map((f) => {
    const filename = (f.file as string) ?? (f.name as string) ?? "";
    return {
      filename,
      present: true,
      inRemoveList: REMOVE_MU_PLUGINS.has(filename),
      isGuard: filename === GUARD_FILENAME,
    };
  });

  // Stats
  const activePlugins = plugins.filter((p) => p.status === "active");
  const shouldDeactivate = activePlugins.filter(
    (p) => p.inDeactivateList,
  ).length;
  const alreadyHandled = plugins.filter(
    (p) => p.inDeactivateList && p.status === "inactive",
  ).length;
  const guardInstalled = muPlugins.some((m) => m.isGuard);
  const httpAuthEnabled = muPlugins.some((m) => m.filename === AUTH_MU_FILENAME);
  const muPluginIssues = muPlugins.filter(
    (m) => m.inRemoveList && m.present,
  ).length;
  const isPrepped =
    shouldDeactivate === 0 && muPluginIssues === 0 && guardInstalled;

  // Save
  await ctx.runMutation(internal.sitePlugins.batchUpsert, {
    siteId: docId as any,
    plugins,
  });
  await ctx.runMutation(internal.siteMuPlugins.batchUpsert, {
    siteId: docId as any,
    muPlugins,
  });
  await ctx.runMutation(internal.sites.upsert, {
    accountId: accountId as any,
    stagingId,
    productionDomain: "",
    stagingDomain,
    status: isPrepped ? "prepped" : "unprepped",
    pluginSummary: {
      total: plugins.length,
      active: activePlugins.length,
      inactive: plugins.filter((p) => p.status === "inactive").length,
      shouldDeactivate,
      alreadyHandled,
    },
    guardInstalled,
    muPluginIssues,
    httpAuthEnabled,
  });

  return {
    pluginCount: plugins.length,
    muPluginCount: muPlugins.length,
    shouldDeactivate,
    guardInstalled,
    muPluginIssues,
    httpAuthEnabled,
  };
}

// ─── Full Sync (sites list + all plugin details) ─────────────

// Sync a specific account
export const syncAccount = action({
  args: { accountId: v.id("rocketAccounts") },
  returns: v.object({
    sitesSynced: v.number(),
    sitesScanned: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);
    return await doFullSync(ctx, token, args.accountId as string);
  },
});

// Sync all accounts (for backward compat and cron)
export const syncEverything = action({
  args: {},
  returns: v.object({
    sitesSynced: v.number(),
    sitesScanned: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    // Pull latest credentials from Server Management first
    const credResult = await ctx.runAction(internal.credentialSync.pullFromServerManagement, {});
    if (credResult.error) {
      console.warn("Credential sync warning:", credResult.error);
    }
    const accounts = await ctx.runQuery(internal.rocketAccounts.listAll, {});

    if (accounts.length > 0) {
      // Multi-account mode: sync all accounts
      let totalSynced = 0;
      let totalScanned = 0;
      let totalErrors = 0;

      for (const account of accounts) {
        if (!account.apiToken) continue;
        try {
          const result = await doFullSync(ctx, account.apiToken, account._id as string);
          totalSynced += result.sitesSynced;
          totalScanned += result.sitesScanned;
          totalErrors += result.errors;
        } catch (e) {
          totalErrors++;
          const errMsg = e instanceof Error ? e.message : String(e);
          const status = errMsg.includes("expired") || errMsg.includes("invalid") ? "expired" : "error";
          await ctx.runMutation(internal.rocketAccounts.updateAfterSync, {
            id: account._id,
            siteCount: account.siteCount ?? 0,
            stagingSiteCount: account.stagingSiteCount ?? 0,
            status,
            lastError: errMsg,
          });
        }
      }

      // PHP version is not in Rocket's site list — it needs one settings call
      // per site, so the sweep runs as a background job after the main sync.
      await ctx.scheduler.runAfter(0, internal.phpVersions.syncBatch, { offset: 0 });

      return { sitesSynced: totalSynced, sitesScanned: totalScanned, errors: totalErrors };
    }

    // Legacy fallback: single token in settings
    const token = await getToken(ctx);
    const legacy = await doFullSync(ctx, token);
    await ctx.scheduler.runAfter(0, internal.phpVersions.syncBatch, { offset: 0 });
    return legacy;
  },
});

async function doFullSync(
  ctx: {
    runMutation: (ref: any, args: any) => Promise<any>;
    runQuery: (ref: any, args: any) => Promise<any>;
  },
  token: string,
  accountId?: string,
) {
    let sitesSynced = 0;
    let sitesScanned = 0;
    let errors = 0;
    const errorSites: string[] = [];
    const startedAt = Date.now();

    try {
      // Phase 1: Fetch sites list
      await setProgress(ctx, {
        status: "syncing",
        phase: accountId ? "Fetching sites list…" : "Fetching sites list from Rocket.net…",
        total: 0,
        completed: 0,
        errors: 0,
        startedAt,
      });

      const allSites = await fetchAllSites(token);
      const stagingSites = allSites.filter((s) => {
        const staging = s.staging as Record<string, unknown> | undefined;
        return staging?.staging_id;
      });

      // Update account stats
      if (accountId) {
        await ctx.runMutation(internal.rocketAccounts.updateAfterSync, {
          id: accountId as any,
          siteCount: allSites.length,
          stagingSiteCount: stagingSites.length,
          status: "connected" as const,
        });
      }

      // Upsert all staging sites
      const siteIds: Array<{
        docId: string;
        stagingId: number;
        domain: string;
      }> = [];
      for (const site of stagingSites) {
        try {
          const staging = site.staging as Record<string, number>;
          const stagingId = staging.staging_id;
          const domain = (site.domain as string) ?? "unknown";
          const docId = await ctx.runMutation(internal.sites.upsert, {
            accountId: accountId as any,
            stagingId,
            productionId: site.id as number,
            productionDomain: domain,
            rocketUrl: site.rocket_url as string | undefined,
            status: "unprepped",
          });
          siteIds.push({ docId, stagingId, domain });
          sitesSynced++;
        } catch (e) {
          errors++;
          console.error("Failed to upsert site:", e);
        }
      }

      // Phase 1b: Clean up stale entries (staging sites deleted/recreated on Rocket.net)
      const validStagingIds = siteIds.map((s) => s.stagingId);
      const cleanup = await ctx.runMutation(internal.sites.deleteStaleSites, {
        validStagingIds,
        ...(accountId ? { accountId: accountId as any } : {}),
      });

      const cleanupNote = cleanup.deleted > 0 ? `, removed ${cleanup.deleted} stale` : "";
      await ctx.runMutation(internal.actionLogs.add, {
        action: "sync_sites",
        details: `Found ${sitesSynced} staging sites${cleanupNote}`,
        status: "info",
      });

      // Phase 2: Scan plugins for each site (with progress)
      const total = siteIds.length;
      for (let i = 0; i < siteIds.length; i++) {
        const { docId, stagingId, domain } = siteIds[i];
        await setProgress(ctx, {
          status: "syncing",
          phase: "Scanning plugins",
          total,
          completed: i,
          currentSite: domain,
          errors,
          errorSites,
          startedAt,
        });

        try {
          await scanSitePlugins(ctx, token, docId, stagingId, accountId);
          sitesScanned++;
        } catch (e) {
          errors++;
          errorSites.push(domain);
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`Failed to scan site ${stagingId} (${domain}):`, errMsg);
          await ctx.runMutation(internal.actionLogs.add, {
            siteId: docId as any,
            action: "scan_error",
            details: `Failed to scan plugins for ${domain}: ${errMsg}`,
            status: "error",
          });
        }
      }

      // Done
      await setProgress(ctx, {
        status: "done",
        phase: "Complete",
        total,
        completed: total,
        errors,
        errorSites,
        startedAt,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        action: "full_sync",
        details: `Full sync complete: ${sitesSynced} sites found, ${sitesScanned} scanned, ${errors} errors`,
        status: errors > 0 ? "error" : "success",
      });

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Sync failed";
      await setProgress(ctx, {
        status: "error",
        phase: errMsg,
        total: 0,
        completed: 0,
        errors: errors + 1,
        startedAt,
      });

      if (accountId) {
        const status = errMsg.includes("expired") || errMsg.includes("invalid") ? "expired" : "error";
        await ctx.runMutation(internal.rocketAccounts.updateAfterSync, {
          id: accountId as any,
          siteCount: 0,
          stagingSiteCount: 0,
          status: status as any,
          lastError: errMsg,
        });
      }
      throw e;
    }

    return { sitesSynced, sitesScanned, errors };
}

// ─── Cron-triggered internal action ───────────────────────────

export const autoSync = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if API token is configured
    const token = await ctx.runQuery(internal.settings.getInternal, {
      key: "rocket_api_token",
    });
    if (!token) return null;

    try {
      const allSites = await fetchAllSites(token);
      const stagingSites = allSites.filter((s) => {
        const staging = s.staging as Record<string, unknown> | undefined;
        return staging?.staging_id;
      });

      let synced = 0;
      let scanned = 0;
      let errors = 0;

      const siteEntries: Array<{ docId: string; stagingId: number }> = [];
      for (const site of stagingSites) {
        try {
          const staging = site.staging as Record<string, number>;
          const stagingId = staging.staging_id;
          const docId = await ctx.runMutation(internal.sites.upsert, {
            stagingId,
            productionId: site.id as number,
            productionDomain: (site.domain as string) ?? "unknown",
            rocketUrl: site.rocket_url as string | undefined,
            status: "unprepped",
          });
          siteEntries.push({ docId, stagingId });
          synced++;
        } catch {
          errors++;
        }
      }

      // Clean up stale entries
      const validIds = siteEntries.map((s) => s.stagingId);
      await ctx.runMutation(internal.sites.deleteStaleSites, { validStagingIds: validIds });

      for (const { docId, stagingId } of siteEntries) {
        try {
          await scanSitePlugins(ctx, token, docId, stagingId);
          scanned++;
        } catch {
          errors++;
        }
      }

      await ctx.runMutation(internal.actionLogs.add, {
        action: "auto_sync",
        details: `Auto-sync: ${synced} sites found, ${scanned} scanned, ${errors} errors`,
        status: errors > 0 ? "error" : "success",
      });
    } catch (e) {
      await ctx.runMutation(internal.actionLogs.add, {
        action: "auto_sync",
        details: `Auto-sync failed: ${e instanceof Error ? e.message : String(e)}`,
        status: "error",
      });
    }

    return null;
  },
});

// ── Update WP_DEBUG status on a staging site ────────────────

export const updateWpDebugStatus = internalMutation({
  args: {
    siteId: v.id("sites"),
    wpDebug: v.boolean(),
    wpDebugLog: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      wpDebug: args.wpDebug,
      wpDebugLog: args.wpDebugLog,
      wpDebugCheckedAt: Date.now(),
    });
    return null;
  },
});
