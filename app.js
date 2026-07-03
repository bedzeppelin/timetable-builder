const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DEFAULT_COLORS = ["#dbeafe","#dcfce7","#fef3c7","#fae8ff","#ffedd5","#e0e7ff","#ccfbf1","#fee2e2","#e7e5e4","#f5f5f4"];

function uid(prefix="id"){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function newTimetable(title){
  return {
    id:uid("tt"),
    title,
    startHour:8,
    endHour:20,
    snap:15,
    viewMode:"weekdays",
    customDays:["Monday","Tuesday","Wednesday","Thursday","Friday"],
    showShadows:true,
    componentVisibility:{Lecture:"visible", Tutorial:"visible", Practical:"visible", Other:"visible"},
    notes:"",
    courses:[]
  };
}

let state = JSON.parse(localStorage.getItem("multiTimetableState") || "null") || {
  activeTimetableId:null,
  timetables:[newTimetable("Fall"), newTimetable("Winter")]
};
if(!state.activeTimetableId) state.activeTimetableId = state.timetables[0].id;

let activeDays = [];
let rows = 0;
let mode = null;
let dragData = null;
let editingCourseId = null;
let editingMeeting = null;
let isRestoringHistory = false;
let historyPast = [];
let historyFuture = [];
let lastPersistJson = JSON.stringify(state);
let contextTarget = null;

const grid = document.getElementById("calendarGrid");
const eventLayer = document.getElementById("eventLayer");
const selectionLayer = document.getElementById("selectionLayer");
const wrap = document.getElementById("calendarWrap");

function current(){
  let t = state.timetables.find(x => x.id === state.activeTimetableId);
  if(!t){
    t = state.timetables[0] || newTimetable("Timetable 1");
    if(!state.timetables.length) state.timetables.push(t);
    state.activeTimetableId = t.id;
  }
  return t;
}

function persist(options={}){
  const json = JSON.stringify(state);
  const shouldTrack = options.history !== false && !isRestoringHistory && !mode && json !== lastPersistJson;
  if(shouldTrack){
    historyPast.push(lastPersistJson);
    if(historyPast.length > 100) historyPast.shift();
    historyFuture = [];
    lastPersistJson = json;
  }else if(!isRestoringHistory && json !== lastPersistJson && options.history === false){
    // Keep local storage fresh during drag without adding tiny drag steps to undo history.
  }else if(!isRestoringHistory && json !== lastPersistJson && !mode){
    lastPersistJson = json;
  }
  localStorage.setItem("multiTimetableState", json);
  updateUndoRedoButtons();
}
function updateUndoRedoButtons(){
  const undo = document.getElementById("undoBtn");
  const redo = document.getElementById("redoBtn");
  if(undo) undo.disabled = historyPast.length === 0;
  if(redo) redo.disabled = historyFuture.length === 0;
}
function restoreStateFromJson(json){
  isRestoringHistory = true;
  state = JSON.parse(json);
  if(!state.activeTimetableId || !state.timetables.some(t => t.id === state.activeTimetableId)){
    state.activeTimetableId = state.timetables[0]?.id;
  }
  lastPersistJson = JSON.stringify(state);
  localStorage.setItem("multiTimetableState", lastPersistJson);
  render();
  isRestoringHistory = false;
  updateUndoRedoButtons();
}
function undoAction(){
  if(!historyPast.length) return;
  const currentJson = JSON.stringify(state);
  historyFuture.push(currentJson);
  const previous = historyPast.pop();
  restoreStateFromJson(previous);
}
function redoAction(){
  if(!historyFuture.length) return;
  const currentJson = JSON.stringify(state);
  historyPast.push(currentJson);
  const next = historyFuture.pop();
  restoreStateFromJson(next);
}

function pad(n){ return String(n).padStart(2,"0"); }
function timeToMin(t){
  const [h,m] = t.split(":").map(Number);
  return h*60 + m;
}
function minToTime(min){
  min = Math.max(0, Math.min(24*60, min));
  return `${pad(Math.floor(min/60))}:${pad(min%60)}`;
}
function minToLabel(min){
  let h = Math.floor(min/60), m = min%60;
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}${m ? ":" + pad(m) : ""} ${ap}`;
}
function snapMin(min){
  const t = current();
  const s = Number(t.snap);
  return Math.round(min / s) * s;
}
function isHex(value){
  return /^#[0-9A-Fa-f]{6}$/.test(value || "");
}
function safeHex(value, fallback="#dbeafe"){
  return isHex(value) ? value.toLowerCase() : fallback;
}
function getDays(){
  const t = current();
  if(t.viewMode === "fullweek") return ALL_DAYS;
  if(t.viewMode === "custom") return t.customDays.length ? t.customDays : ["Monday"];
  return ["Monday","Tuesday","Wednesday","Thursday","Friday"];
}
function dayIndex(day){ return activeDays.indexOf(day); }
function colorForIndex(i){ return DEFAULT_COLORS[i % DEFAULT_COLORS.length]; }
const COMPONENTS = ["Lecture","Tutorial","Practical","Other"];
const VISIBILITY_VALUES = ["visible","shadow","hidden"];

function meetingSelected(meeting){
  return meeting.selected !== false;
}
function optionVisibility(meeting){
  if(meeting.optionVisibility) return meeting.optionVisibility;
  return meetingSelected(meeting) ? "visible" : "shadow";
}
function setOptionVisibility(meeting, visibility){
  meeting.optionVisibility = visibility;
}
function courseVisibility(course){
  if(course.visibility) return course.visibility;
  return course.enabled === false ? "shadow" : "visible";
}
function setCourseVisibility(course, visibility){
  course.visibility = visibility;
  course.enabled = visibility === "visible";
}
function courseIsActive(course){
  return courseVisibility(course) === "visible";
}
function courseIsHidden(course){
  return courseVisibility(course) === "hidden";
}
function ensureComponentVisibility(obj){
  if(!obj.componentVisibility) obj.componentVisibility = {};
  COMPONENTS.forEach(c => {
    if(!obj.componentVisibility[c]) obj.componentVisibility[c] = "visible";
  });
  return obj.componentVisibility;
}
function globalComponentVisibility(type){
  const t = current();
  ensureComponentVisibility(t);
  return t.componentVisibility[componentName(type)] || "visible";
}
function courseComponentVisibility(course, type){
  ensureComponentVisibility(course);
  return course.componentVisibility[componentName(type)] || "visible";
}
function setGlobalComponentVisibility(type, visibility){
  ensureComponentVisibility(current());
  current().componentVisibility[componentName(type)] = visibility;
}
function setCourseComponentVisibility(course, type, visibility){
  ensureComponentVisibility(course);
  course.componentVisibility[componentName(type)] = visibility;
}
function effectiveComponentVisibility(course, type){
  const global = globalComponentVisibility(type);
  const local = courseComponentVisibility(course, type);
  if(global === "hidden" || local === "hidden") return "hidden";
  if(global === "shadow" || local === "shadow") return "shadow";
  return "visible";
}
function meetingHidden(course, meeting){
  if(courseIsHidden(course)) return true;
  if(effectiveComponentVisibility(course, meeting.type) === "hidden") return true;
  if(!meetingSelected(meeting) && optionVisibility(meeting) === "hidden") return true;
  return false;
}
function meetingActive(course, meeting){
  return courseIsActive(course) && effectiveComponentVisibility(course, meeting.type) === "visible" && meetingSelected(meeting);
}
function optionGroupKey(meeting){
  return `${componentName(meeting.type)}::${meeting.section || meeting.id}`;
}
function allMeetings(includeShadows=false){
  const t = current();
  const out = [];
  t.courses.forEach(course => {
    (course.meetings || []).forEach(meeting => {
      if(meetingHidden(course, meeting)) return;
      if(!includeShadows && !meetingActive(course, meeting)) return;
      const compVisibility = effectiveComponentVisibility(course, meeting.type);
      out.push({
        ...meeting,
        courseId:course.id,
        courseTitle:course.title,
        color:course.color,
        courseEnabled:courseIsActive(course),
        courseVisibility:courseVisibility(course),
        componentVisibility:compVisibility,
        optionVisibility:optionVisibility(meeting),
        meetingSelected:meetingSelected(meeting),
        active:meetingActive(course, meeting)
      });
    });
  });
  return out;
}
function enabledMeetings(){
  return allMeetings(false).filter(m => activeDays.includes(m.day));
}

function renderTabs(){
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  state.timetables.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "tab" + (t.id === state.activeTimetableId ? " active" : "");
    btn.textContent = t.title;
    btn.onclick = () => {
      state.activeTimetableId = t.id;
      persist();
      render();
    };
    btn.addEventListener("contextmenu", e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        {label:"Rename tab", action:() => { state.activeTimetableId = t.id; renameTimetable(); }},
        {label:"Duplicate tab", action:() => { state.activeTimetableId = t.id; duplicateTimetable(); }},
        {label:"Delete tab", action:() => { state.activeTimetableId = t.id; deleteTimetable(); }}
      ]);
    });
    tabs.appendChild(btn);
  });
  const add = document.createElement("button");
  add.className = "tab add";
  add.textContent = "+ New timetable";
  add.onclick = addTimetable;
  tabs.appendChild(add);
}

function addTimetable(){
  const name = prompt("Name this timetable:", "New timetable");
  if(!name) return;
  const t = newTimetable(name.trim());
  state.timetables.push(t);
  state.activeTimetableId = t.id;
  persist();
  render();
}

function renameTimetable(){
  const t = current();
  const name = prompt("Rename timetable:", t.title);
  if(!name) return;
  t.title = name.trim();
  persist();
  render();
}

function duplicateTimetable(){
  const source = current();
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = uid("tt");
  copy.title = source.title + " copy";
  copy.courses.forEach(c => {
    const oldId = c.id;
    c.id = uid("course");
    c.meetings = (c.meetings || []).map(m => ({...m, id:uid("meet")}));
  });
  state.timetables.push(copy);
  state.activeTimetableId = copy.id;
  persist();
  render();
}

function deleteTimetable(){
  if(state.timetables.length <= 1){
    alert("You need at least one timetable.");
    return;
  }
  const t = current();
  if(!confirm(`Delete "${t.title}"?`)) return;
  state.timetables = state.timetables.filter(x => x.id !== t.id);
  state.activeTimetableId = state.timetables[0].id;
  persist();
  render();
}

function applySettingsInputs(){
  const t = current();
  document.getElementById("startHour").value = t.startHour;
  document.getElementById("endHour").value = t.endHour;
  document.getElementById("snap").value = t.snap;
  document.getElementById("viewMode").value = t.viewMode;
  document.getElementById("showShadows").checked = !!t.showShadows;
  document.getElementById("notes").value = t.notes || "";
  document.getElementById("titleDisplay").textContent = t.title || "Timetable";
}

function buildDayToggles(){
  const t = current();
  const box = document.getElementById("dayToggles");
  box.innerHTML = "";
  ALL_DAYS.forEach(day => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" ${t.customDays.includes(day) ? "checked" : ""}> ${day.slice(0,3)}`;
    label.querySelector("input").addEventListener("change", e => {
      if(e.target.checked && !t.customDays.includes(day)) t.customDays.push(day);
      if(!e.target.checked) t.customDays = t.customDays.filter(d => d !== day);
      t.viewMode = "custom";
      applySettingsInputs();
      render();
    });
    box.appendChild(label);
  });
}

