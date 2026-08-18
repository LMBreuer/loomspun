/* Fachliches Lageplan-Modell und bibliotheksunabhängiges SVG-Rendering. */
const FLOOR_PLAN_SCHEMA_VERSION = 1;
const FLOOR_PLAN_PAGE_SIZES = {
  a4: { portrait: { width: 792, height: 1120 }, landscape: { width: 1120, height: 792 } },
  letter: { portrait: { width: 816, height: 1056 }, landscape: { width: 1056, height: 816 } },
};
const FLOOR_PLAN_SIZE = FLOOR_PLAN_PAGE_SIZES.a4;
const FLOOR_PLAN_GRAPHIC_LIMITS = {
  count: 4,
  inputBytes: 2 * 1024 * 1024,
  sourcePixels: 4096,
  outputPixels: 1200,
  outputBytes: 280 * 1024,
};
const FLOOR_PLAN_GRAPHIC_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const FLOOR_PLAN_SYMBOLS = {
  entrance: { glyph: "⇥", category: "access", de: "Eingang", en: "Entrance" },
  exit: { glyph: "↗", category: "access", de: "Ausgang", en: "Exit" },
  door: { glyph: "▯", category: "access", de: "Tür", en: "Door" },
  stairs: { glyph: "▁▃▅▇", glyphScale: .56, category: "access", de: "Treppe", en: "Stairs" },
  lift: { glyph: "↕", category: "access", de: "Lift", en: "Lift" },
  accessible: { glyph: "♿︎", category: "access", de: "Barrierefrei", en: "Accessible" },
  wc: { glyph: "WC", category: "service", de: "WC", en: "WC" },
  kitchen: { glyph: "K", category: "service", de: "Küche", en: "Kitchen" },
  info: { glyph: "i", category: "service", de: "Information", en: "Information" },
  wardrobe: { glyph: "G", category: "service", de: "Garderobe", en: "Cloakroom" },
  firstAid: { glyph: "+", category: "service", de: "Erste Hilfe", en: "First aid" },
  route: { glyph: "→", category: "orientation", de: "Wegpfeil", en: "Direction" },
  assembly: { glyph: "◎", category: "orientation", de: "Sammelpunkt", en: "Assembly point" },
  parking: { glyph: "P", category: "orientation", de: "Parkplatz", en: "Parking" },
  emergency: { glyph: "!", category: "orientation", de: "Notausgang", en: "Emergency exit" },
};
const FLOOR_PLAN_SYMBOL_CATEGORIES = {
  access: { de: "Zugänge & Wege", en: "Access & movement" },
  service: { de: "Service", en: "Services" },
  orientation: { de: "Orientierung", en: "Wayfinding" },
};
const FLOOR_PLAN_ROOM_GLYPHS = {
  circle: "●", triangle: "▲", square: "■", diamond: "◆", plus: "✚", cross: "✕", hexagon: "⬢",
  star: "★", sparkle: "✦", sun: "☀", moon: "☾", cloud: "☁", flower: "✿", tree: "♣",
  heart: "♥", flag: "⚑", key: "⚿", book: "▤", music: "♪", bulb: "☼", letter: "✉",
  dice: "⚄", invader: "⌘", wc: "WC", kitchen: "♨", door: "▯", coat: "♧", toy: "♟",
};
const floorPlanRoomMarkerNameKey = marker => `roomMarker${marker.charAt(0).toUpperCase()}${marker.slice(1)}`;
const FLOOR_PLAN_ROOM_MARKER_SYMBOLS = Object.fromEntries(ROOM_MARKERS.map(marker => [`room-marker-${marker}`, {
  glyph: FLOOR_PLAN_ROOM_GLYPHS[marker], category: "roomMarkers", nameKey: floorPlanRoomMarkerNameKey(marker),
}]));
Object.assign(FLOOR_PLAN_SYMBOLS, FLOOR_PLAN_ROOM_MARKER_SYMBOLS);
FLOOR_PLAN_SYMBOL_CATEGORIES.roomMarkers = { de: "Raumsymbole", en: "Room symbols" };

function floorPlanSymbolName(symbol) {
  return symbol?.nameKey ? tr(symbol.nameKey) : symbol?.[LANG === "en" ? "en" : "de"] || "";
}

