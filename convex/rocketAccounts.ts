/**
 * Rocket.net account management — supports multiple hosting accounts.
 */
import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

const accountValidator = v.object({
  _id: v.id("rocketAccounts"),
  _creationTime: v.number(),
  label: v.string(),
  apiToken: v.string(),
  status: v.union(
    v.literal("connected"),
    v.literal("error"),
    v.literal("expired"),
  ),
  siteCount: v.optional(v.number()),
  stagingSiteCount: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
});

// List all accounts (token masked for UI)
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("rocketAccounts"),
      _creationTime: v.number(),
      label: v.string(),
      hasToken: v.boolean(),
      tokenPreview: v.string(), // last 8 chars
      status: v.union(
        v.literal("connected"),
        v.literal("error"),
        v.literal("expired"),
      ),
      siteCount: v.optional(v.number()),
      stagingSiteCount: v.optional(v.number()),
      lastSyncedAt: v.optional(v.number()),
      lastError: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const accounts = await ctx.db.query("rocketAccounts").collect();
    return accounts.map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      label: a.label,
      hasToken: !!a.apiToken,
      tokenPreview: a.apiToken ? `…${a.apiToken.slice(-8)}` : "",
      status: a.status,
      siteCount: a.siteCount,
      stagingSiteCount: a.stagingSiteCount,
      lastSyncedAt: a.lastSyncedAt,
      lastError: a.lastError,
    }));
  },
});

// Get a single account (with token for internal use)
export const get = internalQuery({
  args: { id: v.id("rocketAccounts") },
  returns: v.union(accountValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get all accounts with tokens (for sync)
export const listAll = internalQuery({
  args: {},
  returns: v.array(accountValidator),
  handler: async (ctx) => {
    return await ctx.db.query("rocketAccounts").collect();
  },
});

// Check if any accounts exist
export const hasAny = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const first = await ctx.db.query("rocketAccounts").first();
    return first !== null;
  },
});

// Add a new account
export const add = mutation({
  args: {
    label: v.string(),
    apiToken: v.string(),
  },
  returns: v.id("rocketAccounts"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("rocketAccounts", {
      label: args.label,
      apiToken: args.apiToken,
      status: "connected",
    });
  },
});

// Update account label
export const updateLabel = mutation({
  args: {
    id: v.id("rocketAccounts"),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { label: args.label });
    return null;
  },
});

// Update account token
export const updateToken = mutation({
  args: {
    id: v.id("rocketAccounts"),
    apiToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      apiToken: args.apiToken,
      status: "connected",
      lastError: undefined,
    });
    return null;
  },
});

// Remove an account (and optionally its sites)
export const remove = mutation({
  args: { id: v.id("rocketAccounts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete associated sites and their plugins/mu-plugins
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_account", (q) => q.eq("accountId", args.id))
      .collect();

    for (const site of sites) {
      // Delete plugins
      const plugins = await ctx.db
        .query("sitePlugins")
        .withIndex("by_site", (q) => q.eq("siteId", site._id))
        .collect();
      for (const p of plugins) await ctx.db.delete(p._id);

      // Delete MU-plugins
      const muPlugins = await ctx.db
        .query("siteMuPlugins")
        .withIndex("by_site", (q) => q.eq("siteId", site._id))
        .collect();
      for (const m of muPlugins) await ctx.db.delete(m._id);

      // Delete action logs
      const logs = await ctx.db
        .query("actionLogs")
        .withIndex("by_site", (q) => q.eq("siteId", site._id))
        .collect();
      for (const l of logs) await ctx.db.delete(l._id);

      // Delete site
      await ctx.db.delete(site._id);
    }

    // Delete the account
    await ctx.db.delete(args.id);
    return null;
  },
});

// Internal: update account after sync
export const updateAfterSync = internalMutation({
  args: {
    id: v.id("rocketAccounts"),
    siteCount: v.number(),
    stagingSiteCount: v.number(),
    status: v.union(
      v.literal("connected"),
      v.literal("error"),
      v.literal("expired"),
    ),
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      siteCount: args.siteCount,
      stagingSiteCount: args.stagingSiteCount,
      status: args.status,
      lastSyncedAt: Date.now(),
      lastError: args.lastError,
    });
    return null;
  },
});
