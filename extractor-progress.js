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

window.addEventListener("DOMContentLoaded", ensureScreenshotProgressUI);