function floorPlanId(prefix = "fp") {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function floorPlanPageSize(pageFormat = "a4", orientation = "landscape", customWidth, customHeight) {
  if (pageFormat === "custom") return {
    width: floorPlanNumber(customWidth, orientation === "portrait" ? 792 : 1120, 320, 2400),
    height: floorPlanNumber(customHeight, orientation === "portrait" ? 1120 : 792, 320, 2400),
  };
  return FLOOR_PLAN_PAGE_SIZES[pageFormat]?.[orientation] || FLOOR_PLAN_PAGE_SIZES.a4[orientation] || FLOOR_PLAN_PAGE_SIZES.a4.landscape;
}

function newFloorPlanFloor(name, orientation = "landscape", pageFormat = "a4", customWidth, customHeight) {
  const size = floorPlanPageSize(pageFormat, orientation, customWidth, customHeight);
  return { id: floorPlanId("floor"), name: name || tr("floorPlanDefaultFloor"), width: size.width, height: size.height, objects: [] };
}

function newFloorPlanDocument() {
  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    orientation: "landscape",
    pageFormat: "a4",
    pageWidth: FLOOR_PLAN_SIZE.landscape.width,
    pageHeight: FLOOR_PLAN_SIZE.landscape.height,
    title: "",
    floors: [newFloorPlanFloor(tr("floorPlanDefaultFloor"), "landscape")],
  };
}

const floorPlanNumber = (value, fallback, min = -10000, max = 10000) => {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : Number(fallback);
  return Math.min(max, Math.max(min, Number.isFinite(resolved) ? resolved : 0));
};

function normalizeFloorPlanObject(raw, floor) {
  if (!raw || typeof raw !== "object" || !["room", "text", "symbol", "image", "shape"].includes(raw.type)) return null;
  const shapeKind = raw.type === "shape" && ["line", "rectangle", "ellipse"].includes(raw.shape) ? raw.shape : "rectangle";
  const minDimension = raw.type === "shape" ? 1 : 24;
  const defaultWidth = raw.type === "room" ? 250 : raw.type === "shape" ? 180 : 120;
  const defaultHeight = raw.type === "room" ? 150 : raw.type === "shape" ? shapeKind === "line" ? 6 : 100 : 56;
  const width = floorPlanNumber(raw.width, defaultWidth, minDimension, floor.width);
  const height = floorPlanNumber(raw.height, defaultHeight, minDimension, floor.height);
  const legacyOpacity = floorPlanNumber(raw.opacity, 1, 0, 1);
  const base = {
    id: String(raw.id || floorPlanId(raw.type)),
    type: raw.type,
    x: floorPlanNumber(raw.x, 80, 0, Math.max(0, floor.width - width)),
    y: floorPlanNumber(raw.y, 80, 0, Math.max(0, floor.height - height)),
    width,
    height,
    rotation: floorPlanNumber(raw.rotation, 0, -360, 360),
    outlineVisible: raw.outlineVisible !== false,
    opacity: raw.type === "room" ? 1 : legacyOpacity,
  };
  if (raw.type === "room") {
    const customColor = /^#[0-9a-f]{6}$/i.test(String(raw.customColor || "")) ? String(raw.customColor) : "#64748b";
    const foregroundColor = /^#[0-9a-f]{6}$/i.test(String(raw.foregroundColor || "")) ? String(raw.foregroundColor) : null;
    return {
      ...base,
      roomId: raw.roomId ? String(raw.roomId) : null,
      fallbackLabel: String(raw.fallbackLabel || "").slice(0, 80),
      labelOverride: String(raw.labelOverride || "").replace(/\r/g, "").slice(0, 120),
      customLocation: String(raw.customLocation || "").slice(0, 80),
      customColor,
      foregroundColor,
      customMarker: FLOOR_PLAN_ROOM_GLYPHS[raw.customMarker] ? raw.customMarker : "square",
      customSymbol: FLOOR_PLAN_SYMBOLS[raw.customSymbol]
        ? raw.customSymbol
        : FLOOR_PLAN_ROOM_GLYPHS[raw.customMarker] ? `room-marker-${raw.customMarker}` : "room-marker-square",
      labelVisible: raw.labelVisible !== false,
      markerVisible: raw.markerVisible !== false,
      shape: raw.shape === "ellipse" ? "ellipse" : "rectangle",
      cornerRadius: floorPlanNumber(raw.cornerRadius, 0, 0, 60),
      fillOpacity: floorPlanNumber(raw.fillOpacity, legacyOpacity < 1 ? legacyOpacity : .15, 0, 1),
    };
  }
  if (raw.type === "text") {
    const color = /^#[0-9a-f]{6}$/i.test(String(raw.color || "")) ? String(raw.color) : "#172033";
    const textAlign = ["left", "center", "right"].includes(raw.textAlign) ? raw.textAlign : "center";
    return { ...base, text: String(raw.text || "Text").slice(0, 240), color, fontSize: floorPlanNumber(raw.fontSize, 28, 12, 96), textAlign };
  }
  if (raw.type === "shape") {
    const color = /^#[0-9a-f]{6}$/i.test(String(raw.color || "")) ? String(raw.color) : "#64748b";
    return {
      ...base,
      shape: shapeKind,
      name: String(raw.name || "").slice(0, 80),
      color,
      fillOpacity: shapeKind === "line" ? 1 : floorPlanNumber(raw.fillOpacity, .15, 0, 1),
      outlineVisible: shapeKind === "line" ? false : raw.outlineVisible !== false,
    };
  }
  if (raw.type === "image") {
    const src = String(raw.src || "");
    if (!FLOOR_PLAN_GRAPHIC_DATA_URL.test(src) || src.length > 390000) return null;
    return { ...base, src, alt: String(raw.alt || "").slice(0, 120) };
  }
  const label = String(raw.label || "").slice(0, 80);
  return {
    ...base,
    symbol: FLOOR_PLAN_SYMBOLS[raw.symbol] ? raw.symbol : "info",
    label,
    labelVisible: raw.labelVisible === true || (raw.labelVisible == null && Boolean(label)),
    backgroundVisible: raw.backgroundVisible !== false,
  };
}