function updateSettings(){
  const t = current();
  const start = Number(document.getElementById("startHour").value);
  const end = Number(document.getElementById("endHour").value);
  if(end <= start){
    alert("End hour must be after start hour.");
    document.getElementById("endHour").value = t.endHour;
    return;
  }
  t.startHour = start;
  t.endHour = end;
  t.snap = Number(document.getElementById("snap").value);
  t.viewMode = document.getElementById("viewMode").value;
  t.showShadows = document.getElementById("showShadows").checked;
  render();
}

function renderGlobalComponentControls(){
  const box = document.getElementById("globalComponentControls");
  if(!box) return;
  ensureComponentVisibility(current());
  box.innerHTML = COMPONENTS.map(type => `
    <div class="componentControlRow">
      <span>${type}</span>
      <select class="componentVisibilitySelect globalCompSelect" data-component="${type}">
        <option value="visible" ${globalComponentVisibility(type) === "visible" ? "selected" : ""}>Visible</option>
        <option value="shadow" ${globalComponentVisibility(type) === "shadow" ? "selected" : ""}>Shadow</option>
        <option value="hidden" ${globalComponentVisibility(type) === "hidden" ? "selected" : ""}>Hidden</option>
      </select>
    </div>
  `).join("");
  box.querySelectorAll(".globalCompSelect").forEach(select => {
    select.addEventListener("change", e => {
      setGlobalComponentVisibility(select.dataset.component, e.target.value);
      persist();
      render();
    });
  });
}


document.getElementById("notes").addEventListener("input", () => {
  current().notes = document.getElementById("notes").value;
  persist();
});

function buildGrid(){
  const t = current();
  activeDays = getDays();
  rows = ((t.endHour - t.startHour) * 60) / t.snap;
  document.documentElement.style.setProperty("--days", activeDays.length);
  document.documentElement.style.setProperty("--rows", rows);
  document.documentElement.style.setProperty("--slot-h", t.snap === 60 ? "42px" : t.snap === 30 ? "28px" : "18px");

  grid.innerHTML = `<div class="corner"></div>`;
  activeDays.forEach((day, i) => {
    const head = document.createElement("div");
    head.className = "dayHead";
    head.style.gridColumn = i + 2;
    head.style.gridRow = 1;
    head.textContent = day;
    grid.appendChild(head);
  });

  for(let r = 0; r < rows; r++){
    const minutes = t.startHour * 60 + r * t.snap;
    const time = document.createElement("div");
    time.className = "timeCell";
    time.style.gridColumn = 1;
    time.style.gridRow = r + 2;
    time.textContent = minutes % 60 === 0 ? minToLabel(minutes) : "";
    grid.appendChild(time);

    activeDays.forEach((day, d) => {
      const cell = document.createElement("div");
      cell.className = "slot " + (minutes % 60 === 0 ? "hour" : "");
      cell.style.gridColumn = d + 2;
      cell.style.gridRow = r + 2;
      cell.dataset.day = day;
      cell.dataset.minute = minutes;
      cell.addEventListener("pointerdown", startCreate);
      grid.appendChild(cell);
    });
  }
}

function dims(){
  const t = current();
  return {
    gridW:grid.clientWidth,
    gridH:grid.clientHeight,
    dayW:(grid.clientWidth - 76) / activeDays.length,
    headH:48,
    timeCol:76,
    slotH:parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-h")),
    startMin:t.startHour * 60,
    endMin:t.endHour * 60,
    snap:t.snap
  };
}

function pointerToDayMinute(e){
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left + wrap.scrollLeft;
  const y = e.clientY - rect.top + wrap.scrollTop;
  const d = dims();
  const dayIdx = Math.max(0, Math.min(activeDays.length - 1, Math.floor((x - d.timeCol) / d.dayW)));
  const rawMin = d.startMin + ((y - d.headH) / d.slotH) * d.snap;
  const minute = Math.max(d.startMin, Math.min(d.endMin, snapMin(rawMin)));
  return {day:activeDays[dayIdx], dayIdx, minute};
}

function startCreate(e){
  if(e.button !== undefined && e.button !== 0) return;
  const pos = pointerToDayMinute(e);
  mode = "create";
  dragData = {day:pos.day, dayIdx:pos.dayIdx, start:pos.minute, end:pos.minute + current().snap};
  wrap.setPointerCapture?.(e.pointerId);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, {once:true});
  renderSelection();
}

function startMove(e, courseId, meetingId){
  if(e.target.classList.contains("resizeHandle")) return;
  if(e.button !== undefined && e.button !== 0) return;
  e.stopPropagation();
  const found = findMeeting(courseId, meetingId);
  if(!meetingActive(found.course, found.meeting)) return;
  const pos = pointerToDayMinute(e);
  mode = "move";
  dragData = {
    courseId,
    meetingId,
    offset: pos.minute - timeToMin(found.meeting.start),
    duration: timeToMin(found.meeting.end) - timeToMin(found.meeting.start)
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, {once:true});
}

