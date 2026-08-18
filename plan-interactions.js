/* ---------------- Drag & Drop (nur Zuordnen) ---------------- */
function applyDragFitHighlight(gameKey) {
  const g = gameByKey(gameKey);
  if (!g) return;
  document.querySelectorAll(".tablebox[data-table]").forEach(box => {
    const table = S.tables.find(x => x.id === box.dataset.table);
    const room = table && roomOfTable(table.id);
    if (!table || !room) return;
    const fits = table.seats >= g.seats;
    const roomTags = roomTagIds(room);
    const fitsTag = (g.requiredTagIds || []).every(id => roomTags.includes(id));
    box.classList.remove("gm-full", "gm-partial", "gm-none");
    box.classList.add(fits && fitsTag ? "gm-full" : fits ? "gm-partial" : "gm-none");
  });
}
function clearDragFitHighlight() {
  document.querySelectorAll(".tablebox.gm-full, .tablebox.gm-partial, .tablebox.gm-none").forEach(box =>
    box.classList.remove("gm-full", "gm-partial", "gm-none"));
}
function wireDnd() {
  document.querySelectorAll('.chip[draggable="true"]').forEach(chip => {
    chip.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", JSON.stringify({ g: chip.dataset.game, s: chip.dataset.slot })); chip.classList.add("dragging"); applyDragFitHighlight(chip.dataset.game); });
    chip.addEventListener("dragend", () => { chip.classList.remove("dragging"); clearDragFitHighlight(); });
  });
  document.querySelectorAll(".tablebox").forEach(box => {
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("dragover"); });
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("dragover"); const d = e.dataTransfer.getData("text/plain"); if (d) { const { g, s } = JSON.parse(d); assign(g, s, box.dataset.table); } });
  });
  const un = document.getElementById("unassignedBar");
  if (un) {
    un.addEventListener("dragover", e => { e.preventDefault(); un.classList.add("dragover"); });
    un.addEventListener("dragleave", () => un.classList.remove("dragover"));
    un.addEventListener("drop", e => { e.preventDefault(); un.classList.remove("dragover"); const d = e.dataTransfer.getData("text/plain"); if (d) { const { g, s } = JSON.parse(d); assign(g, s, null); } });
  }
}

