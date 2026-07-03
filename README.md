# Timetable Studio

Timetable Studio is a clean timetable builder for planning courses, lectures, tutorials, practicals, labs, work blocks, and weekly routines.

Open the app here: https://timetable-builder-ashen.vercel.app/

## What you can do

- Create multiple timetable tabs, such as Fall and Winter.
- Click and drag to create time blocks.
- Drag blocks to move them.
- Resize blocks from the bottom handle.
- Add lectures, tutorials, practicals, and other blocks under the same course.
- Set courses to Visible, Shadow, or Hidden.
- Show, shadow, or hide all lectures/tutorials/practicals globally.
- Control lecture/tutorial/practical visibility for each individual course.
- Keep alternative tutorials and practicals as shadows while planning.
- Hide alternative tutorial/practical shadows after choosing the option you want.
- Generate preset schedules such as condensed days, spread out, latest starts, and balanced.
- Export your final schedule as JSON or ICS.
- Import GPT-generated JSON from course screenshots.
- Upload screenshots directly with the GPT extractor.
- Use undo and redo for mistakes.

## Course visibility

Each course can be set to one of three visibility states.

### Visible

The course appears normally and counts toward conflicts, busy hours, and free days.

### Shadow

The course appears faintly but does not count toward conflicts, busy hours, or free days. This is useful when comparing possible courses.

### Hidden

The course does not appear on the timetable at all, but it stays saved in the course bank.

## Component visibility

Timetable Studio can control components globally or course by course.

Components are:

- Lecture
- Tutorial
- Practical
- Other

Each component can be:

- Visible
- Shadow
- Hidden

For example, you can hide all practicals globally, or hide only the practicals for one specific course.

## Tutorial and practical alternatives

Many courses have multiple tutorial or practical options. Timetable Studio can import all of them and keep the alternatives as shadows.

After choosing the option you want, use `Hide alts` to hide the extra shadow options. You can bring them back with `Show alts`.

## Preset schedules

The app can generate preset timetable tabs from your current timetable.

### How presets work

In plain language: Timetable Studio looks at the courses and options in the current tab, tries different combinations, scores them, and creates new timetable tabs based on the preset types you choose.

The preset generator does **not** check enrolment availability, waitlists, program requirements, prerequisites, or whether a course is actually open. It is a planning helper. Always review the final schedule manually before enrolling.

### What the generator uses

By default, the generator uses:

- Visible courses
- Shadow courses
- Selected options
- Shadow tutorial/practical alternatives

By default, it ignores:

- Hidden courses
- Hidden alternatives

This means `Hide alts` is useful before generating presets because hidden alternatives will stay out of the solver unless you choose to include them.

### Preset settings

When you click `Generate presets`, you can choose:

- Whether to include visible, shadow, or hidden courses.
- Whether to include selected options, shadow alternatives, or hidden alternatives.
- Whether to respect hidden lecture/tutorial/practical component controls.
- Whether to lock your current selected choices.
- Which preset types to generate.
- How deep the solver should search.

### Preset types

Available preset types include:

- Condensed days
- Spread out
- Latest starts
- Balanced
- Fewest gaps
- Shortest campus days
- No early mornings
- No evening classes
- Commute-friendly

Each generated preset includes notes explaining how it was made, how many conflicts were found, how many days are active, how much gap time exists, and whether selected choices were changed.

## Exporting to Google Calendar

Timetable Studio can export your visible, selected schedule as an `.ics` calendar file.

### Step 1: Export from Timetable Studio

1. Finish selecting the courses, tutorials, and practicals you want.
2. Open `Import / export`.
3. Click `Export ICS`.
4. Enter the first Monday date of your semester/session.
5. Enter how many weeks the schedule should repeat.
6. Save the `.ics` file that downloads.

### Step 2: Import into Google Calendar

1. Open Google Calendar on a computer.
2. Click the gear icon.
3. Open `Settings`.
4. Go to `Import & export`.
5. Under `Import`, choose the `.ics` file from Timetable Studio.
6. Choose the calendar you want to add the events to.
7. Click `Import`.

The imported events will repeat weekly based on the number of weeks you entered during export.

### Course colors in calendar exports

Timetable Studio includes each course color in the exported event metadata and description. The file also includes course categories.

Google Calendar may not reliably apply individual event colors from an imported `.ics` file. If the colors do not appear automatically, the course color hex code is still saved inside each event description as a reference.

For the most reliable color-coding in Google Calendar, create separate Google calendars for major courses or categories and set each calendar color manually.

## Using ChatGPT with course screenshots

You can upload course screenshots to ChatGPT and ask it to convert them into Timetable Studio JSON.

### Manual workflow

1. Take screenshots of your school course sections.
2. Upload the screenshots to ChatGPT.
3. Paste the prompt below.
4. Copy the JSON response.
5. Open Timetable Studio.
6. Go to `Import / export` → `Paste GPT JSON`.
7. Paste the JSON and import it.
8. Review anything marked `CHECK`.

### Built-in screenshot workflow

1. Go to `Import / export` → `Upload screenshots`.
2. Drag screenshots into the popup or choose files.
3. Click `Extract with GPT`.
4. Watch the progress bar while the app reads the screenshots and imports the result.
5. Review the imported timetable and anything marked `CHECK`.

### Prompt for ChatGPT

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
- You may use "visibility": "visible", "shadow", or "hidden" on a course. If unsure, use "visible".
- Use type as one of: Lecture, Tutorial, Practical, Other.
- Use full day names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Use 24-hour time like "09:00" and "17:00".
- Put building and room together in location, like "IB 120".
- If something is unclear, put "CHECK:" in the notes field and describe what needs checking.
- Include section codes when visible, like LEC0101, TUT0102, PRA0101.
```

## JSON compatibility

Older timetable JSON still works.

Older files that use:

```json
"enabled": true
```

are treated as:

```json
"visibility": "visible"
```

Older files that use:

```json
"enabled": false
```

are treated as:

```json
"visibility": "shadow"
```

Newer files can use:

```json
"visibility": "visible"
"visibility": "shadow"
"visibility": "hidden"
```

Schedule data is saved locally in your browser with `localStorage`.
