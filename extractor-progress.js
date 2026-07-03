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

window.addEventListener("DOMContentLoaded", ensureScreenshotProgressUI);
