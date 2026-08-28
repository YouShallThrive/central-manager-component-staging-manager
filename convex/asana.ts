/**
 * Asana integration — find STAGE Website Production Tasks for staging sites.
 *
 * Searches the Asana workspace for projects matching a site's production domain,
 * finds the "STAGE Website Production Tasks" section, and returns active tasks.
 */
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const ASANA_API_BASE = "https://app.asana.com/api/1.0";
const WORKSPACE_GID = "5489909195735"; // thrivematic.com workspace
const STAGE_SECTION_NAME = "STAGE Website Production Tasks";

// ─── Asana API Helpers ──────────────────────────────────────

async function asanaGet(
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  const url = new URL(`${ASANA_API_BASE}${path}`);
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      url.searchParams.set(k, val);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Asana token is invalid or expired.");
    if (resp.status === 403) throw new Error("Asana token lacks permission.");
    const text = await resp.text().catch(() => "");
    throw new Error(`Asana API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  return (await resp.json()) as any;
}

async function getAsanaToken(
  ctx: { runQuery: (ref: any, args: any) => Promise<any> },
): Promise<string> {
  // Try fetching from Integrations component first
  const intUrl = process.env.INTEGRATIONS_URL;
  const secret = process.env.SSO_SHARED_SECRET;
  if (intUrl && secret) {
    try {
      const resp = await fetch(`${intUrl}/api/credentials?integration=asana`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { values: { key: string; value: string }[] };
        const pat = data.values?.find((v: { key: string }) => v.key === "pat")?.value;
        if (pat) return pat;
      }
    } catch {
      // Fall through to local settings
    }
  }

  // Fallback: local settings
  const setting = await ctx.runQuery(internal.settings.getInternal, { key: "asana_pat" });
  if (!setting) throw new Error("No Asana PAT configured. Set it in the Integrations component.");
  return setting;
}

// ─── Validators ─────────────────────────────────────────────

const asanaTaskValidator = v.object({
  gid: v.string(),
  name: v.string(),
  assignee: v.optional(v.string()),
  dueOn: v.optional(v.string()),
  completed: v.boolean(),
  url: v.string(),
});

// ─── Link: Find Asana Project for a Domain ──────────────────

export const linkProject = action({
  args: {
    siteId: v.id("sites"),
    productionDomain: v.string(),
  },
  returns: v.object({
    found: v.boolean(),
    projectName: v.optional(v.string()),
    projectId: v.optional(v.string()),
    sectionId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const token = await getAsanaToken(ctx);
    const domain = args.productionDomain.toLowerCase();

    try {
      // Search all projects for the exact domain name
      // We paginate through all workspace projects
      let matchedProject: { gid: string; name: string } | null = null;
      let offset: string | undefined;

      // Try to find the project matching this domain
      while (true) {
        const params: Record<string, string> = {
          opt_fields: "name,gid",
          limit: "100",
        };
        if (offset) params.offset = offset;

        const result = await asanaGet(token, `/workspaces/${WORKSPACE_GID}/projects`, params);
        const projects = result.data ?? [];

        for (const p of projects) {
          const pName = (p.name as string).toLowerCase();
          // Match exact domain or domain without extension
          if (pName === domain || pName === domain.replace(/\.[^.]+$/, "")) {
            matchedProject = p;
            break;
          }
        }

        if (matchedProject) break;

        const nextPage = result.next_page;
        if (nextPage?.offset) {
          offset = nextPage.offset;
        } else {
          break;
        }
      }

      if (!matchedProject) {
        return { found: false, error: `No Asana project found matching "${args.productionDomain}"` };
      }

      // Find the STAGE section in this project
      const sectionsResult = await asanaGet(
        token,
        `/projects/${matchedProject.gid}/sections`,
        { opt_fields: "name,gid" },
      );
      const sections = sectionsResult.data ?? [];
      const stageSection = sections.find(
        (s: any) => s.name === STAGE_SECTION_NAME,
      );

      // Save mapping to site record
      await ctx.runMutation(internal.asana.setProjectMapping, {
        siteId: args.siteId,
        projectId: matchedProject.gid,
        projectName: matchedProject.name,
        sectionId: stageSection?.gid ?? undefined,
      });

      await ctx.runMutation(internal.actionLogs.add, {
        siteId: args.siteId,
        action: "asana_linked",
        details: `Linked to Asana project "${matchedProject.name}"${stageSection ? ` with STAGE section` : " (no STAGE section found)"}`,
        status: "success",
      });

      return {
        found: true,
        projectName: matchedProject.name,
        projectId: matchedProject.gid,
        sectionId: stageSection?.gid,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { found: false, error: msg };
    }
  },
});

// ─── Fetch Tasks from STAGE Section ─────────────────────────

export const getStageTasks = action({
  args: {
    sectionId: v.string(),
  },
  returns: v.array(asanaTaskValidator),
  handler: async (ctx, args) => {
    const token = await getAsanaToken(ctx);

    const result = await asanaGet(
      token,
      `/sections/${args.sectionId}/tasks`,
      {
        opt_fields: "name,gid,assignee.name,due_on,completed,permalink_url",
        completed_since: "now", // only incomplete tasks
        limit: "50",
      },
    );

    const tasks = result.data ?? [];
    return tasks.map((t: any) => ({
      gid: t.gid,
      name: t.name,
      assignee: t.assignee?.name ?? undefined,
      dueOn: t.due_on ?? undefined,
      completed: t.completed ?? false,
      url: t.permalink_url ?? `https://app.asana.com/0/0/${t.gid}`,
    }));
  },
});

