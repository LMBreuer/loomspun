/* ---------- Theme-Umschalter ---------- */
const VIENNA_ROSETTE_MARKUP = `<span class="vienna-rosette" aria-hidden="true"></span>`;
const THEMES = [
  { key: "dark", label: "🌙", nameKey: "themeDark" },
  { key: "light", label: "☀️", nameKey: "themeLight" },
  { key: "contrast", label: "◐", nameKey: "themeContrast" },
  { key: "colorful", label: "🎨", nameKey: "themeColorful" },
  { key: "glass", label: "🫧", nameKey: "themeGlass" },
  { key: "cosmic", label: "✦", nameKey: "themeCosmic" },
  { key: "ukiyo", label: "🌸", nameKey: "themeUkiyo" },
  { key: "solarpunk", label: "🌱", nameKey: "themeSolarpunk" },
  { key: "terminal", label: "▚", nameKey: "themeTerminal" },
  { key: "cyberpunk", label: "⚡", nameKey: "themeCyberpunk" },
  { key: "comic", label: "💥", nameKey: "themeComic" },
  { key: "punk", label: "✖", nameKey: "themePunk" },
  { key: "vienna", label: VIENNA_ROSETTE_MARKUP, nameKey: "themeVienna" },
];
// Core-3 bleiben als flache Buttons im Header sichtbar, der Rest wandert in
// ein "Weitere Themes"-Popover — siehe renderThemeSwitch().
const CORE_THEME_KEYS = ["dark", "light", "contrast"];
const ZEN_MODE_KEY = "raumplan-zen-mode";

const PIXEL_CAT_SVG = `<svg class="pixel-cat" viewBox="0 0 16 16" role="img" aria-label="Eine kleine Pixel-Katze hat sich hier versteckt" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="6" width="2" height="2"/><rect x="12" y="6" width="2" height="2"/>
  <rect x="1" y="4" width="2" height="2"/><rect x="13" y="4" width="2" height="2"/>
  <rect x="3" y="7" width="10" height="6"/>
  <rect x="4" y="13" width="2" height="1"/><rect x="10" y="13" width="2" height="1"/>
  <rect x="5" y="9" width="1" height="1" fill="#04150a"/><rect x="10" y="9" width="1" height="1" fill="#04150a"/>
  <rect x="7" y="11" width="2" height="1" fill="#04150a"/>
</svg>`;

function terminalEasterEgg() {
  if (window.__rpCatLogged) return;
  window.__rpCatLogged = true;
  console.log(
    "%c" +
    " /\\_/\\ \n" +
    "( o.o )  Loomspun Terminal aktiviert.\n" +
    " > ___ <  Miau. Viel Erfolg bei der Raumzuteilung.",
    "color:#3dff85;font-family:monospace;font-size:12px;"
  );
}

function updateCatEasterEgg() {
  const slot = document.getElementById("themeCatSlot");
  if (!slot) return;
  slot.innerHTML = document.documentElement.getAttribute("data-theme") === "terminal" ? PIXEL_CAT_SVG : "";
}

function renderPunkZineBanner() {
  let el = document.getElementById("punkZineBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "punkZineBanner";
    el.className = "punk-zine-banner no-print";
    document.body.appendChild(el);
  }
  const quotes = window.PUNK_ZINE_QUOTES || [];
  if (document.documentElement.getAttribute("data-theme") !== "punk" || !quotes.length) { el.hidden = true; return; }
  const pick = quotes[Math.floor(Math.random() * quotes.length)];
  el.hidden = false;
  el.innerHTML = `<a href="${esc(pick.url)}" target="_blank" rel="noopener" title="${esc(pick.source)}" aria-label="${esc(`${pick.quote} — ${pick.source}`)}">${esc(pick.quote)}</a>`;
}

