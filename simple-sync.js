/* No-backend device transfer links for Timetable Studio. */
(function(){
  const HASH_PREFIX = "#ts-transfer=";
  const MAX_RECOMMENDED_LINK_LENGTH = 120000;

  function ensureTransferStyles(){
    if(document.getElementById("simpleSyncStyles")) return;
    const style = document.createElement("style");
    style.id = "simpleSyncStyles";
    style.textContent = `
      .syncCodeBox{display:grid;gap:10px;border:1px solid #e4e4df;background:#f8f8f6;border-radius:16px;padding:12px}
      .syncCodeRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .syncCodeOutput{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:900;letter-spacing:.02em;background:#111;color:#fff;border-radius:12px;padding:10px 12px;display:inline-flex;align-items:center;min-height:42px;word-break:break-all}
      .syncStatus{font-size:.80rem;color:#686868;line-height:1.45;min-height:1.2em}
      .syncPrivacy{font-size:.76rem;color:#686868;line-height:1.45;border-left:3px solid #111;padding-left:10px}
      .syncActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .syncActions button{width:100%}
      @media (max-width:720px){.syncActions{grid-template-columns:1fr}.syncCodeRow{align-items:stretch}.syncCodeOutput{justify-content:center;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureTransferButton(){
    if(document.getElementById("openSyncModalBtn")) return;
    const groups = Array.from(document.querySelectorAll(".menuGroup"));
    const importGroup = groups.find(group => (group.querySelector("summary")?.textContent || "").toLowerCase().includes("import"));
    const actions = importGroup?.querySelector(".actions") || document.querySelector(".actions");
    if(!actions) return;
    const btn = document.createElement("button");
    btn.id = "openSyncModalBtn";
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = "Transfer schedule";
    btn.addEventListener("click", openSyncModal);
    actions.appendChild(btn);
  }

  function ensureTransferModal(){
    if(document.getElementById("syncModalOverlay")) return;
    ensureTransferStyles();
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";
    overlay.id = "syncModalOverlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Transfer schedule</h2>
        <div class="formStack">
          <div class="syncCodeBox">
            <div class="small"><b>No-account transfer:</b> this creates a link that carries your current timetable data. Open the link on your phone/computer to import it there.</div>
            <div class="syncCodeRow">
              <span class="syncCodeOutput" id="syncCodeOutput">No transfer link yet</span>
            </div>
            <label>Paste a transfer link or code
              <textarea id="syncCodeInput" placeholder="Paste a Timetable Studio transfer link here"></textarea>
            </label>
            <div class="syncStatus" id="syncStatus"></div>
          </div>
          <div class="syncActions">
            <button type="button" onclick="copySyncLink()">Copy transfer link</button>
            <button class="secondary" type="button" onclick="loadScheduleFromCloud()">Import pasted link</button>
            <button class="secondary" type="button" onclick="downloadTransferFile()">Download JSON backup</button>
            <button class="ghost" type="button" onclick="clearSyncCode()">Clear pasted link</button>
          </div>
          <div class="syncPrivacy">
            This is not live cloud sync. It is a one-time device transfer. To update your phone after changing your laptop schedule, copy a new transfer link. Anyone with the link can import the schedule.
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

  function schedulePayload(){
    const notes = document.getElementById("notes");
    if(notes) current().notes = notes.value;
    return JSON.parse(JSON.stringify(state));
  }

  function encodePayload(data){
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    const chunk = 0x8000;
    for(let i = 0; i < bytes.length; i += chunk){
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodePayload(encoded){
    const normalized = String(encoded || "").trim().replace(/^.*#ts-transfer=/, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function transferUrl(){
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "ts-transfer=" + encodePayload(schedulePayload());
    return url.toString();
  }

  function openSyncModal(){
    ensureTransferModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    document.body.classList.remove("mobileDrawerOpen");
    setSyncStatus("Copy a transfer link, send/open it on your other device, then import it there.");
  }

  function closeSyncModal(){
    const overlay = document.getElementById("syncModalOverlay");
    if(overlay) overlay.style.display = "none";
  }

  function saveScheduleToCloud(){
    copySyncLink();
  }

  async function copySyncLink(){
    try{
      const link = transferUrl();
      const output = document.getElementById("syncCodeOutput");
      if(output) output.textContent = link.length > 54 ? link.slice(0, 54) + "..." : link;
      if(link.length > MAX_RECOMMENDED_LINK_LENGTH){
        setSyncStatus("This schedule link is very long. Copy may still work, but Export JSON may be safer for this timetable.", true);
      }else{
        setSyncStatus("Transfer link created and copied. Open it on your other device.");
      }
      await navigator.clipboard.writeText(link);
    }catch(error){
      setSyncStatus("Could not copy automatically. Try Export JSON instead.", true);
    }
  }

  function extractTransferCode(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    if(raw.includes("#ts-transfer=")) return raw.split("#ts-transfer=").pop();
    return raw.replace(/^ts-transfer=/, "");
  }

  function importTransferPayload(data){
    if(!data || !Array.isArray(data.timetables)){
      throw new Error("This does not look like a Timetable Studio transfer link.");
    }
    state = data;
    if(!state.activeTimetableId || !state.timetables.some(t => t.id === state.activeTimetableId)){
      state.activeTimetableId = state.timetables[0]?.id;
    }
    persist();
    render();
  }

  function loadScheduleFromCloud(){
    const input = document.getElementById("syncCodeInput");
    const code = extractTransferCode(input?.value || window.location.hash);
    if(!code){
      setSyncStatus("Paste a transfer link first.", true);
      return;
    }
    if(!confirm("Import this transferred schedule? This will replace the timetable data on this device.")) return;
    try{
      importTransferPayload(decodePayload(code));
      closeSyncModal();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      alert("Schedule imported on this device.");
    }catch(error){
      setSyncStatus(error.message || String(error), true);
    }
  }

  function refreshScheduleFromCloud(){
    loadScheduleFromCloud();
  }

  function clearSyncCode(){
    const input = document.getElementById("syncCodeInput");
    const output = document.getElementById("syncCodeOutput");
    if(input) input.value = "";
    if(output) output.textContent = "No transfer link yet";
    setSyncStatus("Pasted transfer link cleared.");
  }

  function downloadTransferFile(){
    const blob = new Blob([JSON.stringify(schedulePayload(), null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "timetable-studio-transfer.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setSyncStatus("JSON backup downloaded. Import it on another device using Import JSON.");
  }

  function checkTransferUrl(){
    if(!window.location.hash.startsWith(HASH_PREFIX)) return;
    ensureTransferModal();
    document.getElementById("syncModalOverlay").style.display = "flex";
    const input = document.getElementById("syncCodeInput");
    if(input) input.value = window.location.href;
    setSyncStatus("This link contains a transferred schedule. Tap Import pasted link to load it on this device.");
  }

  function bootTransfer(){
    ensureTransferButton();
    ensureTransferModal();
    checkTransferUrl();
  }

  window.openSyncModal = openSyncModal;
  window.closeSyncModal = closeSyncModal;
  window.saveScheduleToCloud = saveScheduleToCloud;
  window.loadScheduleFromCloud = loadScheduleFromCloud;
  window.refreshScheduleFromCloud = refreshScheduleFromCloud;
  window.copySyncLink = copySyncLink;
  window.clearSyncCode = clearSyncCode;
  window.downloadTransferFile = downloadTransferFile;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootTransfer);
  }else{
    bootTransfer();
  }
})();