/* ---------------- Info-Tooltip: geteiltes Hover/Klick-Popover ---------------- */
function ensureInfoTipPopoverEl() {
  let el = document.getElementById("infoTipPopover");
  if (!el) {
    el = document.createElement("div");
    el.id = "infoTipPopover";
    el.className = "info-tip-popover";
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}
function showInfoTip(trigger, text) {
  const el = ensureInfoTipPopoverEl();
  // Ein Popover im <body> liegt hinter dem nativen Dialog-Top-Layer. Bei
  // Formularhinweisen wird es deshalb in den offenen Dialog verschoben.
  const host = trigger.closest("dialog[open]") || document.body;
  if (el.parentElement !== host) host.appendChild(el);
  const r = trigger.getBoundingClientRect();
  const wide = trigger.dataset.infoWide === "true";
  el.classList.toggle("is-wide", wide);
  el.style.top = `${r.bottom + 6}px`;
  el.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - (wide ? 354 : 246)))}px`;
  el.textContent = text;
  el.hidden = false;
  if (el.getBoundingClientRect().bottom > window.innerHeight - 12) {
    el.style.top = `${Math.max(12, r.top - el.offsetHeight - 6)}px`;
  }
  el.dataset.forTrigger = text;
}
function hideInfoTip() {
  const el = document.getElementById("infoTipPopover");
  if (el) { el.hidden = true; delete el.dataset.forTrigger; }
}
document.addEventListener("mouseover", e => {
  const t = e.target.closest("[data-info-text]");
  if (t && !t.contains(e.relatedTarget)) showInfoTip(t, t.dataset.infoText);
});
document.addEventListener("mouseout", e => {
  const t = e.target.closest("[data-info-text]");
  if (t && !t.contains(e.relatedTarget)) hideInfoTip();
});
document.addEventListener("focusin", e => {
  const t = e.target.closest("[data-info-text]");
  if (t) showInfoTip(t, t.dataset.infoText);
});
document.addEventListener("focusout", e => {
  const t = e.target.closest("[data-info-text]");
  if (t) hideInfoTip();
});
document.addEventListener("click", e => {
  const t = e.target.closest("[data-info-text]");
  const popover = document.getElementById("infoTipPopover");
  if (!t) { if (!e.target.closest("#infoTipPopover")) hideInfoTip(); return; }
  e.stopPropagation();
  if (popover && !popover.hidden && popover.dataset.forTrigger === t.dataset.infoText) hideInfoTip();
  else showInfoTip(t, t.dataset.infoText);
});
// Die bestehenden Info-Trigger werden an mehreren Stellen dynamisch erzeugt.
// Einige sind aus Kompatibilitätsgründen role="button"-Spans; Enter/Leertaste
// ergänzt ihre native Button-Semantik zuverlässig für Tastatur-Nutzung.
document.addEventListener("keydown", e => {
  const t = e.target.closest('[data-info-text][role="button"]');
  if (!t || !["Enter", " "].includes(e.key)) return;
  e.preventDefault();
  t.click();
});

/* ---------------- Event-Delegation ---------------- */
document.addEventListener("keydown", e => {
  if (S.assignMode !== "click" || !["Enter", " "].includes(e.key)) return;
  const chip = e.target.closest(".crew-chip[data-game]");
  if (!chip || e.target.closest("a, button, select")) return;
  e.preventDefault();
  S.selectedGame = S.selectedGame === chip.dataset.game ? null : chip.dataset.game;
  renderUpdate();
});
document.addEventListener("change", e => {
  if (e.target.matches(".assignSel")) assign(e.target.dataset.game, e.target.dataset.slot, e.target.value || null);
  else if (e.target.matches(".auto-preview-target-select")) changeAutoPreviewTarget(Number(e.target.dataset.autoJobIndex), e.target.value);
  else if (e.target.id === "showDoneChk") { S.showDoneRequests = e.target.checked; renderActive(); }
  else if (e.target.matches(".tag-add-select") && e.target.value) { tagPickerSelection.add(e.target.value); renderTagPicker(e.target.closest("[id]").id); }
  else if (e.target.matches(".filter-tag-select") && e.target.value) {
    if (!S.filterReqTags.includes(e.target.value)) S.filterReqTags = [...S.filterReqTags, e.target.value];
    renderUpdate();
  }
  else if (e.target.matches(".roleSelect")) {
    (async () => {
      try {
        const token = await Auth.accessToken();
        await supaFetch(`con_members?con_id=eq.${S.con.id}&user_id=eq.${e.target.dataset.uid}`, { method: "PATCH", headers: supaHeaders(token, true), body: JSON.stringify({ role: e.target.value }) });
        refreshCrewList();
      } catch (err) { document.getElementById("crewMsg").className = "msg err"; document.getElementById("crewMsg").textContent = err.message; }
    })();
  }
});

document.addEventListener("submit", async e => {
  if (e.target.id !== "floorPlanForm") return;
  e.preventDefault();
  const input = document.getElementById("floorPlanUrl");
  const msg = document.getElementById("floorPlanMsg");
  const value = input.value.trim();
  msg.className = "msg";
  msg.textContent = tr("savingFloorPlan");
  try {
    const mode = floorPlanModeForSources({ external: !!value, interactive: floorPlanInteractiveEnabled() });
    await S.store.saveFloorPlanUrl(value);
    S.con.floor_plan_url = value || null;
    S.con.floor_plan_mode = mode;
    floorPlanExternalEditing = false;
    renderActive();
    const updatedMsg = document.getElementById("floorPlanMsg");
    if (updatedMsg) { updatedMsg.className = "msg ok"; updatedMsg.textContent = tr("floorPlanSaved"); }
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = floorPlanSaveErrorMessage(err);
  }
});
document.addEventListener("click", async e => {
  const clickedCrewChip = e.target.closest(".crew-chip[data-game]");
  if (S.assignMode === "click" && clickedCrewChip && !e.target.closest("a, button, select")) {
    S.selectedGame = S.selectedGame === clickedCrewChip.dataset.game ? null : clickedCrewChip.dataset.game;
    renderUpdate();
    return;
  }
  // Einzelauswahl-Modus: Klick auf einen Tisch (oder die Warteschlange
  // selbst) übernimmt das aktuell ausgewählte Spiel — Ersatz fürs Dropdown.
  if (S.assignMode === "click" && S.selectedGame && !e.target.closest("button, select")) {
    const box = e.target.closest(".tablebox");
    const bar = e.target.closest("#unassignedBar");
    if (box) { const g = S.selectedGame; S.selectedGame = null; await assign(g, S.activeSlot, box.dataset.table); return; }
    if (bar) { const g = S.selectedGame; S.selectedGame = null; await assign(g, S.activeSlot, null); return; }
  }
  const t = e.target.closest("button, th[data-sort]");
  if (!t) return;
  if (t.matches(".min-seats-btn")) {
    S.minSeats = Math.max(0, S.minSeats + Number(t.dataset.dir));
    renderUpdate();
  }
  else if (t.matches(".stepper-btn")) {
    const el = document.getElementById(t.dataset.target);
    if (!el) return;
    const step = Number(t.dataset.step);
    const min = el.min !== "" ? Number(el.min) : -Infinity;
    const max = el.max !== "" ? Number(el.max) : Infinity;
    el.value = Math.min(max, Math.max(min, (parseFloat(el.value) || 0) + step));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (t.matches("[data-assignmode]")) {
    S.assignMode = t.dataset.assignmode; S.selectedGame = null;
    Prefs.set("assign-mode", S.assignMode);
    renderUpdate();
    return;
  }
  if (t.matches(".selectGameBtn")) {
    S.selectedGame = S.selectedGame === t.dataset.game ? null : t.dataset.game;
    renderUpdate();
    return;
  }
  if (t.matches("[data-page]")) {
    S.mode = t.dataset.page;
    if (S.mode === "crew" && S.crewView === "wuensche" && S.role) {
      S.requests = await S.store.listRequests().catch(() => S.requests);
    }
    renderActive();
  }
  else if (t.matches("[data-view]")) { S.mode = "view"; S.view = t.dataset.view; renderActive(); }
  else if (t.matches("[data-floor-plan-room-link]")) { jumpToFloorPlanRoom(t.dataset.floorPlanRoomLink); }
  else if (t.matches("[data-crewview]")) {
    S.mode = "crew";
    S.crewView = t.dataset.crewview;
    if (S.crewView === "wuensche" && S.role) {
      S.requests = await S.store.listRequests().catch(() => S.requests);
    }
    renderActive();
  }
  else if (t.matches("[data-setuptab]")) {
    S.setupTab = t.dataset.setuptab; renderActive();
  }
  else if (t.matches("[data-slot-scroll]")) {
    const scroller = t.closest(".crew-slot-scroller")?.querySelector(".local-slot-tabs");
    if (scroller) scroller.scrollBy({ left: Number(t.dataset.slotScroll) * Math.max(220, scroller.clientWidth * .72), behavior: "smooth" });
  }
  else if (t.matches(".local-slot-tabs button[data-slot]")) { S.activeSlot = t.dataset.slot; renderUpdate(); }
  else if (t.matches(".unassignBtn")) assign(t.dataset.game, t.dataset.slot, null);
  else if (t.matches(".delGameBtn")) {
    if (!confirm(tr("confirmDeleteGame"))) return;
    await S.store.deleteGame(t.dataset.id);
    S.dbGames = S.dbGames.filter(g => g.id !== t.dataset.id);
    S.assignments = S.assignments.filter(a => a.game_id !== t.dataset.id);
    gamesFromDb();
    renderActive();
  }
  else if (t.matches(".editGameBtn")) openGameDlg(S.dbGames.find(g => g.id === t.dataset.id));
  else if (t.id === "addGameBtn") openGameDlg(null);
  else if (t.matches(".addToActiveSlotBtn")) assign(t.dataset.game, S.activeSlot, null);
  else if (t.matches(".requestBtn")) openRequestDlg(t.dataset.game);
  else if (t.id === "printBtn") {
    S.printMode = S.view === "lageplan" ? "lageplan" : S.view === "raster" ? "raster" : S.view === "tabelle" ? "tabelle" : "raeume";
    S.printReturnMode = S.mode; S.printReturnView = S.view;
    S.mode = "print"; renderActive();
  }
  else if (t.id === "printBackLink") { S.mode = S.printReturnMode || "view"; S.view = S.printReturnView || S.view; renderActive(); }
  else if (t.matches("[data-printmode]")) { S.printMode = t.dataset.printmode; renderActive(); }
  else if (t.matches("[data-printaxis]")) { S.printAxis = t.dataset.printaxis; renderActive(); }
  else if (t.matches("[data-printslot]")) { S.printSlot = t.dataset.printslot; renderActive(); }
  else if (t.matches("[data-printdetail]")) { S.printDetail = t.dataset.printdetail; renderActive(); }
  else if (t.matches("[data-printorientation]")) { S.printOrientation = t.dataset.printorientation; renderActive(); }
  else if (t.matches("[data-printcolor]")) { S.printColor = t.dataset.printcolor; renderActive(); }
  else if (t.id === "doPrintBtn") {
    document.documentElement.classList.toggle("print-bw", S.printColor !== "color");
    const orientation = S.printMode === "lageplan"
      ? (activeFloorPlanDocument()?.orientation || "landscape")
      : S.printOrientation === "auto" ? (S.printMode === "raster" ? "landscape" : "portrait") : S.printOrientation;
    let styleEl = document.getElementById("printOrientationStyle");
    if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "printOrientationStyle"; document.head.appendChild(styleEl); }
    styleEl.textContent = `@media print { @page { size: ${orientation}; } }`;
    window.print();
  }
  else if (t.matches("[data-axis]")) { S.rasterAxis = t.dataset.axis; renderActive(); }
  else if (t.id === "flipAxisBtn") { S.rasterAxis = S.rasterAxis === "slots" ? "rooms" : "slots"; renderActive(); }
  else if (t.matches(".filter-tag-remove")) {
    S.filterReqTags = S.filterReqTags.filter(id => id !== t.dataset.tagId);
    renderUpdate();
  }
  else if (t.id === "crewDetailsToggle") { S.crewShowDetails = !S.crewShowDetails; renderUpdate(); }
  else if (t.matches(".room-row-toggle")) {
    const id = t.dataset.roomToggle;
    if (S.expandedRoomIds.has(id)) S.expandedRoomIds.delete(id); else S.expandedRoomIds.add(id);
    renderActive();
  }
  else if (t.id === "addRoomBtn") openRoomDlg(null);
  else if (t.id === "roomImportBtn") openRoomImportDialog();
  else if (t.matches(".editRoomBtn")) openRoomDlg(S.rooms.find(r => r.id === t.dataset.id));
  else if (t.matches(".delRoomBtn")) {
    if (!confirm(tr("confirmDeleteRoom"))) return;
    await S.store.deleteRoom(t.dataset.id);
    const tids = S.tables.filter(x => x.room_id === t.dataset.id).map(x => x.id);
    S.rooms = S.rooms.filter(r => r.id !== t.dataset.id);
    S.tables = S.tables.filter(x => x.room_id !== t.dataset.id);
    S.assignments = S.assignments.filter(a => !tids.includes(a.table_id));
    renderActive();
  }
  else if (t.matches(".addTableBtn")) openTableDlg(null, t.dataset.room);
  else if (t.matches(".editTableBtn")) { const tb = S.tables.find(x => x.id === t.dataset.id); openTableDlg(tb, tb.room_id); }
  else if (t.matches(".delTableBtn")) {
    if (!confirm(tr("confirmDeleteTable"))) return;
    await S.store.deleteTable(t.dataset.id);
    S.tables = S.tables.filter(x => x.id !== t.dataset.id);
    S.assignments = S.assignments.map(a => a.table_id === t.dataset.id ? { ...a, table_id: null } : a).filter(a => a.table_id || a.session_key.startsWith("manual:"));
    renderActive();
  }
  else if (t.id === "autoBtn") openAutoAssignPreview();
  else if (t.id === "autoPreviewApplyBtn") applyPendingAutoAssignJobs();
  else if (t.id === "clearSlotBtn") openClearSlotDialog();
  else if (t.id === "clearSlotConfirmBtn") clearActiveSlotAssignments();
  else if (t.id === "pinnedBannerCloseBtn") { S.pinnedRequest = null; renderActive(); }
  else if (t.matches(".jumpToGameBtn")) jumpToGameInZuordnen(t.dataset.game, t.dataset.slot, t.dataset.msg);
  else if (t.id === "addSlotBtn") openSlotDlg(null);
  else if (t.id === "editSlotBtn") openSlotDlg(S.slots.find(s => s.key === S.activeSlot));
  else if (t.matches(".editSlotRowBtn")) openSlotDlg(S.slots.find(s => s.id === t.dataset.id));
  else if (t.id === "addBucketBtn") openBucketDlg(null);
  else if (t.matches(".editBucketBtn")) openBucketDlg(S.slotBuckets.find(b => b.id === t.dataset.id));
  else if (t.matches(".tag-remove")) { tagPickerSelection.delete(t.dataset.tagId); renderTagPicker(t.closest("[id]").id); }
  else if (t.matches(".reqStatus")) { await S.store.updateRequest(t.dataset.id, { status: t.dataset.status }); S.requests.find(r => r.id === t.dataset.id).status = t.dataset.status; renderActive(); }
  else if (t.matches(".removeCrewBtn")) {
    if (!confirm(tr("confirmRemoveCrew"))) return;
    try {
      const token = await Auth.accessToken();
      await supaFetch(`con_members?con_id=eq.${S.con.id}&user_id=eq.${t.dataset.uid}`, { method: "DELETE", headers: supaHeaders(token) });
      refreshCrewList();
    } catch (err) { document.getElementById("crewMsg").className = "msg err"; document.getElementById("crewMsg").textContent = err.message; }
  }
  else if (t.matches("th[data-sort]")) {
    const key = t.dataset.sort;
    S.tableSort = { key, dir: S.tableSort.key === key ? -S.tableSort.dir : 1 };
    renderActive();
  }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "inviteForm") return;
  e.preventDefault();
  const email = document.getElementById("inviteEmail").value.trim();
  const role = document.getElementById("inviteRole").value;
  const msg = document.getElementById("crewMsg");
  msg.className = "msg";
  try {
    await inviteMember(S.con.id, email, role);
    msg.className = "msg ok"; msg.textContent = tr("inviteSent", { email });
    document.getElementById("inviteEmail").value = "";
    refreshCrewList();
  } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
});
document.addEventListener("focusout", async e => {
  if (e.target.matches(".reqNote")) { await S.store.updateRequest(e.target.dataset.id, { orga_notiz: e.target.value }); S.requests.find(r => r.id === e.target.dataset.id).orga_notiz = e.target.value; }
});
document.getElementById("globalSearch").addEventListener("input", e => {
  S.search = e.target.value.trim().toLowerCase();
  renderActive({ animate: false });
});
document.addEventListener("input", e => {
  if (e.target.id !== "crewGameSearch") return;
  S.crewSearch = e.target.value;
  renderActivePreservingFocus();
});
