# Timetable Studio

A clean monochrome timetable builder for courses, labs, tutorials, practicals, work blocks, and weekly planning.

## Features

- Multiple timetable tabs, such as Fall and Winter
- Click-and-drag to create time blocks
- Drag blocks to move them
- Resize blocks from the bottom handle
- Courses can contain Lecture, Tutorial, Practical, or Other blocks
- Toggle an entire course on/off at once
- Disabled courses can appear as faint “shadow” blocks
- Hex-code color customization
- Conflict checking
- Free-day and busy-hour summaries
- Modern time selection with quick duration chips
- Export/import JSON
- Printable / save as PDF

## Font

The app uses Poppins from Google Fonts, with system fallbacks. No font files are included in this repo.

## Usage

Open `index.html` in a browser. No build step required.

## Deploying with GitHub Pages

1. Create a new GitHub repo.
2. Upload `index.html` and `README.md`.
3. Go to **Settings → Pages**.
4. Set the source to the main branch.
5. Open the published GitHub Pages link.

## Notes

Schedule data is saved locally in the browser using `localStorage`.
