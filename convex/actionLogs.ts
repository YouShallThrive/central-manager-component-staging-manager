import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

export const listBySite = query({
  args: { siteId: v.id("sites") },
  returns: v.array(
    v.object({
      _id: v.id("actionLogs"),
      _creationTime: v.number(),
      siteId: v.optional(v.id("sites")),
      action: v.string(),
      details: v.string(),
      status: v.union(
        v.literal("success"),
        v.literal("error"),
        v.literal("info"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLogs")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    // Newest first
    logs.sort((a, b) => b._creationTime - a._creationTime);
    return logs.slice(0, 50);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("actionLogs"),
      _creationTime: v.number(),
      siteId: v.optional(v.id("sites")),
      action: v.string(),
      details: v.string(),
      status: v.union(
        v.literal("success"),
        v.literal("error"),
        v.literal("info"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const logs = await ctx.db.query("actionLogs").order("desc").collect();
    return logs.slice(0, args.limit ?? 20);
  },
});

/** Enriched listing for the Activity page — includes site domain and supports larger batches */
export const listEnriched = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("actionLogs"),
      _creationTime: v.number(),
      siteId: v.optional(v.id("sites")),
      siteDomain: v.optional(v.string()),
      action: v.string(),
      details: v.string(),
      status: v.union(
        v.literal("success"),
        v.literal("error"),
        v.literal("info"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const logs = await ctx.db.query("actionLogs").order("desc").collect();
    const batch = logs.slice(0, args.limit ?? 200);

    // Build a site-id → domain lookup for all referenced sites
    const siteIds = [...new Set(batch.filter((l) => l.siteId).map((l) => l.siteId!))];
    const siteMap = new Map<string, string>();
    await Promise.all(
      siteIds.map(async (id) => {
        const site = await ctx.db.get(id);
        if (site) siteMap.set(id, site.productionDomain);
      }),
    );

    return batch.map((log) => ({
      ...log,
      siteDomain: log.siteId ? siteMap.get(log.siteId) : undefined,
    }));
  },
});

export const add = internalMutation({
  args: {
    siteId: v.optional(v.id("sites")),
    action: v.string(),
    details: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("info"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLogs", {
      siteId: args.siteId,
      action: args.action,
      details: args.details,
      status: args.status,
    });
    return null;
  },
});
