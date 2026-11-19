# Activity Log template

Shared Activity Log page for every central-manager component. The Staging
Manager is the reference implementation — copy this folder as-is so all
components keep the same chrome, row anatomy and filtering behaviour.

```
src/components/activity-log/
  ActivityLog.tsx   page template (header, status pills, filters, list)
  format.ts         status styling, action labels, relative time, date ranges
  types.ts          ActivityEntry / LogStatus
```

## Adopting it in another component

1. Copy `src/components/activity-log/` into the component repo's `src/components/`.
   It only depends on `@/components/ui/{badge,button,input,select}` (shadcn) and
   `lucide-react` — nothing app-specific.
2. Make sure the backend exposes the same query shape. `convex/actionLogs.ts`:

   ```ts
   export const listEnriched = query({ args: { limit: v.optional(v.number()) }, … })
   ```

   Same as `list()`, plus `siteDomain` resolved from `sites.domain` for every
   row that has a `siteId`. Copy it from
   `central-manager-component-staging-manager/convex/actionLogs.ts`.
3. Replace the page body:

   ```tsx
   const entries = useQuery(api.actionLogs.listEnriched, { limit: 500 });

   return (
     <ActivityLog
       entries={entries}
       subtitle="Recent sync and prep actions across all staging sites"
       actionLabels={{ full_sync: "Full Sync", staging_created: "Staging Created" }}
     />
   );
   ```

## Props

| prop               | purpose                                                        |
|--------------------|----------------------------------------------------------------|
| `entries`          | query result; `undefined` renders the loading state            |
| `title`            | defaults to "Activity Log"                                     |
| `subtitle`         | one line under the title                                       |
| `actionLabels`     | map of `action` → display label; unknown values are title-cased |
| `renderDetails`    | replaces the default details paragraph; return `null` to fall back |
| `searchPlaceholder`| search box hint                                                |
| `emptyMessage`     | shown when there are no entries at all                         |
| `className`        | page width override (default `max-w-[1100px]`)                 |

## Custom details bodies

Rows normally show `details` as one muted paragraph. When a component writes
structured details (the Security Manager's Fix-on-staging entries list one line
per plugin), pass `renderDetails` and keep the typography rules of the default
body: `text-xs`/`text-sm`, `text-muted-foreground` for prose, `font-mono` for
identifiers, colour only for status words.

```tsx
renderDetails={(entry) =>
  isStructuredDetails(entry.details) ? (
    <ActivityDetail details={entry.details} rowDomain={entry.siteDomain} />
  ) : null
}
```

Filtering, counts, timestamps and the row chrome stay with the template — do
not re-implement them per component.