// ─── Bulk Link: Match All Sites to Asana Projects ───────────

export const linkAllProjects = action({
  args: {},
  returns: v.object({
    matched: v.number(),
    unmatched: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    const token = await getAsanaToken(ctx);

    // 1. Build a full domain→project map from Asana
    const projectMap = new Map<string, { gid: string; name: string }>();
    let offset: string | undefined;

    while (true) {
      const params: Record<string, string> = {
        opt_fields: "name,gid",
        limit: "100",
      };
      if (offset) params.offset = offset;

      const result = await asanaGet(token, `/workspaces/${WORKSPACE_GID}/projects`, params);
      const projects = result.data ?? [];

      for (const p of projects) {
        const name = (p.name as string).toLowerCase();
        // Only map projects that look like domain names
        if (name.includes(".com") || name.includes(".net") || name.includes(".org") || name.includes(".io")) {
          // Extract the bare domain (project names are like "Domain.com" or "Client: Domain.com Production")
          const domainMatch = name.match(/([a-z0-9-]+\.[a-z]{2,})/);
          if (domainMatch) {
            const domain = domainMatch[1];
            // Only store if it's the "main" project (not SEO, LIVE PF, etc.)
            if (
              !name.includes(" seo") &&
              !name.includes(" live") &&
              !name.includes(" stage pf") &&
              !name.includes("production") &&
              !name.includes(" dev")
            ) {
              projectMap.set(domain, p);
            }
          }
        }
      }

      const nextPage = result.next_page;
      if (nextPage?.offset) {
        offset = nextPage.offset;
      } else {
        break;
      }
    }

    // 2. Get all sites
    const sites = await ctx.runQuery(internal.sites.listAll);

    let matched = 0;
    let unmatched = 0;
    let errors = 0;

    // 3. Match sites to projects
    for (const site of sites) {
      if (site.asanaProjectId) {
        matched++; // Already linked
        continue;
      }

      const domain = site.productionDomain.toLowerCase();
      const project = projectMap.get(domain);

      if (!project) {
        unmatched++;
        continue;
      }

      try {
        // Find STAGE section
        const sectionsResult = await asanaGet(
          token,
          `/projects/${project.gid}/sections`,
          { opt_fields: "name,gid" },
        );
        const sections = sectionsResult.data ?? [];
        const stageSection = sections.find(
          (s: any) => s.name === STAGE_SECTION_NAME,
        );

        await ctx.runMutation(internal.asana.setProjectMapping, {
          siteId: site._id,
          projectId: project.gid,
          projectName: project.name,
          sectionId: stageSection?.gid ?? undefined,
        });

        matched++;
      } catch {
        errors++;
      }
    }

    return { matched, unmatched, errors };
  },
});

// ─── Internal Mutations ─────────────────────────────────────

export const setProjectMapping = internalMutation({
  args: {
    siteId: v.id("sites"),
    projectId: v.string(),
    projectName: v.string(),
    sectionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      asanaProjectId: args.projectId,
      asanaProjectName: args.projectName,
      asanaStageSectionId: args.sectionId,
    });
    return null;
  },
});

// ─── Unlink Project ─────────────────────────────────────────

export const unlinkProject = internalMutation({
  args: {
    siteId: v.id("sites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.siteId, {
      asanaProjectId: undefined,
      asanaProjectName: undefined,
      asanaStageSectionId: undefined,
    });
    return null;
  },
});
