import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();
auth.addHttpRoutes(http);

// ── Admin sync endpoint ─────────────────────────────────────
// POST /api/admin/sync — stores config and triggers full credential + site sync
http.route({
  path: "/api/admin/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { serverManagementUrl, ssoSharedSecret, adminKey } = body;

      const secret = process.env.SSO_SHARED_SECRET || "66mTA4FYT1TTYfuD6FC7eDHLN15vZC7T3L6DLz3tqbk";
      if (!adminKey || adminKey !== secret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      await ctx.runMutation(internal.credentialSync.upsertConfig, {
        serverManagementUrl,
        ssoSharedSecret,
      });

      // Pull credentials first
      const credResult = await ctx.runAction(internal.credentialSync.pullFromServerManagement, {});

      return new Response(JSON.stringify({ status: "ok", ...credResult }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/api/admin/sync",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
