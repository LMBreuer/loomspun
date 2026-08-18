/* Crew-Lageplan-Editor. Fabric.js bleibt eine austauschbare Interaktionsschicht. */
const FLOOR_PLAN_FABRIC_URL = "https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js";
const FLOOR_PLAN_PDF_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const FLOOR_PLAN_PDF_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
let floorPlanFabricPromise = null;
let floorPlanTracePdfPromise = null;
let floorPlanCanvas = null;
let floorPlanEditorDocument = null;
let floorPlanHistory = [];
let floorPlanFuture = [];
let floorPlanSaveTimer = null;
let floorPlanSaveInFlight = null;
let floorPlanPendingSnapshot = null;
let floorPlanEditorAbortController = null;
let floorPlanSelectionSyncing = false;
const floorPlanObjectNormalizations = new WeakSet();
const FLOOR_PLAN_GRAPHIC_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const FLOOR_PLAN_TRACE_TYPES = new Set([...FLOOR_PLAN_GRAPHIC_TYPES, "application/pdf"]);
const FLOOR_PLAN_TRACE_MAX_BYTES = 20 * 1024 * 1024;
const FLOOR_PLAN_ROTATION_SNAP = 15;
const floorPlanTraceReferences = new Map();
let floorPlanTraceRenderToken = 0;
let floorPlanEditorZoom = 1;
let floorPlanPanEnabled = false;
let floorPlanPanGesture = null;
let floorPlanSpacePanRestore = null;
let floorPlanRotationSnapEnabled = false;
let floorPlanExternalEditing = false;
let floorPlanSnapEnabled = (() => {
  try { return localStorage.getItem("floorPlanEditorSnapEnabled") !== "false"; }
  catch { return true; }
})();
let floorPlanGridVisible = (() => {
  try { return localStorage.getItem("floorPlanEditorGridVisible") !== "false"; }
  catch { return true; }
})();

function loadFloorPlanScript(src, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-floor-plan-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(globalThis[globalName]), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.dataset.floorPlanSrc = src;
    script.onload = () => resolve(globalThis[globalName]);
    script.onerror = () => reject(new Error(`Bibliothek konnte nicht geladen werden: ${src}`));
    document.head.appendChild(script);
  });
}

function loadFloorPlanFabric() {
  floorPlanFabricPromise ||= loadFloorPlanScript(FLOOR_PLAN_FABRIC_URL, "fabric");
  return floorPlanFabricPromise;
}

async function loadFloorPlanPdf() {
  floorPlanTracePdfPromise ||= loadFloorPlanScript(FLOOR_PLAN_PDF_URL, "pdfjsLib");
  const pdfjsLib = await floorPlanTracePdfPromise;
  pdfjsLib.GlobalWorkerOptions.workerSrc = FLOOR_PLAN_PDF_WORKER_URL;
  return pdfjsLib;
}

function floorPlanSymbolPaletteHtml({ selected = "", target = "tool" } = {}) {
  const attribute = target === "symbol" ? "data-inspector-symbol" : target === "room" ? "data-inspector-room-symbol" : "data-floor-plan-symbol";
  return Object.entries(FLOOR_PLAN_SYMBOL_CATEGORIES).map(([categoryKey, category]) => {
    const symbols = Object.entries(FLOOR_PLAN_SYMBOLS).filter(([, symbol]) => symbol.category === categoryKey);
    return `<section class="floor-plan-symbol-category"><h4>${esc(category[LANG === "en" ? "en" : "de"])}</h4><div class="floor-plan-symbol-grid">${symbols.map(([key, symbol]) => `<button type="button" class="floor-plan-symbol-choice${selected === key ? " is-selected" : ""}" ${attribute}="${key}" title="${esc(floorPlanSymbolName(symbol))}"><b aria-hidden="true">${esc(symbol.glyph)}</b><span>${esc(floorPlanSymbolName(symbol))}</span></button>`).join("")}</div></section>`;
  }).join("");
}

function floorPlanSymbolPickerHtml({ selected = "info", target = "symbol", allowNone = false } = {}) {
  const symbol = FLOOR_PLAN_SYMBOLS[selected] || FLOOR_PLAN_SYMBOLS.info;
  const selectedName = floorPlanSymbolName(symbol);
  const noneSelected = allowNone && selected === "none";
  const noneButton = allowNone ? `<button type="button" class="floor-plan-symbol-choice floor-plan-symbol-none${noneSelected ? " is-selected" : ""}" data-inspector-room-symbol="none" aria-pressed="${String(noneSelected)}"><b aria-hidden="true">∅</b><span>${esc(tr("floorPlanNoMarker"))}</span></button>` : "";
  return `<details class="floor-plan-symbol-picker"><summary><span class="floor-plan-symbol-picker-glyph" aria-hidden="true">${noneSelected ? "∅" : esc(symbol.glyph)}</span><span>${esc(noneSelected ? tr("floorPlanNoMarker") : selectedName)}</span><span aria-hidden="true">⌄</span></summary><div class="floor-plan-symbol-picker-panel">${noneButton}<div class="floor-plan-symbol-palette is-inspector">${floorPlanSymbolPaletteHtml({ selected: noneSelected ? "" : selected, target })}</div></div></details>`;
}

function floorPlanLinkedRoomIds(documentValue, { excludeObjectId = "" } = {}) {
  const document = normalizeFloorPlanDocument(documentValue);
  return new Set(document.floors.flatMap(floor => floor.objects
    .filter(object => object.type === "room" && object.roomId && object.id !== excludeObjectId)
    .map(object => object.roomId)));
}

function floorPlanRoomOptionLabel(room) {
  return `${esc(room.name)}${room.floor ? ` · ${esc(room.floor)}` : ""}`;
}

function floorPlanRoomOptionsHtml(documentValue, { currentRoomId = "", currentObjectId = "" } = {}) {
  const linkedRoomIds = floorPlanLinkedRoomIds(documentValue, { excludeObjectId: currentObjectId });
  const current = currentRoomId ? S.rooms.filter(room => room.id === currentRoomId) : [];
  const available = S.rooms.filter(room => room.id !== currentRoomId && !linkedRoomIds.has(room.id));
  const linked = S.rooms.filter(room => room.id !== currentRoomId && linkedRoomIds.has(room.id));
  const options = (rooms, { disabled = false, selected = false } = {}) => rooms.map(room => `<option value="${esc(room.id)}"${selected ? " selected" : ""}${disabled ? " disabled" : ""}>${floorPlanRoomOptionLabel(room)}</option>`).join("");
  return `${current.length ? `<optgroup label="${esc(tr("floorPlanCurrentRoom"))}">${options(current, { selected: true })}</optgroup>` : ""}
    ${available.length ? `<optgroup label="${esc(tr("floorPlanAvailableRooms"))}">${options(available)}</optgroup>` : ""}
    ${linked.length ? `<optgroup label="${esc(tr("floorPlanAlreadyLinkedRooms"))}">${options(linked, { disabled: true })}</optgroup>` : ""}`;
}

function floorPlanAvailableRooms(documentValue, { excludeObjectId = "" } = {}) {
  const linkedRoomIds = floorPlanLinkedRoomIds(documentValue, { excludeObjectId });
  return S.rooms.filter(room => !linkedRoomIds.has(room.id));
}

function floorPlanSetupHtml() {
  const externalEnabled = floorPlanExternalEnabled();
  const interactiveEnabled = floorPlanInteractiveEnabled();
  const showExternalPanel = externalEnabled || floorPlanExternalEditing;
  const external = floorPlanUrl();
  const externalPanel = showExternalPanel ? `<div class="floor-plan-source-panel" data-floor-plan-source-panel="external">
      <p class="hint">${esc(tr("floorPlanExternalHint"))}</p>
      <form id="floorPlanForm" class="floor-plan-form">
        <label class="sr-only" for="floorPlanUrl">${esc(tr("floorPlanUrlLabel"))}</label>
        <input id="floorPlanUrl" type="url" inputmode="url" value="${esc(S.con?.floor_plan_url || "")}" placeholder="https://…/lageplan.pdf" aria-label="${esc(tr("floorPlanUrlLabel"))}">
        ${external ? `<a class="btn" href="${esc(external)}" target="_blank" rel="noopener">${esc(tr("openFloorPlan"))}</a>` : ""}
        <button type="submit" class="primary">${esc(tr("save"))}</button>
      </form>
      <p id="floorPlanMsg" class="msg" role="status" aria-live="polite"></p>
    </div>` : "";
  const editorPanel = `<div class="floor-plan-source-panel" data-floor-plan-source-panel="interactive">${S.floorPlanDraft?.document ? floorPlanEditorWorkspaceHtml() : `<div class="floor-plan-creator-empty">
      <span class="floor-plan-empty-glyph" aria-hidden="true">⌖</span>
      <h3>${esc(tr("floorPlanCreatorTitle"))}</h3>
      <p>${esc(tr("floorPlanCreatorHint"))}</p>
      <button type="button" id="floorPlanCreateBtn" class="primary">${esc(tr("floorPlanCreateDraft"))}</button>
    </div>`}</div>`;
  return `<div class="card setup-card floor-plan-setup-card">
    <div class="setup-head-title"><h2>${esc(tr("floorPlanSetupTitle"))}</h2></div>
    <p class="hint">${esc(tr("floorPlanSetupHint"))}</p>
    <div class="floor-plan-source-options" role="group" aria-label="${esc(tr("floorPlanSetupTitle"))}">
      <label><input type="checkbox" data-floor-plan-source-toggle="interactive"${interactiveEnabled ? " checked" : ""}><span><strong>${esc(tr("floorPlanSourceInteractive"))}</strong><small>${esc(tr("floorPlanSourceInteractiveHint"))}</small></span></label>
      <label><input type="checkbox" data-floor-plan-source-toggle="external"${showExternalPanel ? " checked" : ""}><span><strong>${esc(tr("floorPlanSourceFile"))}</strong><small>${esc(tr("floorPlanSourceFileHint"))}</small></span></label>
    </div>
    ${externalPanel}${editorPanel}
    <p id="floorPlanSetupMsg" class="msg" role="status" aria-live="polite"></p>
  </div>`;
}

function floorPlanEditorWorkspaceHtml() {
  const document = normalizeFloorPlanDocument(S.floorPlanDraft.document);
  const activeFloor = document.floors.find(floor => floor.id === S.floorPlanEditorFloorId) || document.floors[0];
  const activeFloorIndex = document.floors.findIndex(floor => floor.id === activeFloor.id);
  S.floorPlanEditorFloorId = activeFloor.id;
  const floorTabs = document.floors.map(floor => `<button type="button" data-floor-plan-floor="${esc(floor.id)}" aria-pressed="${String(floor.id === activeFloor.id)}">${esc(floor.name)}</button>`).join("");
  const roomOptions = floorPlanRoomOptionsHtml(document);
  const hasAvailableRooms = floorPlanAvailableRooms(document).length > 0;
  const customPageSize = document.pageFormat === "custom";
  return `<div class="floor-plan-editor" data-floor-id="${esc(activeFloor.id)}">
    <div class="floor-plan-editor-head">
      <div>
        <span class="floor-plan-editor-kicker">${esc(tr("floorPlanDraft"))}</span>
        <input id="floorPlanDocumentTitle" class="floor-plan-title-input" type="text" value="${esc(document.title)}" placeholder="${esc(S.con?.name || tr("floorPlan"))}" aria-label="${esc(tr("floorPlanTitleLabel"))}">
      </div>
      <div class="floor-plan-editor-actions">
        <span id="floorPlanSaveState" class="floor-plan-save-state" role="status" aria-live="polite">${esc(tr("floorPlanSavedAt"))}</span>
        <button type="button" id="floorPlanVersionsBtn">${esc(tr("floorPlanVersions"))}</button>
        <button type="button" id="floorPlanPreviewBtn">${esc(tr("floorPlanPreview"))}</button>
        <details class="floor-plan-more-menu"><summary class="btn">${esc(tr("floorPlanMoreActions"))} <span aria-hidden="true">⌄</span></summary><div>
          <button type="button" id="floorPlanExportBtn">⇩ ${esc(tr("floorPlanExport"))}</button>
          <button type="button" id="floorPlanImportBtn">⇧ ${esc(tr("floorPlanImport"))}</button>
          <button type="button" id="floorPlanCopyBtn">⧉ ${esc(tr("floorPlanCopy"))}</button>
        </div></details>
        <button type="button" id="floorPlanPublishBtn" class="primary">${esc(tr("floorPlanPublish"))}</button>
      </div>
    </div>
    <div class="floor-plan-page-controls">
      <div class="floor-plan-floor-tabs slot-tabs" role="group" aria-label="${esc(tr("floorPlanFloor"))}">${floorTabs}<button type="button" id="floorPlanAddFloorBtn" title="${esc(tr("floorPlanAddFloor"))}">＋</button></div>
      <div class="floor-plan-floor-order"><span>${esc(tr("floorPlanFloorOrder"))}</span><div role="group" aria-label="${esc(tr("floorPlanFloorOrder"))}"><button type="button" id="floorPlanMoveFloorEarlier" title="${esc(tr("floorPlanMoveFloorEarlier"))}" aria-label="${esc(tr("floorPlanMoveFloorEarlier"))}"${activeFloorIndex <= 0 ? " disabled" : ""}>←</button><button type="button" id="floorPlanMoveFloorLater" title="${esc(tr("floorPlanMoveFloorLater"))}" aria-label="${esc(tr("floorPlanMoveFloorLater"))}"${activeFloorIndex >= document.floors.length - 1 ? " disabled" : ""}>→</button></div></div>
      <label>${esc(tr("floorPlanRenameFloor"))}<input id="floorPlanFloorName" type="text" value="${esc(activeFloor.name)}" maxlength="80"></label>
      <label>${esc(tr("floorPlanPageFormat"))}<select id="floorPlanPageFormat"><option value="a4"${document.pageFormat === "a4" ? " selected" : ""}>A4</option><option value="letter"${document.pageFormat === "letter" ? " selected" : ""}>Letter</option><option value="custom"${customPageSize ? " selected" : ""}>${esc(tr("floorPlanPageFormatCustom"))}</option></select></label>
      <label>${esc(tr("floorPlanOrientation"))}<select id="floorPlanOrientation"><option value="landscape"${document.orientation === "landscape" ? " selected" : ""}>${esc(tr("printOrientationLandscape"))}</option><option value="portrait"${document.orientation === "portrait" ? " selected" : ""}>${esc(tr("printOrientationPortrait"))}</option></select></label>
      <div id="floorPlanCustomPageSize" class="floor-plan-custom-page-size"${customPageSize ? "" : " hidden"}><label>${esc(tr("floorPlanPageWidth"))}<span class="floor-plan-number-input"><input id="floorPlanPageWidth" type="number" min="320" max="2400" step="1" value="${Math.round(document.pageWidth)}"><small aria-hidden="true">px</small></span></label><label>${esc(tr("floorPlanPageHeight"))}<span class="floor-plan-number-input"><input id="floorPlanPageHeight" type="number" min="320" max="2400" step="1" value="${Math.round(document.pageHeight)}"><small aria-hidden="true">px</small></span></label></div>
      <button type="button" id="floorPlanDeleteFloorBtn" class="small danger"${document.floors.length > 1 ? "" : " disabled"}>${esc(tr("floorPlanDeleteFloor"))}</button>
    </div>
    <div class="floor-plan-editor-shell">
      <aside class="floor-plan-toolbox" aria-label="Werkzeuge">
        <section class="floor-plan-tool-section">
          <div class="floor-plan-tool-heading"><span aria-hidden="true">▭</span><div><strong>${esc(tr("floorPlanRoomsTool"))}</strong><small>${esc(tr("floorPlanRoomsToolHint"))}</small></div></div>
          ${S.rooms.length ? `<label class="floor-plan-tool-field"><span>${esc(tr("floorPlanLinkedRoom"))}</span><select id="floorPlanRoomSelect" aria-label="${esc(tr("floorPlanChooseRoom"))}"${hasAvailableRooms ? "" : " disabled"}>${roomOptions}</select></label><button type="button" id="floorPlanAddLinkedRoomBtn" class="primary floor-plan-tool-action"${hasAvailableRooms ? "" : " disabled"}>＋ ${esc(tr("floorPlanAddLinkedRoom"))}</button>` : `<p class="hint">${esc(tr("floorPlanNoRooms"))}</p>`}
          <button type="button" id="floorPlanAddCustomRoomBtn" class="floor-plan-tool-action">＋ ${esc(tr("floorPlanAddCustomRoom"))}</button>
        </section>
        <section class="floor-plan-tool-section">
          <div class="floor-plan-tool-heading"><span aria-hidden="true">T</span><div><strong>${esc(tr("floorPlanLabelsTool"))}</strong><small>${esc(tr("floorPlanLabelsToolHint"))}</small></div></div>
          <button type="button" id="floorPlanAddTextBtn" class="floor-plan-tool-action">T ${esc(tr("floorPlanAddText"))}</button>
        </section>
        <section class="floor-plan-tool-section">
          <div class="floor-plan-tool-heading"><span aria-hidden="true">◇</span><div><strong>${esc(tr("floorPlanShapesTool"))}</strong><small>${esc(tr("floorPlanShapesToolHint"))}</small></div></div>
          <div class="floor-plan-shape-actions">
            <button type="button" data-floor-plan-shape="line" title="${esc(tr("floorPlanShapeLine"))}" aria-label="${esc(tr("floorPlanShapeLine"))}">━</button>
            <button type="button" data-floor-plan-shape="rectangle" title="${esc(tr("floorPlanShapeRectangle"))}" aria-label="${esc(tr("floorPlanShapeRectangle"))}">□</button>
            <button type="button" data-floor-plan-shape="ellipse" title="${esc(tr("floorPlanShapeEllipse"))}" aria-label="${esc(tr("floorPlanShapeEllipse"))}">○</button>
          </div>
        </section>
        <section class="floor-plan-tool-section">
          <div class="floor-plan-tool-heading"><span aria-hidden="true">⌖</span><div><strong>${esc(tr("floorPlanSymbolsTool"))}</strong><small>${esc(tr("floorPlanSymbolsToolHint"))}</small></div></div>
          <button type="button" id="floorPlanSymbolMenuBtn" class="floor-plan-tool-action" aria-expanded="false" aria-controls="floorPlanSymbolPalette">⌖ ${esc(tr("floorPlanChooseSymbol"))}<span aria-hidden="true">⌄</span></button>
          <div id="floorPlanSymbolPalette" class="floor-plan-symbol-palette" hidden>${floorPlanSymbolPaletteHtml()}</div>
        </section>
        <section class="floor-plan-tool-section">
          <div class="floor-plan-tool-heading"><span aria-hidden="true">▧</span><div><strong>${esc(tr("floorPlanGraphicsTool"))}</strong><small>${esc(tr("floorPlanGraphicsToolHint"))}</small></div></div>
          <input id="floorPlanGraphicInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp">
          <button type="button" id="floorPlanAddGraphicBtn" class="floor-plan-tool-action">▧ ${esc(tr("floorPlanAddGraphic"))}</button>
          <small class="floor-plan-graphic-rules">${esc(tr("floorPlanGraphicRules"))}</small>
          <p id="floorPlanGraphicMsg" class="msg floor-plan-tool-msg" role="status" aria-live="polite"></p>
        </section>
        <div class="floor-plan-tool-row floor-plan-history-actions">
          <button type="button" id="floorPlanUndoBtn" title="${esc(tr("floorPlanUndo"))} · Ctrl/⌘ Z" aria-keyshortcuts="Control+Z Meta+Z">↶</button>
          <button type="button" id="floorPlanRedoBtn" title="${esc(tr("floorPlanRedo"))} · Ctrl/⌘ Shift Z" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">↷</button>
          <button type="button" id="floorPlanDuplicateObjectBtn" title="${esc(tr("floorPlanDuplicateObject"))} · Ctrl/⌘ D" aria-label="${esc(tr("floorPlanDuplicateObject"))}" aria-keyshortcuts="Control+D Meta+D">⧉</button>
          <button type="button" id="floorPlanDeleteObjectBtn" class="danger" title="${esc(tr("floorPlanDeleteObject"))} · Delete/Backspace" aria-keyshortcuts="Delete Backspace">⌫</button>
        </div>
      </aside>
      <div class="floor-plan-canvas-stage">
        <div class="floor-plan-canvas-toolbar">
          <div class="floor-plan-zoom-controls" role="group" aria-label="${esc(tr("floorPlanZoom"))}">
            <button type="button" id="floorPlanZoomOut" title="${esc(tr("floorPlanZoomOut"))} · Ctrl/⌘ −" aria-label="${esc(tr("floorPlanZoomOut"))}" aria-keyshortcuts="Control+- Meta+-">−</button>
            <output id="floorPlanZoomValue" aria-live="polite">100 %</output>
            <button type="button" id="floorPlanZoomIn" title="${esc(tr("floorPlanZoomIn"))} · Ctrl/⌘ ＋" aria-label="${esc(tr("floorPlanZoomIn"))}" aria-keyshortcuts="Control+= Meta+=">＋</button>
            <button type="button" id="floorPlanZoomFit" class="floor-plan-zoom-fit" title="${esc(tr("floorPlanZoomFit"))} · Ctrl/⌘ 0" aria-label="${esc(tr("floorPlanZoomFit"))}" aria-keyshortcuts="Control+0 Meta+0"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button>
            <button type="button" id="floorPlanPanToggle" class="floor-plan-pan-toggle floor-plan-grid-toggle" aria-pressed="${String(floorPlanPanEnabled)}" title="${esc(tr("floorPlanPanHint"))} · H / Space" aria-label="${esc(tr("floorPlanPan"))}" aria-keyshortcuts="H Space"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10V6a2 2 0 0 0-4 0v8M18 9a2 2 0 0 1 4 0v5a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.5L2.5 16a2 2 0 0 1 2.8-2.8L8 15.7"/></svg></button>
            <button type="button" id="floorPlanGridToggle" class="floor-plan-grid-toggle" aria-pressed="${String(floorPlanGridVisible)}" title="${esc(tr("floorPlanGridToggle"))} · G" aria-keyshortcuts="G">▦ ${esc(tr("floorPlanGrid"))}</button>
            <button type="button" id="floorPlanSnapToggle" class="floor-plan-grid-toggle" aria-pressed="${String(floorPlanSnapEnabled)}" title="${esc(tr("floorPlanSnapHint"))} · A" aria-keyshortcuts="A">↔ ${esc(tr("floorPlanSnap"))}</button>
            <button type="button" id="floorPlanEditorHelpBtn" class="icon-btn floor-plan-editor-help" aria-label="${esc(tr("floorPlanEditorHelpAria"))}" aria-haspopup="dialog">i</button>
          </div>
          <div class="floor-plan-trace-controls">
            <input id="floorPlanTraceInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf">
            <button type="button" id="floorPlanTraceChoose">▧ ${esc(tr("floorPlanTraceChoose"))}</button>
            <span id="floorPlanTraceName" class="floor-plan-trace-name" hidden></span>
            <label id="floorPlanTracePageLabel" hidden>${esc(tr("floorPlanTracePage"))}<select id="floorPlanTracePage"></select></label>
            <label id="floorPlanTraceOpacityLabel" hidden>${esc(tr("floorPlanTraceOpacity"))}<input id="floorPlanTraceOpacity" type="range" min="10" max="80" step="5" value="35"></label>
            <button type="button" id="floorPlanTraceRemove" class="danger" hidden>${esc(tr("floorPlanTraceRemove"))}</button>
          </div>
        </div>
        <p id="floorPlanTraceHint" class="floor-plan-trace-hint">${esc(tr("floorPlanTraceHint"))}</p>
        <div class="floor-plan-canvas-viewport"><div class="floor-plan-canvas-wrap"><canvas id="floorPlanCanvas"></canvas></div></div>
        <p class="floor-plan-canvas-hint">${esc(LANG === "en" ? "Drag to move · handles resize · the hand tool pans the view" : "Ziehen verschiebt Objekte · Griffe skalieren · das Handwerkzeug bewegt die Ansicht")}</p>
      </div>
      <div class="floor-plan-sidebar">
        <details class="floor-plan-object-panel" open><summary><span>${esc(tr("floorPlanObjectList"))}</span><small id="floorPlanObjectCount">0</small></summary><div id="floorPlanObjectList" class="floor-plan-object-list"></div></details>
        <aside class="floor-plan-inspector" id="floorPlanInspector"><p class="hint">${esc(LANG === "en" ? "Select an item to edit it." : "Wähle ein Element aus, um es zu bearbeiten.")}</p></aside>
      </div>
    </div>
    ${floorPlanEditorHelpDialogHtml()}
  </div>`;
}

