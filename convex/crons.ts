import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Auto-sync every 6 hours — fetches all sites + scans all plugins
crons.interval(
  "auto-sync staging sites",
  { hours: 6 },
  internal.sync.autoSync,
);

// Daily sync check at 7 AM ET — compares content between production and staging
crons.cron(
  "daily content sync check",
  "0 12 * * *", // 12:00 UTC = ~7-8 AM ET
  internal.syncAlerts.dailySyncCheck,
);

export default crons;
