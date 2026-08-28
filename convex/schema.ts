import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  // Rocket.net hosting accounts (supports multiple)
  rocketAccounts: defineTable({
    label: v.string(), // Display name, e.g. "YST Main", "Lucid"
    apiToken: v.string(), // JWT bearer token
    status: v.union(
      v.literal("connected"),
      v.literal("error"),
      v.literal("expired"),
    ),
    siteCount: v.optional(v.number()), // total sites in account
    stagingSiteCount: v.optional(v.number()), // sites with staging
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),

  // Each Rocket.net staging site
  sites: defineTable({
    accountId: v.optional(v.id("rocketAccounts")), // which Rocket.net account this belongs to
    stagingId: v.number(), // Rocket.net staging site ID
    productionId: v.optional(v.number()), // Rocket.net production site ID
    productionDomain: v.string(), // e.g. "aacomnj.com"
    stagingDomain: v.optional(v.string()), // e.g. "xxx-staging.wpdns.site"
    rocketUrl: v.optional(v.string()), // Rocket.net internal URL
    phpVersion: v.optional(v.string()), // staging site PHP version
    productionPhpVersion: v.optional(v.string()), // production site PHP version
    phpCheckedAt: v.optional(v.number()), // timestamp of last PHP version check
    status: v.union(
      v.literal("unprepped"),
      v.literal("prepped"),
      v.literal("in_progress"),
      v.literal("error"),
    ),
    preppedAt: v.optional(v.number()), // timestamp
    preppedNote: v.optional(v.string()),
    firstSeen: v.optional(v.number()), // timestamp
    lastSyncedAt: v.optional(v.number()), // timestamp
    pluginSummary: v.optional(
      v.object({
        total: v.number(),
        active: v.number(),
        inactive: v.number(),
        shouldDeactivate: v.number(), // active plugins that should be deactivated
        alreadyHandled: v.number(), // plugins in deactivate list that are already inactive
      }),
    ),
    guardInstalled: v.optional(v.boolean()),
    muPluginIssues: v.optional(v.number()), // count of MU-plugins that should be removed but are present
    httpAuthEnabled: v.optional(v.boolean()), // whether yst-staging-auth.php is deployed
    httpAuthUsername: v.optional(v.string()), // stored credentials for the auth MU-plugin
    httpAuthPassword: v.optional(v.string()),
    // StatusCake uptime monitoring (matching production manager — not used for staging sites)
    statuscakeTestId: v.optional(v.string()),
    statuscakeStatus: v.optional(v.union(
      v.literal("up"),
      v.literal("down"),
      v.literal("unknown"),
    )),
    statuscakeUptime: v.optional(v.number()), // percentage e.g. 99.99
    statuscakeLastChecked: v.optional(v.number()), // timestamp
    // WP_DEBUG tracking
    wpDebug: v.optional(v.boolean()),
    wpDebugLog: v.optional(v.boolean()),
    wpDebugCheckedAt: v.optional(v.number()), // timestamp of last check
    asanaProjectId: v.optional(v.string()), // Asana project GID for this client domain
    asanaProjectName: v.optional(v.string()),
    asanaStageSectionId: v.optional(v.string()), // GID of "STAGE Website Production Tasks" section
    lastDiffAt: v.optional(v.number()), // when content diff was last run
    lastDiffInSync: v.optional(v.boolean()), // quick sync status
    lastBackupLabel: v.optional(v.string()), // most recent backup label
    lastBackupAt: v.optional(v.number()), // most recent backup timestamp
  })
    .index("by_staging_id", ["stagingId"])
    .index("by_status", ["status"])
    .index("by_production_domain", ["productionDomain"])
    .index("by_account", ["accountId"]),

  // Individual plugin records per site
  sitePlugins: defineTable({
    siteId: v.id("sites"),
    slug: v.string(), // plugin slug
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
    inDeactivateList: v.boolean(), // whether this plugin is in our DEACTIVATE_PLUGINS set
    version: v.optional(v.string()),
    updateAvailable: v.optional(v.boolean()),
  })
    .index("by_site", ["siteId"])
    .index("by_site_and_slug", ["siteId", "slug"]),

  // MU-plugin records per site
  siteMuPlugins: defineTable({
    siteId: v.id("sites"),
    filename: v.string(),
    present: v.boolean(),
    inRemoveList: v.boolean(), // whether this file is in our REMOVE_MU_PLUGINS set
    isGuard: v.boolean(), // whether this is the yst-staging-guard.php
  })
    .index("by_site", ["siteId"])
    .index("by_site_and_filename", ["siteId", "filename"]),

  // Content diff results per site
  contentDiffs: defineTable({
    siteId: v.id("sites"),
    ranAt: v.number(), // timestamp
    productionCount: v.number(),
    stagingCount: v.number(),
    matchingCount: v.number(),
    modifiedCount: v.number(), // pages with different modified dates
    onlyProductionCount: v.number(), // pages only on production
    onlyStagingCount: v.number(), // pages only on staging
    postTypes: v.array(v.string()), // post types scanned
    details: v.string(), // JSON string of full diff details
    inSync: v.boolean(), // quick flag for dashboard
  })
    .index("by_site", ["siteId"])
    .index("by_site_time", ["siteId", "ranAt"]),

  // App settings (single-row table)
  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  // Action log for audit trail
  actionLogs: defineTable({
    siteId: v.optional(v.id("sites")),
    action: v.string(), // e.g. "sync", "prep", "deactivate_plugins"
    details: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("info"),
    ),
  }).index("by_site", ["siteId"]),
});

export default schema;
