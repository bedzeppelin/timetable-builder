# Timetable Studio

Timetable Studio is a clean timetable builder for planning courses, lectures, tutorials, practicals, labs, work blocks, and weekly routines.

Open the app here: https://bedzeppelin.github.io/timetable-builder/

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
- Upload screenshots directly when the hosted version includes the GPT extractor backend.
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

The app can generate preset timetable tabs from your current courses:

- Condensed days
- Spread out
- Latest starts
- Balanced

The preset generator runs locally in your browser and tries to avoid conflicts.

## Exporting to calendar

Use `Import / export` → `Export ICS` to download a calendar file.

You can import the `.ics` file into Google Calendar, Apple Calendar, Outlook, and other calendar apps.

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

If the hosted app has the GPT extractor enabled:

1. Go to `Import / export` → `Upload screenshots`.
2. Drag screenshots into the popup or choose files.
3. Click `Extract with GPT`.
4. Review the imported timetable and anything marked `CHECK`.

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
