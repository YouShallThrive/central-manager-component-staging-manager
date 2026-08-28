/**
 * Content Diff — compare pages/posts between production and staging.
 *
 * Uses WP-CLI via Rocket.net API to list all published content on both
 * production and staging sites, then diffs by slug and modified timestamp.
 */
import { v } from "convex/values";
import { action, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const ROCKET_API_BASE = "https://api.rocket.net/v1";
const POST_TYPES = ["page", "post", "elementor_library", "e-landing-page", "product"];

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

async function rocketPost(
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${ROCKET_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Rocket.net token expired.");
    const text = await resp.text().catch(() => "");
    throw new Error(`Rocket.net API error (${resp.status}): ${text.slice(0, 200)}`);
  }

  return (await resp.json()) as Record<string, unknown>;
}

// ─── WP-CLI Helpers ──────────────────────────────────────────

interface WpPost {
  ID: number;
  post_title: string;
  post_name: string;
  post_modified: string;
  post_status: string;
  post_type: string;
  url?: string; // permalink — may not be present on older WP installs
}

async function wpCliListContent(
  token: string,
  siteId: number,
  label?: string,
): Promise<WpPost[]> {
  const types = POST_TYPES.join(",");
  const command = `post list --post_type=${types} --post_status=publish --fields=ID,post_title,post_name,post_modified,post_status,post_type,url --format=json --posts_per_page=-1`;

  let result: Record<string, unknown>;
  try {
    result = await rocketPost(token, `/sites/${siteId}/wpcli`, { command });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${label ?? "Site"} (ID ${siteId}): ${msg}`);
  }
  const responseStr = (result.result as any)?.response;

  if (!responseStr || typeof responseStr !== "string") {
    throw new Error("No response from WP-CLI command");
  }

  const response = JSON.parse(responseStr);
  if (response.status !== 1 || response.errors) {
    throw new Error(`WP-CLI error: ${response.errors || "unknown"}`);
  }

  const data = response.data;
  if (!data || typeof data !== "string") {
    return [];
  }

  // Some staging sites prepend PHP output before JSON — find the array start
  let jsonStr = data;
  if (!jsonStr.startsWith("[")) {
    const idx = jsonStr.indexOf("[{");
    if (idx === -1) {
      // Maybe empty result
      if (jsonStr.trim() === "" || jsonStr.trim() === "[]") return [];
      throw new Error("Could not parse WP-CLI output — no JSON array found");
    }
    jsonStr = jsonStr.slice(idx);
  }

  // Also strip any trailing garbage after the JSON array
  const lastBracket = jsonStr.lastIndexOf("]");
  if (lastBracket !== -1) {
    jsonStr = jsonStr.slice(0, lastBracket + 1);
  }

  return JSON.parse(jsonStr) as WpPost[];
}

// ─── Diff Logic ──────────────────────────────────────────────

interface DiffItem {
  slug: string;
  title: string;
  postType: string;
  location: "both" | "production_only" | "staging_only";
  prodModified?: string;
  stagingModified?: string;
  prodUrl?: string;
  stagingUrl?: string;
  modified: boolean; // true if timestamps differ
}

function diffContent(
  prodPosts: WpPost[],
  stagingPosts: WpPost[],
): {
  items: DiffItem[];
  matchingCount: number;
  modifiedCount: number;
  onlyProductionCount: number;
  onlyStagingCount: number;
  prodUniqueCount: number;
  stagingUniqueCount: number;
  typeBreakdown: Record<string, { production: number; staging: number }>;
} {
  // Build lookup by composite key: post_type + post_name
  const prodMap = new Map<string, WpPost>();
  for (const p of prodPosts) {
    const key = `${p.post_type}::${p.post_name}`;
    prodMap.set(key, p);
  }

  const stagingMap = new Map<string, WpPost>();
  for (const p of stagingPosts) {
    const key = `${p.post_type}::${p.post_name}`;
    stagingMap.set(key, p);
  }

  // Build type breakdown from unique items
  const typeBreakdown: Record<string, { production: number; staging: number }> = {};
  for (const p of prodMap.values()) {
    if (!typeBreakdown[p.post_type]) typeBreakdown[p.post_type] = { production: 0, staging: 0 };
    typeBreakdown[p.post_type].production++;
  }
  for (const p of stagingMap.values()) {
    if (!typeBreakdown[p.post_type]) typeBreakdown[p.post_type] = { production: 0, staging: 0 };
    typeBreakdown[p.post_type].staging++;
  }

  const items: DiffItem[] = [];
  let matchingCount = 0;
  let modifiedCount = 0;
  let onlyProductionCount = 0;
  let onlyStagingCount = 0;

  // Check all production items
  for (const [key, prod] of prodMap.entries()) {
    const staging = stagingMap.get(key);
    if (staging) {
      const isModified = prod.post_modified !== staging.post_modified;
      items.push({
        slug: prod.post_name,
        title: prod.post_title,
        postType: prod.post_type,
        location: "both",
        prodModified: prod.post_modified,
        stagingModified: staging.post_modified,
        prodUrl: prod.url,
        stagingUrl: staging.url,
        modified: isModified,
      });
      if (isModified) {
        modifiedCount++;
      } else {
        matchingCount++;
      }
    } else {
      items.push({
        slug: prod.post_name,
        title: prod.post_title,
        postType: prod.post_type,
        location: "production_only",
        prodModified: prod.post_modified,
        prodUrl: prod.url,
        modified: false,
      });
      onlyProductionCount++;
    }
  }

  // Check staging-only items
  for (const [key, staging] of stagingMap.entries()) {
    if (!prodMap.has(key)) {
      items.push({
        slug: staging.post_name,
        title: staging.post_title,
        postType: staging.post_type,
        location: "staging_only",
        stagingModified: staging.post_modified,
        stagingUrl: staging.url,
        modified: false,
      });
      onlyStagingCount++;
    }
  }

  // Sort: modified first, then production-only, staging-only, then matching
  items.sort((a, b) => {
    const order = { staging_only: 0, production_only: 1, both: 2 };
    const oa = a.modified ? -1 : order[a.location];
    const ob = b.modified ? -1 : order[b.location];
    return oa - ob;
  });

  return {
    items,
    matchingCount,
    modifiedCount,
    onlyProductionCount,
    onlyStagingCount,
    prodUniqueCount: prodMap.size,
    stagingUniqueCount: stagingMap.size,
    typeBreakdown,
  };
}

// ─── Actions ────────────────────────────────────────────────

export const runDiff = action({
  args: {
    siteId: v.id("sites"),
    productionId: v.number(),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    productionCount: v.optional(v.number()),
    stagingCount: v.optional(v.number()),
    matchingCount: v.optional(v.number()),
    modifiedCount: v.optional(v.number()),
    onlyProductionCount: v.optional(v.number()),
    onlyStagingCount: v.optional(v.number()),
    inSync: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      // Fetch content from both sites — allSettled so we see per-site errors
      const results = await Promise.allSettled([
        wpCliListContent(token, args.productionId, "Production"),
        wpCliListContent(token, args.stagingId, "Staging"),
      ]);

      const errors: string[] = [];
      if (results[0].status === "rejected") {
        errors.push(results[0].reason?.message ?? "Production WP-CLI failed");
      }
      if (results[1].status === "rejected") {
        errors.push(results[1].reason?.message ?? "Staging WP-CLI failed");
      }
      if (errors.length > 0) {
        throw new Error(errors.join(" | "));
      }

      const prodPosts = (results[0] as PromiseFulfilledResult<WpPost[]>).value;
      const stagingPosts = (results[1] as PromiseFulfilledResult<WpPost[]>).value;

      // Compute diff
      const diff = diffContent(prodPosts, stagingPosts);
      const inSync = diff.modifiedCount === 0 &&
        diff.onlyProductionCount === 0 &&
        diff.onlyStagingCount === 0;

      // Save result — use unique counts (Map-deduplicated) for consistency
      await ctx.runMutation(internal.contentDiff.saveDiffResult, {
        siteId: args.siteId,
        productionCount: diff.prodUniqueCount,
        stagingCount: diff.stagingUniqueCount,
        matchingCount: diff.matchingCount,
        modifiedCount: diff.modifiedCount,
        onlyProductionCount: diff.onlyProductionCount,
        onlyStagingCount: diff.onlyStagingCount,
        postTypes: POST_TYPES,
        details: JSON.stringify({
          items: diff.items.slice(0, 200),
          typeBreakdown: diff.typeBreakdown,
        }),
        inSync,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "content_diff",
        details: `Content diff: ${diff.prodUniqueCount} prod, ${diff.stagingUniqueCount} staging. ` +
          `${diff.matchingCount} matching, ${diff.modifiedCount} modified, ` +
          `${diff.onlyProductionCount} prod-only, ${diff.onlyStagingCount} staging-only. ` +
          `${inSync ? "IN SYNC" : "OUT OF SYNC"}`,
        status: inSync ? "success" : "info",
      });

      return {
        success: true,
        productionCount: diff.prodUniqueCount,
        stagingCount: diff.stagingUniqueCount,
        matchingCount: diff.matchingCount,
        modifiedCount: diff.modifiedCount,
        onlyProductionCount: diff.onlyProductionCount,
        onlyStagingCount: diff.onlyStagingCount,
        inSync,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "content_diff",
        details: `Content diff failed: ${error}`,
        status: "error",
      });
      return { success: false, error };
    }
  },
});

// ─── Queries ────────────────────────────────────────────────

export const getLatest = query({
  args: { siteId: v.id("sites") },
  returns: v.union(
    v.object({
      _id: v.id("contentDiffs"),
      _creationTime: v.number(),
      siteId: v.id("sites"),
      ranAt: v.number(),
      productionCount: v.number(),
      stagingCount: v.number(),
      matchingCount: v.number(),
      modifiedCount: v.number(),
      onlyProductionCount: v.number(),
      onlyStagingCount: v.number(),
      postTypes: v.array(v.string()),
      details: v.string(),
      inSync: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentDiffs")
      .withIndex("by_site_time", (q) => q.eq("siteId", args.siteId))
      .order("desc")
      .first();
  },
});

// ─── Internal Mutations ─────────────────────────────────────

export const saveDiffResult = internalMutation({
  args: {
    siteId: v.id("sites"),
    productionCount: v.number(),
    stagingCount: v.number(),
    matchingCount: v.number(),
    modifiedCount: v.number(),
    onlyProductionCount: v.number(),
    onlyStagingCount: v.number(),
    postTypes: v.array(v.string()),
    details: v.string(),
    inSync: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete old diffs for this site (keep latest 5)
    const oldDiffs = await ctx.db
      .query("contentDiffs")
      .withIndex("by_site_time", (q) => q.eq("siteId", args.siteId))
      .order("desc")
      .collect();
    for (const diff of oldDiffs.slice(4)) {
      await ctx.db.delete(diff._id);
    }

    // Insert new result
    await ctx.db.insert("contentDiffs", {
      siteId: args.siteId,
      ranAt: now,
      productionCount: args.productionCount,
      stagingCount: args.stagingCount,
      matchingCount: args.matchingCount,
      modifiedCount: args.modifiedCount,
      onlyProductionCount: args.onlyProductionCount,
      onlyStagingCount: args.onlyStagingCount,
      postTypes: args.postTypes,
      details: args.details,
      inSync: args.inSync,
    });

    // Update site sync status
    await ctx.db.patch(args.siteId, {
      lastDiffAt: now,
      lastDiffInSync: args.inSync,
    });

    return null;
  },
});
