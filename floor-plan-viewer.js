/* Öffentliche, Fabric-unabhängige Lageplanansicht sowie Druck/PDF-Export. */
const FLOOR_PLAN_JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js";
let floorPlanPdfPromise = null;
let floorPlanPendingRoomHighlight = REQUESTED_ROOM || null;

function activeFloorPlanDocument() {
  const value = S.floorPlanPreviewDocument || S.floorPlanPublic?.document;
  return value ? normalizeFloorPlanDocument(value) : null;
}

function floorPlanPersonalEntries(documentValue) {
  if (!S.personalProfile) return [];
  const slotOrder = new Map(S.slots.map((slot, index) => [slot.key, index]));
  const entries = personalGames().map(game => {
    const assignment = asgFor(game);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    const room = table && floorPlanRoom(table.room_id);
    const floor = room && floorPlanFloorForRoom(documentValue, room.id);
    return { game, state: personalGameState(game), table, room, floor };
  }).sort((a, b) => {
    const aStart = Date.parse(a.game.start) || 0;
    const bStart = Date.parse(b.game.start) || 0;
    if (aStart && bStart && aStart !== bStart) return aStart - bStart;
    const slotDifference = (slotOrder.get(a.game.slotKey) ?? Number.MAX_SAFE_INTEGER) - (slotOrder.get(b.game.slotKey) ?? Number.MAX_SAFE_INTEGER);
    return slotDifference || a.game.title.localeCompare(b.game.title, LANG === "en" ? "en" : "de");
  });
  return entries.map((entry, index) => ({ ...entry, number: index + 1 }));
}

function floorPlanPersonalRoomNumbers(entries) {
  return entries.reduce((numbers, entry) => {
    if (!entry.room || !entry.floor) return numbers;
    const roomNumbers = numbers.get(entry.room.id) || [];
    roomNumbers.push(entry.number);
    numbers.set(entry.room.id, roomNumbers);
    return numbers;
  }, new Map());
}

function floorPlanPersonalRouteHtml(entries) {
  const name = S.personalProfile?.username || "";
  const body = entries.length ? entries.map(({ number, game, state, table, room, floor }) => {
    const where = room ? `${room.name}${table ? ` · ${table.name}` : ""}` : tr("floorPlanPersonalUnassigned");
    const floorMeta = floor ? floor.name : room ? tr("floorPlanPersonalNotOnMap") : "";
    const content = `<span class="floor-plan-personal-game-number" aria-hidden="true">${number}</span><span class="floor-plan-personal-game-time">${esc([game.slotLabel, game.time].filter(Boolean).join(" · "))}</span>
      <strong>${esc(game.title)}</strong>
      <span class="floor-plan-personal-game-place">${esc([where, floorMeta].filter(Boolean).join(" · "))}</span>
      <span class="floor-plan-personal-role" data-state="${esc(state)}">${esc(tr(`floorPlanPersonalRole_${state}`))}</span>`;
    return floor
      ? `<button type="button" class="floor-plan-personal-game" data-floor-plan-personal-room="${esc(room.id)}" aria-label="${esc(tr("floorPlanPersonalJump", { title: game.title, room: room.name }))}">${content}<span class="floor-plan-personal-game-arrow" aria-hidden="true">→</span></button>`
      : `<div class="floor-plan-personal-game is-unlinked">${content}</div>`;
  }).join("") : `<p class="hint">${esc(tr("noPersonalGames", { name }))}</p>`;
  return `<div class="floor-plan-personal-route-head"><span class="floor-plan-editor-kicker">${esc(tr("personalLabel"))}</span><h2>${esc(tr("myRooms"))}</h2><p>${esc(tr("floorPlanPersonalRouteHint", { name }))}</p></div>
    <div class="floor-plan-personal-route-list">${body}</div>`;
}

