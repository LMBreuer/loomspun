/* ---------------- Dialoge ---------------- */
function openRequestDlg(gameKey) {
  const g = gameByKey(gameKey);
  document.getElementById("reqGame").value = g ? `${g.title} (${g.slotLabel})` : tr("general");
  document.getElementById("reqMsg").value = "";
  document.getElementById("reqMsgOut").textContent = "";
  document.getElementById("requestDlg").showModal();
}
document.getElementById("requestForm").addEventListener("submit", async e => {
  e.preventDefault();
  const out = document.getElementById("reqMsgOut");
  if (document.getElementById("reqHp").value) { out.className = "msg ok"; out.textContent = tr("thanksMsg"); return; }
  try {
    await S.store.addRequest({ game_ref: document.getElementById("reqGame").value, message: document.getElementById("reqMsg").value.trim(), contact: document.getElementById("reqContact").value.trim() || null });
    if (S.role) S.requests = await S.store.listRequests().catch(() => S.requests);
    out.className = "msg ok"; out.textContent = tr("thanksFullMsg");
    setTimeout(() => document.getElementById("requestDlg").close(), 1400);
  } catch (err) { out.className = "msg err"; out.textContent = tr("sendFailed", { err: err.message }); }
});
function filterTagPickerHtml(filterKey, selectedIds) {
  const selected = selectedIds.map(id => S.featureTags.find(f => f.id === id)).filter(Boolean);
  const remaining = S.featureTags.filter(f => !selectedIds.includes(f.id));
  // Filter-Pills lassen führende Emojis weg, damit ihre Höhe einheitlich bleibt.
  const pills = selected.map(f => {
    const label = plainFeatureLabel(f.label);
    return `<span class="tag-pill filter-pill">${esc(label)}<button type="button" class="filter-tag-remove" data-filterkey="${filterKey}" data-tag-id="${f.id}" aria-label="${esc(tr("removeFromFilterAriaLabel", { label }))}">✕</button></span>`;
  }).join("");
  const addSelect = remaining.length ? `<select class="filter-tag-select" data-filterkey="${filterKey}" aria-label="${esc(tr("addRequirementToFilterAriaLabel"))}"><option value="">${esc(tr("addRequirementOption"))}</option>${remaining.map(f => `<option value="${f.id}">${esc(plainFeatureLabel(f.label))}</option>`).join("")}</select>` : "";
  // Direkte Kinder übernehmen Gap und Umbruchverhalten der Toolbar.
  return `${pills}${addSelect}`;
}

let tagPickerSelection = new Set();
function renderTagPicker(containerId) {
  const container = document.getElementById(containerId);
  const selected = [...tagPickerSelection].map(id => S.featureTags.find(f => f.id === id)).filter(Boolean);
  const remaining = S.featureTags.filter(f => !tagPickerSelection.has(f.id));
  container.innerHTML = `
    <div class="tag-pills">${selected.map(f => `<span class="tag-pill">${esc(f.label)}<button type="button" class="tag-remove" data-tag-id="${f.id}" aria-label="${esc(tr("removeTagAriaLabel", { label: f.label }))}">×</button></span>`).join("") || `<span class="hint">${esc(tr("noneSelectedYet"))}</span>`}</div>
    <select class="tag-add-select" aria-label="${esc(tr("addFeatureAriaLabel"))}">
      <option value="">${esc(tr("addFeatureOption"))}</option>
      ${remaining.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join("")}
    </select>`;
}
function openTagPicker(containerId, selectedIds) {
  tagPickerSelection = new Set(selectedIds);
  renderTagPicker(containerId);
}