function normalizeFloorPlanDocument(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const orientation = source.orientation === "portrait" ? "portrait" : "landscape";
  const firstFloor = Array.isArray(source.floors) ? source.floors[0] : null;
  const firstWidth = floorPlanNumber(firstFloor?.width, FLOOR_PLAN_SIZE[orientation].width, 320, 2400);
  const firstHeight = floorPlanNumber(firstFloor?.height, FLOOR_PLAN_SIZE[orientation].height, 320, 2400);
  const matches = (format, tolerance = 2) => {
    const size = FLOOR_PLAN_PAGE_SIZES[format][orientation];
    return Math.abs(firstWidth - size.width) <= tolerance && Math.abs(firstHeight - size.height) <= tolerance;
  };
  const pageFormat = ["a4", "letter", "custom"].includes(source.pageFormat)
    ? source.pageFormat
    : matches("a4") ? "a4" : matches("letter") ? "letter" : "custom";
  const expectedSize = floorPlanPageSize(pageFormat, orientation, source.pageWidth ?? firstWidth, source.pageHeight ?? firstHeight);
  let graphicCount = 0;
  const floors = (Array.isArray(source.floors) ? source.floors : []).slice(0, 20).map((item, index) => {
    const floor = {
      id: String(item?.id || floorPlanId("floor")),
      name: String(item?.name || `${tr("floorPlanFloor")} ${index + 1}`).slice(0, 80),
      width: floorPlanNumber(item?.width, expectedSize.width, 320, 2400),
      height: floorPlanNumber(item?.height, expectedSize.height, 320, 2400),
      objects: [],
    };
    floor.objects = (Array.isArray(item?.objects) ? item.objects : []).slice(0, 500).map(object => normalizeFloorPlanObject(object, floor)).filter(object => {
      if (!object) return false;
      if (object.type !== "image") return true;
      if (graphicCount >= FLOOR_PLAN_GRAPHIC_LIMITS.count) return false;
      graphicCount += 1;
      return true;
    });
    return floor;
  });
  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    orientation,
    pageFormat,
    pageWidth: expectedSize.width,
    pageHeight: expectedSize.height,
    title: String(source.title || "").slice(0, 120),
    floors: floors.length ? floors : [newFloorPlanFloor(tr("floorPlanDefaultFloor"), orientation, pageFormat, expectedSize.width, expectedSize.height)],
  };
}

function floorPlanSourceMode() {
  const stored = S.con?.floor_plan_mode;
  if (["none", "external", "editor", "both"].includes(stored)) return stored;
  return floorPlanUrl() ? "external" : "none";
}

function floorPlanExternalEnabled() {
  return ["external", "both"].includes(floorPlanSourceMode()) && !!floorPlanUrl();
}

function floorPlanInteractiveEnabled() {
  return ["editor", "both"].includes(floorPlanSourceMode());
}

function floorPlanModeForSources({ external = false, interactive = false } = {}) {
  if (external && interactive) return "both";
  if (interactive) return "editor";
  if (external) return "external";
  return "none";
}

function floorPlanPublicTarget() {
  if (floorPlanInteractiveEnabled() && S.floorPlanPublic?.document) {
    return `${location.pathname}?con=${encodeURIComponent(S.con?.slug || S.con?.id || CON_PARAM)}&view=lageplan`;
  }
  if (floorPlanExternalEnabled()) return floorPlanUrl();
  return "";
}

function floorPlanPublicSources() {
  const sources = [];
  if (floorPlanInteractiveEnabled() && S.floorPlanPublic?.document) {
    sources.push({ key: "interactive", href: `${location.pathname}?con=${encodeURIComponent(S.con?.slug || S.con?.id || CON_PARAM)}&view=lageplan`, external: false });
  }
  if (floorPlanExternalEnabled()) sources.push({ key: "file", href: floorPlanUrl(), external: true });
  return sources;
}

