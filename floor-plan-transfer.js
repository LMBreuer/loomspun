/* Versionen, Export/Import und Wiederverwendung von Lageplänen und Räumen. */
let floorPlanMappingRequest = null;
let floorPlanCopySource = null;
let roomImportSource = null;

function floorPlanTransferDialogs() {
  let host = document.getElementById("floorPlanTransferDialogs");
  if (host) return host;
  host = document.createElement("div");
  host.id = "floorPlanTransferDialogs";
  host.innerHTML = `
    <dialog id="floorPlanVersionsDlg" class="floor-plan-dialog" aria-labelledby="floorPlanVersionsDlgTitle">
      <div class="floor-plan-dialog-head"><div><span class="floor-plan-editor-kicker">${esc(tr("floorPlanDraft"))}</span><h2 id="floorPlanVersionsDlgTitle">${esc(tr("floorPlanVersions"))}</h2></div><button type="button" class="icon-btn" data-close-floor-plan-dialog aria-label="${esc(tr("cancel"))}">×</button></div>
      <div id="floorPlanVersionsList" class="floor-plan-version-list"></div>
      <p id="floorPlanVersionsMsg" class="msg" role="status" aria-live="polite"></p>
    </dialog>
    <dialog id="floorPlanCopyDlg" class="floor-plan-dialog floor-plan-choice-dialog" aria-labelledby="floorPlanCopyDlgTitle">
      <div class="floor-plan-dialog-head"><div><span class="floor-plan-editor-kicker">${esc(tr("floorPlanCopy"))}</span><h2 id="floorPlanCopyDlgTitle">${esc(tr("floorPlanCopyTitle"))}</h2></div><button type="button" class="icon-btn" data-close-floor-plan-dialog aria-label="${esc(tr("cancel"))}">×</button></div>
      <label class="frow"><span>${esc(tr("floorPlanCopySource"))}</span><select id="floorPlanCopyConSelect"></select></label>
      <p id="floorPlanCopyMsg" class="msg" role="status" aria-live="polite"></p>
      <div class="dactions"><button type="button" data-close-floor-plan-dialog>${esc(tr("cancel"))}</button><button type="button" id="floorPlanCopyLoadBtn" class="primary">${esc(tr("floorPlanCopyLoad"))}</button></div>
    </dialog>
    <dialog id="floorPlanMappingDlg" class="floor-plan-dialog floor-plan-mapping-dialog" aria-labelledby="floorPlanMappingDlgTitle">
      <div class="floor-plan-dialog-head"><div><span class="floor-plan-editor-kicker" id="floorPlanMappingSourceName"></span><h2 id="floorPlanMappingDlgTitle">${esc(tr("floorPlanMappingTitle"))}</h2></div><button type="button" class="icon-btn" data-close-floor-plan-dialog aria-label="${esc(tr("cancel"))}">×</button></div>
      <p class="hint">${esc(tr("floorPlanMappingHint"))}</p>
      <div class="floor-plan-mapping-head"><span>${esc(tr("floorPlanMappingSource"))}</span><span>${esc(tr("floorPlanMappingTarget"))}</span></div>
      <div id="floorPlanMappingList" class="floor-plan-mapping-list"></div>
      <p id="floorPlanMappingMsg" class="msg" role="status" aria-live="polite"></p>
      <div class="dactions"><button type="button" data-close-floor-plan-dialog>${esc(tr("cancel"))}</button><button type="button" id="floorPlanMappingApplyBtn" class="primary">${esc(tr("floorPlanMappingApply"))}</button></div>
    </dialog>
    <dialog id="roomImportDlg" class="floor-plan-dialog room-import-dialog" aria-labelledby="roomImportDlgTitle">
      <div class="floor-plan-dialog-head"><div><span class="floor-plan-editor-kicker">${esc(tr("roomsImport"))}</span><h2 id="roomImportDlgTitle">${esc(tr("roomsImportTitle"))}</h2></div><button type="button" class="icon-btn" data-close-floor-plan-dialog aria-label="${esc(tr("cancel"))}">×</button></div>
      <p class="hint">${esc(tr("roomsImportHint"))}</p>
      <label class="frow"><span>${esc(tr("roomsImportSource"))}</span><select id="roomImportConSelect"></select></label>
      <div id="roomImportSelection" class="room-import-selection"></div>
      <label id="roomImportFloorPlanRow" class="toggle-row room-import-floor-plan" hidden><input id="roomImportFloorPlan" type="checkbox"> <span>${esc(tr("roomsImportFloorPlan"))}</span></label>
      <p id="roomImportMsg" class="msg" role="status" aria-live="polite"></p>
      <div class="dactions"><button type="button" data-close-floor-plan-dialog>${esc(tr("cancel"))}</button><button type="button" id="roomImportApplyBtn" class="primary" disabled>${esc(tr("roomsImportApply"))}</button></div>
    </dialog>`;
  document.body.appendChild(host);
  host.addEventListener("click", event => {
    if (event.target.closest("[data-close-floor-plan-dialog]")) event.target.closest("dialog")?.close();
  });
  document.getElementById("floorPlanCopyLoadBtn").addEventListener("click", loadFloorPlanCopySelection);
  document.getElementById("floorPlanMappingApplyBtn").addEventListener("click", applyFloorPlanMappingSelection);
  document.getElementById("roomImportConSelect").addEventListener("change", event => loadRoomImportSelection(event.target.value));
  document.getElementById("roomImportSelection").addEventListener("change", updateRoomImportApplyState);
  document.getElementById("roomImportSelection").addEventListener("click", event => {
    if (!event.target.closest("[data-room-import-all]")) return;
    document.querySelectorAll("[data-room-import-id]").forEach(input => { input.checked = true; });
    updateRoomImportApplyState();
  });
  document.getElementById("roomImportApplyBtn").addEventListener("click", applyRoomImport);
  return host;
}