function startResize(e, courseId, meetingId){
  if(e.button !== undefined && e.button !== 0) return;
  e.stopPropagation();
  const found = findMeeting(courseId, meetingId);
  if(!meetingActive(found.course, found.meeting)) return;
  mode = "resize";
  dragData = {courseId, meetingId, start:timeToMin(found.meeting.start)};
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, {once:true});
}

function onPointerMove(e){
  if(!mode || !dragData) return;
  const t = current();
  const pos = pointerToDayMinute(e);
  if(mode === "create"){
    dragData.end = Math.max(dragData.start + t.snap, pos.minute);
    if(pos.minute < dragData.start) {
      const originalStart = dragData.start;
      dragData.start = pos.minute;
      dragData.end = originalStart;
    }
    renderSelection();
  }
  if(mode === "move"){
    const found = findMeeting(dragData.courseId, dragData.meetingId);
    let newStart = pos.minute - dragData.offset;
    newStart = Math.max(t.startHour*60, Math.min(t.endHour*60 - dragData.duration, snapMin(newStart)));
    found.meeting.day = pos.day;
    found.meeting.start = minToTime(newStart);
    found.meeting.end = minToTime(newStart + dragData.duration);
    persist({history:false});
    renderEvents();
    renderMetrics();
    renderCourseBank();
  }
  if(mode === "resize"){
    const found = findMeeting(dragData.courseId, dragData.meetingId);
    let newEnd = Math.max(dragData.start + t.snap, pos.minute);
    newEnd = Math.min(t.endHour*60, newEnd);
    found.meeting.end = minToTime(newEnd);
    persist({history:false});
    renderEvents();
    renderMetrics();
    renderCourseBank();
  }
}

function onPointerUp(e){
  const endedMode = mode;
  selectionLayer.innerHTML = "";
  window.removeEventListener("pointermove", onPointerMove);
  if(mode === "create" && dragData){
    const title = "New course";
    const color = colorForIndex(current().courses.length);
    const course = {
      id:uid("course"),
      title,
      color,
      enabled:true,
      visibility:"visible",
      componentVisibility:{},
      meetings:[{
        id:uid("meet"),
        day:dragData.day,
        start:minToTime(Math.min(dragData.start, dragData.end)),
        end:minToTime(Math.max(dragData.start, dragData.end)),
        type:"Lecture",
        section:"",
        selected:true,
        location:"",
        notes:""
      }]
    };
    current().courses.push(course);
    persist();
    render();
    openMeetingModal(course.id, course.meetings[0].id, true);
  }
  mode = null;
  dragData = null;
  if(endedMode === "move" || endedMode === "resize"){
    persist();
    render();
  }
}

function renderSelection(){
  selectionLayer.innerHTML = "";
  if(!dragData) return;
  const d = dims();
  const start = Math.min(dragData.start, dragData.end);
  const end = Math.max(dragData.start + d.snap, dragData.end);
  const el = document.createElement("div");
  el.className = "selection";
  el.style.left = (d.timeCol + dragData.dayIdx * d.dayW + 5) + "px";
  el.style.top = (d.headH + ((start - d.startMin) / d.snap) * d.slotH + 2) + "px";
  el.style.width = (d.dayW - 10) + "px";
  el.style.height = Math.max(24, ((end - start) / d.snap) * d.slotH - 4) + "px";
  selectionLayer.appendChild(el);
}

function getConflicts(){
  const conflicts = [];
  const meetings = enabledMeetings();
  for(let i=0;i<meetings.length;i++){
    for(let j=i+1;j<meetings.length;j++){
      const a = meetings[i], b = meetings[j];
      if(a.day !== b.day) continue;
      if(timeToMin(a.start) < timeToMin(b.end) && timeToMin(b.start) < timeToMin(a.end)){
        conflicts.push([a,b]);
      }
    }
  }
  return conflicts;
}


function componentClass(type){
  const t = (type || "Other").toLowerCase();
  if(t.includes("lec")) return "lecture";
  if(t.includes("tut")) return "tutorial";
  if(t.includes("prac") || t.includes("lab")) return "practical";
  return "other";
}
function componentName(type){
  const cls = componentClass(type);
  if(cls === "lecture") return "Lecture";
  if(cls === "tutorial") return "Tutorial";
  if(cls === "practical") return "Practical";
  return type || "Other";
}
function componentText(m){
  const base = componentName(m.type);
  return m.section ? `${base} · ${m.section}` : base;
}
function normalizeComponent(type){
  const cls = componentClass(type);
  if(cls === "lecture") return "Lecture";
  if(cls === "tutorial") return "Tutorial";
  if(cls === "practical") return "Practical";
  return "Other";
}

function setDuration(minutes){
  const startInput = document.getElementById("mStart");
  const endInput = document.getElementById("mEnd");
  if(!startInput || !endInput || !startInput.value) return;
  endInput.value = minToTime(timeToMin(startInput.value) + minutes);
}

function renderEvents(){
  eventLayer.innerHTML = "";
  const t = current();
  const d = dims();
  const conflicts = getConflicts();
  const conflictKeys = new Set(conflicts.flat().map(m => `${m.courseId}:${m.id}`));

  const meetings = allMeetings(true).filter(m => activeDays.includes(m.day));
  meetings.forEach(m => {
    const isShadow = m.courseVisibility === "shadow" || m.componentVisibility === "shadow" || !m.meetingSelected;
    if(isShadow && !t.showShadows) return;
    const dayIdx = dayIndex(m.day);
    const start = timeToMin(m.start);
    const end = timeToMin(m.end);
    if(end <= d.startMin || start >= d.endMin) return;

    const top = d.headH + ((Math.max(start, d.startMin) - d.startMin) / d.snap) * d.slotH + 2;
    const height = Math.max(24, ((Math.min(end, d.endMin) - Math.max(start, d.startMin)) / d.snap) * d.slotH - 4);
    const left = d.timeCol + dayIdx * d.dayW + 5;
    const width = d.dayW - 10;

    const block = document.createElement("div");
    block.className = "eventBlock " + (isShadow ? "shadowBlock " : "") + (conflictKeys.has(`${m.courseId}:${m.id}`) ? "conflict" : "");
    block.style.left = left + "px";
    block.style.top = top + "px";
    block.style.width = width + "px";
    block.style.height = height + "px";
    block.style.background = m.color || "#dbeafe";
    block.innerHTML = `
      <div class="eventTitle">${escapeHtml(m.courseTitle || "Untitled")}</div>
      <div class="eventMeta">${m.start}–${m.end}${m.location ? " · " + escapeHtml(m.location) : ""}</div>
      <div class="eventMeta">${escapeHtml(componentText(m))}</div>
      ${isShadow ? `<div class="eventMeta"><b>${m.courseVisibility === "shadow" ? "course shadow" : m.componentVisibility === "shadow" ? "component shadow" : "option shadow · click to select"}</b></div>` : ""}
      <div class="resizeHandle" title="Drag to resize"></div>
    `;
    block.addEventListener("pointerdown", e => startMove(e, m.courseId, m.id));
    block.addEventListener("click", e => {
      e.stopPropagation();
      if(mode) return;
      if(m.courseVisibility === "visible" && !m.meetingSelected){
        selectMeetingOption(m.courseId, m.id);
        return;
      }
      openMeetingModal(m.courseId, m.id);
    });
    block.addEventListener("contextmenu", e => {
      e.preventDefault();
      showMeetingContextMenu(e.clientX, e.clientY, m.courseId, m.id);
    });
    block.querySelector(".resizeHandle").addEventListener("pointerdown", e => startResize(e, m.courseId, m.id));
    eventLayer.appendChild(block);
  });
}

