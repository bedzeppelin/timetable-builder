/* Adds a course-count target to the preset generator without changing the core app. */
(function(){
  const originalOpenPresetGenerator = window.generateSchedulePresets;

  function injectCourseCountControl(){
    const modal = document.getElementById("presetGeneratorModalOverlay");
    if(!modal || document.getElementById("pgTargetCourseCount")) return;
    const grid = modal.querySelector(".presetGrid");
    if(!grid) return;
    const card = document.createElement("div");
    card.className = "presetOptionBox";
    card.innerHTML = `
      <h3>How many courses?</h3>
      <label>Courses this semester
        <select id="pgTargetCourseCount">
          <option value="1">1 course</option>
          <option value="2">2 courses</option>
          <option value="3">3 courses</option>
          <option value="4">4 courses</option>
          <option value="5" selected>5 courses</option>
          <option value="6">6 courses</option>
        </select>
      </label>
      <div class="presetSubtext">Default is 5. Most people take 5 or fewer courses. The solver picks up to this many courses from the allowed courses below.</div>
    `;
    grid.prepend(card);

    const disclaimer = modal.querySelector(".presetDisclaimer span");
    if(disclaimer){
      disclaimer.textContent = "The app looks at the courses/options in your current tab, tries different combinations, and makes new timetable tabs using the number of courses and preset types you choose. It is not checking enrolment availability, waitlists, program requirements, or prerequisites. Always review the final schedule manually.";
    }
  }

  function openPresetGeneratorWithCourseCount(){
    if(typeof originalOpenPresetGenerator === "function") originalOpenPresetGenerator();
    injectCourseCountControl();
  }

  function presetDefs(){
    if(typeof PRESET_DEFINITIONS !== "undefined") return PRESET_DEFINITIONS;
    return [
      {id:"condensed", label:"Condensed days"},
      {id:"spread", label:"Spread out"},
      {id:"late", label:"Latest starts"},
      {id:"balanced", label:"Balanced"},
      {id:"fewestGaps", label:"Fewest gaps"},
      {id:"shortestDays", label:"Shortest campus days"},
      {id:"noEarly", label:"No early mornings"},
      {id:"noEvening", label:"No evening classes"},
      {id:"commute", label:"Commute-friendly"}
    ];
  }

  function coursePreferencePenalty(course){
    const visibility = courseVisibility(course);
    if(visibility === "visible") return 0;
    if(visibility === "shadow") return 80;
    return 260;
  }

  function scoreCountAware(candidate, presetId, target){
    const countPenalty = Math.abs(target - candidate.includedCourseIds.length) * 160;
    return presetScore(candidate.meetings, presetId, candidate) + (candidate.coursePenalty || 0) + countPenalty;
  }

  function findBestPresetCandidateWithCourseCount(source, presetId, settings){
    const usableCourses = (source.courses || [])
      .filter(course => courseAllowedForPreset(course, settings) && (course.meetings || []).length)
      .map(course => ({course, choices:courseChoicesForPreset(course, settings)}))
      .filter(item => item.choices && item.choices.length)
      .sort((a,b) => coursePreferencePenalty(a.course) - coursePreferencePenalty(b.course));

    const target = Math.min(settings.targetCourseCount || 5, usableCourses.length);
    if(!target) return null;

    let candidates = [{idsByCourse:{}, includedCourseIds:[], meetings:[], selectedMisses:0, hiddenUsed:0, shadowUsed:0, coursePenalty:0}];

    usableCourses.forEach((item, index) => {
      const remainingAfterThis = usableCourses.length - index - 1;
      const next = [];

      candidates.forEach(candidate => {
        const includedSoFar = candidate.includedCourseIds.length;

        if(includedSoFar + remainingAfterThis >= target){
          next.push({...candidate});
        }

        if(includedSoFar < target){
          item.choices.forEach(choice => {
            const courseMeetings = meetingsForCourseChoice(item.course, choice);
            if(!courseMeetings.length) return;
            const combined = {
              idsByCourse:{...candidate.idsByCourse, [item.course.id]:choice.ids},
              includedCourseIds:candidate.includedCourseIds.concat(item.course.id),
              meetings:candidate.meetings.concat(courseMeetings),
              selectedMisses:candidate.selectedMisses + choice.selectedMisses,
              hiddenUsed:candidate.hiddenUsed + choice.hiddenUsed,
              shadowUsed:candidate.shadowUsed + choice.shadowUsed,
              coursePenalty:candidate.coursePenalty + coursePreferencePenalty(item.course)
            };
            combined.score = scoreCountAware(combined, presetId, target);
            next.push(combined);
          });
        }
      });

      next.sort((a,b) => scoreCountAware(a, presetId, target) - scoreCountAware(b, presetId, target));
      candidates = next.slice(0, settings.beamLimit);
    });

    const exact = candidates.filter(c => c.includedCourseIds.length === target);
    const pool = exact.length ? exact : candidates;
    pool.sort((a,b) => scoreCountAware(a, presetId, target) - scoreCountAware(b, presetId, target));
    return pool[0] || null;
  }

  function notesWithCourseCount(def, candidate, settings){
    const stats = presetStats(candidate.meetings || []);
    const visibleDays = activeDays.length || 5;
    const freeDays = Math.max(0, visibleDays - stats.activeDays);
    const conflictLine = stats.conflicts ? `Warning: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"} found. Review manually.` : "No conflicts found by the local checker.";
    return [
      `Generated preset: ${def.label}`,
      "",
      `Courses requested: ${settings.targetCourseCount || 5}`,
      `Courses included: ${candidate.includedCourseIds?.length || 0}`,
      "",
      "How it was made: Timetable Studio tried combinations from the current tab, selected the requested number of courses when possible, and picked the result that best matched this preset. Hidden courses/options were ignored unless enabled in the preset settings. This does not check enrolment availability, waitlists, degree requirements, or prerequisites.",
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

  function buildTabFromCandidate(source, def, candidate, settings){
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = uid("tt");
    copy.title = `${source.title} · ${def.label}`;
    copy.notes = notesWithCourseCount(def, candidate, settings);

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

  function runPresetGeneratorWithCourseCount(){
    const settings = getPresetGeneratorSettings();
    settings.targetCourseCount = Math.max(1, Math.min(6, Number(document.getElementById("pgTargetCourseCount")?.value || 5)));

    if(!settings.presetIds.length){ alert("Choose at least one preset type."); return; }
    if(!settings.includeVisibleCourses && !settings.includeShadowCourses && !settings.includeHiddenCourses){ alert("Choose at least one course visibility type."); return; }
    if(!settings.includeSelectedOptions && !settings.includeShadowOptions && !settings.includeHiddenOptions){ alert("Choose at least one option type."); return; }

    const source = current();
    if(!source.courses.some(c => (c.meetings || []).length)){ alert("Add or import courses first."); return; }

    const generated = [];
    const warnings = [];

    settings.presetIds.forEach(id => {
      const def = presetDefs().find(p => p.id === id);
      if(!def) return;
      const best = findBestPresetCandidateWithCourseCount(source, id, settings);
      if(!best || !best.meetings.length){
        warnings.push(`${def.label}: no usable combination found.`);
        return;
      }
      const stats = presetStats(best.meetings);
      if((best.includedCourseIds || []).length < settings.targetCourseCount){
        warnings.push(`${def.label}: only ${(best.includedCourseIds || []).length} usable course${(best.includedCourseIds || []).length === 1 ? "" : "s"} found.`);
      }
      if(stats.conflicts) warnings.push(`${def.label}: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}.`);
      generated.push(buildTabFromCandidate(source, def, best, settings));
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

    const message = [`Generated ${generated.length} preset tab${generated.length === 1 ? "" : "s"} using up to ${settings.targetCourseCount} course${settings.targetCourseCount === 1 ? "" : "s"}.`];
    if(warnings.length) message.push("", "Review notes:", ...warnings.slice(0, 6));
    alert(message.join("\n"));
  }

  window.generateSchedulePresets = openPresetGeneratorWithCourseCount;
  window.runPresetGeneratorFromModal = runPresetGeneratorWithCourseCount;
})();