function updateRoomColorControls() {
  const custom = document.querySelector('input[name="roomColorMode"]:checked').value === "custom";
  const picker = document.getElementById("roomColor");
  const popover = document.getElementById("roomColorPopover");
  const trigger = document.getElementById("roomColorTrigger");
  const preview = document.getElementById("roomColorPreview");
  const hex = document.getElementById("roomColorHex");
  picker.disabled = !custom;
  hex.disabled = !custom;
  trigger.disabled = !custom;
  if (!custom) { popover.hidden = true; trigger.setAttribute("aria-expanded", "false"); }
  preview.style.background = picker.value;
  document.getElementById("roomColorCurrentHex").textContent = picker.value.toUpperCase();
  if (document.activeElement !== hex) hex.value = picker.value.toUpperCase();
  document.querySelectorAll("[data-room-color]").forEach(button => {
    button.disabled = !custom;
    button.setAttribute("aria-pressed", String(custom && button.dataset.roomColor.toLowerCase() === picker.value.toLowerCase()));
  });
}
const ROOM_MARKER_GLYPHS = {
  circle: "●", triangle: "▲", square: "■", diamond: "◆", plus: "✚", cross: "✕", hexagon: "⬢", star: "★", sparkle: "✦",
  sun: "☀", moon: "☾", cloud: "☁", flower: "✿", tree: '<span class="room-tree"></span>', heart: "♥", flag: "⚑", key: "⚿", book: '<span class="room-book"></span>', music: "♪", bulb: "☼", letter: "✉", dice: "⚄", invader: '<span class="room-invader"></span>', wc: '<span class="room-marker-text">WC</span>', kitchen: "♨", door: '<span class="room-door"></span>', coat: "♧", toy: '<span class="room-meeple"></span>'
};
const ROOM_MARKER_DISPLAY_NAMES = {
  circle: "Circle", triangle: "Triangle", square: "Square", diamond: "Diamond", plus: "Plus", cross: "Cross", hexagon: "Hexagon", star: "Star", sparkle: "Sparkle",
  sun: "Sun", moon: "Moon", cloud: "Cloud", flower: "Flower", tree: "Tree", heart: "Heart", flag: "Flag", key: "Key", book: "Book", music: "Music note", bulb: "Lamp", letter: "Letter", dice: "Die", invader: "Space Invader", wc: "WC", kitchen: "Kitchen / bar", door: "Entrance", coat: "Coat check", toy: "Games area"
};
let selectedRoomMarker = "circle";
const automaticRoomMarker = room => ROOM_MARKERS[Math.max(0, room ? S.rooms.indexOf(room) : S.rooms.length) % ROOM_MARKERS.length];
function markerGlyphHtml(marker) { return ROOM_MARKER_GLYPHS[marker] || ROOM_MARKER_GLYPHS.circle; }
function updateRoomMarkerControls() {
  const custom = document.querySelector('input[name="roomMarkerMode"]:checked').value === "custom";
  const trigger = document.getElementById("roomMarkerTrigger");
  const popover = document.getElementById("roomMarkerPopover");
  trigger.disabled = !custom;
  if (!custom) { popover.hidden = true; trigger.setAttribute("aria-expanded", "false"); }
  document.getElementById("roomMarkerPreview").innerHTML = markerGlyphHtml(selectedRoomMarker);
  document.getElementById("roomMarkerCurrentName").textContent = ROOM_MARKER_DISPLAY_NAMES[selectedRoomMarker] || "Circle";
  document.querySelectorAll("[data-room-marker]").forEach(button => {
    button.disabled = !custom;
    button.title = ROOM_MARKER_DISPLAY_NAMES[button.dataset.roomMarker] || "";
    button.setAttribute("aria-pressed", String(custom && button.dataset.roomMarker === selectedRoomMarker));
  });
}
function positionRoomMarkerPopover() {
  const trigger = document.getElementById("roomMarkerTrigger");
  const popover = document.getElementById("roomMarkerPopover");
  const r = trigger.getBoundingClientRect();
  popover.style.top = `${r.bottom + 8}px`;
  popover.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - popover.offsetWidth - 12))}px`;
}
function closeRoomMarkerPopover() {
  document.getElementById("roomMarkerPopover").hidden = true;
  document.getElementById("roomMarkerTrigger").setAttribute("aria-expanded", "false");
}
document.querySelectorAll('input[name="roomMarkerMode"]').forEach(input => input.addEventListener("change", updateRoomMarkerControls));
document.getElementById("roomMarkerTrigger").addEventListener("click", () => {
  const popover = document.getElementById("roomMarkerPopover");
  if (!popover.hidden) return closeRoomMarkerPopover();
  popover.hidden = false;
  document.getElementById("roomMarkerTrigger").setAttribute("aria-expanded", "true");
  positionRoomMarkerPopover();
});
document.getElementById("roomMarkerClose").addEventListener("click", closeRoomMarkerPopover);
document.getElementById("roomMarkerOptions").addEventListener("click", event => {
  const button = event.target.closest("[data-room-marker]");
  if (!button || button.disabled) return;
  selectedRoomMarker = button.dataset.roomMarker;
  updateRoomMarkerControls();
});
document.querySelectorAll('input[name="roomColorMode"]').forEach(input => input.addEventListener("change", updateRoomColorControls));
document.getElementById("roomColor").addEventListener("input", updateRoomColorControls);
document.getElementById("roomColorHex").addEventListener("input", event => {
  const value = event.target.value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(value)) { event.target.setAttribute("aria-invalid", value ? "true" : "false"); return; }
  event.target.setAttribute("aria-invalid", "false");
  document.getElementById("roomColor").value = value;
  updateRoomColorControls();
});
document.getElementById("roomColorHex").addEventListener("blur", event => {
  if (!/^#[0-9a-f]{6}$/i.test(event.target.value.trim())) updateRoomColorControls();
});
function positionRoomColorPopover() {
  const trigger = document.getElementById("roomColorTrigger");
  const popover = document.getElementById("roomColorPopover");
  const r = trigger.getBoundingClientRect();
  popover.style.top = `${r.bottom + 8}px`;
  popover.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - popover.offsetWidth - 12))}px`;
}
function closeRoomColorPopover() {
  document.getElementById("roomColorPopover").hidden = true;
  document.getElementById("roomColorTrigger").setAttribute("aria-expanded", "false");
}
document.getElementById("roomColorTrigger").addEventListener("click", () => {
  const popover = document.getElementById("roomColorPopover");
  if (!popover.hidden) return closeRoomColorPopover();
  popover.hidden = false;
  document.getElementById("roomColorTrigger").setAttribute("aria-expanded", "true");
  positionRoomColorPopover();
});
document.getElementById("roomColorClose").addEventListener("click", closeRoomColorPopover);
document.querySelector(".room-color-palette").addEventListener("click", event => {
  const button = event.target.closest("[data-room-color]");
  if (!button || button.disabled) return;
  document.getElementById("roomColor").value = button.dataset.roomColor;
  updateRoomColorControls();
});
document.addEventListener("click", event => {
  if (!event.target.closest("#roomColorTrigger, #roomColorPopover")) closeRoomColorPopover();
  if (!event.target.closest("#roomMarkerTrigger, #roomMarkerPopover")) closeRoomMarkerPopover();
});
document.getElementById("roomDlg").addEventListener("close", () => { closeRoomColorPopover(); closeRoomMarkerPopover(); });

