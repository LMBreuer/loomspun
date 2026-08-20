/* Wiederverwendbarer Spiel-Chip */
// Die Minimalansicht bleibt einzeilig; vollständige Angaben stehen im aria-label/title.
function chipHtml(g, { crew = false, forceMinimal = false, inGrid = false, inRoom = false } = {}) {
  const a = asgFor(g);
  const table = a && S.tables.find(t => t.id === a.table_id);
  const room = table && roomOfTable(table.id);
  const overSeats = table && g.seats > table.seats ? g.seats - table.seats : 0;
  const reqTags = (g.requiredTagIds || []).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean);
  const reqUnmet = room && reqTags.length ? reqTags.filter(f => !roomTagIds(room).includes(f.id)) : [];
  const level = forceMinimal ? "minimal" : S.detailLevel;
  const titleHtml = g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.title)}</a>` : esc(g.title);
  const titleShortText = g.title.length > 22 ? g.title.slice(0, 21) + "…" : g.title;
  const titleShort = g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(titleShortText)}</a>` : esc(titleShortText);

  const summaryParts = [g.title, tr("seatsPersons", { n: g.seats })];
  if (g.provider) summaryParts.push(tr("providerLabel", { p: g.provider }));
  if (g.ws) summaryParts.push(tr("workshop"));
  if (g.manual) summaryParts.push(tr("manuallyCreated"));
  summaryParts.push(g.slotLabel || tr("noSlot"));
  if (g.time) summaryParts.push(g.time);
  summaryParts.push(room && table ? `${room.name} · ${table.name}` : tr("noTableYet"));
  if (overSeats > 0) summaryParts.push(tr("overCapacityPersons", { n: overSeats }));
  if (reqTags.length) summaryParts.push(tr("needsTags", { tags: reqTags.map(f => f.label).join(", ") }));
  if (reqUnmet.length) summaryParts.push(tr("tableDoesNotMeet", { tags: reqUnmet.map(f => f.label).join(", ") }));
  const summary = summaryParts.join(", ");

  const requestIconBtn = !crew ? `<button type="button" class="icon-btn requestBtn" data-game="${esc(g.key)}" aria-label="${esc(tr("proposeChangeTo", { title: g.title }))}" title="${esc(tr("proposeChangeHint"))}">✎</button>` : "";
  const warnBadgeFull = overSeats > 0 ? `<span class="badge warn">${esc(tr("overCapacityBadge", { n: overSeats }))}</span>` : "";
  const warnIconMinimal = overSeats > 0 ? `<span class="badge warn" aria-hidden="true">⚠</span>` : "";
  // Nicht erfüllte Anforderungen werden hervorgehoben, blockieren die Zuordnung aber nicht.
  const reqBadgeFull = reqTags.length ? `<span class="badge${reqUnmet.length ? " warn" : ""}">${esc(tr("needsTags", { tags: reqTags.map(f => f.label).join(", ") }))}</span>` : "";
  const reqIconMinimal = reqTags.length ? `<span class="badge${reqUnmet.length ? " warn" : ""}" aria-hidden="true">🔧</span>` : "";

  let bodyHtml;
  if (inGrid) {
    const gridMeta = level === "medium"
      ? (table?.name || "")
      : [
          table?.name,
          `${g.seats}p`,
          overSeats > 0 ? `+${overSeats}` : "",
          ...reqTags.map(f => plainFeatureLabel(f.label)),
        ].filter(Boolean).join(" · ");
    const gridHost = level === "full"
      ? `<div class="grid-chip-host">${esc(tr("hostShortLabel", { name: g.provider || "–" }))}</div>`
      : "";
    bodyHtml = `<div class="title">${titleHtml}${requestIconBtn}</div>${gridHost}${level === "minimal" ? "" : `<div class="grid-chip-meta">${esc(gridMeta)}</div>`}`;
  } else if (inRoom) {
    const roomMeta = level === "minimal" ? "" : [
      tr("seatsCountLabel", { n: g.seats }),
      level === "full" && overSeats > 0 ? tr("overCapacityPlain") : "",
      ...(level === "full" ? reqTags.map(f => f.label) : []),
    ].filter(Boolean).join(" · ");
    bodyHtml = `<div class="title">${titleHtml}${requestIconBtn}</div>
      <div class="room-chip-host">${esc(tr("hostShortLabel", { name: g.provider || "–" }))}</div>
      <div class="room-chip-meta">${esc(roomMeta)}</div>`;
  } else if (level === "minimal") {
    bodyHtml = `<div class="title-row"><span class="title-short">${titleShort}</span><span class="seats-short">${g.seats}p</span>${warnIconMinimal}${reqIconMinimal}${requestIconBtn}</div>`;
  } else {
    const whereHtml = room && table
      ? `<div class="where" style="--chip-accent:${roomAccentVar(room)}"><span class="dot${roomMarkerClass(room)}"></span>${esc(room.name)} · ${esc(table.name)}</div>`
      : `<div class="where" style="color:var(--text-muted)">${esc(tr("noTableYetDash"))}</div>`;
    const metaHtml = level === "medium"
      ? `<div class="meta-row"><span>${esc(tr("personsShort", { n: g.seats }))}</span>${g.provider ? `<span>${esc(g.provider)}</span>` : ""}${g.ws ? `<span class="badge">${esc(tr("workshop"))}</span>` : ""}${warnBadgeFull}${reqBadgeFull}</div>`
      : `<div class="meta-row"><span>${esc(g.slotLabel)}</span><span>${esc(g.time || "")}</span><span>${esc(tr("personsShort", { n: g.seats }))}</span>${g.ws ? `<span class="badge">${esc(tr("workshop"))}</span>` : ""}${g.manual ? `<span class="badge">${esc(tr("manualBadge"))}</span>` : ""}${warnBadgeFull}${reqBadgeFull}</div>`;
    bodyHtml = `<div class="title">${titleHtml}${requestIconBtn}</div>${whereHtml}${metaHtml}`;
  }

  let controlsHtml;
  if (crew) {
    if (S.assignMode === "dnd") {
      controlsHtml = `<div class="controls-row">`;
      if (a && a.table_id) controlsHtml += `<button type="button" class="small unassignBtn" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}" aria-label="${esc(g.title)} vom Tisch entfernen">✕</button>`;
    } else {
      const isSel = S.selectedGame === g.key;
      const opts = [`<option value="">${esc(tr("chooseTable"))}</option>`];
      for (const r of S.rooms) for (const t of S.tables.filter(t => t.room_id === r.id)) {
        const sel = a && a.table_id === t.id ? " selected" : "";
        opts.push(`<option value="${t.id}"${sel}>${esc(r.name)} / ${esc(t.name)} (${t.seats})</option>`);
      }
      controlsHtml = `<div class="controls-row">
        <button type="button" class="small selectGameBtn${isSel ? " primary" : ""}" data-game="${esc(g.key)}" aria-pressed="${String(isSel)}">${isSel ? esc(tr("selectedClickTable")) : esc(tr("selectBtn"))}</button>
        <select class="assignSel small" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}" aria-label="${esc(tr("assignTableFor", { title: g.title }))}">${opts.join("")}</select>`;
      if (a && a.table_id) controlsHtml += `<button type="button" class="small unassignBtn" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}" aria-label="${esc(tr("removeFromTable", { title: g.title }))}">✕</button>`;
    }
    if (g.manual) controlsHtml += `<button type="button" class="small danger delGameBtn" data-id="${esc(g.dbId)}" aria-label="${esc(tr("deleteItemNamed", { title: g.title }))}">🗑</button>`;
    controlsHtml += `</div>`;
  } else {
    controlsHtml = "";
  }
  const drag = crew && S.assignMode === "dnd" ? ` draggable="true"` : "";
  const selectedClass = crew && S.assignMode === "click" && S.selectedGame === g.key ? " selected" : "";
  const gripHtml = crew && S.assignMode === "dnd" ? `<span class="chip-grip" aria-hidden="true">⠿</span>` : "";
  if (crew) {
    const assigned = !!(a && a.table_id);
    const showCrewMeta = !assigned || S.crewShowDetails;
    const crewMeta = [
      tr("seatsCountLabel", { n: g.seats }),
      g.provider ? tr("hostShortLabel", { name: g.provider }) : "",
      reqTags.length ? tr("needsTags", { tags: reqTags.map(f => f.label).join(", ") }) : "",
    ].filter(Boolean).join(" · ");
    const actions = `${assigned ? `<button type="button" class="unassignBtn crew-chip-action" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}" aria-label="${esc(tr("removeFromTable", { title: g.title }))}">✕</button>` : ""}${g.manual ? `<button type="button" class="delGameBtn crew-chip-action danger" data-id="${esc(g.dbId)}" aria-label="${esc(tr("deleteItemNamed", { title: g.title }))}">🗑</button>` : ""}`;
    return `<div class="chip crew-chip detail-${level}${assigned ? " is-assigned" : ""}${selectedClass}" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}"${drag} role="button" tabindex="0" aria-pressed="${String(!!selectedClass)}" aria-label="${esc(summary)}" title="${esc(summary)}">
      ${gripHtml}
      <div class="crew-chip-col">
        <div class="crew-chip-top"><span class="crew-chip-title" title="${esc(summary)}">${titleHtml}</span>${actions}</div>
        ${showCrewMeta ? `<div class="crew-chip-meta">${esc(crewMeta)}</div>` : ""}
      </div>
    </div>`;
  }
  return `<div class="chip ${crew ? "crew-chip" : "public-chip"} detail-${level}${inGrid ? " grid-chip" : ""}${inRoom ? " room-public-chip" : ""}${g.ws ? " ws" : ""}${level === "minimal" ? " minimal" : ""}${selectedClass}" data-game="${esc(g.key)}" data-slot="${esc(g.slotKey)}"${drag} role="group" aria-label="${esc(summary)}" title="${esc(summary)}">
    ${gripHtml}${bodyHtml}${controlsHtml}
  </div>`;
}

