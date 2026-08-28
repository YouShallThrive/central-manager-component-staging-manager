import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

const muPluginValidator = v.object({
  _id: v.id("siteMuPlugins"),
  _creationTime: v.number(),
  siteId: v.id("sites"),
  filename: v.string(),
  present: v.boolean(),
  inRemoveList: v.boolean(),
  isGuard: v.boolean(),
});

// Get all MU-plugins for a site
export const listBySite = query({
  args: { siteId: v.id("sites") },
  returns: v.array(muPluginValidator),
  handler: async (ctx, args) => {
    const muPlugins = await ctx.db
      .query("siteMuPlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    // Sort: guard first, then remove-list items, then others
    muPlugins.sort((a, b) => {
      if (a.isGuard !== b.isGuard) return a.isGuard ? -1 : 1;
      if (a.inRemoveList !== b.inRemoveList) return a.inRemoveList ? -1 : 1;
      return a.filename.localeCompare(b.filename);
    });

    return muPlugins;
  },
});

// Batch upsert MU-plugins for a site
export const batchUpsert = internalMutation({
  args: {
    siteId: v.id("sites"),
    muPlugins: v.array(
      v.object({
        filename: v.string(),
        present: v.boolean(),
        inRemoveList: v.boolean(),
        isGuard: v.boolean(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete existing
    const existing = await ctx.db
      .query("siteMuPlugins")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .collect();

    for (const p of existing) {
      await ctx.db.delete(p._id);
    }

    // Insert new
    for (const p of args.muPlugins) {
      await ctx.db.insert("siteMuPlugins", {
        siteId: args.siteId,
        ...p,
      });
    }

    return null;
  },
});