function floorPlanEditorHelpDialogHtml() {
  const groups = [
    [tr("floorPlanHelpEdit"), [["⌘/Ctrl Z", tr("floorPlanUndo")], ["⇧ ⌘/Ctrl Z", tr("floorPlanRedo")], ["⌘/Ctrl D", tr("floorPlanDuplicateObject")], ["Delete", tr("floorPlanDeleteObject")]]],
    [tr("floorPlanHelpView"), [["⌘/Ctrl + / −", tr("floorPlanZoom")], ["⌘/Ctrl 0", tr("floorPlanZoomFit")], ["⌘/Ctrl + Mausrad", tr("floorPlanHelpPointerZoom")], ["H / Leertaste", tr("floorPlanPan")]]],
    [tr("floorPlanHelpArrange"), [["G", tr("floorPlanGridToggle")], ["A", tr("floorPlanSnap")], ["⇧ + Drehen", tr("floorPlanHelpRotationSnap")], ["Pfeile", tr("floorPlanHelpArrowMove")]]],
  ];
  return `<dialog id="floorPlanHelpDialog" class="floor-plan-help-dialog" aria-labelledby="floorPlanHelpTitle"><div class="floor-plan-help-head"><div><span class="floor-plan-editor-kicker">${esc(tr("floorPlanHelpKicker"))}</span><h2 id="floorPlanHelpTitle">${esc(tr("floorPlanEditorHelpAria"))}</h2><p>${esc(tr("floorPlanHelpIntro"))}</p></div><button type="button" id="floorPlanHelpClose" class="icon-btn" aria-label="${esc(tr("close"))}">×</button></div><div class="floor-plan-help-groups">${groups.map(([title, rows]) => `<section><h3>${esc(title)}</h3><dl>${rows.map(([key, label]) => `<div><dt><kbd>${esc(key)}</kbd></dt><dd>${esc(label)}</dd></div>`).join("")}</dl></section>`).join("")}</div><p class="floor-plan-help-note">${esc(tr("floorPlanHelpMultiSelect"))}</p><div class="floor-plan-help-actions"><button type="button" id="floorPlanHelpPopout">↗ ${esc(tr("floorPlanHelpPopout"))}</button><button type="button" id="floorPlanHelpDone" class="primary">${esc(tr("close"))}</button></div></dialog>`;
}

function disposeFloorPlanEditor() {
  floorPlanTraceRenderToken += 1;
  floorPlanRotationSnapEnabled = false;
  if (floorPlanSpacePanRestore !== null) {
    floorPlanPanEnabled = floorPlanSpacePanRestore;
    floorPlanSpacePanRestore = null;
  }
  floorPlanEditorAbortController?.abort();
  floorPlanEditorAbortController = null;
  endFloorPlanPanGesture();
  if (floorPlanCanvas) {
    floorPlanCanvas.dispose();
    floorPlanCanvas = null;
  }
  clearTimeout(floorPlanSaveTimer);
}

async function mountFloorPlanSetup() {
  disposeFloorPlanEditor();
  document.querySelectorAll("[data-floor-plan-source-toggle]").forEach(input => input.addEventListener("change", async () => {
    const source = input.dataset.floorPlanSourceToggle;
    const msg = document.getElementById("floorPlanSetupMsg");
    if (source === "external" && input.checked && !floorPlanUrl()) {
      floorPlanExternalEditing = true;
      renderActive({ animate: false });
      requestAnimationFrame(() => document.getElementById("floorPlanUrl")?.focus());
      return;
    }
    try {
      msg.textContent = tr("floorPlanSaving");
      const external = source === "external" ? input.checked : floorPlanExternalEnabled();
      const interactive = source === "interactive" ? input.checked : floorPlanInteractiveEnabled();
      const mode = floorPlanModeForSources({ external, interactive });
      await S.store.setFloorPlanSource(mode, S.con.floor_plan_url || null);
      S.con.floor_plan_mode = mode;
      floorPlanExternalEditing = false;
      renderActive({ animate: false });
    } catch (error) {
      msg.className = "msg err";
      msg.textContent = floorPlanSaveErrorMessage(error);
    }
  }));
  document.getElementById("floorPlanCreateBtn")?.addEventListener("click", createFloorPlanDraft);
  if (!document.getElementById("floorPlanCanvas")) return;
  try {
    await loadFloorPlanFabric();
    initializeFloorPlanCanvas();
    wireFloorPlanEditorControls();
    wireFloorPlanTransferControls();
  } catch (error) {
    const msg = document.getElementById("floorPlanSetupMsg");
    if (msg) { msg.className = "msg err"; msg.textContent = error.message; }
  }
}

async function createFloorPlanDraft() {
  if (!S.role) return;
  const button = document.getElementById("floorPlanCreateBtn");
  if (button) button.disabled = true;
  const floorPlanDocument = newFloorPlanDocument();
  try {
    const revision = await S.store.saveFloorPlanDocument(floorPlanDocument, 0);
    S.floorPlanDraft = { document: floorPlanDocument, revision: Number(revision), published_at: null, updated_at: new Date().toISOString() };
    S.floorPlanEditorFloorId = floorPlanDocument.floors[0].id;
    renderActive({ animate: false });
  } catch (error) {
    const msg = document.getElementById("floorPlanSetupMsg");
    if (msg) { msg.className = "msg err"; msg.textContent = floorPlanSaveErrorMessage(error); }
    if (button) button.disabled = false;
  }
}

function floorPlanActiveFloor() {
  return floorPlanEditorDocument?.floors.find(floor => floor.id === S.floorPlanEditorFloorId) || floorPlanEditorDocument?.floors[0];
}

function floorPlanFabricStyles(object) {
  const controlWidth = Number(object.fpDomainWidth || object.fpWidth || object.width || 0) * Math.abs(object.scaleX || 1);
  const controlHeight = Number(object.fpDomainHeight || object.fpHeight || object.height || 0) * Math.abs(object.scaleY || 1);
  const controlExtent = Math.max(1, Math.min(controlWidth || 16, controlHeight || 16));
  object.set({
    borderColor: "#5b8def", cornerColor: "#ffffff", cornerStrokeColor: "#5b8def",
    cornerStyle: "circle", cornerSize: Math.max(10, Math.min(16, controlExtent * .24)), transparentCorners: false, borderScaleFactor: 2,
    padding: 0, lockScalingFlip: true,
    snapAngle: floorPlanRotationSnapEnabled ? FLOOR_PLAN_ROTATION_SNAP : 0,
    snapThreshold: floorPlanRotationSnapEnabled ? FLOOR_PLAN_ROTATION_SNAP / 2 : 0,
    opacity: Math.min(1, Math.max(0, Number(object.fpOpacity ?? 1))),
  });
  return object;
}

function floorPlanFabricRoom(object) {
  const room = floorPlanRoom(object.roomId);
  const label = object.labelOverride || room?.name || object.fallbackLabel || tr("floorPlanUnlinkedRoom");
  const color = floorPlanObjectRoomColor(object, room);
  const foreground = floorPlanObjectRoomForeground(object, room);
  const labelVisible = object.labelVisible !== false;
  const locationLabel = labelVisible ? room?.floor || object.customLocation || "" : "";
  const layout = floorPlanRoomLayout(object, label, locationLabel);
  const markerScale = floorPlanObjectRoomSymbol(object, room)?.glyphScale || 1;
  const cornerRadius = Math.min(object.cornerRadius ?? 0, object.width / 2, object.height / 2);
  const fillOpacity = Math.min(1, Math.max(0, Number(object.fillOpacity ?? .15)));
  const outlineVisible = object.outlineVisible !== false;
  const fillAlpha = Math.round(fillOpacity * 255).toString(16).padStart(2, "0");
  const shapeType = object.shape === "ellipse" ? "ellipse" : "rectangle";
  const rect = shapeType === "ellipse"
    ? new fabric.Ellipse({ left: 0, top: 0, originX: "center", originY: "center", rx: object.width / 2, ry: object.height / 2, fill: `${color}${fillAlpha}`, stroke: outlineVisible ? color : "rgba(0,0,0,0)", strokeWidth: outlineVisible ? 4 : 0, strokeUniform: true })
    : new fabric.Rect({ left: 0, top: 0, originX: "center", originY: "center", width: object.width, height: object.height, rx: cornerRadius, ry: cornerRadius, fill: `${color}${fillAlpha}`, stroke: outlineVisible ? color : "rgba(0,0,0,0)", strokeWidth: outlineVisible ? 4 : 0, strokeUniform: true });
  const text = labelVisible ? new fabric.Textbox(layout.lines.join("\n"), { left: 0, top: layout.labelCenterY - object.height / 2, originX: "center", originY: "center", width: layout.labelWidth, textAlign: "center", fontSize: layout.labelFontSize, lineHeight: layout.lineHeight / layout.labelFontSize, fontWeight: "700", fill: foreground, fontFamily: "Arial", splitByGrapheme: true, editable: false }) : null;
  const marker = object.markerVisible === false ? null : new fabric.FabricText(floorPlanObjectRoomGlyph(object, room), { left: 0, top: layout.markerCenterY - object.height / 2, originX: "center", originY: "center", fontSize: layout.markerSize * markerScale, fontWeight: "800", fill: foreground, fontFamily: "Arial" });
  const location = layout.locationText ? new fabric.Textbox(layout.locationText, { left: 0, top: layout.locationY - object.height / 2, originX: "center", originY: "center", width: layout.labelWidth, textAlign: "center", fontSize: layout.locationFontSize, fill: foreground, fontFamily: "Arial", splitByGrapheme: true, editable: false }) : null;
  const group = new fabric.Group([rect, marker, text, location].filter(Boolean), { left: object.x, top: object.y, originX: "left", originY: "top", angle: object.rotation || 0 });
  Object.assign(group, {
    fpId: object.id,
    fpType: "room",
    fpRoomId: object.roomId,
    fpFallbackLabel: label,
    fpLabelOverride: object.labelOverride || "",
    fpCustomLocation: object.customLocation || "",
    fpCustomColor: object.customColor || "#64748b",
    fpForegroundColor: object.foregroundColor || null,
    fpCustomMarker: object.customMarker || "square",
    fpCustomSymbol: object.customSymbol || `room-marker-${object.customMarker || "square"}`,
    fpLabelVisible: object.labelVisible !== false,
    fpMarkerVisible: object.markerVisible !== false,
    fpShape: shapeType,
    fpCornerRadius: object.cornerRadius ?? 0,
    fpFillOpacity: fillOpacity,
    fpOutlineVisible: outlineVisible,
    fpOpacity: object.opacity ?? 1,
    fpRect: rect,
    fpMarkerText: marker,
    fpRoomLabelText: text,
    fpLocationText: location,
    fpWidth: object.width,
    fpHeight: object.height,
  });
  return floorPlanFabricStyles(group);
}