function floorPlanViewerHtml() {
  const document = activeFloorPlanDocument();
  if (!document) return emptyState(tr("floorPlanEmptyPublic"));
  const personalMode = !!(S.personalFilterActive && S.personalProfile);
  const personalEntries = personalMode ? floorPlanPersonalEntries(document) : [];
  const personalRoomIds = new Set(personalEntries.filter(entry => entry.floor).map(entry => entry.room.id));
  const personalRoomNumbers = floorPlanPersonalRoomNumbers(personalEntries);
  const personalFloorCounts = personalEntries.reduce((counts, entry) => {
    if (entry.floor) counts.set(entry.floor.id, (counts.get(entry.floor.id) || 0) + 1);
    return counts;
  }, new Map());
  const pendingFloor = floorPlanPendingRoomHighlight ? floorPlanFloorForRoom(document, floorPlanPendingRoomHighlight) : null;
  if (pendingFloor) S.floorPlanViewerFloorId = pendingFloor.id;
  const activeFloor = document.floors.find(floor => floor.id === S.floorPlanViewerFloorId) || document.floors[0];
  S.floorPlanViewerFloorId = activeFloor.id;
  const floorTabs = document.floors.map(floor => {
    const count = personalFloorCounts.get(floor.id) || 0;
    const relevant = personalMode && count > 0;
    const aria = relevant ? tr("floorPlanPersonalFloorGames", { floor: floor.name, n: count }) : floor.name;
    return `<button type="button" class="${relevant ? "is-personal" : ""}" data-public-floor-plan-floor="${esc(floor.id)}" aria-pressed="${String(floor.id === activeFloor.id)}" aria-label="${esc(aria)}">${esc(floor.name)}${relevant ? `<span class="floor-plan-personal-floor-count" aria-hidden="true">${count}</span>` : ""}</button>`;
  }).join("");
  const preview = S.floorPlanPreviewDocument ? `<div class="banner floor-plan-preview-banner">${esc(LANG === "en" ? "Draft preview – only you can see this version." : "Entwurfsvorschau – nur du siehst diesen Stand.")} <button type="button" id="floorPlanBackToEditor" class="small">${esc(LANG === "en" ? "Back to editor" : "Zurück zum Editor")}</button></div>` : "";
  return `${preview}<div class="floor-plan-public-layout">
    <section class="card floor-plan-public-card">
      <div class="floor-plan-public-head">
        <div><span class="floor-plan-editor-kicker">${esc(tr("floorPlan"))}</span><h2>${esc(document.title || S.con?.name || tr("floorPlan"))}</h2></div>
        <div class="floor-plan-public-actions"><button type="button" id="floorPlanDownloadPdfBtn">⇩ ${esc(tr("floorPlanDownloadPdf"))}</button>${personalEntries.length ? `<button type="button" id="floorPlanDownloadPersonalPdfBtn">⇩ ${esc(tr("floorPlanPersonalDownloadPdf"))}</button>` : ""}<button type="button" id="floorPlanPrintBtn">⎙ ${esc(tr("printBtn"))}</button></div>
      </div>
      <div class="floor-plan-floor-tabs slot-tabs" role="group" aria-label="${esc(tr("floorPlanFloor"))}">${floorTabs}</div>
      <div class="floor-plan-public-stage${personalMode ? " is-personal-route" : ""}" data-personal-room-ids="${esc([...personalRoomIds].join(" "))}">${floorPlanSvgHtml(document, activeFloor, { interactive: true, id: "publicFloorPlanSvg", personalRoomNumbers })}</div>
      <p class="floor-plan-public-hint">${esc(personalMode ? tr("floorPlanPersonalMapHint") : tr("floorPlanPublicHint"))}</p>
    </section>
    <aside class="card floor-plan-room-detail" id="floorPlanRoomDetail" aria-live="polite">
      ${personalMode ? floorPlanPersonalRouteHtml(personalEntries) : `<span class="floor-plan-empty-glyph" aria-hidden="true">⌖</span>
      <h2>${esc(tr("floorPlanRoomDetails"))}</h2>
      <p class="hint">${esc(tr("floorPlanSelectRoomHint"))}</p>`}
    </aside>
  </div>`;
}

