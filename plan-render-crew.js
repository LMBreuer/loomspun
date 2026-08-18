/* ---------------- Crew: Zuordnen ---------------- */
function zuordnenHtml() {
  if (!S.slots.length) return emptyState(tr("noSlotsYet")) + `<div class="controls no-print" style="margin-top:var(--sp-3)"><button type="button" id="addSlotBtn" class="primary">${esc(tr("addFirstSlotBtn"))}</button></div>`;
  const slotGames = bySlot(S.activeSlot);
  const unassignedCandidates = slotGames.filter(g => { const a = asgFor(g); return !a || !a.table_id; });
  const unassigned = unassignedCandidates
    .filter(matchesCrewGameSearch)
    .filter(g => !S.filterReqTags.length || S.filterReqTags.some(id => (g.requiredTagIds || []).includes(id)))
    .filter(g => g.seats >= S.minSeats);
  const queueHintText = S.assignMode === "click" ? tr("queueHintClick") : tr("queueHintDnd");
  const assignedInSlot = S.assignments.filter(a => a.slot_key === S.activeSlot && a.table_id).length;
  const queueEmptyText = unassignedCandidates.length ? tr("noCrewGameMatches") : tr("allAssigned");
  const queueHtml = `<div class="assign-queue">
    <div class="queue-head">
      <div class="queue-title-row"><h2>${esc(tr("unassignedTitle"))}</h2><span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(tr("queueInfoAriaLabel"))}" data-info-text="${esc(tr("queueInfoText", { hint: queueHintText }))}">i</span></div>
      <div class="queue-actions">
        <button type="button" id="autoBtn" class="primary" title="${esc(tr("autoAssignBtnTitle"))}">${esc(tr("autoAssignBtn"))}</button>
        <button type="button" id="clearSlotBtn" class="small danger" title="${esc(tr("clearSlotBtnTitle"))}"${assignedInSlot ? "" : " disabled"}>${esc(tr("clearSlotBtn"))}</button>
      </div>
    </div>
    <div class="chipbar" id="unassignedBar">${unassigned.map(g => chipHtml(g, { crew: true })).join("") || `<p class="hint">${esc(queueEmptyText)}</p>`}</div>
  </div>`;
  // Tischhinweise beziehen sich im Auswahlmodus auf das gewählte Spiel.
  const selectedGameObj = S.selectedGame && gameByKey(S.selectedGame);
  const forceMinimal = !S.crewShowDetails;
  const filteredRooms = S.filterReqTags.length
    ? S.rooms.filter(room => S.filterReqTags.some(id => roomTagIds(room).includes(id)))
    : S.rooms;
  const boardHtml = filteredRooms.map(room => {
    const tables = S.tables.filter(t => t.room_id === room.id);
    const missingForRoom = selectedGameObj
      ? (selectedGameObj.requiredTagIds || []).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).filter(f => !roomTagIds(room).includes(f.id))
      : [];
    const tablesHtml = tables.map(t => {
      const tableGames = slotGames.filter(g => { const a = asgFor(g); return a && a.table_id === t.id; });
      const games = tableGames.filter(matchesCrewGameSearch);
      const double = tableGames.length > 1 ? `<span class="badge warn">${esc(tr("doubleBooked"))}</span>` : "";
      const reqMismatch = missingForRoom.length ? " req-mismatch" : "";
      const reqHint = missingForRoom.length ? `<span class="badge warn" title="${esc(tr("doesNotMeet", { tags: missingForRoom.map(f => f.label).join(", ") }))}">${esc(tr("missingTags", { tags: missingForRoom.map(f => f.label).join(", ") }))}</span>` : "";
      let gameMatch = "";
      if (S.assignMode === "click" && selectedGameObj) {
        const seatsFit = t.seats >= selectedGameObj.seats;
        gameMatch = seatsFit && !missingForRoom.length ? " gm-full" : seatsFit ? " gm-partial" : " gm-none";
      }
      const emptyTableText = S.crewSearch && tableGames.length ? tr("noCrewTableGameMatch") : tr("freeLabel");
      return `<div class="tablebox${reqMismatch}${gameMatch}" data-table="${t.id}"><div class="thead"><b>${esc(t.name)}</b><span class="seats">${esc(tr("seatsCountLabel", { n: t.seats }))}</span>${double}${reqHint}</div>${games.map(g => chipHtml(g, { crew: true, forceMinimal })).join("") || `<div class="free">${esc(emptyTableText)}</div>`}</div>`;
    }).join("");
    return `<div class="room" style="--room-accent:${roomAccentVar(room)}"><div class="room-head"><span class="room-swatch${roomMarkerClass(room)}" aria-hidden="true" style="--room-accent:${roomAccentVar(room)}"></span><h3>${esc(room.name)}</h3></div><div class="room-badges">${roomBadgesHtml(room)}</div>${tablesHtml || `<p class="hint">${esc(tr("noTablesCreateInRooms"))}</p>`}</div>`;
  }).join("") || emptyState(tr("noRoomsGoToManage"));
  const pinnedBannerHtml = (() => {
    if (!S.pinnedRequest) return "";
    const g = gameByKey(S.pinnedRequest.gameKey);
    return `<div class="pinned-banner no-print"><div><strong>${esc(g ? g.title : "")}</strong> — ${esc(S.pinnedRequest.message)}</div><button type="button" id="pinnedBannerCloseBtn" class="icon-btn" aria-label="${esc(tr("closeBanner"))}">✕</button></div>`;
  })();
  const toolbarHtml = `<div class="card toolbar-card no-print">
    <div class="toolbar-group crew-slot-group">
      <span class="toolbar-label">${esc(tr("toolbarSlotLabel"))}</span>
      <div class="crew-slot-scroller">
        <button type="button" class="slot-scroll-btn" data-slot-scroll="-1" aria-label="${esc(tr("scrollSlotsLeftAriaLabel"))}" hidden>‹</button>
        ${slotTabsHtml(true)}
        <button type="button" class="slot-scroll-btn" data-slot-scroll="1" aria-label="${esc(tr("scrollSlotsRightAriaLabel"))}">›</button>
      </div>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <span class="toolbar-label">${esc(tr("toolbarAssignModeLabel"))}</span>
      <div class="toolbar-pill-row" role="group" aria-label="${esc(tr("assignModeAriaLabel"))}">
        <button type="button" class="filter-chip" data-assignmode="dnd" aria-pressed="${String(S.assignMode === "dnd")}">${esc(tr("dragDropLabel"))}</button>
        <button type="button" class="filter-chip" data-assignmode="click" aria-pressed="${String(S.assignMode === "click")}">${esc(tr("singleSelectLabel"))}</button>
      </div>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <span class="toolbar-label">${esc(tr("toolbarDetailsLabel"))}</span>
      <button type="button" id="crewDetailsToggle" class="details-toggle${S.crewShowDetails ? " is-active" : ""}" title="${esc(tr("toolbarDetailsHint"))}">ⓘ ${esc(tr("toolbarDetailsBtn"))}</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group crew-filter-group">
      <span class="toolbar-label">${esc(tr("toolbarFilterLabel"))}</span>
      <div class="toolbar-pill-row">
        <label class="crew-game-search" for="crewGameSearch">
          <input type="search" id="crewGameSearch" value="${esc(S.crewSearch)}" placeholder="${esc(tr("crewGameSearchPlaceholder"))}" aria-label="${esc(tr("crewGameSearchAriaLabel"))}">
          <span>${esc(tr("crewGameSearchScope"))}</span>
        </label>
        ${minSeatsStepperHtml()}
        ${filterTagPickerHtml("games", S.filterReqTags)}
      </div>
    </div>
  </div>`;
  return `${pinnedBannerHtml}${unscheduledBacklogHtml()}${toolbarHtml}
    <div class="assign-layout">${queueHtml}<div id="board">${boardHtml}</div></div>`;
}

