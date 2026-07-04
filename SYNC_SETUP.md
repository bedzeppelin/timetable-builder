# No-backend Schedule Transfer

Timetable Studio can move a schedule between a phone and computer without Supabase, login, or any database setup.

This is not live cloud sync. It is a one-time transfer link.

## How it works

1. On your computer, click `Transfer schedule`.
2. Click `Copy transfer link`.
3. Send/open that link on your phone.
4. The app opens a transfer modal.
5. Tap `Import pasted link`.

The schedule data is stored inside the link hash after:

```text
#ts-transfer=
```

Because the data is inside the link itself, no server or database is needed.

## What this does well

- Moves a schedule from laptop to phone.
- Moves a schedule from phone to laptop.
- Works without accounts.
- Works without Supabase.
- Keeps the app fully static except for the existing screenshot extractor API.

## Limitations

- It is not automatic live sync.
- If you edit the schedule on your laptop, you need to copy a new transfer link to update your phone.
- Large schedules create long links. If a link is too long for your messaging app/browser, use `Download JSON backup` and import the JSON on the other device.
- Anyone with the transfer link can import that schedule.

## Future cloud sync

Real live sync would still need a backend storage service, such as Supabase, Firebase, Vercel KV, or another database. This transfer-link version avoids that setup for now.