/* ---------------- Kopfzeilen-Bausteine ---------------- */
function renderKpiBar() {
  document.getElementById("kpiBar").innerHTML = `
    <div class="kpi"><div class="v">${S.games.length}</div><div class="l">${esc(tr("gamesLabel"))}</div></div>
    <div class="kpi"><div class="v">${S.rooms.length}</div><div class="l">${esc(tr("roomsLabel"))}</div></div>
    <div class="kpi"><div class="v">${S.tables.length}</div><div class="l">${esc(tr("tablesLabel"))}</div></div>`;
}
function renderLegend() {
  document.getElementById("legend").innerHTML = `
    <span class="item"><span class="swatch"></span> ${esc(tr("legendColorRoom"))}</span>
    <span class="item"><span class="swatch dashed"></span> ${esc(tr("legendDashedWorkshop"))}</span>
    <span class="item"><span class="badge warn">+X</span> ${esc(tr("legendOverCapacity"))}</span>
    <span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(tr("legendInfoText"))}" data-info-text="${esc(tr("legendInfoText"))}">i</span>`;
}
function renderPageTabs() {
  const showCrew = !!S.role;
  const eventId = S.con?.playabl_event_id;
  document.getElementById("pageTabs").innerHTML = `
    <a href="index.html" aria-pressed="false">${esc(tr("pageTabCons"))}</a>
    ${eventId ? `<a href="dashboard/?event=${encodeURIComponent(eventId)}" aria-pressed="false">${esc(tr("pageTabDashboard"))}</a>` : `<span aria-disabled="true">${esc(tr("pageTabDashboard"))}</span>`}
    <button type="button" data-page="view" aria-pressed="${String(S.mode === "view")}">${esc(tr("pageTabPlan"))}</button>
    ${showCrew ? `<button type="button" data-page="crew" aria-pressed="${String(S.mode === "crew")}">🔒 ${esc(tr("pageTabCrew"))}</button>` : `<span aria-disabled="true">🔒 ${esc(tr("pageTabCrew"))}</span>`}
  `;
}
function renderNav() {
  renderPageTabs();
  document.getElementById("viewNavGroup").hidden = S.mode !== "view";
  document.getElementById("viewTabs").innerHTML = VIEWS.map(v =>
    `<button type="button" data-view="${v.key}" aria-pressed="${String(S.mode === "view" && S.view === v.key)}">${esc(tr(v.nameKey))}</button>`).join("");
  const contextGroup = document.getElementById("contextGroup");
  const contextDivider = document.getElementById("contextDivider");
  const contextLabel = document.getElementById("contextLabel");
  const axisSwitch = document.getElementById("axisSwitch");
  const detailGroup = document.getElementById("detailGroup");
  const detailDivider = document.getElementById("detailDivider");
  const isTableView = S.view === "tabelle";
  const isFloorPlanView = S.view === "lageplan";
  document.querySelector(".public-toolbar").classList.toggle("is-compact", isTableView || isFloorPlanView);
  const personalGroup = document.getElementById("personalGroup");
  const personalDivider = document.getElementById("personalDivider");
  const hasPlayablEvent = !!S.con?.playabl_event_id;
  personalGroup.hidden = !hasPlayablEvent;
  personalDivider.hidden = !hasPlayablEvent || isFloorPlanView;
  document.querySelector(".public-toolbar .toolbar-search-group").hidden = isFloorPlanView;
  if (hasPlayablEvent) {
    const personalToggle = document.getElementById("myGamesFilter");
    const personalProfileButton = document.getElementById("personalGamesProfile");
    personalToggle.textContent = tr(isFloorPlanView ? "myRooms" : "myGames");
    personalToggle.setAttribute("aria-pressed", String(S.personalFilterActive));
    personalToggle.setAttribute("aria-label", S.personalProfile
      ? tr(isFloorPlanView ? "myRoomsFilterAria" : "myGamesFilterAria", { name: S.personalProfile.username })
      : tr(isFloorPlanView ? "myRoomsSetupAria" : "myGamesSetupAria"));
    personalProfileButton.hidden = !S.personalProfile;
    if (S.personalProfile) {
      personalProfileButton.textContent = S.personalProfile.username;
      personalProfileButton.title = tr("changePersonalProfile");
      personalProfileButton.setAttribute("aria-label", tr("changePersonalProfileFor", { name: S.personalProfile.username }));
    }
  }
  contextGroup.hidden = isTableView || isFloorPlanView;
  contextDivider.hidden = isTableView || isFloorPlanView;
  detailGroup.hidden = isTableView || isFloorPlanView;
  detailDivider.hidden = isTableView || isFloorPlanView;
  if (S.view === "raeume") {
    const visibleSlots = personalVisibleSlots();
    if (!visibleSlots.some(slot => slot.key === S.activeSlot)) S.activeSlot = visibleSlots[0]?.key || null;
    contextLabel.textContent = tr("slotLabel");
    axisSwitch.classList.add("local-slot-tabs");
    axisSwitch.setAttribute("aria-label", tr("chooseSlotAriaLabel"));
    axisSwitch.innerHTML = visibleSlots.map(s =>
      `<button type="button" data-slot="${esc(s.key)}" aria-pressed="${String(s.key === S.activeSlot)}">${esc(s.label)}</button>`
    ).join("");
  } else {
    contextLabel.textContent = tr("rowsLabel");
    axisSwitch.classList.remove("local-slot-tabs");
    axisSwitch.setAttribute("aria-label", tr("rowsLabel"));
    axisSwitch.innerHTML = `
      <button type="button" data-axis="rooms" aria-pressed="${String(S.rasterAxis !== "slots")}">${esc(tr("roomsLabel"))}</button>
      <button type="button" data-axis="slots" aria-pressed="${String(S.rasterAxis === "slots")}">Slots</button>`;
  }
  const publicInfo = document.querySelector(".public-toolbar .info-tip-trigger");
  if (publicInfo) {
    publicInfo.dataset.infoText = tr("legendInfoText");
    publicInfo.setAttribute("aria-label", tr("legendInfoText"));
  }
  const printBtn = document.getElementById("printBtn");
  printBtn.innerHTML = `<span class="toolbar-action-icon" aria-hidden="true">⎙</span> ${esc(tr("printAction"))}`;
  printBtn.title = tr("printCurrentView");
  printBtn.setAttribute("aria-label", tr("printCurrentView"));
  printBtn.hidden = isFloorPlanView;
  const calendarDownloadBtn = document.getElementById("calendarDownloadBtn");
  calendarDownloadBtn.hidden = !hasPlayablEvent;
  calendarDownloadBtn.innerHTML = `<svg class="calendar-export-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M12 12v5m0 0-2-2m2 2 2-2"/></svg> ${esc(tr("calendarDownload"))}`;
  calendarDownloadBtn.title = tr(S.personalProfile ? "calendarDownloadHint" : "calendarDownloadSetupHint");
  calendarDownloadBtn.setAttribute("aria-label", calendarDownloadBtn.title);
  const floorPlanAction = document.getElementById("floorPlanAction");
  const floorPlanSources = floorPlanPublicSources().filter(source => !isFloorPlanView || source.key !== "interactive");
  floorPlanAction.hidden = !floorPlanSources.length;
  if (floorPlanSources.length === 1) {
    const source = floorPlanSources[0];
    const sourceLabel = isFloorPlanView && source.key === "file" ? tr("floorPlanPublicFile") : tr("floorPlan");
    floorPlanAction.innerHTML = `<a class="btn toolbar-action" href="${esc(source.href)}"${source.external ? ' target="_blank" rel="noopener"' : ""} title="${esc(tr("openFloorPlan"))}" aria-label="${esc(tr("openFloorPlan"))}"><span class="toolbar-action-icon" aria-hidden="true">⌖</span> ${esc(sourceLabel)}</a>`;
  } else if (floorPlanSources.length > 1) {
    floorPlanAction.innerHTML = `<details class="floor-plan-public-menu"><summary class="btn toolbar-action"><span class="toolbar-action-icon" aria-hidden="true">⌖</span> ${esc(tr("floorPlan"))} <span aria-hidden="true">⌄</span></summary><div>${floorPlanSources.map(source => `<a href="${esc(source.href)}"${source.external ? ' target="_blank" rel="noopener"' : ""}>${esc(tr(source.key === "interactive" ? "floorPlanPublicInteractive" : "floorPlanPublicFile"))}</a>`).join("")}</div></details>`;
  } else floorPlanAction.innerHTML = "";
  document.getElementById("detailSwitch").hidden = isTableView || isFloorPlanView;
}