function floorPlanFabricObject(object) {
  if (object.type === "room") return floorPlanFabricRoom(object);
  if (object.type === "shape") {
    const shapeKind = ["line", "rectangle", "ellipse"].includes(object.shape) ? object.shape : "rectangle";
    const color = /^#[0-9a-f]{6}$/i.test(String(object.color || "")) ? object.color : "#64748b";
    const fillOpacity = shapeKind === "line" ? 1 : Math.min(1, Math.max(0, Number(object.fillOpacity ?? .15)));
    const alpha = Math.round(fillOpacity * 255).toString(16).padStart(2, "0");
    const outlineVisible = shapeKind !== "line" && object.outlineVisible !== false;
    const boundary = new fabric.Rect({ left: 0, top: 0, originX: "center", originY: "center", width: object.width, height: object.height, fill: "rgba(0,0,0,0)", strokeWidth: 0 });
    const primitive = shapeKind === "ellipse"
      ? new fabric.Ellipse({ left: 0, top: 0, originX: "center", originY: "center", rx: object.width / 2, ry: object.height / 2, fill: `${color}${alpha}`, stroke: outlineVisible ? color : "rgba(0,0,0,0)", strokeWidth: outlineVisible ? 2 : 0, strokeUniform: true })
      : new fabric.Rect({ left: 0, top: 0, originX: "center", originY: "center", width: object.width, height: object.height, fill: `${color}${alpha}`, stroke: outlineVisible ? color : "rgba(0,0,0,0)", strokeWidth: outlineVisible ? 2 : 0, strokeUniform: true });
    const group = new fabric.Group([boundary, primitive], { left: object.x + object.width / 2, top: object.y + object.height / 2, originX: "center", originY: "center", angle: object.rotation || 0 });
    Object.assign(group, {
      fpId: object.id, fpType: "shape", fpShape: shapeKind, fpName: object.name || "",
      fpColor: color, fpFillOpacity: fillOpacity, fpOutlineVisible: outlineVisible,
      fpOpacity: object.opacity ?? 1, fpWidth: object.width, fpHeight: object.height, fpShapeObject: primitive,
    });
    return floorPlanFabricStyles(group);
  }
  if (object.type === "text") {
    const layout = floorPlanTextLayout(object);
    const boundary = new fabric.Rect({ left: 0, top: 0, originX: "center", originY: "center", width: object.width, height: object.height, fill: "rgba(0,0,0,0)", strokeWidth: 0 });
    const text = new fabric.Textbox(layout.lines.join("\n"), {
      left: 0, top: 0, originX: "center", originY: "center", width: layout.contentWidth,
      fontSize: layout.fontSize, lineHeight: layout.lineHeight / layout.fontSize, fontWeight: "600",
      fill: object.color || "#172033", fontFamily: "Arial", textAlign: layout.textAlign,
      splitByGrapheme: true, editable: false,
    });
    const group = new fabric.Group([boundary, text], {
      left: object.x + object.width / 2,
      top: object.y + object.height / 2,
      originX: "center",
      originY: "center",
      angle: object.rotation || 0,
    });
    Object.assign(group, {
      fpId: object.id, fpType: "text", fpText: object.text || "Text", fpTextAlign: layout.textAlign,
      fpColor: object.color || "#172033", fpFontSize: object.fontSize || 28,
      fpOutlineVisible: object.outlineVisible !== false, fpOpacity: object.opacity ?? 1,
      fpWidth: object.width, fpHeight: object.height, fpTextBox: text, fpBoundary: boundary,
    });
    return floorPlanFabricStyles(group);
  }
  if (object.type === "image") {
    const element = new Image();
    const image = new fabric.FabricImage(element, {
      left: object.x, top: object.y, originX: "left", originY: "top", width: 1, height: 1,
      scaleX: object.width, scaleY: object.height, angle: object.rotation || 0,
    });
    Object.assign(image, {
      fpId: object.id, fpType: "image", fpSrc: object.src, fpAlt: object.alt || "",
      fpWidth: 1, fpHeight: 1, fpDomainWidth: object.width, fpDomainHeight: object.height,
      fpOutlineVisible: object.outlineVisible !== false,
      fpOpacity: object.opacity ?? 1,
    });
    image.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
    element.addEventListener("load", () => {
      const naturalWidth = Math.max(1, element.naturalWidth || element.width || 1);
      const naturalHeight = Math.max(1, element.naturalHeight || element.height || 1);
      const targetWidth = Math.max(24, image.fpDomainWidth || image.fpWidth * Math.abs(image.scaleX || 1));
      const targetHeight = Math.max(24, image.fpDomainHeight || image.fpHeight * Math.abs(image.scaleY || 1));
      const scale = Math.max(.001, Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight));
      image.set({ width: naturalWidth, height: naturalHeight, scaleX: scale, scaleY: scale, dirty: true });
      image.fpWidth = naturalWidth;
      image.fpHeight = naturalHeight;
      image.fpDomainWidth = naturalWidth * scale;
      image.fpDomainHeight = naturalHeight * scale;
      containFloorPlanFabricPosition(image);
      image.setCoords();
      floorPlanCanvas?.requestRenderAll();
    }, { once: true });
    element.src = object.src;
    return floorPlanFabricStyles(image);
  }
  const symbol = FLOOR_PLAN_SYMBOLS[object.symbol] || FLOOR_PLAN_SYMBOLS.info;
  const backgroundVisible = object.backgroundVisible !== false;
  const outlineVisible = object.outlineVisible !== false;
  const labelVisible = object.labelVisible !== false && Boolean(object.label);
  const layout = floorPlanSymbolLayout({ ...object, labelVisible, backgroundVisible }, symbol);
  const boundary = new fabric.Rect({ left: 0, top: 0, originX: "center", originY: "center", width: object.width, height: object.height, fill: "rgba(0,0,0,0)", strokeWidth: 0 });
  const iconY = layout.iconCenterY - object.height / 2;
  const circle = backgroundVisible ? new fabric.Circle({ left: 0, top: iconY, originX: "center", originY: "center", radius: layout.diameter / 2, fill: "#ffffff", stroke: outlineVisible ? "#62708a" : "rgba(98,112,138,0)", strokeWidth: outlineVisible ? 4 : 0 }) : null;
  const glyph = new fabric.FabricText(symbol.glyph, { left: 0, top: iconY, originX: "center", originY: "center", fontSize: layout.fontSize, fill: "#27344d", stroke: !backgroundVisible && outlineVisible ? "#62708a" : undefined, strokeWidth: !backgroundVisible && outlineVisible ? 3 : 0, paintFirst: "stroke", strokeLineJoin: "round", fontWeight: "700", fontFamily: "Arial" });
  const label = labelVisible ? new fabric.FabricText(object.label, { left: 0, top: layout.labelCenterY - object.height / 2, originX: "center", originY: "center", fontSize: layout.labelFontSize, fill: "#596579", fontWeight: "600", fontFamily: "Arial" }) : null;
  const group = new fabric.Group([boundary, circle, glyph, label].filter(Boolean), { left: object.x, top: object.y, originX: "left", originY: "top", angle: object.rotation || 0 });
  Object.assign(group, { fpId: object.id, fpType: "symbol", fpSymbol: object.symbol, fpLabel: object.label || "", fpLabelVisible: object.labelVisible === true, fpLabelText: label, fpCircle: circle, fpGlyphText: glyph, fpBackgroundVisible: backgroundVisible, fpOutlineVisible: outlineVisible, fpOpacity: object.opacity ?? 1, fpWidth: object.width, fpHeight: object.height });
  return floorPlanFabricStyles(group);
}

function updateFloorPlanFabricTextObject(object, domainValue = floorPlanObjectFromFabric(object)) {
  if (!object || object.fpType !== "text") return object;
  const floor = floorPlanActiveFloor();
  const domain = normalizeFloorPlanObject(domainValue, floor);
  if (!domain) return object;
  const layout = floorPlanTextLayout(domain);
  object.fpText = domain.text;
  object.fpTextAlign = domain.textAlign;
  object.fpColor = domain.color;
  object.fpFontSize = domain.fontSize;
  object.fpWidth = domain.width;
  object.fpHeight = domain.height;
  object.fpOpacity = domain.opacity;
  object.fpBoundary?.set({ width: domain.width, height: domain.height });
  object.fpTextBox?.set({
    text: layout.lines.join("\n"), width: layout.contentWidth, left: 0, top: 0,
    fontSize: layout.fontSize, lineHeight: layout.lineHeight / layout.fontSize,
    textAlign: layout.textAlign, fill: domain.color,
  });
  object.fpTextBox?.initDimensions?.();
  object.triggerLayout?.();
  object.set({
    left: domain.x + domain.width / 2,
    top: domain.y + domain.height / 2,
    originX: "center",
    originY: "center",
    scaleX: 1,
    scaleY: 1,
    angle: domain.rotation,
    opacity: domain.opacity,
    dirty: true,
  });
  object.setCoords();
  return object;
}

function setFloorPlanEditorZoom(value) {
  floorPlanEditorZoom = Math.min(2, Math.max(.4, Math.round(Number(value) * 10) / 10));
  const wrap = document.querySelector(".floor-plan-canvas-wrap");
  const stage = document.querySelector(".floor-plan-canvas-stage");
  if (wrap) wrap.style.width = `${floorPlanEditorZoom * 100}%`;
  stage?.classList.toggle("is-zoomed-in", floorPlanEditorZoom > 1);
  const output = document.getElementById("floorPlanZoomValue");
  if (output) output.textContent = `${Math.round(floorPlanEditorZoom * 100)} %`;
  const zoomOut = document.getElementById("floorPlanZoomOut");
  const zoomIn = document.getElementById("floorPlanZoomIn");
  if (zoomOut) zoomOut.disabled = floorPlanEditorZoom <= .4;
  if (zoomIn) zoomIn.disabled = floorPlanEditorZoom >= 2;
  requestAnimationFrame(() => floorPlanCanvas?.calcOffset());
}

function endFloorPlanPanGesture() {
  floorPlanPanGesture = null;
  document.querySelector(".floor-plan-canvas-stage")?.classList.remove("is-panning");
  if (floorPlanPanEnabled) floorPlanCanvas?.setCursor("grab");
}

function applyFloorPlanPanMode({ preserveSelection = false } = {}) {
  const stage = document.querySelector(".floor-plan-canvas-stage");
  const button = document.getElementById("floorPlanPanToggle");
  stage?.classList.toggle("is-pan-enabled", floorPlanPanEnabled);
  button?.setAttribute("aria-pressed", String(floorPlanPanEnabled));
  if (!floorPlanCanvas) return;
  floorPlanCanvas.selection = !floorPlanPanEnabled;
  floorPlanCanvas.skipTargetFind = floorPlanPanEnabled;
  floorPlanCanvas.defaultCursor = floorPlanPanEnabled ? "grab" : "default";
  floorPlanCanvas.hoverCursor = floorPlanPanEnabled ? "grab" : "move";
  floorPlanCanvas.moveCursor = floorPlanPanEnabled ? "grab" : "move";
  if (floorPlanPanEnabled && !preserveSelection) floorPlanCanvas.discardActiveObject();
  else endFloorPlanPanGesture();
  floorPlanCanvas.setCursor(floorPlanPanEnabled ? "grab" : "default");
  floorPlanCanvas.requestRenderAll();
}

function toggleFloorPlanPan() {
  floorPlanPanEnabled = !floorPlanPanEnabled;
  endFloorPlanPanGesture();
  applyFloorPlanPanMode();
}

function wireFloorPlanPanGesture() {
  const surface = floorPlanCanvas?.upperCanvasEl;
  const stage = document.querySelector(".floor-plan-canvas-stage");
  const viewport = document.querySelector(".floor-plan-canvas-viewport");
  const signal = floorPlanEditorAbortController?.signal;
  if (!surface || !stage || !viewport || !signal) return;
  const finish = event => {
    if (!floorPlanPanGesture || event.pointerId !== floorPlanPanGesture.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    endFloorPlanPanGesture();
  };
  surface.addEventListener("pointerdown", event => {
    if (!floorPlanPanEnabled || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    floorPlanCanvas?.discardActiveObject();
    floorPlanPanGesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    surface.setPointerCapture?.(event.pointerId);
    stage.classList.add("is-panning");
    floorPlanCanvas?.setCursor("grabbing");
  }, { capture: true, signal });
  surface.addEventListener("pointermove", event => {
    const gesture = floorPlanPanGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.x);
    viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.y);
  }, { capture: true, signal });
  surface.addEventListener("pointerup", finish, { capture: true, signal });
  surface.addEventListener("pointercancel", finish, { capture: true, signal });
  surface.addEventListener("lostpointercapture", endFloorPlanPanGesture, { signal });
}

function wireFloorPlanWheelZoom() {
  const viewport = document.querySelector(".floor-plan-canvas-viewport");
  const wrap = document.querySelector(".floor-plan-canvas-wrap");
  const signal = floorPlanEditorAbortController?.signal;
  if (!viewport || !wrap || !signal) return;
  viewport.addEventListener("wheel", event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const nextZoom = Math.min(2, Math.max(.4, Math.round((floorPlanEditorZoom + (event.deltaY < 0 ? .1 : -.1)) * 10) / 10));
    if (nextZoom === floorPlanEditorZoom) return;
    const bounds = viewport.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const contentX = (viewport.scrollLeft + pointerX) / Math.max(1, viewport.scrollWidth);
    const contentY = (viewport.scrollTop + pointerY) / Math.max(1, viewport.scrollHeight);
    wrap.classList.add("is-wheel-zooming");
    setFloorPlanEditorZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * viewport.scrollWidth - pointerX;
      viewport.scrollTop = contentY * viewport.scrollHeight - pointerY;
      requestAnimationFrame(() => wrap.classList.remove("is-wheel-zooming"));
    });
  }, { passive: false, signal });
}

function applyFloorPlanGridVisibility() {
  const floor = floorPlanActiveFloor();
  const container = document.querySelector(".floor-plan-canvas-wrap .canvas-container");
  if (container && floor) {
    container.classList.toggle("is-grid-visible", floorPlanGridVisible);
    container.style.setProperty("--floor-plan-grid-x", `${(12 / floor.width) * 100}%`);
    container.style.setProperty("--floor-plan-grid-y", `${(12 / floor.height) * 100}%`);
  }
  const button = document.getElementById("floorPlanGridToggle");
  if (button) button.setAttribute("aria-pressed", String(floorPlanGridVisible));
}

function toggleFloorPlanGrid() {
  floorPlanGridVisible = !floorPlanGridVisible;
  try { localStorage.setItem("floorPlanEditorGridVisible", String(floorPlanGridVisible)); }
  catch { /* Die rein lokale Komforteinstellung darf den Editor nicht blockieren. */ }
  applyFloorPlanGridVisibility();
}

function toggleFloorPlanSnap() {
  floorPlanSnapEnabled = !floorPlanSnapEnabled;
  try { localStorage.setItem("floorPlanEditorSnapEnabled", String(floorPlanSnapEnabled)); }
  catch { /* Die lokale Komforteinstellung darf den Editor nicht blockieren. */ }
  const button = document.getElementById("floorPlanSnapToggle");
  if (button) button.setAttribute("aria-pressed", String(floorPlanSnapEnabled));
  if (!floorPlanSnapEnabled) clearFloorPlanSnapGuides();
}

function floorPlanSnapCandidate(activeValues, targetValues, threshold = 8) {
  let best = null;
  for (const active of activeValues) for (const target of targetValues) {
    const delta = target - active;
    if (Math.abs(delta) <= threshold && (best == null || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target };
  }
  return best;
}

function floorPlanSnapGuide(axis) {
  const container = document.querySelector(".floor-plan-canvas-wrap .canvas-container");
  if (!container) return null;
  let guide = container.querySelector(`[data-floor-plan-snap-guide="${axis}"]`);
  if (!guide) {
    guide = document.createElement("span");
    guide.className = `floor-plan-snap-guide is-${axis}`;
    guide.dataset.floorPlanSnapGuide = axis;
    guide.hidden = true;
    container.appendChild(guide);
  }
  return guide;
}

function showFloorPlanSnapGuides({ x = null, y = null } = {}) {
  const floor = floorPlanActiveFloor();
  if (!floor) return;
  const vertical = floorPlanSnapGuide("vertical");
  const horizontal = floorPlanSnapGuide("horizontal");
  if (vertical) {
    vertical.hidden = x == null;
    if (x != null) vertical.style.left = `${Math.min(100, Math.max(0, x / floor.width * 100))}%`;
  }
  if (horizontal) {
    horizontal.hidden = y == null;
    if (y != null) horizontal.style.top = `${Math.min(100, Math.max(0, y / floor.height * 100))}%`;
  }
}

function clearFloorPlanSnapGuides() {
  document.querySelectorAll("[data-floor-plan-snap-guide]").forEach(guide => { guide.hidden = true; });
}

function floorPlanSnapContext(object) {
  const floor = floorPlanActiveFloor();
  if (!floor || !floorPlanCanvas || !object) return null;
  const xTargets = [0, floor.width / 2, floor.width];
  const yTargets = [0, floor.height / 2, floor.height];
  const isActiveSelection = Boolean(object.getObjects)
    && (String(object.type || "").toLowerCase() === "activeselection" || object.isType?.("ActiveSelection"));
  const movingObjects = new Set(isActiveSelection ? object.getObjects() : [object]);
  floorPlanCanvas.getObjects().filter(other => !movingObjects.has(other)).forEach(other => {
    const target = other.getBoundingRect();
    xTargets.push(target.left, target.left + target.width / 2, target.left + target.width);
    yTargets.push(target.top, target.top + target.height / 2, target.top + target.height);
  });
  // Die Toleranz bleibt auch bei verkleinerter/vergrößerter Arbeitsfläche
  // ungefähr acht sichtbare Pixel groß: präzise, aber noch gut auffindbar.
  const threshold = 8 / floorPlanEditorZoom;
  return { floor, xTargets, yTargets, threshold };
}

function alignFloorPlanObject(object) {
  if (!floorPlanSnapEnabled || !object) {
    clearFloorPlanSnapGuides();
    return;
  }
  const context = floorPlanSnapContext(object);
  if (!context) return;
  object.setCoords();
  const box = object.getBoundingRect();
  const { xTargets, yTargets, threshold } = context;
  const xSnap = floorPlanSnapCandidate([box.left, box.left + box.width / 2, box.left + box.width], xTargets, threshold);
  const ySnap = floorPlanSnapCandidate([box.top, box.top + box.height / 2, box.top + box.height], yTargets, threshold);
  if (xSnap) object.set("left", object.left + xSnap.delta);
  if (ySnap) object.set("top", object.top + ySnap.delta);
  object.setCoords();
  showFloorPlanSnapGuides({ x: xSnap?.target ?? null, y: ySnap?.target ?? null });
}

function floorPlanScalingEdges(transform) {
  const corner = String(transform?.corner || "").toLowerCase();
  return {
    left: corner.includes("l"), right: corner.includes("r"),
    top: corner.includes("t"), bottom: corner.includes("b"),
  };
}

function floorPlanScaleFactor(box, edge, snap, minSize = 24) {
  if (!snap) return null;
  const currentSize = edge === "left" || edge === "right" ? box.width : box.height;
  const desiredSize = edge === "left" || edge === "top" ? currentSize - snap.delta : currentSize + snap.delta;
  if (!Number.isFinite(desiredSize) || desiredSize < minSize || currentSize <= 0) return null;
  return desiredSize / currentSize;
}

function scaleFloorPlanObjectAroundAnchor(object, edges, axis, factor, uniform) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  object.setCoords();
  const before = object.getBoundingRect();
  const anchorX = edges.left ? before.left + before.width : edges.right ? before.left : before.left + before.width / 2;
  const anchorY = edges.top ? before.top + before.height : edges.bottom ? before.top : before.top + before.height / 2;
  if (uniform || axis === "x") object.set("scaleX", Math.max(.01, object.scaleX * factor));
  if (uniform || axis === "y") object.set("scaleY", Math.max(.01, object.scaleY * factor));
  object.setCoords();
  const after = object.getBoundingRect();
  const nextAnchorX = edges.left ? after.left + after.width : edges.right ? after.left : after.left + after.width / 2;
  const nextAnchorY = edges.top ? after.top + after.height : edges.bottom ? after.top : after.top + after.height / 2;
  object.set({ left: object.left + anchorX - nextAnchorX, top: object.top + anchorY - nextAnchorY });
  object.setCoords();
}

function resizeFloorPlanObjectToSnap(object, transform) {
  if (!floorPlanSnapEnabled || !object) {
    clearFloorPlanSnapGuides();
    return;
  }
  const context = floorPlanSnapContext(object);
  if (!context) return;
  const edges = floorPlanScalingEdges(transform);
  const xEdge = edges.left ? "left" : edges.right ? "right" : null;
  const yEdge = edges.top ? "top" : edges.bottom ? "bottom" : null;
  if (!xEdge && !yEdge) {
    clearFloorPlanSnapGuides();
    return;
  }
  object.setCoords();
  const box = object.getBoundingRect();
  const activeX = xEdge === "left" ? box.left : xEdge === "right" ? box.left + box.width : null;
  const activeY = yEdge === "top" ? box.top : yEdge === "bottom" ? box.top + box.height : null;
  const xSnap = activeX == null ? null : floorPlanSnapCandidate([activeX], context.xTargets, context.threshold);
  const ySnap = activeY == null ? null : floorPlanSnapCandidate([activeY], context.yTargets, context.threshold);
  const minSize = object.fpType === "shape" ? 1 : 24;
  const xFactor = floorPlanScaleFactor(box, xEdge, xSnap, minSize);
  const yFactor = floorPlanScaleFactor(box, yEdge, ySnap, minSize);
  // Eckgriffe und Bilder bleiben proportional. Falls beide Achsen in Reichweite
  // sind, gewinnt die kleinere sichtbare Größenkorrektur; so springt der Griff
  // nicht zwischen zwei widersprüchlichen Seitenverhältnissen.
  const uniform = object.fpType === "image" || Boolean(xEdge && yEdge);
  let axis = null, snap = null, factor = null;
  if (uniform) {
    const choices = [
      xFactor == null ? null : { axis: "x", snap: xSnap, factor: xFactor },
      yFactor == null ? null : { axis: "y", snap: ySnap, factor: yFactor },
    ].filter(Boolean).sort((a, b) => Math.abs(a.factor - 1) - Math.abs(b.factor - 1));
    ({ axis = null, snap = null, factor = null } = choices[0] || {});
  } else if (xFactor != null) ({ axis, snap, factor } = { axis: "x", snap: xSnap, factor: xFactor });
  else if (yFactor != null) ({ axis, snap, factor } = { axis: "y", snap: ySnap, factor: yFactor });
  if (!axis || !snap || factor == null) {
    clearFloorPlanSnapGuides();
    return;
  }
  scaleFloorPlanObjectAroundAnchor(object, edges, axis, factor, uniform);
  // Bei gedrehten Objekten besteht die sichtbare Bounding-Box aus beiden
  // lokalen Achsen. Zwei kurze Korrekturschritte bringen deshalb auch deren
  // gezogene Außenkante pixelgenau auf die gewählte Hilfslinie.
  for (let pass = 0; pass < 3; pass += 1) {
    object.setCoords();
    const currentBox = object.getBoundingRect();
    const currentEdge = axis === "x"
      ? xEdge === "left" ? currentBox.left : currentBox.left + currentBox.width
      : yEdge === "top" ? currentBox.top : currentBox.top + currentBox.height;
    const residual = snap.target - currentEdge;
    if (Math.abs(residual) <= .05) break;
    const correction = floorPlanScaleFactor(currentBox, axis === "x" ? xEdge : yEdge, { delta: residual }, minSize);
    if (correction == null) break;
    scaleFloorPlanObjectAroundAnchor(object, edges, axis, correction, uniform);
  }
  object.setCoords();
  const finalBox = object.getBoundingRect();
  const finalX = xEdge === "left" ? finalBox.left : xEdge === "right" ? finalBox.left + finalBox.width : null;
  const finalY = yEdge === "top" ? finalBox.top : yEdge === "bottom" ? finalBox.top + finalBox.height : null;
  const guideTolerance = 1 / floorPlanEditorZoom;
  const guideX = axis === "x" ? snap.target : xSnap && finalX != null && Math.abs(finalX - xSnap.target) <= guideTolerance ? xSnap.target : null;
  const guideY = axis === "y" ? snap.target : ySnap && finalY != null && Math.abs(finalY - ySnap.target) <= guideTolerance ? ySnap.target : null;
  showFloorPlanSnapGuides({ x: guideX, y: guideY });
  floorPlanCanvas.requestRenderAll();
}

