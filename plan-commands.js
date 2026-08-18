/* ---------------- Aktionen ---------------- */
async function assign(gameKey, slotKey, tableId) {
  const g = gameByKey(gameKey);
  const a = { slot_key: slotKey, session_key: gameKey, table_id: tableId || null };
  if (g.manual) a.game_id = g.dbId;
  try {
    if (!tableId && !g.manual) {
      await S.store.deleteAssignment(slotKey, gameKey);
      S.assignments = S.assignments.filter(x => !(x.slot_key === slotKey && x.session_key === gameKey));
    } else {
      await S.store.upsertAssignment(a);
      const ex = S.assignments.find(x => x.slot_key === slotKey && x.session_key === gameKey);
      if (ex) { ex.table_id = a.table_id; if (a.game_id) ex.game_id = a.game_id; }
      else S.assignments.push(a);
      // Manuelle Spiele übernehmen beim Verschieben den neuen Slot.
      if (g.manual && g.slotKey !== slotKey) {
        g.slotKey = slotKey;
        g.slotLabel = S.slots.find(s => s.key === slotKey)?.label || slotKey;
      }
    }
    renderUpdate();
    // Sichtbares Feedback nur bei einer Tischzuweisung.
    if (tableId) {
      const box = document.querySelector(`.tablebox[data-table="${tableId}"]`);
      if (box) {
        box.classList.add("just-assigned");
        setTimeout(() => box.classList.remove("just-assigned"), 650);
      }
    }
  } catch (e) { alert(tr("saveFailed", { err: e.message })); }
}

function autoAssignReqLabels(g) {
  return (g.requiredTagIds || [])
    .map(id => S.featureTags.find(f => f.id === id)?.label)
    .filter(Boolean);
}

function autoAssignCapacityNote(g, table) {
  return table.seats >= g.seats
    ? tr("autoReasonCapacityFits", { tableSeats: table.seats, gameSeats: g.seats })
    : tr("autoReasonCapacityShort", { n: g.seats - table.seats, tableSeats: table.seats, gameSeats: g.seats });
}

function computeAutoAssignJobs() {
  const slot = S.activeSlot;
  const freeTables = () => S.tables.filter(t => !S.assignments.some(a => a.slot_key === slot && a.table_id === t.id));
  const un = bySlot(slot).filter(g => { const a = asgFor(g); return !a || !a.table_id; });
  const prevOf = g => S.assignments.find(x => x.slot_key !== slot && gameByKey(x.session_key)?.gameId === g.gameId && x.table_id);
  const regular = un.filter(g => !g.ws).sort((a, b) => (prevOf(b) ? 1 : 0) - (prevOf(a) ? 1 : 0) || b.seats - a.seats);
  const workshops = un.filter(g => g.ws);
  const jobs = [];
  for (const g of regular) {
    const prev = prevOf(g);
    let target = null;
    let reason = "";
    if (prev) {
      const t = S.tables.find(t => t.id === prev.table_id);
      if (t && t.seats >= g.seats && !S.assignments.some(a => a.slot_key === slot && a.table_id === t.id) && !jobs.some(j => j.tableId === t.id)) {
        target = t;
        reason = `${tr("autoReasonPreviousTable")} ${autoAssignCapacityNote(g, t)}`;
        const reqLabels = autoAssignReqLabels(g);
        if (reqLabels.length) {
          const room = roomOfTable(t.id);
          const missingLabels = (g.requiredTagIds || [])
            .filter(id => !roomTagIds(room).includes(id))
            .map(id => S.featureTags.find(f => f.id === id)?.label)
            .filter(Boolean);
          reason += missingLabels.length
            ? ` ${tr("autoReasonPreviousRequirementsWarning", { tags: missingLabels.join(", ") })}`
            : ` ${tr("autoReasonRequirementsMatch", { tags: reqLabels.join(", ") })}`;
        }
      }
    }
    if (!target) {
      const candidates = freeTables().filter(t => t.seats >= g.seats && !jobs.some(j => j.tableId === t.id)).sort((a, b) => a.seats - b.seats);
      // Anforderungen bevorzugen, aber nicht erzwingen.
      const matching = g.requiredTagIds?.length ? candidates.filter(t => roomSatisfiesTags(roomOfTable(t.id), g.requiredTagIds)) : candidates;
      target = (matching[0] || candidates[0] || null);
      if (target) {
        const reqLabels = autoAssignReqLabels(g);
        if (reqLabels.length && matching.includes(target)) {
          reason = `${tr("autoReasonRequirementsMatch", { tags: reqLabels.join(", ") })} ${tr("autoReasonSmallestFit")} ${autoAssignCapacityNote(g, target)}`;
        } else if (reqLabels.length) {
          const room = roomOfTable(target.id);
          const missingLabels = (g.requiredTagIds || [])
            .filter(id => !roomTagIds(room).includes(id))
            .map(id => S.featureTags.find(f => f.id === id)?.label)
            .filter(Boolean);
          reason = `${tr("autoReasonRequirementsFallback", { tags: missingLabels.join(", ") || reqLabels.join(", ") })} ${tr("autoReasonSmallestFit")} ${autoAssignCapacityNote(g, target)}`;
        } else {
          reason = `${tr("autoReasonSmallestFit")} ${autoAssignCapacityNote(g, target)}`;
        }
      }
    }
    if (target) jobs.push({ gameKey: g.key, tableId: target.id, reason });
  }
  for (const g of workshops) {
    const candidates = freeTables().filter(t => !jobs.some(j => j.tableId === t.id)).sort((a, b) => b.seats - a.seats);
    // Die Workshop-Heuristik greift nur ohne explizite Anforderungen.
    const roomOk = g.requiredTagIds?.length
      ? candidates.filter(t => roomSatisfiesTags(roomOfTable(t.id), g.requiredTagIds))
      : candidates.filter(t => { const r = roomOfTable(t.id); return r && (roomHasTagKey(r, "bewegung") || roomHasTagKey(r, "laut_ok")); });
    const target = (roomOk[0] || candidates.find(t => t.seats >= g.seats) || null);
    if (target) {
      const reqLabels = autoAssignReqLabels(g);
      let reason;
      if (reqLabels.length && roomOk.includes(target)) {
        reason = `${tr("autoReasonWorkshopRequirements", { tags: reqLabels.join(", ") })} ${autoAssignCapacityNote(g, target)}`;
      } else if (!reqLabels.length && roomOk.includes(target)) {
        reason = `${tr("autoReasonWorkshopFeatures")} ${autoAssignCapacityNote(g, target)}`;
      } else {
        reason = `${tr("autoReasonWorkshopFallback")} ${autoAssignCapacityNote(g, target)}`;
      }
      jobs.push({ gameKey: g.key, tableId: target.id, reason });
    }
  }
  return { jobs, totalUnassigned: un.length };
}

