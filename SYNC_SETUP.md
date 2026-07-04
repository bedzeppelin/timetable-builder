# Supabase Live Sync Setup

Timetable Studio can sync a schedule between a phone and computer using a short sync code.

This version uses Supabase as the small cloud database and Vercel as the server-side API layer. The Supabase server key stays in Vercel environment variables and is never exposed to browser JavaScript.

## What users see

1. On the first device, click `Sync schedule`.
2. Click `Save / create code`.
3. Copy the code or sync link.
4. On the second device, click `Sync schedule` and load the same code.
5. Turn on `Auto-sync this device` on both devices.

With auto-sync on, edits are saved shortly after changes. Other devices check for updates about every 15 seconds.

## Step 1 — Create a Supabase project

1. Go to Supabase.
2. Create a new project.
3. Enter the project details.
4. Wait for the database to finish provisioning.

## Step 2 — Create the sync table

1. In Supabase, open the project.
2. Go to `SQL Editor`.
3. Paste the SQL from `supabase-sync-table.sql`.
4. Run it.

The table is:

```text
public.timetable_sync
```

## Step 3 — Get your Supabase credentials

In Supabase, open the project's API keys/settings area.

Copy your project URL and your server-side key.

Add them to Vercel using these exact variable names:

```text
SUPABASE_URL=your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your server-side Supabase key
```

Do not put the server-side key in frontend JavaScript. It must only go in Vercel environment variables.

## Step 4 — Add environment variables in Vercel

In Vercel:

1. Open the Timetable Studio project.
2. Go to `Settings`.
3. Go to `Environment Variables`.
4. Add the two variables from Step 3.

Optional:

```text
SYNC_TABLE=timetable_sync
```

## Step 5 — Redeploy Vercel

After saving environment variables, redeploy the project so `/api/sync-schedule` can read them.

## Testing

1. Open the deployed app on your laptop.
2. Go to `Import / export` → `Sync schedule`.
3. Click `Save / create code`.
4. Turn on `Auto-sync this device`.
5. Copy the sync link.
6. Open the link on your phone.
7. Tap `Load from code`.
8. Turn on `Auto-sync this device` on the phone.
9. Make a small change on one device and wait around 15 seconds for the other device to update.

## Security note

This is simple sync, not account-based private sync.

The sync code is the access key. Anyone with the code or link can load and overwrite that synced schedule.

The current behavior is `last save wins` if two devices edit at the same time.

## Current limitations

- No user accounts yet.
- No list of saved schedules yet.
- Last save wins.
- Background checks happen about every 15 seconds, not instantly.
- Very large timetables over about 1 MB should use JSON export/import instead.
