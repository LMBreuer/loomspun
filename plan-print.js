/* ---------------- Druckansicht: eigene Vollseite (S.mode === "print") ---------------- */
const PRINT_ROOM_COLORS = ["#2563eb", "#16a34a", "#b45309", "#be123c", "#7c3aed", "#0e7490"];
const PRINT_ROOM_SYMBOLS = ["●", "▲", "■", "◆", "✚", "✕", "★", "✦"];
const printAccent = ri => S.printColor === "bw" ? null : PRINT_ROOM_COLORS[ri % PRINT_ROOM_COLORS.length];
const printRoomMarker = ri => {
  if (S.printColor === "symbols") return `<span class="print-symbol" aria-hidden="true">${PRINT_ROOM_SYMBOLS[ri % PRINT_ROOM_SYMBOLS.length]}</span>`;
  const accent = printAccent(ri);
  return accent ? `<span class="print-swatch" aria-hidden="true" style="background:${accent}"></span>` : "";
};
const PRINT_MODES = [{ key: "raster", nameKey: "viewRaster" }, { key: "tabelle", nameKey: "viewTable" }, { key: "raeume", nameKey: "viewRooms" }];
const PRINT_AXES = [{ key: "rooms", nameKey: "roomsLabel" }, { key: "slots", nameKey: "slotsLabel" }];
const PRINT_ORIENTATIONS = [
  { key: "auto", nameKey: "printOrientationAuto" },
  { key: "portrait", nameKey: "printOrientationPortrait" },
  { key: "landscape", nameKey: "printOrientationLandscape" },
];
const PRINT_COLORS = [{ key: "color", nameKey: "printColorColor" }, { key: "symbols", nameKey: "printColorSymbols" }, { key: "bw", nameKey: "printColorBw" }];

