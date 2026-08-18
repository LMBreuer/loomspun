/* ---------- Supabase REST/RPC ---------- */
async function supaFetch(path, opts = {}) {
  // Ohne explizite Headers (typischer Fall für öffentliche Lesezugriffe)
  // trotzdem den anon-Key mitschicken, statt unauthentifiziert anzufragen.
  if (!opts.headers) opts = { ...opts, headers: supaHeaders(null, false) };
  const r = await fetch(`${CONFIG.supabase.url}/rest/v1/${path}`, opts);
  if (!r.ok) throw new Error(`Backend HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function supaHeaders(accessToken, write) {
  const h = { apikey: CONFIG.supabase.anonKey, Authorization: "Bearer " + (accessToken || CONFIG.supabase.anonKey) };
  if (write) { h["Content-Type"] = "application/json"; h.Prefer = "return=representation"; }
  return h;
}

async function supaRpc(name, body, accessToken, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${CONFIG.supabase.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: CONFIG.supabase.anonKey, Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await r.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { message: text.slice(0, 300) }; }
    }
    if (!r.ok) {
      const error = new Error(data?.message || `RPC-Fehler (${r.status})`);
      Object.assign(error, { status: r.status, code: data?.code || "", details: data?.details || "" });
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    const timeoutError = new Error(`RPC-Timeout nach ${Math.ceil(timeoutMs / 1000)} Sekunden`);
    Object.assign(timeoutError, { status: 504, code: "RPC_TIMEOUT" });
    throw timeoutError;
  } finally {
    clearTimeout(timeout);
  }
}
