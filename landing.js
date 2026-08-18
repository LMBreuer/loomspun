renderThemeSwitch(document.getElementById("themeSwitch"));
pickUkiyoBackground(); pickComicBackground();
renderLangSwitch(document.getElementById("langSwitch"));
translateStaticDom();
function syncCreateConVisibility() {
  document.getElementById("openCreateConBtn").hidden = !Auth.session();
}
const authUI = mountAuthUI({
  buttonId: "authBtn",
  onChange: async () => {
    renderPendingInvites(document.getElementById("inviteBanner"), () => location.reload());
    await refreshSuperadmin();
    await reloadCons();
    renderNextConCard();
    renderIndexPageTabs();
    syncCreateConVisibility();
  },
});
renderPendingInvites(document.getElementById("inviteBanner"));
syncCreateConVisibility();
// Dynamisch gerenderte Bereiche nach einem Sprachwechsel aktualisieren.
window.__authUIRefreshers = window.__authUIRefreshers || [];
window.__authUIRefreshers.push(() => { renderCons(); renderNextConCard(); renderIndexPageTabs(); });
document.getElementById("openCreateConBtn").addEventListener("click", () => document.getElementById("createConDlg").showModal());

async function refreshSuperadmin() {
  const token = await Auth.accessToken();
  if (!token) { isSuperadmin = false; return; }
  isSuperadmin = await supaRpc("is_superadmin", {}, token).catch(() => false);
}
async function reloadCons() {
  const fields = "id,name,slug,playabl_event_id,created_at,listed";
  const token = await Auth.accessToken();
  const q = token || isSuperadmin ? `cons?select=${fields}&order=created_at.desc` : `cons?select=${fields}&listed=eq.true&order=created_at.desc`;
  const options = token ? { headers:supaHeaders(token) } : undefined;
  allCons = await supaFetch(q, options).catch(() => []);
  managedConIds = token
    ? new Set((await supaFetch("con_members?select=con_id", { headers:supaHeaders(token) }).catch(() => [])).map(row => String(row.con_id)))
    : new Set();
  if (isSuperadmin) allCons.forEach(con => managedConIds.add(String(con.id)));
  renderCons();
}