// Manuelle Spiele ohne Slot bleiben im Zuordnungs-Backlog sichtbar.
function unscheduledBacklogHtml() {
  const unscheduled = S.games.filter(g => g.manual && !g.slotKey).filter(matchesCrewGameSearch);
  if (!unscheduled.length) return "";
  return `<details class="hint-details" style="margin-bottom:var(--sp-3)">
    <summary>${esc(tr("unscheduledCount", { n: unscheduled.length }))}</summary>
    <div class="chipbar">${unscheduled.map(g => `<div class="chip">
      <div class="title">${esc(g.title)}</div>
      <div class="meta-row"><span>${esc(tr("personsShort", { n: g.seats }))}</span>${g.ws ? `<span class="badge">${esc(tr("workshop"))}</span>` : ""}</div>
      <div class="controls-row"><button type="button" class="small addToActiveSlotBtn" data-game="${esc(g.key)}">${esc(tr("moveToActiveSlot"))}</button></div>
    </div>`).join("")}</div>
  </details>`;
}

/* ---------------- Crew: Zeitabschnitts-Vorlagen (Slot-Buckets) ---------------- */
function bucketsHtml() {
  const rows = S.slotBuckets.map(b => `
    <div class="manage-row">
      <div class="manage-copy">
        <div class="manage-title">${esc(b.label)}${b.active ? "" : ` <span class="badge muted">${esc(tr("inactiveBadge"))}</span>`}</div>
        <div class="manage-meta">${esc(tr("bucketTimeRange", { start: b.start_hour, end: b.end_hour }))}</div>
      </div>
      <div class="manage-actions">
        <button type="button" class="small no-print editBucketBtn" data-id="${b.id}" aria-label="${esc(tr("editBucketAriaLabel", { label: b.label }))}">${esc(tr("editBtnLabel"))}</button>
      </div>
    </div>`).join("") || `<p class="hint">${esc(tr("noBucketsYet"))}</p>`;
  return `<div class="card setup-card slots-template-card">
    <div class="setup-head">
      <div class="setup-head-title"><h2>${esc(tr("bucketsTitle"))}</h2></div>
      <button type="button" id="addBucketBtn" class="primary">${esc(tr("addBucketBtn"))}</button>
    </div>
    <p class="hint">${esc(tr("bucketsHint"))}</p>
    ${rows}
  </div>`;
}