function floorPlanTraceEntry() {
  return floorPlanTraceReferences.get(S.floorPlanEditorFloorId) || null;
}

function disposeFloorPlanTraceEntry(entry) {
  if (!entry) return;
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  entry.pdfDocument?.destroy?.().catch?.(() => {});
}

function floorPlanTraceImage(elementOrUrl) {
  if (elementOrUrl instanceof HTMLCanvasElement || elementOrUrl instanceof HTMLImageElement && elementOrUrl.complete) return Promise.resolve(elementOrUrl);
  return new Promise((resolve, reject) => {
    const image = elementOrUrl instanceof HTMLImageElement ? elementOrUrl : new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(tr("floorPlanTraceUnreadable")));
    if (!(elementOrUrl instanceof HTMLImageElement)) image.src = elementOrUrl;
  });
}

async function createFloorPlanTraceEntry(file) {
  if (!file || file.size > FLOOR_PLAN_TRACE_MAX_BYTES) throw new Error(tr("floorPlanTraceFileError"));
  if (!FLOOR_PLAN_TRACE_TYPES.has(file.type)) throw new Error(tr("floorPlanTraceTypeError"));
  if (file.type === "application/pdf") {
    const pdfjsLib = await loadFloorPlanPdf();
    const pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    if (!pdfDocument.numPages) { await pdfDocument.destroy(); throw new Error(tr("floorPlanTraceUnreadable")); }
    return { kind: "pdf", name: file.name, opacity: .35, page: 1, pageCount: pdfDocument.numPages, pdfDocument };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    await floorPlanTraceImage(objectUrl);
    return { kind: "image", name: file.name, opacity: .35, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function floorPlanTraceSource(entry, floor) {
  if (entry.kind === "image") {
    const image = await floorPlanTraceImage(entry.objectUrl);
    return { element: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  }
  const page = await entry.pdfDocument.getPage(entry.page);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, floor.width / initialViewport.width, floor.height / initialViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
  return { element: canvas, width: canvas.width, height: canvas.height };
}

async function applyFloorPlanTraceReference() {
  const canvas = floorPlanCanvas;
  const floor = floorPlanActiveFloor();
  const entry = floorPlanTraceEntry();
  const token = ++floorPlanTraceRenderToken;
  if (!canvas || !floor || !entry) {
    if (canvas) { canvas.backgroundImage = undefined; canvas.requestRenderAll(); }
    return;
  }
  const source = await floorPlanTraceSource(entry, floor);
  if (token !== floorPlanTraceRenderToken || canvas !== floorPlanCanvas || entry !== floorPlanTraceEntry()) return;
  const scale = Math.min(floor.width / source.width, floor.height / source.height);
  const background = new fabric.FabricImage(source.element, {
    left: (floor.width - source.width * scale) / 2,
    top: (floor.height - source.height * scale) / 2,
    originX: "left", originY: "top", scaleX: scale, scaleY: scale,
    opacity: entry.opacity, selectable: false, evented: false, excludeFromExport: true,
  });
  canvas.backgroundImage = background;
  canvas.requestRenderAll();
}

function updateFloorPlanTraceControls(message = "", isError = false) {
  const entry = floorPlanTraceEntry();
  const name = document.getElementById("floorPlanTraceName");
  const pageLabel = document.getElementById("floorPlanTracePageLabel");
  const pageSelect = document.getElementById("floorPlanTracePage");
  const opacityLabel = document.getElementById("floorPlanTraceOpacityLabel");
  const opacity = document.getElementById("floorPlanTraceOpacity");
  const remove = document.getElementById("floorPlanTraceRemove");
  const hint = document.getElementById("floorPlanTraceHint");
  if (name) { name.hidden = !entry; name.textContent = entry?.name || ""; name.title = entry?.name || ""; }
  if (opacityLabel) opacityLabel.hidden = !entry;
  if (opacity && entry) opacity.value = String(Math.round(entry.opacity * 100));
  if (remove) remove.hidden = !entry;
  if (pageLabel) pageLabel.hidden = !entry || entry.kind !== "pdf" || entry.pageCount <= 1;
  if (pageSelect && entry?.kind === "pdf") pageSelect.innerHTML = Array.from({ length: entry.pageCount }, (_, index) => `<option value="${index + 1}"${entry.page === index + 1 ? " selected" : ""}>${index + 1} / ${entry.pageCount}</option>`).join("");
  if (hint) { hint.className = `floor-plan-trace-hint${isError ? " is-error" : ""}`; hint.textContent = message || tr(entry ? "floorPlanTraceActiveHint" : "floorPlanTraceHint"); }
}

function initializeFloorPlanCanvas() {
  floorPlanEditorAbortController = new AbortController();
  floorPlanEditorDocument = normalizeFloorPlanDocument(S.floorPlanDraft.document);
  const floor = floorPlanActiveFloor();
  floorPlanCanvas = new fabric.Canvas("floorPlanCanvas", {
    width: floor.width, height: floor.height, backgroundColor: "transparent", preserveObjectStacking: true,
    uniformScaling: true,
    selectionColor: "rgba(91,141,239,.12)", selectionBorderColor: "#5b8def", selectionLineWidth: 2,
  });
  floorPlanCanvas.add(...floor.objects.map(floorPlanFabricObject));
  floorPlanCanvas.on("selection:created", () => { if (!floorPlanSelectionSyncing) { renderFloorPlanInspector(); renderFloorPlanObjectList(); } });
  floorPlanCanvas.on("selection:updated", () => { if (!floorPlanSelectionSyncing) { renderFloorPlanInspector(); renderFloorPlanObjectList(); } });
  floorPlanCanvas.on("selection:cleared", () => { clearFloorPlanSnapGuides(); if (!floorPlanSelectionSyncing) { renderFloorPlanInspector(); renderFloorPlanObjectList(); } });
  floorPlanCanvas.on("object:moving", event => {
    const object = event.target;
    if (floorPlanGridVisible) object.set({ left: Math.round(object.left / 12) * 12, top: Math.round(object.top / 12) * 12 });
    alignFloorPlanObject(object);
    containFloorPlanFabricPosition(object);
  });
  floorPlanCanvas.on("object:scaling", event => {
    const object = event.target;
    if (object?.fpType === "image") object.set("scaleY", object.scaleX);
    resizeFloorPlanObjectToSnap(object, event.transform);
  });
  floorPlanCanvas.on("object:rotating", snapFloorPlanRotation);
  floorPlanCanvas.on("object:modified", event => {
    clearFloorPlanSnapGuides();
    if (!normalizeFloorPlanFabricObject(event.target)) floorPlanCanvasChanged();
  });
  floorPlanCanvas.on("mouse:up", clearFloorPlanSnapGuides);
  wireFloorPlanPanGesture();
  wireFloorPlanWheelZoom();
  floorPlanHistory = [JSON.stringify(floorPlanEditorDocument)];
  floorPlanFuture = [];
  updateFloorPlanHistoryButtons();
  renderFloorPlanObjectList();
  updateFloorPlanTraceControls();
  setFloorPlanEditorZoom(floorPlanEditorZoom);
  applyFloorPlanGridVisibility();
  applyFloorPlanPanMode();
  applyFloorPlanTraceReference().catch(error => updateFloorPlanTraceControls(error.message, true));
  requestAnimationFrame(() => floorPlanCanvas.calcOffset());
}

function snapFloorPlanRotation(event) {
  const object = event?.target;
  if (!object) return false;
  const enabled = Boolean(event.e?.shiftKey || floorPlanRotationSnapEnabled);
  object.set({
    snapAngle: enabled ? FLOOR_PLAN_ROTATION_SNAP : 0,
    snapThreshold: enabled ? FLOOR_PLAN_ROTATION_SNAP / 2 : 0,
  });
  if (!enabled) return false;
  object.set("angle", Math.round(Number(object.angle || 0) / FLOOR_PLAN_ROTATION_SNAP) * FLOOR_PLAN_ROTATION_SNAP);
  object.setCoords();
  return true;
}

function setFloorPlanRotationSnap(enabled) {
  floorPlanRotationSnapEnabled = Boolean(enabled);
  if (!floorPlanCanvas) return;
  const active = floorPlanCanvas.getActiveObject();
  const objects = [...floorPlanCanvas.getObjects(), ...(active && !floorPlanCanvas.getObjects().includes(active) ? [active] : [])];
  objects.forEach(object => object.set({
    snapAngle: floorPlanRotationSnapEnabled ? FLOOR_PLAN_ROTATION_SNAP : 0,
    snapThreshold: floorPlanRotationSnapEnabled ? FLOOR_PLAN_ROTATION_SNAP / 2 : 0,
  }));
}

function floorPlanObjectFromFabric(object) {
  const objectWidth = Number.isFinite(object.fpWidth) ? object.fpWidth : object.width;
  const objectHeight = Number.isFinite(object.fpHeight) ? object.fpHeight : object.height;
  const minDimension = object.fpType === "shape" ? 1 : 24;
  const width = Math.max(minDimension, Math.round(objectWidth * object.scaleX));
  const height = Math.max(minDimension, Math.round(objectHeight * object.scaleY));
  const center = ["text", "shape"].includes(object.fpType) ? object.getCenterPoint?.() : null;
  const base = {
    id: object.fpId || floorPlanId(object.fpType), type: object.fpType,
    x: Math.max(0, Math.round(center ? center.x - width / 2 : object.left)),
    y: Math.max(0, Math.round(center ? center.y - height / 2 : object.top)),
    width,
    height,
    rotation: Math.round(object.angle || 0),
    outlineVisible: object.fpOutlineVisible !== false,
    opacity: Math.min(1, Math.max(0, Number(object.fpOpacity ?? 1))),
  };
  if (object.fpType === "room") return {
    ...base,
    roomId: object.fpRoomId || null,
    fallbackLabel: object.fpFallbackLabel || "",
    labelOverride: object.fpLabelOverride || "",
    customLocation: object.fpCustomLocation || "",
    customColor: object.fpCustomColor || "#64748b",
    foregroundColor: /^#[0-9a-f]{6}$/i.test(String(object.fpForegroundColor || "")) ? object.fpForegroundColor : null,
    customMarker: object.fpCustomMarker || "square",
    customSymbol: object.fpCustomSymbol || `room-marker-${object.fpCustomMarker || "square"}`,
    labelVisible: object.fpLabelVisible !== false,
    markerVisible: object.fpMarkerVisible !== false,
    shape: object.fpShape === "ellipse" ? "ellipse" : "rectangle",
    cornerRadius: Number.isFinite(object.fpCornerRadius) ? object.fpCornerRadius : 0,
    fillOpacity: Math.min(1, Math.max(0, Number(object.fpFillOpacity ?? .15))),
  };
  if (object.fpType === "text") return { ...base, text: object.fpText || "Text", color: object.fpColor || "#172033", fontSize: Number.isFinite(object.fpFontSize) ? object.fpFontSize : 28, textAlign: object.fpTextAlign || "center" };
  if (object.fpType === "shape") return { ...base, shape: object.fpShape || "rectangle", name: object.fpName || "", color: object.fpColor || "#64748b", fillOpacity: Math.min(1, Math.max(0, Number(object.fpFillOpacity ?? .15))) };
  if (object.fpType === "image") return { ...base, src: object.fpSrc || "", alt: object.fpAlt || "" };
  return { ...base, symbol: object.fpSymbol || "info", label: object.fpLabel || "", labelVisible: object.fpLabelVisible === true, backgroundVisible: object.fpBackgroundVisible !== false };
}

function containFloorPlanFabricPosition(object) {
  const floor = floorPlanActiveFloor();
  if (!object || !floor) return object;
  object.setCoords();
  const box = object.getBoundingRect();
  if (object.fpType === "text") {
    const domainWidth = Math.max(24, Number(object.fpWidth || object.width || 24) * Math.abs(object.scaleX || 1));
    const domainHeight = Math.max(24, Number(object.fpHeight || object.height || 24) * Math.abs(object.scaleY || 1));
    const center = object.getCenterPoint();
    const minCenterX = Math.max(domainWidth / 2, box.width / 2);
    const maxCenterX = Math.min(floor.width - domainWidth / 2, floor.width - box.width / 2);
    const minCenterY = Math.max(domainHeight / 2, box.height / 2);
    const maxCenterY = Math.min(floor.height - domainHeight / 2, floor.height - box.height / 2);
    const nextCenterX = minCenterX <= maxCenterX ? Math.min(maxCenterX, Math.max(minCenterX, center.x)) : floor.width / 2;
    const nextCenterY = minCenterY <= maxCenterY ? Math.min(maxCenterY, Math.max(minCenterY, center.y)) : floor.height / 2;
    object.set({ left: nextCenterX, top: nextCenterY, originX: "center", originY: "center" });
    object.setCoords();
    return object;
  }
  let deltaX = 0;
  let deltaY = 0;
  if (box.width <= floor.width) {
    if (box.left < 0) deltaX = -box.left;
    else if (box.left + box.width > floor.width) deltaX = floor.width - box.left - box.width;
  }
  if (box.height <= floor.height) {
    if (box.top < 0) deltaY = -box.top;
    else if (box.top + box.height > floor.height) deltaY = floor.height - box.top - box.height;
  }
  if (deltaX || deltaY) object.set({ left: object.left + deltaX, top: object.top + deltaY });
  object.setCoords();
  return object;
}

function normalizeFloorPlanFabricObject(object) {
  const floor = floorPlanActiveFloor();
  if (!object || !floor) return false;
  if (object.fpType === "text") containFloorPlanFabricPosition(object);
  const raw = floorPlanObjectFromFabric(object);
  const domain = normalizeFloorPlanObject(raw, floor);
  if (!domain) return false;
  const scaled = object.fpType === "image"
    ? Math.abs(raw.width - (object.fpDomainWidth || raw.width)) >= 1 || Math.abs(raw.height - (object.fpDomainHeight || raw.height)) >= 1
    : Math.abs((object.scaleX || 1) - 1) >= .001 || Math.abs((object.scaleY || 1) - 1) >= .001;
  if (scaled && object.fpType === "text") {
    updateFloorPlanFabricTextObject(object, domain);
    floorPlanCanvas.requestRenderAll();
    return false;
  }
  if (!scaled) {
    object.set(["text", "shape"].includes(object.fpType)
      ? { left: domain.x + domain.width / 2, top: domain.y + domain.height / 2, originX: "center", originY: "center" }
      : { left: domain.x, top: domain.y });
    object.setCoords();
    return false;
  }
  if (floorPlanObjectNormalizations.has(object)) return true;
  const canvas = floorPlanCanvas;
  const index = canvas.getObjects().indexOf(object);
  floorPlanObjectNormalizations.add(object);
  requestAnimationFrame(() => {
    floorPlanObjectNormalizations.delete(object);
    if (canvas !== floorPlanCanvas || index < 0 || !canvas.getObjects().includes(object)) return;
    const replacement = floorPlanFabricObject(domain);
    canvas.remove(object);
    canvas.insertAt(index, replacement);
    canvas.setActiveObject(replacement);
    replacement.setCoords();
    canvas.requestRenderAll();
    floorPlanCanvasChanged();
  });
  return true;
}

function floorPlanSaveErrorMessage(error) {
  const code = String(error?.code || "").toUpperCase();
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "");
  if (code === "PT409" || status === 409 || message.toLowerCase().includes("revision conflict")) return tr("floorPlanConflict");
  if (code === "PT429" || code === "PT503" || status === 429 || status === 503) return tr("floorPlanSaveBusy");
  if (code === "PT413" || status === 413) return tr("floorPlanSaveTooLarge");
  if (code === "RPC_TIMEOUT" || code === "PT504" || status === 504) return tr("floorPlanSaveTimeout");
  if (code === "42501" || status === 401 || status === 403) return tr("floorPlanSaveUnauthorized");
  return tr("floorPlanSaveFailed", { err: message });
}

function floorPlanCanvasObjectsForDocument(floor) {
  const active = floorPlanCanvas?.getActiveObject();
  const isActiveSelection = Boolean(active?.getObjects)
    && (String(active.type || "").toLowerCase() === "activeselection" || active.isType?.("ActiveSelection"));
  const selected = isActiveSelection ? [...active.getObjects()] : [];
  if (isActiveSelection) {
    floorPlanSelectionSyncing = true;
    floorPlanCanvas.discardActiveObject();
    selected.forEach(object => object.setCoords());
  }
  const objects = floorPlanCanvas.getObjects().map(object => normalizeFloorPlanObject(floorPlanObjectFromFabric(object), floor)).filter(Boolean);
  if (isActiveSelection && selected.length) {
    const restored = new fabric.ActiveSelection(selected, { canvas: floorPlanCanvas });
    floorPlanCanvas.setActiveObject(restored);
    restored.setCoords();
    floorPlanCanvas.requestRenderAll();
  }
  floorPlanSelectionSyncing = false;
  return objects;
}

function syncFloorPlanCanvasToDocument({ history = true } = {}) {
  const floor = floorPlanActiveFloor();
  if (!floor || !floorPlanCanvas) return;
  floor.objects = floorPlanCanvasObjectsForDocument(floor);
  const serialized = JSON.stringify(floorPlanEditorDocument);
  if (history && floorPlanHistory.at(-1) !== serialized) {
    floorPlanHistory.push(serialized);
    if (floorPlanHistory.length > 50) floorPlanHistory.shift();
    floorPlanFuture = [];
  }
  updateFloorPlanHistoryButtons();
}

function refreshFloorPlanRoomSelect() {
  const select = document.getElementById("floorPlanRoomSelect");
  const button = document.getElementById("floorPlanAddLinkedRoomBtn");
  if (!select || !floorPlanEditorDocument) return;
  const hasAvailableRooms = floorPlanAvailableRooms(floorPlanEditorDocument).length > 0;
  select.innerHTML = floorPlanRoomOptionsHtml(floorPlanEditorDocument);
  select.disabled = !hasAvailableRooms;
  if (button) button.disabled = !hasAvailableRooms;
}

function floorPlanCanvasChanged() {
  syncFloorPlanCanvasToDocument();
  refreshFloorPlanRoomSelect();
  scheduleFloorPlanSave();
  renderFloorPlanInspector();
  renderFloorPlanObjectList();
}

function scheduleFloorPlanSave() {
  clearTimeout(floorPlanSaveTimer);
  const state = document.getElementById("floorPlanSaveState");
  if (state) { state.className = "floor-plan-save-state"; state.textContent = tr("floorPlanSaving"); }
  const publishButton = document.getElementById("floorPlanPublishBtn");
  if (publishButton) { publishButton.disabled = false; publishButton.textContent = tr("floorPlanPublish"); }
  floorPlanSaveTimer = setTimeout(() => saveFloorPlanNow().catch(() => {}), 900);
}

function saveFloorPlanNow({ sync = true } = {}) {
  clearTimeout(floorPlanSaveTimer);
  if (sync) syncFloorPlanCanvasToDocument({ history: false });
  floorPlanPendingSnapshot = structuredClone(floorPlanEditorDocument);
  S.floorPlanDraft = { ...S.floorPlanDraft, document: structuredClone(floorPlanEditorDocument) };
  const state = document.getElementById("floorPlanSaveState");
  if (state) { state.className = "floor-plan-save-state"; state.textContent = tr("floorPlanSaving"); }
  if (floorPlanSaveInFlight) return floorPlanSaveInFlight;
  floorPlanSaveInFlight = (async () => {
    try {
      let revision = Number(S.floorPlanDraft?.revision || 0);
      while (floorPlanPendingSnapshot) {
        const snapshot = floorPlanPendingSnapshot;
        floorPlanPendingSnapshot = null;
        revision = Number(await S.store.saveFloorPlanDocument(snapshot, revision));
        S.floorPlanDraft = { ...S.floorPlanDraft, document: snapshot, revision, updated_at: new Date().toISOString() };
      }
      const currentState = document.getElementById("floorPlanSaveState");
      if (currentState) { currentState.className = "floor-plan-save-state is-saved"; currentState.textContent = `✓ ${tr("floorPlanSavedAt")}`; }
      return revision;
    } catch (error) {
      const currentState = document.getElementById("floorPlanSaveState");
      if (currentState) { currentState.className = "floor-plan-save-state is-error"; currentState.textContent = floorPlanSaveErrorMessage(error); }
      throw error;
    } finally {
      floorPlanSaveInFlight = null;
    }
  })();
  return floorPlanSaveInFlight;
}

function addFloorPlanObject(object) {
  const fabricObject = floorPlanFabricObject(object);
  floorPlanCanvas.add(fabricObject);
  floorPlanCanvas.setActiveObject(fabricObject);
  floorPlanCanvas.requestRenderAll();
  floorPlanCanvasChanged();
}

function duplicateSelectedFloorPlanObjects() {
  const floor = floorPlanActiveFloor();
  const selected = floorPlanSelectedObjects();
  if (!floor || !selected.length) return;
  const selectedIds = new Set(selected.map(object => object.fpId));
  const domainObjects = floorPlanCanvasObjectsForDocument(floor);
  const originals = domainObjects.filter(object => selectedIds.has(object.id));
  if (!originals.length) return;
  const graphicCopies = originals.filter(object => object.type === "image").length;
  const graphicCount = floorPlanEditorDocument.floors.reduce((count, candidate) => count + (candidate.id === floor.id
    ? domainObjects.filter(object => object.type === "image").length
    : candidate.objects.filter(object => object.type === "image").length), 0);
  if (graphicCount + graphicCopies > FLOOR_PLAN_GRAPHIC_LIMITS.count) {
    const msg = document.getElementById("floorPlanGraphicMsg");
    if (msg) { msg.className = "msg err floor-plan-tool-msg"; msg.textContent = tr("floorPlanGraphicCountError"); }
    return;
  }
  const minX = Math.min(...originals.map(object => object.x));
  const minY = Math.min(...originals.map(object => object.y));
  const maxX = Math.max(...originals.map(object => object.x + object.width));
  const maxY = Math.max(...originals.map(object => object.y + object.height));
  const offset = 18;
  const deltaX = maxX + offset <= floor.width ? offset : minX - offset >= 0 ? -offset : 0;
  const deltaY = maxY + offset <= floor.height ? offset : minY - offset >= 0 ? -offset : 0;
  const copies = originals.map(original => {
    const copy = structuredClone(original);
    if (copy.type === "room" && copy.roomId) {
      const linkedRoom = floorPlanRoom(copy.roomId);
      const marker = validRoomMarker(linkedRoom?.marker) ? linkedRoom.marker : copy.customMarker || "square";
      Object.assign(copy, {
        roomId: null,
        fallbackLabel: copy.labelOverride || linkedRoom?.name || copy.fallbackLabel || tr("floorPlanCustomRoomDefault"),
        labelOverride: "",
        customLocation: linkedRoom?.floor || copy.customLocation || "",
        customColor: floorPlanObjectRoomColor(copy, linkedRoom),
        customMarker: marker,
        customSymbol: `room-marker-${marker}`,
      });
    }
    return normalizeFloorPlanObject({
      ...copy,
      id: floorPlanId(original.type),
      x: original.x + deltaX,
      y: original.y + deltaY,
    }, floor);
  }).filter(Boolean);
  const fabricCopies = copies.map(floorPlanFabricObject);
  floorPlanCanvas.discardActiveObject();
  floorPlanCanvas.add(...fabricCopies);
  if (fabricCopies.length === 1) floorPlanCanvas.setActiveObject(fabricCopies[0]);
  else {
    const activeSelection = new fabric.ActiveSelection(fabricCopies, { canvas: floorPlanCanvas });
    floorPlanCanvas.setActiveObject(activeSelection);
    activeSelection.setCoords();
  }
  floorPlanCanvas.requestRenderAll();
  floorPlanCanvasChanged();
}

function floorPlanCornerRadiusHtml(object) {
  const radius = Math.round(Number.isFinite(object.fpCornerRadius) ? object.fpCornerRadius : 0);
  return `<label class="floor-plan-radius-control"><span>${esc(tr("floorPlanCornerRadius"))}<output id="floorPlanCornerRadiusValue">${radius} px</output></span><input id="floorPlanCornerRadius" type="range" min="0" max="60" step="1" value="${radius}"></label>`;
}

function floorPlanSelectedObjects() {
  return floorPlanCanvas?.getActiveObjects?.() || [];
}

function floorPlanCommonValue(objects, getter) {
  const values = objects.map(getter);
  const first = values[0];
  return { value: first, mixed: values.some(value => value !== first) };
}

function floorPlanBatchToggleHtml(id, label, objects, getter) {
  const common = floorPlanCommonValue(objects, getter);
  return `<label class="floor-plan-property-toggle"><input id="${id}" type="checkbox"${common.value ? " checked" : ""}${common.mixed ? ' data-mixed="true"' : ""}><span>${esc(label)}</span></label>`;
}

function floorPlanBatchRangeHtml(id, label, objects, getter, { min = 0, max = 100, step = 1, suffix = "" } = {}) {
  const common = floorPlanCommonValue(objects, getter);
  const value = Math.min(max, Math.max(min, Number(common.value) || 0));
  const output = common.mixed ? tr("floorPlanDifferentValues") : `${Math.round(value)}${suffix}`;
  return `<label class="floor-plan-radius-control"><span>${esc(label)}<output id="${id}Value"${common.mixed ? ' data-mixed="true"' : ""}>${esc(output)}</output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"${common.mixed ? ' data-mixed="true"' : ""}></label>`;
}

function floorPlanBatchInspectorHtml(objects) {
  const allRooms = objects.every(object => object.fpType === "room");
  const allSymbols = objects.every(object => object.fpType === "symbol");
  const allTexts = objects.every(object => object.fpType === "text");
  const allImages = objects.every(object => object.fpType === "image");
  let properties = "";
  if (allRooms) {
    properties += floorPlanBatchRangeHtml("floorPlanFillOpacity", tr("floorPlanFillOpacity"), objects, object => Math.round(Math.min(1, Math.max(0, Number(object.fpFillOpacity ?? .15))) * 100), { max: 100, step: 5, suffix: " %" });
    properties += floorPlanBatchToggleHtml("floorPlanLabelVisible", tr("floorPlanShowLabel"), objects, object => object.fpLabelVisible !== false);
    properties += floorPlanBatchToggleHtml("floorPlanMarkerVisible", tr("floorPlanShowMarker"), objects, object => object.fpMarkerVisible !== false);
    properties += floorPlanBatchToggleHtml("floorPlanOutlineVisible", tr("floorPlanShowOutline"), objects, object => object.fpOutlineVisible !== false);
    if (objects.every(object => object.fpShape !== "ellipse")) properties += floorPlanBatchRangeHtml("floorPlanCornerRadius", tr("floorPlanCornerRadius"), objects, object => Number.isFinite(object.fpCornerRadius) ? object.fpCornerRadius : 0, { max: 60, suffix: " px" });
  } else if (allSymbols) {
    properties += floorPlanBatchToggleHtml("floorPlanSymbolLabelVisible", tr("floorPlanShowSymbolText"), objects, object => object.fpLabelVisible === true);
    properties += floorPlanBatchToggleHtml("floorPlanSymbolBackgroundVisible", tr("floorPlanShowSymbolCircle"), objects, object => object.fpBackgroundVisible !== false);
    properties += floorPlanBatchToggleHtml("floorPlanOutlineVisible", tr("floorPlanShowSymbolOutline"), objects, object => object.fpOutlineVisible !== false);
  } else if (allTexts) {
    const commonColor = floorPlanCommonValue(objects, object => object.fpColor || "#172033");
    const commonSize = floorPlanCommonValue(objects, object => object.fpFontSize || 28);
    const commonAlign = floorPlanCommonValue(objects, object => object.fpTextAlign || "center");
    properties += `<div class="floor-plan-text-style"><label><span>${esc(tr("floorPlanTextColor"))}</span><input id="floorPlanInspectorTextColor" class="floor-plan-color-input" type="color" value="${esc(commonColor.value)}"${commonColor.mixed ? ' data-mixed="true"' : ""}></label><label><span>${esc(tr("floorPlanTextSize"))}</span><span class="floor-plan-number-input"><input id="floorPlanInspectorTextSize" type="number" min="12" max="96" step="1" value="${Math.round(commonSize.value || 28)}"${commonSize.mixed ? ' data-mixed="true"' : ""}><small aria-hidden="true">px</small></span></label></div><label>${esc(tr("floorPlanTextAlignment"))}<select id="floorPlanInspectorTextAlign">${commonAlign.mixed ? `<option value="" selected disabled>${esc(tr("floorPlanDifferentValues"))}</option>` : ""}<option value="left"${!commonAlign.mixed && commonAlign.value === "left" ? " selected" : ""}>${esc(tr("floorPlanTextAlignLeft"))}</option><option value="center"${!commonAlign.mixed && commonAlign.value === "center" ? " selected" : ""}>${esc(tr("floorPlanTextAlignCenter"))}</option><option value="right"${!commonAlign.mixed && commonAlign.value === "right" ? " selected" : ""}>${esc(tr("floorPlanTextAlignRight"))}</option></select></label>`;
  }
  if (!allRooms) properties += floorPlanBatchRangeHtml("floorPlanOpacity", tr(allImages ? "floorPlanGraphicOpacity" : "floorPlanOpacity"), objects, object => Math.round(Math.min(1, Math.max(0, Number(object.fpOpacity ?? 1))) * 100), { max: 100, step: 5, suffix: " %" });
  return `<div class="floor-plan-inspector-title is-multiple"><span aria-hidden="true">◆</span><div><strong>${esc(tr("floorPlanSelectedObjects", { n: objects.length }))}</strong><small>${esc(tr("floorPlanBatchEditHint"))}</small></div></div>${properties}`;
}

function applyFloorPlanMixedState(inspector) {
  inspector.querySelectorAll('input[type="checkbox"][data-mixed="true"]').forEach(input => { input.indeterminate = true; });
}

function floorPlanMarkerVisibilityHtml(object) {
  return `<label class="floor-plan-property-toggle"><input id="floorPlanMarkerVisible" type="checkbox"${object.fpMarkerVisible === false ? "" : " checked"}><span>${esc(tr("floorPlanShowMarker"))}</span></label>`;
}

function floorPlanLabelVisibilityHtml(object) {
  return `<label class="floor-plan-property-toggle"><input id="floorPlanLabelVisible" type="checkbox"${object.fpLabelVisible === false ? "" : " checked"}><span>${esc(tr("floorPlanShowLabel"))}</span></label>`;
}

function floorPlanSymbolLabelVisibilityHtml(object) {
  return `<label class="floor-plan-property-toggle"><input id="floorPlanSymbolLabelVisible" type="checkbox"${object.fpLabelVisible === true ? " checked" : ""}><span>${esc(tr("floorPlanShowSymbolText"))}</span></label>`;
}

function floorPlanRoomShapeHtml(object) {
  return `<label>${esc(tr("floorPlanRoomShape"))}<select id="floorPlanRoomShape"><option value="rectangle"${object.fpShape === "ellipse" ? "" : " selected"}>${esc(tr("floorPlanRoomShapeRectangle"))}</option><option value="ellipse"${object.fpShape === "ellipse" ? " selected" : ""}>${esc(tr("floorPlanRoomShapeEllipse"))}</option></select></label>`;
}

function floorPlanRoomForegroundHtml(object) {
  const automatic = !/^#[0-9a-f]{6}$/i.test(String(object.fpForegroundColor || ""));
  const resolved = floorPlanObjectRoomForeground(floorPlanObjectFromFabric(object));
  return `<fieldset class="floor-plan-room-foreground"><legend>${esc(tr("floorPlanRoomTextColor"))}</legend><label class="floor-plan-property-toggle"><input id="floorPlanRoomTextColorAuto" type="checkbox"${automatic ? " checked" : ""}><span>${esc(tr("floorPlanRoomTextColorAuto"))}</span></label><label><span>${esc(tr("floorPlanRoomTextColorCustom"))}</span><input id="floorPlanRoomTextColor" class="floor-plan-color-input" type="color" value="${esc(object.fpForegroundColor || resolved)}"${automatic ? " disabled" : ""}></label></fieldset>`;
}

function floorPlanArrangementHtml(object) {
  const objects = floorPlanCanvas?.getObjects() || [];
  const index = objects.indexOf(object);
  const last = objects.length - 1;
  return `<fieldset class="floor-plan-arrangement"><legend>${esc(tr("floorPlanArrangement"))}</legend><div>
    <button type="button" data-floor-plan-arrange="forward"${index < 0 || index >= last ? " disabled" : ""}><span aria-hidden="true">↑</span>${esc(tr("floorPlanBringForward"))}</button>
    <button type="button" data-floor-plan-arrange="front"${index < 0 || index >= last ? " disabled" : ""}><span aria-hidden="true">⇈</span>${esc(tr("floorPlanBringToFront"))}</button>
    <button type="button" data-floor-plan-arrange="backward"${index <= 0 ? " disabled" : ""}><span aria-hidden="true">↓</span>${esc(tr("floorPlanSendBackward"))}</button>
    <button type="button" data-floor-plan-arrange="back"${index <= 0 ? " disabled" : ""}><span aria-hidden="true">⇊</span>${esc(tr("floorPlanSendToBack"))}</button>
  </div></fieldset>`;
}

function floorPlanRoomLabelEditorHtml(object, { linked = false } = {}) {
  const inputId = linked ? "floorPlanInspectorRoomLabel" : "floorPlanInspectorRoomName";
  const value = linked ? object.fpLabelOverride || "" : object.fpFallbackLabel || "";
  const label = linked ? tr("floorPlanRoomLabelOverride") : tr("floorPlanRoomName");
  const placeholder = linked ? tr("floorPlanRoomLabelOverridePlaceholder") : "";
  return `<div class="floor-plan-room-label-editor"><label>${esc(label)}<textarea id="${inputId}" data-floor-plan-room-label-input rows="2" maxlength="120"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}>${esc(value)}</textarea></label><div class="floor-plan-room-label-actions"><button type="button" class="small" data-floor-plan-soft-hyphen>${esc(tr("floorPlanInsertSoftHyphen"))}</button><small>${esc(tr("floorPlanRoomLabelBreakHint"))}</small></div></div>`;
}

function floorPlanObjectListMeta(object) {
  if (object.fpType === "room") return { icon: "▭", name: object.fpLabelOverride || floorPlanRoom(object.fpRoomId)?.name || object.fpFallbackLabel || tr("floorPlanCustomRoomDefault"), type: object.fpRoomId ? tr("floorPlanLinkedRoom") : tr("floorPlanCustomRoom") };
  if (object.fpType === "text") return { icon: "T", name: String(object.fpText || tr("floorPlanAddText")).trim() || tr("floorPlanAddText"), type: tr("floorPlanAddText") };
  if (object.fpType === "symbol") return { icon: "⌖", name: String(object.fpLabel || floorPlanSymbolName(FLOOR_PLAN_SYMBOLS[object.fpSymbol])).trim() || tr("floorPlanSymbolLabel"), type: tr("floorPlanSymbolLabel") };
  if (object.fpType === "image") return { icon: "▧", name: String(object.fpAlt || tr("floorPlanGraphic")).trim() || tr("floorPlanGraphic"), type: tr("floorPlanGraphic") };
  const key = object.fpShape === "line" ? "floorPlanShapeLine" : object.fpShape === "ellipse" ? "floorPlanShapeEllipse" : "floorPlanShapeRectangle";
  return { icon: object.fpShape === "line" ? "━" : object.fpShape === "ellipse" ? "○" : "□", name: String(object.fpName || tr(key)).trim() || tr(key), type: tr("floorPlanShape") };
}

function renderFloorPlanObjectList() {
  const list = document.getElementById("floorPlanObjectList");
  const count = document.getElementById("floorPlanObjectCount");
  if (!list || !floorPlanCanvas) return;
  const objects = floorPlanCanvas.getObjects();
  const activeIds = new Set(floorPlanSelectedObjects().map(object => object.fpId));
  if (count) count.textContent = String(objects.length);
  list.innerHTML = objects.length ? [...objects].reverse().map(object => {
    const meta = floorPlanObjectListMeta(object);
    const index = objects.indexOf(object);
    const active = activeIds.has(object.fpId);
    return `<div class="floor-plan-object-row${active ? " is-active" : ""}" data-floor-plan-list-row="${esc(object.fpId)}">
      <button type="button" class="floor-plan-object-select" data-floor-plan-list-select="${esc(object.fpId)}" aria-pressed="${String(active)}" title="${esc(meta.name)}"><span aria-hidden="true">${esc(meta.icon)}</span><span><strong>${esc(meta.name)}</strong><small>${esc(meta.type)}</small></span></button>
      <span class="floor-plan-object-order" role="group" aria-label="${esc(tr("floorPlanObjectOrder", { name: meta.name }))}"><button type="button" data-floor-plan-list-arrange="forward" data-floor-plan-list-object="${esc(object.fpId)}" title="${esc(tr("floorPlanBringForward"))}" aria-label="${esc(tr("floorPlanBringForward"))}"${index >= objects.length - 1 ? " disabled" : ""}>↑</button><button type="button" data-floor-plan-list-arrange="backward" data-floor-plan-list-object="${esc(object.fpId)}" title="${esc(tr("floorPlanSendBackward"))}" aria-label="${esc(tr("floorPlanSendBackward"))}"${index <= 0 ? " disabled" : ""}>↓</button></span>
    </div>`;
  }).join("") : `<p class="hint">${esc(tr("floorPlanObjectListEmpty"))}</p>`;
}

function selectFloorPlanObject(objectId) {
  const object = floorPlanCanvas?.getObjects().find(candidate => candidate.fpId === objectId);
  if (!object) return;
  floorPlanCanvas.setActiveObject(object);
  object.setCoords();
  floorPlanCanvas.requestRenderAll();
  renderFloorPlanInspector();
  renderFloorPlanObjectList();
}

function arrangeFloorPlanObjectFromList(objectId, direction) {
  selectFloorPlanObject(objectId);
  arrangeSelectedFloorPlanObject(direction);
}

function floorPlanObjectGeometryHtml(object) {
  const floor = floorPlanActiveFloor();
  const geometry = floorPlanObjectFromFabric(object);
  const minDimension = object.fpType === "shape" ? 1 : 24;
  const fields = [
    ["X", "x", geometry.x, Math.max(0, floor.width - geometry.width), 0],
    ["Y", "y", geometry.y, Math.max(0, floor.height - geometry.height), 0],
    [object.fpType === "shape" && object.fpShape === "line" ? tr("floorPlanLineLength") : tr("floorPlanWidth"), "width", geometry.width, floor.width, minDimension],
    [object.fpType === "shape" && object.fpShape === "line" ? tr("floorPlanLineThickness") : tr("floorPlanHeight"), "height", geometry.height, floor.height, minDimension],
  ];
  return `<fieldset class="floor-plan-geometry"><legend>${esc(tr("floorPlanGeometry"))}</legend><div>${fields.map(([label, key, value, max, min]) => `<label><span>${esc(label)}</span><span class="floor-plan-number-input"><input type="number" inputmode="numeric" id="floorPlanGeometry${key.charAt(0).toUpperCase()}${key.slice(1)}" data-floor-plan-geometry="${key}" min="${min}" max="${Math.round(max)}" step="1" value="${Math.round(value)}"><small aria-hidden="true">px</small></span></label>`).join("")}</div><p>${esc(tr("floorPlanGeometryHint"))}</p></fieldset>`;
}

function floorPlanRotationHtml(object) {
  const rotation = Math.round(Number(object.angle || 0));
  return `<label class="floor-plan-rotation-control"><span>${esc(tr("floorPlanRotation"))}</span><span class="floor-plan-number-input"><input id="floorPlanRotation" type="number" inputmode="numeric" min="-360" max="360" step="1" value="${rotation}"><small aria-hidden="true">°</small></span></label>`;
}

function updateSelectedFloorPlanRotation(value) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected || floorPlanSelectedObjects().length !== 1) return;
  const rotation = Math.min(360, Math.max(-360, Math.round(Number(value) || 0)));
  selected.set("angle", rotation);
  containFloorPlanFabricPosition(selected);
  selected.setCoords();
  const input = document.getElementById("floorPlanRotation");
  if (input) input.value = String(rotation);
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
}

function updateSelectedObjectGeometry(changedKey = "") {
  const selected = floorPlanCanvas?.getActiveObject();
  const floor = floorPlanActiveFloor();
  if (!selected || !["room", "symbol", "image", "text", "shape"].includes(selected.fpType) || !floor) return;
  const current = floorPlanObjectFromFabric(selected);
  const read = key => {
    const input = document.querySelector(`[data-floor-plan-geometry="${key}"]`);
    if (!input?.value.trim()) return current[key];
    const value = Number(input.value);
    return Number.isFinite(value) ? Math.round(value) : current[key];
  };
  const minDimension = selected.fpType === "shape" ? 1 : 24;
  let width = Math.min(floor.width, Math.max(minDimension, read("width")));
  let height = Math.min(floor.height, Math.max(minDimension, read("height")));
  if (selected.fpType === "image" && current.width > 0 && current.height > 0) {
    const ratio = current.width / current.height;
    if (changedKey === "width") height = Math.min(floor.height, Math.max(24, Math.round(width / ratio)));
    else if (changedKey === "height") width = Math.min(floor.width, Math.max(24, Math.round(height * ratio)));
  }
  const x = Math.min(Math.max(0, floor.width - width), Math.max(0, read("x")));
  const y = Math.min(Math.max(0, floor.height - height), Math.max(0, read("y")));
  if (selected.fpType === "text") {
    updateFloorPlanFabricTextObject(selected, { ...current, x, y, width, height });
    floorPlanCanvas.requestRenderAll();
    syncFloorPlanCanvasToDocument();
    scheduleFloorPlanSave();
    return;
  }
  rebuildSelectedFloorPlanObject({ x, y, width, height });
}

function floorPlanOutlineVisibilityHtml(object, label = tr("floorPlanShowOutline")) {
  return `<label class="floor-plan-property-toggle"><input id="floorPlanOutlineVisible" type="checkbox"${object.fpOutlineVisible === false ? "" : " checked"}><span>${esc(label)}</span></label>`;
}

function floorPlanOpacityHtml(object, label = tr("floorPlanOpacity")) {
  const percent = Math.round(Math.min(1, Math.max(0, Number(object.fpOpacity ?? 1))) * 100);
  return `<label class="floor-plan-radius-control"><span>${esc(label)}<output id="floorPlanOpacityValue">${percent} %</output></span><input id="floorPlanOpacity" type="range" min="0" max="100" step="5" value="${percent}"></label>`;
}

function floorPlanRoomFillOpacityHtml(object) {
  const percent = Math.round(Math.min(1, Math.max(0, Number(object.fpFillOpacity ?? .15))) * 100);
  return `<label class="floor-plan-radius-control floor-plan-fill-opacity"><span>${esc(tr("floorPlanFillOpacity"))}<output id="floorPlanFillOpacityValue">${percent} %</output></span><input id="floorPlanFillOpacity" type="range" min="0" max="100" step="5" value="${percent}"></label>`;
}

function floorPlanShapeFillOpacityHtml(object) {
  const percent = Math.round(Math.min(1, Math.max(0, Number(object.fpFillOpacity ?? .15))) * 100);
  return `<label class="floor-plan-radius-control"><span>${esc(tr("floorPlanFillOpacity"))}<output id="floorPlanShapeFillOpacityValue">${percent} %</output></span><input id="floorPlanShapeFillOpacity" type="range" min="0" max="100" step="5" value="${percent}"></label>`;
}

function floorPlanRoomFillSettingsHtml(object, { editableColor = false } = {}) {
  return `<fieldset class="floor-plan-room-fill"><legend>${esc(tr("floorPlanFill"))}</legend>${editableColor ? `<label><span>${esc(tr("floorPlanRoomColor"))}</span><input id="floorPlanInspectorRoomColor" class="floor-plan-color-input" type="color" value="${esc(object.fpCustomColor || "#64748b")}"></label>` : ""}${floorPlanRoomFillOpacityHtml(object)}</fieldset>`;
}

function updateSelectedFloorPlanFillOpacity(value) {
  const rooms = floorPlanSelectedObjects().filter(object => object.fpType === "room");
  if (!rooms.length) return;
  const opacity = Math.min(1, Math.max(0, Number(value) / 100));
  rooms.forEach(selected => {
    selected.fpFillOpacity = opacity;
    const color = floorPlanObjectRoomColor(floorPlanObjectFromFabric(selected), floorPlanRoom(selected.fpRoomId));
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");
    selected.fpRect?.set("fill", `${color}${alpha}`);
    selected.dirty = true;
  });
  const output = document.getElementById("floorPlanFillOpacityValue");
  if (output) { output.textContent = `${Math.round(opacity * 100)} %`; delete output.dataset.mixed; }
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
}

function updateSelectedFloorPlanOpacity(value) {
  const selectedObjects = floorPlanSelectedObjects();
  if (!selectedObjects.length) return;
  const opacity = Math.min(1, Math.max(0, Number(value) / 100));
  selectedObjects.forEach(selected => {
    selected.fpOpacity = opacity;
    selected.set("opacity", opacity);
    selected.dirty = true;
  });
  const output = document.getElementById("floorPlanOpacityValue");
  if (output) { output.textContent = `${Math.round(opacity * 100)} %`; delete output.dataset.mixed; }
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
}

function updateSelectedFloorPlanShape(patch) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected || selected.fpType !== "shape") return;
  if (Object.hasOwn(patch, "name")) selected.fpName = String(patch.name).slice(0, 80);
  if (Object.hasOwn(patch, "color") && /^#[0-9a-f]{6}$/i.test(String(patch.color))) selected.fpColor = patch.color;
  if (Object.hasOwn(patch, "fillOpacity")) selected.fpFillOpacity = Math.min(1, Math.max(0, Number(patch.fillOpacity)));
  const alpha = Math.round((selected.fpShape === "line" ? 1 : selected.fpFillOpacity) * 255).toString(16).padStart(2, "0");
  selected.fpShapeObject?.set({
    fill: `${selected.fpColor}${alpha}`,
    stroke: selected.fpShape !== "line" && selected.fpOutlineVisible !== false ? selected.fpColor : "rgba(0,0,0,0)",
  });
  selected.dirty = true;
  selected.setCoords();
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
  renderFloorPlanObjectList();
}

