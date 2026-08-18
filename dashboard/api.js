const SUPABASE = "https://oapuqtuewlvswrdezthc.supabase.co";
// Öffentlicher Playabl-Anon-Key der Webanwendung.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcHVxdHVld2x2c3dyZGV6dGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDQ3OTExODMsImV4cCI6MTk2MDM2NzE4M30.uSjfOkoD7KXv4ztVSFhzIS9LuIsgKg42NaZotZAcqko";

async function api(path) {
  const resp = await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: "Bearer " + ANON } });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return resp.json();
}

const load = () => api(`sessions?select=id,start_time,end_time,participant_count,rsvps,game_id!inner(id,title,system,description,event_id,creator_id(id,username))`
  + `&deleted_at=is.null&game_id.event_id=eq.${EVENT}&order=start_time.asc`);
const loadGames = () => api(`games?select=id,title,system,description,participant_count&event_id=eq.${EVENT}&deleted_at=is.null`).catch(() => []);
const loadEvent = () => api(`community_events?select=id,title,start_time,end_time,fixed_access_time,event_access_levels,community_id&id=eq.${EVENT}`).then(r => r[0] || null).catch(() => null);
const loadEventsList = () => api(`community_events?select=id,title,start_time,community_id(id,name)&draft_state=eq.PUBLISHED&deleted_at=is.null&order=start_time.desc&limit=100`).catch(() => []);
const escapePostgrestLike = value => String(value).replace(/[\\%_]/g, match => `\\${match}`);
const loadProfileByIdentity = identity => {
  const field = identity.includes("@") ? "email" : "username";
  return api(`profiles?select=id,username&${field}=ilike.${encodeURIComponent(escapePostgrestLike(identity))}&limit=2`);
};

async function loadEligibleParticipantIds(accessLevels, communityId) {
  const ids = (accessLevels || []).map(Number).filter(Number.isFinite);
  if (!ids.length) return new Set();
  try {
    const communityFilter = communityId ? `&community_id=eq.${encodeURIComponent(communityId)}` : "";
    const rows = await api(`community_access?select=user_id&access_level_id=in.(${ids.join(",")})${communityFilter}`);
    return new Set(rows.map(row => String(row.user_id || "")).filter(Boolean));
  } catch { return new Set(); }
}
