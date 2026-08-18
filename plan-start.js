/* ---------------- Detailgrad-Umschalter (global, wie Theme-Switcher) ---------------- */
const DETAIL_LEVELS = [
  { key: "minimal", labelKey: "detailMinimal", nameKey: "detailMinimalName" },
  { key: "medium", labelKey: "detailMedium", nameKey: "detailMediumName" },
  { key: "full", labelKey: "detailFull", nameKey: "detailFullName" },
];
function renderDetailSwitch() {
  const el = document.getElementById("detailSwitch");
  el.innerHTML = DETAIL_LEVELS.map(d =>
    `<button type="button" data-detail-key="${d.key}" aria-pressed="${String(d.key === S.detailLevel)}" title="${esc(tr(d.nameKey))}" aria-label="${esc(tr(d.nameKey))}">${esc(tr(d.labelKey))}</button>`).join("");
}
document.getElementById("detailSwitch").addEventListener("click", e => {
  const btn = e.target.closest("button[data-detail-key]");
  if (!btn) return;
  S.detailLevel = btn.dataset.detailKey;
  Prefs.set("detail-level", S.detailLevel);
  renderDetailSwitch();
  renderActive();
});

const personalGamesDialog = document.getElementById("personalGamesDlg");
const personalGamesForm = document.getElementById("personalGamesForm");
const personalGamesInput = document.getElementById("personalGamesIdentity");
const personalGamesMessage = document.getElementById("personalGamesMsg");
function openPersonalGamesDialog() {
  const floorPlanMode = S.mode === "view" && S.view === "lageplan";
  document.getElementById("personalGamesDlgH").textContent = tr(floorPlanMode ? "myRooms" : "myGames");
  document.getElementById("personalGamesSave").textContent = tr(floorPlanMode ? "showMyRooms" : "showMyGames");
  personalGamesMessage.className = "msg";
  personalGamesMessage.textContent = "";
  personalGamesInput.value = S.personalProfile?.username || "";
  document.getElementById("personalGamesReset").hidden = !S.personalProfile;
  personalGamesDialog.showModal();
  requestAnimationFrame(() => personalGamesInput.focus());
}
function closePersonalGamesDialog() {
  if (personalGamesDialog.open) personalGamesDialog.close();
}
document.getElementById("myGamesFilter").addEventListener("click", () => {
  if (!S.personalProfile) return openPersonalGamesDialog();
  S.personalFilterActive = !S.personalFilterActive;
  if (S.personalFilterActive) S.activeSlot = personalVisibleSlots()[0]?.key || null;
  renderActive();
});
document.getElementById("personalGamesProfile").addEventListener("click", openPersonalGamesDialog);
document.getElementById("calendarDownloadBtn").addEventListener("click", downloadPersonalCalendar);
document.getElementById("personalGamesCancel").addEventListener("click", closePersonalGamesDialog);
document.getElementById("personalGamesReset").addEventListener("click", () => {
  localStorage.removeItem(PERSONAL_PROFILE_KEY);
  localStorage.removeItem(LEGACY_PERSONAL_PROFILE_KEY);
  S.personalProfile = null;
  S.personalFilterActive = false;
  closePersonalGamesDialog();
  renderActive();
});
personalGamesForm.addEventListener("submit", async event => {
  event.preventDefault();
  const identity = personalGamesInput.value.trim();
  if (!identity) return personalGamesInput.focus();
  const saveButton = document.getElementById("personalGamesSave");
  saveButton.disabled = true;
  personalGamesMessage.className = "msg";
  personalGamesMessage.textContent = tr("lookingUpProfile");
  try {
    const profiles = await loadPlayablProfileByIdentity(identity);
    const profile = identity.includes("@")
      ? profiles[0]
      : profiles.find(row => String(row.username).localeCompare(identity, undefined, { sensitivity: "accent" }) === 0) || profiles[0];
    if (!profile) {
      personalGamesMessage.className = "msg err";
      personalGamesMessage.textContent = tr("personalProfileNotFound");
      return;
    }
    S.personalProfile = { id: String(profile.id), username: String(profile.username) };
    localStorage.setItem(PERSONAL_PROFILE_KEY, JSON.stringify(S.personalProfile));
    localStorage.removeItem(LEGACY_PERSONAL_PROFILE_KEY);
    S.personalFilterActive = true;
    S.activeSlot = personalVisibleSlots()[0]?.key || null;
    closePersonalGamesDialog();
    renderActive();
  } catch {
    personalGamesMessage.className = "msg err";
    personalGamesMessage.textContent = tr("personalProfileLoadFailed");
  } finally {
    saveButton.disabled = false;
  }
});
window.addEventListener("storage", event => {
  if (![PERSONAL_PROFILE_KEY, LEGACY_PERSONAL_PROFILE_KEY].includes(event.key)) return;
  S.personalProfile = loadStoredPersonalProfile();
  if (!S.personalProfile) S.personalFilterActive = false;
  if (S.con) renderActive({ animate: false });
});