function updateSelectedFloorPlanTextStyle(patch) {
  const selectedObjects = floorPlanSelectedObjects().filter(object => object.fpType === "text");
  if (!selectedObjects.length) return;
  selectedObjects.forEach(selected => {
    if (Object.hasOwn(patch, "color") && /^#[0-9a-f]{6}$/i.test(patch.color)) {
      selected.fpColor = patch.color;
      selected.fpTextBox?.set("fill", patch.color);
    }
    if (Object.hasOwn(patch, "fontSize") && Number.isFinite(Number(patch.fontSize))) {
      const fontSize = Math.min(96, Math.max(12, Math.round(Number(patch.fontSize))));
      selected.fpFontSize = fontSize;
    }
    if (Object.hasOwn(patch, "textAlign") && ["left", "center", "right"].includes(patch.textAlign)) selected.fpTextAlign = patch.textAlign;
    if (Object.hasOwn(patch, "text")) selected.fpText = String(patch.text).slice(0, 240);
    updateFloorPlanFabricTextObject(selected);
  });
  if (Object.hasOwn(patch, "fontSize") && Number.isFinite(Number(patch.fontSize))) {
    const input = document.getElementById("floorPlanInspectorTextSize");
    if (input) input.value = String(Math.min(96, Math.max(12, Math.round(Number(patch.fontSize)))));
  }
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
  renderFloorPlanObjectList();
}