function floorPlanFloorForRoom(documentValue, roomId) {
  if (!documentValue || !roomId) return null;
  const document = normalizeFloorPlanDocument(documentValue);
  return document.floors.find(floor => floor.objects.some(object => object.type === "room" && object.roomId === roomId)) || null;
}

function floorPlanRoom(roomId) {
  return S.rooms.find(room => room.id === roomId) || null;
}

function floorPlanRoomColor(room) {
  if (validRoomColor(room?.color)) return room.color;
  return room ? automaticRoomColorHex(room) : "#64748b";
}

function floorPlanRoomGlyph(room) {
  const marker = validRoomMarker(room?.marker) ? room.marker : ROOM_MARKERS[Math.max(0, S.rooms.indexOf(room)) % ROOM_MARKERS.length];
  return FLOOR_PLAN_ROOM_GLYPHS[marker] || "●";
}

function floorPlanObjectRoomColor(object, room = floorPlanRoom(object?.roomId)) {
  if (room) return floorPlanRoomColor(room);
  return /^#[0-9a-f]{6}$/i.test(object?.customColor || "") ? object.customColor : "#64748b";
}

function floorPlanColorLuminance(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!match) return 1;
  const channels = [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function floorPlanContrastRatio(background, foreground) {
  const values = [floorPlanColorLuminance(background), floorPlanColorLuminance(foreground)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

function floorPlanColorOnWhite(color, opacity = .16) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!match) return "#ffffff";
  const channels = [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16))
    .map(value => Math.round(value * opacity + 255 * (1 - opacity)).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

function floorPlanObjectRoomForeground(object, room = floorPlanRoom(object?.roomId)) {
  if (/^#[0-9a-f]{6}$/i.test(String(object?.foregroundColor || ""))) return object.foregroundColor;
  const background = floorPlanColorOnWhite(floorPlanObjectRoomColor(object, room));
  return floorPlanContrastRatio(background, "#ffffff") > floorPlanContrastRatio(background, "#172033") ? "#ffffff" : "#172033";
}

function floorPlanObjectRoomGlyph(object, room = floorPlanRoom(object?.roomId)) {
  return floorPlanObjectRoomSymbol(object, room)?.glyph || "■";
}

function floorPlanObjectRoomSymbol(object, room = floorPlanRoom(object?.roomId)) {
  if (room) {
    const marker = validRoomMarker(room.marker) ? room.marker : ROOM_MARKERS[Math.max(0, S.rooms.indexOf(room)) % ROOM_MARKERS.length];
    return FLOOR_PLAN_SYMBOLS[`room-marker-${marker}`] || { glyph: floorPlanRoomGlyph(room) };
  }
  return FLOOR_PLAN_SYMBOLS[object?.customSymbol] || (FLOOR_PLAN_ROOM_GLYPHS[object?.customMarker] ? FLOOR_PLAN_SYMBOLS[`room-marker-${object.customMarker}`] : null);
}

function floorPlanSymbolLayout(object, symbol) {
  const labelVisible = object.labelVisible !== false && Boolean(object.label);
  const labelHeight = labelVisible ? Math.min(30, Math.max(22, object.height * .22)) : 0;
  const iconHeight = Math.max(24, object.height - labelHeight);
  const diameter = Math.max(24, Math.min(object.width, iconHeight) - 8);
  const glyphScale = Number.isFinite(symbol?.glyphScale) ? symbol.glyphScale : 1;
  const fontSize = Math.max(18, Math.min(96, diameter * (object.backgroundVisible === false ? .58 : .4) * glyphScale));
  const labelFontSize = Math.max(8, Math.min(15, (object.width - 8) / Math.max(1, String(object.label || "").length * .58)));
  return {
    labelVisible,
    labelHeight,
    iconHeight,
    iconCenterY: iconHeight / 2,
    labelCenterY: object.height - labelHeight / 2,
    diameter,
    fontSize,
    labelFontSize,
  };
}

function floorPlanTextLines(text, maxChars = 22, maxLines = 3) {
  const limit = Math.max(1, Math.floor(maxChars));
  const lineLimit = Math.max(1, Math.floor(maxLines));
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const segments = words.flatMap(word => {
    const breakPositions = [];
    let cleanWord = "";
    for (const character of word) {
      if (character === "\u00ad") breakPositions.push(cleanWord.length);
      else cleanWord += character;
    }
    if (cleanWord.length <= limit) return [cleanWord];
    const parts = [];
    let offset = 0;
    while (cleanWord.length - offset > limit) {
      const softBreak = breakPositions.filter(position => position > offset && position - offset + 1 <= limit).at(-1);
      if (softBreak) {
        parts.push(`${cleanWord.slice(offset, softBreak)}-`);
        offset = softBreak;
      } else {
        parts.push(cleanWord.slice(offset, offset + limit));
        offset += limit;
      }
    }
    if (offset < cleanWord.length) parts.push(cleanWord.slice(offset));
    return parts;
  });
  const lines = [];
  let truncated = false;
  for (const word of segments) {
    const current = lines.at(-1);
    if (!current) lines.push(word);
    else if (current.length + 1 + word.length <= limit) lines[lines.length - 1] = `${current} ${word}`;
    else if (lines.length < lineLimit) lines.push(word);
    else { truncated = true; break; }
  }
  if (truncated && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
  }
  return lines.length ? lines : [""];
}

function floorPlanParagraphLines(text, maxChars = 22, maxLines = 3) {
  const lines = [];
  const paragraphs = String(text || "").replace(/\r/g, "").split("\n");
  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) break;
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...floorPlanTextLines(paragraph, maxChars, maxLines - lines.length));
  }
  return lines.slice(0, maxLines).length ? lines.slice(0, maxLines) : [""];
}

