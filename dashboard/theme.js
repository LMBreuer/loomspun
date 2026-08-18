const VIENNA_ROSETTE_MARKUP = `<span class="vienna-rosette" aria-hidden="true"></span>`;
const THEMES = [
  { key: "dark", label: "🌙", name: "Dunkel" },
  { key: "light", label: "☀️", name: "Hell" },
  { key: "contrast", label: "◐", name: "Kontrastreich" },
  { key: "colorful", label: "🎨", name: "Playabl" },
  { key: "glass", label: "🫧", name: "Glassmorphism" },
  { key: "cosmic", label: "✦", name: "Dark Cosmic" },
  { key: "ukiyo", label: "🌸", name: "Ukiyo-e" },
  { key: "solarpunk", label: "🌱", name: "Solarpunk" },
  { key: "terminal", label: "▚", name: "Terminal" },
  { key: "cyberpunk", label: "⚡", name: "Cyberpunk" },
  { key: "comic", label: "💥", name: "Comic" },
  { key: "punk", label: "✖", name: "Punk" },
  { key: "vienna", label: VIENNA_ROSETTE_MARKUP, name: "Vienna Nouveau" },
];
const CORE_THEME_KEYS = ["dark", "light", "contrast"];
const ZEN_MODE_KEY = "raumplan-zen-mode";
const UKIYO_BACKGROUNDS = [
  { file:"images/ukiyo/great-wave.jpg", name:"Unter der Welle vor Kanagawa · Hokusai", nameEn:"Under the Wave off Kanagawa · Hokusai", sourceUrl:"https://commons.wikimedia.org/wiki/File:The_Great_Wave_off_Kanagawa.png" },
  { file:"images/ukiyo/red-fuji.jpg", name:"Roter Fuji · Hokusai", nameEn:"Red Fuji · Hokusai", sourceUrl:"https://commons.wikimedia.org/wiki/File:Red_Fuji_southern_wind_clear_morning.jpg" },
  { file:"images/ukiyo/thunderstorm.jpg", name:"Gewitter unterhalb des Gipfels · Hokusai", nameEn:"Thunderstorm beneath the Summit · Hokusai", sourceUrl:"https://commons.wikimedia.org/wiki/File:%27Thunderstorm_beneath_the_Summit%27_by_Hokusai,_Honolulu_Museum_of_Art.jpg" }
];
const COMIC_BACKGROUNDS = [
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_01.jpg?width=1600", name:"Planet Comics #1", sourceUrl:"https://commons.wikimedia.org/wiki/File:Planet_Comics_01.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_11.jpg?width=1600", name:"Planet Comics #11", sourceUrl:"https://commons.wikimedia.org/wiki/File:Planet_Comics_11.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_42.jpg?width=1600", name:"Planet Comics #42", sourceUrl:"https://commons.wikimedia.org/wiki/File:Planet_Comics_42.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Planet_Comics_53.jpg?width=1600", name:"Planet Comics #53", sourceUrl:"https://commons.wikimedia.org/wiki/File:Planet_Comics_53.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Fantastic_Comics_-11.jpg?width=1600", name:"Fantastic Comics #11", sourceUrl:"https://commons.wikimedia.org/wiki/File:Fantastic_Comics_-11.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Jumbo_Comics_no._9_(cover_art).jpg?width=1600", name:"Jumbo Comics #9", sourceUrl:"https://commons.wikimedia.org/wiki/File:Jumbo_Comics_no._9_(cover_art).jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/WonderworldComics3.jpg?width=1600", name:"Wonderworld Comics #3", sourceUrl:"https://commons.wikimedia.org/wiki/File:WonderworldComics3.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Silverstreak_001.jpg?width=1600", name:"Silver Streak Comics #11", sourceUrl:"https://commons.wikimedia.org/wiki/File:Silverstreak_001.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Fight_Comics_82.jpg?width=1600", name:"Fight Comics #82", sourceUrl:"https://commons.wikimedia.org/wiki/File:Fight_Comics_82.jpg" },
  { file:"https://commons.wikimedia.org/wiki/Special:Redirect/file/AmazingMan22.jpg?width=1600", name:"Amazing-Man Comics #22", sourceUrl:"https://commons.wikimedia.org/wiki/File:AmazingMan22.jpg" }
];
let currentUkiyoPick = null;
let currentComicPick = null;
function renderArtCaption() {
  let caption = document.getElementById("artCaption");
  if (!caption) {
    caption = document.createElement("div");
    caption.id = "artCaption";
    caption.className = "art-caption";
    document.body.appendChild(caption);
  }
  const theme = document.documentElement.getAttribute("data-theme");
  const pick = theme === "ukiyo" ? currentUkiyoPick : theme === "comic" ? currentComicPick : null;
  if (!pick) { caption.hidden = true; caption.replaceChildren(); return; }
  const en = document.documentElement.lang === "en";
  const link = document.createElement("a");
  link.href = pick.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `${en ? "Artwork" : "Bild"}: ${en && pick.nameEn ? pick.nameEn : pick.name} · Wikimedia Commons`;
  link.setAttribute("aria-label", `${link.textContent} (${en ? "opens source in a new tab" : "öffnet die Quelle in einem neuen Tab"})`);
  caption.replaceChildren(link);
  caption.hidden = false;
}
function pickUkiyoBackground(force = false) {
  if (!force && currentUkiyoPick) { renderArtCaption(); return; }
  currentUkiyoPick = UKIYO_BACKGROUNDS[Math.floor(Math.random() * UKIYO_BACKGROUNDS.length)];
  document.documentElement.style.setProperty("--ukiyo-bg", `url("${currentUkiyoPick.file}")`);
  renderArtCaption();
}
function pickComicBackground(force = false) {
  if (!force && currentComicPick) { renderArtCaption(); return; }
  const previousIndex = COMIC_BACKGROUNDS.indexOf(currentComicPick);
  let index = Math.floor(Math.random() * COMIC_BACKGROUNDS.length);
  if (COMIC_BACKGROUNDS.length > 1 && index === previousIndex) index = (index + 1) % COMIC_BACKGROUNDS.length;
  currentComicPick = COMIC_BACKGROUNDS[index];
  document.documentElement.style.setProperty("--comic-bg", `url("${currentComicPick.file}")`);
  renderArtCaption();
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
  const airshipDuration = 300 + Math.floor(Math.random() * 120);
  root.style.setProperty("--airship-y", `${12 + Math.floor(Math.random() * 34)}vh`);
  root.style.setProperty("--airship-duration", `${airshipDuration}s`);
  root.style.setProperty("--airship-delay", `${-Math.floor(airshipDuration * (0.10 + Math.random() * 0.52))}s`);
  root.dataset.solarClouds = "ready";
}
const PIXEL_CAT_SVG = `<svg class="pixel-cat" viewBox="0 0 16 16" role="img" aria-label="Eine kleine Pixel-Katze hat sich hier versteckt" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="6" width="2" height="2"/><rect x="12" y="6" width="2" height="2"/>
  <rect x="1" y="4" width="2" height="2"/><rect x="13" y="4" width="2" height="2"/>
  <rect x="3" y="7" width="10" height="6"/>
  <rect x="4" y="13" width="2" height="1"/><rect x="10" y="13" width="2" height="1"/>
  <rect x="5" y="9" width="1" height="1" fill="#04150a"/><rect x="10" y="9" width="1" height="1" fill="#04150a"/>
  <rect x="7" y="11" width="2" height="1" fill="#04150a"/>
</svg>`;
function terminalEasterEgg() {
  if (window.__pdashCatLogged) return;
  window.__pdashCatLogged = true;
  console.log(
    "%c" +
    " /\\_/\\ \n" +
    "( o.o )  Playabl-Dashboard Terminal aktiviert.\n" +
    " > ___ <  Miau. Viel Erfolg beim Slot-Ausgleich.",
    "color:#3dff85;font-family:monospace;font-size:12px;"
  );
}
function updateCatEasterEgg() {
  const eyebrow = document.querySelector(".dashboard-eyebrow");
  if (!eyebrow) return;
  const oldCat = eyebrow.querySelector(".pixel-cat");
  if (document.documentElement.getAttribute("data-theme") === "terminal") {
    if (!oldCat) eyebrow.insertAdjacentHTML("beforeend", PIXEL_CAT_SVG);
  } else oldCat?.remove();
}
function renderPunkZineBanner() {
  let el = document.getElementById("punkZineBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "punkZineBanner";
    el.className = "punk-zine-banner";
    document.body.appendChild(el);
  }
  const quotes = window.PUNK_ZINE_QUOTES || [];
  if (document.documentElement.getAttribute("data-theme") !== "punk" || !quotes.length) { el.hidden = true; return; }
  const pick = quotes[Math.floor(Math.random() * quotes.length)];
  el.hidden = false;
  el.innerHTML = `<a href="${pick.url}" target="_blank" rel="noopener" title="${pick.source}" aria-label="${pick.quote} — ${pick.source}">${pick.quote}</a>`;
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
  const legend = document.querySelector(".bento-hero-legend");
  if (legend) {
    const en = document.documentElement.lang === "en";
    legend.textContent = enabled
      ? (en ? `One marker per slot · ✓ = target (${LO}+) reached, ! = below target` : `Je Marker ein Slot · ✓ = Ziel (${LO}+) erreicht, ! = darunter`)
      : (en ? `One bar per slot · green = target (${LO}+) reached, red = below target` : `Je Balken ein Slot · grün = Ziel (${LO}+) erreicht, rot = darunter`);
  }
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
    dock.className = "vienna-sources-dock";
    document.body.appendChild(dock);
  }
  const visible = document.documentElement.getAttribute("data-theme") === "vienna";
  dock.hidden = !visible;
  if (!visible) {
    dock.replaceChildren();
    return;
  }
  const en = document.documentElement.lang === "en";
  const copy = en ? {
    button: "Inspiration & sources", title: "Inspiration & sources", close: "Close inspiration sources",
    intro: "An independent digital interpretation of Viennese surface art – bold in expression, calm in use.",
    history: "Historic surface art, lettering, and ornament of the Vienna Secession.",
    digital: "A contemporary digital interpretation of Viennese Modernism.",
    displayFont: "A free OFL display face with a narrow monoline Art Nouveau character.",
    bodyFont: "A free geometric OFL face providing a readable link to Viennese Modernism.",
    note: "The linked works are disclosed as inspiration; the theme’s design, components, and ornaments were developed independently for this application."
  } : {
    button: "Inspiration & Quellen", title: "Inspiration & Quellen", close: "Inspirationsquellen schließen",
    intro: "Eine eigenständige digitale Interpretation der Wiener Flächenkunst – kräftig im Ausdruck, ruhig in der Nutzung.",
    history: "Historische Flächenkunst, Lettering und Ornamentik der Wiener Secession.",
    digital: "Zeitgenössische digitale Übersetzung der Wiener Moderne.",
    displayFont: "Freie OFL-Displayschrift mit schmalem, monolinearem Art-Nouveau-Charakter.",
    bodyFont: "Freie geometrische OFL-Schrift für eine lesbare Verbindung zur Wiener Moderne.",
    note: "Die verlinkten Arbeiten dienen als offengelegte Inspiration; Gestaltung, Komponenten und Ornamente dieses Themes wurden eigenständig für diese Anwendung entwickelt."
  };
  dock.innerHTML = `
    <button type="button" class="vienna-sources-trigger" data-vienna-sources-open aria-expanded="false" aria-controls="viennaSourcesPanel">
      ${VIENNA_ROSETTE_MARKUP}<span>${copy.button}</span>
    </button>
    <section id="viennaSourcesPanel" class="vienna-sources-panel" data-vienna-sources-panel aria-labelledby="viennaSourcesTitle" hidden>
      <div class="vienna-sources-head">
        <div><span class="vienna-sources-kicker">Vienna Nouveau</span><h2 id="viennaSourcesTitle">${copy.title}</h2></div>
        <button type="button" class="vienna-sources-close" data-vienna-sources-close aria-label="${copy.close}">×</button>
      </div>
      <p>${copy.intro}</p>
      <ul>
        <li><a href="https://letterformarchive.org/news/die-flache-facsimile-and-the-vienna-secession/" target="_blank" rel="noopener">Die Fläche · Letterform Archive</a><span>${copy.history}</span></li>
        <li><a href="https://www.awwwards.com/sites/viennese-modernism-2018" target="_blank" rel="noopener">Viennese Modernism 2018</a><span>${copy.digital}</span></li>
        <li><a href="https://github.com/google/fonts/tree/main/ofl/wireone" target="_blank" rel="noopener">Wire One · Google Fonts</a><span>${copy.displayFont}</span></li>
        <li><a href="https://github.com/google/fonts/tree/main/ofl/jost" target="_blank" rel="noopener">Jost · Google Fonts</a><span>${copy.bodyFont}</span></li>
      </ul>
      <p class="vienna-sources-note">${copy.note}</p>
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
function renderContrastAidSwitch() {
  const slot = document.getElementById("contrastAidSwitch");
  if (!slot) return;
  const visible = document.documentElement.getAttribute("data-theme") === "contrast";
  slot.hidden = !visible;
  if (!visible) { slot.innerHTML = ""; updateColorVisionAidAttribute(); return; }
  const enabled = updateColorVisionAidAttribute();
  const en = document.documentElement.lang === "en";
  const label = en ? "Distinguish target status colours with additional symbols" : "Zielfarben zusätzlich mit Symbolen unterscheiden";
  slot.innerHTML = `<button type="button" class="contrast-aid-toggle" data-color-vision-aid role="switch" aria-checked="${String(enabled)}" aria-label="${label}" title="${label}">
    <span class="contrast-aid-glyphs" aria-hidden="true">✓!</span><span>${en ? "Symbols" : "Symbole"}</span>
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
function applyTheme(key) {
  document.documentElement.setAttribute("data-theme", key);
  try { localStorage.setItem("raumplan-theme", key); } catch {}
  updateColorVisionAidAttribute();
  if (key === "terminal") terminalEasterEgg();
  updateCatEasterEgg();
  renderPunkZineBanner();
  if (key === "ukiyo") pickUkiyoBackground(true);
  else if (key === "comic") pickComicBackground(true);
  else {
    if (key === "solarpunk") randomizeSolarClouds(true);
    renderArtCaption();
  }
  renderViennaSources();
  renderContrastAidSwitch();
  window.dispatchEvent(new CustomEvent("raumplan-theme-change", { detail: { key } }));
}
function ensureThemeMorePopover() {
  let el = document.getElementById("themeMorePopover");
  if (el) return el;
  el = document.createElement("div");
  el.id = "themeMorePopover";
  el.className = "theme-more-popover";
  el.hidden = true;
  document.body.appendChild(el);
  el.addEventListener("click", event => {
    const btn = event.target.closest("button[data-theme-key]");
    if (!btn) return;
    applyTheme(btn.dataset.themeKey);
    el.hidden = true;
    document.querySelectorAll(".theme-switch-group").forEach(renderThemeSwitch);
  });
  return el;
}
function closeThemeMorePopover() {
  document.getElementById("themeMorePopover")?.setAttribute("hidden", "");
  document.querySelectorAll(".theme-more-trigger[aria-expanded='true']").forEach(btn => btn.setAttribute("aria-expanded", "false"));
}
function renderThemeSwitch(container) {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const en = document.documentElement.lang === "en";
  const coreNames = en ? { dark:"Dark", light:"Light", contrast:"High contrast" } : {};
  const themeName = theme => coreNames[theme.key] || theme.name;
  const groupLabel = en ? "Choose colour scheme" : "Farbschema wählen";
  const moreLabel = en ? "More themes" : "Weitere Themes";
  const zenLabel = en ? "Zen mode – reduce motion and visual effects" : "Zen-Modus – Bewegung und visuelle Effekte reduzieren";
  const zenEnabled = updateZenModeAttribute();
  if (current === "terminal") terminalEasterEgg();
  if (current === "ukiyo") pickUkiyoBackground();
  if (current === "comic") pickComicBackground();
  if (current === "solarpunk") randomizeSolarClouds();
  updateCatEasterEgg();
  renderPunkZineBanner();
  const core = THEMES.filter(theme => CORE_THEME_KEYS.includes(theme.key));
  const specials = THEMES.filter(theme => !CORE_THEME_KEYS.includes(theme.key));
  const activeSpecial = specials.find(theme => theme.key === current);
  container.className = "theme-switch-group";
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", groupLabel);
  container.innerHTML = `<div class="theme-switch">${core.map(t =>
    `<button type="button" data-theme-key="${t.key}" aria-pressed="${String(t.key === current)}" title="${themeName(t)}" aria-label="${themeName(t)}">${t.label}</button>`
  ).join("")}</div><div class="theme-more-wrap"><button type="button" class="theme-more-trigger${activeSpecial ? " is-active" : ""}" aria-haspopup="true" aria-expanded="false" aria-label="${moreLabel}" title="${moreLabel}"><span>${activeSpecial ? activeSpecial.label : "✨"}</span><span aria-hidden="true">⌄</span></button></div><div class="zen-mode-wrap"><button type="button" class="zen-mode-toggle" data-zen-mode role="switch" aria-checked="${String(zenEnabled)}" aria-label="${zenLabel}" title="${zenLabel}"><span aria-hidden="true">☯</span></button></div>`;
  renderViennaSources();
  container.onclick = e => {
    const btn = e.target.closest("button[data-theme-key]");
    if (btn) { applyTheme(btn.dataset.themeKey); closeThemeMorePopover(); document.querySelectorAll(".theme-switch-group").forEach(renderThemeSwitch); return; }
    const trigger = e.target.closest(".theme-more-trigger");
    if (!trigger) {
      const zenToggle = e.target.closest("[data-zen-mode]");
      if (zenToggle) setZenMode(zenToggle.getAttribute("aria-checked") !== "true");
      return;
    }
    const popover = ensureThemeMorePopover();
    const willOpen = popover.hidden;
    closeThemeMorePopover();
    if (!willOpen) return;
    const rect = trigger.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.left = `${Math.max(8, rect.right - 190)}px`;
    popover.innerHTML = specials.map(theme => `<button type="button" data-theme-key="${theme.key}" class="theme-more-row" aria-pressed="${String(theme.key === current)}"><span>${theme.label}</span><span style="flex:1">${themeName(theme)}</span><span>${theme.key === current ? "✓" : ""}</span></button>`).join("");
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
}
renderThemeSwitch(document.getElementById("themeSwitch"));
renderContrastAidSwitch();
document.addEventListener("click", event => {
  if (event.target.closest(".theme-more-wrap") || event.target.closest("#themeMorePopover")) return;
  closeThemeMorePopover();
});
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
