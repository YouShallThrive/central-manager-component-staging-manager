import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";

const pluginValidator = v.object({
  _id: v.id("sitePlugins"),
  _creationTime: v.number(),
  siteId: v.id("sites"),
  slug: v.string(),
  displayName: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("must-use"),
  ),
  category: v.union(
    v.literal("tracking"),
    v.literal("management"),
    v.literal("email"),
    v.literal("keep"),
    v.literal("other"),
  ),
  inDeactivateList: v.boolean(),
  version: v.optional(v.string()),
  updateAvailable: v.optional(v.boolean()),
});

// Get all plugins for a site
export const listBySite = query({
  args: { siteId: v.id("sites") },
  returns: v.array(pluginValidator),
  handler: async (ctx, args) => {
    const plugins = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    // Sort: deactivate-list first, then by category, then alphabetically
    const categoryOrder: Record<string, number> = {
      tracking: 0,
      management: 1,
      email: 2,
      keep: 3,
      other: 4,
    };

    plugins.sort((a, b) => {
      // Items in deactivate list first
      if (a.inDeactivateList !== b.inDeactivateList) {
        return a.inDeactivateList ? -1 : 1;
      }
      // Then by category
      const catA = categoryOrder[a.category] ?? 99;
      const catB = categoryOrder[b.category] ?? 99;
      if (catA !== catB) return catA - catB;
      // Then alphabetically
      return a.slug.localeCompare(b.slug);
    });

    return plugins;
  },
});

// Update a single plugin's status
export const updateStatus = internalMutation({
  args: {
    siteId: v.id("sites"),
    slug: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("must-use"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plugin = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site_and_slug", (q) =>
        q.eq("siteId", args.siteId).eq("slug", args.slug),
      )
      .first();

    if (plugin) {
      await ctx.db.patch(plugin._id, { status: args.status });
    }
    return null;
  },
});

// Batch upsert plugins for a site (replaces all plugins for that site)
export const batchUpsert = internalMutation({
  args: {
    siteId: v.id("sites"),
    plugins: v.array(
      v.object({
        slug: v.string(),
        displayName: v.optional(v.string()),
        status: v.union(
          v.literal("active"),
          v.literal("inactive"),
          v.literal("must-use"),
        ),
        category: v.union(
          v.literal("tracking"),
          v.literal("management"),
          v.literal("email"),
          v.literal("keep"),
          v.literal("other"),
        ),
        inDeactivateList: v.boolean(),
        version: v.optional(v.string()),
        updateAvailable: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete existing plugins for this site
    const existing = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    for (const p of existing) {
      await ctx.db.delete(p._id);
    }

    // Insert new plugins
    for (const p of args.plugins) {
      await ctx.db.insert("sitePlugins", {
        siteId: args.siteId,
        ...p,
      });
    }

    return null;
  },
});

// List active plugins in the deactivate list for a site (internal — for actions)
export const listActiveToDeactivate = internalQuery({
  args: { siteId: v.id("sites") },
  returns: v.array(v.object({ slug: v.string(), displayName: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const plugins = await ctx.db
      .query("sitePlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();
    return plugins
      .filter((p) => p.inDeactivateList && p.status === "active")
      .map((p) => ({ slug: p.slug, displayName: p.displayName }));
  },
});