function floorPlanTextLayout(object) {
  const width = Math.max(24, Number(object.width) || 120);
  const height = Math.max(24, Number(object.height) || 56);
  const padding = Math.max(4, Math.min(14, Math.min(width, height) * .1));
  const requestedFontSize = floorPlanNumber(object.fontSize, 28, 12, 96);
  const fontSize = Math.max(8, Math.min(requestedFontSize, (height - padding * 2) / 1.2));
  const lineHeight = fontSize * 1.2;
  const contentWidth = Math.max(8, width - padding * 2);
  const maxChars = Math.max(1, Math.floor(contentWidth / Math.max(1, fontSize * .58)));
  const maxLines = Math.max(1, Math.floor((height - padding * 2) / lineHeight));
  const visibleLines = floorPlanParagraphLines(object.text, maxChars, maxLines);
  const textAlign = ["left", "center", "right"].includes(object.textAlign) ? object.textAlign : "center";
  const anchor = textAlign === "left" ? "start" : textAlign === "right" ? "end" : "middle";
  const anchorX = textAlign === "left" ? object.x + padding : textAlign === "right" ? object.x + width - padding : object.x + width / 2;
  return { lines: visibleLines.length ? visibleLines : [""], padding, contentWidth, fontSize, lineHeight, textAlign, anchor, anchorX };
}

function floorPlanRoomLayout(object, label, location) {
  const labelVisible = object.labelVisible !== false;
  const markerVisible = object.markerVisible !== false;
  const labelFontSize = Math.max(8, Math.min(26, object.width / 10, object.height * .25));
  const horizontalInset = Math.min(16, Math.max(4, object.width * .08));
  const labelWidth = Math.max(4, object.width - horizontalInset * 2);
  const lineHeight = Math.max(9, Math.min(30, labelFontSize * 1.12));
  const labelMaxChars = Math.max(1, Math.floor(labelWidth / Math.max(1, labelFontSize * .62)));
  const lines = labelVisible ? floorPlanParagraphLines(label, labelMaxChars, 3) : [];
  const markerSize = markerVisible ? Math.max(8, Math.min(64, object.width * .2, object.height * .34)) : 0;
  const locationFontSize = Math.min(13, Math.max(7, object.height * .1));
  const locationMaxChars = Math.max(1, Math.floor(labelWidth / Math.max(1, locationFontSize * .58)));
  const locationText = location ? floorPlanTextLines(location, locationMaxChars, 1)[0] : "";
  const topInset = Math.min(12, object.height * .1);
  const contentBottom = object.height - (labelVisible && location ? Math.min(34, object.height * .28) : Math.min(12, object.height * .1));
  const labelHeight = lines.length * lineHeight;
  const gap = markerVisible && labelVisible ? Math.max(6, Math.min(12, object.height * .06)) : 0;
  const contentHeight = labelHeight + gap + markerSize;
  const contentTop = topInset + Math.max(0, (contentBottom - topInset - contentHeight) / 2);
  return {
    lines,
    labelWidth,
    labelFontSize,
    lineHeight,
    labelCenterY: labelVisible ? contentTop + labelHeight / 2 : contentTop,
    markerCenterY: markerVisible ? contentTop + labelHeight + gap + markerSize / 2 : contentTop + labelHeight / 2,
    markerSize,
    locationText,
    locationFontSize,
    locationY: object.height - Math.min(16, object.height * .14),
  };
}

function floorPlanOpacityAttribute(object) {
  const opacity = floorPlanNumber(object.opacity, 1, 0, 1);
  return opacity < 1 ? ` opacity="${opacity}"` : "";
}

function floorPlanRotation(object) {
  const cx = object.x + object.width / 2;
  const cy = object.y + object.height / 2;
  return object.rotation ? ` transform="rotate(${object.rotation} ${cx} ${cy})"` : "";
}

