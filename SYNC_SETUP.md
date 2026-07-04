# Simple Sync Setup

Timetable Studio can sync a schedule between a phone and computer using a short sync code.

This is intentionally simple. There are no user accounts yet. Anyone with the sync code or link can load and overwrite that synced schedule.

## How it works

1. A user clicks `Sync schedule`.
2. They click `Save to cloud`.
3. The app receives a code like `ABCD-1234`.
4. On another device, they open the app, click `Sync schedule`, enter the code, and click `Load from code`.
5. They can also copy a sync link and open it on another device.

## Required Supabase setup

Create a Supabase project, then run the SQL in `supabase-sync-table.sql` from the Supabase SQL Editor.

The table name defaults to:

```text
public.timetable_sync
```

## Required Vercel environment variables

Add these in Vercel project settings:

```text
SUPABASE_URL=your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
```

Optional:

```text
SYNC_TABLE=timetable_sync
```

After adding the environment variables, redeploy the Vercel project.

## Security note

The service role key must only be used server-side. This implementation keeps it inside the Vercel API route and never exposes it to browser JavaScript.

The sync code itself is the access key for a schedule. Treat it like a share link.

## User-facing controls

The app adds a `Sync schedule` button under `Import / export`.

The modal includes:

- Save to cloud
- Load from code
- Refresh from cloud
- Copy link
- Clear code

## Current limitations

- No login/accounts.
- No per-user private library.
- No automatic background sync.
- Last save wins if two devices save to the same code.
- Anyone with the code can load or overwrite that synced schedule.

This keeps the feature lightweight for now, while leaving room for account-based sync later.
