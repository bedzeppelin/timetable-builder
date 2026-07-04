const crypto = require("crypto");

const TABLE = process.env.SYNC_TABLE || "timetable_sync";
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function send(res, status, data){
  res.status(status).json(data);
}

function normalizeCode(value){
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);
}

function prettyCode(raw){
  const code = normalizeCode(raw);
  if(code.length <= 4) return code;
  return code.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function generateCode(){
  let out = "";
  const bytes = crypto.randomBytes(8);
  for(let i = 0; i < 8; i++){
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return prettyCode(out);
}

function supabaseConfig(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key){
    return null;
  }
  return {url:url.replace(/\/$/, ""), key};
}

async function supabaseFetch(path, options={}){
  const config = supabaseConfig();
  if(!config){
    const error = new Error("Sync is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
    error.status = 501;
    throw error;
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers:{
      apikey:config.key,
      Authorization:`Bearer ${config.key}`,
      "Content-Type":"application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  if(text){
    try{ data = JSON.parse(text); }
    catch{ data = text; }
  }

  if(!response.ok){
    const message = typeof data === "object" && data && data.message ? data.message : "Sync request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function loadSchedule(code){
  const normalized = normalizeCode(code);
  if(!normalized){
    const error = new Error("Enter a sync code.");
    error.status = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${TABLE}?sync_code=eq.${encodeURIComponent(prettyCode(normalized))}&select=sync_code,payload,label,updated_at&limit=1`, {
    method:"GET"
  });

  if(!Array.isArray(rows) || !rows.length){
    const error = new Error("No schedule was found for that sync code.");
    error.status = 404;
    throw error;
  }

  return rows[0];
}

async function saveSchedule({code, data, label}){
  const json = JSON.stringify(data || {});
  if(Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES){
    const error = new Error("This timetable is too large to sync right now.");
    error.status = 413;
    throw error;
  }

  const syncCode = code ? prettyCode(code) : generateCode();
  if(!syncCode){
    const error = new Error("Invalid sync code.");
    error.status = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${TABLE}?on_conflict=sync_code`, {
    method:"POST",
    headers:{
      Prefer:"resolution=merge-duplicates,return=representation"
    },
    body:JSON.stringify({
      sync_code:syncCode,
      payload:data,
      label:String(label || data?.timetables?.[0]?.title || "Timetable Studio").slice(0, 120),
      updated_at:new Date().toISOString()
    })
  });

  return Array.isArray(rows) && rows[0] ? rows[0] : {sync_code:syncCode};
}

module.exports = async function handler(req, res){
  if(req.method === "GET"){
    try{
      const row = await loadSchedule(req.query.code);
      return send(res, 200, {ok:true, code:row.sync_code, data:row.payload, label:row.label, updatedAt:row.updated_at});
    }catch(error){
      return send(res, error.status || 500, {ok:false, error:error.message, details:error.details});
    }
  }

  if(req.method !== "POST"){
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, {ok:false, error:"Method not allowed."});
  }

  try{
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if(body.action === "load"){
      const row = await loadSchedule(body.code);
      return send(res, 200, {ok:true, code:row.sync_code, data:row.payload, label:row.label, updatedAt:row.updated_at});
    }

    if(body.action === "save"){
      const row = await saveSchedule(body);
      return send(res, 200, {ok:true, code:row.sync_code, label:row.label, updatedAt:row.updated_at});
    }

    return send(res, 400, {ok:false, error:"Use action 'save' or 'load'."});
  }catch(error){
    return send(res, error.status || 500, {ok:false, error:error.message, details:error.details});
  }
};
