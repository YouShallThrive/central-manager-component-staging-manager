/**
 * Plugin Actions — activate/deactivate plugins on staging sites
 * via the Rocket.net WP-CLI API.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const ROCKET_API_BASE = "https://api.rocket.net/v1";

// ─── Rocket.net API Helpers ──────────────────────────────────

async function getAccountToken(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  accountId: string,
): Promise<string> {
  const account = await ctx.runQuery(internal.rocketAccounts.get, { id: accountId });
  if (!account) throw new Error("Rocket.net account not found.");
  if (!account.apiToken) throw new Error(`No API token for account "${account.label}".`);
  return account.apiToken;
}

async function rocketWpCli(
  token: string,
  siteId: number,
  command: string,
): Promise<{ success: boolean; output: string }> {
  const url = `${ROCKET_API_BASE}/sites/${siteId}/wpcli`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command }),
  });

  const text = await resp.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { output: text };
  }

  if (!resp.ok) {
    // Extract error message from API response
    const errMsg = body?.messages?.join(", ") || body?.message || body?.error || text || `HTTP ${resp.status}`;
    return { success: false, output: errMsg };
  }

  // Rocket.net WP-CLI returns { result: { output: "..." } }
  const output = body?.result?.output ?? body?.output ?? JSON.stringify(body);
  return { success: true, output: String(output) };
}

// ─── Public Actions ─────────────────────────────────────────

export const togglePlugin = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
    pluginSlug: v.string(),
    activate: v.boolean(), // true = activate, false = deactivate
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);
    const verb = args.activate ? "activate" : "deactivate";
    const command = `plugin ${verb} ${args.pluginSlug}`;

    try {
      const result = await rocketWpCli(token, args.stagingId, command);

      if (!result.success) {
        await ctx.runMutation(internal.actionLogs.add, {
          siteId: args.siteId,
          action: `plugin_${verb}`,
          details: `Failed to ${verb} "${args.pluginSlug}": ${result.output}`,
          status: "error",
        });
        return { success: false, error: result.output };
      }

      // Update the plugin record in the database
      await ctx.runMutation(internal.sitePlugins.updateStatus, {
        siteId: args.siteId,
        slug: args.pluginSlug,
        status: args.activate ? "active" : "inactive",
      });

      // Update the site's plugin summary
      await ctx.runMutation(internal.sites.recalcPluginSummary, {
        siteId: args.siteId,
      });

      // Log success
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: `plugin_${verb}`,
        details: `Plugin "${args.pluginSlug}" ${verb}d successfully`,
        status: "success",
      });

      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: `plugin_${verb}`,
        details: `Error ${verb}ing "${args.pluginSlug}": ${errorMsg}`,
        status: "error",
      });
      return { success: false, error: errorMsg };
    }
  },
});

// Bulk toggle — activate or deactivate multiple plugins at once
export const bulkTogglePlugins = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
    pluginSlugs: v.array(v.string()),
    activate: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    succeeded: v.array(v.string()),
    failed: v.array(v.object({ slug: v.string(), error: v.string() })),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);
    const verb = args.activate ? "activate" : "deactivate";

    const succeeded: string[] = [];
    const failed: Array<{ slug: string; error: string }> = [];

    for (const slug of args.pluginSlugs) {
      const command = `plugin ${verb} ${slug}`;
      try {
        const result = await rocketWpCli(token, args.stagingId, command);
        if (result.success) {
          // Update DB record
          await ctx.runMutation(internal.sitePlugins.updateStatus, {
            siteId: args.siteId,
            slug,
            status: args.activate ? "active" : "inactive",
          });
          succeeded.push(slug);
        } else {
          failed.push({ slug, error: result.output });
        }
      } catch (e) {
        failed.push({ slug, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Recalculate site summary after bulk action
    await ctx.runMutation(internal.sites.recalcPluginSummary, {
      siteId: args.siteId,
    });

    // Log the bulk action
    const details = `Bulk ${verb}: ${succeeded.length} succeeded, ${failed.length} failed` +
      (failed.length > 0 ? ` — Failed: ${failed.map(f => f.slug).join(", ")}` : "");
    await ctx.runMutation(internal.actionLogs.add, {
      siteId: args.siteId,
      action: `bulk_plugin_${verb}`,
      details,
      status: failed.length > 0 ? "error" : "success",
    });

    return {
      success: failed.length === 0,
      succeeded,
      failed,
    };
  },
});

// ─── Deactivate All "To Fix" Plugins for a Single Site ──────

async function getTokenForSite(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  accountId?: string,
): Promise<string> {
  if (accountId) {
    return await getAccountToken(ctx, accountId);
  }
  // Fallback: first account with a token
  const accounts = await ctx.runQuery(internal.rocketAccounts.listAll, {});
  const withToken = accounts.find((a: any) => a.apiToken);
  if (!withToken) throw new Error("No Rocket.net accounts configured.");
  return withToken.apiToken;
}

export const deactivateAllForSite = action({
  args: {
    siteId: v.id("sites"),
  },
  returns: v.object({
    success: v.boolean(),
    deactivated: v.number(),
    failed: v.number(),
    total: v.number(),
    errors: v.array(v.object({ slug: v.string(), error: v.string() })),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    deactivated: number;
    failed: number;
    total: number;
    errors: Array<{ slug: string; error: string }>;
  }> => {
    // 1. Get site info
    const site: any = await ctx.runQuery(internal.sites.getInternal, { siteId: args.siteId });
    if (!site) throw new Error("Site not found");

    // 2. Get plugins that need deactivation
    const plugins: Array<{ slug: string; displayName?: string }> = await ctx.runQuery(
      internal.sitePlugins.listActiveToDeactivate,
      { siteId: args.siteId },
    );

    if (plugins.length === 0) {
      return { success: true, deactivated: 0, failed: 0, total: 0, errors: [] };
    }

    // 3. Get API token
    const token = await getTokenForSite(ctx, site.accountId as string | undefined);

    // 4. Deactivate each plugin via WP-CLI
    let deactivated = 0;
    const errors: Array<{ slug: string; error: string }> = [];

    for (const plugin of plugins) {
      try {
        const result = await rocketWpCli(token, site.stagingId, `plugin deactivate ${plugin.slug}`);
        if (result.success) {
          await ctx.runMutation(internal.sitePlugins.updateStatus, {
            siteId: args.siteId,
            slug: plugin.slug,
            status: "inactive",
          });
          deactivated++;
        } else {
          errors.push({ slug: plugin.slug, error: result.output });
        }
      } catch (e) {
        errors.push({ slug: plugin.slug, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 5. Recalculate plugin summary
    await ctx.runMutation(internal.sites.recalcPluginSummary, { siteId: args.siteId });

    // 6. Log result
    const details = `Deactivated ${deactivated}/${plugins.length} plugins` +
      (errors.length > 0 ? ` — Failed: ${errors.map((e) => e.slug).join(", ")}` : "");
    await ctx.runMutation(internal.actionLogs.add, {
      siteId: args.siteId,
      action: "deactivate_all",
      details,
      status: errors.length > 0 ? "error" : "success",
    });

    return {
      success: errors.length === 0,
      deactivated,
      failed: errors.length,
      total: plugins.length,
      errors,
    };
  },
});