function applySelectedRoomForeground(object) {
  if (!object || object.fpType !== "room") return;
  const foreground = floorPlanObjectRoomForeground(floorPlanObjectFromFabric(object));
  object.fpRoomLabelText?.set("fill", foreground);
  object.fpMarkerText?.set("fill", foreground);
  object.fpLocationText?.set("fill", foreground);
  object.dirty = true;
}

function updateSelectedRoomForeground(value) {
  const rooms = floorPlanSelectedObjects().filter(object => object.fpType === "room");
  if (!rooms.length) return;
  rooms.forEach(selected => {
    selected.fpForegroundColor = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : null;
    applySelectedRoomForeground(selected);
  });
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
}

function arrangeSelectedFloorPlanObject(direction) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected || selected.type === "activeSelection") return;
  const before = floorPlanCanvas.getObjects().indexOf(selected);
  const last = floorPlanCanvas.getObjects().length - 1;
  const target = direction === "back" ? 0
    : direction === "backward" ? Math.max(0, before - 1)
      : direction === "forward" ? Math.min(last, before + 1)
        : direction === "front" ? last : before;
  floorPlanCanvas.moveObjectTo(selected, target);
  const after = floorPlanCanvas.getObjects().indexOf(selected);
  if (before === after) return;
  floorPlanCanvas.setActiveObject(selected);
  floorPlanCanvas.requestRenderAll();
  floorPlanCanvasChanged();
  renderFloorPlanInspector();
  renderFloorPlanObjectList();
}

