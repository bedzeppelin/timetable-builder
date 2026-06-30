# Timetable Studio

A clean monochrome timetable builder for courses, labs, tutorials, practicals, work blocks, and weekly planning.

Timetable Studio is a single-file web app. You can use it locally, push it to GitHub, or host it with GitHub Pages.

## Features

- Multiple timetable tabs, such as Fall and Winter
- Click-and-drag to create time blocks
- Drag blocks to move them
- Resize blocks from the bottom handle
- Courses can contain Lecture, Tutorial, Practical, or Other blocks
- Course visibility has three states:
  - `Visible`: shown and counted in the schedule
  - `Shadow`: shown faintly but not counted
  - `Hidden`: not shown on the timetable at all
- Course bank uses accordion-style dropdown cards
- Multiple tutorial/practical options can be imported as shadows
- Click a shadow option to select it
- Undo and redo buttons
- Right-click context menus for tabs, course cards, and timetable blocks
- Hex-code color customization
- Conflict checking
- Free-day and busy-hour summaries
- Modern time selection with quick duration chips
- Export/import JSON
- Paste GPT-generated JSON directly into the app
- Printable / save as PDF

## Basic usage

Open `index.html` in a browser. No build step is required.

1. Choose or create a timetable tab, such as Fall or Winter.
2. Drag on the calendar grid to create a time block.
3. Edit the course name, component, section, time, location, notes, and color.
4. Add more blocks to the same course for lectures, tutorials, practicals, or other meetings.
5. Use the course bank accordion to manage course visibility and options.
6. Use shadow options to compare possible schedules.
7. Use undo/redo if you make a mistake.

## Course visibility

Each course has three visibility states.

### Visible

The course appears normally on the timetable. Selected lecture/tutorial/practical blocks count toward:

- conflicts
- busy hours
- free days

### Shadow

The course appears faintly on the timetable but does not count toward conflicts, busy hours, or free days. This is useful when comparing possible courses.

### Hidden

The course does not appear on the timetable at all. It still remains in the course bank so you can bring it back later.

## How course options work

A course can contain multiple blocks:

- Lecture
- Tutorial
- Practical
- Other

The course bank is accordion-style so courses with many tutorial or practical options do not take over the sidebar.

If a course has multiple tutorial or practical options, Timetable Studio can keep those options as shadows. Shadow options are visible but do **not** count toward conflicts, busy hours, or free days.

To choose an option, click the shadow block on the timetable or press the `select` button in the course bank. Selecting one option for a component will deselect the other options for that same component.

Example:

```text
BIO360
  Lecture: LEC0101 selected
  Tutorial: TUT0101 shadow
  Tutorial: TUT0102 selected
  Practical: PRA0101 shadow
  Practical: PRA0102 shadow
```

Only the selected tutorial/practical counts in the schedule.

## Right-click menus

You can right-click:

- timetable tabs
- course cards in the course bank
- timetable blocks

Depending on what you right-click, you can quickly:

- edit
- duplicate
- delete
- make visible
- convert to shadow
- hide entirely
- select a shadow option

## Using ChatGPT with course screenshots

You can use ChatGPT to extract timetable information from screenshots of your school’s course enrolment page.

### Workflow

1. Take screenshots of the course sections on your school website.
2. Open ChatGPT.
3. Upload the screenshots.
4. Paste the prompt below.
5. Copy the JSON that ChatGPT gives you.
6. Open Timetable Studio.
7. Click `Paste GPT JSON`.
8. Choose one import mode:
   - `Add as new timetable tab`
   - `Replace current timetable`
   - `Merge into current timetable`
9. Paste the JSON and click `Import`.
10. Review any items marked `CHECK`.

### Prompt to give ChatGPT

Copy this prompt and send it with your screenshots:

```text
Extract the course timetable information from these screenshots and convert it into JSON for my Timetable Studio app.

Rules:
- Output ONLY valid JSON. No explanation and no markdown fences.
- Use this simplified format:
{
  "title": "Fall",
  "courses": [
    {
      "code": "BIO360",
      "name": "Biometrics I",
      "color": "#dbeafe",
      "enabled": true,
      "meetings": [
        {
          "type": "Lecture",
          "section": "LEC0101",
          "day": "Monday",
          "start": "15:00",
          "end": "17:00",
          "location": "IB 345",
          "notes": ""
        }
      ]
    }
  ]
}
- If the screenshots include both Fall and Winter, use:
{
  "timetables": [
    {"title": "Fall", "courses": [...]},
    {"title": "Winter", "courses": [...]}
  ]
}
- Each course should be one course object.
- Put Lecture, Tutorial, and Practical times as separate meetings inside the same course.
- If a course has multiple tutorial or practical options, include ALL options. Do not choose one unless clearly selected.
- Use type as one of: Lecture, Tutorial, Practical, Other.
- Use full day names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Use 24-hour time like "09:00" and "17:00".
- Put building and room together in location, like "IB 120".
- If something is unclear, put "CHECK:" in the notes field and describe what needs checking.
- Include section codes when visible, like LEC0101, TUT0102, PRA0101.
```

## Simplified GPT JSON format

Timetable Studio accepts this simplified format:

```json
{
  "title": "Fall",
  "courses": [
    {
      "code": "BIO360",
      "name": "Biometrics I",
      "color": "#dbeafe",
      "visibility": "visible",
      "meetings": [
        {
          "type": "Lecture",
          "section": "LEC0101",
          "day": "Monday",
          "start": "15:00",
          "end": "17:00",
          "location": "IB 345",
          "notes": ""
        },
        {
          "type": "Tutorial",
          "section": "TUT0101",
          "day": "Tuesday",
          "start": "09:00",
          "end": "10:00",
          "location": "CC 2140",
          "notes": ""
        },
        {
          "type": "Tutorial",
          "section": "TUT0102",
          "day": "Wednesday",
          "start": "13:00",
          "end": "14:00",
          "location": "CC 2140",
          "notes": ""
        }
      ]
    }
  ]
}
```

Valid course visibility values:

```json
"visibility": "visible"
"visibility": "shadow"
"visibility": "hidden"
```

When multiple options are imported for the same component, such as multiple tutorials, Timetable Studio imports those options as shadows unless a meeting has `"selected": true`.

To force a specific option to be selected, add:

```json
"selected": true
```

To force an option to stay as a shadow, add:

```json
"selected": false
```

## Full backup JSON

The normal `Export JSON` button exports the full internal app format. You can import that file later with `Import JSON`.

## Deploying with GitHub Pages

1. Create a new GitHub repo.
2. Upload `index.html` and `README.md`.
3. Go to `Settings`.
4. Go to `Pages`.
5. Set the source to your main branch.
6. Save.
7. Open the published GitHub Pages URL.

## Notes

Schedule data is saved locally in the browser using `localStorage`.

The app uses Poppins from Google Fonts with system font fallbacks. No font files are included in this repo.
