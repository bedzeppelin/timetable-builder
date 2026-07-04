/* Simple cloud sync UI for Timetable Studio. */
(function(){
  const SYNC_CODE_KEY = "timetableStudioSyncCode";
  let syncBusy = false;

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
            <div class="small"><b>Simple sync:</b> save this timetable to the cloud, then open it on another device with the same code or link.</div>
            <label>Sync code
              <input id="syncCodeInput" placeholder="ABCD-1234" autocomplete="off" autocapitalize="characters" />
            </label>
            <div class="syncCodeRow">
              <span class="syncCodeOutput" id="syncCodeOutput">No code yet</span>
              <button class="secondary" type="button" onclick="copySyncLink()">Copy link</button>
            </div>
            <div class="syncStatus" id="syncStatus"></div>
          </div>
          <div class="syncActions">
            <button type="button" onclick="saveScheduleToCloud()">Save to cloud</button>
            <button class="secondary" type="button" onclick="loadScheduleFromCloud()">Load from code</button>
            <button class="secondary" type="button" onclick="refreshScheduleFromCloud()">Refresh from cloud</button>
            <button class="ghost" type="button" onclick="clearSyncCode()">Clear code</button>
          </div>
          <div class="syncPrivacy">
            Anyone with the sync code or link can load and overwrite this synced schedule. Use it for your own devices or trusted sharing, not private records.
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

  function setSyncStatus(message, isError=false){
    const el = document.getElementById("syncStatus");
    if(el){
      el.textContent = message || "";
      el.style.color = isError ? "#c2183a" : "#686868";
    }
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
    if(normalized){
      localStorage.setItem(SYNC_CODE_KEY, normalized);
    }
    const input = document.getElementById("syncCodeInput");
    const output = document.getElementById("syncCodeOutput");
    if(input) input.value = normalized;
    if(output) output.textContent = normalized || "No code yet";
    return normalized;
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

  function openSyncModal(){
    ensureSyncModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    setCurrentCode(localStorage.getItem(SYNC_CODE_KEY) || "");
    setSyncStatus("Save first to create a sync code, or enter an existing code and load it.");
    document.body.classList.remove("mobileDrawerOpen");
  }

  function closeSyncModal(){
    const overlay = document.getElementById("syncModalOverlay");
    if(overlay) overlay.style.display = "none";
  }

  async function saveScheduleToCloud(){
    if(syncBusy) return;
    syncBusy = true;
    setSyncStatus("Saving schedule to cloud...");
    try{
      const code = currentCode();
      const payload = await syncRequest({action:"save", code:code || undefined, data:schedulePayload(), label:current().title || "Timetable Studio"});
      setCurrentCode(payload.code);
      setSyncStatus(`Saved. Use code ${payload.code} on your other device.`);
    }catch(error){
      setSyncStatus(error.message || String(error), true);
    }finally{
      syncBusy = false;
    }
  }

  async function loadScheduleFromCloud(){
    if(syncBusy) return;
    const code = currentCode();
    if(!code){
      setSyncStatus("Enter a sync code first.", true);
      return;
    }
    if(!confirm("Load this synced schedule? This will replace the timetable data on this device.")) return;
    syncBusy = true;
    setSyncStatus("Loading schedule...");
    try{
      const payload = await syncRequest({action:"load", code});
      state = payload.data;
      if(!state.activeTimetableId || !state.timetables?.some(t => t.id === state.activeTimetableId)){
        state.activeTimetableId = state.timetables?.[0]?.id;
      }
      setCurrentCode(payload.code);
      persist();
      render();
      closeSyncModal();
      alert("Synced schedule loaded on this device.");
    }catch(error){
      setSyncStatus(error.message || String(error), true);
    }finally{
      syncBusy = false;
    }
  }

  function refreshScheduleFromCloud(){
    loadScheduleFromCloud();
  }

  async function copySyncLink(){
    const code = currentCode();
    if(!code){
      setSyncStatus("Save first or enter a code before copying a link.", true);
      return;
    }
    const url = new URL(window.location.href);
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
    setCurrentCode("");
    setSyncStatus("Sync code cleared from this device. Cloud copy is not deleted.");
  }

  function checkSyncUrl(){
    const params = new URLSearchParams(window.location.search);
    const code = params.get("sync");
    if(!code) return;
    ensureSyncModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    setCurrentCode(code);
    setSyncStatus("This link contains a sync code. Tap Load from code to import it on this device.");
  }

  function bootSync(){
    ensureSyncButton();
    ensureSyncModal();
    setCurrentCode(localStorage.getItem(SYNC_CODE_KEY) || "");
    checkSyncUrl();
  }

  window.openSyncModal = openSyncModal;
  window.closeSyncModal = closeSyncModal;
  window.saveScheduleToCloud = saveScheduleToCloud;
  window.loadScheduleFromCloud = loadScheduleFromCloud;
  window.refreshScheduleFromCloud = refreshScheduleFromCloud;
  window.copySyncLink = copySyncLink;
  window.clearSyncCode = clearSyncCode;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootSync);
  }else{
    bootSync();
  }
})();