function openRoomDlg(room) {
  document.getElementById("roomId").value = room?.id || "";
  document.getElementById("roomName").value = room?.name || "";
  document.getElementById("roomFloor").value = room?.floor || "";
  document.getElementById("roomSort").value = room?.sort || 0;
  document.getElementById("roomNotes").value = room?.notes || "";
  selectedRoomMarker = validRoomMarker(room?.marker) ? room.marker : automaticRoomMarker(room);
  document.querySelector(`input[name="roomMarkerMode"][value="${validRoomMarker(room?.marker) ? "custom" : "automatic"}"]`).checked = true;
  updateRoomMarkerControls();
  document.querySelector(`input[name="roomColorMode"][value="${validRoomColor(room?.color) ? "custom" : "standard"}"]`).checked = true;
  // Beim ersten Wechsel zu einer eigenen Farbe startet der Picker mit genau
  // jener automatischen Grundfarbe, die dieser Raum aktuell verwenden würde.
  document.getElementById("roomColor").value = validRoomColor(room?.color) ? room.color : automaticRoomColorHex(room);
  updateRoomColorControls();
  openTagPicker("roomFeatures", room ? roomTagIds(room) : []);
  document.getElementById("roomDlg").showModal();
}
document.getElementById("roomForm").addEventListener("submit", async e => {
  e.preventDefault();
  const colorMode = document.querySelector('input[name="roomColorMode"]:checked').value;
  const markerMode = document.querySelector('input[name="roomMarkerMode"]:checked').value;
  const room = { id: document.getElementById("roomId").value || undefined, name: document.getElementById("roomName").value.trim(), floor: document.getElementById("roomFloor").value.trim(), sort: parseInt(document.getElementById("roomSort").value, 10) || 0, notes: document.getElementById("roomNotes").value.trim(), color: colorMode === "custom" ? document.getElementById("roomColor").value : null, marker: markerMode === "custom" ? selectedRoomMarker : null };
  const tagIds = [...tagPickerSelection];
  try {
    const saved = await S.store.saveRoom(room);
    if (!room.id) S.rooms.push(saved); else Object.assign(S.rooms.find(r => r.id === room.id), saved);
    S.rooms.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    await S.store.setRoomTags(saved.id, tagIds);
    S.roomFeatureTags = S.roomFeatureTags.filter(x => x.room_id !== saved.id).concat(tagIds.map(id => ({ con_id: S.con.id, room_id: saved.id, feature_tag_id: id })));
    document.getElementById("roomDlg").close(); renderActive();
  } catch (err) { alert(tr("saveFailed", { err: err.message })); }
});

