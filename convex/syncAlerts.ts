/**
 * Sync Alerts — daily check for out-of-sync staging sites.
 *
 * Runs content diffs across all sites and sends Slack webhook
 * notifications when sites are out of sync with production.
 * Also provides a dashboard query for sync status overview.
 */
import { v } from "convex/values";
import { action, query, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

// ─── Dashboard Queries ──────────────────────────────────────

export const getSyncOverview = query({
  args: {},
  returns: v.object({
    totalSites: v.number(),
    checkedSites: v.number(),
    inSyncSites: v.number(),
    outOfSyncSites: v.number(),
    neverChecked: v.number(),
  }),
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    let checkedSites = 0;
    let inSyncSites = 0;
    let outOfSyncSites = 0;

    for (const site of sites) {
      if (site.lastDiffAt !== undefined) {
        checkedSites++;
        if (site.lastDiffInSync) {
          inSyncSites++;
        } else {
          outOfSyncSites++;
        }
      }
    }

    return {
      totalSites: sites.length,
      checkedSites,
      inSyncSites,
      outOfSyncSites,
      neverChecked: sites.length - checkedSites,
    };
  },
});

export const getOutOfSyncSites = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sites"),
      productionDomain: v.string(),
      lastDiffAt: v.optional(v.number()),
      lastDiffInSync: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    return sites
      .filter((s) => s.lastDiffInSync === false)
      .map((s) => ({
        _id: s._id,
        productionDomain: s.productionDomain,
        lastDiffAt: s.lastDiffAt,
        lastDiffInSync: s.lastDiffInSync,
      }));
  },
});

// ─── Manual "Check Sync" Action ─────────────────────────────

export const checkSiteSync = action({
  args: {
    siteId: v.id("sites"),
    productionId: v.number(),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    inSync: v.optional(v.boolean()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const result: { success: boolean; inSync?: boolean; error?: string } =
        await ctx.runAction(api.contentDiff.runDiff, {
          siteId: args.siteId,
          productionId: args.productionId,
          stagingId: args.stagingId,
          accountId: args.accountId,
        });

      return {
        success: result.success,
        inSync: result.inSync,
        error: result.error,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
});

// ─── Bulk Check (for cron / manual) ─────────────────────────

export const checkAllSync = action({
  args: {},
  returns: v.object({
    checked: v.number(),
    inSync: v.number(),
    outOfSync: v.number(),
    errors: v.number(),
    outOfSyncDomains: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const sites = await ctx.runQuery(internal.sites.listAll);
    let checked = 0;
    let inSync = 0;
    let outOfSync = 0;
    let errors = 0;
    const outOfSyncDomains: string[] = [];

    for (const site of sites) {
      if (!site.productionId || !site.accountId) continue;

      try {
        const result: { success: boolean; inSync?: boolean; error?: string } =
          await ctx.runAction(api.contentDiff.runDiff, {
            siteId: site._id,
            productionId: site.productionId,
            stagingId: site.stagingId,
            accountId: site.accountId,
          });

        checked++;
        if (result.success) {
          if (result.inSync) {
            inSync++;
          } else {
            outOfSync++;
            outOfSyncDomains.push(site.productionDomain);
          }
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    // Send Slack notification if any out of sync
    if (outOfSyncDomains.length > 0) {
      // Try fetching webhook from Integrations component first
      let webhookUrl: string | null = null;
      const intUrl = process.env.INTEGRATIONS_URL;
      const secret = process.env.SSO_SHARED_SECRET;
      if (intUrl && secret) {
        try {
          const resp = await fetch(`${intUrl}/api/credentials?integration=slack-webhook`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
          if (resp.ok) {
            const data = (await resp.json()) as { values: { key: string; value: string }[] };
            webhookUrl = data.values?.find((v: { key: string }) => v.key === "webhook_url")?.value ?? null;
          }
        } catch {
          // Fall through to local settings
        }
      }

      // Fallback: local settings
      if (!webhookUrl) {
        webhookUrl = await ctx.runQuery(internal.settings.getInternal, {
          key: "slack_webhook_url",
        });
      }

      if (webhookUrl) {
        try {
          const domainList = outOfSyncDomains.slice(0, 20).map((d) => `• ${d}`).join("\n");
          const appUrl = process.env.APP_URL || "https://central.ystvps.com";
          const text =
            `🔄 *Staging Sync Alert*\n` +
            `${outOfSync} of ${checked} staging site${outOfSync > 1 ? "s are" : " is"} out of sync with production:\n\n` +
            `${domainList}` +
            (outOfSyncDomains.length > 20 ? `\n...and ${outOfSyncDomains.length - 20} more` : "") +
            `\n\n<${appUrl}/dashboard|View Dashboard>`;

          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
        } catch {
          // Slack notification failed, but don't fail the whole check
        }
      }
    }

    await ctx.runMutation(internal.actionLogs.add, {
      action: "sync_check_all",
      details: `Sync check complete: ${checked} checked, ${inSync} in sync, ${outOfSync} out of sync, ${errors} errors`,
      status: outOfSync > 0 ? "info" : "success",
    });

    return { checked, inSync, outOfSync, errors, outOfSyncDomains };
  },
});

// ─── Cron Handler ────────────────────────────────────────────

export const dailySyncCheck = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Only run if there are sites configured
    const sites = await ctx.runQuery(internal.sites.listAll);
    if (sites.length === 0) return null;

    try {
      await ctx.runAction(api.syncAlerts.checkAllSync, {});
    } catch (e) {
      await ctx.runMutation(internal.actionLogs.add, {
        action: "daily_sync_check",
        details: `Daily sync check failed: ${e instanceof Error ? e.message : String(e)}`,
        status: "error",
      });
    }

    return null;
  },
});
