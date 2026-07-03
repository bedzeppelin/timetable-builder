function ensureScreenshotProgressUI(){
  const status = document.getElementById("screenshotStatus");
  if(!status) return null;
  let progress = document.getElementById("screenshotProgress");
  if(!progress){
    progress = document.createElement("div");
    progress.id = "screenshotProgress";
    progress.className = "screenshotProgress";
    progress.innerHTML = `
      <div class="screenshotProgressTrack">
        <div class="screenshotProgressBar" id="screenshotProgressBar"></div>
      </div>
      <div class="screenshotProgressText" id="screenshotProgressText">Waiting for screenshots</div>
    `;
    status.insertAdjacentElement("afterend", progress);
  }
  if(!document.getElementById("screenshotProgressStyles")){
    const style = document.createElement("style");
    style.id = "screenshotProgressStyles";
    style.textContent = `
      .screenshotProgress{display:none;gap:7px;margin-top:9px}
      .screenshotProgress.active{display:grid}
      .screenshotProgressTrack{height:10px;border-radius:999px;background:#e8e8e5;border:1px solid #d4d4ce;overflow:hidden}
      .screenshotProgressBar{height:100%;width:0%;background:#111;border-radius:999px;transition:width .28s cubic-bezier(.2,.8,.2,1)}
      .screenshotProgressText{font-size:.78rem;color:#686868;line-height:1.35}
      #screenshotImportModalOverlay.isExtracting .modalActions button{opacity:.55;pointer-events:none}
    `;
    document.head.appendChild(style);
  }
  return progress;
}

function setScreenshotProgress(percent, message){
  const progress = ensureScreenshotProgressUI();
  const bar = document.getElementById("screenshotProgressBar");
  const text = document.getElementById("screenshotProgressText");
  if(progress) progress.classList.add("active");
  if(bar) bar.style.width = Math.max(0, Math.min(100, percent)) + "%";
  if(text) text.textContent = message || "Working...";
  const status = document.getElementById("screenshotStatus");
  if(status && message) status.textContent = message;
}

function resetScreenshotProgress(){
  const progress = document.getElementById("screenshotProgress");
  const bar = document.getElementById("screenshotProgressBar");
  const text = document.getElementById("screenshotProgressText");
  if(bar) bar.style.width = "0%";
  if(text) text.textContent = "Waiting for screenshots";
  if(progress) progress.classList.remove("active");
}

function setScreenshotExtractorBusy(isBusy){
  const modal = document.getElementById("screenshotImportModalOverlay");
  if(modal) modal.classList.toggle("isExtracting", isBusy);
}

function parseExtractorJson(text){
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try{
    return JSON.parse(cleaned);
  }catch(err){
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if(start >= 0 && end > start){
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw err;
  }
}

window.extractScheduleFromScreenshots = async function extractScheduleFromScreenshotsWithProgress(){
  if(!screenshotFiles.length){
    alert("Choose screenshot images first.");
    return;
  }

  const mode = document.getElementById("screenshotImportMode").value;
  setScreenshotExtractorBusy(true);
  setScreenshotProgress(8, "Preparing screenshots...");

  try{
    const images = [];
    for(let i = 0; i < screenshotFiles.length; i++){
      images.push(await fileToDataUrl(screenshotFiles[i]));
      const pct = 12 + Math.round(((i + 1) / screenshotFiles.length) * 28);
      setScreenshotProgress(pct, `Reading screenshot ${i + 1} of ${screenshotFiles.length}...`);
    }

    setScreenshotProgress(45, "Sending screenshots to GPT...");
    const response = await fetch("/api/extract-schedule", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({images})
    });

    setScreenshotProgress(78, "GPT response received. Checking result...");
    const payload = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error(payload.error || payload.details || "Extraction failed.");
    }

    setScreenshotProgress(88, "Importing timetable data...");
    const parser = typeof extractJsonFromText === "function" ? extractJsonFromText : parseExtractorJson;
    const data = parser(payload.text || payload.json || "");
    importDataObject(data, mode);

    setScreenshotProgress(100, "Import complete.");
    setTimeout(() => {
      clearScreenshotFiles();
      resetScreenshotProgress();
      closeScreenshotImport();
    }, 650);
  }catch(error){
    setScreenshotProgress(100, "Extraction failed. Try fewer screenshots or use Paste GPT JSON.");
    alert("Screenshot extraction failed: " + (error.message || String(error)));
  }finally{
    setScreenshotExtractorBusy(false);
  }
};

