const THEMES_VERSION = "20260728-6";
const themes = document.createElement("link");
themes.rel = "stylesheet";
themes.href = `../themes.css?v=${THEMES_VERSION}`;
document.head.appendChild(themes);

try {
  const saved = localStorage.getItem("raumplan-theme");
  const initial = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", initial);
  document.documentElement.toggleAttribute("data-zen", localStorage.getItem("raumplan-zen-mode") === "1");
} catch {}