function renderMetrics(){
  const t = current();
  const enabledCourses = t.courses.filter(c => courseVisibility(c) === "visible" && (c.meetings || []).length);
  const shadowCourses = t.courses.filter(c => courseVisibility(c) === "shadow" && (c.meetings || []).length);
  const meetings = enabledMeetings();
  const conflicts = getConflicts();
  const busy = meetings.reduce((sum,e) => sum + Math.max(0, timeToMin(e.end) - timeToMin(e.start)) / 60, 0);
  document.getElementById("courseCount").textContent = enabledCourses.length;
  document.getElementById("shadowCount").textContent = shadowCourses.length;
  document.getElementById("freeDayCount").textContent = activeDays.filter(day => !meetings.some(e => e.day === day)).length;
  document.getElementById("busyHours").textContent = busy.toFixed(1);
  document.getElementById("conflictCount").textContent = conflicts.length;

  const conflictBox = document.getElementById("conflictBox");
  conflictBox.className = "infoBox " + (conflicts.length ? "bad" : "good");
  if(conflicts.length){
    conflictBox.innerHTML = `<h3>Conflict check</h3><ul>${conflicts.map(([a,b]) => `<li><b>${a.day}:</b> ${escapeHtml(a.courseTitle)} overlaps ${escapeHtml(b.courseTitle)}</li>`).join("")}</ul>`;
  }else{
    conflictBox.innerHTML = `<h3>Conflict check</h3><div class="small">No conflicts among enabled courses.</div>`;
  }

  const load = activeDays.map(day => {
    const dayMeetings = meetings.filter(e => e.day === day);
    if(!dayMeetings.length) return `<b>${day}:</b> FREE`;
    const first = Math.min(...dayMeetings.map(e => timeToMin(e.start)));
    const last = Math.max(...dayMeetings.map(e => timeToMin(e.end)));
    const hrs = dayMeetings.reduce((sum,e) => sum + (timeToMin(e.end)-timeToMin(e.start))/60, 0);
    return `<b>${day}:</b> ${hrs.toFixed(1)} hrs · ${minToLabel(first)}–${minToLabel(last)}`;
  }).join("<br>");
  document.getElementById("dayLoad").innerHTML = load;
}

function renderCourseBank(){
  const bank = document.getElementById("courseBank");
  const t = current();
  bank.innerHTML = "";
  if(!t.courses.length){
    bank.innerHTML = `<div class="small">No courses yet. Drag on the timetable or click “Add course.”</div>`;
    return;
  }
  t.courses.forEach(course => {
    ensureComponentVisibility(course);
    const vis = courseVisibility(course);
    const details = document.createElement("details");
    details.className = "courseCard " + (vis === "hidden" ? "hiddenCourse" : vis === "shadow" ? "shadowCourse" : "");
    details.open = course.open === true;
    const meetings = course.meetings || [];
    const grouped = COMPONENTS.map(kind => {
      const items = meetings.filter(m => componentName(m.type) === kind || (kind === "Other" && !COMPONENTS.slice(0,3).includes(componentName(m.type))));
      if(!items.length) return "";
      const cls = componentClass(kind);
      const localCompVis = courseComponentVisibility(course, kind);
      const unselectedCount = items.filter(m => !meetingSelected(m)).length;
      const hiddenAltCount = items.filter(m => !meetingSelected(m) && optionVisibility(m) === "hidden").length;
      const lines = items.map(m => {
        const selected = meetingSelected(m);
        const optVis = optionVisibility(m);
        const warn = (m.notes || "").toUpperCase().includes("CHECK") ? ` <span class="checkWarn">CHECK</span>` : "";
        const status = selected 
          ? `<span class="optionStatus selected">selected</span>` 
          : `<span class="optionStatus ${optVis === "hidden" ? "hidden" : "shadow"}">${optVis}</span><button class="secondary optionSelect" data-course="${course.id}" data-meeting="${m.id}">select</button>`;
        return `<div>${m.day.slice(0,3)} ${m.start}–${m.end}${m.section ? " · " + escapeHtml(m.section) : ""}${m.location ? " · " + escapeHtml(m.location) : ""}${status}${warn}</div>`;
      }).join("");
      return `
        <div class="componentGroupBox">
          <div class="componentGroupHeader">
            <span class="componentPill ${cls}">${kind}</span>
            <div class="componentMiniControls">
              <select class="courseCompSelect" data-course="${course.id}" data-component="${kind}">
                <option value="visible" ${localCompVis === "visible" ? "selected" : ""}>Visible</option>
                <option value="shadow" ${localCompVis === "shadow" ? "selected" : ""}>Shadow</option>
                <option value="hidden" ${localCompVis === "hidden" ? "selected" : ""}>Hidden</option>
              </select>
              ${unselectedCount ? `<button class="secondary hideAltBtn" data-course="${course.id}" data-component="${kind}">Hide alts</button>` : ""}
              ${hiddenAltCount ? `<button class="secondary showAltBtn" data-course="${course.id}" data-component="${kind}">Show alts</button>` : ""}
            </div>
          </div>
          <div class="componentLine"><span>${lines}</span></div>
        </div>`;
    }).filter(Boolean).join("");

    const selectedCount = meetings.filter(m => meetingSelected(m)).length;
    details.innerHTML = `
      <summary>
        <div class="courseTop">
          <span class="courseChevron">›</span>
          <div>
            <div class="courseName">${escapeHtml(course.title || "Untitled")} <span class="visibilityBadge ${vis}">${vis}</span></div>
            <div class="courseMeta">${course.color || "#dbeafe"} · ${selectedCount}/${meetings.length} active block${meetings.length === 1 ? "" : "s"}</div>
          </div>
          <div class="swatch" style="background:${course.color || "#dbeafe"}"></div>
        </div>
      </summary>
      <div class="courseAccordionBody">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;flex-wrap:wrap;">
          <label style="margin:0;">Course visibility</label>
          <select class="visibilitySelect" data-course="${course.id}">
            <option value="visible" ${vis === "visible" ? "selected" : ""}>Visible</option>
            <option value="shadow" ${vis === "shadow" ? "selected" : ""}>Shadow</option>
            <option value="hidden" ${vis === "hidden" ? "selected" : ""}>Hidden</option>
          </select>
        </div>
        <div class="componentSummary">${grouped || `<span class="courseMeta">No lecture/tutorial/practical times yet</span>`}</div>
        <div class="courseButtons">
          <button class="secondary smallBtn editCourse">Edit course</button>
          <button class="secondary smallBtn addLecture">+ Lecture</button>
          <button class="secondary smallBtn addTutorial">+ Tutorial</button>
          <button class="secondary smallBtn addPractical">+ Practical</button>
          <button class="secondary smallBtn hideAllAlts">Hide all alts</button>
          <button class="ghost smallBtn duplicateCourse">Duplicate</button>
        </div>
      </div>
    `;
    details.addEventListener("toggle", () => {
      course.open = details.open;
      persist({history:false});
    });
    details.addEventListener("contextmenu", e => {
      e.preventDefault();
      showCourseContextMenu(e.clientX, e.clientY, course.id);
    });
    details.querySelector(".visibilitySelect").addEventListener("change", e => {
      setCourseVisibility(course, e.target.value);
      persist();
      render();
    });
    details.querySelectorAll(".courseCompSelect").forEach(select => {
      select.addEventListener("change", e => {
        setCourseComponentVisibility(course, select.dataset.component, e.target.value);
        persist();
        render();
      });
    });
    details.querySelectorAll(".hideAltBtn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        setAlternativeOptionsVisibility(btn.dataset.course, btn.dataset.component, "hidden");
      });
    });
    details.querySelectorAll(".showAltBtn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        setAlternativeOptionsVisibility(btn.dataset.course, btn.dataset.component, "shadow");
      });
    });
    details.querySelector(".hideAllAlts").addEventListener("click", e => {
      e.stopPropagation();
      COMPONENTS.forEach(type => setAlternativeOptionsVisibility(course.id, type, "hidden", false));
      persist();
      render();
    });
    details.querySelector(".editCourse").addEventListener("click", () => openCourseModal(course.id));
    details.querySelector(".addLecture").addEventListener("click", () => openNewMeeting(course.id, "Lecture"));
    details.querySelector(".addTutorial").addEventListener("click", () => openNewMeeting(course.id, "Tutorial"));
    details.querySelector(".addPractical").addEventListener("click", () => openNewMeeting(course.id, "Practical"));
    details.querySelector(".duplicateCourse").addEventListener("click", () => duplicateCourse(course.id));
    details.querySelectorAll(".optionSelect").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        selectMeetingOption(btn.dataset.course, btn.dataset.meeting);
      });
    });
    bank.appendChild(details);
  });
}