function slotsVerwaltenHtml() {
  const rows = S.slots.map(s => {
    const assignmentCount = S.assignments.filter(a => a.slot_key === s.key).length;
    const metaParts = [s.day ? new Intl.DateTimeFormat(LANG === "en" ? "en-GB" : "de-AT", { dateStyle: "medium", timeZone: TZ }).format(new Date(`${s.day}T12:00:00Z`)) : null, tr(assignmentCount === 1 ? "assignmentCount" : "assignmentCountPlural", { n: assignmentCount })].filter(Boolean);
    return `<div class="manage-row">
      <div class="manage-copy">
        <div class="manage-title">${esc(s.label)}</div>
        <div class="manage-meta">${esc(metaParts.join(" · "))}</div>
      </div>
      <div class="manage-actions">
        <button type="button" class="small editSlotRowBtn" data-id="${s.id}" aria-label="${esc(tr("editSlotTitle", { label: s.label }))}">${esc(tr("editBtnLabel"))}</button>
      </div>
    </div>`;
  }).join("") || `<p class="hint">${esc(tr("noSlotsYet"))}</p>`;
  return `<div class="card setup-card slots-manage-card">
      ${setupHeadHtml(tr("slotsInfoTitle"), tr("slotsInfoAriaLabel"), tr("slotsInfoText"), "addSlotBtn", tr("addSlotBtnLabel"))}
      ${rows}
    </div>
    ${bucketsHtml()}`;
}