/* ---------- Hervorgehobene "nächste Con"-Karte ---------- */
// Für die nächste Con zählt der Start des verknüpften Playabl-Events.
function computeNextCon() {
  const now = new Date();
  const candidates = allCons.map(c => {
    const ev = c.playabl_event_id ? allEvents.find(e => String(e.id) === String(c.playabl_event_id)) : null;
    if (!ev?.start_time) return null;
    const date = new Date(ev.start_time);
    return date >= now ? { con: c, date } : null;
  }).filter(Boolean);
  candidates.sort((a, b) => a.date - b.date);
  return candidates[0] || null;
}
function formatCountdown(date) {
  const days = Math.ceil((date - new Date()) / 86400000);
  if (days <= 0) return tr("nextConToday");
  if (days === 1) return tr("nextConTomorrow");
  return tr("nextConInDays", { n: days });
}
function conDisplayDate(con) {
  const ev = con.playabl_event_id ? allEvents.find(e => String(e.id) === String(con.playabl_event_id)) : null;
  const date = ev?.start_time ? new Date(ev.start_time) : new Date(con.created_at);
  return date.toLocaleDateString(LANG === "en" ? "en-GB" : "de-AT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
async function renderNextConCard() {
  const el = document.getElementById("nextConCard");
  const next = computeNextCon();
  if (!next) { el.innerHTML = ""; return; }
  const { con, date } = next;
  let crewBadge = "";
  const token = await Auth.accessToken();
  if (token) {
    // RLS liefert nur die eigene Mitgliedschaft; bei Fehlern bleibt das Badge aus.
    try {
      const rows = await supaFetch(`con_members?con_id=eq.${con.id}&select=role`, { headers: supaHeaders(token) });
      if (rows?.length) crewBadge = `<span class="crew-badge"><span class="dot"></span>${esc(tr("nextConCrewBadge"))}</span>`;
    } catch {}
  }
  const meta = `${esc(con.playabl_event_id ? conDisplayDate(con) : tr("createdOn", { date: conDisplayDate(con) }))}${con.playabl_event_id ? ` · ${esc(tr("playablEvent"))}` : ""}`;
  el.innerHTML = `<a class="next-con-card" href="plan.html?con=${esc(con.slug || con.id)}&entry=plan">
    <div class="eyebrow">${esc(tr("nextConBadgeText", { countdown: formatCountdown(date) }))}</div>
    <div class="t">${esc(con.name)}${crewBadge}</div>
    <div class="m">${meta}</div>
    <div class="open">${esc(tr("goToOverview"))}</div>
  </a>`;
}

function renderIndexPageTabs() {
  const next = computeNextCon();
  const eventId = next?.con?.playabl_event_id;
  const conId = next?.con?.slug || next?.con?.id;
  const disabled = label => `<span aria-disabled="true">${esc(label)}</span>`;
  document.getElementById("pageTabs").innerHTML = `
    <a href="#" aria-pressed="true">${esc(tr("pageTabCons"))}</a>
    ${eventId ? `<a href="dashboard/?event=${encodeURIComponent(eventId)}" aria-pressed="false">${esc(tr("pageTabDashboard"))}</a>` : disabled(tr("pageTabDashboard"))}
    ${conId ? `<a href="plan.html?con=${encodeURIComponent(conId)}&entry=plan" aria-pressed="false">${esc(tr("pageTabPlan"))}</a>` : disabled(tr("pageTabPlan"))}
    ${disabled(`🔒 ${tr("pageTabCrew")}`)}
  `;
}

document.getElementById("credits").innerHTML = `
  <span>Loomspun · Where stories gather.</span> ·
  <a href="https://playabl.io" target="_blank" rel="noopener">Playabl</a> ·
  <a href="https://www.3w6-podcast.com/" target="_blank" rel="noopener">3W6-Community</a> ·
  <a href="dashboard/">Dashboard</a> ·
  <a href="impressum.html"><span data-i18n="imprint">${esc(tr("imprint"))}</span></a> <span id="themeCatSlot"></span>
  <span class="ai-disclosure"><a class="ai-disclosure-trigger" href="https://de.wikipedia.org/wiki/Ethik_der_k%C3%BCnstlichen_Intelligenz" target="_blank" rel="noopener noreferrer" aria-describedby="aiDisclosureLanding" data-i18n="aiDisclosureLabel">${esc(tr("aiDisclosureLabel"))}</a><span id="aiDisclosureLanding" class="ai-disclosure-tooltip" role="tooltip" data-i18n="aiDisclosureText">${esc(tr("aiDisclosureText"))}</span></span>`;
updateCatEasterEgg();

/* ---------- Cons laden & anzeigen ---------- */
let allCons = [];
let isSuperadmin = false;
let managedConIds = new Set();
let conDirectoryScope = "public";
let conDirectoryTime = "upcoming";

function normalizedCons() {
  return LoomspunConModel.normalizeConDirectory({
    playablEvents: allEvents.map(event => ({
      id:event.id,
      name:event.title,
      startDate:event.start_time,
      endDate:event.end_time || event.start_time,
      community:event.community_id ? { id:event.community_id.id, name:event.community_id.name || "Ohne Community" } : null,
      public:true,
    })),
    loomspunCons: allCons.map(con => ({
      id:con.id,
      name:con.name,
      slug:con.slug,
      playablEventId:con.playabl_event_id,
      public:con.listed !== false,
      hasRoomPlan:true,
      crewEnabled:managedConIds.has(String(con.id)),
      startDate:null,
      endDate:null,
    })),
    memberships:[...managedConIds].map(conId => ({ conId })),
  });
}

function conSourceMatches(actual, selected) {
  if (selected === "all") return true;
  if (selected === "both") return actual === "both";
  return actual === selected || actual === "both";
}

function conDirectoryDate(record) {
  const start = record.startDate ? new Date(record.startDate) : null;
  const end = record.endDate ? new Date(record.endDate) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;
  const format = new Intl.DateTimeFormat(LANG === "en" ? "en-GB" : "de-AT", { day:"2-digit", month:"2-digit", year:"numeric" });
  if (!validStart && !validEnd) return "";
  if (!validStart || !validEnd || validStart.toDateString() === validEnd.toDateString()) return format.format(validStart || validEnd);
  return `${format.format(validStart)}–${format.format(validEnd)}`;
}

function conCommunityName(record) {
  return record.community?.id == null ? tr("withoutCommunity") : record.community.name;
}

function conDirectoryMeta(record) {
  return [conDirectoryDate(record), conCommunityName(record), record.sourceLabel].filter(Boolean).join(" · ");
}

function renderCons() {
  const q = document.getElementById("conSearch").value.trim().toLocaleLowerCase(LANG === "en" ? "en" : "de");
  const community = document.getElementById("conCommunityFilter").value.trim().toLocaleLowerCase(LANG === "en" ? "en" : "de");
  const source = document.getElementById("conSourceFilter").value;
  const next = computeNextCon();
  const nextKey = next ? `loomspun:${next.con.id}` : null;
  const list = normalizedCons().filter(record => {
    const displayCommunity = conCommunityName(record);
    const searchable = `${record.name} ${displayCommunity} ${record.externalIds.playabl || ""} ${record.externalIds.loomspun || ""}`.toLocaleLowerCase(LANG === "en" ? "en" : "de");
    return record.key !== nextKey
      && record.scope === conDirectoryScope
      && record.time === conDirectoryTime
      && (!q || searchable.includes(q))
      && (!community || displayCommunity.toLocaleLowerCase(LANG === "en" ? "en" : "de").includes(community))
      && conSourceMatches(record.sourceKey, source);
  });
  document.getElementById("conList").innerHTML = list.map(record => `
    <div class="con-card" data-con-key="${esc(record.key)}">
      <div>
        <div class="t">${esc(record.name)}</div>
        <div class="m">${esc(conDirectoryMeta(record))}</div>
      </div>
      <span class="con-card-actions">
        ${record.capabilities.dashboard ? `<a class="btn" href="dashboard/?event=${encodeURIComponent(record.externalIds.playabl)}">Dashboard</a>` : `<span class="con-action-muted">Dashboard</span>`}
        ${record.capabilities.roomPlan ? `<a class="btn" href="plan.html?con=${encodeURIComponent(record.slug || record.externalIds.loomspun)}&entry=plan">${esc(tr("pageTabPlan"))}</a>` : `<button type="button" class="btn createPlanBtn" data-event-id="${esc(record.externalIds.playabl)}" data-event-name="${esc(record.name)}">+ ${esc(tr("pageTabPlan"))}</button>`}
        ${isSuperadmin && record.externalIds.loomspun ? `<button type="button" class="small danger delConBtn" data-id="${esc(record.externalIds.loomspun)}" data-name="${esc(record.name)}">🗑 ${esc(tr("delete"))}</button>` : ""}
      </span>
    </div>`).join("") || `<div class="empty-state"><span class="glyph">🗂️</span>${esc(tr("noConFound"))}</div>`;

  document.querySelectorAll("[data-con-time]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.conTime === conDirectoryTime)));
  document.getElementById("conDirectoryHint").textContent = tr(conDirectoryScope === "mine" ? "conDirectoryMineHint" : "conDirectoryPublicHint");
  const activeCount = Number(conDirectoryScope !== "public") + Number(Boolean(community)) + Number(source !== "all");
  const badge = document.getElementById("activeConFilterCount");
  badge.hidden = activeCount === 0;
  badge.textContent = String(activeCount);

  const communities = [...new Set(normalizedCons().map(conCommunityName).filter(Boolean))].sort((a, b) => a.localeCompare(b, LANG === "en" ? "en" : "de"));
  document.getElementById("conCommunityOptions").innerHTML = communities.map(name => `<option value="${esc(name)}"></option>`).join("");
}
document.getElementById("conSearch").addEventListener("input", renderCons);
document.getElementById("conList").addEventListener("click", async e => {
  const createPlan = e.target.closest(".createPlanBtn");
  if (createPlan) {
    if (!Auth.session()) { authUI.requireLogin(); return; }
    conType = "playabl";
    document.querySelectorAll("#conTypeTabs button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.contype === "playabl")));
    document.getElementById("playablFields").hidden = false;
    document.getElementById("manualHint").hidden = true;
    document.getElementById("eventIdInput").value = createPlan.dataset.eventId || "";
    document.getElementById("conName").value = createPlan.dataset.eventName || "";
    document.getElementById("conListed").checked = true;
    document.getElementById("createConDlg").showModal();
    return;
  }
  const btn = e.target.closest(".delConBtn");
  if (!btn) return;
  if (!confirm(tr("confirmDeleteCon", { name: btn.dataset.name }))) return;
  try {
    const token = await Auth.accessToken();
    await supaFetch(`cons?id=eq.${btn.dataset.id}`, { method: "DELETE", headers: supaHeaders(token) });
    allCons = allCons.filter(c => c.id !== btn.dataset.id);
    renderCons();
  } catch (err) { alert(tr("deleteFailed", { err: err.message })); }
});

document.querySelectorAll("[data-con-time]").forEach(button => button.addEventListener("click", () => {
  conDirectoryTime = button.dataset.conTime;
  renderCons();
}));
document.getElementById("openConFilters").addEventListener("click", () => document.getElementById("conFilterDlg").showModal());
document.getElementById("applyConFilters").addEventListener("click", () => {
  conDirectoryScope = document.getElementById("conScopeFilter").value;
  renderCons();
  document.getElementById("conFilterDlg").close();
});
document.getElementById("resetConFilters").addEventListener("click", () => {
  conDirectoryScope = "public";
  document.getElementById("conScopeFilter").value = "public";
  document.getElementById("conCommunityFilter").value = "";
  document.getElementById("conSourceFilter").value = "all";
  renderCons();
});

document.getElementById("directGo").addEventListener("click", () => {
  const raw = document.getElementById("directInput").value.trim();
  if (!raw) return;
  const m = raw.match(/[?&]con=([^&]+)/);
  const id = m ? decodeURIComponent(m[1]) : raw;
  location.href = "plan.html?con=" + encodeURIComponent(id) + "&entry=plan";
});
document.getElementById("directInput").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("directGo").click(); });

/* ---------- Con anlegen: Community/Event-Auswahl (wie im playabl-dashboard) ---------- */
let allEvents = [];
function fillEventsList(events) {
  allEvents = events;
  const csel = document.getElementById("communitySelect");
  const communities = new Map();
  for (const e of events) { const c = e.community_id; if (c?.id) communities.set(c.id, c.name || "?"); }
  csel.innerHTML = '<option value="">– alle –</option>' +
    [...communities.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("");
  fillEventOptions();
}
function fillEventOptions() {
  const cid = document.getElementById("communitySelect").value;
  const sel = document.getElementById("eventSelect");
  const dFmt = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const list = cid ? allEvents.filter(e => String(e.community_id?.id) === cid) : allEvents;
  sel.innerHTML = '<option value="">– Event wählen –</option>' +
    list.map(e => `<option value="${e.id}" data-title="${esc(e.title)}">${esc(e.title)}${e.start_time ? " (" + dFmt.format(new Date(e.start_time)) + ")" : ""}</option>`).join("");
}
document.getElementById("communitySelect").addEventListener("change", fillEventOptions);
document.getElementById("eventSelect").addEventListener("change", e => {
  const opt = e.target.selectedOptions[0];
  if (opt?.dataset.title && !document.getElementById("conName").value) document.getElementById("conName").value = opt.dataset.title;
  document.getElementById("eventIdInput").value = "";
});

/* ---------- Con-Typ: mit Playabl-Event vs. rein manuell ---------- */
let conType = "playabl";
document.getElementById("conTypeTabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-contype]");
  if (!btn) return;
  conType = btn.dataset.contype;
  document.querySelectorAll("#conTypeTabs button").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
  document.getElementById("playablFields").hidden = conType === "manual";
  document.getElementById("manualHint").hidden = conType === "playabl";
  // Playabl-Cons sind standardmäßig gelistet, manuelle Cons nicht.
  document.getElementById("conListed").checked = conType === "playabl";
  if (conType === "manual") { document.getElementById("eventIdInput").value = ""; document.getElementById("eventSelect").value = ""; }
});

document.getElementById("createConBtn").addEventListener("click", async () => {
  const msg = document.getElementById("createMsg");
  msg.className = "msg";
  const session = Auth.session();
  if (!session) { msg.className = "msg err"; msg.textContent = tr("pleaseLoginFirst"); authUI.requireLogin(); return; }
  const name = document.getElementById("conName").value.trim();
  if (!name) { msg.className = "msg err"; msg.textContent = tr("pleaseEnterConName"); return; }
  const eventId = conType === "manual" ? null : (document.getElementById("eventIdInput").value.trim() || document.getElementById("eventSelect").value || null);
  const communityId = conType === "manual" ? null : (document.getElementById("communitySelect").value || null);
  const listed = document.getElementById("conListed").checked;
  const slug = slugify(name);
  try {
    const token = await Auth.accessToken();
    const rows = await supaFetch("cons", {
      method: "POST", headers: supaHeaders(token, true),
      body: JSON.stringify({ name, slug, playabl_event_id: eventId, playabl_community_id: communityId, listed }),
    });
    location.href = "plan.html?con=" + encodeURIComponent(rows[0].slug) + "&entry=plan";
  } catch (err) { msg.className = "msg err"; msg.textContent = tr("createConFailed", { err: err.message }); }
});

/* ---------- Start ---------- */
function configureIndexTour() {
  GuidedTour.configure({
    page: "index",
    showTeaser: true,
    canCrew: () => false,
    tours: {
      public: {
        steps: [
          { target: ".hero-wrap", titleKey: "tourPublicWelcomeTitle", bodyKey: "tourPublicWelcomeBody" },
          { target: ".con-directory", titleKey: "tourPublicConsTitle", bodyKey: "tourPublicConsBody" },
          {
            target: () => {
              const createButton = document.getElementById("openCreateConBtn");
              return createButton && !createButton.hidden ? createButton : document.getElementById("authBtn");
            },
            titleKey: "tourPublicCreateTitle", bodyKey: "tourPublicCreateBody",
          },
          {
            target: () => document.querySelector("#nextConCard a") || document.querySelector("#conList a.btn") || document.querySelector(".con-directory"),
            titleKey: "tourPublicChooseTitle", bodyKey: "tourPublicChooseBody",
            waitForNavigation: () => !!(document.querySelector("#nextConCard a") || document.querySelector("#conList a.btn")),
            onNext: () => (document.querySelector("#nextConCard a") || document.querySelector("#conList a.btn"))?.click(),
          },
        ],
      },
    },
  });
}

(async () => {
  try {
    await refreshSuperadmin();
    const [, events] = await Promise.all([reloadCons(), loadPlayablEventsList()]);
    fillEventsList(events);
    renderNextConCard();
    renderCons();
    renderIndexPageTabs();
    authUI.refresh();
    document.getElementById("status").textContent =
      tr("asOf", { date: new Intl.DateTimeFormat(LANG === "en" ? "en-GB" : "de-AT", { dateStyle: "full", timeStyle: "short" }).format(new Date()) });
    document.body.classList.add("is-ready");
    configureIndexTour();
  } catch (err) {
    document.getElementById("status").innerHTML = `<span class="err">${esc(tr("dataLoadFailed", { err: err.message }))}</span>`;
  }
})();