function renderFloorPlanInspector() {
  const inspector = document.getElementById("floorPlanInspector");
  if (!inspector || !floorPlanCanvas) return;
  const object = floorPlanCanvas.getActiveObject();
  if (document.activeElement?.id === "floorPlanInspectorText" && object?.fpType === "text") return;
  if (!object) {
    inspector.innerHTML = `<p class="hint">${esc(LANG === "en" ? "Select an item to edit it." : "Wähle ein Element aus, um es zu bearbeiten.")}</p>`;
    return;
  }
  const selectedObjects = floorPlanSelectedObjects();
  if (selectedObjects.length > 1) {
    inspector.innerHTML = floorPlanBatchInspectorHtml(selectedObjects);
    applyFloorPlanMixedState(inspector);
    return;
  }
  if (object.fpType === "room") {
    if (object.fpRoomId) {
      inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">▭</span><div><strong>${esc(tr("floorPlanObjectRoom"))}</strong><small>${esc(tr("floorPlanLinkedRoom"))}</small></div></div><label>${esc(tr("floorPlanLinkedRoom"))}<select id="floorPlanInspectorRoom">${floorPlanRoomOptionsHtml(floorPlanEditorDocument, { currentRoomId: object.fpRoomId, currentObjectId: object.fpId })}</select></label><p class="hint">${esc(tr("floorPlanLinkedRoomAppearanceHint"))}</p>${floorPlanRoomLabelEditorHtml(object, { linked: true })}${floorPlanRoomFillSettingsHtml(object)}${floorPlanObjectGeometryHtml(object)}${floorPlanLabelVisibilityHtml(object)}${floorPlanMarkerVisibilityHtml(object)}${floorPlanOutlineVisibilityHtml(object)}${object.fpShape === "ellipse" ? "" : floorPlanCornerRadiusHtml(object)}`;
    } else {
      inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">▭</span><div><strong>${esc(tr("floorPlanObjectRoom"))}</strong><small>${esc(tr("floorPlanCustomRoom"))}</small></div></div>
        ${floorPlanRoomLabelEditorHtml(object)}
        <label>${esc(tr("floorPlanRoomLocation"))}<input id="floorPlanInspectorRoomLocation" type="text" maxlength="80" value="${esc(object.fpCustomLocation || "")}" placeholder="${esc(tr("floorPlanRoomLocationPlaceholder"))}"></label>
        ${floorPlanRoomFillSettingsHtml(object, { editableColor: true })}
        ${floorPlanRoomShapeHtml(object)}
        ${floorPlanObjectGeometryHtml(object)}
        ${floorPlanLabelVisibilityHtml(object)}
        ${floorPlanOutlineVisibilityHtml(object)}
        ${object.fpShape === "ellipse" ? "" : floorPlanCornerRadiusHtml(object)}
        <div class="floor-plan-room-symbol"><span>${esc(tr("floorPlanRoomMarker"))}</span>${floorPlanSymbolPickerHtml({ selected: object.fpMarkerVisible === false ? "none" : object.fpCustomSymbol, target: "room", allowNone: true })}</div>`;
    }
  } else if (object.fpType === "text") {
    inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">T</span><div><strong>${esc(tr("floorPlanAddText"))}</strong><small>${esc(tr("floorPlanLabelsToolHint"))}</small></div></div><label>${esc(tr("floorPlanTextLabel"))}<textarea id="floorPlanInspectorText" rows="4" maxlength="240">${esc(object.fpText || "")}</textarea></label><div class="floor-plan-text-style"><label><span>${esc(tr("floorPlanTextColor"))}</span><input id="floorPlanInspectorTextColor" class="floor-plan-color-input" type="color" value="${esc(object.fpColor || "#172033")}"></label><label><span>${esc(tr("floorPlanTextSize"))}</span><span class="floor-plan-number-input"><input id="floorPlanInspectorTextSize" type="number" inputmode="numeric" min="12" max="96" step="1" value="${Math.round(object.fpFontSize || 28)}"><small aria-hidden="true">px</small></span></label></div><label>${esc(tr("floorPlanTextAlignment"))}<select id="floorPlanInspectorTextAlign"><option value="left"${object.fpTextAlign === "left" ? " selected" : ""}>${esc(tr("floorPlanTextAlignLeft"))}</option><option value="center"${!object.fpTextAlign || object.fpTextAlign === "center" ? " selected" : ""}>${esc(tr("floorPlanTextAlignCenter"))}</option><option value="right"${object.fpTextAlign === "right" ? " selected" : ""}>${esc(tr("floorPlanTextAlignRight"))}</option></select></label>${floorPlanObjectGeometryHtml(object)}`;
  } else if (object.fpType === "symbol") {
    inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">⌖</span><div><strong>${esc(tr("floorPlanSymbolLabel"))}</strong><small>${esc(tr("floorPlanSymbolsToolHint"))}</small></div></div>${floorPlanSymbolPickerHtml({ selected: object.fpSymbol, target: "symbol" })}<label>${esc(tr("floorPlanTextLabel"))}<input id="floorPlanInspectorLabel" type="text" maxlength="80" value="${esc(object.fpLabel || "")}"></label>${floorPlanSymbolLabelVisibilityHtml(object)}<label class="floor-plan-property-toggle"><input id="floorPlanSymbolBackgroundVisible" type="checkbox"${object.fpBackgroundVisible === false ? "" : " checked"}><span>${esc(tr("floorPlanShowSymbolCircle"))}</span></label>${floorPlanOutlineVisibilityHtml(object, tr("floorPlanShowSymbolOutline"))}${floorPlanObjectGeometryHtml(object)}`;
  } else if (object.fpType === "shape") {
    inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">${object.fpShape === "line" ? "━" : object.fpShape === "ellipse" ? "○" : "□"}</span><div><strong>${esc(tr("floorPlanShape"))}</strong><small>${esc(tr("floorPlanShapesToolHint"))}</small></div></div>
      <label>${esc(tr("floorPlanObjectName"))}<input id="floorPlanInspectorShapeName" type="text" maxlength="80" value="${esc(object.fpName || "")}" placeholder="${esc(floorPlanObjectListMeta(object).name)}"></label>
      <label>${esc(tr("floorPlanShape"))}<select id="floorPlanInspectorShape"><option value="line"${object.fpShape === "line" ? " selected" : ""}>${esc(tr("floorPlanShapeLine"))}</option><option value="rectangle"${object.fpShape === "rectangle" ? " selected" : ""}>${esc(tr("floorPlanShapeRectangle"))}</option><option value="ellipse"${object.fpShape === "ellipse" ? " selected" : ""}>${esc(tr("floorPlanShapeEllipse"))}</option></select></label>
      <label><span>${esc(tr("floorPlanShapeColor"))}</span><input id="floorPlanInspectorShapeColor" class="floor-plan-color-input" type="color" value="${esc(object.fpColor || "#64748b")}"></label>
      ${object.fpShape === "line" ? "" : floorPlanShapeFillOpacityHtml(object)}
      ${floorPlanObjectGeometryHtml(object)}
      ${object.fpShape === "line" ? "" : floorPlanOutlineVisibilityHtml(object)}`;
  } else {
    inspector.innerHTML = `<div class="floor-plan-inspector-title"><span aria-hidden="true">▧</span><div><strong>${esc(tr("floorPlanGraphic"))}</strong><small>${esc(tr("floorPlanGraphicsToolHint"))}</small></div></div>
      <label>${esc(tr("floorPlanGraphicAlt"))}<input id="floorPlanInspectorGraphicAlt" type="text" maxlength="120" value="${esc(object.fpAlt || "")}"></label>
      ${floorPlanOpacityHtml(object, tr("floorPlanGraphicOpacity"))}
      ${floorPlanObjectGeometryHtml(object)}
      <p class="hint">${esc(tr("floorPlanGraphicResizeHint"))}</p>`;
  }
  if (object.fpType === "room") inspector.insertAdjacentHTML("beforeend", floorPlanRoomForegroundHtml(object));
  if (!["room", "image"].includes(object.fpType)) inspector.insertAdjacentHTML("beforeend", floorPlanOpacityHtml(object));
  inspector.insertAdjacentHTML("beforeend", floorPlanRotationHtml(object));
  inspector.insertAdjacentHTML("beforeend", floorPlanArrangementHtml(object));
}

function floorPlanGraphicCount() {
  return floorPlanEditorDocument?.floors.reduce((count, floor) => count + floor.objects.filter(object => object.type === "image").length, 0) || 0;
}

function floorPlanLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr("floorPlanGraphicUnreadable"))); };
    image.src = url;
  });
}

function floorPlanCanvasBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
}

function floorPlanBlobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(tr("floorPlanGraphicUnreadable")));
    reader.readAsDataURL(blob);
  });
}

async function prepareFloorPlanGraphic(file) {
  if (!FLOOR_PLAN_GRAPHIC_TYPES.has(file?.type)) throw new Error(tr("floorPlanGraphicTypeError"));
  if (file.size > FLOOR_PLAN_GRAPHIC_LIMITS.inputBytes) throw new Error(tr("floorPlanGraphicFileError"));
  const source = await floorPlanLoadImage(file);
  if (!source.naturalWidth || !source.naturalHeight || source.naturalWidth > FLOOR_PLAN_GRAPHIC_LIMITS.sourcePixels || source.naturalHeight > FLOOR_PLAN_GRAPHIC_LIMITS.sourcePixels) throw new Error(tr("floorPlanGraphicPixelError"));
  const initialScale = Math.min(1, FLOOR_PLAN_GRAPHIC_LIMITS.outputPixels / Math.max(source.naturalWidth, source.naturalHeight));
  let width = Math.max(1, Math.round(source.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(source.naturalHeight * initialScale));
  const canvas = document.createElement("canvas");
  let blob = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    blob = await floorPlanCanvasBlob(canvas, Math.max(.48, .86 - attempt * .06));
    if (blob && blob.size <= FLOOR_PLAN_GRAPHIC_LIMITS.outputBytes) break;
    width = Math.max(1, Math.round(width * .86));
    height = Math.max(1, Math.round(height * .86));
  }
  if (!blob || blob.size > FLOOR_PLAN_GRAPHIC_LIMITS.outputBytes) throw new Error(tr("floorPlanGraphicCompressError"));
  const src = await floorPlanBlobDataUrl(blob);
  if (!FLOOR_PLAN_GRAPHIC_DATA_URL.test(src) || src.length > 390000) throw new Error(tr("floorPlanGraphicCompressError"));
  return { src, width, height, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 120) };
}

async function addFloorPlanGraphic(file) {
  const msg = document.getElementById("floorPlanGraphicMsg");
  if (floorPlanGraphicCount() >= FLOOR_PLAN_GRAPHIC_LIMITS.count) throw new Error(tr("floorPlanGraphicCountError"));
  if (msg) { msg.className = "msg floor-plan-tool-msg"; msg.textContent = tr("floorPlanGraphicPreparing"); }
  const graphic = await prepareFloorPlanGraphic(file);
  const floor = floorPlanActiveFloor();
  const displayScale = Math.min(320 / graphic.width, 220 / graphic.height);
  const width = Math.max(32, Math.round(graphic.width * displayScale));
  const height = Math.max(32, Math.round(graphic.height * displayScale));
  addFloorPlanObject({ id: floorPlanId("image"), type: "image", src: graphic.src, alt: graphic.alt, x: floor.width / 2 - width / 2, y: floor.height / 2 - height / 2, width, height, rotation: 0 });
  if (msg) { msg.className = "msg ok floor-plan-tool-msg"; msg.textContent = tr("floorPlanGraphicAdded"); }
}

function rebuildSelectedFloorPlanObject(patch) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected) return;
  const domain = { ...floorPlanObjectFromFabric(selected), ...patch };
  const index = floorPlanCanvas.getObjects().indexOf(selected);
  floorPlanCanvas.remove(selected);
  const replacement = floorPlanFabricObject(domain);
  floorPlanCanvas.insertAt(index, replacement);
  floorPlanCanvas.setActiveObject(replacement);
  floorPlanCanvas.requestRenderAll();
  floorPlanCanvasChanged();
}

function rebuildSelectedFloorPlanObjects(patch, predicate = () => true) {
  const selected = floorPlanSelectedObjects();
  const targets = selected.filter(predicate);
  if (!targets.length) return;
  if (selected.length === 1) {
    rebuildSelectedFloorPlanObject(patch);
    return;
  }
  floorPlanCanvas.discardActiveObject();
  selected.forEach(object => object.setCoords());
  const replacements = selected.map(object => {
    if (!predicate(object)) return object;
    const index = floorPlanCanvas.getObjects().indexOf(object);
    const domain = { ...floorPlanObjectFromFabric(object), ...patch };
    const replacement = floorPlanFabricObject(domain);
    floorPlanCanvas.remove(object);
    floorPlanCanvas.insertAt(index, replacement);
    replacement.setCoords();
    return replacement;
  });
  const activeSelection = new fabric.ActiveSelection(replacements, { canvas: floorPlanCanvas });
  floorPlanCanvas.setActiveObject(activeSelection);
  activeSelection.setCoords();
  floorPlanCanvas.requestRenderAll();
  floorPlanCanvasChanged();
}

function updateSelectedFloorPlanCornerRadius(value) {
  const rooms = floorPlanSelectedObjects().filter(object => object.fpType === "room" && object.fpShape !== "ellipse");
  if (!rooms.length) return;
  const radius = Math.min(60, Math.max(0, Number(value) || 0));
  rooms.forEach(selected => {
    selected.fpCornerRadius = radius;
    const renderedRadius = Math.min(radius, (selected.fpRect?.width || 0) / 2, (selected.fpRect?.height || 0) / 2);
    selected.fpRect?.set({ rx: renderedRadius, ry: renderedRadius });
    selected.dirty = true;
  });
  const output = document.getElementById("floorPlanCornerRadiusValue");
  if (output) { output.textContent = `${Math.round(radius)} px`; delete output.dataset.mixed; }
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
}

function updateSelectedFloorPlanRoomContent(selected) {
  if (!selected || selected.fpType !== "room") return;
  const domain = floorPlanObjectFromFabric(selected);
  const room = floorPlanRoom(selected.fpRoomId);
  const label = selected.fpLabelOverride || room?.name || selected.fpFallbackLabel || tr("floorPlanUnlinkedRoom");
  const location = room?.floor || selected.fpCustomLocation || "";
  const layout = floorPlanRoomLayout(domain, label, location);
  selected.fpRoomLabelText?.set({
    text: layout.lines.join("\n"), width: layout.labelWidth,
    top: layout.labelCenterY - domain.height / 2,
    fontSize: layout.labelFontSize, lineHeight: layout.lineHeight / layout.labelFontSize,
  });
  selected.fpRoomLabelText?.initDimensions?.();
  selected.fpMarkerText?.set({ top: layout.markerCenterY - domain.height / 2, fontSize: layout.markerSize * (floorPlanObjectRoomSymbol(domain, room)?.glyphScale || 1) });
  selected.fpLocationText?.set({
    text: layout.locationText, width: layout.labelWidth,
    top: layout.locationY - domain.height / 2, fontSize: layout.locationFontSize,
  });
  selected.fpLocationText?.initDimensions?.();
  selected.dirty = true;
  selected.setCoords();
}

function updateSelectedRoomLabelOverride(value) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected || selected.fpType !== "room" || !selected.fpRoomId) return;
  selected.fpLabelOverride = String(value || "").replace(/\r/g, "").slice(0, 120);
  updateSelectedFloorPlanRoomContent(selected);
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
  renderFloorPlanObjectList();
}

function updateSelectedCustomRoom(patch) {
  const selected = floorPlanCanvas?.getActiveObject();
  if (!selected || selected.fpType !== "room" || selected.fpRoomId) return;
  if (Object.hasOwn(patch, "fallbackLabel")) {
    selected.fpFallbackLabel = patch.fallbackLabel.trim() || tr("floorPlanCustomRoomDefault");
  }
  if (Object.hasOwn(patch, "customLocation")) {
    selected.fpCustomLocation = patch.customLocation;
  }
  updateSelectedFloorPlanRoomContent(selected);
  if (Object.hasOwn(patch, "customColor") && /^#[0-9a-f]{6}$/i.test(patch.customColor)) {
    selected.fpCustomColor = patch.customColor;
    const alpha = Math.round(Math.min(1, Math.max(0, Number(selected.fpFillOpacity ?? .15))) * 255).toString(16).padStart(2, "0");
    selected.fpRect?.set({ fill: `${patch.customColor}${alpha}`, stroke: selected.fpOutlineVisible === false ? "rgba(0,0,0,0)" : patch.customColor });
    applySelectedRoomForeground(selected);
  }
  floorPlanCanvas.requestRenderAll();
  syncFloorPlanCanvasToDocument();
  scheduleFloorPlanSave();
  renderFloorPlanObjectList();
}

function updateFloorPlanHistoryButtons() {
  const undo = document.getElementById("floorPlanUndoBtn");
  const redo = document.getElementById("floorPlanRedoBtn");
  if (undo) undo.disabled = floorPlanHistory.length <= 1;
  if (redo) redo.disabled = floorPlanFuture.length === 0;
}

function restoreFloorPlanHistory(serialized) {
  floorPlanEditorDocument = normalizeFloorPlanDocument(JSON.parse(serialized));
  const floor = floorPlanActiveFloor();
  floorPlanCanvas.clear();
  floorPlanCanvas.backgroundColor = "transparent";
  floorPlanCanvas.add(...floor.objects.map(floorPlanFabricObject));
  floorPlanCanvas.requestRenderAll();
  applyFloorPlanGridVisibility();
  applyFloorPlanTraceReference().catch(error => updateFloorPlanTraceControls(error.message, true));
  refreshFloorPlanRoomSelect();
  renderFloorPlanObjectList();
  updateFloorPlanHistoryButtons();
  scheduleFloorPlanSave();
}

async function switchFloorPlanFloor(floorId, { sync = true } = {}) {
  if (sync) syncFloorPlanCanvasToDocument({ history: false });
  await saveFloorPlanNow({ sync }).catch(() => {});
  S.floorPlanEditorFloorId = floorId;
  renderActive({ animate: false });
}

async function moveFloorPlanFloor(offset) {
  if (!floorPlanEditorDocument || !Number.isInteger(offset) || Math.abs(offset) !== 1) return;
  syncFloorPlanCanvasToDocument({ history: false });
  const floors = floorPlanEditorDocument.floors;
  const currentIndex = floors.findIndex(floor => floor.id === S.floorPlanEditorFloorId);
  const targetIndex = currentIndex + offset;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= floors.length) return;
  const [floor] = floors.splice(currentIndex, 1);
  floors.splice(targetIndex, 0, floor);
  document.getElementById("floorPlanMoveFloorEarlier")?.setAttribute("disabled", "");
  document.getElementById("floorPlanMoveFloorLater")?.setAttribute("disabled", "");
  await saveFloorPlanNow({ sync: false }).catch(() => {});
  renderActive({ animate: false });
}

function resizeFloorPlanEditorDocument({ pageFormat, orientation, width, height }) {
  if (!floorPlanEditorDocument) return;
  syncFloorPlanCanvasToDocument({ history: false });
  const oldWidth = floorPlanEditorDocument.pageWidth || floorPlanActiveFloor()?.width || 1120;
  const oldHeight = floorPlanEditorDocument.pageHeight || floorPlanActiveFloor()?.height || 792;
  const nextFormat = ["a4", "letter", "custom"].includes(pageFormat) ? pageFormat : floorPlanEditorDocument.pageFormat || "a4";
  const nextOrientation = orientation === "portrait" ? "portrait" : "landscape";
  const nextSize = floorPlanPageSize(nextFormat, nextOrientation, width, height);
  const sx = nextSize.width / oldWidth;
  const sy = nextSize.height / oldHeight;
  floorPlanEditorDocument.pageFormat = nextFormat;
  floorPlanEditorDocument.orientation = nextOrientation;
  floorPlanEditorDocument.pageWidth = nextSize.width;
  floorPlanEditorDocument.pageHeight = nextSize.height;
  floorPlanEditorDocument.floors.forEach(floor => {
    floor.objects.forEach(object => {
      object.x *= sx; object.y *= sy; object.width *= sx; object.height *= sy;
    });
    floor.width = nextSize.width; floor.height = nextSize.height;
  });
}

function openFloorPlanHelpPopout() {
  const dialog = document.getElementById("floorPlanHelpDialog");
  if (!dialog) return;
  const popup = globalThis.open("", "floor-plan-help", "popup=yes,width=760,height=720,resizable=yes,scrollbars=yes");
  if (!popup) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => `<link rel="stylesheet" href="${esc(link.href)}">`).join("");
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="${esc(LANG)}" data-theme="${esc(document.documentElement.dataset.theme || "light")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>${esc(tr("floorPlanEditorHelpAria"))}</title></head><body class="floor-plan-help-popout"><main>${dialog.querySelector(".floor-plan-help-head")?.outerHTML || ""}<div class="floor-plan-help-groups">${dialog.querySelector(".floor-plan-help-groups")?.innerHTML || ""}</div><p class="floor-plan-help-note">${esc(tr("floorPlanHelpMultiSelect"))}</p></main></body></html>`);
  popup.document.close();
  popup.focus();
}

function wireFloorPlanEditorControls() {
  document.getElementById("floorPlanZoomOut")?.addEventListener("click", () => setFloorPlanEditorZoom(floorPlanEditorZoom - .1));
  document.getElementById("floorPlanZoomIn")?.addEventListener("click", () => setFloorPlanEditorZoom(floorPlanEditorZoom + .1));
  document.getElementById("floorPlanZoomFit")?.addEventListener("click", () => setFloorPlanEditorZoom(1));
  document.getElementById("floorPlanPanToggle")?.addEventListener("click", toggleFloorPlanPan);
  document.getElementById("floorPlanGridToggle")?.addEventListener("click", toggleFloorPlanGrid);
  document.getElementById("floorPlanSnapToggle")?.addEventListener("click", toggleFloorPlanSnap);
  const helpDialog = document.getElementById("floorPlanHelpDialog");
  document.getElementById("floorPlanEditorHelpBtn")?.addEventListener("click", () => helpDialog?.showModal());
  document.getElementById("floorPlanHelpClose")?.addEventListener("click", () => helpDialog?.close());
  document.getElementById("floorPlanHelpDone")?.addEventListener("click", () => helpDialog?.close());
  document.getElementById("floorPlanHelpPopout")?.addEventListener("click", openFloorPlanHelpPopout);
  helpDialog?.addEventListener("click", event => { if (event.target === helpDialog) helpDialog.close(); });
  const traceInput = document.getElementById("floorPlanTraceInput");
  document.getElementById("floorPlanTraceChoose")?.addEventListener("click", () => traceInput?.click());
  traceInput?.addEventListener("change", async () => {
    const file = traceInput.files?.[0];
    traceInput.value = "";
    if (!file) return;
    const floorId = S.floorPlanEditorFloorId;
    updateFloorPlanTraceControls(tr("floorPlanTracePreparing"));
    try {
      const entry = await createFloorPlanTraceEntry(file);
      disposeFloorPlanTraceEntry(floorPlanTraceReferences.get(floorId));
      floorPlanTraceReferences.set(floorId, entry);
      updateFloorPlanTraceControls();
      if (floorId === S.floorPlanEditorFloorId) await applyFloorPlanTraceReference();
    } catch (error) {
      updateFloorPlanTraceControls(error.message, true);
    }
  });
  document.getElementById("floorPlanTracePage")?.addEventListener("change", async event => {
    const entry = floorPlanTraceEntry();
    if (!entry || entry.kind !== "pdf") return;
    entry.page = Math.min(entry.pageCount, Math.max(1, Number(event.target.value) || 1));
    try { await applyFloorPlanTraceReference(); }
    catch (error) { updateFloorPlanTraceControls(error.message, true); }
  });
  document.getElementById("floorPlanTraceOpacity")?.addEventListener("input", event => {
    const entry = floorPlanTraceEntry();
    if (!entry) return;
    entry.opacity = Math.min(.8, Math.max(.1, Number(event.target.value) / 100));
    floorPlanCanvas.backgroundImage?.set("opacity", entry.opacity);
    floorPlanCanvas.requestRenderAll();
  });
  document.getElementById("floorPlanTraceRemove")?.addEventListener("click", () => {
    const floorId = S.floorPlanEditorFloorId;
    disposeFloorPlanTraceEntry(floorPlanTraceReferences.get(floorId));
    floorPlanTraceReferences.delete(floorId);
    floorPlanTraceRenderToken += 1;
    floorPlanCanvas.backgroundImage = undefined;
    floorPlanCanvas.requestRenderAll();
    updateFloorPlanTraceControls();
  });
  document.getElementById("floorPlanAddLinkedRoomBtn")?.addEventListener("click", () => {
    const roomId = document.getElementById("floorPlanRoomSelect")?.value;
    if (!roomId || !floorPlanAvailableRooms(floorPlanEditorDocument).some(room => room.id === roomId)) {
      refreshFloorPlanRoomSelect();
      return;
    }
    const room = floorPlanRoom(roomId);
    const floor = floorPlanActiveFloor();
    addFloorPlanObject({ id: floorPlanId("room"), type: "room", roomId, fallbackLabel: room?.name || "", labelVisible: true, markerVisible: true, shape: "rectangle", cornerRadius: 0, fillOpacity: .15, x: floor.width / 2 - 135, y: floor.height / 2 - 80, width: 270, height: 160, rotation: 0 });
  });
  document.getElementById("floorPlanAddCustomRoomBtn")?.addEventListener("click", () => {
    const floor = floorPlanActiveFloor();
    addFloorPlanObject({ id: floorPlanId("room"), type: "room", roomId: null, fallbackLabel: tr("floorPlanCustomRoomDefault"), customLocation: "", customColor: "#64748b", customMarker: "square", customSymbol: "room-marker-square", labelVisible: true, markerVisible: true, shape: "rectangle", cornerRadius: 0, fillOpacity: .15, x: floor.width / 2 - 135, y: floor.height / 2 - 80, width: 270, height: 160, rotation: 0 });
  });
  document.getElementById("floorPlanAddTextBtn")?.addEventListener("click", () => {
    const floor = floorPlanActiveFloor();
    addFloorPlanObject({ id: floorPlanId("text"), type: "text", text: tr("floorPlanAddText"), color: "#172033", fontSize: 28, x: floor.width / 2 - 110, y: floor.height / 2 - 30, width: 220, height: 60, rotation: 0 });
  });
  document.querySelectorAll("[data-floor-plan-shape]").forEach(button => button.addEventListener("click", () => {
    const floor = floorPlanActiveFloor();
    const shape = ["line", "rectangle", "ellipse"].includes(button.dataset.floorPlanShape) ? button.dataset.floorPlanShape : "rectangle";
    const width = shape === "line" ? 220 : 180;
    const height = shape === "line" ? 6 : 100;
    const nameKey = shape === "line" ? "floorPlanShapeLine" : shape === "ellipse" ? "floorPlanShapeEllipse" : "floorPlanShapeRectangle";
    addFloorPlanObject({ id: floorPlanId("shape"), type: "shape", shape, name: tr(nameKey), color: "#64748b", fillOpacity: shape === "line" ? 1 : .15, outlineVisible: shape !== "line", x: floor.width / 2 - width / 2, y: floor.height / 2 - height / 2, width, height, rotation: 0 });
  }));
  const symbolMenuButton = document.getElementById("floorPlanSymbolMenuBtn");
  const symbolPalette = document.getElementById("floorPlanSymbolPalette");
  symbolMenuButton?.addEventListener("click", () => {
    const open = symbolMenuButton.getAttribute("aria-expanded") !== "true";
    symbolMenuButton.setAttribute("aria-expanded", String(open));
    symbolPalette.hidden = !open;
  });
  symbolPalette?.querySelectorAll("[data-floor-plan-symbol]").forEach(button => button.addEventListener("click", () => {
    const floor = floorPlanActiveFloor();
    const symbol = FLOOR_PLAN_SYMBOLS[button.dataset.floorPlanSymbol];
    addFloorPlanObject({ id: floorPlanId("symbol"), type: "symbol", symbol: button.dataset.floorPlanSymbol, label: floorPlanSymbolName(symbol), labelVisible: false, backgroundVisible: false, x: floor.width / 2 - 52, y: floor.height / 2 - 52, width: 104, height: 104, rotation: 0 });
    symbolPalette.hidden = true;
    symbolMenuButton.setAttribute("aria-expanded", "false");
  }));
  const graphicInput = document.getElementById("floorPlanGraphicInput");
  document.getElementById("floorPlanAddGraphicBtn")?.addEventListener("click", () => {
    const msg = document.getElementById("floorPlanGraphicMsg");
    if (floorPlanGraphicCount() >= FLOOR_PLAN_GRAPHIC_LIMITS.count) {
      if (msg) { msg.className = "msg err floor-plan-tool-msg"; msg.textContent = tr("floorPlanGraphicCountError"); }
      return;
    }
    graphicInput.click();
  });
  graphicInput?.addEventListener("change", async () => {
    const file = graphicInput.files?.[0];
    graphicInput.value = "";
    if (!file) return;
    try { await addFloorPlanGraphic(file); }
    catch (error) {
      const msg = document.getElementById("floorPlanGraphicMsg");
      if (msg) { msg.className = "msg err floor-plan-tool-msg"; msg.textContent = error.message; }
    }
  });
  document.getElementById("floorPlanDeleteObjectBtn")?.addEventListener("click", () => {
    const selected = floorPlanCanvas.getActiveObjects();
    if (!selected.length) return;
    floorPlanCanvas.discardActiveObject(); selected.forEach(object => floorPlanCanvas.remove(object)); floorPlanCanvasChanged();
  });
  document.getElementById("floorPlanDuplicateObjectBtn")?.addEventListener("click", duplicateSelectedFloorPlanObjects);
  document.getElementById("floorPlanUndoBtn")?.addEventListener("click", () => {
    if (floorPlanHistory.length <= 1) return;
    floorPlanFuture.push(floorPlanHistory.pop()); restoreFloorPlanHistory(floorPlanHistory.at(-1));
  });
  document.getElementById("floorPlanRedoBtn")?.addEventListener("click", () => {
    if (!floorPlanFuture.length) return;
    const next = floorPlanFuture.pop(); floorPlanHistory.push(next); restoreFloorPlanHistory(next);
  });
  document.querySelectorAll("[data-floor-plan-floor]").forEach(button => button.addEventListener("click", () => switchFloorPlanFloor(button.dataset.floorPlanFloor)));
  document.getElementById("floorPlanMoveFloorEarlier")?.addEventListener("click", () => moveFloorPlanFloor(-1));
  document.getElementById("floorPlanMoveFloorLater")?.addEventListener("click", () => moveFloorPlanFloor(1));
  document.getElementById("floorPlanObjectList")?.addEventListener("click", event => {
    const selectButton = event.target.closest("[data-floor-plan-list-select]");
    if (selectButton) selectFloorPlanObject(selectButton.dataset.floorPlanListSelect);
    const arrangeButton = event.target.closest("[data-floor-plan-list-arrange]");
    if (arrangeButton) arrangeFloorPlanObjectFromList(arrangeButton.dataset.floorPlanListObject, arrangeButton.dataset.floorPlanListArrange);
  });
  document.getElementById("floorPlanAddFloorBtn")?.addEventListener("click", async () => {
    syncFloorPlanCanvasToDocument({ history: false });
    const floor = newFloorPlanFloor(`${tr("floorPlanFloor")} ${floorPlanEditorDocument.floors.length + 1}`, floorPlanEditorDocument.orientation, floorPlanEditorDocument.pageFormat, floorPlanEditorDocument.pageWidth, floorPlanEditorDocument.pageHeight);
    floorPlanEditorDocument.floors.push(floor); await switchFloorPlanFloor(floor.id, { sync: false });
  });
  document.getElementById("floorPlanDeleteFloorBtn")?.addEventListener("click", async () => {
    if (floorPlanEditorDocument.floors.length <= 1 || !confirm(tr("floorPlanDeleteFloor") + "?")) return;
    disposeFloorPlanTraceEntry(floorPlanTraceReferences.get(S.floorPlanEditorFloorId));
    floorPlanTraceReferences.delete(S.floorPlanEditorFloorId);
    floorPlanEditorDocument.floors = floorPlanEditorDocument.floors.filter(floor => floor.id !== S.floorPlanEditorFloorId);
    await switchFloorPlanFloor(floorPlanEditorDocument.floors[0].id, { sync: false });
  });
  document.getElementById("floorPlanFloorName")?.addEventListener("input", event => {
    floorPlanActiveFloor().name = event.target.value.trim() || tr("floorPlanDefaultFloor");
    scheduleFloorPlanSave();
  });
  document.getElementById("floorPlanDocumentTitle")?.addEventListener("input", event => { floorPlanEditorDocument.title = event.target.value; scheduleFloorPlanSave(); });
  document.getElementById("floorPlanPageFormat")?.addEventListener("change", async event => {
    const nextFormat = event.target.value;
    const custom = nextFormat === "custom";
    const customSize = document.getElementById("floorPlanCustomPageSize");
    if (customSize) customSize.hidden = !custom;
    resizeFloorPlanEditorDocument({ pageFormat: nextFormat, orientation: floorPlanEditorDocument.orientation, width: floorPlanEditorDocument.pageWidth, height: floorPlanEditorDocument.pageHeight });
    await saveFloorPlanNow({ sync: false }).catch(() => {});
    renderActive({ animate: false });
  });
  document.getElementById("floorPlanOrientation")?.addEventListener("change", async event => {
    const custom = floorPlanEditorDocument.pageFormat === "custom";
    resizeFloorPlanEditorDocument({
      pageFormat: floorPlanEditorDocument.pageFormat, orientation: event.target.value,
      width: custom ? floorPlanEditorDocument.pageHeight : undefined,
      height: custom ? floorPlanEditorDocument.pageWidth : undefined,
    });
    await saveFloorPlanNow({ sync: false }).catch(() => {});
    renderActive({ animate: false });
  });
  const applyCustomPageSize = async () => {
    if (floorPlanEditorDocument.pageFormat !== "custom") return;
    resizeFloorPlanEditorDocument({ pageFormat: "custom", orientation: floorPlanEditorDocument.orientation, width: document.getElementById("floorPlanPageWidth")?.value, height: document.getElementById("floorPlanPageHeight")?.value });
    await saveFloorPlanNow({ sync: false }).catch(() => {});
    renderActive({ animate: false });
  };
  document.getElementById("floorPlanPageWidth")?.addEventListener("change", applyCustomPageSize);
  document.getElementById("floorPlanPageHeight")?.addEventListener("change", applyCustomPageSize);
  document.getElementById("floorPlanPublishBtn")?.addEventListener("click", async () => {
    const button = document.getElementById("floorPlanPublishBtn"); button.disabled = true;
    try {
      await saveFloorPlanNow();
      await S.store.publishFloorPlan(S.floorPlanDraft.revision);
      S.floorPlanPublic = { document: structuredClone(S.floorPlanDraft.document), revision: S.floorPlanDraft.revision, published_at: new Date().toISOString() };
      S.floorPlanDraft.published_at = S.floorPlanPublic.published_at;
      S.con.floor_plan_mode = floorPlanModeForSources({ external: floorPlanExternalEnabled(), interactive: true });
      button.textContent = `✓ ${tr("floorPlanPublished")}`;
      button.disabled = false;
    } catch (error) {
      button.disabled = false;
      const saveState = document.getElementById("floorPlanSaveState");
      if (saveState) { saveState.className = "floor-plan-save-state is-error"; saveState.textContent = floorPlanSaveErrorMessage(error); }
    }
  });
  document.getElementById("floorPlanPreviewBtn")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    syncFloorPlanCanvasToDocument({ history: false });
    try {
      await saveFloorPlanNow({ sync: false });
      S.floorPlanPreviewDocument = structuredClone(floorPlanEditorDocument);
      S.mode = "view"; S.view = "lageplan"; renderActive();
    } catch {
      button.disabled = false;
    }
  });
  document.addEventListener("keydown", floorPlanEditorKeydown, { signal: floorPlanEditorAbortController.signal });
  document.addEventListener("keyup", floorPlanEditorKeyup, { signal: floorPlanEditorAbortController.signal });
  globalThis.addEventListener("blur", () => setFloorPlanRotationSnap(false), { signal: floorPlanEditorAbortController.signal });
  const inspector = document.getElementById("floorPlanInspector");
  inspector?.addEventListener("change", event => {
    if (event.target.id === "floorPlanInspectorRoom") {
      const selected = floorPlanCanvas?.getActiveObject();
      const roomId = event.target.value;
      if (!selected || floorPlanLinkedRoomIds(floorPlanEditorDocument, { excludeObjectId: selected.fpId }).has(roomId)) {
        renderFloorPlanInspector();
        return;
      }
      rebuildSelectedFloorPlanObject({ roomId, fallbackLabel: floorPlanRoom(roomId)?.name || "", labelOverride: "" });
    }
    if (event.target.matches("[data-floor-plan-geometry]")) updateSelectedObjectGeometry(event.target.dataset.floorPlanGeometry);
    if (event.target.id === "floorPlanLabelVisible") rebuildSelectedFloorPlanObjects({ labelVisible: event.target.checked }, object => object.fpType === "room");
    if (event.target.id === "floorPlanSymbolLabelVisible") rebuildSelectedFloorPlanObjects({ labelVisible: event.target.checked }, object => object.fpType === "symbol");
    if (event.target.id === "floorPlanMarkerVisible") rebuildSelectedFloorPlanObjects({ markerVisible: event.target.checked }, object => object.fpType === "room");
    if (event.target.id === "floorPlanSymbolBackgroundVisible") rebuildSelectedFloorPlanObjects({ backgroundVisible: event.target.checked }, object => object.fpType === "symbol");
    if (event.target.id === "floorPlanRoomShape") rebuildSelectedFloorPlanObject({ shape: event.target.value === "ellipse" ? "ellipse" : "rectangle" });
    if (event.target.id === "floorPlanInspectorShape") {
      const selected = floorPlanCanvas?.getActiveObject();
      const shape = ["line", "rectangle", "ellipse"].includes(event.target.value) ? event.target.value : "rectangle";
      rebuildSelectedFloorPlanObject({ shape, fillOpacity: selected?.fpShape === "line" && shape !== "line" ? .15 : selected?.fpFillOpacity, outlineVisible: shape !== "line" });
    }
    if (event.target.id === "floorPlanRotation") updateSelectedFloorPlanRotation(event.target.value);
    if (event.target.id === "floorPlanOutlineVisible") rebuildSelectedFloorPlanObjects({ outlineVisible: event.target.checked }, object => ["room", "symbol", "shape"].includes(object.fpType));
    if (event.target.id === "floorPlanInspectorTextSize") updateSelectedFloorPlanTextStyle({ fontSize: event.target.value });
    if (event.target.id === "floorPlanInspectorTextAlign") updateSelectedFloorPlanTextStyle({ textAlign: event.target.value });
    if (event.target.id === "floorPlanInspectorRoomName") rebuildSelectedFloorPlanObject({ fallbackLabel: event.target.value.trim() || tr("floorPlanCustomRoomDefault") });
    if (event.target.id === "floorPlanInspectorRoomLocation") rebuildSelectedFloorPlanObject({ customLocation: event.target.value });
    if (event.target.id === "floorPlanRoomTextColorAuto") {
      const colorInput = document.getElementById("floorPlanRoomTextColor");
      if (colorInput) colorInput.disabled = event.target.checked;
      updateSelectedRoomForeground(event.target.checked ? null : colorInput?.value);
    }
  });
  inspector?.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !event.target.matches("[data-floor-plan-geometry], #floorPlanInspectorTextSize, #floorPlanRotation")) return;
    event.preventDefault();
    if (event.target.id === "floorPlanInspectorTextSize") updateSelectedFloorPlanTextStyle({ fontSize: event.target.value });
    else if (event.target.id === "floorPlanRotation") updateSelectedFloorPlanRotation(event.target.value);
    else updateSelectedObjectGeometry(event.target.dataset.floorPlanGeometry);
  });
  inspector?.addEventListener("click", event => {
    if (event.target.closest("[data-floor-plan-soft-hyphen]")) {
      const input = inspector.querySelector("[data-floor-plan-room-label-input]");
      if (input) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.setRangeText("\u00ad", start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }
      return;
    }
    const symbolButton = event.target.closest("[data-inspector-symbol]");
    if (symbolButton) rebuildSelectedFloorPlanObject({ symbol: symbolButton.dataset.inspectorSymbol });
    const roomSymbolButton = event.target.closest("[data-inspector-room-symbol]");
    if (roomSymbolButton) {
      const symbol = roomSymbolButton.dataset.inspectorRoomSymbol;
      rebuildSelectedFloorPlanObject(symbol === "none" ? { roomId: null, markerVisible: false } : { roomId: null, customSymbol: symbol, markerVisible: true });
    }
    const arrangeButton = event.target.closest("[data-floor-plan-arrange]");
    if (arrangeButton) arrangeSelectedFloorPlanObject(arrangeButton.dataset.floorPlanArrange);
  });
  inspector?.addEventListener("input", event => {
    if (event.target.id === "floorPlanInspectorText") {
      updateSelectedFloorPlanTextStyle({ text: event.target.value });
    } else if (event.target.id === "floorPlanInspectorShapeName") {
      updateSelectedFloorPlanShape({ name: event.target.value });
    } else if (event.target.id === "floorPlanInspectorShapeColor") {
      updateSelectedFloorPlanShape({ color: event.target.value });
    } else if (event.target.id === "floorPlanShapeFillOpacity") {
      const value = Math.min(100, Math.max(0, Number(event.target.value) || 0));
      const output = document.getElementById("floorPlanShapeFillOpacityValue");
      if (output) output.textContent = `${Math.round(value)} %`;
      updateSelectedFloorPlanShape({ fillOpacity: value / 100 });
    } else if (event.target.id === "floorPlanInspectorTextColor") {
      updateSelectedFloorPlanTextStyle({ color: event.target.value });
    } else if (event.target.id === "floorPlanInspectorRoomName") {
      updateSelectedCustomRoom({ fallbackLabel: event.target.value });
    } else if (event.target.id === "floorPlanInspectorRoomLabel") {
      updateSelectedRoomLabelOverride(event.target.value);
    } else if (event.target.id === "floorPlanInspectorRoomLocation") {
      updateSelectedCustomRoom({ customLocation: event.target.value });
    } else if (event.target.id === "floorPlanInspectorRoomColor") {
      updateSelectedCustomRoom({ customColor: event.target.value });
    } else if (event.target.id === "floorPlanRoomTextColor") {
      updateSelectedRoomForeground(event.target.value);
    } else if (event.target.id === "floorPlanOpacity") {
      updateSelectedFloorPlanOpacity(event.target.value);
    } else if (event.target.id === "floorPlanFillOpacity") {
      updateSelectedFloorPlanFillOpacity(event.target.value);
    } else if (event.target.id === "floorPlanCornerRadius") {
      updateSelectedFloorPlanCornerRadius(event.target.value);
    } else if (event.target.id === "floorPlanInspectorLabel") {
      const selected = floorPlanCanvas.getActiveObject();
      selected.fpLabel = event.target.value;
      selected.fpLabelText?.set("text", event.target.value);
      selected.setCoords(); floorPlanCanvas.requestRenderAll(); syncFloorPlanCanvasToDocument(); scheduleFloorPlanSave(); renderFloorPlanObjectList();
    } else if (event.target.id === "floorPlanInspectorGraphicAlt") {
      const selected = floorPlanCanvas.getActiveObject();
      selected.fpAlt = event.target.value;
      syncFloorPlanCanvasToDocument(); scheduleFloorPlanSave(); renderFloorPlanObjectList();
    }
  });
}