/* ---------------- Ansicht: Tabelle ---------------- */
function sortGames(list, sort) {
  const val = g => {
    if (sort.key === "title") return g.title.toLowerCase();
    if (sort.key === "provider") return g.provider ? g.provider.toLowerCase() : "￿";
    if (sort.key === "seats") return g.seats;
    if (sort.key === "room") { const a = asgFor(g); const t = a && S.tables.find(x => x.id === a.table_id); const r = t && S.rooms.find(x => x.id === t.room_id); return r ? r.name.toLowerCase() : "￿"; }
    if (sort.key === "table") { const a = asgFor(g); const t = a && S.tables.find(x => x.id === a.table_id); return t ? t.name.toLowerCase() : "￿"; }
    const slotIndex = S.slots.findIndex(s => s.key === g.slotKey);
    return slotIndex < 0 ? Number.MAX_SAFE_INTEGER : slotIndex;
  };
  return [...list].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
}
function personalEmptyMessage({ roomAssignment = false } = {}) {
  const key = !personalGames().length
    ? "noPersonalGames"
    : roomAssignment && S.games.some(matchesPublicFilters)
      ? "noPersonalRoomAssignments"
      : S.search
      ? "noPersonalSearchResults"
      : roomAssignment
        ? "noPersonalRoomAssignments"
        : "noPersonalSearchResults";
  return tr(key, { name: S.personalProfile?.username || "" });
}
function floorPlanRoomJumpButtonHtml(room) {
  const documentValue = floorPlanInteractiveEnabled() ? S.floorPlanPublic?.document : null;
  if (!room || !documentValue || !floorPlanFloorForRoom(documentValue, room.id)) return "";
  const label = tr("floorPlanShowRoomOnMap", { name: room.name });
  return `<button type="button" class="icon-btn floor-plan-room-jump no-print" data-floor-plan-room-link="${esc(room.id)}" title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">⌖</span></button>`;
}
function tabelleHtml() {
  const rows = sortGames(S.games.filter(matchesPublicFilters), S.tableSort);
  if (!rows.length) return emptyState(S.personalFilterActive
    ? personalEmptyMessage()
    : (S.games.length ? tr("noSearchResults") : tr("noGamesYet")));
  const arrow = k => S.tableSort.key === k ? (S.tableSort.dir === 1 ? " ▲" : " ▼") : "";
  const trs = rows.map(g => {
    const a = asgFor(g); const table = a && S.tables.find(t => t.id === a.table_id); const room = table && roomOfTable(table.id);
    const slot = S.slots.find(s => s.key === g.slotKey);
    return `<tr>
      <td>${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.title)}</a>` : esc(g.title)}${g.ws ? ` <span class="badge">${esc(tr("workshop"))}</span>` : ""} <button type="button" class="icon-btn requestBtn no-print" data-game="${esc(g.key)}" aria-label="${esc(tr("proposeChangeTo", { title: g.title }))}" title="${esc(tr("proposeChangeHint"))}">✎</button></td>
      <td>${g.provider ? esc(g.provider) : '<span style="color:var(--text-muted)">–</span>'}</td>
      <td>${esc(slot?.label || g.slotLabel)}</td>
      <td>${room ? `<span class="room-map-reference" style="--room-accent:${roomAccentVar(room)}"><span class="where" style="--chip-accent:${roomAccentVar(room)}"><span class="dot${roomMarkerClass(room)}"></span>${esc(room.name)}</span>${floorPlanRoomJumpButtonHtml(room)}</span>` : '<span style="color:var(--text-muted)">–</span>'}</td>
      <td>${table ? esc(table.name) : "–"}</td>
      <td>${g.seats}</td>
    </tr>`;
  }).join("");
  return `<div class="card public-table-card"><div style="overflow-x:auto"><table>
    <caption class="sr-only">${esc(tr("tableCaption"))}</caption>
    <thead><tr>
      <th scope="col" data-sort="title">${esc(tr("gameCol"))}${arrow("title")}</th>
      <th scope="col" data-sort="provider">${esc(tr("printColHost"))}${arrow("provider")}</th>
      <th scope="col" data-sort="when">${esc(tr("slotCol"))}${arrow("when")}</th>
      <th scope="col" data-sort="room">${esc(tr("roomCol"))}${arrow("room")}</th>
      <th scope="col" data-sort="table">${esc(tr("tableCol"))}${arrow("table")}</th>
      <th scope="col" data-sort="seats">${esc(tr("seatsCol"))}${arrow("seats")}</th>
    </tr></thead><tbody>${trs}</tbody></table></div></div>`;
}

/* ---------------- Ansicht: Raster ---------------- */
function rasterHtml() {
  if (!S.rooms.length) return emptyState(tr("noRoomsYet"));
  if (!S.slots.length) return emptyState(tr("noSlotsYet"));
  const visibleRooms = personalVisibleRooms();
  const visibleSlots = personalVisibleSlots();
  if (S.personalFilterActive && (!visibleRooms.length || !visibleSlots.length)) {
    return emptyState(personalEmptyMessage({ roomAssignment: true }));
  }
  const rows = S.rasterAxis === "slots" ? visibleSlots : visibleRooms;
  const cols = S.rasterAxis === "slots" ? visibleRooms : visibleSlots;
  const headHtml = cols.map(c => {
    const room = S.rasterAxis === "slots" ? c : null;
    return `<th scope="col"><span class="matrix-label"${room ? ` style="--room-accent:${roomAccentVar(room)}"` : ""}>${room ? `<span class="room-swatch${roomMarkerClass(room)}" aria-hidden="true" style="--room-accent:${roomAccentVar(room)}"></span>` : ""}<span class="matrix-label-text">${esc(room ? room.name : c.label)}</span>${room ? floorPlanRoomJumpButtonHtml(room) : ""}</span></th>`;
  }).join("");
  const bodyHtml = rows.map(r => {
    const rowLabel = S.rasterAxis === "slots" ? r.label : r.name;
    const rowRoom = S.rasterAxis === "slots" ? null : r;
    const cellsHtml = cols.map(c => {
      const room = S.rasterAxis === "slots" ? c : r;
      const slot = S.rasterAxis === "slots" ? r : c;
      const gamesHere = S.games.filter(g => g.slotKey === slot.key && matchesPublicFilters(g)).filter(g => { const a = asgFor(g); const t = a && S.tables.find(x => x.id === a.table_id); return t && t.room_id === room.id; });
      const fillClass = gamesHere.length === 0 ? "fill-0" : gamesHere.length === 1 ? "fill-low" : gamesHere.length === 2 ? "fill-mid" : "fill-high";
      const inner = gamesHere.length ? gamesHere.map(g => chipHtml(g, { crew: false, inGrid: true })).join("") : "·";
      return `<td class="grid-cell ${fillClass}${!gamesHere.length ? " empty" : ""}"${gamesHere.length ? "" : ` aria-label="${esc(tr("noGames"))}"`}>${inner}</td>`;
    }).join("");
    return `<tr>
      <th scope="row"><span class="matrix-label"${rowRoom ? ` style="--room-accent:${roomAccentVar(rowRoom)}"` : ""}>${rowRoom ? `<span class="room-swatch${roomMarkerClass(rowRoom)}" aria-hidden="true" style="--room-accent:${roomAccentVar(rowRoom)}"></span>` : ""}<span class="matrix-label-text">${esc(rowLabel)}</span>${rowRoom ? floorPlanRoomJumpButtonHtml(rowRoom) : ""}</span></th>
      <td class="matrix-divider">${rowRoom ? `<span class="matrix-divider-bar${roomMarkerClass(rowRoom)}" aria-hidden="true" style="--room-accent:${roomAccentVar(rowRoom)}"></span>` : ""}</td>
      ${cellsHtml}
    </tr>`;
  }).join("");
  return `<div class="grid-view"><table class="grid-table" style="--matrix-cols:${cols.length}"><thead><tr><th class="matrix-corner"></th><th class="matrix-divider"></th>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

/* ---------------- Slot-Tabs (geteilt: Räume-Ansicht + Zuordnen) ---------------- */
// manage=true ergänzt "+ Slot"/"✎"-Bedienelemente (nur im Crew-Kontext).
function slotTabsHtml(manage) {
  const tabs = S.slots.map(s => `<button type="button" data-slot="${esc(s.key)}" aria-pressed="${String(s.key === S.activeSlot)}">${esc(s.label)}</button>`).join("");
  const manageHtml = manage ? `<button type="button" id="editSlotBtn" class="small no-print" title="${esc(tr("editSlotTitle", { label: S.activeSlot ? (S.slots.find(s => s.key === S.activeSlot)?.label || "") : "–" }))}" aria-label="${esc(tr("editSlotAriaLabel"))}"${S.activeSlot ? "" : " disabled"}>✎</button><button type="button" id="addSlotBtn" class="small no-print" title="${esc(tr("addSlotTitle"))}" aria-label="${esc(tr("addSlotAriaLabel"))}">${esc(tr("addSlotBtnLabel"))}</button>` : "";
  return `<div class="slot-tabs local-slot-tabs" role="group" aria-label="${esc(tr("chooseSlotAriaLabel"))}">${tabs}${manageHtml}</div>`;
}

let crewSlotScrollLeft = 0;
function updateCrewSlotScrollControls() {
  const shell = document.querySelector("#crewContent .crew-slot-scroller");
  const scroller = shell?.querySelector(".local-slot-tabs");
  if (!shell || !scroller) return;
  crewSlotScrollLeft = scroller.scrollLeft;
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const canLeft = scroller.scrollLeft > 2;
  const canRight = scroller.scrollLeft < maxScroll - 2;
  const prev = shell.querySelector('[data-slot-scroll="-1"]');
  const next = shell.querySelector('[data-slot-scroll="1"]');
  if (prev) prev.hidden = !canLeft;
  if (next) next.hidden = !canRight;
  shell.classList.toggle("can-scroll-left", canLeft);
  shell.classList.toggle("can-scroll-right", canRight);
}
function wireCrewSlotScroller() {
  const scroller = document.querySelector("#crewContent .crew-slot-scroller .local-slot-tabs");
  if (!scroller) return;
  scroller.scrollLeft = Math.min(crewSlotScrollLeft, Math.max(0, scroller.scrollWidth - scroller.clientWidth));
  scroller.addEventListener("scroll", updateCrewSlotScrollControls, { passive: true });
  requestAnimationFrame(updateCrewSlotScrollControls);
}
window.addEventListener("resize", updateCrewSlotScrollControls);

/* ---------------- Ansicht: Räume (öffentlich, lesend) ---------------- */
function raeumeReadHtml() {
  if (!S.slots.length) return emptyState(tr("noSlotsYet"));
  if (S.personalFilterActive && !S.activeSlot) return emptyState(personalEmptyMessage({ roomAssignment: true }));
  const visibleRooms = personalVisibleRooms().filter(room => !S.personalFilterActive || S.games.some(g => {
    const assignment = asgFor(g);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    return g.slotKey === S.activeSlot && matchesPublicFilters(g) && table?.room_id === room.id;
  }));
  const boardHtml = visibleRooms.map(room => {
    const floorPlanJump = floorPlanRoomJumpButtonHtml(room);
    const tables = S.tables.filter(t => t.room_id === room.id).filter(t => !S.personalFilterActive || S.games.some(g => {
      const assignment = asgFor(g);
      return g.slotKey === S.activeSlot && matchesPublicFilters(g) && assignment?.table_id === t.id;
    }));
    const tablesHtml = tables.map(t => {
      const games = S.games.filter(g => g.slotKey === S.activeSlot && matchesPublicFilters(g)).filter(g => { const a = asgFor(g); return a && a.table_id === t.id; });
      return `<div class="tablebox"><div class="thead"><b>${esc(t.name)}</b><span class="seats">${esc(tr("seatsCountLabel", { n: t.seats }))}</span></div>${games.map(g => chipHtml(g, { crew: false, inRoom: true })).join("") || `<div class="free room-public-free detail-${S.detailLevel}">${esc(tr("freeLabel"))}</div>`}</div>`;
    }).join("");
    return `<div id="room-${esc(room.id)}" class="room${tables.length >= 4 ? " wide" : ""}" data-room-id="${esc(room.id)}" style="--room-accent:${roomAccentVar(room)}"${room.sort > 0 ? ` data-order="${room.sort}"` : ""}>
      <div class="room-head"><span class="room-swatch${roomMarkerClass(room)}" aria-hidden="true" style="--room-accent:${roomAccentVar(room)}"></span><h3>${esc(room.name)}</h3>${floorPlanJump}${roomNameMarkerHtml(room)}</div>
      ${room.floor ? `<p class="room-location">${esc(room.floor)}</p>` : ""}
      <div class="room-badges">${roomBadgesHtml(room)}</div>
      ${tablesHtml || `<p class="hint">${esc(tr("noTablesYet"))}</p>`}
    </div>`;
  }).join("") || emptyState(S.personalFilterActive
    ? personalEmptyMessage({ roomAssignment: true })
    : tr("noRoomsYet"));
  return `<div id="board">${boardHtml}</div>`;
}
