/**
 * HTTP Auth Management — upload/delete the yst-staging-auth.php MU-plugin
 * to control HTTP Basic Auth on staging sites.
 *
 * Same approach as yst-staging-guard.php: deploy an MU-plugin via the
 * Rocket.net file API that enforces authentication at the PHP level.
 */
import { v } from "convex/values";
import { action, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const ROCKET_API_BASE = "https://api.rocket.net/v1";
const AUTH_MU_FILENAME = "yst-staging-auth.php";
const MU_PLUGINS_PATH = "/wp-content/mu-plugins";

// ─── PHP Template ────────────────────────────────────────────

function generateAuthPlugin(username: string, password: string): string {
  // Escape single quotes in credentials for PHP string safety
  const safeUser = username.replace(/'/g, "\\'");
  const safePass = password.replace(/'/g, "\\'");

  return `<?php
/**
 * YST Staging HTTP Auth
 *
 * Enforces HTTP Basic Authentication on this staging site.
 * Managed by the Staging Manager dashboard — do not edit manually.
 *
 * Plugin Name: YST Staging Auth
 * Version: 1.0.0
 */

// Skip auth for WP-CLI, cron, and REST API health checks
if (
  defined('WP_CLI') ||
  defined('DOING_CRON') ||
  (defined('REST_REQUEST') && REST_REQUEST) ||
  php_sapi_name() === 'cli'
) {
  return;
}

// Skip auth for Rocket.net SSO callback
if (isset(\$_GET['rocket_sso'])) {
  return;
}

\$required_user = '${safeUser}';
\$required_pass = '${safePass}';

\$user = isset(\$_SERVER['PHP_AUTH_USER']) ? \$_SERVER['PHP_AUTH_USER'] : '';
\$pass = isset(\$_SERVER['PHP_AUTH_PW']) ? \$_SERVER['PHP_AUTH_PW'] : '';

if (\$user !== \$required_user || \$pass !== \$required_pass) {
  header('WWW-Authenticate: Basic realm="Staging Site"');
  header('HTTP/1.0 401 Unauthorized');
  echo '<h1>401 Unauthorized</h1><p>This staging site requires authentication.</p>';
  exit;
}
`;
}

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

async function rocketUploadFile(
  token: string,
  siteId: number,
  path: string,
  filename: string,
  content: string,
): Promise<void> {
  const url = `${ROCKET_API_BASE}/sites/${siteId}/files`;

  // Rocket.net file upload expects JSON with path, filename, and raw content
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: path.endsWith("/") ? path : `${path}/`,
      filename,
      content,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to upload ${filename}: HTTP ${resp.status} — ${text}`);
  }
}

async function rocketDeleteFile(
  token: string,
  siteId: number,
  filePath: string,
): Promise<void> {
  const url = `${ROCKET_API_BASE}/sites/${siteId}/files`;

  // Rocket.net delete expects JSON with "file" key (full path)
  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: filePath }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to delete file at ${filePath}: HTTP ${resp.status} — ${text}`);
  }
}

// ─── WP-CLI Credential Storage ──────────────────────────────
// Both preview and production dashboards share the same WordPress site,
// so we use WP options as a shared credential store.

const WP_OPT_USER = "yst_staging_auth_user";
const WP_OPT_PASS = "yst_staging_auth_pass";

async function rocketWpCli(
  token: string,
  siteId: number,
  command: string,
): Promise<string> {
  const url = `${ROCKET_API_BASE}/sites/${siteId}/wpcli`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command }),
  });
  if (!resp.ok) return "";
  const body = (await resp.json()) as Record<string, unknown>;
  // Rocket.net WP-CLI returns { result: { response: '{"data":"value",...}' } }
  const result = body.result as Record<string, unknown> | undefined;
  const responseStr = (result?.response ?? result?.output ?? "") as string;
  // The response field is a JSON string — parse it to get `data`
  try {
    const parsed = JSON.parse(responseStr) as Record<string, unknown>;
    return String(parsed.data ?? "").trim();
  } catch {
    return String(responseStr).trim();
  }
}

async function storeCredsInWp(
  token: string,
  siteId: number,
  username: string,
  password: string,
): Promise<void> {
  // Store each credential as a separate WP option (avoids WP-CLI space-splitting bug)
  await rocketWpCli(token, siteId, `option update ${WP_OPT_USER} ${username}`);
  await rocketWpCli(token, siteId, `option update ${WP_OPT_PASS} ${password}`);
}

async function readCredsFromWp(
  token: string,
  siteId: number,
): Promise<{ username: string; password: string } | null> {
  const username = await rocketWpCli(token, siteId, `option get ${WP_OPT_USER}`);
  const password = await rocketWpCli(token, siteId, `option get ${WP_OPT_PASS}`);
  // Empty string = option doesn't exist or WP-CLI error
  if (!username && !password) return null;
  return { username: username || "", password: password || "" };
}

async function deleteCredsFromWp(
  token: string,
  siteId: number,
): Promise<void> {
  await rocketWpCli(token, siteId, `option delete ${WP_OPT_USER}`);
  await rocketWpCli(token, siteId, `option delete ${WP_OPT_PASS}`);
}

// ─── Mutations ──────────────────────────────────────────────

export const updateCredentials = mutation({
  args: {
    siteId: v.id("sites"),
    username: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      httpAuthUsername: args.username,
      httpAuthPassword: args.password,
    });
    return null;
  },
});

// ─── Actions ────────────────────────────────────────────────