function selectMeetingOption(courseId, meetingId){
  const found = findMeeting(courseId, meetingId);
  if(!found) return;
  const key = optionGroupKey(found.meeting);
  const targetComponent = componentName(found.meeting.type);
  (found.course.meetings || []).forEach(m => {
    if(componentName(m.type) === targetComponent){
      m.selected = optionGroupKey(m) === key;
    }
  });
  persist();
  render();
}

function setAlternativeOptionsVisibility(courseId, component, visibility, shouldRender=true){
  const course = current().courses.find(c => c.id === courseId);
  if(!course) return;
  (course.meetings || []).forEach(m => {
    if(componentName(m.type) === componentName(component) && !meetingSelected(m)){
      setOptionVisibility(m, visibility);
    }
  });
  if(shouldRender){
    persist();
    render();
  }
}

function enableAllCourses(){
  current().courses.forEach(c => setCourseVisibility(c, "visible"));
  persist();
  render();
}

function disableAllCourses(){
  current().courses.forEach(c => setCourseVisibility(c, "shadow"));
  persist();
  render();
}

function hideAllCourses(){
  current().courses.forEach(c => setCourseVisibility(c, "hidden"));
  persist();
  render();
}

function openNewCourse(){
  const t = current();
  const course = {
    id:uid("course"),
    title:"New course",
    color:colorForIndex(t.courses.length),
    enabled:true,
    visibility:"visible",
    componentVisibility:{},
    meetings:[]
  };
  t.courses.push(course);
  persist();
  render();
  openCourseModal(course.id, true);
}

function openCourseModal(courseId, isNew=false){
  const course = current().courses.find(c => c.id === courseId);
  if(!course) return;
  editingCourseId = courseId;
  document.getElementById("courseModalTitle").textContent = isNew ? "Add course" : "Edit course";
  document.getElementById("cTitle").value = course.title || "";
  document.getElementById("cColorHex").value = course.color || "#dbeafe";
  document.getElementById("cColorPicker").value = safeHex(course.color);
  document.getElementById("cVisibility").value = courseVisibility(course);
  document.getElementById("deleteCourseBtn").style.display = "inline-block";
  document.getElementById("courseModalOverlay").style.display = "flex";
  setTimeout(() => document.getElementById("cTitle").select(), 30);
}

function closeCourseModal(){
  document.getElementById("courseModalOverlay").style.display = "none";
  editingCourseId = null;
}

document.getElementById("cColorPicker").addEventListener("input", e => {
  document.getElementById("cColorHex").value = e.target.value;
});
document.getElementById("cColorHex").addEventListener("input", e => {
  if(isHex(e.target.value)) document.getElementById("cColorPicker").value = e.target.value;
});

function saveCourse(){
  const course = current().courses.find(c => c.id === editingCourseId);
  if(!course) return;
  const hex = document.getElementById("cColorHex").value.trim();
  if(!isHex(hex)){
    alert("Use a valid 6-digit hex color, like #dbeafe.");
    return;
  }
  course.title = document.getElementById("cTitle").value.trim() || "Untitled";
  course.color = hex.toLowerCase();
  setCourseVisibility(course, document.getElementById("cVisibility").value);
  persist();
  closeCourseModal();
  render();
}

function deleteCourse(){
  if(!editingCourseId) return;
  const course = current().courses.find(c => c.id === editingCourseId);
  if(!course) return;
  if(!confirm(`Delete "${course.title}" and all of its time blocks?`)) return;
  current().courses = current().courses.filter(c => c.id !== editingCourseId);
  persist();
  closeCourseModal();
  render();
}

function duplicateCourse(courseId){
  const t = current();
  const course = t.courses.find(c => c.id === courseId);
  if(!course) return;
  const copy = JSON.parse(JSON.stringify(course));
  copy.id = uid("course");
  copy.title = course.title + " copy";
  setCourseVisibility(copy, "shadow");
  copy.meetings = (copy.meetings || []).map(m => ({...m, id:uid("meet")}));
  t.courses.push(copy);
  persist();
  render();
}

function populateMeetingCourseSelect(selectedCourseId=null, allowNew=true){
  const select = document.getElementById("mCourse");
  select.innerHTML = "";
  if(allowNew){
    const opt = document.createElement("option");
    opt.value = "__new__";
    opt.textContent = "+ Create new course";
    select.appendChild(opt);
  }
  current().courses.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.title || "Untitled";
    select.appendChild(opt);
  });
  select.value = selectedCourseId || (current().courses[0]?.id || "__new__");
  updateNewCourseWrap();
}

document.getElementById("mCourse").addEventListener("change", updateNewCourseWrap);
function updateNewCourseWrap(){
  const isNew = document.getElementById("mCourse").value === "__new__";
  document.getElementById("newCourseNameWrap").style.display = isNew ? "block" : "none";
  if(isNew){
    const color = colorForIndex(current().courses.length);
    document.getElementById("mColorHex").value = color;
    document.getElementById("mColorPicker").value = color;
  }else{
    const course = current().courses.find(c => c.id === document.getElementById("mCourse").value);
    if(course){
      document.getElementById("mColorHex").value = course.color || "#dbeafe";
      document.getElementById("mColorPicker").value = safeHex(course.color);
    }
  }
}

document.getElementById("mColorPicker").addEventListener("input", e => {
  document.getElementById("mColorHex").value = e.target.value;
});
document.getElementById("mColorHex").addEventListener("input", e => {
  if(isHex(e.target.value)) document.getElementById("mColorPicker").value = e.target.value;
});

function openNewMeeting(preselectedCourseId=null, presetType="Lecture"){
  const t = current();
  if(!t.courses.length && !preselectedCourseId){
    openNewCourse();
    return;
  }
  editingMeeting = {isNew:true, courseId:preselectedCourseId || t.courses[0]?.id || "__new__", meetingId:null};
  document.getElementById("meetingModalTitle").textContent = "Add " + presetType.toLowerCase();
  populateMeetingCourseSelect(preselectedCourseId, true);
  document.getElementById("mNewCourseName").value = "New course";
  fillDayOptions(activeDays[0] || "Monday");
  document.getElementById("mType").value = normalizeComponent(presetType);
  document.getElementById("mSection").value = "";
  document.getElementById("mStart").value = minToTime(t.startHour*60);
  document.getElementById("mEnd").value = minToTime(t.startHour*60 + 60);
  document.getElementById("mLocation").value = "";
  document.getElementById("mNotes").value = "";
  document.getElementById("mSelected").checked = true;
  document.getElementById("deleteMeetingBtn").style.display = "none";
  document.getElementById("meetingModalOverlay").style.display = "flex";
}

function fillDayOptions(selected){
  const select = document.getElementById("mDay");
  select.innerHTML = "";
  ALL_DAYS.forEach(day => {
    const opt = document.createElement("option");
    opt.value = day;
    opt.textContent = day;
    select.appendChild(opt);
  });
  select.value = selected;
}

function openMeetingModal(courseId, meetingId, isNew=false){
  const found = findMeeting(courseId, meetingId);
  if(!found) return;
  editingMeeting = {isNew:false, courseId, meetingId};
  document.getElementById("meetingModalTitle").textContent = isNew ? "Add time block" : "Edit time block";
  populateMeetingCourseSelect(courseId, false);
  fillDayOptions(found.meeting.day);
  document.getElementById("mType").value = normalizeComponent(found.meeting.type);
  document.getElementById("mSection").value = found.meeting.section || (["Lecture","Tutorial","Practical","Other"].includes(found.meeting.type) ? "" : (found.meeting.type || ""));
  document.getElementById("mStart").value = found.meeting.start;
  document.getElementById("mEnd").value = found.meeting.end;
  document.getElementById("mLocation").value = found.meeting.location || "";
  document.getElementById("mNotes").value = found.meeting.notes || "";
  document.getElementById("mSelected").checked = meetingSelected(found.meeting);
  document.getElementById("mColorHex").value = found.course.color || "#dbeafe";
  document.getElementById("mColorPicker").value = safeHex(found.course.color);
  document.getElementById("deleteMeetingBtn").style.display = "inline-block";
  document.getElementById("meetingModalOverlay").style.display = "flex";
}