/* ---------------- Crew: Räume verwalten ---------------- */
function setupHeadHtml(titleText, infoAriaLabel, infoText, btnId, btnLabel, extraActions = "") {
  return `<div class="controls no-print setup-head">
    <div class="setup-head-title"><h2>${esc(titleText)}</h2><span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(infoAriaLabel)}" data-info-text="${esc(infoText)}">i</span></div>
    <div class="setup-head-actions">${extraActions}<button type="button" id="${btnId}" class="primary">${esc(btnLabel)}</button></div>
  </div>`;
}
function raeumeVerwaltenHtml() {
  const roomsHtml = S.rooms.map(room => {
    const tables = S.tables.filter(t => t.room_id === room.id);
    const totalSeats = tables.reduce((sum, table) => sum + (Number(table.seats) || 0), 0);
    const expanded = S.expandedRoomIds.has(room.id);
    const tablesHtml = tables.map(t => `<div class="tablebox"><div class="thead"><b>${esc(t.name)}</b><span class="seats">${esc(tr("seatsCountLabel", { n: t.seats }))}</span>${t.notes ? `<span class="seats">· ${esc(t.notes)}</span>` : ""}
      <span class="table-actions"><button type="button" class="small editTableBtn" data-id="${t.id}" aria-label="${esc(tr("editTableAriaLabel", { name: t.name }))}">✎</button><button type="button" class="small danger delTableBtn" data-id="${t.id}" aria-label="${esc(tr("deleteTableAriaLabel", { name: t.name }))}">🗑</button></span></div></div>`).join("");
    return `<div class="room-row" style="--room-accent:${roomAccentVar(room)}"${room.sort > 0 ? ` data-order="${room.sort}"` : ""}>
      <div class="room-row-summary">
        <button type="button" class="room-row-toggle" data-room-toggle="${room.id}" aria-expanded="${String(expanded)}" aria-label="${esc(tr("expandRoomAriaLabel", { name: room.name }))}">
          <span class="dot${roomMarkerClass(room)}"></span>
          <span class="room-row-main"><span class="room-row-name">${esc(room.name)}${room.floor ? ` · ${esc(room.floor)}` : ""}</span>
            <span class="room-row-meta"><span>${esc(tr("roomCapacitySummary", { tables: tr("tableCountLabel", { n: tables.length }), seats: totalSeats }))}</span>${roomBadgesHtml(room)}</span>
          </span>
        </button>
        <span class="room-actions">
          <button type="button" class="small addTableBtn" data-room="${room.id}">${esc(tr("addTableBtn"))}</button>
          <button type="button" class="small editRoomBtn" data-id="${room.id}" aria-label="${esc(tr("editRoomAriaLabel", { name: room.name }))}">${esc(tr("editBtnLabel"))}</button>
          <button type="button" class="small danger delRoomBtn" data-id="${room.id}" aria-label="${esc(tr("deleteRoomAriaLabel", { name: room.name }))}">${esc(tr("deleteBtnLabel"))}</button>
        </span>
      </div>
      <div class="room-row-detail"${expanded ? "" : " hidden"}>
        ${room.notes ? `<p class="hint">${esc(room.notes)}</p>` : ""}
        ${tablesHtml || `<p class="hint">${esc(tr("noTablesYet"))}</p>`}
      </div>
    </div>`;
  }).join("") || emptyState(tr("noRoomsYet"));
  const importAction = `<button type="button" id="roomImportBtn">⧉ ${esc(tr("roomsImport"))}</button>`;
  return `<div class="card setup-card">
    ${setupHeadHtml(tr("roomsInfoTitle"), tr("roomsInfoAriaLabel"), tr("roomsInfoText"), "addRoomBtn", tr("addRoomBtn"), importAction)}
    <div id="board">${roomsHtml}</div>
  </div>`;
}