/* ---------------- Start ---------------- */
renderThemeSwitch(document.getElementById("themeSwitch"));
pickUkiyoBackground(); pickComicBackground();
renderLangSwitch(document.getElementById("langSwitch"));
translateStaticDom();
renderDetailSwitch();
wireNumberStepper("tableSeats");
wireNumberStepper("gameSeats");

async function refreshRole() {
  const token = await Auth.accessToken();
  if (!token) { S.role = null; S.superadmin = false; return; }
  try {
    S.superadmin = await supaRpc("is_superadmin", {}, token).catch(() => false);
    if (await supaRpc("is_con_admin", { target_con: S.con.id }, token)) { S.role = "admin"; return; }
    S.role = (await supaRpc("is_con_member", { target_con: S.con.id }, token)) ? "editor" : null;
  } catch { S.role = null; }
}

async function refreshCrewCons() {
  const token = await Auth.accessToken();
  if (!token || !S.role) { S.crewCons = []; return; }
  try {
    if (S.superadmin) {
      S.crewCons = await supaFetch("cons?select=id,name,slug&order=name", { headers: supaHeaders(token) });
      return;
    }
    const memberships = await supaFetch("con_members?select=con_id,cons(id,name,slug)&status=eq.accepted", { headers: supaHeaders(token) });
    S.crewCons = [...new Map((memberships || []).filter(item => item.cons).map(item => [item.cons.id, item.cons])).values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch { S.crewCons = S.con ? [{ id: S.con.id, name: S.con.name, slug: S.con.slug }] : []; }
}

const authUI = mountAuthUI({
  buttonId: "authBtn",
  onChange: async () => {
    await refreshRole();
    await refreshCrewCons();
    S.floorPlanDraft = S.role ? await S.store.loadFloorPlanDraft().catch(() => S.floorPlanDraft) : null;
    if (S.role) S.requests = await S.store.listRequests().catch(() => []);
    if (!S.role && S.mode === "crew") { S.mode = "view"; S.view = "tabelle"; }
    renderActive(); updateViewBanner();
    renderPendingInvites(document.getElementById("inviteBanner"), () => window.location.reload());
  },
});

function updateViewBanner() {
  const el = document.getElementById("viewBanner");
  if (S.superadmin) {
    el.hidden = false; el.className = "banner no-print open";
    el.textContent = tr("superadminBanner");
    return;
  }
  if (S.role) { el.hidden = true; return; }
  el.hidden = false; el.className = "banner no-print";
  el.textContent = Auth.session() ? tr("loggedInNotCrew") : tr("publicViewLogin");
}

document.getElementById("credits").innerHTML = `
  <span>Loomspun · Where stories gather.</span> ·
  <a href="https://playabl.io" target="_blank" rel="noopener">Playabl</a> ·
  <a href="https://www.3w6-podcast.com/" target="_blank" rel="noopener">3W6-Community</a> ·
  <a href="dashboard/">Dashboard</a> ·
  <a href="impressum.html"><span data-i18n="imprint">${esc(tr("imprint"))}</span></a> <span id="themeCatSlot"></span>
  <span class="ai-disclosure"><a class="ai-disclosure-trigger" href="https://de.wikipedia.org/wiki/Ethik_der_k%C3%BCnstlichen_Intelligenz" target="_blank" rel="noopener noreferrer" aria-describedby="aiDisclosurePlan" data-i18n="aiDisclosureLabel">${esc(tr("aiDisclosureLabel"))}</a><span id="aiDisclosurePlan" class="ai-disclosure-tooltip" role="tooltip" data-i18n="aiDisclosureText">${esc(tr("aiDisclosureText"))}</span></span>`;
translateStaticDom();
updateCatEasterEgg();

let switchableCons = [];
function renderConSwitchList() {
  const query = document.getElementById("conSwitchSearch").value.trim().toLocaleLowerCase(LANG === "en" ? "en" : "de");
  const rows = switchableCons.filter(con => con.id !== S.con?.id && (!query || con.name.toLocaleLowerCase(LANG === "en" ? "en" : "de").includes(query)));
  document.getElementById("conSwitchList").innerHTML = rows.map(con => `<a href="plan.html?con=${encodeURIComponent(con.slug || con.id)}&entry=plan"><span>${esc(con.name)}</span><span aria-hidden="true">→</span></a>`).join("") || `<p class="hint">${esc(tr("noConFound"))}</p>`;
}
async function loadConSwitchList() {
  switchableCons = await supaFetch("cons?select=id,name,slug&listed=eq.true&order=created_at.desc").catch(() => []);
  renderConSwitchList();
}
document.getElementById("conSwitchOpen").addEventListener("click", () => {
  renderConSwitchList();
  document.getElementById("conSwitchDlg").showModal();
});
document.getElementById("conSwitchSearch").addEventListener("input", renderConSwitchList);

/* ---------------- Geführte Rundgänge ----------------
   Die Tour wechselt ausschließlich lokale Ansichten. Sie löst niemals
   Speichern, Zuordnen, Löschen, Auto-Zuordnen oder Drucken aus und stellt
   beim Beenden die zuvor geöffnete Ansicht wieder her. */
function configurePlanTours() {
  const show = patch => async () => {
    Object.assign(S, patch);
    renderActive({ animate: false });
  };
  const showCrew = patch => show({ mode: "crew", ...patch });
  const showPublic = view => show({ mode: "view", view });

  GuidedTour.configure({
    page: "plan",
    showTeaser: false,
    // Wird der öffentliche Rundgang im Footer einer Con gestartet, beginnt
    // er trotzdem bewusst bei der Con-Übersicht.
    publicStartUrl: "index.html?tour=public",
    canCrew: () => !!S.role,
    captureState: () => ({
      mode: S.mode,
      view: S.view,
      crewView: S.crewView,
      setupTab: S.setupTab,
      activeSlot: S.activeSlot,
      crewSearch: S.crewSearch,
      selectedGame: S.selectedGame,
    }),
    restoreState: previous => {
      if (!previous) return;
      // Ein gespeicherter Tour-Zustand ist niemals eine Berechtigung:
      // Crew nur wieder öffnen, wenn Supabase die Rolle weiterhin bestätigt.
      Object.assign(S, previous);
      if (S.mode === "crew" && !S.role) S.mode = "view";
      renderActive({ animate: false });
    },
    tours: {
      public: {
        steps: [
          {
            prepare: showPublic("raster"),
            target: "#viewContent",
            titleKey: "tourPublicPlanTitle",
            bodyKey: "tourPublicPlanBody",
          },
          {
            prepare: showPublic("raster"),
            target: ".public-toolbar",
            titleKey: "tourPublicControlsTitle",
            bodyKey: "tourPublicControlsBody",
          },
          {
            prepare: showPublic("raster"),
            target: "#personalGroup",
            titleKey: "tourPublicPersonalTitle",
            bodyKey: "tourPublicPersonalBody",
            when: () => !!S.con?.playabl_event_id,
            optional: true,
          },
          {
            prepare: showPublic("raster"),
            target: "#calendarDownloadBtn",
            titleKey: "tourPublicCalendarExportTitle",
            bodyKey: "tourPublicCalendarExportBody",
            when: () => !!S.con?.playabl_event_id,
            optional: true,
          },
          {
            prepare: showPublic("raster"),
            target: () => document.querySelector("#viewContent .public-chip") || document.getElementById("viewContent"),
            titleKey: "tourPublicGameTitle",
            bodyKey: "tourPublicGameBody",
          },
          {
            prepare: showPublic("tabelle"),
            target: "#viewContent",
            titleKey: "tourPublicTableTitle",
            bodyKey: "tourPublicTableBody",
          },
          {
            prepare: showPublic("raeume"),
            target: "#viewContent",
            titleKey: "tourPublicRoomsTitle",
            bodyKey: "tourPublicRoomsBody",
          },
          {
            prepare: showPublic("raeume"),
            target: () => document.querySelector(".floor-plan-room-jump"),
            titleKey: "tourPublicRoomMapLinkTitle",
            bodyKey: "tourPublicRoomMapLinkBody",
            when: () => !!(floorPlanInteractiveEnabled() && S.floorPlanPublic?.document && S.rooms.some(room => floorPlanFloorForRoom(S.floorPlanPublic.document, room.id))),
            optional: true,
          },
          {
            prepare: showPublic("raeume"),
            target: "#floorPlanAction",
            titleKey: "tourPublicFloorPlanChoiceTitle",
            bodyKey: "tourPublicFloorPlanChoiceBody",
            when: () => floorPlanPublicSources().length > 0,
            optional: true,
          },
          {
            prepare: async () => {
              if (floorPlanInteractiveEnabled() && S.floorPlanPublic?.document) await showPublic("lageplan")();
            },
            target: () => document.querySelector(".floor-plan-public-layout"),
            titleKey: "tourPublicFloorPlanTitle",
            bodyKey: "tourPublicFloorPlanBody",
            when: () => !!(floorPlanInteractiveEnabled() && S.floorPlanPublic?.document),
            optional: true,
          },
          {
            target: "#printBtn",
            titleKey: "tourPublicPrintTitle",
            bodyKey: "tourPublicPrintBody",
          },
          {
            target: "#authBtn",
            titleKey: "tourPublicLoginTitle",
            bodyKey: "tourPublicLoginBody",
          },
        ],
      },
      crew: {
        steps: [
          {
            prepare: showCrew({ crewView: "zuordnen" }),
            target: ".crew-nav",
            titleKey: "tourCrewRoleTitle",
            bodyKey: "tourCrewRoleBody",
            vars: () => ({ role: tr(S.role === "admin" ? "tourRoleAdmin" : "tourRoleEditor") }),
          },
          {
            prepare: showCrew({ crewView: "zuordnen" }),
            target: () => document.querySelector(".crew-slot-group") || document.querySelector(".toolbar-card"),
            titleKey: "tourCrewSlotsTitle",
            bodyKey: "tourCrewSlotsBody",
          },
          {
            prepare: showCrew({ crewView: "zuordnen" }),
            target: () => document.querySelector(".assign-layout") || document.getElementById("crewContent"),
            titleKey: "tourCrewAssignTitle",
            bodyKey: "tourCrewAssignBody",
          },
          {
            prepare: showCrew({ crewView: "zuordnen" }),
            target: () => document.querySelector(".queue-actions") || document.querySelector(".assign-layout"),
            titleKey: "tourCrewAutoTitle",
            bodyKey: "tourCrewAutoBody",
          },
          {
            prepare: showCrew({ crewView: "zuordnen" }),
            target: () => document.querySelector(".crew-filter-group") || document.querySelector(".toolbar-card"),
            titleKey: "tourCrewFilterTitle",
            bodyKey: "tourCrewFilterBody",
          },
          {
            prepare: showCrew({ crewView: "setup", setupTab: "raeume" }),
            target: "#crewContent .slot-tabs",
            titleKey: "tourCrewSetupTitle",
            bodyKey: "tourCrewSetupBody",
          },
          {
            prepare: showCrew({ crewView: "setup", setupTab: "raeume" }),
            target: "#roomImportBtn",
            titleKey: "tourCrewRoomReuseTitle",
            bodyKey: "tourCrewRoomReuseBody",
            optional: true,
          },
          {
            prepare: showCrew({ crewView: "setup", setupTab: "lageplan" }),
            target: ".floor-plan-setup-card",
            titleKey: "tourCrewFloorPlanTitle",
            bodyKey: "tourCrewFloorPlanBody",
          },
          {
            prepare: showCrew({ crewView: "setup", setupTab: "lageplan" }),
            target: () => document.querySelector(".floor-plan-canvas-stage"),
            titleKey: "tourCrewFloorPlanEditorTitle",
            bodyKey: "tourCrewFloorPlanEditorBody",
            when: () => !!S.floorPlanDraft?.document,
            optional: true,
          },
          {
            target: ".crew-con-switch",
            titleKey: "tourCrewConSwitchTitle",
            bodyKey: "tourCrewConSwitchBody",
            when: () => (S.crewCons || []).some(con => con.id !== S.con?.id),
            optional: true,
          },
          {
            prepare: async () => {
              if (S.role === "admin") await showCrew({ crewView: "setup", setupTab: "crew" })();
              else await showCrew({ crewView: "setup", setupTab: "raeume" })();
            },
            target: () => S.role === "admin"
              ? document.querySelector(".crew-manage-card")
              : document.querySelector(".setup-card"),
            titleKey: () => S.role === "admin" ? "tourCrewAdminTitle" : "tourCrewEditorTitle",
            bodyKey: () => S.role === "admin" ? "tourCrewAdminBody" : "tourCrewEditorBody",
          },
          {
            prepare: showCrew({ crewView: "wuensche" }),
            target: ".requests-card",
            titleKey: "tourCrewRequestsTitle",
            bodyKey: "tourCrewRequestsBody",
          },
          {
            target: null,
            titleKey: "tourCrewFinishTitle",
            bodyKey: "tourCrewFinishBody",
          },
        ],
      },
    },
  });
}

(async () => {
  try {
    const con = await loadCon(CON_PARAM);
    if (!con) {
      document.getElementById("pageSub").textContent = "";
      document.getElementById("viewNavGroup").hidden = true;
      document.getElementById("status").innerHTML = `<span class="err">${esc(tr("conNotFound"))}</span> <a href="index.html">${esc(tr("backToOverview"))}</a>`;
      return;
    }
    S.con = con;
    S.store = makeStore(con.id);
    document.getElementById("pageTitle").textContent = con.name;
    document.getElementById("pageSub").textContent = con.playabl_event_id
      ? tr("pageSubPlayabl", { id: con.playabl_event_id }) : tr("pageSubManual");
    document.title = con.name + " – Loomspun Raumplan";

    // store.init() zuerst (nicht parallel zu loadPlayabl): die Slot-Buckets
    // daraus werden gebraucht, um Playabl-Sessions in Tages-Slots einzusortieren.
    const data = await S.store.init();
    S.rooms = data.rooms || []; S.tables = data.tables || []; S.assignments = data.assignments || [];
    S.slotBuckets = data.slotBuckets || []; S.slots = data.slots || [];
    S.featureTags = data.featureTags || []; S.roomFeatureTags = data.roomFeatureTags || [];
    S.gameRequiredTags = data.gameRequiredTags || [];
    S.floorPlanPublic = data.publicFloorPlan || null;
    S.games = await loadPlayabl(con.playabl_event_id, S.slotBuckets);
    await refreshRole();
    await refreshCrewCons();
    await loadConSwitchList();
    if (S.role) S.floorPlanDraft = await S.store.loadFloorPlanDraft().catch(() => null);
    if (S.games.length) {
      const days = [...new Set(S.games.map(g => g.slotKey.split("|")[0]))].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      await S.store.ensureSlotsForDays(days);
      S.slots = await supaFetch(`slots?select=*&con_id=eq.${con.id}&order=day.asc.nullslast,sort.asc`);
      // Rand-Fall (siehe loadPlayabl): Sessions außerhalb aller Buckets
      // ("Unsortiert", bei einer neuen Con ohne Vorlagen zunächst "Tag")
      // materialisieren sich nicht über ensure_slots_for_days (das kennt nur Buckets)
      // — hier direkt nachziehen, damit sie trotzdem zuordenbar bleiben. Nur als
      // Crew möglich (anon darf slots nicht schreiben, siehe RLS).
      const known = new Set(S.slots.map(s => s.key));
      const missing = new Map();
      for (const g of S.games) if (!known.has(g.slotKey) && !missing.has(g.slotKey)) missing.set(g.slotKey, g);
      if (missing.size && S.role) {
        const token = await Auth.accessToken();
        const rows = [...missing.values()].map(g => ({ con_id: con.id, key: g.slotKey, label: g.slotLabel, day: g.slotKey.split("|")[0], sort: 99 }));
        const h = supaHeaders(token, true);
        h.Prefer = "resolution=ignore-duplicates,return=representation";
        const inserted = await supaFetch("slots?on_conflict=con_id,key", { method: "POST", headers: h, body: JSON.stringify(rows) }).catch(() => []);
        S.slots.push(...(inserted || []));
      }
      sortSlots();
    }
    S.dbGames = data.dbGames || [];
    gamesFromDb();
    S.activeSlot = S.slots[0]?.key || null;
    if (S.role) S.requests = await S.store.listRequests().catch(() => []);
    restoreNavigationState();
    if (FORCE_CREW_ENTRY && S.role) S.mode = "crew";
    document.getElementById("status").textContent =
      tr("asOf", { date: new Intl.DateTimeFormat(LANG === "en" ? "en-GB" : "de-AT", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }).format(new Date()) });
    renderActive();
    highlightRequestedPlanGame();
    updateViewBanner();
    renderPendingInvites(document.getElementById("inviteBanner"), () => window.location.reload());
    configurePlanTours();
  } catch (err) {
    document.getElementById("status").innerHTML = `<span class="err">${esc(tr("dataLoadFailed", { err: err.message }))}</span>`;
  }
})();