function floorPlanEditorKeydown(event) {
  if (event.key === "Shift") setFloorPlanRotationSnap(true);
  if (!floorPlanCanvas || !document.querySelector(".floor-plan-editor") || event.target.matches("input, textarea, select")) return;
  const active = floorPlanCanvas.getActiveObject();
  if (["Backspace", "Delete"].includes(event.key) && active) {
    event.preventDefault(); floorPlanCanvas.remove(...floorPlanCanvas.getActiveObjects()); floorPlanCanvas.discardActiveObject(); floorPlanCanvasChanged(); return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault(); document.getElementById(event.shiftKey ? "floorPlanRedoBtn" : "floorPlanUndoBtn")?.click(); return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
    event.preventDefault(); duplicateSelectedFloorPlanObjects(); return;
  }
  if (event.metaKey || event.ctrlKey) {
    if (["+", "="].includes(event.key)) {
      event.preventDefault(); setFloorPlanEditorZoom(floorPlanEditorZoom + .1); return;
    }
    if (event.key === "-") {
      event.preventDefault(); setFloorPlanEditorZoom(floorPlanEditorZoom - .1); return;
    }
    if (event.key === "0") {
      event.preventDefault(); setFloorPlanEditorZoom(1); return;
    }
  }
  const key = event.key.toLowerCase();
  if (event.key === "?" || key === "h" || key === "g" || key === "a") {
    event.preventDefault();
    if (event.key === "?") document.querySelector(".floor-plan-editor-help")?.click();
    else if (key === "h") toggleFloorPlanPan();
    else if (key === "g") toggleFloorPlanGrid();
    else toggleFloorPlanSnap();
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (floorPlanSpacePanRestore === null) {
      floorPlanSpacePanRestore = floorPlanPanEnabled;
      if (!floorPlanPanEnabled) {
        floorPlanPanEnabled = true;
        applyFloorPlanPanMode({ preserveSelection: true });
      }
    }
    return;
  }
  if (!active || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 12 : 2;
  if (event.key === "ArrowLeft") active.left -= step;
  if (event.key === "ArrowRight") active.left += step;
  if (event.key === "ArrowUp") active.top -= step;
  if (event.key === "ArrowDown") active.top += step;
  containFloorPlanFabricPosition(active);
  active.setCoords(); floorPlanCanvas.requestRenderAll(); floorPlanCanvasChanged();
}

function floorPlanEditorKeyup(event) {
  if (event.key === "Shift") setFloorPlanRotationSnap(false);
  if (event.code !== "Space" || floorPlanSpacePanRestore === null) return;
  event.preventDefault();
  floorPlanPanEnabled = floorPlanSpacePanRestore;
  floorPlanSpacePanRestore = null;
  endFloorPlanPanGesture();
  applyFloorPlanPanMode({ preserveSelection: true });
}