function printPillsHtml(items, dataAttr, current) {
  return items.map(it =>
    `<button type="button" class="filter-chip" data-${dataAttr}="${it.key}" aria-pressed="${String(it.key === current)}">${esc(tr(it.nameKey))}</button>`).join("");
}
function roomBadgeLabels(room) {
  return roomTagIds(room).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).map(f => f.label);
}
function printGameMeta(g) {
  const reqLabels = (g.requiredTagIds || []).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).map(f => f.label);
  if (S.printDetail === "minimal") return "";
  if (S.printDetail === "medium") return tr("printMetaSl", { host: g.provider || "–" });
  return tr("printMetaFull", { host: g.provider || "–", tag: reqLabels.length ? " · " + reqLabels.join(", ") : "", seats: g.seats });
}
function printTabelleHtml() {
  const rows = S.games.filter(g => { const a = asgFor(g); return a && a.table_id; }).map(g => {
    const a = asgFor(g); const table = S.tables.find(t => t.id === a.table_id); const room = table && roomOfTable(table.id);
    const slotObj = S.slots.find(s => s.key === g.slotKey);
    const reqLabels = (g.requiredTagIds || []).map(id => S.featureTags.find(f => f.id === id)).filter(Boolean).map(f => f.label);
    return { title: g.title, host: g.provider || "–", slotKey: g.slotKey, slotLabel: slotObj?.label || g.slotKey || "–", room: room?.name || "–", roomIndex: room ? S.rooms.indexOf(room) : -1, table: table?.name || "–", seats: g.seats, tag: reqLabels.join(", ") || "–" };
  }).sort((a, b) => S.slots.findIndex(s => s.key === a.slotKey) - S.slots.findIndex(s => s.key === b.slotKey) || a.room.localeCompare(b.room));
  return `<table class="print-table"><thead><tr>
    <th>${esc(tr("gameCol"))}</th><th>${esc(tr("printColHost"))}</th><th>${esc(tr("slotCol"))}</th><th>${esc(tr("roomCol"))}</th><th>${esc(tr("tableCol"))}</th><th>${esc(tr("seatsCol"))}</th><th>${esc(tr("printColTag"))}</th>
  </tr></thead><tbody>${rows.map(r => `<tr>
    <td><b>${esc(r.title)}</b></td><td>${esc(r.host)}</td><td>${esc(r.slotLabel)}</td><td>${r.roomIndex >= 0 ? printRoomMarker(r.roomIndex) : ""}${esc(r.room)}</td><td>${esc(r.table)}</td><td>${r.seats}</td><td>${esc(r.tag)}</td>
  </tr>`).join("")}</tbody></table>`;
}
function printRaeumeHtml() {
  const slotKeys = S.printSlot === "alle" ? S.slots.map(s => s.key) : [S.printSlot];
  return slotKeys.map((slotKey, si) => {
    const slotObj = S.slots.find(s => s.key === slotKey);
    const roomsHtml = S.rooms.map((room, ri) => {
      const tables = S.tables.filter(t => t.room_id === room.id);
      const tablesHtml = tables.map(t => {
        const g = S.games.find(x => { const a = asgFor(x); return a && a.table_id === t.id && x.slotKey === slotKey; });
        const headLine = `${t.name} · ${tr("seatsCountLabel", { n: t.seats })}`;
        return `<div class="print-table-row"><div class="print-table-headline">${esc(headLine)}</div>${g
          ? `<div class="print-game-line">${esc(g.title)}</div><div class="print-game-meta">${esc(printGameMeta(g))}</div>`
          : `<div class="print-free">${esc(tr("freeLabel"))}</div>`}</div>`;
      }).join("");
      const badges = roomBadgeLabels(room).join(" · ");
      return `<div class="print-room-block"><h3 class="print-room-head">${printRoomMarker(ri)}${esc(room.name)}</h3>${badges ? `<p class="print-room-badges">${esc(badges)}</p>` : ""}${tablesHtml}</div>`;
    }).join("");
    return `<div${si > 0 ? ' style="break-before:page"' : ""}><h2 class="print-slot-head">${esc(slotObj?.label || slotKey)}</h2><div class="print-rooms-columns">${roomsHtml}</div></div>`;
  }).join("");
}
function printRasterHtml() {
  const rowsSrc = S.printAxis === "rooms" ? S.rooms : S.slots;
  const colsSrc = S.printAxis === "rooms" ? S.slots : S.rooms;
  const colHeadHtml = colsSrc.map((c, ci) => `<th>${S.printAxis === "slots" ? printRoomMarker(ci) : ""}${esc(S.printAxis === "rooms" ? c.label : c.name)}</th>`).join("");
  const bodyHtml = rowsSrc.map((rowItem, ri) => {
    const isRoomRow = S.printAxis === "rooms";
    const rowLabel = isRoomRow ? rowItem.name : rowItem.label;
    const cellsHtml = colsSrc.map(colItem => {
      const room = isRoomRow ? rowItem : colItem;
      const slot = isRoomRow ? colItem : rowItem;
      const list = S.games.filter(g => g.slotKey === slot.key).filter(g => { const a = asgFor(g); const t = a && S.tables.find(x => x.id === a.table_id); return t && t.room_id === room.id; });
      if (!list.length) return `<td class="print-matrix-td"><span class="print-empty-dash">–</span></td>`;
      const entries = list.map(g => {
        const a = asgFor(g); const table = S.tables.find(t => t.id === a.table_id);
        return `<div class="print-cell-entry"><div class="print-cell-title">${esc(g.title)} — ${esc(table?.name || "–")}</div><div class="print-cell-meta">${esc(printGameMeta(g))}</div></div>`;
      }).join("");
      return `<td class="print-matrix-td">${entries}</td>`;
    }).join("");
    return `<tr><th class="print-row-head">${isRoomRow ? printRoomMarker(ri) : ""}${esc(rowLabel)}</th>${cellsHtml}</tr>`;
  }).join("");
  return `<table class="print-table"><thead><tr><th></th>${colHeadHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}
function printPageHtml() {
  if (S.printMode === "lageplan") return floorPlanPrintPageHtml();
  if (!S.printSlot) S.printSlot = S.activeSlot || S.slots[0]?.key || "alle";
  const modeLabel = S.printMode === "raster" ? tr("viewRaster") : S.printMode === "tabelle" ? tr("viewTable") : tr("viewRooms");
  const orientation = S.printOrientation === "auto" ? (S.printMode === "raster" ? "landscape" : "portrait") : S.printOrientation;
  const contentHtml = S.printMode === "tabelle" ? printTabelleHtml() : S.printMode === "raeume" ? printRaeumeHtml() : printRasterHtml();
  const printSlotOptions = [{ key: "alle", nameKey: "printAllSlots" }, ...S.slots.map(s => ({ key: s.key, nameKey: null, label: s.label }))];
  const printSlotPillsHtml = printSlotOptions.map(o =>
    `<button type="button" class="filter-chip" data-printslot="${esc(o.key)}" aria-pressed="${String(o.key === S.printSlot)}">${o.nameKey ? esc(tr(o.nameKey)) : esc(o.label)}</button>`).join("");
  const toolbarHtml = `<div class="card toolbar-card no-print">
    <div class="toolbar-group"><span class="toolbar-label">${esc(tr("printModeLabel"))}</span><div class="toolbar-pill-row">${printPillsHtml(PRINT_MODES, "printmode", S.printMode)}</div></div>
    <div class="toolbar-divider"></div>
    ${S.printMode === "raster" ? `<div class="toolbar-group"><span class="toolbar-label">${esc(tr("printAxisLabel"))}</span><div class="toolbar-pill-row">${printPillsHtml(PRINT_AXES, "printaxis", S.printAxis)}</div></div><div class="toolbar-divider"></div>` : ""}
    ${S.printMode === "raeume" ? `<div class="toolbar-group"><span class="toolbar-label">${esc(tr("printSlotLabel"))}</span><div class="toolbar-pill-row">${printSlotPillsHtml}</div></div><div class="toolbar-divider"></div>` : ""}
    ${S.printMode !== "tabelle" ? `<div class="toolbar-group"><span class="toolbar-label">${esc(tr("printDetailLabel"))}</span><div class="toolbar-pill-row">${printPillsHtml(DETAIL_LEVELS.map(d => ({ key: d.key, nameKey: d.labelKey })), "printdetail", S.printDetail)}</div></div><div class="toolbar-divider"></div>` : ""}
    <div class="toolbar-group"><span class="toolbar-label">${esc(tr("printOrientationLabel"))}</span><div class="toolbar-pill-row">${printPillsHtml(PRINT_ORIENTATIONS, "printorientation", S.printOrientation)}</div></div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group"><span class="toolbar-label">${esc(tr("printColorLabel"))}</span><div class="toolbar-pill-row">${printPillsHtml(PRINT_COLORS, "printcolor", S.printColor)}</div></div>
    <button type="button" id="doPrintBtn" class="primary" style="align-self:flex-end">${esc(tr("printBtn"))}</button>
  </div>`;
  const liveUrl = location.origin + location.pathname + "?con=" + encodeURIComponent(S.con?.slug || S.con?.id || "");
  const conMeta = S.con?.playabl_event_id ? tr("printConMetaPlayabl", { id: S.con.playabl_event_id }) : tr("printConMetaManual");
  const headerHtml = `<div class="doc-page-header"><span>${esc(S.con?.name || "Loomspun")} · ${esc(conMeta)}</span><span>${esc(modeLabel)}</span></div>`;
  const footerHtml = `<div class="doc-page-footer"><span>${esc(tr("printCreatedOn", { time: new Date().toLocaleString(LANG === "en" ? "en-GB" : "de-AT", { dateStyle: "medium", timeStyle: "short" }) }))}</span><span>${esc(tr("printLiveVersion", { url: liveUrl }))}</span></div>`;
  const docPageHtml = `<div class="doc-page-stage"><div class="doc-page" data-orientation="${orientation}">
    ${headerHtml}
    <table class="doc-page-frame" role="presentation">
      <thead><tr><td><div class="doc-page-header-space"></div></td></tr></thead>
      <tbody><tr><td><div class="doc-page-body">${contentHtml}</div></td></tr></tbody>
      <tfoot><tr><td><div class="doc-page-footer-space"></div></td></tr></tfoot>
    </table>
    ${footerHtml}
  </div></div>`;
  return `<div class="print-page-wrap">
    <p class="no-print" style="margin:0 0 var(--sp-3)"><button type="button" id="printBackLink" class="link-btn">${esc(tr("printBackLink"))}</button></p>
    ${toolbarHtml}
    ${docPageHtml}
  </div>`;
}