function closeMeetingModal(){
  document.getElementById("meetingModalOverlay").style.display = "none";
  editingMeeting = null;
}

function saveMeeting(){
  const t = current();
  const start = document.getElementById("mStart").value;
  const end = document.getElementById("mEnd").value;
  if(timeToMin(end) <= timeToMin(start)){
    alert("End time must be after start time.");
    return;
  }
  const hex = document.getElementById("mColorHex").value.trim();
  if(!isHex(hex)){
    alert("Use a valid 6-digit hex color, like #dbeafe.");
    return;
  }

  let courseId = document.getElementById("mCourse").value;
  let course = t.courses.find(c => c.id === courseId);
  if(courseId === "__new__" || !course){
    course = {
      id:uid("course"),
      title:document.getElementById("mNewCourseName").value.trim() || "New course",
      color:hex.toLowerCase(),
      enabled:true,
      visibility:"visible",
      componentVisibility:{},
      meetings:[]
    };
    t.courses.push(course);
  }else{
    course.color = hex.toLowerCase();
  }

  const data = {
    day:document.getElementById("mDay").value,
    start,
    end,
    type:document.getElementById("mType").value,
    section:document.getElementById("mSection").value.trim(),
    selected:document.getElementById("mSelected").checked,
    location:document.getElementById("mLocation").value.trim(),
    notes:document.getElementById("mNotes").value.trim()
  };

  if(editingMeeting && !editingMeeting.isNew){
    const old = findMeeting(editingMeeting.courseId, editingMeeting.meetingId);
    if(!old) return;
    if(old.course.id !== course.id){
      old.course.meetings = old.course.meetings.filter(m => m.id !== editingMeeting.meetingId);
      course.meetings.push({id:editingMeeting.meetingId, ...data});
    }else{
      Object.assign(old.meeting, data);
    }
  }else{
    course.meetings.push({id:uid("meet"), ...data});
  }

  if(data.selected){
    const selectedCourse = course;
    const savedMeetingId = (editingMeeting && !editingMeeting.isNew) ? editingMeeting.meetingId : course.meetings[course.meetings.length - 1].id;
    const savedMeeting = course.meetings.find(m => m.id === savedMeetingId);
    if(savedMeeting){
      const key = optionGroupKey(savedMeeting);
      const targetComponent = componentName(savedMeeting.type);
      selectedCourse.meetings.forEach(m => {
        if(componentName(m.type) === targetComponent){
          m.selected = optionGroupKey(m) === key;
        }
      });
    }
  }
  if(!t.customDays.includes(data.day)) t.customDays.push(data.day);
  persist();
  closeMeetingModal();
  render();
}

function deleteMeeting(){
  if(!editingMeeting || editingMeeting.isNew) return;
  const found = findMeeting(editingMeeting.courseId, editingMeeting.meetingId);
  if(!found) return;
  found.course.meetings = found.course.meetings.filter(m => m.id !== editingMeeting.meetingId);
  persist();
  closeMeetingModal();
  render();
}

function findMeeting(courseId, meetingId){
  const course = current().courses.find(c => c.id === courseId);
  if(!course) return null;
  const meeting = (course.meetings || []).find(m => m.id === meetingId);
  if(!meeting) return null;
  return {course, meeting};
}

function exportSchedule(){
  current().notes = document.getElementById("notes").value;
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "multi-timetable-builder.json";
  a.click();
  URL.revokeObjectURL(a.href);
}