function openTableDlg(table, roomId) {
  document.getElementById("tableId").value = table?.id || "";
  document.getElementById("tableRoomId").value = roomId;
  document.getElementById("tableName").value = table?.name || "";
  document.getElementById("tableSeats").value = table?.seats || 6;
  document.getElementById("tableNotes").value = table?.notes || "";
  document.getElementById("tableDlg").showModal();
}
document.getElementById("tableForm").addEventListener("submit", async e => {
  e.preventDefault();
  const t = { id: document.getElementById("tableId").value || undefined, room_id: document.getElementById("tableRoomId").value, name: document.getElementById("tableName").value.trim(), seats: parseInt(document.getElementById("tableSeats").value, 10), notes: document.getElementById("tableNotes").value.trim() };
  try {
    const saved = await S.store.saveTable(t);
    if (!t.id) S.tables.push(saved); else Object.assign(S.tables.find(x => x.id === t.id), saved);
    document.getElementById("tableDlg").close(); renderActive();
  } catch (err) { alert(tr("saveFailed", { err: err.message })); }
});

function openSlotDlg(slot) {
  document.getElementById("slotId").value = slot?.id || "";
  document.getElementById("slotLabel").value = slot?.label || "";
  document.getElementById("slotSort").value = slot?.sort ?? (S.slots.length ? Math.max(...S.slots.map(s => s.sort)) + 1 : 0);
  document.getElementById("slotDelBtn").hidden = !slot;
  document.getElementById("slotDlg").showModal();
}
document.getElementById("slotForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("slotId").value || undefined;
  const s = { id, label: document.getElementById("slotLabel").value.trim(), sort: parseInt(document.getElementById("slotSort").value, 10) || 0 };
  if (!id) s.key = crypto.randomUUID(); // Key ist stabil — beim Umbenennen unangetastet lassen
  try {
    const saved = await S.store.saveSlot(s);
    if (!id) S.slots.push(saved); else Object.assign(S.slots.find(x => x.id === id), saved);
    sortSlots();
    if (!S.activeSlot) S.activeSlot = saved.key;
    document.getElementById("slotDlg").close(); renderActive();
  } catch (err) { alert(tr("saveFailed", { err: err.message })); }
});
document.getElementById("slotDelBtn").addEventListener("click", async () => {
  const id = document.getElementById("slotId").value;
  if (!id || !confirm(tr("confirmDeleteSlot"))) return;
  try {
    await S.store.deleteSlot(id);
    S.slots = S.slots.filter(s => s.id !== id);
    if (!S.slots.some(s => s.key === S.activeSlot)) S.activeSlot = S.slots[0]?.key || null;
    document.getElementById("slotDlg").close(); renderActive();
  } catch (err) { alert(tr("deleteFailedSlot", { err: err.message })); }
});

