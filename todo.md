# Staging Manager App - Build Plan

## Data Model
- [x] `sites` table: staging_id, production_domain, staging_domain, rocket_url, status (prepped/unprepped/error), first_seen, prepped_at, prepped_note
- [x] `sitePlugins` table: site (ref), slug, display_name, status (active/inactive/not-installed), category (tracking/management/email/keep/other), in_deactivate_list
- [x] `siteActionLogs` table: site (ref), action, details, timestamp

## Backend (Convex)
- [x] Schema definition
- [x] `syncSites` action: calls Rocket.net API to pull all staging sites + their plugins
- [x] Queries: list sites (with filters), get site detail, get plugins for site
- [x] `triggerPrep` action: calls staging prep for a single site
- [x] Viktor tools integration for Rocket.net API calls

## Frontend
- [x] Dashboard page: table of all sites, search/filter, status badges
- [x] Site detail page: full plugin list with status, category labels, action log
- [x] Sync button to refresh data from Rocket.net
- [x] Design: technical/industrial feel, information-dense

## Testing & Deploy
- [x] Build and test locally
- [x] Deploy preview
- [x] Show NPW
- [ ] Deploy production (after approval)
