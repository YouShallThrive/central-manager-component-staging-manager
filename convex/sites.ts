import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

const siteReturnValidator = v.object({
  _id: v.id("sites"),
  _creationTime: v.number(),
  accountId: v.optional(v.id("rocketAccounts")),
  stagingId: v.number(),
  productionId: v.optional(v.number()),
  productionDomain: v.string(),
  stagingDomain: v.optional(v.string()),
  rocketUrl: v.optional(v.string()),
  status: v.union(
    v.literal("unprepped"),
    v.literal("prepped"),
    v.literal("in_progress"),
    v.literal("error"),
  ),
  preppedAt: v.optional(v.number()),
  preppedNote: v.optional(v.string()),
  firstSeen: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  pluginSummary: v.optional(
    v.object({
      total: v.number(),
      active: v.number(),
      inactive: v.number(),
      shouldDeactivate: v.number(),
      alreadyHandled: v.number(),
    }),
  ),
  guardInstalled: v.optional(v.boolean()),
  muPluginIssues: v.optional(v.number()),
  httpAuthEnabled: v.optional(v.boolean()),
  httpAuthUsername: v.optional(v.string()),
  httpAuthPassword: v.optional(v.string()),
  wpDebug: v.optional(v.boolean()),
  wpDebugLog: v.optional(v.boolean()),
  wpDebugCheckedAt: v.optional(v.number()),
  asanaProjectId: v.optional(v.string()),
  asanaProjectName: v.optional(v.string()),
  asanaStageSectionId: v.optional(v.string()),
  lastDiffAt: v.optional(v.number()),
  lastDiffInSync: v.optional(v.boolean()),
  lastBackupLabel: v.optional(v.string()),
  lastBackupAt: v.optional(v.number()),
  phpVersion: v.optional(v.string()),
  productionPhpVersion: v.optional(v.string()),
  phpCheckedAt: v.optional(v.number()),
});

// List all sites with optional filtering
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("unprepped"),
        v.literal("prepped"),
        v.literal("in_progress"),
        v.literal("error"),
      ),
    ),
    search: v.optional(v.string()),
    accountId: v.optional(v.id("rocketAccounts")),
  },
  returns: v.array(siteReturnValidator),
  handler: async (ctx, args) => {
    let sites;
    if (args.accountId) {
      sites = await ctx.db
        .query("sites")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .collect();
      // Apply status filter client-side if both filters active
      if (args.status) {
        sites = sites.filter((s) => s.status === args.status);
      }
    } else if (args.status) {
      sites = await ctx.db
        .query("sites")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      sites = await ctx.db.query("sites").collect();
    }

    // Client-side search filter
    if (args.search) {
      const needle = args.search.toLowerCase();
      sites = sites.filter(
        (s) =>
          s.productionDomain.toLowerCase().includes(needle) ||
          (s.stagingDomain && s.stagingDomain.toLowerCase().includes(needle)) ||
          String(s.stagingId).includes(needle),
      );
    }

    // Sort by production domain
    sites.sort((a, b) =>
      a.productionDomain.localeCompare(b.productionDomain),
    );

    return sites;
  },
});

// Get a single site by ID
export const get = query({
  args: { id: v.id("sites") },
  returns: v.union(siteReturnValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get stats overview
export const stats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    prepped: v.number(),
    unprepped: v.number(),
    inProgress: v.number(),
    error: v.number(),
    withPluginIssues: v.number(),
    withMuIssues: v.number(),
    guardInstalled: v.number(),
    debugOn: v.number(),
    statuscakeUp: v.number(),
    statuscakeDown: v.number(),
  }),
  handler: async (ctx) => {
    const allSites = await ctx.db.query("sites").collect();
    return {
      total: allSites.length,
      prepped: allSites.filter((s) => s.status === "prepped").length,
      unprepped: allSites.filter((s) => s.status === "unprepped").length,
      inProgress: allSites.filter((s) => s.status === "in_progress").length,
      error: allSites.filter((s) => s.status === "error").length,
      withPluginIssues: allSites.filter(
        (s) => (s.pluginSummary?.shouldDeactivate ?? 0) > 0,
      ).length,
      withMuIssues: allSites.filter((s) => (s.muPluginIssues ?? 0) > 0).length,
      guardInstalled: allSites.filter((s) => s.guardInstalled === true).length,
      debugOn: allSites.filter((s) => s.wpDebug === true).length,
      statuscakeUp: allSites.filter((s) => s.statuscakeStatus === "up").length,
      statuscakeDown: allSites.filter((s) => s.statuscakeStatus === "down").length,
    };
  },
});

