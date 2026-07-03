/* Adds course-count and explore-mode controls to the preset generator without changing the core app. */
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
      <label>Course selection mode
        <select id="pgCourseSetMode">
          <option value="best" selected>Best schedule fit</option>
          <option value="explore">Explore different course combinations</option>
        </select>
      </label>
      <div class="presetSubtext">Default is 5 courses. Best fit chooses the strongest schedule. Explore mode intentionally tries different course sets across generated tabs, which is helpful when you are still deciding what to take.</div>
    `;
    grid.prepend(card);

    const disclaimer = modal.querySelector(".presetDisclaimer span");
    if(disclaimer){
      disclaimer.textContent = "The app looks at the courses/options in your current tab, tries different combinations, and makes new timetable tabs using the number of courses and preset types you choose. Explore mode can intentionally show different course combinations instead of only the single best-scoring set. It is not checking enrolment availability, waitlists, program requirements, or prerequisites. Always review the final schedule manually.";
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

  function courseSetKey(candidate){
    return (candidate.includedCourseIds || []).slice().sort().join("|");
  }

  function courseSetOverlap(candidate, usedCourseSets){
    const ids = new Set(candidate.includedCourseIds || []);
    if(!ids.size || !usedCourseSets.length) return 0;
    let maxOverlap = 0;
    usedCourseSets.forEach(set => {
      let overlap = 0;
      ids.forEach(id => { if(set.has(id)) overlap++; });
      maxOverlap = Math.max(maxOverlap, overlap / Math.max(ids.size, set.size || 1));
    });
    return maxOverlap;
  }

  function scoreCountAware(candidate, presetId, target){
    const countPenalty = Math.abs(target - candidate.includedCourseIds.length) * 160;
    return presetScore(candidate.meetings, presetId, candidate) + (candidate.coursePenalty || 0) + countPenalty;
  }

  function candidateSortScore(candidate, presetId, target, settings, usedCourseSets){
    let score = scoreCountAware(candidate, presetId, target);
    if(settings.courseSetMode === "explore"){
      // In explore mode, strongly reward course sets that differ from tabs already generated.
      score += courseSetOverlap(candidate, usedCourseSets || []) * 1800;
      // Add a tiny deterministic tie-breaker so equally-good sets do not always cluster the same way.
      score += (courseSetKey(candidate).length % 17) * 0.01;
    }
    return score;
  }

  function findCandidatePoolWithCourseCount(source, presetId, settings){
    const usableCourses = (source.courses || [])
      .filter(course => courseAllowedForPreset(course, settings) && (course.meetings || []).length)
      .map(course => ({course, choices:courseChoicesForPreset(course, settings)}))
      .filter(item => item.choices && item.choices.length)
      .sort((a,b) => coursePreferencePenalty(a.course) - coursePreferencePenalty(b.course));

    const target = Math.min(settings.targetCourseCount || 5, usableCourses.length);
    if(!target) return {target, candidates:[]};

    let candidates = [{idsByCourse:{}, includedCourseIds:[], meetings:[], selectedMisses:0, hiddenUsed:0, shadowUsed:0, coursePenalty:0}];
    const limit = Math.max(settings.beamLimit, settings.courseSetMode === "explore" ? 900 : settings.beamLimit);

    usableCourses.forEach((item, index) => {
      const remainingAfterThis = usableCourses.length - index - 1;
      const next = [];

      candidates.forEach(candidate => {
        const includedSoFar = candidate.includedCourseIds.length;

        // Skip this course only if there are still enough courses left to reach the requested count.
        if(includedSoFar + remainingAfterThis >= target){
          next.push({...candidate});
        }

        // Include this course only if the preset still needs more courses.
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
      candidates = next.slice(0, limit);
    });

    const exact = candidates.filter(c => c.includedCourseIds.length === target);
    const pool = exact.length ? exact : candidates;
    pool.forEach(candidate => {
      candidate.targetCourseCount = target;
      candidate.availableCourseCount = usableCourses.length;
    });
    return {target, candidates:pool};
  }

  function pickCandidateFromPool(pool, presetId, target, settings, usedCourseSets){
    if(!pool.length) return null;
    const sorted = pool.slice().sort((a,b) => candidateSortScore(a, presetId, target, settings, usedCourseSets) - candidateSortScore(b, presetId, target, settings, usedCourseSets));
    return sorted[0] || null;
  }

  function notesWithCourseCount(def, candidate, settings){
    const stats = presetStats(candidate.meetings || []);
    const visibleDays = activeDays.length || 5;
    const freeDays = Math.max(0, visibleDays - stats.activeDays);
    const conflictLine = stats.conflicts ? `Warning: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"} found. Review manually.` : "No conflicts found by the local checker.";
    const modeLine = settings.courseSetMode === "explore" 
      ? "Course mode: Explore different course combinations. This preset may use a different course set so you can compare possible semester builds."
      : "Course mode: Best schedule fit. This preset prioritizes the strongest-scoring schedule for the chosen rules.";
    return [
      `Generated preset: ${def.label}`,
      "",
      `Courses requested: ${settings.targetCourseCount || 5}`,
      `Courses included: ${candidate.includedCourseIds?.length || 0}`,
      modeLine,
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
    settings.courseSetMode = document.getElementById("pgCourseSetMode")?.value || "best";

    if(!settings.presetIds.length){ alert("Choose at least one preset type."); return; }
    if(!settings.includeVisibleCourses && !settings.includeShadowCourses && !settings.includeHiddenCourses){ alert("Choose at least one course visibility type."); return; }
    if(!settings.includeSelectedOptions && !settings.includeShadowOptions && !settings.includeHiddenOptions){ alert("Choose at least one option type."); return; }

    const source = current();
    if(!source.courses.some(c => (c.meetings || []).length)){ alert("Add or import courses first."); return; }

    const generated = [];
    const warnings = [];
    const usedCourseSets = [];

    settings.presetIds.forEach(id => {
      const def = presetDefs().find(p => p.id === id);
      if(!def) return;
      const {target, candidates} = findCandidatePoolWithCourseCount(source, id, settings);
      const best = pickCandidateFromPool(candidates, id, target, settings, usedCourseSets);
      if(!best || !best.meetings.length){
        warnings.push(`${def.label}: no usable combination found.`);
        return;
      }
      const stats = presetStats(best.meetings);
      if((best.includedCourseIds || []).length < settings.targetCourseCount){
        warnings.push(`${def.label}: only ${(best.includedCourseIds || []).length} usable course${(best.includedCourseIds || []).length === 1 ? "" : "s"} found.`);
      }
      if(stats.conflicts) warnings.push(`${def.label}: ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}.`);
      usedCourseSets.push(new Set(best.includedCourseIds || []));
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

    const modeText = settings.courseSetMode === "explore" ? " with different course combinations" : "";
    const message = [`Generated ${generated.length} preset tab${generated.length === 1 ? "" : "s"}${modeText} using up to ${settings.targetCourseCount} course${settings.targetCourseCount === 1 ? "" : "s"}.`];
    if(warnings.length) message.push("", "Review notes:", ...warnings.slice(0, 6));
    alert(message.join("\n"));
  }

  window.generateSchedulePresets = openPresetGeneratorWithCourseCount;
  window.runPresetGeneratorFromModal = runPresetGeneratorWithCourseCount;
})();