function mountFloorPlanViewer() {
  const document = activeFloorPlanDocument();
  if (!document) return;
  const personalMode = !!(S.personalFilterActive && S.personalProfile);
  const personalRoomIds = new Set(personalMode ? floorPlanPersonalEntries(document).filter(entry => entry.floor).map(entry => entry.room.id) : []);
  globalThis.document.querySelectorAll("[data-public-floor-plan-floor]").forEach(button => button.addEventListener("click", () => {
    floorPlanPendingRoomHighlight = null;
    S.floorPlanViewerFloorId = button.dataset.publicFloorPlanFloor;
    renderActive({ animate: false });
  }));
  globalThis.document.querySelectorAll("[data-floor-plan-room]").forEach(element => {
    element.classList.toggle("is-personal", personalRoomIds.has(element.dataset.floorPlanRoom));
    element.addEventListener("click", () => personalMode
      ? activateFloorPlanRoom(element.dataset.floorPlanRoom, { highlight: true })
      : showFloorPlanRoomDetails(element.dataset.floorPlanRoom));
    element.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (personalMode) activateFloorPlanRoom(element.dataset.floorPlanRoom, { highlight: true });
      else showFloorPlanRoomDetails(element.dataset.floorPlanRoom);
    });
  });
  globalThis.document.querySelectorAll("[data-floor-plan-personal-room]").forEach(button => button.addEventListener("click", () => jumpToFloorPlanRoom(button.dataset.floorPlanPersonalRoom)));
  globalThis.document.getElementById("floorPlanDownloadPdfBtn")?.addEventListener("click", event => downloadFloorPlanPdf(document, event.currentTarget));
  globalThis.document.getElementById("floorPlanDownloadPersonalPdfBtn")?.addEventListener("click", event => downloadPersonalFloorPlanPdf(document, event.currentTarget));
  globalThis.document.getElementById("floorPlanPrintBtn")?.addEventListener("click", () => {
    S.printMode = "lageplan"; S.printReturnMode = S.mode; S.printReturnView = S.view; S.mode = "print"; renderActive();
  });
  globalThis.document.getElementById("floorPlanBackToEditor")?.addEventListener("click", () => {
    S.floorPlanPreviewDocument = null; S.mode = "crew"; S.crewView = "setup"; S.setupTab = "lageplan"; renderActive();
  });
  if (floorPlanPendingRoomHighlight && floorPlanRoom(floorPlanPendingRoomHighlight)) {
    const roomId = floorPlanPendingRoomHighlight;
    floorPlanPendingRoomHighlight = null;
    if (personalMode) activateFloorPlanRoom(roomId, { highlight: true, scroll: true });
    else showFloorPlanRoomDetails(roomId, { highlight: true });
  }
}

function jumpToFloorPlanRoom(roomId) {
  const document = activeFloorPlanDocument();
  const floor = floorPlanFloorForRoom(document, roomId);
  if (!floor) return;
  floorPlanPendingRoomHighlight = roomId;
  S.floorPlanViewerFloorId = floor.id;
  S.mode = "view";
  S.view = "lageplan";
  renderActive({ animate: false });
  history.replaceState(null, "", `${location.pathname}?con=${encodeURIComponent(S.con?.slug || S.con?.id)}&view=lageplan&room=${encodeURIComponent(roomId)}`);
}

function floorPlanRoomGames(roomId) {
  const slotOrder = new Map(S.slots.map((slot, index) => [slot.key, index]));
  return S.games.map(game => {
    const assignment = asgFor(game);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    return table?.room_id === roomId ? { game, table } : null;
  }).filter(Boolean).sort((a, b) => {
    const slotDifference = (slotOrder.get(a.game.slotKey) ?? Number.MAX_SAFE_INTEGER) - (slotOrder.get(b.game.slotKey) ?? Number.MAX_SAFE_INTEGER);
    if (slotDifference) return slotDifference;
    return (a.table.sort || 0) - (b.table.sort || 0) || a.game.title.localeCompare(b.game.title, LANG === "en" ? "en" : "de");
  });
}