/* ---------------- Crew: Spiele verwalten ---------------- */
function spieleVerwaltenHtml() {
  const manualRows = S.dbGames.map(dg => {
    const a = S.assignments.find(x => x.game_id === dg.id);
    const slot = a && S.slots.find(s => s.key === a.slot_key);
    const reqLabels = gameReqTagIds(dg.id).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).map(f => f.label);
    const statusBadge = a?.table_id ? `<span class="badge good">${esc(tr("gameAssignedBadge"))}</span>` : `<span class="badge warn">${esc(tr("gameOpenBadge"))}</span>`;
    return `<div class="manage-row">
      <div class="manage-copy">
        <div class="manage-title">${esc(dg.title)} ${statusBadge}</div>
        <div class="manage-meta">${dg.provider ? `${esc(tr("hostShortLabel", { name: dg.provider }))} · ` : ""}${esc(tr("personsShort", { n: dg.seats }))}${slot ? ` · ${esc(slot.label)}` : ` · ${esc(tr("noSlot"))}`}${reqLabels.length ? ` · ${esc(tr("needsTags", { tags: reqLabels.join(", ") }))}` : ""}</div>
      </div>
      <div class="manage-actions">
        <button type="button" class="small editGameBtn" data-id="${dg.id}" aria-label="${esc(tr("editItemNamed", { title: dg.title }))}">${esc(tr("editBtnLabel"))}</button>
        <button type="button" class="small danger delGameBtn" data-id="${dg.id}" aria-label="${esc(tr("deleteItemNamed", { title: dg.title }))}">${esc(tr("deleteBtnLabel"))}</button>
      </div>
    </div>`;
  }).join("") || `<p class="hint">${esc(tr("noManualGamesYet"))}</p>`;

  const slotOrder = new Map(S.slots.map((slot, index) => [slot.key, index]));
  const playablGames = S.games
    .filter(g => !g.manual)
    .sort((a, b) => (slotOrder.get(a.slotKey) ?? Number.MAX_SAFE_INTEGER) - (slotOrder.get(b.slotKey) ?? Number.MAX_SAFE_INTEGER)
      || a.title.localeCompare(b.title, LANG));
  const playablRows = playablGames.map(g => {
    const a = asgFor(g);
    const table = a?.table_id && S.tables.find(t => t.id === a.table_id);
    const room = table && roomOfTable(table.id);
    const statusBadge = table ? `<span class="badge good">${esc(tr("gameAssignedBadge"))}</span>` : `<span class="badge warn">${esc(tr("gameOpenBadge"))}</span>`;
    const where = room && table ? `${room.name} · ${table.name}` : tr("noTableYet");
    return `<div class="manage-row playabl-game-row">
      <div class="manage-copy">
        <div class="manage-title">${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.title)}</a>` : esc(g.title)} ${statusBadge}</div>
        <div class="manage-meta">${g.provider ? `${esc(tr("hostShortLabel", { name: g.provider }))} · ` : ""}${esc(tr("personsShort", { n: g.seats }))} · ${esc(g.slotLabel || tr("noSlot"))}${g.time ? ` · ${esc(g.time)}` : ""} · ${esc(where)}</div>
      </div>
      ${g.url ? `<div class="manage-actions"><a class="btn small" href="${esc(g.url)}" target="_blank" rel="noopener">${esc(tr("openOnPlayabl"))}</a></div>` : ""}
    </div>`;
  }).join("") || `<p class="hint">${esc(tr("noPlayablGamesYet"))}</p>`;

  return `<div class="card setup-card games-manual-card">
      ${setupHeadHtml(tr("manualGamesTitle"), tr("gamesInfoAriaLabel"), tr("gamesInfoText"), "addGameBtn", tr("addGameBtn"))}
      <p class="hint setup-section-hint">${esc(tr("manualGamesHint"))}</p>
      ${manualRows}
    </div>
    <div class="card setup-card games-playabl-card">
      <div class="setup-head-title games-source-title">
        <h2>${esc(tr("playablGamesTitle"))} <span class="badge">${playablGames.length}</span></h2>
        <span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(tr("playablGamesTitle"))}" data-info-text="${esc(tr("playablGamesHint"))}">i</span>
      </div>
      <p class="hint setup-section-hint">${esc(tr("playablGamesHint"))}</p>
      <div class="playabl-games-list">${playablRows}</div>
    </div>`;
}

/* ---------------- Crew: Änderungswünsche ---------------- */
const REQ_STATUS_KEY = { offen: "statusOpen", erledigt: "statusDone", abgelehnt: "statusRejected" };
const REQ_STATUS_BADGE = { offen: "warn", erledigt: "good", abgelehnt: "muted" };
function requestContextHtml(matchedGame) {
  if (!matchedGame) return "";
  const a = asgFor(matchedGame);
  const table = a && S.tables.find(t => t.id === a.table_id);
  const room = table && roomOfTable(table.id);
  const text = room && table ? `📍 ${room.name} · ${table.name} · ${matchedGame.slotLabel}` : tr("noTableAssignedContext");
  return `<div class="req-context">${esc(text)}</div>`;
}
function wuenscheHtml() {
  const requestRow = (r, { archived = false } = {}) => {
    const matchedGame = findGameByRef(r.game_ref);
    const requestGameTitle = matchedGame ? matchedGame.title : String(r.game_ref || tr("general")).replace(/\s+\([^()]+\)\s*$/, "");
    const jumpBtn = matchedGame ? `<button type="button" class="small jumpToGameBtn" data-game="${esc(matchedGame.key)}" data-slot="${esc(matchedGame.slotKey)}" data-msg="${esc(r.message)}">${esc(tr("jumpToGameBtn"))}</button>` : "";
    return `
    <div class="request-row${archived ? " is-archived" : ""}">
      <div class="request-copy">
        <div class="manage-title">${esc(requestGameTitle)} <span class="badge ${REQ_STATUS_BADGE[r.status] || "muted"}">${esc(tr(REQ_STATUS_KEY[r.status] || r.status))}</span></div>
        <div class="rmsg">${esc(r.message)}</div>
        ${requestContextHtml(matchedGame)}
        <div class="rcontact">${r.contact ? esc(r.contact) : "—"}</div>
      </div>
      <div class="manage-actions">
        ${jumpBtn}
        ${archived ? `<button type="button" class="small reqStatus" data-id="${r.id}" data-status="offen">${esc(tr("statusOpenBtn"))}</button>` : `<button type="button" class="small reqStatus request-status-done" data-id="${r.id}" data-status="erledigt">${esc(tr("markDoneShort"))}</button><button type="button" class="small reqStatus request-status-rejected" data-id="${r.id}" data-status="abgelehnt">${esc(tr("rejectShort"))}</button>`}
      </div>
    </div>`;
  };
  const open = S.requests.filter(request => request.status === "offen");
  const processed = S.requests.filter(request => request.status !== "offen");
  const rowsHtml = open.map(request => requestRow(request)).join("") || `<p class="hint">${esc(tr("noOpenRequests"))}</p>`;
  const archiveHtml = processed.length ? `<details class="requests-archive"><summary>${esc(tr("processedRequests"))} <span class="badge muted">${processed.length}</span></summary><div>${processed.map(request => requestRow(request, { archived: true })).join("")}</div></details>` : "";
  return `<div class="card setup-card requests-card">
    <div class="setup-head-title"><h2>${esc(tr("requestsInfoTitle"))}${open.length ? ` <span class="badge warn">${open.length}</span>` : ""}</h2><span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(tr("requestsInfoAriaLabel"))}" data-info-text="${esc(tr("requestsInfoText"))}">i</span></div>
    ${rowsHtml}
    ${archiveHtml}
  </div>`;
}

/* ---------------- Crew: Crew verwalten ---------------- */
function crewVerwaltenHtml() {
  return `<div class="card setup-card crew-manage-card">
    <div class="setup-head-title"><h2>${esc(tr("crewTitle"))}</h2><span class="icon-btn info-tip-trigger" tabindex="0" role="button" aria-label="${esc(tr("crewInfoAriaLabel"))}" data-info-text="${esc(tr("crewInfoText"))}">i</span></div>
    ${S.role === "admin" ? `<form id="inviteForm" class="crew-invite-row">
      <input type="email" id="inviteEmail" aria-label="${esc(tr("inviteEmailLabel"))}" placeholder="crew@beispiel.de" required>
      <input type="hidden" id="inviteRole" value="editor">
      <button type="submit" class="primary">${esc(tr("inviteBtn"))}</button>
    </form>` : ""}
    <div id="crewList"><p class="hint">${esc(tr("loading"))}</p></div>
    <p class="msg" id="crewMsg" role="status"></p>
  </div>`;
}
async function refreshCrewList() {
  const listEl = document.getElementById("crewList");
  if (!listEl) return;
  const token = await Auth.accessToken();
  try {
    const members = await supaRpc("list_con_members", { target_con: S.con.id }, token);
    listEl.innerHTML = members.map(m => `
      <div class="manage-row">
        <div class="manage-copy"><div class="manage-title">${esc(m.email)}</div><div class="manage-meta">${esc(m.role === "admin" ? tr("roleAdmin") : tr("roleEditor"))}</div></div>
        ${S.role === "admin" ? `<span class="manage-actions">
          <select class="small roleSelect" data-uid="${m.user_id}" aria-label="${esc(tr("roleLabel"))} — ${esc(m.email)}">
            <option value="editor"${m.role === "editor" ? " selected" : ""}>${esc(tr("roleEditor"))}</option>
            <option value="admin"${m.role === "admin" ? " selected" : ""}>${esc(tr("roleAdmin"))}</option>
          </select>
          <button type="button" class="small danger removeCrewBtn" data-uid="${m.user_id}">${esc(tr("removeBtn"))}</button>
        </span>` : ""}
      </div>`).join("") || `<p class="hint">${esc(tr("noMembersFound"))}</p>`;
  } catch (err) { listEl.innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}

/* ---------------- Crew: Setup (fasst Räume/Spiele/Crew verwalten zusammen) --- */
function crewNavHtml() {
  const openRequestCount = S.requests.filter(request => request.status === "offen").length;
  return `<div class="crew-nav" role="group" aria-label="${esc(tr("crewNavAriaLabel"))}">${CREW_VIEWS.map(v =>
    `<button type="button" data-crewview="${v.key}" aria-pressed="${String(S.crewView === v.key)}"${v.key === "wuensche" && openRequestCount ? ` aria-label="${esc(tr("crewViewRequestsWithCount", { n: openRequestCount }))}"` : ""}>${esc(tr(v.nameKey))}${v.key === "wuensche" && openRequestCount ? `<span class="crew-request-count" aria-hidden="true">${openRequestCount}</span>` : ""}</button>`).join("")}</div>`;
}
function setupHtml() {
  const setupViews = SETUP_VIEWS;
  if (!setupViews.some(view => view.key === S.setupTab)) S.setupTab = "raeume";
  const subTabsHtml = `<div class="slot-tabs" role="group" aria-label="${esc(tr("setupSubTabsAriaLabel"))}">${setupViews.map(v =>
    `<button type="button" data-setuptab="${v.key}" aria-pressed="${String(S.setupTab === v.key)}">${esc(tr(v.nameKey))}</button>`).join("")}</div>`;
  const contentHtml = S.setupTab === "lageplan" ? floorPlanSetupHtml() : S.setupTab === "slots" ? slotsVerwaltenHtml() : S.setupTab === "spiele" ? spieleVerwaltenHtml() : S.setupTab === "crew" ? crewVerwaltenHtml() : raeumeVerwaltenHtml();
  return `${subTabsHtml}<div style="margin-top:var(--sp-3)">${contentHtml}</div>`;
}

function renderCrewConSwitch() {
  const host = document.getElementById("crewConSwitch");
  if (!host) return;
  const cons = (S.crewCons || []).filter(con => con.id !== S.con?.id);
  host.hidden = S.mode !== "crew" || !S.role || !cons.length;
  if (host.hidden) { host.innerHTML = ""; return; }
  host.innerHTML = `<details><summary>${esc(tr("switchCon"))}</summary><nav aria-label="${esc(tr("switchConAria"))}">${cons.map(con => `<a href="plan.html?con=${encodeURIComponent(con.slug || con.id)}&crew=1">${esc(con.name)}</a>`).join("")}</nav></details>`;
}

/* ---------------- Render-Dispatcher ---------------- */
function renderActive({ animate = true, persist = true } = {}) {
  document.body.classList.add("is-ready");
  document.body.classList.toggle("print-mode", S.mode === "print");
  renderCrewConSwitch();
  // Das Comic-Motiv hängt von der aktuellen Ansicht ab.
  if (document.documentElement.getAttribute("data-theme") === "comic") pickComicBackground();
  const viewC = document.getElementById("viewContent"), crewC = document.getElementById("crewContent");
  const printC = document.getElementById("printContent");
  // Live-Filter unterdrücken wiederholte Eingangsanimationen.
  viewC.classList.toggle("suppress-enter-animation", !animate);
  crewC.classList.toggle("suppress-enter-animation", !animate);
  document.querySelector(".app-header").hidden = S.mode === "print";
  document.getElementById("pageTitleCard").hidden = S.mode === "print";
  document.getElementById("chromeExtras").hidden = S.mode === "print";
  document.querySelector(".foot").hidden = S.mode === "print";
  document.querySelector(".credits").hidden = S.mode === "print";
  if (S.mode === "print") {
    viewC.hidden = true; crewC.hidden = true; printC.hidden = false;
    printC.innerHTML = printPageHtml();
    if (S.printMode === "lageplan") mountFloorPlanPrintView();
    return;
  }
  printC.hidden = true;
  renderKpiBar(); renderLegend(); renderNav();
  if (S.mode === "crew" && S.role) {
    viewC.hidden = true; crewC.hidden = false;
    let body;
    if (S.crewView === "zuordnen") { body = zuordnenHtml(); }
    else if (S.crewView === "setup") { body = setupHtml(); }
    else if (S.crewView === "wuensche") { body = wuenscheHtml(); }
    crewC.innerHTML = crewNavHtml() + body;
    if (S.crewView === "zuordnen") {
      wireCrewSlotScroller();
      if (S.assignMode === "dnd") wireDnd();
    }
    if (S.crewView === "setup" && S.setupTab === "crew") refreshCrewList();
    if (S.crewView === "setup" && S.setupTab === "lageplan") mountFloorPlanSetup();
  } else {
    viewC.hidden = false; crewC.hidden = true;
    if (S.view === "lageplan") viewC.innerHTML = floorPlanViewerHtml();
    else if (S.view === "tabelle") viewC.innerHTML = tabelleHtml();
    else if (S.view === "raster") viewC.innerHTML = rasterHtml();
    else viewC.innerHTML = raeumeReadHtml();
    if (S.view === "lageplan") mountFloorPlanViewer();
  }
  if (persist) persistNavigationState();
}
window.addEventListener("raumplan-theme-change", () => {
  if (S.con) renderActive({ animate: false });
});

function renderUpdate() {
  renderActive({ animate: false });
}

// Fokus und Auswahl bleiben beim Neurendern von Live-Filtern erhalten.
function renderActivePreservingFocus({ animate = false } = {}) {
  const active = document.activeElement;
  const id = active && active.id;
  const selStart = active && active.selectionStart, selEnd = active && active.selectionEnd;
  renderActive({ animate });
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.focus();
  if (selStart != null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selEnd); } catch {} }
}