function floorPlanRoomPersonalSvg(object, layout, numbers) {
  if (!numbers?.length) return "";
  const numberText = numbers.map(number => String(number).padStart(2, "0")).join(" · ");
  const inset = Math.min(6, object.width * .08, object.height * .08);
  const outline = object.shape === "ellipse"
    ? `<ellipse class="floor-plan-personal-outline" cx="${object.x + object.width / 2}" cy="${object.y + object.height / 2}" rx="${Math.max(1, object.width / 2 - inset)}" ry="${Math.max(1, object.height / 2 - inset)}" />`
    : `<rect class="floor-plan-personal-outline" x="${object.x + inset}" y="${object.y + inset}" width="${Math.max(1, object.width - inset * 2)}" height="${Math.max(1, object.height - inset * 2)}" rx="${Math.max(0, Math.min(object.cornerRadius ?? 0, object.width / 2, object.height / 2) - inset / 2)}" />`;
  const numberFontSize = Math.max(11, Math.min(15, object.height * .13));
  const numberWidth = Math.max(numberFontSize, numberText.length * numberFontSize * .58);
  const longestLabel = layout.lines.reduce((longest, line) => line.length > longest.length ? line : longest, "");
  const labelWidth = longestLabel.length * layout.labelFontSize * .55;
  const roomCenterX = object.x + object.width / 2;
  const besideLabelX = roomCenterX + labelWidth / 2 + numberWidth / 2 + 4;
  const minNumberX = object.x + numberWidth / 2 + inset + 2;
  const maxNumberX = object.x + object.width - numberWidth / 2 - inset - 2;
  const fitsBesideLabel = labelWidth + numberWidth + 14 <= object.width;
  const numberX = Math.max(minNumberX, Math.min(maxNumberX, fitsBesideLabel ? besideLabelX : maxNumberX));
  const desiredNumberY = object.y + layout.labelCenterY - layout.labelFontSize * .72;
  const numberY = Math.max(object.y + numberFontSize + inset, Math.min(object.y + object.height - numberFontSize - inset, desiredNumberY));
  return `<g class="floor-plan-personal-reference" pointer-events="none"${floorPlanRotation(object)} aria-hidden="true">
    ${outline}
    <text class="floor-plan-personal-number" x="${numberX}" y="${numberY}" text-anchor="middle" dominant-baseline="central" style="font-size:${numberFontSize}px">${esc(numberText)}</text>
  </g>`;
}

function floorPlanRoomSvg(object, { interactive = false, personalRoomNumbers = null, dimIrrelevantRooms = false } = {}) {
  const room = floorPlanRoom(object.roomId);
  const label = object.labelOverride || room?.name || object.fallbackLabel || tr("floorPlanUnlinkedRoom");
  const color = floorPlanObjectRoomColor(object, room);
  const foreground = floorPlanObjectRoomForeground(object, room);
  const glyph = floorPlanObjectRoomGlyph(object, room);
  const markerScale = floorPlanObjectRoomSymbol(object, room)?.glyphScale || 1;
  const labelVisible = object.labelVisible !== false;
  const location = labelVisible ? room?.floor || object.customLocation : "";
  const isCustom = !object.roomId;
  const layout = floorPlanRoomLayout(object, label, location);
  const textStart = object.y + layout.labelCenterY - ((layout.lines.length - 1) * layout.lineHeight) / 2;
  const text = layout.lines.map((line, index) => `<tspan x="${object.x + object.width / 2}" dy="${index ? layout.lineHeight : 0}">${esc(line)}</tspan>`).join("");
  const attrs = room && interactive
    ? ` data-floor-plan-room="${esc(room.id)}" tabindex="0" role="button" aria-label="${esc(tr("floorPlanOpenRoomAria", { name: room.name }))}"`
    : ` aria-label="${esc(label)}"`;
  const cornerRadius = Math.min(object.cornerRadius ?? 0, object.width / 2, object.height / 2);
  const shape = object.shape === "ellipse"
    ? `<ellipse class="floor-plan-room-shape" cx="${object.x + object.width / 2}" cy="${object.y + object.height / 2}" rx="${object.width / 2}" ry="${object.height / 2}" />`
    : `<rect class="floor-plan-room-shape" x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" rx="${cornerRadius}" />`;
  const personalNumbers = room ? personalRoomNumbers?.get(room.id) || [] : [];
  return `<g class="floor-plan-map-room${room ? " is-linked" : isCustom ? " is-custom" : " is-orphan"}${object.outlineVisible === false ? " is-outline-hidden" : ""}${object.foregroundColor ? " has-custom-foreground" : ""}${personalNumbers.length ? " has-personal-reference" : ""}${dimIrrelevantRooms && !personalNumbers.length ? " is-personal-muted" : ""}"${attrs}${floorPlanRotation(object)}${floorPlanOpacityAttribute(object)} style="--floor-plan-room-color:${color};--floor-plan-room-foreground:${foreground};--floor-plan-room-fill-opacity:${floorPlanNumber(object.fillOpacity, .15, 0, 1)}">
    ${shape}
    ${labelVisible ? `<text class="floor-plan-map-label" x="${object.x + object.width / 2}" y="${textStart}" text-anchor="middle" dominant-baseline="middle" style="font-size:${layout.labelFontSize}px">${text}</text>` : ""}
    ${object.markerVisible === false ? "" : `<text class="floor-plan-map-marker" x="${object.x + object.width / 2}" y="${object.y + layout.markerCenterY}" text-anchor="middle" dominant-baseline="central" style="font-size:${layout.markerSize * markerScale}px">${esc(glyph)}</text>`}
    ${layout.locationText ? `<text class="floor-plan-map-location" x="${object.x + object.width / 2}" y="${object.y + layout.locationY}" text-anchor="middle" style="font-size:${layout.locationFontSize}px">${esc(layout.locationText)}</text>` : ""}
  </g>${floorPlanRoomPersonalSvg(object, layout, personalNumbers)}`;
}

