/* Plain-language import/export flows for Timetable Studio. */
(function(){
  const GOOGLE_CALENDAR_IMPORT_URL = "https://calendar.google.com/calendar/u/0/r/settings/export";
  let pendingImportData = null;
  let pendingImportFileName = "";

  function slugName(value, fallback="schedule"){
    const slug = String(value || fallback)
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return slug || fallback;
  }

  function timetableFileName(timetables, ext){
    const selected = Array.isArray(timetables) ? timetables.filter(Boolean) : [];
    if(selected.length === 1){
      return `${slugName(selected[0].title || "schedule")}-timetable.${ext}`;
    }
    const title = selected.slice(0, 3).map(t => t.title || "schedule").join("-") || "selected";
    const suffix = selected.length > 3 ? `-${selected.length}-tabs` : "";
    return `${slugName(title + suffix, "selected")}-timetable.${ext}`;
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function ensurePolishStyles(){
    if(document.getElementById("importExportPolishStyles")) return;
    const style = document.createElement("style");
    style.id = "importExportPolishStyles";
    style.textContent = `
      .scheduleChoiceList{display:grid;gap:8px;margin-top:8px}
      .scheduleChoice{display:flex;align-items:flex-start;gap:9px;border:1px solid #e5e5df;background:#fff;border-radius:13px;padding:9px;font-weight:800;color:#222}
      .scheduleChoice input{width:auto;margin-top:2px;accent-color:#111}
      .scheduleChoice span{display:grid;gap:2px}
      .scheduleChoice small{font-weight:650;color:#777;line-height:1.35}
      .scheduleHelper{border:1px solid #dfdfd8;background:#f8f8f6;border-radius:15px;padding:11px;display:grid;gap:6px;color:#444;font-size:.84rem;line-height:1.45}
      .scheduleModalGrid{display:grid;gap:10px}
      .scheduleModalGrid .formGrid{margin:0}
    `;
    document.head.appendChild(style);
  }

  function ensureModal(id, title, bodyHtml, actionsHtml){
    let overlay = document.getElementById(id);
    if(overlay) return overlay;
    ensurePolishStyles();
    overlay = document.createElement("div");
    overlay.className = "modalOverlay";
    overlay.id = id;
    overlay.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <div class="scheduleModalGrid">${bodyHtml}</div>
        <div class="modalActions">${actionsHtml}</div>
      </div>
    `;
    overlay.addEventListener("click", e => {
      if(e.target.id === id) closePolishModal(id);
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closePolishModal(id){
    const overlay = document.getElementById(id);
    if(overlay) overlay.style.display = "none";
  }

  function showPolishModal(id){
    const overlay = document.getElementById(id);
    if(overlay) overlay.style.display = "flex";
  }

  function renderTimetableChoices(containerId, timetables, options={}){
    const box = document.getElementById(containerId);
    if(!box) return;
    const activeId = current().id;
    box.innerHTML = (timetables || []).map((t, index) => {
      const id = `${containerId}_${index}`;
      const checked = options.all ? "checked" : (t.id === activeId || index === 0 ? "checked" : "");
      const courseCount = (t.courses || []).length;
      return `
        <label class="scheduleChoice" for="${id}">
          <input id="${id}" type="checkbox" value="${escapeHtml(t.id || String(index))}" ${checked}>
          <span>
            ${escapeHtml(t.title || `Timetable ${index + 1}`)} timetable
            <small>${courseCount} course${courseCount === 1 ? "" : "s"}</small>
          </span>
        </label>
      `;
    }).join("");
  }

  function selectedFromChoices(containerId, timetables){
    const checked = Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`));
    const values = new Set(checked.map(input => input.value));
    return (timetables || []).filter((t, index) => values.has(t.id || String(index)));
  }

  function buildStateExport(timetables){
    const selected = clone(timetables);
    return {
      ...clone(state),
      timetables:selected,
      activeTimetableId:selected[0]?.id || state.activeTimetableId
    };
  }

  function downloadBlob(content, type, filename){
    const blob = new Blob([content], {type});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openScheduleFileExport(){
    current().notes = document.getElementById("notes")?.value || current().notes || "";
    ensureModal(
      "scheduleFileExportModal",
      "Save schedule file",
      `
        <div class="scheduleHelper">
          <b>This saves your schedule as a file.</b>
          <span>The file format is JSON, but you can think of it as your Timetable Studio schedule backup. Use it to move your schedule to another browser/device or keep a copy.</span>
        </div>
        <div>
          <label>Choose timetables to save</label>
          <div id="scheduleExportChoices" class="scheduleChoiceList"></div>
        </div>
      `,
      `<button class="secondary" onclick="closeScheduleFileExport()">Cancel</button><button onclick="confirmScheduleFileExport()">Save schedule file</button>`
    );
    renderTimetableChoices("scheduleExportChoices", state.timetables || []);
    showPolishModal("scheduleFileExportModal");
  }

  function confirmScheduleFileExport(){
    const selected = selectedFromChoices("scheduleExportChoices", state.timetables || []);
    if(!selected.length){
      alert("Choose at least one timetable to save.");
      return;
    }
    const payload = buildStateExport(selected);
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", timetableFileName(selected, "json"));
    closePolishModal("scheduleFileExportModal");
  }

  function importChoicesFromData(data){
    if(looksLikeFullExport(data)) return data.timetables || [];
    if(Array.isArray(data.timetables)) return data.timetables;
    if(Array.isArray(data.courses)) return [data];
    return [];
  }

  function openScheduleFileImport(data, filename){
    pendingImportData = data;
    pendingImportFileName = filename || "schedule file";
    const choices = importChoicesFromData(data);
    if(!choices.length){
      alert("That schedule file could not be imported.");
      return;
    }
    ensureModal(
      "scheduleFileImportModal",
      "Load schedule file",
      `
        <div class="scheduleHelper">
          <b>This is a JSON file, but it is just your saved schedule.</b>
          <span>File: <b id="scheduleImportFileName"></b></span>
          <span>Choose which timetables you want to load and how to add them.</span>
        </div>
        <label>How should this be loaded?
          <select id="scheduleImportMode">
            <option value="add">Add selected timetables as new tabs</option>
            <option value="replace">Replace the current timetable with the first selected timetable</option>
            <option value="merge">Add selected courses into the current timetable</option>
            <option value="replaceAll">Replace all saved timetables with selected timetables</option>
          </select>
        </label>
        <div>
          <label>Choose timetables to load</label>
          <div id="scheduleImportChoices" class="scheduleChoiceList"></div>
        </div>
      `,
      `<button class="secondary" onclick="closeScheduleFileImport()">Cancel</button><button onclick="confirmScheduleFileImport()">Load selected timetables</button>`
    );
    document.getElementById("scheduleImportFileName").textContent = pendingImportFileName;
    renderTimetableChoices("scheduleImportChoices", choices, {all:true});
    showPolishModal("scheduleFileImportModal");
  }

  function confirmScheduleFileImport(){
    if(!pendingImportData) return;
    const sourceChoices = importChoicesFromData(pendingImportData);
    const selected = selectedFromChoices("scheduleImportChoices", sourceChoices);
    const mode = document.getElementById("scheduleImportMode")?.value || "add";
    if(!selected.length){
      alert("Choose at least one timetable to load.");
      return;
    }

    try{
      if(mode === "replaceAll"){
        const imported = selected.map((t, index) => normalizeImportedTimetable(t, t.title || `Imported ${index + 1}`));
        state = {
          ...clone(state),
          timetables:imported,
          activeTimetableId:imported[0]?.id
        };
        persist();
        render();
        alert("Schedule file loaded.");
      }else{
        const payload = selected.length === 1 ? selected[0] : {timetables:selected};
        importDataObject(payload, mode);
      }
      closePolishModal("scheduleFileImportModal");
      pendingImportData = null;
    }catch(error){
      alert(error.message || "That schedule file could not be imported.");
    }
  }

  function importSchedulePolished(event){
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        openScheduleFileImport(JSON.parse(reader.result), file.name);
      }catch(error){
        alert("That schedule file could not be imported. Make sure it is a Timetable Studio JSON schedule file.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function meetingsForTimetable(timetable){
    const previousId = state.activeTimetableId;
    const previousDays = Array.isArray(activeDays) ? activeDays.slice() : [];
    state.activeTimetableId = timetable.id;
    activeDays = getDays();
    const meetings = enabledMeetings().map(m => ({...m, timetableTitle:timetable.title}));
    state.activeTimetableId = previousId;
    activeDays = previousDays;
    return meetings;
  }

  function openCalendarExport(){
    ensureModal(
      "calendarExportModal",
      "Add to calendar",
      `
        <div class="scheduleHelper">
          <b>This downloads a calendar file.</b>
          <span>The file format is ICS. After the download, Timetable Studio will open Google Calendar’s Import & export settings page so you can import the file.</span>
        </div>
        <div class="formGrid">
          <label>First Monday of the semester/session
            <input id="calendarExportMonday" type="date">
          </label>
          <label>Repeat for how many weeks?
            <input id="calendarExportWeeks" type="number" min="1" max="52" value="12">
          </label>
        </div>
        <div>
          <label>Choose timetables to include</label>
          <div id="calendarExportChoices" class="scheduleChoiceList"></div>
        </div>
      `,
      `<button class="secondary" onclick="closeCalendarExport()">Cancel</button><button onclick="confirmCalendarExport()">Download calendar file</button>`
    );
    renderTimetableChoices("calendarExportChoices", state.timetables || []);
    showPolishModal("calendarExportModal");
  }

  function confirmCalendarExport(){
    const selected = selectedFromChoices("calendarExportChoices", state.timetables || []);
    if(!selected.length){
      alert("Choose at least one timetable to add to calendar.");
      return;
    }
    const monday = document.getElementById("calendarExportMonday")?.value;
    if(!monday || !/^\d{4}-\d{2}-\d{2}$/.test(monday)){
      alert("Choose the first Monday of your semester/session.");
      return;
    }
    const weeks = Math.max(1, Math.min(52, Number(document.getElementById("calendarExportWeeks")?.value || 12)));
    const meetings = selected.flatMap(meetingsForTimetable);
    if(!meetings.length){
      alert("There are no visible selected meetings to add to calendar.");
      return;
    }

    const dayOffsets = {Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6};
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Timetable Studio//Schedule Export//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    meetings.forEach(m => {
      const dateObj = addDaysToDate(monday, dayOffsets[m.day] ?? 0);
      const courseColor = m.color || "";
      const description = [
        m.notes || "Created with Timetable Studio",
        `Timetable: ${m.timetableTitle || ""}`,
        `Course: ${m.courseTitle || ""}`,
        `Component: ${componentText(m)}`,
        courseColor ? `Timetable Studio color: ${courseColor}` : ""
      ].filter(Boolean).join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsEscape(m.timetableTitle)}-${icsEscape(m.courseId)}-${icsEscape(m.id)}-${Date.now()}@timetable-studio`,
        `DTSTAMP:${stamp}`,
        `SUMMARY:${icsEscape(`${m.courseTitle} ${componentText(m)}`)}`,
        `DTSTART:${formatICSDateTime(dateObj, m.start)}`,
        `DTEND:${formatICSDateTime(dateObj, m.end)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
        `LOCATION:${icsEscape(m.location || "")}`,
        `DESCRIPTION:${icsEscape(description)}`,
        `CATEGORIES:${icsEscape(m.courseTitle || "Timetable Studio")}`,
        courseColor ? `X-TIMETABLE-COLOR:${icsEscape(courseColor)}` : "",
        courseColor ? `COLOR:${icsEscape(courseColor)}` : "",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    downloadBlob(lines.filter(Boolean).join("\r\n"), "text/calendar;charset=utf-8", timetableFileName(selected, "ics"));
    closePolishModal("calendarExportModal");
    window.open(GOOGLE_CALENDAR_IMPORT_URL, "_blank", "noopener");
  }

  function enhanceImportExportButtons(){
    document.querySelectorAll("button").forEach(button => {
      const text = button.textContent.trim();
      if(text === "Export JSON") button.textContent = "Save schedule file";
      if(text === "Import JSON") button.textContent = "Load schedule file";
      if(text === "Paste GPT JSON") button.textContent = "Paste schedule JSON";
      if(text === "Export ICS") button.textContent = "Add to calendar";
      if(text === "Copy GPT prompt") button.remove();
    });
  }

  function bootPolish(){
    ensurePolishStyles();
    enhanceImportExportButtons();
    window.exportSchedule = openScheduleFileExport;
    window.importSchedule = importSchedulePolished;
    window.exportICS = openCalendarExport;
    window.closeScheduleFileExport = () => closePolishModal("scheduleFileExportModal");
    window.confirmScheduleFileExport = confirmScheduleFileExport;
    window.closeScheduleFileImport = () => closePolishModal("scheduleFileImportModal");
    window.confirmScheduleFileImport = confirmScheduleFileImport;
    window.closeCalendarExport = () => closePolishModal("calendarExportModal");
    window.confirmCalendarExport = confirmCalendarExport;
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootPolish);
  }else{
    bootPolish();
  }
})();