function floorPlanRoomScheduleHtml(entries) {
  if (!entries.length) return `<p class="hint">${esc(tr("floorPlanNoGamesHere"))}</p>`;
  const groups = [];
  entries.forEach(entry => {
    let group = groups.find(item => item.key === entry.game.slotKey);
    if (!group) {
      const slot = S.slots.find(item => item.key === entry.game.slotKey);
      group = { key: entry.game.slotKey, label: slot?.label || entry.game.slotKey || tr("slot"), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  });
  return groups.map(group => `<section><h3>${esc(group.label)}</h3>${group.entries.map(({ game, table }) => `<div class="floor-plan-room-game"><strong>${esc(game.title)}</strong><span>${esc(table.name)}${game.provider ? ` · ${esc(game.provider)}` : ""}</span></div>`).join("")}</section>`).join("");
}

function showFloorPlanRoomDetails(roomId, { highlight = false } = {}) {
  const room = floorPlanRoom(roomId);
  const detail = globalThis.document.getElementById("floorPlanRoomDetail");
  if (!room || !detail) return;
  const color = floorPlanRoomColor(room);
  const glyph = floorPlanRoomGlyph(room);
  const entries = floorPlanRoomGames(roomId);
  detail.innerHTML = `<div class="floor-plan-room-detail-head" style="--floor-plan-room-color:${color}"><span class="floor-plan-room-detail-symbol" aria-hidden="true">${esc(glyph)}</span><div><span class="floor-plan-editor-kicker">${esc(tr("room"))}</span><h2>${esc(room.name)}</h2></div></div>
    ${room.floor ? `<p class="room-location">${esc(room.floor)}</p>` : ""}
    ${room.notes ? `<p>${esc(room.notes)}</p>` : ""}
    <div class="room-badges">${roomBadgesHtml(room)}</div>
    <div class="floor-plan-room-schedule">${floorPlanRoomScheduleHtml(entries)}</div>
    <button type="button" class="primary" id="floorPlanJumpRoomBtn" data-room-id="${esc(room.id)}">${esc(tr("floorPlanShowInRooms"))} →</button>`;
  detail.querySelector("#floorPlanJumpRoomBtn").addEventListener("click", () => jumpFromFloorPlanToRoom(room.id));
  activateFloorPlanRoom(room.id, { highlight, scroll: highlight });
}

function activateFloorPlanRoom(roomId, { highlight = false, scroll = false } = {}) {
  globalThis.document.querySelectorAll("[data-floor-plan-room]").forEach(element => element.classList.toggle("is-active", element.dataset.floorPlanRoom === roomId));
  const element = globalThis.document.querySelector(`[data-floor-plan-room="${CSS.escape(roomId)}"]`);
  if (!element || !highlight) return;
  element.classList.remove("is-jump-highlight");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (scroll) element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    element.classList.add("is-jump-highlight");
    const clearHighlight = () => element.classList.remove("is-jump-highlight");
    element.addEventListener("animationend", clearHighlight, { once: true });
    globalThis.setTimeout(clearHighlight, 1600);
  }));
}

function jumpFromFloorPlanToRoom(roomId) {
  S.floorPlanPreviewDocument = null;
  S.mode = "view"; S.view = "raeume";
  renderActive({ animate: false });
  requestAnimationFrame(() => {
    const room = globalThis.document.getElementById(`room-${roomId}`);
    if (!room) return;
    room.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    room.classList.add("pulse-highlight");
    room.addEventListener("animationend", () => room.classList.remove("pulse-highlight"), { once: true });
    history.replaceState(null, "", `${location.pathname}?con=${encodeURIComponent(S.con?.slug || S.con?.id)}&view=raeume&room=${encodeURIComponent(roomId)}`);
  });
}

function floorPlanPageDimensionsMm(documentValue) {
  const document = normalizeFloorPlanDocument(documentValue);
  if (document.pageFormat === "a4") return document.orientation === "landscape" ? { width: 297, height: 210 } : { width: 210, height: 297 };
  if (document.pageFormat === "letter") return document.orientation === "landscape" ? { width: 279.4, height: 215.9 } : { width: 215.9, height: 279.4 };
  return { width: document.pageWidth * 25.4 / 96, height: document.pageHeight * 25.4 / 96 };
}

function floorPlanPdfFormat(documentValue) {
  const document = normalizeFloorPlanDocument(documentValue);
  if (document.pageFormat === "a4" || document.pageFormat === "letter") return document.pageFormat;
  const size = floorPlanPageDimensionsMm(document);
  return [size.width, size.height];
}