function icsEscape(value){
  return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function addDaysToDate(date, days){
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}
function formatICSDateTime(dateObj, time){
  const [h,m] = time.split(":").map(Number);
  const d = new Date(dateObj);
  d.setHours(h, m, 0, 0);
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function exportICS(){
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
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(m.courseId)}-${icsEscape(m.id)}-${Date.now()}@timetable-studio`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${icsEscape(`${m.courseTitle} ${componentText(m)}`)}`,
      `DTSTART:${formatICSDateTime(dateObj, m.start)}`,
      `DTEND:${formatICSDateTime(dateObj, m.end)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      `LOCATION:${icsEscape(m.location || "")}`,
      `DESCRIPTION:${icsEscape(m.notes || "Created with Timetable Studio")}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], {type:"text/calendar;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(current().title || "schedule").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-schedule.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function groupMeetingsByOption(course){
  const byComponent = {};
  (course.meetings || []).forEach(m => {
    const component = componentName(m.type);
    const key = optionGroupKey(m);
    if(!byComponent[component]) byComponent[component] = {};
    if(!byComponent[component][key]) byComponent[component][key] = [];
    byComponent[component][key].push(m);
  });
  return byComponent;
}
function cartesianChoices(groups){
  let choices = [[]];
  Object.values(groups).forEach(group => {
    const options = Object.values(group);
    const next = [];
    choices.forEach(base => {
      options.forEach(opt => next.push(base.concat(opt.map(m => m.id))));
    });
    choices = next.slice(0, 150);
  });
  return choices.length ? choices : [[]];
}
function candidateMeetingsFromIds(timetable, idsByCourse){
  const out = [];
  timetable.courses.forEach(c => {
    const ids = new Set(idsByCourse[c.id] || []);
    (c.meetings || []).forEach(m => {
      if(ids.has(m.id)) out.push({...m, courseId:c.id, courseTitle:c.title, color:c.color});
    });
  });
  return out;
}
function scheduleStats(meetings){
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
  const activeDaysList = Object.keys(byDay);
  let gaps = 0, span = 0, maxSpan = 0, earlyPenalty = 0;
  activeDaysList.forEach(day => {
    const arr = byDay[day].sort((a,b)=>timeToMin(a.start)-timeToMin(b.start));
    const first = Math.min(...arr.map(m => timeToMin(m.start)));
    const last = Math.max(...arr.map(m => timeToMin(m.end)));
    const busy = arr.reduce((sum,m) => sum + timeToMin(m.end)-timeToMin(m.start), 0);
    const daySpan = last - first;
    span += daySpan;
    maxSpan = Math.max(maxSpan, daySpan);
    gaps += Math.max(0, daySpan - busy);
    earlyPenalty += Math.max(0, (10*60) - first);
  });
  return {conflicts, activeDays:activeDaysList.length, gaps, span, maxSpan, earlyPenalty};
}
function scoreSchedule(meetings, preset){
  const s = scheduleStats(meetings);
  let score = s.conflicts * 100000;
  if(preset === "condensed") score += s.activeDays * 800 + s.gaps * 2 + s.span * .2;
  if(preset === "spread") score += s.maxSpan * 4 - s.activeDays * 500 + s.conflicts * 100000;
  if(preset === "late") score += s.earlyPenalty * 5 + s.gaps + s.activeDays * 80;
  if(preset === "balanced") score += s.conflicts * 100000 + s.gaps * 2 + s.maxSpan * 2 + Math.abs(s.activeDays - 4) * 200;
  return score;
}
function buildPresetTimetable(source, idsByCourse, title){
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = uid("tt");
  copy.title = title;
  copy.notes = [copy.notes, `Generated preset from ${source.title}`].filter(Boolean).join("\\n");
  copy.courses.forEach(course => {
    setCourseVisibility(course, courseVisibility(course) === "hidden" ? "hidden" : "visible");
    const ids = new Set(idsByCourse[course.id] || []);
    (course.meetings || []).forEach(m => {
      if(ids.has(m.id)){
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
function generateBestPreset(source, preset){
  const usableCourses = source.courses.filter(c => courseVisibility(c) !== "hidden" && (c.meetings || []).length);
  let candidates = [{idsByCourse:{}, meetings:[]}];
  usableCourses.forEach(course => {
    const choices = cartesianChoices(groupMeetingsByOption(course));
    const next = [];
    candidates.forEach(candidate => {
      choices.forEach(choiceIds => {
        const idsByCourse = {...candidate.idsByCourse, [course.id]: choiceIds};
        const meetings = candidateMeetingsFromIds(source, idsByCourse);
        next.push({idsByCourse, meetings, score:scoreSchedule(meetings, preset)});
      });
    });
    next.sort((a,b)=>a.score-b.score);
    candidates = next.slice(0, 300);
  });
  const best = candidates.sort((a,b)=>scoreSchedule(a.meetings, preset)-scoreSchedule(b.meetings, preset))[0];
  return best || {idsByCourse:{}};
}
function generateSchedulePresets(){
  const source = current();
  if(!source.courses.some(c => (c.meetings || []).length)){
    alert("Add or import courses first.");
    return;
  }
  const presets = [
    ["condensed", "Condensed days"],
    ["spread", "Spread out"],
    ["late", "Latest starts"],
    ["balanced", "Balanced"]
  ];
  presets.forEach(([key, label]) => {
    const best = generateBestPreset(source, key);
    state.timetables.push(buildPresetTimetable(source, best.idsByCourse, `${source.title} · ${label}`));
  });
  state.activeTimetableId = state.timetables[state.timetables.length - presets.length].id;
  persist();
  render();
  alert("Generated four preset timetable tabs: Condensed days, Spread out, Latest starts, and Balanced.");
}



let screenshotFiles = [];

function openScreenshotImport(){
  document.getElementById("screenshotImportModalOverlay").style.display = "flex";
  setupScreenshotDropZone();
}
function closeScreenshotImport(){
  document.getElementById("screenshotImportModalOverlay").style.display = "none";
}
function setupScreenshotDropZone(){
  const zone = document.getElementById("screenshotDropZone");
  if(!zone || zone.dataset.ready) return;
  zone.dataset.ready = "true";
  ["dragenter","dragover"].forEach(type => zone.addEventListener(type, e => {
    e.preventDefault();
    zone.classList.add("dragging");
  }));
  ["dragleave","drop"].forEach(type => zone.addEventListener(type, e => {
    e.preventDefault();
    zone.classList.remove("dragging");
  }));
  zone.addEventListener("drop", e => {
    const files = Array.from(e.dataTransfer.files || []).filter(file => file.type.startsWith("image/"));
    addScreenshotFiles(files);
  });
}
function handleScreenshotFiles(event){
  addScreenshotFiles(Array.from(event.target.files || []));
  event.target.value = "";
}
function addScreenshotFiles(files){
  const images = files.filter(file => file.type.startsWith("image/"));
  screenshotFiles.push(...images);
  renderScreenshotFileList();
}
function clearScreenshotFiles(){
  screenshotFiles = [];
  renderScreenshotFileList();
  document.getElementById("screenshotStatus").textContent = "";
}
function renderScreenshotFileList(){
  const box = document.getElementById("screenshotFileList");
  if(!box) return;
  if(!screenshotFiles.length){
    box.textContent = "No screenshots selected yet.";
    return;
  }
  box.innerHTML = `<div class="fileList">${screenshotFiles.map((file, i) => `
    <div class="fileItem">
      <span>${escapeHtml(file.name)}</span>
      <button class="ghost smallBtn" onclick="removeScreenshotFile(${i})">Remove</button>
    </div>
  `).join("")}</div>`;
}
function removeScreenshotFile(index){
  screenshotFiles.splice(index, 1);
  renderScreenshotFileList();
}
function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function extractJsonFromText(text){
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
async function extractScheduleFromScreenshots(){
  if(!screenshotFiles.length){
    alert("Choose at least one screenshot first.");
    return;
  }
  const status = document.getElementById("screenshotStatus");
  status.textContent = "Reading screenshots...";
  try{
    const images = await Promise.all(screenshotFiles.map(fileToDataUrl));
    status.textContent = "Sending screenshots to GPT...";
    const response = await fetch("/api/extract-schedule", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({images})
    });
    const payload = await response.json();
    if(!response.ok) throw new Error(payload.error || "Extraction failed.");
    const data = extractJsonFromText(payload.text || payload.json || "");
    const mode = document.getElementById("screenshotImportMode").value;
    importDataObject(data, mode);
    status.textContent = "Imported successfully.";
    clearScreenshotFiles();
    closeScreenshotImport();
  }catch(err){
    status.textContent = "Extraction failed. You can still use Paste GPT JSON manually.";
    alert(err.message || "Extraction failed.");
  }
}


const GPT_PROMPT = `Extract the course timetable information from these screenshots and convert it into JSON for my Timetable Studio app.

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
- You may use "visibility": "visible", "shadow", or "hidden" on a course. If unsure, use "visible".
- Use type as one of: Lecture, Tutorial, Practical, Other.
- Use full day names: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Use 24-hour time like "09:00" and "17:00".
- Put building and room together in location, like "IB 120".
- If something is unclear, put "CHECK:" in the notes field and describe what needs checking.
- Include section codes when visible, like LEC0101, TUT0102, PRA0101.`;

function openGptImport(){
  document.getElementById("gptImportModalOverlay").style.display = "flex";
  setTimeout(() => document.getElementById("gptJsonInput").focus(), 30);
}
function closeGptImport(){
  document.getElementById("gptImportModalOverlay").style.display = "none";
}
function copyGptPrompt(){
  const done = () => alert("GPT extraction prompt copied. Paste it into ChatGPT with your course screenshots.");
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(GPT_PROMPT).then(done).catch(() => prompt("Copy this prompt:", GPT_PROMPT));
  }else{
    prompt("Copy this prompt:", GPT_PROMPT);
  }
}
function importFromPastedJson(){
  const raw = document.getElementById("gptJsonInput").value.trim();
  if(!raw){
    alert("Paste JSON first.");
    return;
  }
  try{
    const data = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    const mode = document.getElementById("gptImportMode").value;
    importDataObject(data, mode);
    closeGptImport();
    closeScreenshotImport();
    hideContextMenu();
    document.getElementById("gptJsonInput").value = "";
  }catch(err){
    alert("That JSON could not be imported. Make sure GPT outputs valid JSON only.");
  }
}
function normalizeDay(day){
  const value = String(day || "").trim().toLowerCase();
  const map = {
    mon:"Monday", monday:"Monday",
    tue:"Tuesday", tues:"Tuesday", tuesday:"Tuesday",
    wed:"Wednesday", weds:"Wednesday", wednesday:"Wednesday",
    thu:"Thursday", thur:"Thursday", thurs:"Thursday", thursday:"Thursday",
    fri:"Friday", friday:"Friday",
    sat:"Saturday", saturday:"Saturday",
    sun:"Sunday", sunday:"Sunday"
  };
  return map[value] || day || "Monday";
}
function parseTimeValue(value, fallback="09:00"){
  if(!value) return fallback;
  let s = String(value).trim().toLowerCase().replace(/\s+/g, "");
  let m = s.match(/^(\d{1,2}):?(\d{2})?(am|pm)?$/);
  if(!m) return fallback;
  let h = Number(m[1]);
  let min = Number(m[2] || 0);
  const ap = m[3];
  if(ap === "pm" && h < 12) h += 12;
  if(ap === "am" && h === 12) h = 0;
  if(h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${pad(h)}:${pad(min)}`;
}
function normalizeImportedTimetable(input, fallbackTitle="Imported"){
  const t = newTimetable(input.title || input.name || fallbackTitle);
  t.notes = input.notes || "Imported from GPT/screenshots";
  if(input.startHour) t.startHour = Number(input.startHour);
  if(input.endHour) t.endHour = Number(input.endHour);
  if(input.snap) t.snap = Number(input.snap);
  if(input.viewMode) t.viewMode = input.viewMode;
  if(Array.isArray(input.customDays)) t.customDays = input.customDays.map(normalizeDay);

  const courses = Array.isArray(input.courses) ? input.courses : [];
  t.courses = courses.map((c, ci) => {
    const title = c.title || [c.code, c.name].filter(Boolean).join(" - ") || c.code || c.name || `Course ${ci + 1}`;
    const course = {
      id: c.id || uid("course"),
      title,
      color: safeHex(c.color, colorForIndex(ci)),
      enabled: c.enabled !== false,
      visibility: c.visibility || (c.enabled === false ? "shadow" : "visible"),
      meetings: []
    };
    const meetings = Array.isArray(c.meetings) ? c.meetings : [];
    course.meetings = meetings.map((m, mi) => {
      const start = parseTimeValue(m.start, "09:00");
      const end = parseTimeValue(m.end, minToTime(timeToMin(start) + 60));
      return {
        id:m.id || uid("meet"),
        day:normalizeDay(m.day),
        start,
        end:timeToMin(end) > timeToMin(start) ? end : minToTime(timeToMin(start) + 60),
        type:normalizeComponent(m.type || m.component || "Other"),
        section:m.section || m.label || "",
        selected:typeof m.selected === "boolean" ? m.selected : undefined,
        optionVisibility:m.optionVisibility || undefined,
        _explicitSelected:typeof m.selected === "boolean",
        location:m.location || [m.building, m.room].filter(Boolean).join(" "),
        notes:m.notes || ""
      };
    });
    applyDefaultOptionSelections(course);
    course.meetings.forEach(m => delete m._explicitSelected);
    return course;
  });
  return t;
}
function applyDefaultOptionSelections(course){
  const componentGroups = {};
  (course.meetings || []).forEach(m => {
    const component = componentName(m.type);
    const key = optionGroupKey(m);
    if(!componentGroups[component]) componentGroups[component] = {};
    if(!componentGroups[component][key]) componentGroups[component][key] = [];
    componentGroups[component][key].push(m);
  });
  Object.values(componentGroups).forEach(groups => {
    const keys = Object.keys(groups);
    const explicitTrueKey = keys.find(key => groups[key].some(m => m._explicitSelected && m.selected === true));
    if(explicitTrueKey){
      keys.forEach(key => groups[key].forEach(m => m.selected = key === explicitTrueKey));
    }else if(keys.length > 1){
      keys.forEach(key => groups[key].forEach(m => {
        if(!m._explicitSelected) m.selected = false;
        if(!m.optionVisibility) m.optionVisibility = "shadow";
      }));
    }else{
      keys.forEach(key => groups[key].forEach(m => {
        if(!m._explicitSelected) m.selected = true;
      }));
    }
  });
}
function countCheckItems(timetables){
  let count = 0;
  timetables.forEach(t => (t.courses || []).forEach(c => (c.meetings || []).forEach(m => {
    if((m.notes || "").toUpperCase().includes("CHECK")) count++;
  })));
  return count;
}
function looksLikeFullExport(data){
  return Array.isArray(data.timetables) && data.activeTimetableId && data.timetables.some(t => "startHour" in t && "showShadows" in t);
}
function importDataObject(data, mode="add"){
  if(looksLikeFullExport(data) && mode === "add"){
    if(confirm("This looks like a full Timetable Studio backup. Replace the whole app state with it?")){
      state = data;
      if(!state.activeTimetableId || !state.timetables.some(t => t.id === state.activeTimetableId)){
        state.activeTimetableId = state.timetables[0]?.id;
      }
      persist();
      render();
      return;
    }
  }

  let imported = [];
  if(Array.isArray(data.timetables)){
    imported = data.timetables.map((t, i) => normalizeImportedTimetable(t, t.title || `Imported ${i + 1}`));
  }else if(Array.isArray(data.courses)){
    imported = [normalizeImportedTimetable(data, data.title || "Imported")];
  }else{
    throw new Error("Unsupported import shape.");
  }

  if(!imported.length) throw new Error("No timetables found.");
  const checks = countCheckItems(imported);

  if(mode === "replace"){
    const target = current();
    const first = imported[0];
    target.title = first.title;
    target.startHour = first.startHour;
    target.endHour = first.endHour;
    target.snap = first.snap;
    target.viewMode = first.viewMode;
    target.customDays = first.customDays;
    target.showShadows = first.showShadows;
    target.notes = first.notes;
    target.courses = first.courses;
  }else if(mode === "merge"){
    const target = current();
    imported.forEach(t => {
      target.courses.push(...(t.courses || []));
      target.notes = [target.notes, t.notes].filter(Boolean).join("\\n");
    });
  }else{
    imported.forEach(t => state.timetables.push(t));
    state.activeTimetableId = imported[0].id;
  }

  persist();
  render();
  alert(`Import complete.${checks ? " " + checks + " item(s) were marked CHECK for review." : ""}`);
}

function importSchedule(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(looksLikeFullExport(data)){
        state = data;
        if(!state.activeTimetableId || !state.timetables.some(t => t.id === state.activeTimetableId)){
          state.activeTimetableId = state.timetables[0]?.id;
        }
        persist();
        render();
      }else{
        importDataObject(data, "add");
      }
    }catch(err){
      alert("That JSON file could not be imported.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}


function hideContextMenu(){
  const menu = document.getElementById("contextMenu");
  if(menu) menu.style.display = "none";
  contextTarget = null;
}
function showContextMenu(x, y, items){
  const menu = document.getElementById("contextMenu");
  if(!menu) return;
  menu.innerHTML = "";
  items.forEach(item => {
    if(item === "sep"){
      menu.appendChild(document.createElement("hr"));
      return;
    }
    const btn = document.createElement("button");
    btn.innerHTML = `<span>${item.label}</span>${item.hint ? `<span class="small">${item.hint}</span>` : ""}`;
    btn.addEventListener("click", () => {
      hideContextMenu();
      item.action();
    });
    menu.appendChild(btn);
  });
  menu.style.display = "block";
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 12) + "px";
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 12) + "px";
}
function showCourseContextMenu(x, y, courseId){
  const course = current().courses.find(c => c.id === courseId);
  if(!course) return;
  showContextMenu(x, y, [
    {label:"Edit course", action:() => openCourseModal(courseId)},
    {label:"Duplicate course", action:() => duplicateCourse(courseId)},
    "sep",
    {label:"Make visible", action:() => { setCourseVisibility(course, "visible"); persist(); render(); }},
    {label:"Convert to shadow", action:() => { setCourseVisibility(course, "shadow"); persist(); render(); }},
    {label:"Hide entirely", action:() => { setCourseVisibility(course, "hidden"); persist(); render(); }},
    "sep",
    {label:"Delete course", action:() => { editingCourseId = courseId; deleteCourse(); }}
  ]);
}
function showMeetingContextMenu(x, y, courseId, meetingId){
  const found = findMeeting(courseId, meetingId);
  if(!found) return;
  showContextMenu(x, y, [
    {label:"Edit time block", action:() => openMeetingModal(courseId, meetingId)},
    {label:"Select this option", action:() => selectMeetingOption(courseId, meetingId)},
    "sep",
    {label:"Make course visible", action:() => { setCourseVisibility(found.course, "visible"); persist(); render(); }},
    {label:"Convert course to shadow", action:() => { setCourseVisibility(found.course, "shadow"); persist(); render(); }},
    {label:"Hide course entirely", action:() => { setCourseVisibility(found.course, "hidden"); persist(); render(); }},
    "sep",
    {label:"Duplicate course", action:() => duplicateCourse(courseId)},
    {label:"Delete this time", action:() => { editingMeeting = {isNew:false, courseId, meetingId}; deleteMeeting(); }}
  ]);
}


function render(){
  const t = current();
  activeDays = getDays();
  renderTabs();
  buildDayToggles();
  renderGlobalComponentControls();
  buildGrid();
  renderEvents();
  renderMetrics();
  renderCourseBank();
  applySettingsInputs();
  persist();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));
}

document.getElementById("courseModalOverlay").addEventListener("click", e => {
  if(e.target.id === "courseModalOverlay") closeCourseModal();
});
document.getElementById("meetingModalOverlay").addEventListener("click", e => {
  if(e.target.id === "meetingModalOverlay") closeMeetingModal();
});
document.getElementById("gptImportModalOverlay").addEventListener("click", e => {
  if(e.target.id === "gptImportModalOverlay") closeGptImport();
    closeScreenshotImport();
    hideContextMenu();
});
document.addEventListener("click", e => {
  if(!e.target.closest("#contextMenu")) hideContextMenu();
});
document.addEventListener("scroll", hideContextMenu, true);
document.addEventListener("keydown", e => {
  if(e.key === "Escape"){
    closeCourseModal();
    closeMeetingModal();
    closeGptImport();
    closeScreenshotImport();
    hideContextMenu();
  }
});
window.addEventListener("resize", () => {
  renderEvents();
  renderMetrics();
});

render();