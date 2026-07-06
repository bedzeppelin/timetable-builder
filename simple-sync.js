/* Live Supabase-backed sync UI for Timetable Studio. */
(function(){
  const SYNC_CODE_KEY = "timetableStudioSyncCode";
  const SYNC_AUTO_KEY = "timetableStudioAutoSync";
  const POLL_MS = 15000;
  const SAVE_DEBOUNCE_MS = 1400;

  let syncBusy = false;
  let applyingRemote = false;
  let saveTimer = null;
  let pollTimer = null;
  let lastRemoteUpdatedAt = localStorage.getItem("timetableStudioLastRemoteUpdatedAt") || "";
  let basePersist = null;

  function ensureSyncStyles(){
    if(document.getElementById("simpleSyncStyles")) return;
    const style = document.createElement("style");
    style.id = "simpleSyncStyles";
    style.textContent = `
      .syncCodeBox{display:grid;gap:10px;border:1px solid #e4e4df;background:#f8f8f6;border-radius:16px;padding:12px}
      .syncCodeRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .syncCodeOutput{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:900;letter-spacing:.08em;background:#111;color:#fff;border-radius:12px;padding:10px 12px;display:inline-flex;align-items:center;min-height:42px}
      .syncStatus{font-size:.80rem;color:#686868;line-height:1.45;min-height:1.2em}
      .syncPrivacy{font-size:.76rem;color:#686868;line-height:1.45;border-left:3px solid #111;padding-left:10px}
      .syncActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .syncActions button{width:100%}
      .syncToggleRow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #e4e4df;border-radius:14px;padding:10px;background:#fff}
      .syncToggleRow label{display:flex;align-items:center;gap:8px;margin:0;font-weight:850}.syncToggleRow input{width:auto;accent-color:#111}
      @media (max-width:720px){.syncActions{grid-template-columns:1fr}.syncCodeRow{align-items:stretch}.syncCodeOutput{justify-content:center;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureSyncButton(){
    if(document.getElementById("openSyncModalBtn")) return;
    const groups = Array.from(document.querySelectorAll(".menuGroup"));
    const importGroup = groups.find(group => (group.querySelector("summary")?.textContent || "").toLowerCase().includes("import"));
    const actions = importGroup?.querySelector(".actions") || document.querySelector(".actions");
    if(!actions) return;
    const btn = document.createElement("button");
    btn.id = "openSyncModalBtn";
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = "Sync schedule";
    btn.addEventListener("click", openSyncModal);
    actions.appendChild(btn);
  }

  function ensureSyncModal(){
    if(document.getElementById("syncModalOverlay")) return;
    ensureSyncStyles();
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";
    overlay.id = "syncModalOverlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Sync schedule</h2>
        <div class="formStack">
          <div class="syncCodeBox">
            <div class="small"><b>Live sync:</b> save this timetable to a sync code, then use the same code on your other device. With auto-sync on, changes are saved after you edit and the other device checks for updates every few seconds.</div>
            <label>Sync code
              <input id="syncCodeInput" placeholder="ABCD-1234" autocomplete="off" autocapitalize="characters" />
            </label>
            <div class="syncCodeRow">
              <span class="syncCodeOutput" id="syncCodeOutput">No code yet</span>
              <button class="secondary" type="button" onclick="copySyncLink()">Copy link</button>
            </div>
            <div class="syncToggleRow">
              <label><input type="checkbox" id="syncAutoToggle" onchange="setAutoSyncFromToggle()"> Auto-sync this device</label>
              <span class="small" id="syncAutoState">Off</span>
            </div>
            <div class="syncStatus" id="syncStatus"></div>
          </div>
          <div class="syncActions">
            <button type="button" onclick="saveScheduleToCloud()">Save / create code</button>
            <button class="secondary" type="button" onclick="loadScheduleFromCloud()">Load from code</button>
            <button class="secondary" type="button" onclick="refreshScheduleFromCloud()">Check now</button>
            <button class="ghost" type="button" onclick="clearSyncCode()">Stop syncing</button>
          </div>
          <div class="syncPrivacy">
            Simple sync uses the code as the access key. Anyone with the code or link can load and overwrite that synced schedule. Last save wins if two devices edit at the same time.
          </div>
        </div>
        <div class="modalActions">
          <button class="secondary" onclick="closeSyncModal()">Close</button>
        </div>
      </div>
    `;
    overlay.addEventListener("click", e => {
      if(e.target.id === "syncModalOverlay") closeSyncModal();
    });
    document.body.appendChild(overlay);
  }

  function normalizeCode(code){
    const raw = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
    return raw.replace(/(.{4})/g, "$1-").replace(/-$/, "");
  }

  function currentCode(){
    return normalizeCode(document.getElementById("syncCodeInput")?.value || localStorage.getItem(SYNC_CODE_KEY) || "");
  }

  function setCurrentCode(code){
    const normalized = normalizeCode(code);
    if(normalized) localStorage.setItem(SYNC_CODE_KEY, normalized);
    const input = document.getElementById("syncCodeInput");
    const output = document.getElementById("syncCodeOutput");
    if(input) input.value = normalized;
    if(output) output.textContent = normalized || "No code yet";
    return normalized;
  }

  function autoSyncEnabled(){
    return localStorage.getItem(SYNC_AUTO_KEY) === "true" && !!localStorage.getItem(SYNC_CODE_KEY);
  }

  function updateAutoSyncUI(){
    const checked = autoSyncEnabled();
    const toggle = document.getElementById("syncAutoToggle");
    const label = document.getElementById("syncAutoState");
    if(toggle) toggle.checked = checked;
    if(label) label.textContent = checked ? "On" : "Off";
  }

  function setSyncStatus(message, isError=false){
    const el = document.getElementById("syncStatus");
    if(el){
      el.textContent = message || "";
      el.style.color = isError ? "#c2183a" : "#686868";
    }
  }

  function schedulePayload(){
    const notes = document.getElementById("notes");
    if(notes) current().notes = notes.value;
    return JSON.parse(JSON.stringify(state));
  }

  async function syncRequest(body){
    const response = await fetch("/api/sync-schedule", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || !payload.ok){
      throw new Error(payload.error || "Sync request failed.");
    }
    return payload;
  }

  async function saveScheduleToCloud(silent=false){
    if(syncBusy) return;
    syncBusy = true;
    if(!silent) setSyncStatus("Saving schedule...");
    try{
      const code = currentCode();
      const payload = await syncRequest({action:"save", code:code || undefined, data:schedulePayload(), label:current().title || "Timetable Studio"});
      setCurrentCode(payload.code);
      lastRemoteUpdatedAt = payload.updatedAt || new Date().toISOString();
      localStorage.setItem("timetableStudioLastRemoteUpdatedAt", lastRemoteUpdatedAt);
      if(!silent) setSyncStatus(`Saved. Use code ${payload.code} on your other device.`);
      startAutoSyncLoop();
    }catch(error){
      setSyncStatus(error.message || String(error), true);
    }finally{
      syncBusy = false;
    }
  }

  function applyRemotePayload(payload){
    if(!payload?.data || !Array.isArray(payload.data.timetables)){
      throw new Error("Synced data is not a valid Timetable Studio schedule.");
    }
    applyingRemote = true;
    state = payload.data;
    if(!state.activeTimetableId || !state.timetables.some(t => t.id === state.activeTimetableId)){
      state.activeTimetableId = state.timetables[0]?.id;
    }
    persist();
    render();
    applyingRemote = false;
  }

  async function loadScheduleFromCloud(silent=false){
    if(syncBusy) return;
    const code = currentCode();
    if(!code){
      setSyncStatus("Enter a sync code first.", true);
      return;
    }
    if(!silent && !confirm("Load this synced schedule? This will replace the timetable data on this device.")) return;
    syncBusy = true;
    if(!silent) setSyncStatus("Loading schedule...");
    try{
      const payload = await syncRequest({action:"load", code});
      applyRemotePayload(payload);
      setCurrentCode(payload.code);
      lastRemoteUpdatedAt = payload.updatedAt || "";
      localStorage.setItem("timetableStudioLastRemoteUpdatedAt", lastRemoteUpdatedAt);
      if(!silent){
        closeSyncModal();
        alert("Synced schedule loaded on this device.");
      }
    }catch(error){
      if(!silent) setSyncStatus(error.message || String(error), true);
    }finally{
      syncBusy = false;
    }
  }

  async function refreshScheduleFromCloud(){
    const code = currentCode();
    if(!code){
      setSyncStatus("Enter a sync code first.", true);
      return;
    }
    setSyncStatus("Checking for updates...");
    await loadScheduleFromCloud(true);
    setSyncStatus("Checked for updates.");
  }

  async function pollForRemoteUpdates(){
    if(!autoSyncEnabled() || syncBusy || applyingRemote || saveTimer) return;
    try{
      const code = currentCode();
      const payload = await syncRequest({action:"load", code});
      if(payload.updatedAt && payload.updatedAt !== lastRemoteUpdatedAt){
        applyRemotePayload(payload);
        lastRemoteUpdatedAt = payload.updatedAt;
        localStorage.setItem("timetableStudioLastRemoteUpdatedAt", lastRemoteUpdatedAt);
        setSyncStatus("Updated from cloud.");
      }
    }catch(error){
      // Stay quiet during background checks; show errors in the modal when users use buttons.
    }
  }

  function scheduleAutoSave(){
    if(!autoSyncEnabled() || applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveScheduleToCloud(true);
    }, SAVE_DEBOUNCE_MS);
  }

  function patchPersistForAutoSync(){
    if(basePersist || typeof persist !== "function") return;
    basePersist = persist;
    persist = function(){
      basePersist();
      scheduleAutoSave();
    };
  }

  function startAutoSyncLoop(){
    updateAutoSyncUI();
    if(pollTimer) clearInterval(pollTimer);
    if(autoSyncEnabled()){
      pollTimer = setInterval(pollForRemoteUpdates, POLL_MS);
    }
  }

  function setAutoSyncFromToggle(){
    const toggle = document.getElementById("syncAutoToggle");
    const code = currentCode();
    if(toggle?.checked && !code){
      toggle.checked = false;
      setSyncStatus("Save first to create a sync code before turning on auto-sync.", true);
      updateAutoSyncUI();
      return;
    }
    localStorage.setItem(SYNC_AUTO_KEY, toggle?.checked ? "true" : "false");
    if(code) setCurrentCode(code);
    startAutoSyncLoop();
    setSyncStatus(toggle?.checked ? "Auto-sync is on for this device." : "Auto-sync is off for this device.");
  }

  async function copySyncLink(){
    const code = currentCode();
    if(!code){
      setSyncStatus("Save first or enter a code before copying a link.", true);
      return;
    }
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("sync", code);
    try{
      await navigator.clipboard.writeText(url.toString());
      setSyncStatus("Sync link copied.");
    }catch{
      setSyncStatus(url.toString());
    }
  }

  function clearSyncCode(){
    localStorage.removeItem(SYNC_CODE_KEY);
    localStorage.removeItem(SYNC_AUTO_KEY);
    localStorage.removeItem("timetableStudioLastRemoteUpdatedAt");
    setCurrentCode("");
    lastRemoteUpdatedAt = "";
    startAutoSyncLoop();
    setSyncStatus("Sync stopped on this device. Cloud copy is not deleted.");
  }

  function openSyncModal(){
    ensureSyncModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    setCurrentCode(localStorage.getItem(SYNC_CODE_KEY) || "");
    updateAutoSyncUI();
    setSyncStatus("Save first to create a sync code, or enter an existing code and load it.");
    document.body.classList.remove("mobileDrawerOpen");
  }

  function closeSyncModal(){
    const overlay = document.getElementById("syncModalOverlay");
    if(overlay) overlay.style.display = "none";
  }

  function checkSyncUrl(){
    const params = new URLSearchParams(window.location.search);
    const code = params.get("sync");
    if(!code) return;
    ensureSyncModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    setCurrentCode(code);
    updateAutoSyncUI();
    setSyncStatus("This link contains a sync code. Tap Load from code to import it on this device.");
  }

  function bootSync(){
    ensureSyncButton();
    ensureSyncModal();
    patchPersistForAutoSync();
    setCurrentCode(localStorage.getItem(SYNC_CODE_KEY) || "");
    updateAutoSyncUI();
    startAutoSyncLoop();
    checkSyncUrl();
  }

  window.openSyncModal = openSyncModal;
  window.closeSyncModal = closeSyncModal;
  window.saveScheduleToCloud = saveScheduleToCloud;
  window.loadScheduleFromCloud = loadScheduleFromCloud;
  window.refreshScheduleFromCloud = refreshScheduleFromCloud;
  window.copySyncLink = copySyncLink;
  window.clearSyncCode = clearSyncCode;
  window.setAutoSyncFromToggle = setAutoSyncFromToggle;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootSync);
  }else{
    bootSync();
  }
})();
