/**
 * Staging Management — backup, delete, and recreate staging environments.
 *
 * Provides backup creation/listing for production sites, and
 * staging lifecycle management (delete + recreate from fresh clone).
 */
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const ROCKET_API_BASE = "https://api.rocket.net/v1";

// ─── API Helpers ─────────────────────────────────────────────

async function getAccountToken(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
  accountId: string,
): Promise<string> {
  const account = await ctx.runQuery(internal.rocketAccounts.get, { id: accountId });
  if (!account) throw new Error("Rocket.net account not found.");
  if (!account.apiToken) throw new Error(`No API token for account "${account.label}".`);
  return account.apiToken;
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
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Sync error (401 from Rocket.net). Check the sync logs for details.");
    const text = await resp.text().catch(() => "");
    throw new Error(`Sync error (${resp.status} from Rocket.net). Check the sync logs for details: ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as Record<string, unknown>;
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
    if (resp.status === 401) throw new Error("Sync error (401 from Rocket.net). Check the sync logs for details.");
    const text = await resp.text().catch(() => "");
    throw new Error(`Sync error (${resp.status} from Rocket.net). Check the sync logs for details: ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

async function rocketDelete(
  token: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${ROCKET_API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Sync error (401 from Rocket.net). Check the sync logs for details.");
    const text = await resp.text().catch(() => "");
    throw new Error(`Sync error (${resp.status} from Rocket.net). Check the sync logs for details: ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

// ─── Validators ─────────────────────────────────────────────

const backupValidator = v.object({
  id: v.number(),
  label: v.string(),
  downloadLink: v.optional(v.string()),
  createdAt: v.optional(v.string()),
});

// ─── Backup Actions ─────────────────────────────────────────

export const listBackups = action({
  args: {
    productionId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    backups: v.array(backupValidator),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      const result = await rocketGet(token, `/sites/${args.productionId}/backup`);
      const backups = (result.result as any[]) ?? [];

      return {
        success: true,
        backups: backups.map((b: any) => ({
          id: b.id,
          label: b.label ?? `Backup ${b.id}`,
          downloadLink: b.download_link,
          createdAt: b.created_at,
        })),
      };
    } catch (e) {
      return {
        success: false,
        backups: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
});

export const createBackup = action({
  args: {
    siteId: v.id("sites"),
    productionId: v.number(),
    accountId: v.id("rocketAccounts"),
    label: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    taskId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      const result = await rocketPost(token, `/sites/${args.productionId}/backup`, {
        label: args.label,
      });

      const taskId = (result.result as any)?.task_id;

      // Update site record
      await ctx.runMutation(internal.stagingManage.updateBackupInfo, {
        siteId: args.siteId,
        label: args.label,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "backup_created",
        details: `Backup "${args.label}" created (task: ${taskId})`,
        status: "success",
      });

      return { success: true, taskId };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "backup_created",
        details: `Failed to create backup: ${error}`,
        status: "error",
      });
      return { success: false, error };
    }
  },
});

// ─── Staging Lifecycle Actions ──────────────────────────────

export const deleteStaging = action({
  args: {
    siteId: v.id("sites"),
    productionId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      await rocketDelete(token, `/sites/${args.productionId}/staging`);

      await ctx.runMutation(internal.stagingManage.markStagingDeleted, {
        siteId: args.siteId,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "staging_deleted",
        details: "Staging environment deleted",
        status: "success",
      });

      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "staging_deleted",
        details: `Failed to delete staging: ${error}`,
        status: "error",
      });
      return { success: false, error };
    }
  },
});

export const createStaging = action({
  args: {
    siteId: v.id("sites"),
    productionId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    taskId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      const result = await rocketPost(
        token,
        `/sites/${args.productionId}/staging`,
        {},
      );

      if (!(result as any).success) {
        const messages = (result.messages as string[]) ?? [];
        throw new Error(messages.join(", ") || "Failed to create staging");
      }

      const taskId = (result.result as any)?.task_id;

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "staging_created",
        details: `Staging creation started (task: ${taskId}). This may take several minutes.`,
        status: "success",
      });

      return { success: true, taskId };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "staging_created",
        details: `Failed to create staging: ${error}`,
        status: "error",
      });
      return { success: false, error };
    }
  },
});

// ─── Internal Mutations ─────────────────────────────────────

export const updateBackupInfo = internalMutation({
  args: {
    siteId: v.id("sites"),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      lastBackupLabel: args.label,
      lastBackupAt: Date.now(),
    });
    return null;
  },
});

export const markStagingDeleted = internalMutation({
  args: { siteId: v.id("sites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      status: "unprepped" as const,
      guardInstalled: undefined,
      httpAuthEnabled: undefined,
      httpAuthUsername: undefined,
      httpAuthPassword: undefined,
      lastDiffAt: undefined,
      lastDiffInSync: undefined,
    });
    return null;
  },
});
