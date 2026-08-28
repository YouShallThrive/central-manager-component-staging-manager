import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

// Get a setting value by key
export const get = query({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return setting?.value ?? null;
  },
});

// Internal version for use in actions
export const getInternal = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return setting?.value ?? null;
  },
});

// Check if a setting exists (for status display without exposing value)
export const has = query({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return setting !== null;
  },
});

// Set a setting value
export const set = mutation({
  args: { key: v.string(), value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("settings", { key: args.key, value: args.value });
    }
    return null;
  },
});

// Remove a setting
export const remove = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

// Internal set (for use from actions)
export const setInternal = internalMutation({
  args: { key: v.string(), value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("settings", { key: args.key, value: args.value });
    }
    return null;
  },
});

// Internal remove (for use from actions)
export const removeInternal = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

// Get sync progress (reactive)
export const getSyncProgress = query({
  args: {},
  returns: v.union(
    v.object({
      status: v.string(),
      phase: v.string(),
      total: v.number(),
      completed: v.number(),
      currentSite: v.optional(v.string()),
      errors: v.number(),
      errorSites: v.optional(v.array(v.string())),
      startedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "sync_progress"))
      .unique();
    if (!setting) return null;
    try {
      return JSON.parse(setting.value);
    } catch {
      return null;
    }
  },
});

// Get all settings (for admin display)
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("settings"),
      _creationTime: v.number(),
      key: v.string(),
      value: v.string(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("settings").collect();
  },
});
