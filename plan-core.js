/* Laufzeitkonfiguration */
const params = new URLSearchParams(location.search);
const TZ = params.get("tz") || "Europe/Vienna";
const WS_RE = /workshop|panel|vortrag/i;

const CON_PARAM = params.get("con");
const REQUESTED_VIEW = params.get("view");
const REQUESTED_ROOM = params.get("room");
const REQUESTED_GAME = params.get("game");
const FORCE_CREW_ENTRY = params.get("crew") === "1";
if (!CON_PARAM) location.href = "index.html";
// entry=plan öffnet einmalig die öffentliche Ansicht und wird danach entfernt.
const FORCE_PLAN_ENTRY = params.get("entry") === "plan";
if (FORCE_PLAN_ENTRY) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("entry");
  history.replaceState(null, "", cleanUrl.href);
}

function floorPlanUrl() {
  const value = String(S.con?.floor_plan_url || "").trim();
  return /^(https:\/\/|\/|[a-z0-9][a-z0-9._/-]*\.pdf(?:[?#].*)?$)/i.test(value) ? value : "";
}

const fmtDay = new Intl.DateTimeFormat("de-AT", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
const fmtTime = new Intl.DateTimeFormat("de-AT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourOf = t => parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(t)), 10);

/* ---------------- Con auflösen (Slug oder UUID) ---------------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function loadCon(idOrSlug) {
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const rows = await supaFetch(`cons?select=*&${field}=eq.${encodeURIComponent(idOrSlug)}`);
  return rows?.[0] || null;
}

/* ---------------- Playabl-Spiele laden ---------------- */
// Sessions außerhalb der Zeitabschnitte landen in „Unsortiert“, ohne Abschnitte in „Tag“.
async function loadPlayabl(eventId, buckets) {
  if (!eventId) return [];
  const sessions = await playablApi(`sessions?select=id,start_time,end_time,participant_count,rsvps,game_id!inner(id,title,system,event_id,description,creator_id)&deleted_at=is.null&game_id.event_id=eq.${eventId}&order=start_time.asc`);
  // Anbieterprofile separat laden; die Person hängt in Playabl am Spiel.
  const creatorIds = [...new Set(sessions.map(s => s.game_id.creator_id).filter(Boolean))];
  const profiles = creatorIds.length
    ? await playablApi(`profiles?select=id,username&id=in.(${creatorIds.map(encodeURIComponent).join(",")})`)
    : [];
  const providerById = new Map(profiles.map(p => [p.id, p.username || ""]));
  return sessions.map(s => {
    const date = dayKey.format(new Date(s.start_time));
    const h = hourOf(s.start_time);
    const bucket = buckets.find(b => h >= b.start_hour && h < b.end_hour);
    const part = bucket ? bucket.label : (buckets.length ? "Unsortiert" : "Tag");
    return {
      key: "playabl:" + s.id, gameId: s.game_id.id,
      title: (s.game_id.title.replace(/\s*[\[(][^\])]*(?:3W6|Offline|Con)[^\])]*[\])]\s*/gi, "").trim() || s.game_id.title),
      url: "https://app.playabl.io/games/" + s.game_id.id,
      seats: s.participant_count + 1,
      provider: providerById.get(s.game_id.creator_id) || "",
      facilitatorId: String(s.game_id.creator_id || ""),
      rsvpIds: (s.rsvps || []).map(String),
      ws: WS_RE.test((s.game_id.system || "") + " " + s.game_id.title),
      slotKey: date + "|" + part,
      slotLabel: `${fmtDay.format(new Date(s.start_time)).split(",")[0]} ${part}`,
      time: `${fmtTime.format(new Date(s.start_time))}–${fmtTime.format(new Date(s.end_time))}`,
      start: s.start_time,
      end: s.end_time,
      // Playabl-Anforderungen stehen als [[eigenschaft: <Name>]] im Freitext.
      requiredTagIds: parseRequiredTagIds((s.game_id.system || "") + " " + s.game_id.title + " " + (s.game_id.description || "")),
    };
  });
}

/* ---------------- Con-gebundener Store (Supabase) ---------------- */
function makeStore(conId) {
  const w = () => Auth.accessToken();
  return {
    async init() {
      const [rooms, tables, assignments, slotBuckets, slots, featureTags, roomFeatureTags, dbGames, gameRequiredTags, publicFloorPlanRows] = await Promise.all([
        supaFetch(`rooms?select=*&con_id=eq.${conId}&order=sort,name`),
        supaFetch(`tables?select=*&con_id=eq.${conId}&order=sort,name`),
        supaFetch(`assignments?select=*&con_id=eq.${conId}`),
        supaFetch(`slot_buckets?select=*&con_id=eq.${conId}&order=sort`),
        supaFetch(`slots?select=*&con_id=eq.${conId}&order=day.asc.nullslast,sort.asc`),
        supaFetch(`feature_tags?select=*&order=sort`),
        supaFetch(`room_feature_tags?select=*&con_id=eq.${conId}`),
        supaFetch(`games?select=*&con_id=eq.${conId}&order=title`),
        supaFetch(`game_required_tags?select=*&con_id=eq.${conId}`),
        supaRpc("get_public_con_floor_plan", { target_con: conId }, CONFIG.supabase.anonKey).catch(() => []),
      ]);
      return { rooms, tables, assignments, slotBuckets, slots, featureTags, roomFeatureTags, dbGames, gameRequiredTags, publicFloorPlan: publicFloorPlanRows?.[0] || null };
    },
    async saveRoom(r) {
      const token = await w();
      const body = { ...r, con_id: conId };
      const rows = r.id
        ? await supaFetch(`rooms?id=eq.${r.id}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify(body) })
        : await supaFetch("rooms", { method: "POST", headers: supaHeaders(token, true), body: JSON.stringify(body) });
      return rows[0];
    },
    async deleteRoom(id) { await supaFetch(`rooms?id=eq.${id}`, { method: "DELETE", headers: supaHeaders(await w()) }); },
    async saveTable(t) {
      const token = await w();
      const body = { ...t, con_id: conId };
      const rows = t.id
        ? await supaFetch(`tables?id=eq.${t.id}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify(body) })
        : await supaFetch("tables", { method: "POST", headers: supaHeaders(token, true), body: JSON.stringify(body) });
      return rows[0];
    },
    async deleteTable(id) { await supaFetch(`tables?id=eq.${id}`, { method: "DELETE", headers: supaHeaders(await w()) }); },
    async upsertAssignment(a) {
      const token = await w();
      const h = supaHeaders(token, true);
      h.Prefer = "resolution=merge-duplicates,return=representation";
      await supaFetch("assignments?on_conflict=con_id,slot_key,session_key", { method: "POST", headers: h, body: JSON.stringify({ ...a, con_id: conId }) });
    },
    async deleteAssignment(slotKey, sessionKey) {
      await supaFetch(`assignments?con_id=eq.${conId}&slot_key=eq.${encodeURIComponent(slotKey)}&session_key=eq.${encodeURIComponent(sessionKey)}`, { method: "DELETE", headers: supaHeaders(await w()) });
    },
    async clearSlotTableAssignments(slotKey) {
      const token = await w();
      const base = `assignments?con_id=eq.${conId}&slot_key=eq.${encodeURIComponent(slotKey)}&table_id=not.is.null`;
      // Playabl-Zeilen enthalten ausschließlich die Tischzuordnung und
      // können weg; bei manuellen Spielen trägt dieselbe Zeile zusätzlich
      // die Slot-Zugehörigkeit, deshalb bleibt sie mit table_id=null erhalten.
      await Promise.all([
        supaFetch(`${base}&game_id=is.null`, { method: "DELETE", headers: supaHeaders(token) }),
        supaFetch(`${base}&game_id=not.is.null`, {
          method: "PATCH",
          headers: supaHeaders(token, true),
          body: JSON.stringify({ table_id: null }),
        }),
      ]);
    },
    async addRequest(r) {
      await supaFetch("requests", {
        method: "POST",
        headers: { apikey: CONFIG.supabase.anonKey, Authorization: "Bearer " + CONFIG.supabase.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...r, con_id: conId }),
      });
    },
    async listRequests() { return supaFetch(`requests?select=*&con_id=eq.${conId}&order=created_at.desc`, { headers: supaHeaders(await w()) }); },
    async updateRequest(id, fields) { await supaFetch(`requests?id=eq.${id}`, { method: "PATCH", headers: supaHeaders(await w(), true), body: JSON.stringify(fields) }); },
    async saveFloorPlanUrl(url) {
      await supaRpc("set_con_floor_plan_url", { target_con: conId, new_url: url || null }, await w());
    },
    async setFloorPlanSource(mode, url) {
      await supaRpc("set_con_floor_plan_source", { target_con: conId, new_mode: mode, new_url: url || null }, await w());
    },
    async loadFloorPlanDraft() {
      const rows = await supaFetch(`con_floor_plans?select=document,revision,updated_at,published_at&con_id=eq.${conId}`, { headers: supaHeaders(await w()) });
      return rows?.[0] || null;
    },
    async saveFloorPlanDocument(document, expectedRevision) {
      return supaRpc("save_con_floor_plan", { target_con: conId, expected_revision: expectedRevision || 0, new_document: document }, await w(), { timeoutMs: 10000 });
    },
    async publishFloorPlan(expectedRevision) {
      await supaRpc("publish_con_floor_plan", { target_con: conId, expected_revision: expectedRevision }, await w(), { timeoutMs: 10000 });
    },
    async replaceFloorPlanDocument(document, expectedRevision) {
      return supaRpc("replace_con_floor_plan", { target_con: conId, expected_revision: expectedRevision || 0, new_document: document }, await w(), { timeoutMs: 10000 });
    },
    async listFloorPlanVersions() {
      return supaFetch(`con_floor_plan_versions?select=id,source_revision,document,kind,created_at,created_by&con_id=eq.${conId}&order=created_at.desc&limit=7`, { headers: supaHeaders(await w()) });
    },
    async restoreFloorPlanVersion(versionId, expectedRevision) {
      return supaRpc("restore_con_floor_plan_version", { target_con: conId, version_id: versionId, expected_revision: expectedRevision }, await w(), { timeoutMs: 10000 });
    },
    async listReuseCons() {
      return supaFetch(`cons?select=id,name,slug&id=neq.${conId}&order=name`, { headers: supaHeaders(await w()) });
    },
    async loadReuseCon(sourceConId) {
      const token = await w();
      const encoded = encodeURIComponent(sourceConId);
      const [conRows, rooms, tables, roomFeatureTags, floorPlanRows] = await Promise.all([
        supaFetch(`cons?select=id,name,slug&id=eq.${encoded}`, { headers: supaHeaders(token) }),
        supaFetch(`rooms?select=*&con_id=eq.${encoded}&order=sort,name`, { headers: supaHeaders(token) }),
        supaFetch(`tables?select=*&con_id=eq.${encoded}&order=sort,name`, { headers: supaHeaders(token) }),
        supaFetch(`room_feature_tags?select=*&con_id=eq.${encoded}`, { headers: supaHeaders(token) }),
        supaFetch(`con_floor_plans?select=document,revision,updated_at&con_id=eq.${encoded}`, { headers: supaHeaders(token) }),
      ]);
      return { con: conRows?.[0] || null, rooms: rooms || [], tables: tables || [], roomFeatureTags: roomFeatureTags || [], floorPlan: floorPlanRows?.[0] || null };
    },
    async importRoomsFromCon(sourceConId, sourceRoomIds) {
      return supaRpc("import_con_rooms", { target_con: conId, source_con: sourceConId, source_room_ids: sourceRoomIds }, await w(), { timeoutMs: 10000 });
    },
    async ensureSlotsForDays(days) {
      const token = await w();
      if (!token || !days.length) return; // anon kann nicht materialisieren — Slot erscheint erst, wenn Crew die Seite lädt
      await supaRpc("ensure_slots_for_days", { target_con: conId, days }, token).catch(() => {});
    },
    async saveSlot(s) {
      const token = await w();
      const body = { ...s, con_id: conId };
      const rows = s.id
        ? await supaFetch(`slots?id=eq.${s.id}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify(body) })
        : await supaFetch("slots", { method: "POST", headers: supaHeaders(token, true), body: JSON.stringify(body) });
      return rows[0];
    },
    async deleteSlot(id) { await supaFetch(`slots?id=eq.${id}`, { method: "DELETE", headers: supaHeaders(await w()) }); },
    async saveBucket(b) {
      const token = await w();
      const body = { ...b, con_id: conId };
      const rows = b.id
        ? await supaFetch(`slot_buckets?id=eq.${b.id}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify(body) })
        : await supaFetch("slot_buckets", { method: "POST", headers: supaHeaders(token, true), body: JSON.stringify(body) });
      return rows[0];
    },
    async deleteBucket(id) { await supaFetch(`slot_buckets?id=eq.${id}`, { method: "DELETE", headers: supaHeaders(await w()) }); },
    async setRoomTags(roomId, tagIds) {
      const token = await w();
      const h = supaHeaders(token, true);
      await supaFetch(`room_feature_tags?con_id=eq.${conId}&room_id=eq.${roomId}`, { method: "DELETE", headers: h });
      if (tagIds.length) {
        await supaFetch("room_feature_tags", { method: "POST", headers: h, body: JSON.stringify(tagIds.map(id => ({ con_id: conId, room_id: roomId, feature_tag_id: id }))) });
      }
    },
    async setGameTags(gameId, tagIds) {
      const token = await w();
      const h = supaHeaders(token, true);
      await supaFetch(`game_required_tags?con_id=eq.${conId}&game_id=eq.${gameId}`, { method: "DELETE", headers: h });
      if (tagIds.length) {
        await supaFetch("game_required_tags", { method: "POST", headers: h, body: JSON.stringify(tagIds.map(id => ({ con_id: conId, game_id: gameId, feature_tag_id: id }))) });
      }
    },
    async saveGame(g) {
      const token = await w();
      const body = { ...g, con_id: conId };
      const rows = g.id
        ? await supaFetch(`games?id=eq.${g.id}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify(body) })
        : await supaFetch("games", { method: "POST", headers: supaHeaders(token, true), body: JSON.stringify(body) });
      return rows[0];
    },
    async deleteGame(id) { await supaFetch(`games?id=eq.${id}`, { method: "DELETE", headers: supaHeaders(await w()) }); },
  };
}

/* ---------------- State ---------------- */
const PERSONAL_PROFILE_KEY = "playabl-personal-profile";
const LEGACY_PERSONAL_PROFILE_KEY = "playabl-dashboard-personal-profile";
function loadStoredPersonalProfile() {
  try {
    const raw = localStorage.getItem(PERSONAL_PROFILE_KEY) || localStorage.getItem(LEGACY_PERSONAL_PROFILE_KEY);
    const profile = JSON.parse(raw || "null");
    if (!profile?.id || !profile?.username) return null;
    const normalized = { id: String(profile.id), username: String(profile.username) };
    if (!localStorage.getItem(PERSONAL_PROFILE_KEY)) localStorage.setItem(PERSONAL_PROFILE_KEY, JSON.stringify(normalized));
    localStorage.removeItem(LEGACY_PERSONAL_PROFILE_KEY);
    return normalized;
  } catch { return null; }
}
const S = {
  con: null, store: null,
  games: [], dbGames: [], slots: [], slotBuckets: [], activeSlot: null,
  featureTags: [], roomFeatureTags: [], gameRequiredTags: [],
  rooms: [], tables: [], assignments: [], requests: [], crewCons: [],
  floorPlanPublic: null, floorPlanDraft: null, floorPlanEditorFloorId: null,
  floorPlanViewerFloorId: null, floorPlanPreviewDocument: null,
  role: null, superadmin: false, search: "",
  personalProfile: loadStoredPersonalProfile(), personalFilterActive: false,
  mode: "view", view: ["raster", "tabelle", "raeume", "lageplan"].includes(REQUESTED_VIEW) ? REQUESTED_VIEW : "raster", crewView: "zuordnen", setupTab: "raeume",
  rasterAxis: "rooms", tableSort: { key: "when", dir: 1 },
  showDoneRequests: false, minSeats: 0,
  filterReqTags: [], crewSearch: "",
  assignMode: Prefs.get("assign-mode", "dnd"), selectedGame: null,
  detailLevel: Prefs.get("detail-level", "full"), pinnedRequest: null,
  crewShowDetails: true, expandedRoomIds: new Set(),
  printMode: "raster", printAxis: "rooms", printSlot: "alle", printDetail: "full",
  printOrientation: "auto", printColor: "color", printReturnMode: "view", printReturnView: "raster",
};

const navigationStateKey = `last-navigation:${CON_PARAM}`;
function persistNavigationState() {
  if (S.mode === "print") return;
  Prefs.set(navigationStateKey, JSON.stringify({
    mode: S.mode, view: S.view, crewView: S.crewView, setupTab: S.setupTab,
  }));
}
function restoreNavigationState() {
  if (FORCE_PLAN_ENTRY || REQUESTED_VIEW) return;
  let saved;
  try { saved = JSON.parse(Prefs.get(navigationStateKey, "")); } catch { return; }
  if (!saved || typeof saved !== "object") return;
  if (VIEWS.some(view => view.key === saved.view)) S.view = saved.view;
  if (saved.mode !== "crew") { S.mode = "view"; return; }
  // Gespeicherter UI-Zustand ersetzt keine von Supabase bestätigte Rolle.
  if (!S.role) return;
  S.mode = "crew";
  if (CREW_VIEWS.some(view => view.key === saved.crewView)) S.crewView = saved.crewView;
  if (SETUP_VIEWS.some(view => view.key === saved.setupTab)) S.setupTab = saved.setupTab;
}

const VIEWS = [{ key: "raster", nameKey: "viewRaster" }, { key: "tabelle", nameKey: "viewTable" }, { key: "raeume", nameKey: "viewRooms" }];
const CREW_VIEWS = [
  { key: "zuordnen", nameKey: "crewViewAssign" },
  { key: "setup", nameKey: "crewViewSetup" },
  { key: "wuensche", nameKey: "crewViewRequests" },
];
const SETUP_VIEWS = [
  { key: "raeume", nameKey: "setupTabRooms" },
  { key: "lageplan", nameKey: "setupTabFloorPlan" },
  { key: "slots", nameKey: "setupTabSlots" },
  { key: "spiele", nameKey: "setupTabGames" },
  { key: "crew", nameKey: "setupTabCrew" },
];

const bySlot = slot => S.games.filter(g => g.slotKey === slot);
const gameByKey = key => S.games.find(g => g.key === key);
const asgFor = g => S.assignments.find(a => a.slot_key === g.slotKey && a.session_key === g.key);
// game_ref folgt dem Format "{title} ({slotLabel})".
const findGameByRef = ref => ref ? S.games.find(g => `${g.title} (${g.slotLabel})` === ref) : null;
function jumpToGameInZuordnen(gameKey, slotKey, message) {
  S.mode = "crew"; S.crewView = "zuordnen"; S.activeSlot = slotKey; S.crewSearch = "";
  S.pinnedRequest = { gameKey, message };
  renderActive();
  requestAnimationFrame(() => {
    const chip = document.querySelector(`.chip[data-game="${gameKey}"]`);
    if (!chip) return;
    const reduceMotion = document.documentElement.getAttribute("data-theme") === "contrast" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chip.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    chip.classList.add("pulse-highlight");
    chip.addEventListener("animationend", () => chip.classList.remove("pulse-highlight"), { once: true });
  });
}
function highlightRequestedPlanGame() {
  if (!REQUESTED_GAME) return;
  const game = S.games.find(item => String(item.gameId || "") === String(REQUESTED_GAME));
  if (!game) return;
  requestAnimationFrame(() => {
    const chip = [...document.querySelectorAll(".chip[data-game]")].find(item => item.dataset.game === game.key);
    if (!chip) return;
    chip.scrollIntoView({ behavior: document.documentElement.hasAttribute("data-zen") ? "auto" : "smooth", block: "center" });
    chip.classList.add("pulse-highlight");
    chip.addEventListener("animationend", () => chip.classList.remove("pulse-highlight"), { once:true });
  });
}
const roomOfTable = tableId => { const t = S.tables.find(x => x.id === tableId); return t && S.rooms.find(r => r.id === t.room_id); };
const ROOM_ACCENTS = ["var(--accent)", "var(--good)", "var(--warn)", "var(--text-secondary)"];
// Darkened Wong-inspired palette: each accent keeps at least 3:1 contrast on
// the contrast theme's white surface, while shapes provide the second cue.
const ROOM_ACCENTS_HIGH_CONTRAST = ["#005a9c", "#9a4f00", "#006b54", "#7a2d8e", "#b33c00", "#006f88", "#706000", "#4a4a4a"];
const ROOM_MARKERS = ["circle", "triangle", "square", "diamond", "plus", "cross", "hexagon", "star", "sparkle", "sun", "moon", "cloud", "flower", "tree", "heart", "flag", "key", "book", "music", "bulb", "letter", "dice", "invader", "wc", "kitchen", "door", "coat", "toy"];
const validRoomColor = color => /^#[0-9a-f]{6}$/i.test(color || "");
function automaticRoomBaseColor(room) {
  const index = room ? S.rooms.indexOf(room) : S.rooms.length;
  return ROOM_ACCENTS[Math.max(0, index) % ROOM_ACCENTS.length];
}
function automaticRoomColorHex(room) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:fixed;visibility:hidden;color:${automaticRoomBaseColor(room)}`;
  document.body.appendChild(probe);
  const channels = getComputedStyle(probe).color.match(/\d+/g)?.map(Number) || [];
  probe.remove();
  return channels.length >= 3 ? `#${channels.slice(0, 3).map(value => value.toString(16).padStart(2, "0")).join("")}` : "#5b8def";
}
const colorVisionAidEnabled = () => document.documentElement.hasAttribute("data-color-aid");
const validRoomMarker = marker => ROOM_MARKERS.includes(marker);
const roomMarkerIndex = room => {
  const explicit = ROOM_MARKERS.indexOf(room?.marker);
  return explicit >= 0 ? explicit : Math.max(0, S.rooms.indexOf(room)) % ROOM_MARKERS.length;
};
const roomMarkerClass = room => colorVisionAidEnabled() ? ` room-marker-pattern-${roomMarkerIndex(room)}` : "";
function roomNameMarkerHtml(room) {
  if (document.documentElement.getAttribute("data-theme") !== "contrast" || !colorVisionAidEnabled()) return "";
  const marker = ROOM_MARKERS[roomMarkerIndex(room)];
  return `<span class="room-name-marker" aria-hidden="true" title="${esc(ROOM_MARKER_DISPLAY_NAMES[marker] || "")}">${markerGlyphHtml(marker)}</span>`;
}
const roomAccentVar = room => {
  const index = S.rooms.indexOf(room);
  const base = room ? (colorVisionAidEnabled() ? ROOM_ACCENTS_HIGH_CONTRAST[index % ROOM_ACCENTS_HIGH_CONTRAST.length] : validRoomColor(room.color) ? room.color : ROOM_ACCENTS[index % ROOM_ACCENTS.length]) : "var(--accent)";
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "solarpunk") return `color-mix(in oklab, ${base} 72%, #8bbf65)`;
  if (theme === "ukiyo") return `color-mix(in oklab, ${base} 62%, #d9b9a0)`;
  if (theme === "cyberpunk") return `color-mix(in oklab, ${base} 65%, #00f0ff)`;
  if (theme === "terminal") return `color-mix(in srgb, ${base} 45%, #3dff85)`;
  return base;
};
const emptyState = msg => `<div class="empty-state"><span class="glyph"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10l8-6 8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>${esc(msg)}</div>`;