// Upsert a site from sync data
export const upsert = internalMutation({
  args: {
    accountId: v.optional(v.id("rocketAccounts")),
    stagingId: v.number(),
    productionId: v.optional(v.number()),
    productionDomain: v.string(),
    stagingDomain: v.optional(v.string()),
    rocketUrl: v.optional(v.string()),
    status: v.union(
      v.literal("unprepped"),
      v.literal("prepped"),
      v.literal("in_progress"),
      v.literal("error"),
    ),
    pluginSummary: v.optional(
      v.object({
        total: v.number(),
        active: v.number(),
        inactive: v.number(),
        shouldDeactivate: v.number(),
        alreadyHandled: v.number(),
      }),
    ),
    guardInstalled: v.optional(v.boolean()),
    muPluginIssues: v.optional(v.number()),
    httpAuthEnabled: v.optional(v.boolean()),
    preppedNote: v.optional(v.string()),
    preppedAt: v.optional(v.number()),
  },
  returns: v.id("sites"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sites")
      .withIndex("by_staging_id", (q) => q.eq("stagingId", args.stagingId))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = {
        lastSyncedAt: now,
      };
      // Only overwrite fields if non-empty values provided
      if (args.accountId !== undefined) patch.accountId = args.accountId;
      if (args.productionDomain) patch.productionDomain = args.productionDomain;
      if (args.productionId !== undefined) patch.productionId = args.productionId;
      if (args.stagingDomain !== undefined) patch.stagingDomain = args.stagingDomain;
      if (args.rocketUrl !== undefined) patch.rocketUrl = args.rocketUrl;
      patch.status = args.status;
      if (args.pluginSummary !== undefined) patch.pluginSummary = args.pluginSummary;
      if (args.guardInstalled !== undefined) patch.guardInstalled = args.guardInstalled;
      if (args.muPluginIssues !== undefined) patch.muPluginIssues = args.muPluginIssues;
      if (args.httpAuthEnabled !== undefined) patch.httpAuthEnabled = args.httpAuthEnabled;
      if (args.preppedNote) patch.preppedNote = args.preppedNote;
      if (args.preppedAt) patch.preppedAt = args.preppedAt;

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("sites", {
      accountId: args.accountId,
      stagingId: args.stagingId,
      productionId: args.productionId,
      productionDomain: args.productionDomain,
      stagingDomain: args.stagingDomain,
      rocketUrl: args.rocketUrl,
      status: args.status,
      pluginSummary: args.pluginSummary,
      guardInstalled: args.guardInstalled,
      muPluginIssues: args.muPluginIssues,
      httpAuthEnabled: args.httpAuthEnabled,
      firstSeen: now,
      lastSyncedAt: now,
      preppedNote: args.preppedNote,
      preppedAt: args.preppedAt,
    });
  },
});

// Update site status
export const updateStatus = mutation({
  args: {
    id: v.id("sites"),
    status: v.union(
      v.literal("unprepped"),
      v.literal("prepped"),
      v.literal("in_progress"),
      v.literal("error"),
    ),
    preppedNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.preppedNote ? { preppedNote: args.preppedNote } : {}),
      ...(args.status === "prepped" ? { preppedAt: Date.now() } : {}),
    });
    return null;
  },
});

// Recalculate plugin summary from current sitePlugins data
export const recalcPluginSummary = internalMutation({
  args: {
    siteId: v.id("sites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plugins = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    const total = plugins.length;
    const active = plugins.filter((p) => p.status === "active").length;
    const inactive = plugins.filter((p) => p.status === "inactive").length;
    const shouldDeactivate = plugins.filter(
      (p) => p.inDeactivateList && p.status === "active",
    ).length;
    const alreadyHandled = plugins.filter(
      (p) => p.inDeactivateList && p.status === "inactive",
    ).length;

    const muPlugins = await ctx.db
      .query("siteMuPlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();
    const guardInstalled = muPlugins.some((m) => m.isGuard);
    const muPluginIssues = muPlugins.filter(
      (m) => m.inRemoveList && m.present,
    ).length;
    const isPrepped =
      shouldDeactivate === 0 && muPluginIssues === 0 && guardInstalled;

    await ctx.db.patch(args.siteId, {
      pluginSummary: { total, active, inactive, shouldDeactivate, alreadyHandled },
      status: isPrepped ? "prepped" : "unprepped",
    });

    return null;
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sites").collect();
  },
});

// Get a single site by ID (internal — for actions)
export const getInternal = internalQuery({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.siteId);
  },
});

// Flag site entries whose stagingId no longer exists in Rocket.net.
// Records are NEVER deleted automatically — only a person removes a site.
export const flagMissingSites = internalMutation({
  args: {
    validStagingIds: v.array(v.number()),
    accountId: v.optional(v.id("rocketAccounts")),
  },
  returns: v.object({ flagged: v.number(), cleared: v.number() }),
  handler: async (ctx, args) => {
    const validSet = new Set(args.validStagingIds);

    let allSites;
    if (args.accountId) {
      allSites = await ctx.db
        .query("sites")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .collect();
    } else {
      allSites = await ctx.db.query("sites").collect();
    }

    let flagged = 0;
    let cleared = 0;
    for (const site of allSites) {
      if (!validSet.has(site.stagingId)) {
        if (site.rocketStatus !== "missing") {
          await ctx.db.patch(site._id, {
            rocketStatus: "missing",
            rocketMissingSince: site.rocketMissingSince ?? Date.now(),
          });
        }
        flagged++;
      } else if (site.rocketStatus === "missing") {
        await ctx.db.patch(site._id, { rocketStatus: "ok", rocketMissingSince: undefined });
        cleared++;
      }
    }

    return { flagged, cleared };
  },
});


/**
 * Human-initiated removal of a site record. Sync never deletes records — a
 * site missing from Rocket.net is flagged and stays visible until someone
 * explicitly removes it here.
 */
export const removeSite = mutation({
  args: { siteId: v.id("sites") },
  returns: v.null(),
  handler: async (ctx, { siteId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plugins = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    for (const p of plugins) await ctx.db.delete(p._id);

    const muPlugins = await ctx.db
      .query("siteMuPlugins")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    for (const m of muPlugins) await ctx.db.delete(m._id);
    await ctx.db.delete(siteId);
    return null;
  },
});