function floorPlanPrintPagesHtml() {
  const document = activeFloorPlanDocument();
  if (!document) return emptyState(tr("floorPlanEmptyPublic"));
  const orientation = document.orientation;
  const pageSize = floorPlanPageDimensionsMm(document);
  const pageRatio = `${document.pageWidth} / ${document.pageHeight}`;
  const printWidth = Math.max(60, pageSize.width - 30);
  const printHeight = Math.max(60, pageSize.height - 30);
  const liveUrl = `${location.origin}${location.pathname}?con=${encodeURIComponent(S.con?.slug || S.con?.id || "")}&view=lageplan`;
  return `<style id="floorPlanPrintPageStyle">@page { size: ${pageSize.width.toFixed(2)}mm ${pageSize.height.toFixed(2)}mm; margin: 15mm; }</style>` + document.floors.map((floor, index) => `<div class="doc-page-stage floor-plan-print-stage"${index ? ' style="break-before:page"' : ""}><div class="doc-page floor-plan-print-page" data-orientation="${orientation}" data-page-format="${esc(document.pageFormat)}" style="--floor-plan-page-ratio:${pageRatio};--floor-plan-print-width:${printWidth.toFixed(2)}mm;--floor-plan-print-height:${printHeight.toFixed(2)}mm">
    <div class="doc-page-header"><span>${esc(document.title || S.con?.name || tr("floorPlan"))}</span><span>${esc(floor.name)}</span></div>
    <div class="floor-plan-print-map">${floorPlanSvgHtml(document, floor)}</div>
    <div class="doc-page-footer"><span>${esc(tr("printCreatedOn", { time: new Date().toLocaleString(LANG === "en" ? "en-GB" : "de-AT", { dateStyle: "medium", timeStyle: "short" }) }))}</span><span>${esc(tr("printLiveVersion", { url: liveUrl }))}</span></div>
  </div></div>`).join("");
}

function floorPlanPrintPageHtml() {
  const document = activeFloorPlanDocument();
  if (!document) return emptyState(tr("floorPlanEmptyPublic"));
  return `<div class="print-page-wrap floor-plan-print-wrap">
    <p class="no-print" style="margin:0 0 var(--sp-3)"><button type="button" id="printBackLink" class="link-btn">${esc(tr("printBackLink"))}</button></p>
    <div class="card toolbar-card no-print floor-plan-print-toolbar"><div><span class="toolbar-label">${esc(tr("floorPlanPrintTitle"))}</span><p class="hint">${esc(tr("floorPlanPrintPageHint", { format: document.pageFormat === "custom" ? tr("floorPlanPageFormatCustom") : document.pageFormat.toUpperCase() }))}</p></div><button type="button" id="floorPlanPrintDownloadBtn">⇩ ${esc(tr("floorPlanDownloadPdf"))}</button><button type="button" id="doPrintBtn" class="primary">${esc(tr("printBtn"))}</button></div>
    ${floorPlanPrintPagesHtml()}
  </div>`;
}

function mountFloorPlanPrintView() {
  const document = activeFloorPlanDocument();
  globalThis.document.getElementById("floorPlanPrintDownloadBtn")?.addEventListener("click", event => downloadFloorPlanPdf(document, event.currentTarget));
}

function floorPlanSvgForExport(documentValue, floor, options = {}) {
  const wrapper = globalThis.document.createElement("div");
  wrapper.innerHTML = floorPlanSvgHtml(documentValue, floor, options);
  const svg = wrapper.firstElementChild;
  const viewport = floorPlanSvgViewport(floor);
  svg.setAttribute("width", String(viewport.width));
  svg.setAttribute("height", String(viewport.height));
  return new XMLSerializer().serializeToString(svg);
}

function floorPlanSvgToPng(documentValue, floor, scale = 3, options = {}) {
  return new Promise((resolve, reject) => {
    const svg = floorPlanSvgForExport(documentValue, floor, options);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const viewport = floorPlanSvgViewport(floor);
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width * scale); canvas.height = Math.ceil(viewport.height * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = error => { URL.revokeObjectURL(url); reject(error); };
    image.src = url;
  });
}