function openBucketDlg(bucket) {
  document.getElementById("bucketId").value = bucket?.id || "";
  document.getElementById("bucketLabel").value = bucket?.label || "";
  document.getElementById("bucketStart").value = bucket?.start_hour ?? 0;
  document.getElementById("bucketEnd").value = bucket?.end_hour ?? 14;
  document.getElementById("bucketActive").checked = bucket ? bucket.active : true;
  document.getElementById("bucketDelBtn").hidden = !bucket;
  document.getElementById("bucketDlg").showModal();
}
document.getElementById("bucketForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("bucketId").value || undefined;
  const b = {
    id, label: document.getElementById("bucketLabel").value.trim(),
    start_hour: parseFloat(document.getElementById("bucketStart").value) || 0,
    end_hour: parseFloat(document.getElementById("bucketEnd").value) || 24,
    active: document.getElementById("bucketActive").checked,
  };
  try {
    const saved = await S.store.saveBucket(b);
    if (!id) S.slotBuckets.push(saved); else Object.assign(S.slotBuckets.find(x => x.id === id), saved);
    S.slotBuckets.sort((a, b) => a.sort - b.sort);
    document.getElementById("bucketDlg").close(); renderActive();
  } catch (err) { alert(tr("saveFailed", { err: err.message })); }
});
document.getElementById("bucketDelBtn").addEventListener("click", async () => {
  const id = document.getElementById("bucketId").value;
  if (!id || !confirm(tr("confirmDeleteBucket"))) return;
  try {
    await S.store.deleteBucket(id);
    S.slotBuckets = S.slotBuckets.filter(b => b.id !== id);
    document.getElementById("bucketDlg").close(); renderActive();
  } catch (err) { alert(tr("deleteFailed", { err: err.message })); }
});

function openGameDlg(dg) {
  document.getElementById("gameId").value = dg?.id || "";
  document.getElementById("gameTitle").value = dg?.title || "";
  document.getElementById("gameProvider").value = dg?.provider || "";
  document.getElementById("gameSeats").value = dg?.seats || 5;
  document.getElementById("gameWs").checked = !!dg?.workshop;
  document.getElementById("gameDesc").value = dg?.description || "";
  const curA = dg && S.assignments.find(x => x.game_id === dg.id);
  document.getElementById("gameSlot").innerHTML = `<option value="">${esc(tr("noSlotOption"))}</option>` +
    S.slots.map(s => `<option value="${esc(s.key)}"${curA && curA.slot_key === s.key ? " selected" : ""}>${esc(s.label)}</option>`).join("");
  openTagPicker("gameFeatures", dg ? gameReqTagIds(dg.id) : []);
  document.getElementById("gameDlg").showModal();
}
document.getElementById("gameForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("gameId").value || undefined;
  const g = {
    id, title: document.getElementById("gameTitle").value.trim(),
    provider: document.getElementById("gameProvider").value.trim() || null,
    seats: parseInt(document.getElementById("gameSeats").value, 10),
    workshop: document.getElementById("gameWs").checked,
    description: document.getElementById("gameDesc").value.trim() || null,
  };
  const newSlot = document.getElementById("gameSlot").value || null;
  const tagIds = [...tagPickerSelection];
  try {
    const saved = await S.store.saveGame(g);
    if (!id) S.dbGames.push(saved); else Object.assign(S.dbGames.find(x => x.id === id), saved);
    await S.store.setGameTags(saved.id, tagIds);
    S.gameRequiredTags = S.gameRequiredTags.filter(x => x.game_id !== saved.id).concat(tagIds.map(tid => ({ con_id: S.con.id, game_id: saved.id, feature_tag_id: tid })));
    const oldA = S.assignments.find(x => x.game_id === saved.id);
    if (newSlot && (!oldA || oldA.slot_key !== newSlot)) {
      // Slot neu gesetzt oder gewechselt — Tisch bewusst zurückgesetzt: eine
      // Tischbelegung ist slot-spezifisch, blindes Übernehmen riskiert eine
      // stille Doppelbelegung im neuen Slot.
      const body = { slot_key: newSlot, session_key: "game:" + saved.id, table_id: null, game_id: saved.id };
      await S.store.upsertAssignment(body);
      if (oldA) Object.assign(oldA, body); else S.assignments.push(body);
    } else if (!newSlot && oldA) {
      await S.store.deleteAssignment(oldA.slot_key, oldA.session_key);
      S.assignments = S.assignments.filter(x => x !== oldA);
    }
    gamesFromDb();
    document.getElementById("gameDlg").close(); renderActive();
  } catch (err) { alert(tr("saveFailed", { err: err.message })); }
});
