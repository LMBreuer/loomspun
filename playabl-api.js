/* ---------- Playabl: Communities/Events (für den Con-Picker) ---------- */
async function playablApi(path) {
  const r = await fetch(`${PLAYABL}/rest/v1/${path}`, { headers: { apikey: PLAYABL_ANON, Authorization: "Bearer " + PLAYABL_ANON } });
  if (!r.ok) throw new Error("Playabl HTTP " + r.status);
  return r.json();
}
const loadPlayablEventsList = () =>
  playablApi(`community_events?select=id,title,start_time,end_time,community_id(id,name)&draft_state=eq.PUBLISHED&deleted_at=is.null&order=start_time.desc&limit=150`).catch(() => []);

const escapePlayablLike = value => String(value).replace(/[\\%_]/g, match => `\\${match}`);
const loadPlayablProfileByIdentity = identity => {
  const field = identity.includes("@") ? "email" : "username";
  return playablApi(`profiles?select=id,username&${field}=ilike.${encodeURIComponent(escapePlayablLike(identity))}&limit=2`);
};
