try {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("raumplan-theme") || "dark");
  document.documentElement.toggleAttribute("data-zen", localStorage.getItem("raumplan-zen-mode") === "1");
} catch {}