window.exportICS = function exportICSWithCourseColorMetadata(){
  const meetings = enabledMeetings();
  if(!meetings.length){
    alert("There are no visible selected meetings to export.");
    return;
  }
  const monday = prompt("Enter the first Monday date of the semester/session (YYYY-MM-DD):", "");
  if(!monday) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(monday)){
    alert("Use YYYY-MM-DD format.");
    return;
  }
  const weeksRaw = prompt("How many weeks should repeat?", "12");
  if(!weeksRaw) return;
  const weeks = Math.max(1, Math.min(52, Number(weeksRaw) || 12));
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
      `Course: ${m.courseTitle || ""}`,
      `Component: ${componentText(m)}`,
      courseColor ? `Timetable Studio color: ${courseColor}` : ""
    ].filter(Boolean).join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(m.courseId)}-${icsEscape(m.id)}-${Date.now()}@timetable-studio`,
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
  const blob = new Blob([lines.filter(Boolean).join("\r\n")], {type:"text/calendar;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(current().title || "schedule").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-schedule.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
};

/* Preset generator settings + smarter local solver */
const PRESET_DEFINITIONS = [
  {id:"condensed", label:"Condensed days", description:"Fewer campus days first, then fewer gaps."},
  {id:"spread", label:"Spread out", description:"Spreads classes across more days and avoids overloaded days."},
  {id:"late", label:"Latest starts", description:"Avoids early mornings where possible."},
  {id:"balanced", label:"Balanced", description:"A general-purpose mix of fewer gaps, moderate day length, and fewer conflicts."},
  {id:"fewestGaps", label:"Fewest gaps", description:"Minimizes awkward breaks between classes."},
  {id:"shortestDays", label:"Shortest campus days", description:"Avoids very long days on campus."},
  {id:"noEarly", label:"No early mornings", description:"Strongly avoids anything before 10 AM."},
  {id:"noEvening", label:"No evening classes", description:"Strongly avoids anything after 6 PM."},
  {id:"commute", label:"Commute-friendly", description:"Fewer campus days, fewer gaps, and fewer early starts."}
];

function ensurePresetGeneratorStyles(){
  if(document.getElementById("presetGeneratorStyles")) return;
  const style = document.createElement("style");
  style.id = "presetGeneratorStyles";
  style.textContent = `
    .presetDisclaimer{border:1px solid #d4d4ce;background:#f7f7f5;border-radius:16px;padding:11px;display:grid;gap:6px}
    .presetGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .presetOptionBox{border:1px solid #e5e5e1;background:#fff;border-radius:15px;padding:10px;display:grid;gap:7px}
    .presetOptionBox h3{margin:0 0 2px;font-size:.88rem}
    .presetCheck{display:flex;gap:8px;align-items:flex-start;font-size:.80rem;color:#444;font-weight:750}
    .presetCheck input{width:auto;margin:2px 0 0;accent-color:#111}
    .presetSubtext{font-size:.72rem;color:#686868;line-height:1.35;margin-top:-3px}
    .presetTypeList{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .presetTypeCard{border:1px solid #e5e5e1;border-radius:14px;padding:9px;background:#fff}
    .presetTypeCard label{display:flex;gap:8px;align-items:flex-start;margin:0;color:#222}
    .presetTypeCard input{width:auto;margin:3px 0 0;accent-color:#111}
    .presetTypeTitle{font-weight:900;font-size:.82rem}
    .presetTypeDesc{font-size:.70rem;color:#686868;line-height:1.35;margin-top:3px}
    @media (max-width:720px){.presetGrid,.presetTypeList{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function ensurePresetGeneratorModal(){
  if(document.getElementById("presetGeneratorModalOverlay")) return;
  ensurePresetGeneratorStyles();
  const overlay = document.createElement("div");
  overlay.className = "modalOverlay";
  overlay.id = "presetGeneratorModalOverlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Generate schedule presets</h2>
      <div class="formStack">
        <div class="presetDisclaimer small">
          <b>How this works, in plain language:</b>
          <span>The app looks at the courses and options in your current timetable tab, tries different combinations, and makes new timetable tabs based on the preset types you choose. It is not checking enrolment availability or degree requirements. Hidden courses/options are ignored by default, and you should always review the final schedule manually.</span>
        </div>
        <div class="presetGrid">
          <div class="presetOptionBox">
            <h3>Courses to use</h3>
            <label class="presetCheck"><input type="checkbox" id="pgCourseVisible" checked> Visible courses</label>
            <label class="presetCheck"><input type="checkbox" id="pgCourseShadow" checked> Shadow courses</label>
            <label class="presetCheck"><input type="checkbox" id="pgCourseHidden"> Hidden courses</label>
            <div class="presetSubtext">Hidden courses are excluded unless you turn them on here.</div>
          </div>
          <div class="presetOptionBox">
            <h3>Options to use</h3>
            <label class="presetCheck"><input type="checkbox" id="pgOptionSelected" checked> Selected options</label>
            <label class="presetCheck"><input type="checkbox" id="pgOptionShadow" checked> Shadow alternatives</label>
            <label class="presetCheck"><input type="checkbox" id="pgOptionHidden"> Hidden alternatives</label>
            <div class="presetSubtext">Hidden alternatives stay out by default, so “Hide alts” really cleans the solver.</div>
          </div>
          <div class="presetOptionBox">
            <h3>Rules</h3>
            <label class="presetCheck"><input type="checkbox" id="pgRespectComponents" checked> Respect hidden component controls</label>
            <label class="presetCheck"><input type="checkbox" id="pgLockSelected"> Lock current selected choices</label>
            <div class="presetSubtext">Locking selected choices means the solver will not swap selected tutorials/practicals for alternatives.</div>
          </div>
          <div class="presetOptionBox">
            <h3>Solver limits</h3>
            <label>Search depth
              <select id="pgSearchDepth">
                <option value="250">Fast</option>
                <option value="500" selected>Balanced</option>
                <option value="900">Thorough</option>
              </select>
            </label>
            <div class="presetSubtext">Higher depth can find better schedules, but may take longer with lots of tutorials/practicals.</div>
          </div>
        </div>
        <div class="presetOptionBox">
          <h3>Preset types to generate</h3>
          <div class="presetTypeList">
            ${PRESET_DEFINITIONS.map(def => `
              <div class="presetTypeCard">
                <label>
                  <input class="pgPresetType" type="checkbox" value="${def.id}" ${["condensed","spread","late","balanced"].includes(def.id) ? "checked" : ""}>
                  <span>
                    <span class="presetTypeTitle">${def.label}</span>
                    <span class="presetTypeDesc">${def.description}</span>
                  </span>
                </label>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
      <div class="modalActions">
        <button class="secondary" onclick="closePresetGeneratorModal()">Cancel</button>
        <button onclick="runPresetGeneratorFromModal()">Generate selected presets</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closePresetGeneratorModal(){
  const overlay = document.getElementById("presetGeneratorModalOverlay");
  if(overlay) overlay.style.display = "none";
}

function getPresetGeneratorSettings(){
  return {
    includeVisibleCourses:document.getElementById("pgCourseVisible").checked,
    includeShadowCourses:document.getElementById("pgCourseShadow").checked,
    includeHiddenCourses:document.getElementById("pgCourseHidden").checked,
    includeSelectedOptions:document.getElementById("pgOptionSelected").checked,
    includeShadowOptions:document.getElementById("pgOptionShadow").checked,
    includeHiddenOptions:document.getElementById("pgOptionHidden").checked,
    respectComponentVisibility:document.getElementById("pgRespectComponents").checked,
    lockSelectedChoices:document.getElementById("pgLockSelected").checked,
    beamLimit:Number(document.getElementById("pgSearchDepth").value) || 500,
    presetIds:Array.from(document.querySelectorAll(".pgPresetType:checked")).map(input => input.value)
  };
}

function courseAllowedForPreset(course, settings){
  const visibility = courseVisibility(course);
  if(visibility === "visible") return settings.includeVisibleCourses;
  if(visibility === "shadow") return settings.includeShadowCourses;
  if(visibility === "hidden") return settings.includeHiddenCourses;
  return true;
}

function componentAllowedForPreset(course, component, settings){
  if(!settings.respectComponentVisibility) return true;
  return effectiveComponentVisibility(course, component) !== "hidden";
}

function groupSelected(optionMeetings){
  return optionMeetings.some(m => meetingSelected(m));
}

function groupHidden(optionMeetings){
  return optionMeetings.every(m => !meetingSelected(m) && optionVisibility(m) === "hidden");
}

function allowedOptionGroup(optionMeetings, settings){
  const selected = groupSelected(optionMeetings);
  const hidden = groupHidden(optionMeetings);
  if(selected) return settings.includeSelectedOptions;
  if(hidden) return settings.includeHiddenOptions;
  return settings.includeShadowOptions;
}

function optionGroupsForCourse(course, settings){
  const groupsByComponent = {};
  (course.meetings || []).forEach(m => {
    const component = componentName(m.type);
    if(!componentAllowedForPreset(course, component, settings)) return;
    const key = optionGroupKey(m);
    if(!groupsByComponent[component]) groupsByComponent[component] = {};
    if(!groupsByComponent[component][key]) groupsByComponent[component][key] = [];
    groupsByComponent[component][key].push(m);
  });

  const componentOptions = [];
  Object.entries(groupsByComponent).forEach(([component, groups]) => {
    let options = Object.values(groups).filter(group => allowedOptionGroup(group, settings));
    const selectedOptions = options.filter(group => groupSelected(group));
    if(settings.lockSelectedChoices && selectedOptions.length){
      options = selectedOptions;
    }
    if(options.length){
      componentOptions.push({component, options});
    }
  });
  return componentOptions;
}

function courseChoicesForPreset(course, settings){
  const componentOptions = optionGroupsForCourse(course, settings);
  if(!componentOptions.length) return [{ids:[], selectedMisses:0, hiddenUsed:0, shadowUsed:0}];

  let choices = [{ids:[], selectedMisses:0, hiddenUsed:0, shadowUsed:0}];
  componentOptions.forEach(({options}) => {
    const next = [];
    choices.forEach(choice => {
      options.forEach(group => {
        const selected = groupSelected(group);
        const hidden = groupHidden(group);
        next.push({
          ids:choice.ids.concat(group.map(m => m.id)),
          selectedMisses:choice.selectedMisses + (selected ? 0 : 1),
          hiddenUsed:choice.hiddenUsed + (hidden ? 1 : 0),
          shadowUsed:choice.shadowUsed + (!selected && !hidden ? 1 : 0)
        });
      });
    });
    next.sort((a,b) => (a.selectedMisses - b.selectedMisses) || (a.hiddenUsed - b.hiddenUsed) || (a.shadowUsed - b.shadowUsed));
    choices = next.slice(0, Math.max(40, Math.floor(settings.beamLimit / 2)));
  });
  return choices;
}

function presetStats(meetings){
  let conflicts = 0;
  for(let i=0;i<meetings.length;i++){
    for(let j=i+1;j<meetings.length;j++){
      const a = meetings[i], b = meetings[j];
      if(a.day === b.day && timeToMin(a.start) < timeToMin(b.end) && timeToMin(b.start) < timeToMin(a.end)) conflicts++;
    }
  }

  const byDay = {};
  meetings.forEach(m => {
    if(!byDay[m.day]) byDay[m.day] = [];
    byDay[m.day].push(m);
  });

  const activeDayCount = Object.keys(byDay).length;
  let gaps = 0, span = 0, maxSpan = 0, earliestStart = 24*60, latestEnd = 0;
  let earlyPenalty = 0, eveningPenalty = 0, totalBusy = 0, maxBusy = 0;
  const busyByDay = [];

  Object.values(byDay).forEach(dayMeetings => {
    const sorted = dayMeetings.slice().sort((a,b) => timeToMin(a.start) - timeToMin(b.start));
    const first = Math.min(...sorted.map(m => timeToMin(m.start)));
    const last = Math.max(...sorted.map(m => timeToMin(m.end)));
    const busy = sorted.reduce((sum,m) => sum + timeToMin(m.end) - timeToMin(m.start), 0);
    const daySpan = last - first;
    earliestStart = Math.min(earliestStart, first);
    latestEnd = Math.max(latestEnd, last);
    span += daySpan;
    maxSpan = Math.max(maxSpan, daySpan);
    gaps += Math.max(0, daySpan - busy);
    earlyPenalty += Math.max(0, (10*60) - first);
    eveningPenalty += Math.max(0, last - (18*60));
    totalBusy += busy;
    maxBusy = Math.max(maxBusy, busy);
    busyByDay.push(busy);
  });

  const avgBusy = busyByDay.length ? totalBusy / busyByDay.length : 0;
  const imbalance = busyByDay.reduce((sum,busy) => sum + Math.abs(busy - avgBusy), 0);

  return {conflicts, activeDays:activeDayCount, gaps, span, maxSpan, earliestStart, latestEnd, earlyPenalty, eveningPenalty, totalBusy, maxBusy, imbalance};
}

function presetScore(meetings, presetId, candidate){
  const s = presetStats(meetings);
  let score = s.conflicts * 1000000;
  score += (candidate.selectedMisses || 0) * 85;
  score += (candidate.hiddenUsed || 0) * 200;
  if(presetId === "condensed") score += s.activeDays * 1100 + s.gaps * 2 + s.span * .12;
  if(presetId === "spread") score += s.maxBusy * 4 + s.maxSpan * 2 - s.activeDays * 650 + s.imbalance * 2;
  if(presetId === "late") score += s.earlyPenalty * 8 + s.gaps * 1.2 + s.activeDays * 80;
  if(presetId === "balanced") score += s.gaps * 2.6 + s.maxSpan * 2.5 + s.imbalance * 2.5 + Math.abs(s.activeDays - 4) * 180;
  if(presetId === "fewestGaps") score += s.gaps * 10 + s.activeDays * 70 + s.maxSpan * .5;
  if(presetId === "shortestDays") score += s.maxSpan * 7 + s.span * .8 + s.gaps * 2;
  if(presetId === "noEarly") score += s.earlyPenalty * 13 + s.gaps * 1.2 + s.activeDays * 70;
  if(presetId === "noEvening") score += s.eveningPenalty * 13 + s.latestEnd * .7 + s.gaps;
  if(presetId === "commute") score += s.activeDays * 1250 + s.gaps * 5 + s.earlyPenalty * 4 + s.maxSpan * .8;
  return score;
}

function meetingsForCourseChoice(sourceCourse, choice){
  const ids = new Set(choice.ids || []);
  return (sourceCourse.meetings || [])
    .filter(m => ids.has(m.id))
    .map(m => ({...m, courseId:sourceCourse.id, courseTitle:sourceCourse.title, color:sourceCourse.color}));
}

function findBestPresetCandidate(source, presetId, settings){
  const usableCourses = (source.courses || []).filter(course => courseAllowedForPreset(course, settings) && (course.meetings || []).length);
  let candidates = [{idsByCourse:{}, includedCourseIds:[], meetings:[], selectedMisses:0, hiddenUsed:0, shadowUsed:0}];

  usableCourses.forEach(course => {
    const courseChoices = courseChoicesForPreset(course, settings);
    if(!courseChoices.length) return;

    const next = [];
    candidates.forEach(candidate => {
      courseChoices.forEach(choice => {
        const courseMeetings = meetingsForCourseChoice(course, choice);
        if(!courseMeetings.length && (course.meetings || []).length) return;
        const combined = {
          idsByCourse:{...candidate.idsByCourse, [course.id]:choice.ids},
          includedCourseIds:candidate.includedCourseIds.concat(course.id),
          meetings:candidate.meetings.concat(courseMeetings),
          selectedMisses:candidate.selectedMisses + choice.selectedMisses,
          hiddenUsed:candidate.hiddenUsed + choice.hiddenUsed,
          shadowUsed:candidate.shadowUsed + choice.shadowUsed
        };
        combined.score = presetScore(combined.meetings, presetId, combined);
        next.push(combined);
      });
    });
    next.sort((a,b) => a.score - b.score);
    candidates = next.slice(0, settings.beamLimit);
  });

  candidates.sort((a,b) => presetScore(a.meetings, presetId, a) - presetScore(b.meetings, presetId, b));
  return candidates[0] || null;
}

function formatMinutesAsHours(minutes){
  return (minutes / 60).toFixed(minutes % 60 ? 1 : 0) + "h";
}

function presetNotes(def, candidate, settings){
  const stats = presetStats(candidate.meetings || []);
  const visibleDays = activeDays.length || 5;
  const freeDays = Math.max(0, visibleDays - stats.activeDays);
  const conflictLine = stats.conflicts ? `Warning: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"} found. Review manually.` : "No conflicts found by the local checker.";
  return [
    `Generated preset: ${def.label}`,
    "",
    "How it was made: Timetable Studio tried combinations from the current tab and picked the one that best matched this preset. Hidden courses/options were ignored unless enabled in the preset settings. This does not check enrolment availability or degree requirements.",
    "",
    conflictLine,
    `Active days: ${stats.activeDays}`,
    `Free visible days: ${freeDays}`,
    `Total gaps: ${formatMinutesAsHours(stats.gaps)}`,
    `Longest campus day: ${formatMinutesAsHours(stats.maxSpan)}`,
    `Selected choices changed: ${candidate.selectedMisses || 0}`,
    `Hidden alternatives used: ${candidate.hiddenUsed || 0}`
  ].join("\n");
}

function buildPresetTimetableFromCandidate(source, def, candidate, settings){
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = uid("tt");
  copy.title = `${source.title} · ${def.label}`;
  copy.notes = presetNotes(def, candidate, settings);

  const included = new Set(candidate.includedCourseIds || []);
  copy.courses.forEach(course => {
    if(!included.has(course.id)){
      setCourseVisibility(course, "hidden");
      return;
    }

    setCourseVisibility(course, "visible");
    const chosen = new Set((candidate.idsByCourse && candidate.idsByCourse[course.id]) || []);
    (course.meetings || []).forEach(m => {
      if(chosen.has(m.id)){
        m.selected = true;
        m.optionVisibility = "visible";
      }else{
        m.selected = false;
        m.optionVisibility = "hidden";
      }
    });
  });

  return copy;
}

function runPresetGeneratorFromModal(){
  const settings = getPresetGeneratorSettings();
  if(!settings.presetIds.length){
    alert("Choose at least one preset type.");
    return;
  }
  if(!settings.includeVisibleCourses && !settings.includeShadowCourses && !settings.includeHiddenCourses){
    alert("Choose at least one course visibility type.");
    return;
  }
  if(!settings.includeSelectedOptions && !settings.includeShadowOptions && !settings.includeHiddenOptions){
    alert("Choose at least one option type.");
    return;
  }

  const source = current();
  if(!source.courses.some(c => (c.meetings || []).length)){
    alert("Add or import courses first.");
    return;
  }

  const generated = [];
  const warnings = [];

  settings.presetIds.forEach(id => {
    const def = PRESET_DEFINITIONS.find(p => p.id === id);
    if(!def) return;
    const best = findBestPresetCandidate(source, id, settings);
    if(!best || !best.meetings.length){
      warnings.push(`${def.label}: no usable combination found.`);
      return;
    }
    const tab = buildPresetTimetableFromCandidate(source, def, best, settings);
    const stats = presetStats(best.meetings);
    if(stats.conflicts) warnings.push(`${def.label}: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}.`);
    generated.push(tab);
  });

  if(!generated.length){
    alert("No preset tabs could be generated with the current settings. Try allowing shadow alternatives or visible courses.");
    return;
  }

  state.timetables.push(...generated);
  state.activeTimetableId = generated[0].id;
  persist();
  render();
  closePresetGeneratorModal();

  const message = [`Generated ${generated.length} preset tab${generated.length === 1 ? "" : "s"}.`];
  if(warnings.length){
    message.push("", "Review notes:", ...warnings.slice(0, 6));
  }
  alert(message.join("\n"));
}

function openPresetGeneratorModal(){
  ensurePresetGeneratorModal();
  document.getElementById("presetGeneratorModalOverlay").style.display = "flex";
}

window.generateSchedulePresets = openPresetGeneratorModal;
window.closePresetGeneratorModal = closePresetGeneratorModal;
window.runPresetGeneratorFromModal = runPresetGeneratorFromModal;
window.addEventListener("DOMContentLoaded", ensureScreenshotProgressUI);