// Gemeinfreie Ukiyo-e-Holzschnitte (Wikimedia/Wikipedia Commons, >150 Jahre
// alt), selbst gehostet statt gehotlinkt — eines zufällig PRO THEME-WECHSEL
// (nicht pro Aufruf/Klick) als dezenter Hintergrund (Deckkraft in theme-effects.css),
// plus Name+Quelle für die Attributions-Bildunterschrift (#artCaption).
const UKIYO_BACKGROUNDS = [
  { file: "images/ukiyo/great-wave.jpg", name: "Unter der Welle vor Kanagawa", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg" },
  { file: "images/ukiyo/red-fuji.jpg", name: "Roter Fuji (Fine Wind, Clear Morning)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Red_Fuji_southern_wind_clear_morning.jpg" },
  { file: "images/ukiyo/hiroshige-hakone.jpg", name: "Hakone (Hiroshige, Tōkaidō)", sourceUrl: "https://en.wikipedia.org/wiki/File:Hiroshige11_hakone.jpg" },
  { file: "images/ukiyo/hiroshige-kanbara.jpg", name: "Kanbara (Hiroshige, Tōkaidō)", sourceUrl: "https://en.wikipedia.org/wiki/File:Hiroshige16_kanbara.jpg" },
  { file: "images/ukiyo/hiroshige-kameido-plum-garden.jpg", name: "Pflaumengarten in Kameido (Hiroshige)", sourceUrl: "https://en.wikipedia.org/wiki/File:De_pruimenboomgaard_te_Kameido-Rijksmuseum_RP-P-1956-743.jpeg" },
  { file: "images/ukiyo/mandarin-duck-woodcut.jpg", name: "Mandarinenten (Holzschnitt)", sourceUrl: "https://en.wikipedia.org/wiki/File:Mandarin_duck_woodcut3.jpg" },
  { file: "images/ukiyo/hokusai-woodblock-15.jpg", name: "Holzschnitt (Hokusai)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Ukiyo-e_woodblock_print_by_Katsushika_Hokusai,_digitally_enhanced_by_rawpixel-com_15.jpg" },
  { file: "images/ukiyo/kuniyoshi-takiyasha.jpg", name: "Takiyasha und das Skelettgespenst (Kuniyoshi)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Takiyasha_the_Witch_and_the_Skeleton_Spectre,_by_Utagawa_Kuniyoshi.jpg" },
  { file: "images/ukiyo/kuniyoshi-woodblock-1.jpg", name: "Holzschnitt (Kuniyoshi)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Woodblock_print_by_Utagawa_Kuniyoshi,_digitally_enhanced_by_rawpixel-com_1.jpg" },
  { file: "images/ukiyo/hiroshige-full-moon.jpg", name: "Vollmond über Berglandschaft (Hiroshige)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hiroshige_Full_moon_over_a_mountain_landscape.jpg" },
  { file: "images/ukiyo/hiroshige-landscape-5.jpg", name: "Landschaft (Hiroshige)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hiroshige,_Landscape_5.jpg" },
];
// Gemeinfreie Golden-Age-Comic-Cover; lokale und über Commons geladene Motive.
// Jeder Eintrag verlinkt in der Bildunterschrift auf seine konkrete
// Commons-Dateiseite mit Urheber- und Lizenzangaben.
const COMIC_BACKGROUNDS = [
  { file: "images/comic/black-owl-prize-comics.jpg", name: "Black Owl (Prize Comics)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Black_Owl_in_Prize_Comics_no2.jpg" },
  { file: "images/comic/thor-weird-comics.jpg", name: "Thor (Weird Comics)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Thor_Weird_Comics.jpg" },
  { file: "images/comic/thunder-agents-1.jpg", name: "T.H.U.N.D.E.R. Agents #1", sourceUrl: "https://commons.wikimedia.org/wiki/File:Thunder_agents_issue_1.jpg" },
  { file: "images/comic/smash-comics-panel.jpg", name: "Smash Comics Vol.1 #12 (Panel)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Abdul_the_Arab_-_Smash_Comics_Vol_1_12_(panel).png" },
  { file: "images/comic/blue-beetle-1.jpg", name: "Blue Beetle #1 Cover", sourceUrl: "https://commons.wikimedia.org/wiki/File:Blue_Beetle_Number_1_Cover.jpg" },
  { file: "images/comic/mystery-men-comics-16.jpg", name: "Mystery Men Comics #16", sourceUrl: "https://commons.wikimedia.org/wiki/File:Mystery_Men_Comics_16.jpg" },
  { file: "images/comic/smash-comics-14.jpg", name: "Smash Comics #14 (Cover Art)", sourceUrl: "https://commons.wikimedia.org/wiki/File:Smash_Comics_no._14_(cover_art).jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_01.jpg?width=1600", name: "Planet Comics #1", sourceUrl: "https://commons.wikimedia.org/wiki/File:Planet_Comics_01.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_11.jpg?width=1600", name: "Planet Comics #11", sourceUrl: "https://commons.wikimedia.org/wiki/File:Planet_Comics_11.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_42.jpg?width=1600", name: "Planet Comics #42", sourceUrl: "https://commons.wikimedia.org/wiki/File:Planet_Comics_42.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_53.jpg?width=1600", name: "Planet Comics #53", sourceUrl: "https://commons.wikimedia.org/wiki/File:Planet_Comics_53.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Fantastic_Comics_-11.jpg?width=1600", name: "Fantastic Comics #11", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fantastic_Comics_-11.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jumbo_Comics_no._9_(cover_art).jpg?width=1600", name: "Jumbo Comics #9", sourceUrl: "https://commons.wikimedia.org/wiki/File:Jumbo_Comics_no._9_(cover_art).jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/WonderworldComics3.jpg?width=1600", name: "Wonderworld Comics #3", sourceUrl: "https://commons.wikimedia.org/wiki/File:WonderworldComics3.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Silverstreak_001.jpg?width=1600", name: "Silver Streak Comics #11", sourceUrl: "https://commons.wikimedia.org/wiki/File:Silverstreak_001.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Fight_Comics_82.jpg?width=1600", name: "Fight Comics #82", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fight_Comics_82.jpg" },
  { file: "https://commons.wikimedia.org/wiki/Special:Redirect/file/AmazingMan22.jpg?width=1600", name: "Amazing-Man Comics #22", sourceUrl: "https://commons.wikimedia.org/wiki/File:AmazingMan22.jpg" },
];
let currentUkiyoPick = null, currentComicPick = null, currentComicContext = null;
function pickUkiyoBackground() {
  currentUkiyoPick = UKIYO_BACKGROUNDS[Math.floor(Math.random() * UKIYO_BACKGROUNDS.length)];
  document.documentElement.style.setProperty("--ukiyo-bg", `url("${currentUkiyoPick.file}")`);
  renderArtCaption();
}
// Ein neues Zufallsbild gehört zu einem echten Navigationswechsel, nicht zu
// jedem renderActive()-Aufruf: Suche, Filter und Zuordnungen rendern dieselbe
// Ansicht oft neu und würden sonst unangenehm flackern.
function comicViewContext() {
  const pathname = location.pathname.toLowerCase();
  if (pathname.endsWith("index.html") || pathname.endsWith("/")) return "cons";
  if (typeof S === "undefined" || !S.mode) return pathname;
  if (S.mode === "print") return `print:${S.printMode || "raster"}`;
  if (S.mode === "crew") {
    const setup = S.crewView === "setup" ? `:${S.setupTab || "slots"}` : "";
    return `crew:${S.crewView || "zuordnen"}${setup}`;
  }
  return `plan:${S.view || "raster"}`;
}
function pickComicBackground(force = false) {
  const context = comicViewContext();
  if (!force && currentComicPick && currentComicContext === context) {
    renderArtCaption();
    return currentComicPick;
  }
  const previousIndex = COMIC_BACKGROUNDS.indexOf(currentComicPick);
  let index = Math.floor(Math.random() * COMIC_BACKGROUNDS.length);
  if (COMIC_BACKGROUNDS.length > 1 && index === previousIndex) {
    index = (index + 1 + Math.floor(Math.random() * (COMIC_BACKGROUNDS.length - 1))) % COMIC_BACKGROUNDS.length;
  }
  currentComicPick = COMIC_BACKGROUNDS[index];
  currentComicContext = context;
  document.documentElement.style.setProperty("--comic-bg", `url("${currentComicPick.file}")`);
  renderArtCaption();
  return currentComicPick;
}
function randomizeSolarClouds(force = false) {
  const root = document.documentElement;
  if (!force && root.dataset.solarClouds === "ready") return;
  const duration1 = 190 + Math.floor(Math.random() * 90);
  const duration2 = 240 + Math.floor(Math.random() * 110);
  root.style.setProperty("--solar-cloud-y-1", `${8 + Math.floor(Math.random() * 28)}vh`);
  root.style.setProperty("--solar-cloud-y-2", `${38 + Math.floor(Math.random() * 26)}vh`);
  root.style.setProperty("--solar-cloud-scale-1", (0.72 + Math.random() * 0.42).toFixed(2));
  root.style.setProperty("--solar-cloud-scale-2", (0.58 + Math.random() * 0.36).toFixed(2));
  root.style.setProperty("--solar-cloud-duration-1", `${duration1}s`);
  root.style.setProperty("--solar-cloud-duration-2", `${duration2}s`);
  root.style.setProperty("--solar-cloud-delay-1", `${-Math.floor(duration1 * (0.24 + Math.random() * 0.26))}s`);
  root.style.setProperty("--solar-cloud-delay-2", `${-Math.floor(duration2 * (0.50 + Math.random() * 0.24))}s`);
  root.dataset.solarClouds = "ready";
}
function renderArtCaption() {
  let el = document.getElementById("artCaption");
  if (!el) {
    el = document.createElement("div");
    el.id = "artCaption";
    el.className = "art-caption no-print";
    document.body.appendChild(el);
  }
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const pick = theme === "ukiyo" ? currentUkiyoPick : theme === "comic" ? currentComicPick : null;
  if (!pick) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<a href="${esc(pick.sourceUrl)}" target="_blank" rel="noopener">${esc((theme === "ukiyo" ? "波 " : "") + pick.name)}</a>`;
}

function colorVisionAidIsOn() {
  try { return localStorage.getItem("raumplan-color-vision-aid") === "1"; } catch { return false; }
}
function updateColorVisionAidAttribute() {
  const enabled = document.documentElement.getAttribute("data-theme") === "contrast" && colorVisionAidIsOn();
  document.documentElement.toggleAttribute("data-color-aid", enabled);
  return enabled;
}
function setColorVisionAid(enabled) {
  try { localStorage.setItem("raumplan-color-vision-aid", enabled ? "1" : "0"); } catch {}
  updateColorVisionAidAttribute();
  window.dispatchEvent(new CustomEvent("raumplan-theme-change", { detail: { key: document.documentElement.getAttribute("data-theme"), colorVisionAid: enabled } }));
}
function zenModeIsOn() {
  try { return localStorage.getItem(ZEN_MODE_KEY) === "1"; } catch { return false; }
}
function updateZenModeAttribute() {
  const enabled = zenModeIsOn();
  document.documentElement.toggleAttribute("data-zen", enabled);
  return enabled;
}
function setZenMode(enabled) {
  try { localStorage.setItem(ZEN_MODE_KEY, enabled ? "1" : "0"); } catch {}
  updateZenModeAttribute();
  document.querySelectorAll(".theme-switch-group").forEach(renderThemeSwitch);
  window.dispatchEvent(new CustomEvent("raumplan-zen-change", { detail: { enabled } }));
}
function closeViennaSources() {
  const dock = document.getElementById("viennaSources");
  if (!dock) return;
  dock.querySelector("[data-vienna-sources-panel]")?.setAttribute("hidden", "");
  dock.querySelector("[data-vienna-sources-open]")?.setAttribute("aria-expanded", "false");
}
function renderViennaSources() {
  let dock = document.getElementById("viennaSources");
  if (!dock) {
    dock = document.createElement("aside");
    dock.id = "viennaSources";
    dock.className = "vienna-sources-dock no-print";
    document.body.appendChild(dock);
  }
  const visible = document.documentElement.getAttribute("data-theme") === "vienna";
  dock.hidden = !visible;
  if (!visible) {
    dock.replaceChildren();
    return;
  }
  dock.innerHTML = `
    <button type="button" class="vienna-sources-trigger" data-vienna-sources-open aria-expanded="false" aria-controls="viennaSourcesPanel">
      ${VIENNA_ROSETTE_MARKUP}<span>${esc(tr("viennaSourcesButton"))}</span>
    </button>
    <section id="viennaSourcesPanel" class="vienna-sources-panel" data-vienna-sources-panel aria-labelledby="viennaSourcesTitle" hidden>
      <div class="vienna-sources-head">
        <div><span class="vienna-sources-kicker">Vienna Nouveau</span><h2 id="viennaSourcesTitle">${esc(tr("viennaSourcesTitle"))}</h2></div>
        <button type="button" class="vienna-sources-close" data-vienna-sources-close aria-label="${esc(tr("viennaSourcesClose"))}">×</button>
      </div>
      <p>${esc(tr("viennaSourcesIntro"))}</p>
      <ul>
        <li><a href="https://letterformarchive.org/news/die-flache-facsimile-and-the-vienna-secession/" target="_blank" rel="noopener">Die Fläche · Letterform Archive</a><span>${esc(tr("viennaSourceHistory"))}</span></li>
        <li><a href="https://www.awwwards.com/sites/viennese-modernism-2018" target="_blank" rel="noopener">Viennese Modernism 2018</a><span>${esc(tr("viennaSourceDigital"))}</span></li>
        <li><a href="https://github.com/google/fonts/tree/main/ofl/wireone" target="_blank" rel="noopener">Wire One · Google Fonts</a><span>${esc(tr("viennaSourceFont"))}</span></li>
        <li><a href="https://github.com/google/fonts/tree/main/ofl/jost" target="_blank" rel="noopener">Jost · Google Fonts</a><span>${esc(tr("viennaSourceBodyFont"))}</span></li>
      </ul>
      <p class="vienna-sources-note">${esc(tr("viennaSourcesNote"))}</p>
    </section>`;
  const trigger = dock.querySelector("[data-vienna-sources-open]");
  trigger.addEventListener("click", () => {
    const panel = dock.querySelector("[data-vienna-sources-panel]");
    const willOpen = panel.hidden;
    closeViennaSources();
    if (willOpen) {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }
  });
  dock.querySelector("[data-vienna-sources-close]").addEventListener("click", () => {
    closeViennaSources();
    trigger.focus();
  });
}
function applyTheme(key) {
  document.documentElement.setAttribute("data-theme", key);
  try { localStorage.setItem("raumplan-theme", key); } catch {}
  updateColorVisionAidAttribute();
  if (key === "terminal") terminalEasterEgg();
  updateCatEasterEgg();
  renderPunkZineBanner();
  if (key === "ukiyo") pickUkiyoBackground();
  else if (key === "comic") pickComicBackground(true);
  else {
    if (key === "solarpunk") randomizeSolarClouds(true);
    renderArtCaption();
  }
  renderViennaSources();
  window.dispatchEvent(new CustomEvent("raumplan-theme-change", { detail: { key } }));
}

// Das gemeinsame Popover liegt im body, damit Karten-Transforms keinen
// konkurrierenden Stacking-Kontext erzeugen.
function ensureThemeMorePopoverEl() {
  let el = document.getElementById("themeMorePopover");
  if (!el) {
    el = document.createElement("div");
    el.id = "themeMorePopover";
    el.className = "theme-more-popover";
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener("click", e => {
      const btn = e.target.closest("button[data-theme-key]");
      if (!btn) return;
      applyTheme(btn.dataset.themeKey);
      closeThemeMorePopover();
      document.querySelectorAll(".theme-switch-group").forEach(c => renderThemeSwitch(c));
    });
  }
  return el;
}
function closeThemeMorePopover() {
  const popover = document.getElementById("themeMorePopover");
  if (popover) popover.hidden = true;
  document.querySelectorAll(".theme-more-trigger[aria-expanded='true']").forEach(t => t.setAttribute("aria-expanded", "false"));
}
function renderContrastAidSwitch() {
  const slot = document.getElementById("contrastAidSwitch");
  if (!slot) return;
  const visible = document.documentElement.getAttribute("data-theme") === "contrast";
  slot.hidden = !visible;
  if (!visible) { slot.innerHTML = ""; return; }
  const enabled = updateColorVisionAidAttribute();
  slot.innerHTML = `<button type="button" class="contrast-aid-toggle" data-color-vision-aid role="switch" aria-checked="${String(enabled)}" aria-label="${esc(tr("colorVisionAid"))}" title="${esc(tr("colorVisionAid"))}">
    <span class="contrast-aid-glyphs" aria-hidden="true">●▲</span><span>${esc(tr("shapesToggle"))}</span>
  </button>`;
  if (!slot.dataset.wired) {
    slot.dataset.wired = "1";
    slot.addEventListener("click", event => {
      const toggle = event.target.closest("[data-color-vision-aid]");
      if (!toggle) return;
      setColorVisionAid(toggle.getAttribute("aria-checked") !== "true");
      renderContrastAidSwitch();
    });
  }
}
function renderThemeSwitch(container) {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  if (current === "terminal") terminalEasterEgg();
  if (current === "solarpunk") randomizeSolarClouds();
  updateCatEasterEgg();
  renderPunkZineBanner();
  const core = THEMES.filter(t => CORE_THEME_KEYS.includes(t.key));
  const specials = THEMES.filter(t => !CORE_THEME_KEYS.includes(t.key));
  const activeSpecial = specials.find(t => t.key === current);
  const zenEnabled = updateZenModeAttribute();
  const coreHtml = core.map(th => `<button type="button" data-theme-key="${th.key}" aria-pressed="${String(th.key === current)}" title="${esc(tr(th.nameKey))}" aria-label="${esc(tr(th.nameKey))}">${th.label}</button>`).join("");
  renderContrastAidSwitch();
  container.className = "theme-switch-group";
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", tr("themeSwitchLabel"));
  container.innerHTML = `
    <div class="theme-switch">
      ${coreHtml}
    </div>
    <div class="theme-more-wrap">
      <button type="button" class="theme-more-trigger${activeSpecial ? " is-active" : ""}" aria-haspopup="true" aria-expanded="false" title="${esc(tr("moreThemes"))}" aria-label="${esc(tr("moreThemes"))}">
        <span>${activeSpecial ? activeSpecial.label : "✨"}</span><span class="theme-more-chevron">⌄</span>
      </button>
    </div>
    <div class="zen-mode-wrap">
      <button type="button" class="zen-mode-toggle" data-zen-mode role="switch" aria-checked="${String(zenEnabled)}" title="${esc(tr("zenMode"))}" aria-label="${esc(tr("zenMode"))}">
        <span aria-hidden="true">☯</span>
      </button>
    </div>`;
  renderViennaSources();
  ensureThemeMorePopoverEl();
  if (!container.dataset.wired) {
    container.dataset.wired = "1";
    // Delegiert von container aus (bleibt über Re-Renders hinweg bestehen —
    // anders als die Buttons selbst, die bei jedem innerHTML-Neuaufbau
    // frisch erzeugt werden und jeden direkt angehängten Listener verlieren).
    container.addEventListener("click", e => {
      const themeBtn = e.target.closest("button[data-theme-key]");
      if (themeBtn) { applyTheme(themeBtn.dataset.themeKey); closeThemeMorePopover(); renderThemeSwitch(container); return; }
      const trigger = e.target.closest(".theme-more-trigger");
      if (!trigger) {
        const zenToggle = e.target.closest("[data-zen-mode]");
        if (zenToggle) setZenMode(zenToggle.getAttribute("aria-checked") !== "true");
        return;
      }
      e.stopPropagation();
      const popover = ensureThemeMorePopoverEl();
      const willOpen = popover.hidden;
      closeThemeMorePopover();
      if (!willOpen) return;
      const r = trigger.getBoundingClientRect();
      popover.style.top = `${r.bottom + 6}px`;
      popover.style.left = `${Math.max(8, r.right - 190)}px`;
      popover.innerHTML = THEMES.filter(t => !CORE_THEME_KEYS.includes(t.key)).map(th => {
        const isCurrent = th.key === (document.documentElement.getAttribute("data-theme") || "dark");
        return `<button type="button" data-theme-key="${th.key}" class="theme-more-row" aria-pressed="${String(isCurrent)}"><span>${th.label}</span><span style="flex:1;text-align:left">${esc(tr(th.nameKey))}</span><span>${isCurrent ? "✓" : ""}</span></button>`;
      }).join("");
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("click", e => {
      if (e.target.closest(".theme-more-wrap") || e.target.closest("#themeMorePopover")) return;
      closeThemeMorePopover();
    });
  }
}
window.addEventListener("scroll", closeThemeMorePopover, { capture: true, passive: true });
window.addEventListener("resize", closeThemeMorePopover);
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const trigger = document.querySelector(".theme-more-trigger[aria-expanded='true']");
  closeThemeMorePopover();
  trigger?.focus();
  const sourceTrigger = document.querySelector("[data-vienna-sources-open][aria-expanded='true']");
  closeViennaSources();
  sourceTrigger?.focus();
});
document.addEventListener("click", event => {
  if (event.target.closest("#viennaSources")) return;
  closeViennaSources();
});
