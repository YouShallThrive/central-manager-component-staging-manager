// Trigger cleanup by running the full sync action
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexHttpClient("https://friendly-setter-749.convex.cloud");

// Check current sites in DB first
const sites = await client.query(api.sites.list, {});
console.log(`Total sites in DB: ${sites.length}`);

const aacomnj = sites.filter((s: any) => s.productionDomain.includes("aacomnj"));
console.log(`\naacomnj.com entries: ${aacomnj.length}`);
for (const s of aacomnj) {
  console.log(`  - stagingId: ${s.stagingId}, domain: ${s.productionDomain}, id: ${s._id}, status: ${s.status}`);
}