async function downloadFloorPlanPdf(documentValue, button) {
  if (!documentValue || !button) return;
  const original = button.textContent;
  button.disabled = true; button.textContent = tr("floorPlanSaving");
  try {
    floorPlanPdfPromise ||= loadFloorPlanScript(FLOOR_PLAN_JSPDF_URL, "jspdf");
    await floorPlanPdfPromise;
    const document = normalizeFloorPlanDocument(documentValue);
    const { jsPDF } = globalThis.jspdf;
    const pdfFormat = floorPlanPdfFormat(document);
    const pdf = new jsPDF({ orientation: document.orientation, unit: "mm", format: pdfFormat, compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 11;
    for (let index = 0; index < document.floors.length; index += 1) {
      if (index) pdf.addPage(pdfFormat, document.orientation);
      const floor = document.floors[index];
      const viewport = floorPlanSvgViewport(floor);
      const image = await floorPlanSvgToPng(document, floor, 3);
      pdf.setTextColor(29, 36, 51);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(document.title || S.con?.name || tr("floorPlan"), margin, 10);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(floor.name, pageWidth - margin, 10, { align: "right" });
      pdf.setDrawColor(220, 224, 232);
      pdf.line(margin, 13, pageWidth - margin, 13);

      const mapTop = 17;
      const mapBottom = pageHeight - 11;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = mapBottom - mapTop;
      const scale = Math.min(availableWidth / viewport.width, availableHeight / viewport.height);
      const mapWidth = viewport.width * scale;
      const mapHeight = viewport.height * scale;
      const mapX = (pageWidth - mapWidth) / 2;
      const mapY = mapTop + (availableHeight - mapHeight) / 2;
      pdf.addImage(image, "PNG", mapX, mapY, mapWidth, mapHeight, undefined, "FAST");

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(120, 127, 141);
      pdf.text(`${index + 1} / ${document.floors.length}`, pageWidth - margin, pageHeight - 4, { align: "right" });
    }
    const name = `${(S.con?.name || "Lageplan").replace(/[^a-z0-9äöüß_-]+/gi, "-")}-Lageplan.pdf`;
    pdf.save(name);
  } catch (error) {
    button.textContent = error.message || tr("floorPlanSaveFailed", { err: "PDF" });
    return;
  } finally {
    button.disabled = false;
    setTimeout(() => { button.textContent = original; }, 1400);
  }
}

function floorPlanPersonalPdfTime(entry) {
  return entry.game.time || entry.game.slotLabel || tr("noSlot");
}

function floorPlanPersonalPdfPlace(entry) {
  if (!entry.room) return tr("floorPlanPersonalUnassigned");
  return [entry.room.name, entry.table?.name, entry.floor?.name || tr("floorPlanPersonalNotOnMap")].filter(Boolean).join(" · ");
}

function floorPlanPersonalPdfDay(entry) {
  const start = Date.parse(entry.game.start);
  if (Number.isFinite(start)) {
    return new Intl.DateTimeFormat(LANG === "en" ? "en-GB" : "de-AT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(start));
  }
  return entry.game.slotLabel?.split(/\s+(?=Vor|Nach|Morning|After|Evening)/i)[0] || tr("noSlot");
}

function floorPlanPersonalPdfGroups(entries) {
  return entries.reduce((groups, entry) => {
    const label = floorPlanPersonalPdfDay(entry);
    const previous = groups.at(-1);
    if (previous?.label === label) previous.entries.push(entry);
    else groups.push({ label, entries: [entry] });
    return groups;
  }, []);
}

function floorPlanPersonalPdfCount(key, count) {
  return tr(`${key}${count === 1 ? "One" : "Many"}`, { n: count });
}

function floorPlanPersonalPdfPlayers(entry) {
  const count = Math.max(0, Number(entry.game.seats || 1) - 1);
  return floorPlanPersonalPdfCount("floorPlanPersonalPdfPlayers", count);
}

function floorPlanDrawPersonalScheduleHeader(pdf, documentValue, entries, { continuation = false } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const conTitle = S.con?.name || documentValue.title || tr("floorPlan");
  const profileName = S.personalProfile?.username || "";
  pdf.setFillColor(35, 79, 99);
  pdf.rect(margin, 12, 3, 22, "F");
  pdf.setTextColor(108, 116, 132);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text(conTitle.toUpperCase(), margin + 7, 15.2);
  pdf.setTextColor(29, 36, 51);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(tr("floorPlan"), margin + 7, 25);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(59, 67, 83);
  pdf.text(profileName, margin + 7, 32.5);
  const countLabel = floorPlanPersonalPdfCount("floorPlanPersonalPdfGameCount", entries.length);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(35, 79, 99);
  pdf.text(continuation ? `${countLabel} · ${tr("floorPlanPersonalPdfContinued")}` : countLabel, pageWidth - margin, 15.2, { align: "right" });
  pdf.setDrawColor(226, 229, 235);
  pdf.setLineWidth(.25);
  pdf.line(margin, 40, pageWidth - margin, 40);
  return 47;
}

function floorPlanDrawPersonalSchedule(pdf, documentValue, entries, pdfFormat) {
  const margin = 14;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap) / 2;
  const pageBottom = pageHeight - 15;
  const continuationPages = [];
  let y = floorPlanDrawPersonalScheduleHeader(pdf, documentValue, entries);
  floorPlanPersonalPdfGroups(entries).forEach(group => {
    const cards = group.entries.map(entry => {
      const titleLines = pdf.splitTextToSize(entry.game.title, cardWidth - 10);
      const provider = `${tr("floorPlanPersonalPdfGameMaster")}: ${entry.game.provider || "-"}`;
      const providerLines = pdf.splitTextToSize(provider, cardWidth - 10);
      const placeLines = pdf.splitTextToSize(floorPlanPersonalPdfPlace(entry), cardWidth - 10);
      const height = Math.max(33, 15 + titleLines.length * 4.1 + providerLines.length * 3.3 + placeLines.length * 3.5);
      return { entry, titleLines, providerLines, placeLines, height };
    });
    const rows = [];
    for (let index = 0; index < cards.length; index += 2) rows.push(cards.slice(index, index + 2));
    let dayHeaderNeeded = true;
    rows.forEach(row => {
      const rowHeight = Math.max(...row.map(card => card.height));
      const requiredHeight = rowHeight + (dayHeaderNeeded ? 11 : 0);
      if (y + requiredHeight > pageBottom) {
        pdf.addPage(pdfFormat, documentValue.orientation);
        continuationPages.push(pdf.getNumberOfPages());
        y = floorPlanDrawPersonalScheduleHeader(pdf, documentValue, entries, { continuation: true });
        dayHeaderNeeded = true;
      }
      if (dayHeaderNeeded) {
        pdf.setTextColor(29, 36, 51);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10.5);
        pdf.text(group.label, margin, y + 5.5);
        pdf.setTextColor(108, 116, 132);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.8);
        pdf.text(floorPlanPersonalPdfCount("floorPlanPersonalPdfDayGames", group.entries.length), pageWidth - margin, y + 5.5, { align: "right" });
        y += 8;
        dayHeaderNeeded = false;
      }
      row.forEach((card, columnIndex) => {
        const { entry, titleLines, providerLines, placeLines } = card;
        const x = margin + columnIndex * (cardWidth + cardGap);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(221, 226, 233);
        pdf.setLineWidth(.3);
        pdf.roundedRect(x, y, cardWidth, rowHeight, 2.4, 2.4, "FD");
        pdf.setTextColor(35, 79, 99);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.4);
        pdf.text(String(entry.number).padStart(2, "0"), x + 5, y + 6.2);
        pdf.setTextColor(102, 113, 132);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.1);
        pdf.text(floorPlanPersonalPdfTime(entry), x + cardWidth - 5, y + 6.2, { align: "right" });
        pdf.setTextColor(29, 36, 51);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.2);
        pdf.text(titleLines, x + 5, y + 12.5, { lineHeightFactor: 1.2 });
        let metaY = y + 13 + titleLines.length * 4.1;
        pdf.setTextColor(85, 96, 114);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.1);
        pdf.text(providerLines, x + 5, metaY, { lineHeightFactor: 1.25 });
        metaY += providerLines.length * 3.3 + .8;
        pdf.text(`${floorPlanPersonalPdfPlayers(entry)} · ${tr(`floorPlanPersonalRole_${entry.state}`)}`, x + 5, metaY);
        pdf.setDrawColor(226, 230, 236);
        pdf.setLineWidth(.2);
        pdf.line(x + 5, y + rowHeight - 10.5, x + cardWidth - 5, y + rowHeight - 10.5);
        pdf.setTextColor(35, 79, 99);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.2);
        pdf.text(placeLines, x + 5, y + rowHeight - 6.2, { lineHeightFactor: 1.25 });
      });
      y += rowHeight + 3;
    });
    y += 2;
  });
  continuationPages.forEach(pageNumber => {
    pdf.setPage(pageNumber);
    floorPlanDrawPersonalScheduleHeader(pdf, documentValue, entries, { continuation: true });
  });
}