function floorPlanSvgViewport(floor) {
  return { x: 0, y: 0, width: floor.width, height: floor.height };
}

function floorPlanObjectSvg(object, options) {
  if (object.type === "room") return floorPlanRoomSvg(object, options);
  if (object.type === "text") {
    const layout = floorPlanTextLayout(object);
    const text = layout.lines.map((line, index) => `<tspan x="${layout.anchorX}" dy="${index ? layout.lineHeight : 0}">${esc(line)}</tspan>`).join("");
    const defaultColor = !object.color || object.color.toLowerCase() === "#172033";
    return `<g class="floor-plan-map-text${defaultColor ? " is-default-color" : ""}"${floorPlanRotation(object)}${floorPlanOpacityAttribute(object)}><text x="${layout.anchorX}" y="${object.y + object.height / 2 - ((layout.lines.length - 1) * layout.lineHeight) / 2}" text-anchor="${layout.anchor}" dominant-baseline="middle" style="fill:${object.color || "#172033"};font-size:${layout.fontSize}px">${text}</text></g>`;
  }
  if (object.type === "shape") {
    const color = /^#[0-9a-f]{6}$/i.test(String(object.color || "")) ? object.color : "#64748b";
    const fillOpacity = object.shape === "line" ? 1 : floorPlanNumber(object.fillOpacity, .15, 0, 1);
    const stroke = object.shape === "line" || object.outlineVisible === false ? "none" : color;
    const shape = object.shape === "ellipse"
      ? `<ellipse cx="${object.x + object.width / 2}" cy="${object.y + object.height / 2}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${stroke === "none" ? 0 : 2}" vector-effect="non-scaling-stroke" />`
      : `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${stroke === "none" ? 0 : 2}" vector-effect="non-scaling-stroke" />`;
    return `<g class="floor-plan-map-shape"${floorPlanRotation(object)}${floorPlanOpacityAttribute(object)} aria-label="${esc(object.name || tr(`floorPlanShape${object.shape === "line" ? "Line" : object.shape === "ellipse" ? "Ellipse" : "Rectangle"}`))}">${shape}</g>`;
  }
  if (object.type === "image") return `<g class="floor-plan-map-image"${floorPlanRotation(object)}${floorPlanOpacityAttribute(object)} aria-label="${esc(object.alt || tr("floorPlanGraphic"))}">
    <image href="${esc(object.src)}" x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" preserveAspectRatio="xMidYMid meet" />
  </g>`;
  const symbol = FLOOR_PLAN_SYMBOLS[object.symbol] || FLOOR_PLAN_SYMBOLS.info;
  const label = object.label || floorPlanSymbolName(symbol);
  const layout = floorPlanSymbolLayout(object, symbol);
  const iconX = object.x + object.width / 2;
  const iconY = object.y + layout.iconCenterY;
  const glyphOutline = object.backgroundVisible === false && object.outlineVisible !== false
    ? "paint-order:stroke fill;stroke:#62708a;stroke-width:3px;stroke-linejoin:round;"
    : "";
  return `<g class="floor-plan-map-symbol${object.outlineVisible === false ? " is-outline-hidden" : ""}"${floorPlanRotation(object)}${floorPlanOpacityAttribute(object)} aria-label="${esc(label)}">
    ${object.backgroundVisible === false ? "" : `<circle cx="${iconX}" cy="${iconY}" r="${layout.diameter / 2}" />`}
    <text x="${iconX}" y="${iconY}" text-anchor="middle" dominant-baseline="central" style="${glyphOutline}font-size:${layout.fontSize}px">${esc(symbol.glyph)}</text>
    ${layout.labelVisible ? `<text class="floor-plan-map-symbol-label" x="${iconX}" y="${object.y + layout.labelCenterY}" text-anchor="middle" dominant-baseline="central" style="font-size:${layout.labelFontSize}px">${esc(object.label)}</text>` : ""}
  </g>`;
}