let pendingAutoAssignJobs = null;

function autoPreviewAvailableTables() {
  return S.tables
    .filter(t => !S.assignments.some(a => a.slot_key === S.activeSlot && a.table_id === t.id))
    .sort((a, b) => {
      const ar = roomOfTable(a.id), br = roomOfTable(b.id);
      return (ar?.sort || 0) - (br?.sort || 0)
        || (ar?.name || "").localeCompare(br?.name || "", LANG)
        || (a.sort || 0) - (b.sort || 0)
        || a.name.localeCompare(b.name, LANG);
    });
}

function manualAutoAssignReason(g, table, { swapped = false } = {}) {
  const room = roomOfTable(table.id);
  const reqLabels = autoAssignReqLabels(g);
  const missingLabels = (g.requiredTagIds || [])
    .filter(id => !roomTagIds(room).includes(id))
    .map(id => S.featureTags.find(f => f.id === id)?.label)
    .filter(Boolean);
  const reqNote = !reqLabels.length
    ? ""
    : missingLabels.length
      ? ` ${tr("autoReasonManualRequirementsMissing", { tags: missingLabels.join(", ") })}`
      : ` ${tr("autoReasonManualRequirementsMatch", { tags: reqLabels.join(", ") })}`;
  return `${tr(swapped ? "autoReasonManualSwap" : "autoReasonManualChoice")} ${autoAssignCapacityNote(g, table)}${reqNote}`;
}

function renderAutoAssignPreviewList() {
  const list = document.getElementById("autoPreviewList");
  const scrollTop = list.scrollTop;
  const tables = autoPreviewAvailableTables();
  list.innerHTML = (pendingAutoAssignJobs || []).map((j, index) => {
    const g = gameByKey(j.gameKey);
    const table = S.tables.find(t => t.id === j.tableId);
    const options = tables.map(t => {
      const room = roomOfTable(t.id);
      return `<option value="${esc(t.id)}"${t.id === j.tableId ? " selected" : ""}>${esc(room.name)} · ${esc(t.name)} (${esc(tr("seatsCountLabel", { n: t.seats }))})</option>`;
    }).join("");
    return `<div class="auto-preview-row">
      <div class="auto-preview-main">
        <span class="auto-preview-game" title="${esc(g.title)}">${esc(g.title)}</span>
        <span class="auto-preview-arrow" aria-hidden="true">→</span>
        <select class="auto-preview-target-select" data-auto-job-index="${index}" aria-label="${esc(tr("autoAssignChangeTargetAria", { title: g.title }))}">${options}</select>
      </div>
      <p class="auto-preview-reason"><span aria-hidden="true">↳</span> ${esc(j.reason)}</p>
    </div>`;
  }).join("");
  list.scrollTop = scrollTop;
}

