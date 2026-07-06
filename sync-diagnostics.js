/* Adds a small connection test to the Sync schedule modal. */
(function(){
  async function testSyncConnection(){
    const status = document.getElementById("syncStatus");
    const setStatus = (message, error=false) => {
      if(!status){
        alert(message);
        return;
      }
      status.textContent = message;
      status.style.color = error ? "#c2183a" : "#686868";
    };

    setStatus("Testing sync connection...");
    try{
      const response = await fetch("/api/sync-schedule", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"load", code:"TEST"})
      });
      const payload = await response.json().catch(() => ({}));

      if(response.status === 404){
        setStatus("Connected. Supabase responded correctly; no TEST schedule exists, which is normal.");
        return;
      }
      if(response.status === 501){
        setStatus("The sync API is deployed, but Vercel is not seeing the Supabase environment variables. Check Production env vars, then redeploy.", true);
        return;
      }
      if(!response.ok){
        setStatus(payload.error || `Sync API returned ${response.status}. Check the Supabase table/key setup.`, true);
        return;
      }
      setStatus("Connected. Sync API responded successfully.");
    }catch(error){
      setStatus("Could not reach /api/sync-schedule. Redeploy Vercel and check that the API route exists.", true);
    }
  }

  function addDiagnosticButton(){
    const actions = document.querySelector("#syncModalOverlay .syncActions");
    if(!actions || document.getElementById("testSyncConnectionBtn")) return;
    const button = document.createElement("button");
    button.id = "testSyncConnectionBtn";
    button.type = "button";
    button.className = "ghost";
    button.textContent = "Test sync connection";
    button.addEventListener("click", testSyncConnection);
    actions.appendChild(button);
  }

  const originalOpen = window.openSyncModal;
  if(typeof originalOpen === "function"){
    window.openSyncModal = function(){
      originalOpen();
      setTimeout(addDiagnosticButton, 0);
    };
  }

  const timer = setInterval(() => {
    addDiagnosticButton();
    if(document.getElementById("testSyncConnectionBtn")) clearInterval(timer);
  }, 500);

  window.testSyncConnection = testSyncConnection;
})();