async function createPersonalFloorPlanPdf(documentValue) {
  floorPlanPdfPromise ||= loadFloorPlanScript(FLOOR_PLAN_JSPDF_URL, "jspdf");
  await floorPlanPdfPromise;
  const document = normalizeFloorPlanDocument(documentValue);
  const entries = floorPlanPersonalEntries(document);
  const roomNumbers = floorPlanPersonalRoomNumbers(entries);
  const relevantFloorIds = new Set(entries.filter(entry => entry.floor).map(entry => entry.floor.id));
  const relevantFloors = document.floors.filter(floor => relevantFloorIds.has(floor.id));
  const { jsPDF } = globalThis.jspdf;
  const pdfFormat = floorPlanPdfFormat(document);
  const pdf = new jsPDF({ orientation: document.orientation, unit: "mm", format: pdfFormat, compress: true });
  floorPlanDrawPersonalSchedule(pdf, document, entries, pdfFormat);
  for (const floor of relevantFloors) {
    pdf.addPage(pdfFormat, document.orientation);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const viewport = floorPlanSvgViewport(floor);
    const image = await floorPlanSvgToPng(document, floor, 3, { personalRoomNumbers: roomNumbers, dimIrrelevantRooms: true });
    pdf.setTextColor(108, 116, 132);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.text((S.con?.name || document.title || tr("floorPlan")).toUpperCase(), margin, 10.5);
    pdf.setTextColor(29, 36, 51);
    pdf.setFontSize(15);
    pdf.text(floor.name, margin, 19);
    pdf.setTextColor(35, 79, 99);
    pdf.setFontSize(7);
    pdf.text(floorPlanPersonalPdfCount("floorPlanPersonalPdfGameCount", entries.filter(entry => entry.floor?.id === floor.id).length), pageWidth - margin, 10.5, { align: "right" });
    pdf.setDrawColor(226, 229, 235);
    pdf.setLineWidth(.25);
    pdf.line(margin, 24, pageWidth - margin, 24);
    const mapTop = 28;
    const mapBottom = pageHeight - 14;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = mapBottom - mapTop;
    const scale = Math.min(availableWidth / viewport.width, availableHeight / viewport.height);
    const mapWidth = viewport.width * scale;
    const mapHeight = viewport.height * scale;
    pdf.addImage(image, "PNG", (pageWidth - mapWidth) / 2, mapTop + (availableHeight - mapHeight) / 2, mapWidth, mapHeight, undefined, "FAST");
  }
  const totalPages = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(232, 234, 239);
    pdf.setLineWidth(.2);
    pdf.line(14, pageHeight - 9, pageWidth - 14, pageHeight - 9);
    pdf.setTextColor(120, 127, 141);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.text(S.personalProfile?.username || "", 14, pageHeight - 4.5);
    pdf.text(`${pageNumber} / ${totalPages}`, pageWidth - 14, pageHeight - 4.5, { align: "right" });
  }
  return pdf;
}

async function downloadPersonalFloorPlanPdf(documentValue, button) {
  if (!documentValue || !button || !S.personalProfile) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = tr("floorPlanSaving");
  try {
    const pdf = await createPersonalFloorPlanPdf(documentValue);
    const conName = S.con?.name || "Lageplan";
    const profileName = S.personalProfile?.username || tr("personalLabel");
    const fileName = `${conName}-${profileName}-Lageplan`.replace(/[^a-z0-9äöüß_-]+/gi, "-");
    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    button.textContent = error.message || tr("floorPlanSaveFailed", { err: "PDF" });
    return;
  } finally {
    button.disabled = false;
    setTimeout(() => { button.textContent = original; }, 1400);
  }
}