/* Platzanzahl-Stepper */
function numberStepperHtml(id, { value = 0, min = 0, max = 999, step = 1, width = "3.5em", required = false } = {}) {
  return `<span class="stepper"><button type="button" class="stepper-btn" data-target="${id}" data-step="${-step}" aria-label="weniger">–</button><input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="width:${width}"${required ? " required" : ""}><button type="button" class="stepper-btn" data-target="${id}" data-step="${step}" aria-label="mehr">+</button></span>`;
}
function minSeatsStepperHtml() {
  return `<span class="min-seats-stepper">
    <button type="button" class="min-seats-btn" data-dir="-1" aria-label="${esc(tr("decreaseMinSeats"))}">–</button>
    <span class="min-seats-val">${esc(tr("minSeatsLabel", { n: S.minSeats }))}</span>
    <button type="button" class="min-seats-btn" data-dir="1" aria-label="${esc(tr("increaseMinSeats"))}">+</button>
  </span>`;
}
function wireNumberStepper(id) {
  const input = document.getElementById(id);
  if (!input || input.parentElement.classList.contains("stepper")) return;
  const step = parseFloat(input.step) || 1;
  const wrap = document.createElement("span");
  wrap.className = "stepper";
  input.before(wrap);
  wrap.innerHTML = `<button type="button" class="stepper-btn" data-target="${id}" data-step="${-step}" aria-label="weniger">–</button>`;
  wrap.appendChild(input);
  wrap.insertAdjacentHTML("beforeend", `<button type="button" class="stepper-btn" data-target="${id}" data-step="${step}" aria-label="mehr">+</button>`);
}