function changeAutoPreviewTarget(index, tableId) {
  if (!pendingAutoAssignJobs?.[index]) return;
  const job = pendingAutoAssignJobs[index];
  const oldTableId = job.tableId;
  if (!tableId || tableId === oldTableId) return;
  const target = S.tables.find(t => t.id === tableId);
  if (!target || !autoPreviewAvailableTables().some(t => t.id === tableId)) return;
  const swapIndex = pendingAutoAssignJobs.findIndex((other, i) => i !== index && other.tableId === tableId);
  job.tableId = tableId;
  job.reason = manualAutoAssignReason(gameByKey(job.gameKey), target, { swapped: swapIndex >= 0 });
  if (swapIndex >= 0) {
    const swapJob = pendingAutoAssignJobs[swapIndex];
    const oldTarget = S.tables.find(t => t.id === oldTableId);
    swapJob.tableId = oldTableId;
    swapJob.reason = manualAutoAssignReason(gameByKey(swapJob.gameKey), oldTarget, { swapped: true });
  }
  renderAutoAssignPreviewList();
}

function openAutoAssignPreview() {
  const { jobs, totalUnassigned } = computeAutoAssignJobs();
  if (!totalUnassigned) { alert(tr("autoAssignNothingToDo")); return; }
  if (!jobs.length) { alert(tr("autoAssignNoFittingTables")); return; }
  pendingAutoAssignJobs = jobs;
  const slotLabel = S.slots.find(s => s.key === S.activeSlot)?.label || S.activeSlot;
  const unresolved = Math.max(0, totalUnassigned - jobs.length);
  document.getElementById("autoPreviewExplanation").textContent = tr("autoAssignInfoText");
  document.getElementById("autoPreviewSummary").textContent = tr("autoAssignPreviewSummary", {
    n: jobs.length,
    slot: slotLabel,
    unresolved,
  });
  renderAutoAssignPreviewList();
  document.getElementById("autoPreviewDlg").showModal();
}

async function applyPendingAutoAssignJobs() {
  const jobs = pendingAutoAssignJobs;
  pendingAutoAssignJobs = null;
  document.getElementById("autoPreviewDlg").close();
  if (!jobs) return;
  const slot = S.activeSlot;
  for (const j of jobs) await assign(j.gameKey, slot, j.tableId);
  const rest = bySlot(slot).filter(g => { const a = asgFor(g); return !a || !a.table_id; }).length;
  document.getElementById("status").textContent = tr("autoAssignResult", { n: jobs.length, rest: rest ? tr("autoAssignRest", { n: rest }) : "" });
}

function openClearSlotDialog() {
  const count = S.assignments.filter(a => a.slot_key === S.activeSlot && a.table_id).length;
  if (!count) return;
  const slotLabel = S.slots.find(s => s.key === S.activeSlot)?.label || S.activeSlot;
  document.getElementById("clearSlotWarningTitle").textContent = tr("clearSlotWarningTitle", { slot: slotLabel });
  document.getElementById("clearSlotWarningText").textContent = tr("clearSlotWarningText", { n: count });
  const msg = document.getElementById("clearSlotMsg");
  msg.textContent = "";
  const btn = document.getElementById("clearSlotConfirmBtn");
  btn.disabled = false;
  btn.textContent = tr("clearSlotConfirmBtn");
  document.getElementById("clearSlotDlg").showModal();
}

async function clearActiveSlotAssignments() {
  const slot = S.activeSlot;
  const affected = S.assignments.filter(a => a.slot_key === slot && a.table_id);
  if (!affected.length) { document.getElementById("clearSlotDlg").close(); return; }
  const btn = document.getElementById("clearSlotConfirmBtn");
  const msg = document.getElementById("clearSlotMsg");
  btn.disabled = true;
  btn.textContent = tr("clearSlotWorking");
  msg.textContent = "";
  try {
    await S.store.clearSlotTableAssignments(slot);
    S.assignments = S.assignments
      .filter(a => !(a.slot_key === slot && a.table_id && !a.game_id))
      .map(a => a.slot_key === slot && a.table_id && a.game_id ? { ...a, table_id: null } : a);
    gamesFromDb();
    document.getElementById("clearSlotDlg").close();
    document.getElementById("status").textContent = tr("clearSlotResult", { n: affected.length });
    renderUpdate();
  } catch (err) {
    msg.textContent = tr("clearSlotFailed", { err: err.message });
    btn.disabled = false;
    btn.textContent = tr("clearSlotConfirmBtn");
  }
}