function floorPlanTransferFilename() {
  const name = String(S.con?.name || "lageplan").normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${name || "lageplan"}-export.json`;
}

function floorPlanExportRoom(room) {
  const marker = validRoomMarker(room.marker) ? room.marker : ROOM_MARKERS[Math.max(0, S.rooms.indexOf(room)) % ROOM_MARKERS.length];
  return { id: room.id, name: room.name, floor: room.floor || "", color: room.color || null, marker: room.marker || null, resolvedColor: floorPlanRoomColor(room), resolvedMarker: marker };
}

async function exportFloorPlanDocument() {
  if (floorPlanCanvas) await saveFloorPlanNow();
  const documentValue = normalizeFloorPlanDocument(S.floorPlanDraft?.document);
  const linkedIds = new Set(documentValue.floors.flatMap(floor => floor.objects.filter(object => object.type === "room" && object.roomId).map(object => object.roomId)));
  const payload = {
    type: "con-floor-plan",
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { conId: S.con.id, name: S.con.name },
    document: documentValue,
    rooms: S.rooms.filter(room => linkedIds.has(room.id)).map(floorPlanExportRoom),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = floorPlanTransferFilename(); link.hidden = true;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFloorPlanDocument() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2.5 * 1024 * 1024) throw new Error(tr("floorPlanImportTooLarge"));
        const payload = JSON.parse(await file.text());
      if (payload?.type !== "con-floor-plan" || payload.exportVersion !== 1 || !payload.document || !Array.isArray(payload.rooms)) throw new Error(tr("floorPlanImportInvalid"));
      openFloorPlanMappingDialog({ document: payload.document, rooms: payload.rooms, sourceName: payload.source?.name || file.name });
    } catch (error) {
      alert(error.message === tr("floorPlanImportInvalid") ? error.message : tr("floorPlanActionFailed", { err: error.message }));
    }
  }, { once: true });
  input.click();
}

function normalizeRoomMatch(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replaceAll("ß", "ss").replace(/[^a-z0-9]+/g, " ").trim();
}

function suggestFloorPlanRoomMapping(sourceRooms) {
  const used = new Set();
  const result = new Map();
  sourceRooms.forEach(source => {
    const name = normalizeRoomMatch(source.name);
    const floor = normalizeRoomMatch(source.floor);
    let target = S.rooms.find(room => !used.has(room.id) && normalizeRoomMatch(room.name) === name && normalizeRoomMatch(room.floor) === floor);
    target ||= S.rooms.find(room => !used.has(room.id) && normalizeRoomMatch(room.name) === name);
    if (target) used.add(target.id);
    result.set(source.id, target?.id || "");
  });
  return result;
}

function sourceRoomsForDocument(documentValue, rooms) {
  const sourceById = new Map((rooms || []).map(room => [String(room.id), { ...room, id: String(room.id) }]));
  normalizeFloorPlanDocument(documentValue).floors.forEach(floor => floor.objects.forEach(object => {
    if (object.type !== "room" || !object.roomId || sourceById.has(object.roomId)) return;
    sourceById.set(object.roomId, { id: object.roomId, name: object.fallbackLabel || tr("floorPlanUnlinkedRoom"), floor: object.customLocation || "", resolvedColor: object.customColor, resolvedMarker: object.customMarker });
  }));
  return [...sourceById.values()];
}

function openFloorPlanMappingDialog(request) {
  floorPlanTransferDialogs();
  const documentValue = normalizeFloorPlanDocument(request.document);
  const rooms = sourceRoomsForDocument(documentValue, request.rooms);
  const suggestions = request.fixedMapping || suggestFloorPlanRoomMapping(rooms);
  floorPlanMappingRequest = { ...request, document: documentValue, rooms };
  document.getElementById("floorPlanMappingSourceName").textContent = request.sourceName || tr("floorPlanImport");
  document.getElementById("floorPlanMappingMsg").textContent = "";
  document.getElementById("floorPlanMappingList").innerHTML = rooms.length ? rooms.map(room => {
    const suggestion = suggestions instanceof Map ? suggestions.get(room.id) : suggestions?.[room.id];
    const options = S.rooms.map(target => `<option value="${esc(target.id)}"${target.id === suggestion ? " selected" : ""}>${esc(target.name)}${target.floor ? ` · ${esc(target.floor)}` : ""}</option>`).join("");
    return `<div class="floor-plan-mapping-row"><div><strong>${esc(room.name || tr("floorPlanUnlinkedRoom"))}</strong><span>${esc(room.floor || "—")}</span></div><label><span class="sr-only">${esc(tr("floorPlanMappingTarget"))}</span><select data-floor-plan-map-room="${esc(room.id)}"><option value="">${esc(tr("floorPlanMappingFree"))}</option>${options}</select>${suggestion ? `<small>✓ ${esc(tr("floorPlanMappingAutomatic"))}</small>` : ""}</label></div>`;
  }).join("") : `<p class="hint">${esc(tr("floorPlanNoRooms"))}</p>`;
  document.getElementById("floorPlanCopyDlg")?.close();
  document.getElementById("floorPlanMappingDlg").showModal();
}

function remapFloorPlanDocument(documentValue, sourceRooms, mapping) {
  const sourceById = new Map(sourceRooms.map(room => [String(room.id), room]));
  const targetById = new Map(S.rooms.map(room => [room.id, room]));
  const result = structuredClone(normalizeFloorPlanDocument(documentValue));
  result.floors.forEach(floor => floor.objects.forEach(object => {
    if (object.type !== "room" || !object.roomId) return;
    const source = sourceById.get(object.roomId) || {};
    const targetId = mapping.get(object.roomId) || "";
    const target = targetById.get(targetId);
    if (target) {
      object.roomId = target.id;
      object.fallbackLabel = target.name;
      return;
    }
    object.roomId = null;
    object.fallbackLabel = source.name || object.fallbackLabel || tr("floorPlanUnlinkedRoom");
    object.customLocation = source.floor || object.customLocation || "";
    object.customColor = source.resolvedColor || source.color || object.customColor || "#64748b";
    object.customMarker = source.resolvedMarker || source.marker || object.customMarker || "square";
  }));
  return normalizeFloorPlanDocument(result);
}

async function replaceFloorPlanDraft(documentValue) {
  if (floorPlanCanvas) await saveFloorPlanNow();
  const keepExternalSource = floorPlanExternalEnabled() && !!floorPlanUrl();
  const normalized = normalizeFloorPlanDocument(documentValue);
  const revision = Number(await S.store.replaceFloorPlanDocument(normalized, Number(S.floorPlanDraft?.revision || 0)));
  if (keepExternalSource) await S.store.setFloorPlanSource("both", S.con.floor_plan_url);
  S.floorPlanDraft = { ...S.floorPlanDraft, document: normalized, revision, updated_at: new Date().toISOString() };
  S.floorPlanEditorFloorId = normalized.floors[0]?.id || null;
  S.con.floor_plan_mode = keepExternalSource ? "both" : "editor";
  return revision;
}

async function applyFloorPlanMappingSelection() {
  if (!floorPlanMappingRequest) return;
  const button = document.getElementById("floorPlanMappingApplyBtn");
  const msg = document.getElementById("floorPlanMappingMsg");
  button.disabled = true; msg.className = "msg"; msg.textContent = tr("floorPlanSaving");
  try {
    const mapping = new Map([...document.querySelectorAll("[data-floor-plan-map-room]")].map(select => [select.dataset.floorPlanMapRoom, select.value]));
    const documentValue = remapFloorPlanDocument(floorPlanMappingRequest.document, floorPlanMappingRequest.rooms, mapping);
    await replaceFloorPlanDraft(documentValue);
    msg.className = "msg ok"; msg.textContent = tr("floorPlanReplaceDone");
    document.getElementById("floorPlanMappingDlg").close();
    renderActive({ animate: false });
  } catch (error) {
    msg.className = "msg err"; msg.textContent = floorPlanSaveErrorMessage(error);
  } finally { button.disabled = false; }
}

async function openFloorPlanCopyDialog() {
  floorPlanTransferDialogs();
  const dialog = document.getElementById("floorPlanCopyDlg");
  const select = document.getElementById("floorPlanCopyConSelect");
  const msg = document.getElementById("floorPlanCopyMsg");
  msg.textContent = tr("loading"); select.innerHTML = `<option value="">${esc(tr("floorPlanCopyChoose"))}</option>`;
  dialog.showModal();
  try {
    const cons = await S.store.listReuseCons();
    select.innerHTML = `<option value="">${esc(tr("floorPlanCopyChoose"))}</option>${cons.map(con => `<option value="${esc(con.id)}">${esc(con.name)}</option>`).join("")}`;
    msg.textContent = "";
  } catch (error) { msg.className = "msg err"; msg.textContent = tr("floorPlanActionFailed", { err: error.message }); }
}

async function loadFloorPlanCopySelection() {
  const sourceConId = document.getElementById("floorPlanCopyConSelect").value;
  const msg = document.getElementById("floorPlanCopyMsg");
  if (!sourceConId) return;
  msg.className = "msg"; msg.textContent = tr("loading");
  try {
    floorPlanCopySource = await S.store.loadReuseCon(sourceConId);
    if (!floorPlanCopySource.floorPlan?.document) throw new Error(tr("floorPlanCopyNoPlan"));
    openFloorPlanMappingDialog({ document: floorPlanCopySource.floorPlan.document, rooms: floorPlanCopySource.rooms, sourceName: floorPlanCopySource.con?.name || tr("floorPlanCopy") });
  } catch (error) { msg.className = "msg err"; msg.textContent = error.message; }
}

function floorPlanVersionLabel(kind) {
  return tr(kind === "published" ? "floorPlanVersionPublished" : kind === "safety" ? "floorPlanVersionSafety" : "floorPlanVersionAuto");
}

async function openFloorPlanVersionsDialog() {
  floorPlanTransferDialogs();
  const dialog = document.getElementById("floorPlanVersionsDlg");
  const list = document.getElementById("floorPlanVersionsList");
  const msg = document.getElementById("floorPlanVersionsMsg");
  list.innerHTML = `<p class="hint">${esc(tr("loading"))}</p>`; msg.textContent = ""; dialog.showModal();
  try {
    const versions = await S.store.listFloorPlanVersions();
    list.innerHTML = versions.length ? versions.map(version => {
      const documentValue = normalizeFloorPlanDocument(version.document);
      const floor = documentValue.floors[0];
      const date = new Date(version.created_at).toLocaleString(LANG === "en" ? "en-GB" : "de-AT", { dateStyle: "medium", timeStyle: "short" });
      return `<article class="floor-plan-version-card"><div class="floor-plan-version-preview">${floorPlanSvgHtml(documentValue, floor)}</div><div class="floor-plan-version-copy"><span class="badge">${esc(floorPlanVersionLabel(version.kind))}</span><strong>${esc(documentValue.title || S.con.name)}</strong><span>${esc(date)} · Rev. ${esc(version.source_revision)} · ${esc(String(documentValue.floors.length))} ${esc(tr("floorPlanFloor"))}</span></div><button type="button" class="small" data-restore-floor-plan-version="${esc(version.id)}">${esc(tr("floorPlanVersionRestore"))}</button></article>`;
    }).join("") : `<p class="hint">${esc(tr("floorPlanVersionEmpty"))}</p>`;
    list.querySelectorAll("[data-restore-floor-plan-version]").forEach(button => button.addEventListener("click", () => restoreFloorPlanVersion(button.dataset.restoreFloorPlanVersion)));
  } catch (error) { list.innerHTML = ""; msg.className = "msg err"; msg.textContent = tr("floorPlanActionFailed", { err: error.message }); }
}

async function restoreFloorPlanVersion(versionId) {
  if (!confirm(tr("floorPlanVersionRestoreConfirm"))) return;
  const msg = document.getElementById("floorPlanVersionsMsg");
  msg.className = "msg"; msg.textContent = tr("floorPlanSaving");
  try {
    if (floorPlanCanvas) await saveFloorPlanNow();
    const restored = await S.store.restoreFloorPlanVersion(versionId, Number(S.floorPlanDraft.revision));
    const documentValue = normalizeFloorPlanDocument(restored.document);
    S.floorPlanDraft = { ...S.floorPlanDraft, document: documentValue, revision: Number(restored.revision), updated_at: new Date().toISOString() };
    S.floorPlanEditorFloorId = documentValue.floors[0]?.id || null;
    document.getElementById("floorPlanVersionsDlg").close();
    renderActive({ animate: false });
  } catch (error) { msg.className = "msg err"; msg.textContent = floorPlanSaveErrorMessage(error); }
}

async function openRoomImportDialog() {
  floorPlanTransferDialogs();
  const dialog = document.getElementById("roomImportDlg");
  const select = document.getElementById("roomImportConSelect");
  document.getElementById("roomImportSelection").innerHTML = "";
  document.getElementById("roomImportFloorPlanRow").hidden = true;
  document.getElementById("roomImportApplyBtn").disabled = true;
  const msg = document.getElementById("roomImportMsg");
  msg.className = "msg"; msg.textContent = tr("loading");
  select.innerHTML = `<option value="">${esc(tr("floorPlanCopyChoose"))}</option>`;
  dialog.showModal();
  try {
    const cons = await S.store.listReuseCons();
    select.innerHTML = `<option value="">${esc(tr("floorPlanCopyChoose"))}</option>${cons.map(con => `<option value="${esc(con.id)}">${esc(con.name)}</option>`).join("")}`;
    msg.textContent = "";
  } catch (error) { msg.className = "msg err"; msg.textContent = tr("floorPlanActionFailed", { err: error.message }); }
}

async function loadRoomImportSelection(sourceConId) {
  if (!sourceConId) return;
  const list = document.getElementById("roomImportSelection");
  const msg = document.getElementById("roomImportMsg");
  list.innerHTML = `<p class="hint">${esc(tr("loading"))}</p>`; msg.textContent = "";
  try {
    roomImportSource = await S.store.loadReuseCon(sourceConId);
    list.innerHTML = roomImportSource.rooms.length ? `<div class="room-import-selection-head"><strong>${esc(tr("roomsImportSelection"))}</strong><button type="button" class="small" data-room-import-all>${esc(tr("roomsImportAll"))}</button></div>${roomImportSource.rooms.map(room => {
      const tables = roomImportSource.tables.filter(table => table.room_id === room.id);
      const tableCount = tables.length === 1 ? (LANG === "en" ? "1 table" : "1 Tisch") : tr("tableCountLabel", { n: tables.length });
      return `<label class="room-import-choice"><input type="checkbox" data-room-import-id="${esc(room.id)}" checked><span><strong>${esc(room.name)}</strong><small>${esc(room.floor || "—")} · ${esc(tableCount)}</small></span></label>`;
    }).join("")}` : `<p class="hint">${esc(tr("roomsImportNoRooms"))}</p>`;
    const floorPlanRow = document.getElementById("roomImportFloorPlanRow");
    floorPlanRow.hidden = !roomImportSource.floorPlan?.document;
    document.getElementById("roomImportFloorPlan").checked = Boolean(roomImportSource.floorPlan?.document);
    updateRoomImportApplyState();
  } catch (error) { list.innerHTML = ""; msg.className = "msg err"; msg.textContent = tr("floorPlanActionFailed", { err: error.message }); }
}

function updateRoomImportApplyState() {
  const selected = document.querySelectorAll("[data-room-import-id]:checked").length;
  document.getElementById("roomImportApplyBtn").disabled = !roomImportSource || !selected;
}

async function applyRoomImport() {
  const selectedIds = [...document.querySelectorAll("[data-room-import-id]:checked")].map(input => input.dataset.roomImportId);
  if (!roomImportSource || !selectedIds.length) return;
  const button = document.getElementById("roomImportApplyBtn");
  const msg = document.getElementById("roomImportMsg");
  const includeFloorPlan = !document.getElementById("roomImportFloorPlanRow").hidden && document.getElementById("roomImportFloorPlan").checked;
  let imported = null;
  button.disabled = true; msg.className = "msg"; msg.textContent = tr("floorPlanSaving");
  try {
    imported = await S.store.importRoomsFromCon(roomImportSource.con.id, selectedIds);
    S.rooms.push(...(imported.rooms || []));
    S.tables.push(...(imported.tables || []));
    S.roomFeatureTags.push(...(imported.roomFeatureTags || []));
    S.rooms.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    S.tables.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    if (includeFloorPlan && roomImportSource.floorPlan?.document) {
      const mapping = new Map((imported.roomMapping || []).map(item => [String(item.sourceRoomId), String(item.targetRoomId)]));
      const documentValue = remapFloorPlanDocument(roomImportSource.floorPlan.document, roomImportSource.rooms, mapping);
      await replaceFloorPlanDraft(documentValue);
    }
    msg.className = "msg ok";
    msg.textContent = tr("roomsImportDone", { rooms: imported.rooms?.length || 0, tables: imported.tables?.length || 0 });
    setTimeout(() => { document.getElementById("roomImportDlg")?.close(); renderActive({ animate: false }); }, 450);
  } catch (error) {
    msg.className = "msg err";
    if (imported) {
      msg.textContent = tr("roomsImportPlanFailed", { err: floorPlanSaveErrorMessage(error) });
      setTimeout(() => { document.getElementById("roomImportDlg")?.close(); renderActive({ animate: false }); }, 2200);
    } else {
      msg.textContent = floorPlanSaveErrorMessage(error);
      button.disabled = false;
    }
  }
}

function wireFloorPlanTransferControls() {
  floorPlanTransferDialogs();
  document.getElementById("floorPlanVersionsBtn")?.addEventListener("click", openFloorPlanVersionsDialog);
  const closeMenu = () => document.querySelector(".floor-plan-more-menu")?.removeAttribute("open");
  document.getElementById("floorPlanExportBtn")?.addEventListener("click", () => { closeMenu(); exportFloorPlanDocument().catch(error => alert(tr("floorPlanActionFailed", { err: error.message }))); });
  document.getElementById("floorPlanImportBtn")?.addEventListener("click", () => { closeMenu(); importFloorPlanDocument(); });
  document.getElementById("floorPlanCopyBtn")?.addEventListener("click", () => { closeMenu(); openFloorPlanCopyDialog(); });
}