function sortSlots() { S.slots.sort((a, b) => (a.day || "9999-99-99").localeCompare(b.day || "9999-99-99") || a.sort - b.sort); }
const roomTagIds = room => S.roomFeatureTags.filter(x => x.room_id === room.id).map(x => x.feature_tag_id);
const roomBadgesHtml = room => roomTagIds(room).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).map(f => `<span class="badge">${esc(f.label)}</span>`).join("");
const plainFeatureLabel = label => label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || label;
const roomHasTagKey = (room, key) => roomTagIds(room).some(id => S.featureTags.find(f => f.id === id)?.key === key);
const gameReqTagIds = dbId => S.gameRequiredTags.filter(x => x.game_id === dbId).map(x => x.feature_tag_id);
// Explizite Anforderungen müssen vollständig erfüllt sein.
const roomSatisfiesTags = (room, tagIds) => !tagIds?.length || tagIds.every(id => roomTagIds(room).includes(id));
// Klammer-Syntax für Playabl-Beschreibungen/Titel/System: "[[eigenschaft: <Name>]]",
// mehrere Eigenschaften entweder in getrennten Klammern oder Komma/Semikolon-
// getrennt in einer: "[[eigenschaft: laut ok, ruhig]]". Matching ignoriert
// Groß/Klein, Leerzeichen, Unterstriche und das führende Emoji im Label —
// "laut ok" trifft sowohl den Tag-Key "laut_ok" als auch das Label "🔊 laut ok".
const FEATURE_BRACKET_RE = /\[\[\s*eigenschaft\s*:\s*([^\]]+?)\s*\]\]/gi;
const normalizeTagText = s => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
function parseRequiredTagIds(text) {
  if (!text) return [];
  const ids = new Set();
  for (const m of text.matchAll(FEATURE_BRACKET_RE)) {
    const parts = m[1].split(/[,;]+/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const wanted = normalizeTagText(part);
      const tag = S.featureTags.find(f => normalizeTagText(f.label) === wanted || normalizeTagText(f.key) === wanted);
      if (tag) ids.add(tag.id);
    }
  }
  return [...ids];
}
// Manuelle Spiele ohne Assignment bleiben ohne Slot im Backlog.
function gamesFromDb() {
  S.games = S.games.filter(g => !g.dbId); // Playabl-Spiele bleiben erhalten.
  for (const dg of S.dbGames) {
    const a = S.assignments.find(x => x.game_id === dg.id);
    const slot = a && S.slots.find(s => s.key === a.slot_key);
    S.games.push({
      key: "game:" + dg.id, gameId: dg.id, dbId: dg.id, title: dg.title, url: null,
      seats: dg.seats, ws: dg.workshop, manual: true, provider: dg.provider || "",
      slotKey: a ? a.slot_key : null, slotLabel: a ? (slot?.label || a.slot_key) : tr("noSlotOption"),
      time: "", start: 0, requiredTagIds: gameReqTagIds(dg.id),
    });
  }
}
function matchesSearchG(g) {
  if (!S.search) return true;
  if (g.title.toLowerCase().includes(S.search)) return true;
  const a = asgFor(g);
  if (a) {
    const t = S.tables.find(x => x.id === a.table_id);
    const r = t && S.rooms.find(x => x.id === t.room_id);
    if (t && t.name.toLowerCase().includes(S.search)) return true;
    if (r && r.name.toLowerCase().includes(S.search)) return true;
  }
  return false;
}
function personalGameState(g) {
  if (!S.personalProfile || g.manual) return null;
  if (g.facilitatorId === S.personalProfile.id) return "facilitator";
  const index = (g.rsvpIds || []).indexOf(S.personalProfile.id);
  if (index < 0) return null;
  return index < Math.max(0, g.seats - 1) ? "confirmed" : "waitlist";
}
const matchesPublicFilters = g => matchesSearchG(g) && (!S.personalFilterActive || !!personalGameState(g));
const personalGames = () => S.games.filter(g => !!personalGameState(g));
const personalVisibleSlots = () => {
  if (!S.personalFilterActive) return S.slots;
  const keys = new Set(S.games.filter(matchesPublicFilters).filter(g => {
    const assignment = asgFor(g);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    return !!table;
  }).map(g => g.slotKey));
  return S.slots.filter(slot => keys.has(slot.key));
};
const personalVisibleRooms = () => {
  if (!S.personalFilterActive) return S.rooms;
  const roomIds = new Set(S.games.filter(matchesPublicFilters).map(g => {
    const assignment = asgFor(g);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    return table?.room_id;
  }).filter(Boolean));
  return S.rooms.filter(room => roomIds.has(room.id));
};
function matchesCrewGameSearch(g) {
  const query = S.crewSearch.trim().toLowerCase();
  if (!query) return true;
  const a = asgFor(g);
  const table = a && S.tables.find(t => t.id === a.table_id);
  const room = table && roomOfTable(table.id);
  const reqLabels = (g.requiredTagIds || [])
    .map(id => S.featureTags.find(f => f.id === id)?.label || "")
    .filter(Boolean);
  const haystack = [
    g.title, g.provider, g.slotLabel, g.time, String(g.seats),
    g.ws ? tr("workshop") : "", g.manual ? tr("manuallyCreated") : "",
    room?.name, table?.name, ...reqLabels,
  ].filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+/).filter(Boolean).every(token => haystack.includes(token));
}