export const enableAuth = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
    username: v.string(),
    password: v.string(),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    // Generate the PHP file
    const phpContent = generateAuthPlugin(args.username, args.password);

    try {
      // Delete existing file first (Rocket.net doesn't allow overwrite)
      try {
        await rocketDeleteFile(token, args.stagingId, `${MU_PLUGINS_PATH}/${AUTH_MU_FILENAME}`);
      } catch {
        // File may not exist yet — that's fine
      }

      // Upload MU-plugin
      await rocketUploadFile(
        token,
        args.stagingId,
        MU_PLUGINS_PATH,
        AUTH_MU_FILENAME,
        phpContent,
      );

      // Store credentials in WP options (shared across dashboard instances)
      await storeCredsInWp(token, args.stagingId, args.username, args.password);

      // Update site record
      await ctx.runMutation(internal.httpAuth.setAuthState, {
        siteId: args.siteId,
        enabled: true,
        username: args.username,
        password: args.password,
      });

      // Log action
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_enabled",
        details: `HTTP Auth enabled with username "${args.username}"`,
        status: "success",
      });

      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_enabled",
        details: `Failed to enable HTTP Auth: ${errorMsg}`,
        status: "error",
      });
      return { success: false, error: errorMsg };
    }
  },
});

export const disableAuth = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    try {
      // Delete MU-plugin
      const filePath = `${MU_PLUGINS_PATH}/${AUTH_MU_FILENAME}`;
      await rocketDeleteFile(token, args.stagingId, filePath);

      // Remove credentials from WP options
      await deleteCredsFromWp(token, args.stagingId);

      // Update site record
      await ctx.runMutation(internal.httpAuth.setAuthState, {
        siteId: args.siteId,
        enabled: false,
        username: "",
        password: "",
      });

      // Log action
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_disabled",
        details: "HTTP Auth disabled — MU-plugin removed",
        status: "success",
      });

      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_disabled",
        details: `Failed to disable HTTP Auth: ${errorMsg}`,
        status: "error",
      });
      return { success: false, error: errorMsg };
    }
  },
});

export const updateAuth = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
    username: v.string(),
    password: v.string(),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);
    const phpContent = generateAuthPlugin(args.username, args.password);

    try {
      // Delete existing file first (Rocket.net doesn't allow overwrite)
      try {
        await rocketDeleteFile(token, args.stagingId, `${MU_PLUGINS_PATH}/${AUTH_MU_FILENAME}`);
      } catch {
        // File may not exist — that's fine
      }

      await rocketUploadFile(token, args.stagingId, MU_PLUGINS_PATH, AUTH_MU_FILENAME, phpContent);

      // Sync credentials to WP options (shared across dashboard instances)
      await storeCredsInWp(token, args.stagingId, args.username, args.password);

      await ctx.runMutation(internal.httpAuth.setAuthState, {
        siteId: args.siteId,
        enabled: true,
        username: args.username,
        password: args.password,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_updated",
        details: `HTTP Auth credentials updated for username "${args.username}"`,
        status: "success",
      });

      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "http_auth_updated",
        details: `Failed to update HTTP Auth: ${errorMsg}`,
        status: "error",
      });
      return { success: false, error: errorMsg };
    }
  },
});

// ─── Probe (detect live state from Rocket.net) ──────────────

export const probeAuth = action({
  args: {
    siteId: v.id("sites"),
    stagingId: v.number(),
    accountId: v.id("rocketAccounts"),
  },
  returns: v.object({ enabled: v.boolean() }),
  handler: async (ctx, args) => {
    const token = await getAccountToken(ctx, args.accountId as string);

    // List MU-plugin files and check for the auth plugin
    const url = `${ROCKET_API_BASE}/sites/${args.stagingId}/files?path=${encodeURIComponent(MU_PLUGINS_PATH)}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    let enabled = false;
    if (resp.ok) {
      const body = (await resp.json()) as Record<string, unknown>;
      const result = (body.result ?? body) as Record<string, unknown>;
      const files = (result.files ?? []) as Array<Record<string, unknown>>;
      enabled = files.some(
        (f) => (f.file as string) === AUTH_MU_FILENAME || (f.name as string) === AUTH_MU_FILENAME,
      );
    }

    // If auth is enabled, try to read credentials from WP options
    // (shared source of truth across preview/production dashboard instances)
    let username = "";
    let password = "";
    if (enabled) {
      const creds = await readCredsFromWp(token, args.stagingId);
      if (creds) {
        username = creds.username;
        password = creds.password;
      }
    }

    // Update DB with live state + credentials
    if (username || password) {
      await ctx.runMutation(internal.httpAuth.setAuthState, {
        siteId: args.siteId,
        enabled,
        username,
        password,
      });
    } else {
      await ctx.runMutation(internal.httpAuth.setAuthEnabled, {
        siteId: args.siteId,
        enabled,
      });
    }

    return { enabled };
  },
});

// Internal mutation — update only the enabled flag without touching credentials
export const setAuthEnabled = internalMutation({
  args: {
    siteId: v.id("sites"),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      httpAuthEnabled: args.enabled,
    });
    return null;
  },
});

// Internal mutation used by the actions above
export const setAuthState = internalMutation({
  args: {
    siteId: v.id("sites"),
    enabled: v.boolean(),
    username: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      httpAuthEnabled: args.enabled,
      httpAuthUsername: args.enabled ? args.username : undefined,
      httpAuthPassword: args.enabled ? args.password : undefined,
    });
    return null;
  },
});