function floorPlanSvgHtml(documentValue, floorValue, { interactive = false, id = "", personalRoomNumbers = null, dimIrrelevantRooms = false } = {}) {
  const document = normalizeFloorPlanDocument(documentValue);
  const floor = document.floors.find(item => item.id === floorValue?.id) || document.floors[0];
  const title = `${document.title || S.con?.name || tr("floorPlan")} · ${floor.name}`;
  const viewport = floorPlanSvgViewport(floor);
  const personalMode = !!personalRoomNumbers?.size;
  return `<svg${id ? ` id="${esc(id)}"` : ""} class="floor-plan-map${personalMode ? " is-personal-map" : ""}" viewBox="${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}" data-floor-plan-width="${viewport.width}" data-floor-plan-height="${viewport.height}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">
    <title>${esc(title)}</title>
    <style>
      .floor-plan-map-page{fill:var(--floor-plan-page-bg,#fff)}.floor-plan-map-room .floor-plan-room-shape{fill:var(--floor-plan-room-color);fill-opacity:var(--floor-plan-room-fill-opacity,.15);stroke:var(--floor-plan-room-color);stroke-width:4}
      .floor-plan-map-label{fill:var(--floor-plan-room-foreground);font:700 25px Arial,sans-serif}.floor-plan-map-marker{fill:var(--floor-plan-room-foreground);font:800 48px Arial,sans-serif}
      .floor-plan-map-location{fill:var(--floor-plan-room-foreground);font:500 13px Arial,sans-serif}.floor-plan-map-text text{fill:#172033;font:600 28px Arial,sans-serif}
      .floor-plan-map-symbol circle{fill:var(--floor-plan-symbol-bg,#fff);stroke:var(--floor-plan-symbol-border,#62708a);stroke-width:4}.floor-plan-map-symbol.is-outline-hidden circle{stroke:none}.floor-plan-map-symbol>text{fill:var(--floor-plan-symbol-text,#27344d);font-family:Arial,sans-serif;font-weight:700}.floor-plan-map-symbol-label{fill:var(--floor-plan-symbol-label,#596579)!important;font-family:Arial,sans-serif!important;font-weight:600!important}
      .floor-plan-map-room.is-orphan .floor-plan-room-shape{stroke:#b45309;stroke-dasharray:10 7;fill:#fef3c7}.floor-plan-map-room.is-outline-hidden .floor-plan-room-shape{stroke:none;stroke-dasharray:none}
      .floor-plan-map-room.is-personal-muted{opacity:.68}
      .floor-plan-personal-outline{fill:none;stroke:#8e2d35;stroke-width:3;stroke-opacity:.66;vector-effect:non-scaling-stroke}.floor-plan-personal-number{fill:#8e2d35;stroke:var(--floor-plan-page-bg,#fff);stroke-width:2.5px;paint-order:stroke fill;stroke-linejoin:round;font-family:Arial,sans-serif;font-weight:800;letter-spacing:.4px}
    </style>
    <rect class="floor-plan-map-page" x="0" y="0" width="${floor.width}" height="${floor.height}" />
    <g class="floor-plan-map-content">${floor.objects.map(object => floorPlanObjectSvg(object, { interactive, personalRoomNumbers, dimIrrelevantRooms })).join("")}</g>
  </svg>`;
}

function floorPlanLinkedRooms(documentValue) {
  const ids = new Set(normalizeFloorPlanDocument(documentValue).floors.flatMap(floor => floor.objects.filter(object => object.type === "room" && object.roomId).map(object => object.roomId)));
  return S.rooms.filter(room => ids.has(room.id));
}

function floorPlanLegendItems(documentValue) {
  const document = normalizeFloorPlanDocument(documentValue);
  const items = [];
  const seenRooms = new Set();
  document.floors.forEach(floor => floor.objects.filter(object => object.type === "room").forEach(object => {
    const room = floorPlanRoom(object.roomId);
    if (room) {
      if (seenRooms.has(room.id)) return;
      seenRooms.add(room.id);
      items.push({ id: room.id, name: object.labelOverride || room.name, color: floorPlanRoomColor(room), glyph: floorPlanRoomGlyph(room) });
      return;
    }
    items.push({ id: object.id, name: object.fallbackLabel || tr("floorPlanUnlinkedRoom"), color: floorPlanObjectRoomColor(object), glyph: floorPlanObjectRoomGlyph(object) });
  }));
  return items;
}
