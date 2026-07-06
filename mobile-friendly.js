/* Mobile-friendly shell + vertical schedule views. */
(function(){
  const MOBILE_BREAKPOINT = 820;
  const PX_PER_MIN = 1;
  let mobileView = localStorage.getItem("mobileScheduleView") || "agenda";
  let baseRender = null;

  function isMobile(){
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  function ensureMobileShell(){
    if(!document.querySelector(".mobileTopbar")){
      const topbar = document.createElement("div");
      topbar.className = "mobileTopbar";
      topbar.innerHTML = `
        <div class="mobileBrand">
          <strong>Timetable Studio</strong>
          <span id="mobileActiveTitle">Schedule</span>
        </div>
        <button class="mobileMenuButton" type="button" aria-label="Open menu">☰</button>
      `;
      document.body.insertBefore(topbar, document.body.firstChild);
      topbar.querySelector(".mobileMenuButton").addEventListener("click", () => {
        document.body.classList.add("mobileDrawerOpen");
      });
    }

    if(!document.querySelector(".mobileDrawerBackdrop")){
      const backdrop = document.createElement("div");
      backdrop.className = "mobileDrawerBackdrop";
      backdrop.addEventListener("click", closeMobileDrawer);
      document.body.appendChild(backdrop);
    }

    const main = document.querySelector("main.main");
    if(main && !document.getElementById("mobileSchedulePanel")){
      const panel = document.createElement("section");
      panel.id = "mobileSchedulePanel";
      panel.className = "mobileSchedulePanel";
      panel.innerHTML = `
        <div class="mobileScheduleToolbar">
          <div class="mobileViewButtons">
            <button type="button" class="mobileViewButton" data-view="agenda">Agenda</button>
            <button type="button" class="mobileViewButton" data-view="grid">Grid</button>
          </div>
          <button type="button" class="mobileAddButton">+ Add time</button>
        </div>
        <div id="mobileAgenda" class="mobileAgenda"></div>
        <div id="mobileVerticalGrid" class="mobileVerticalGrid"></div>
      `;
      const wrap = document.getElementById("calendarWrap");
      main.insertBefore(panel, wrap || main.firstChild);
      panel.querySelectorAll(".mobileViewButton").forEach(button => {
        button.addEventListener("click", () => setMobileView(button.dataset.view));
      });
      panel.querySelector(".mobileAddButton").addEventListener("click", () => {
        openMobileNewMeeting(activeDays[0] || "Monday", (current().startHour || 8) * 60);
      });
    }
  }

  function closeMobileDrawer(){
    document.body.classList.remove("mobileDrawerOpen");
  }

  function setMobileView(view){
    mobileView = view === "grid" ? "grid" : "agenda";
    localStorage.setItem("mobileScheduleView", mobileView);
    renderMobileSchedule();
  }

  function applyMobileViewClass(){
    document.body.classList.toggle("mobileScheduleAgenda", mobileView !== "grid");
    document.body.classList.toggle("mobileScheduleGrid", mobileView === "grid");
    document.querySelectorAll(".mobileViewButton").forEach(button => {
      button.classList.toggle("active", button.dataset.view === mobileView || (mobileView !== "grid" && button.dataset.view === "agenda"));
    });
  }

  function openMobileNewMeeting(day, startMin){
    openNewMeeting(null, "Lecture");
    setTimeout(() => {
      const start = document.getElementById("mStart");
      const end = document.getElementById("mEnd");
      const daySelect = document.getElementById("mDay");
      if(daySelect) daySelect.value = day;
      if(start) start.value = minToTime(startMin);
      if(end) end.value = minToTime(Math.min(startMin + 60, (current().endHour || 20) * 60));
    }, 0);
  }

  function meetingTap(m){
    if(m.courseVisibility === "visible" && !m.meetingSelected){
      selectMeetingOption(m.courseId, m.id);
      return;
    }
    openMeetingModal(m.courseId, m.id);
  }

  function mobileConflicts(){
    const keys = new Set();
    getConflicts().flat().forEach(m => keys.add(`${m.courseId}:${m.id}`));
    return keys;
  }

  function mobileMeetings(){
    const t = current();
    return allMeetings(true)
      .filter(m => activeDays.includes(m.day))
      .filter(m => {
        const isShadow = m.courseVisibility === "shadow" || m.componentVisibility === "shadow" || !m.meetingSelected;
        return !isShadow || t.showShadows;
      })
      .sort((a,b) => activeDays.indexOf(a.day) - activeDays.indexOf(b.day) || timeToMin(a.start) - timeToMin(b.start));
  }

  function eventButton(m, conflictKeys, extraClass=""){
    const isShadow = m.courseVisibility === "shadow" || m.componentVisibility === "shadow" || !m.meetingSelected;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${extraClass || "mobileEventCard"} ${isShadow ? "shadow" : ""} ${conflictKeys.has(`${m.courseId}:${m.id}`) ? "conflict" : ""}`;
    button.style.borderLeftColor = m.color || "#111";
    if(extraClass === "mobileGridBlock"){
      button.style.background = m.color || "#fff";
    }
    button.innerHTML = `
      <div class="mobileEventTitle">
        <span>${escapeHtml(m.courseTitle || "Untitled")}</span>
        <span>${escapeHtml(componentText(m))}</span>
      </div>
      <div class="mobileEventMeta">${escapeHtml(m.start)}–${escapeHtml(m.end)}${m.location ? " · " + escapeHtml(m.location) : ""}</div>
      ${isShadow ? `<div class="mobileEventMeta"><b>${!m.meetingSelected ? "shadow option · tap to select" : "shadow"}</b></div>` : ""}
    `;
    button.addEventListener("click", () => meetingTap(m));
    return button;
  }

  function renderMobileAgenda(){
    const box = document.getElementById("mobileAgenda");
    if(!box) return;
    const meetings = mobileMeetings();
    const conflictKeys = mobileConflicts();
    box.innerHTML = "";

    activeDays.forEach(day => {
      const dayMeetings = meetings.filter(m => m.day === day);
      const card = document.createElement("section");
      card.className = "mobileDayCard";
      card.innerHTML = `
        <div class="mobileDayHeader">
          <h3>${escapeHtml(day)}</h3>
          <span>${dayMeetings.length ? dayMeetings.length + " block" + (dayMeetings.length === 1 ? "" : "s") : "Free"}</span>
        </div>
      `;
      if(dayMeetings.length){
        const list = document.createElement("div");
        list.className = "mobileAgendaList";
        dayMeetings.forEach(m => list.appendChild(eventButton(m, conflictKeys, "mobileEventCard")));
        card.appendChild(list);
      }else{
        const empty = document.createElement("button");
        empty.type = "button";
        empty.className = "mobileEmptyDay";
        empty.textContent = "+ Add time on this day";
        empty.addEventListener("click", () => openMobileNewMeeting(day, (current().startHour || 8) * 60));
        card.appendChild(empty);
      }
      box.appendChild(card);
    });
  }

  function renderMobileGrid(){
    const box = document.getElementById("mobileVerticalGrid");
    if(!box) return;
    const t = current();
    const startMin = (t.startHour || 8) * 60;
    const endMin = (t.endHour || 20) * 60;
    const height = Math.max(360, (endMin - startMin) * PX_PER_MIN);
    const meetings = mobileMeetings();
    const conflictKeys = mobileConflicts();
    box.innerHTML = "";

    activeDays.forEach(day => {
      const dayMeetings = meetings.filter(m => m.day === day);
      const card = document.createElement("section");
      card.className = "mobileDayCard";
      card.innerHTML = `
        <div class="mobileDayHeader">
          <h3>${escapeHtml(day)}</h3>
          <span>Tap + areas to add</span>
        </div>
      `;
      const timeline = document.createElement("div");
      timeline.className = "mobileTimeline";
      timeline.style.height = height + "px";

      for(let min = startMin; min <= endMin; min += 60){
        const top = (min - startMin) * PX_PER_MIN;
        const row = document.createElement("div");
        row.className = "mobileHourRow";
        row.style.top = top + "px";
        row.innerHTML = `<span>${escapeHtml(minToLabel(min))}</span>`;
        timeline.appendChild(row);
        if(min < endMin){
          const slot = document.createElement("button");
          slot.type = "button";
          slot.className = "mobileTapSlot";
          slot.style.top = top + "px";
          slot.style.height = Math.min(60, endMin - min) * PX_PER_MIN + "px";
          slot.textContent = "+";
          slot.addEventListener("click", () => openMobileNewMeeting(day, min));
          timeline.appendChild(slot);
        }
      }

      dayMeetings.forEach(m => {
        const start = Math.max(startMin, timeToMin(m.start));
        const end = Math.min(endMin, timeToMin(m.end));
        if(end <= startMin || start >= endMin) return;
        const block = eventButton(m, conflictKeys, "mobileGridBlock");
        block.style.top = ((start - startMin) * PX_PER_MIN + 2) + "px";
        block.style.height = Math.max(46, (end - start) * PX_PER_MIN - 4) + "px";
        timeline.appendChild(block);
      });

      card.appendChild(timeline);
      box.appendChild(card);
    });
  }

  function renderMobileSchedule(){
    ensureMobileShell();
    applyMobileViewClass();
    const title = document.getElementById("mobileActiveTitle");
    if(title) title.textContent = current().title || "Schedule";
    renderMobileAgenda();
    renderMobileGrid();
  }

  function installMobileRenderHook(){
    if(baseRender || typeof render !== "function") return;
    baseRender = render;
    render = function(){
      baseRender();
      requestAnimationFrame(renderMobileSchedule);
    };
  }

  function loadAddonScript(src, marker){
    if(document.querySelector(`script[data-addon="${marker}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.dataset.addon = marker;
    document.body.appendChild(script);
  }

  ensureMobileShell();
  installMobileRenderHook();
  renderMobileSchedule();
  loadAddonScript("simple-sync.js", "simple-sync");
  loadAddonScript("import-export-polish.js", "import-export-polish");

  window.addEventListener("resize", () => {
    if(isMobile()) renderMobileSchedule();
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") closeMobileDrawer();
  });
  window.renderMobileSchedule = renderMobileSchedule;
})();
