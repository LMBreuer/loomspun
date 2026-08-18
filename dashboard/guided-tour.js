(() => {
  "use strict";

  const STORAGE_KEY = "playabl-dashboard-tour-v2";
  const TEASER_KEY = "playabl-dashboard-tour-teaser-v2";
  const copy = {
    de: {
      kicker:"Kurzer Rundgang",
      new:"Neu hier?",
      teaserTitle:"Dashboard kennenlernen",
      teaserText:"In etwa einer Minute siehst du, wie Übersicht, Setup, Kalender und Filter zusammenspielen.",
      start:"Rundgang starten",
      later:"Später",
      close:"Rundgang schließen",
      skip:"Überspringen",
      back:"Zurück",
      next:"Weiter",
      finish:"Fertig",
      progress:(current, total) => `Schritt ${current} von ${total}`,
      done:"Rundgang abgeschlossen",
      steps:[
        ["Die Übersicht auf einen Blick", "Das Dashboard lädt das aktuelle Programm direkt von Playabl. Oben siehst du Eventstatus und Kennzahlen; darunter werden Angebot, Bedarf und freie Plätze zusammengeführt."],
        ["Zwischen Dashboard und Kalender wechseln", "Mit den beiden Schaltflächen wechselst du jederzeit zwischen Dashboard und Kalender. Das Dashboard verdichtet Kennzahlen, Angebot und Bedarf; der Kalender zeigt das vollständige Programm in einer ruhigen, druckfreundlichen Ansicht. Hier kannst du außerdem Community und Event wechseln."],
        ["Setup und eigene Termine", "Im Setup kannst du die Ziel-Platzanzahl und Slots definieren. In der Kalenderansicht kannst du über „Meine Spiele“ außerdem deine momentanen Termine anzeigen lassen. Die Zuordnung und Einstellungen bleiben in diesem Browser."],
        ["Angebot mit dem Ziel vergleichen", "Die Grafik zeigt pro Slot, wie viele Spielplätze angeboten werden. Segmente stehen für Sessions; Zielband und Bedarfsanzeige machen Lücken sichtbar."],
        ["Freie Plätze und fehlende Runden", "Links erscheint pro Slot die Session mit den meisten freien Plätzen. Der Link darunter öffnet alle freien Runden im Kalender. Rechts siehst du, in welchen Slots noch Angebot fehlt."],
        ["Den Kalender filtern", "Suche nach Session, System oder Spielleitung, wähle einen Tag oder zeige nur deine Spiele beziehungsweise Runden mit freien Plätzen. Die Trefferzahl aktualisiert sich sofort."],
        ["Persönliche Termine exportieren", "Mit dem ICS-Button lädst du ausschließlich deine persönlichen Spiele als Kalenderdatei herunter – unabhängig davon, ob „Meine Spiele“ gerade als Filter aktiv ist. Ohne Zuordnung legst du zuerst deinen Playabl-Namen fest. Die Datei lässt sich in Google Kalender, Apple Kalender und Outlook importieren; vorhandene Raumdaten werden übernommen."],
        ["Das vollständige Programm", "Im Kalender bleiben Zeit, System, Spielleitung, Raum und Verfügbarkeit zusammen. Die Tages- und Slotstruktur eignet sich auch als klare Druckansicht."]
      ]
    },
    en: {
      kicker:"Quick tour",
      new:"New here?",
      teaserTitle:"Get to know the dashboard",
      teaserText:"In about a minute, see how the overview, setup, calendar, and filters work together.",
      start:"Start tour",
      later:"Later",
      close:"Close tour",
      skip:"Skip",
      back:"Back",
      next:"Next",
      finish:"Done",
      progress:(current, total) => `Step ${current} of ${total}`,
      done:"Tour completed",
      steps:[
        ["The overview at a glance", "The dashboard loads the current programme directly from Playabl. At the top you see event status and key figures; below, capacity, demand, and available seats come together."],
        ["Switch between dashboard and calendar", "Use the two buttons to switch between the dashboard and calendar at any time. The dashboard summarizes key figures, capacity, and demand; the calendar presents the complete programme in a calm, print-friendly view. You can also change the community and event here."],
        ["Setup and your schedule", "Setup lets you define the target seat count and slots. In the calendar, “My games” can also show your current schedule. The identity and settings stay in this browser."],
        ["Compare capacity with the target", "The chart shows how many player seats are offered in each slot. Segments represent sessions; the target band and demand display make gaps visible."],
        ["Available seats and missing sessions", "On the left, each slot shows the session with the most available seats. The link below opens every available session in the calendar. On the right, see which slots still need more capacity."],
        ["Filter the calendar", "Search by session, system, or facilitator, choose a day, or show only your games or sessions with available seats. The result count updates immediately."],
        ["Export your personal events", "Use the ICS button to download only your personal games as a calendar file, whether or not the ‘My games’ filter is active. If no profile is linked yet, you will first select your Playabl name. You can import the file into Google Calendar, Apple Calendar or Outlook; available room details are included."],
        ["The complete programme", "The calendar keeps time, system, facilitator, room, and availability together. Its day and slot structure also works as a clear print view."]
      ]
    }
  };
  const selectors = [
    ".dashboard-hero",
    ".controls",
    "#slotConfigOpen",
    ".bento-chart",
    ".bento-side-row",
    ".calendar-filters",
    "#calendarDownload",
    ".calendar-bento .cal-day"
  ];

  let layer;
  let spotlight;
  let card;
  let teaser;
  let active = false;
  let index = 0;
  let originalView = "uebersicht";
  let originalScroll = 0;
  let positionFrame = 0;
  let ready = false;

  const lang = () => document.documentElement.lang === "en" ? "en" : "de";
  const text = () => copy[lang()];
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.hasAttribute("data-zen");
  const storageGet = key => {
    try { return localStorage.getItem(key); }
    catch { return null; }
  };
  const storageSet = (key, value) => {
    try { localStorage.setItem(key, value); }
    catch {}
  };
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function ensureUi() {
    if (layer) return;
    layer = document.createElement("div");
    layer.className = "guided-tour-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <div class="guided-tour-spotlight" aria-hidden="true"></div>
      <section class="guided-tour-card" role="dialog" aria-modal="false" aria-labelledby="guidedTourTitle" aria-describedby="guidedTourBody">
        <div class="guided-tour-card-top">
          <span class="guided-tour-progress-copy"></span>
          <button type="button" class="guided-tour-close" aria-label="">×</button>
        </div>
        <div class="guided-tour-progress" aria-hidden="true"><span></span></div>
        <span class="guided-tour-kicker"></span>
        <h2 id="guidedTourTitle" tabindex="-1"></h2>
        <p id="guidedTourBody"></p>
        <div class="guided-tour-actions">
          <button type="button" class="guided-tour-skip"></button>
          <span></span>
          <button type="button" class="guided-tour-back"></button>
          <button type="button" class="guided-tour-next"></button>
        </div>
      </section>`;
    document.body.appendChild(layer);
    spotlight = layer.querySelector(".guided-tour-spotlight");
    card = layer.querySelector(".guided-tour-card");

    teaser = document.createElement("aside");
    teaser.className = "guided-tour-teaser";
    teaser.hidden = true;
    teaser.setAttribute("aria-labelledby", "guidedTourTeaserTitle");
    teaser.innerHTML = `
      <button type="button" class="guided-tour-teaser-close" aria-label="">×</button>
      <span class="guided-tour-kicker"></span>
      <h2 id="guidedTourTeaserTitle"></h2>
      <p></p>
      <div class="guided-tour-teaser-actions">
        <button type="button" class="guided-tour-teaser-later"></button>
        <button type="button" class="guided-tour-teaser-start"></button>
      </div>`;
    document.body.appendChild(teaser);

    layer.querySelector(".guided-tour-close").addEventListener("click", () => stop(false));
    layer.querySelector(".guided-tour-skip").addEventListener("click", () => stop(false));
    layer.querySelector(".guided-tour-back").addEventListener("click", previous);
    layer.querySelector(".guided-tour-next").addEventListener("click", next);
    teaser.querySelector(".guided-tour-teaser-close").addEventListener("click", dismissTeaser);
    teaser.querySelector(".guided-tour-teaser-later").addEventListener("click", dismissTeaser);
    teaser.querySelector(".guided-tour-teaser-start").addEventListener("click", () => {
      dismissTeaser();
      start();
    });
    document.addEventListener("keydown", event => {
      if (!active || event.target.matches("input, textarea, select")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stop(false);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    });
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.addEventListener("raumplan-theme-change", schedulePosition);
    refreshCopy();
  }

  function refreshCopy() {
    if (!layer) return;
    const t = text();
    layer.querySelector(".guided-tour-close").setAttribute("aria-label", t.close);
    layer.querySelector(".guided-tour-skip").textContent = t.skip;
    layer.querySelector(".guided-tour-kicker").textContent = t.kicker;
    teaser.querySelector(".guided-tour-teaser-close").setAttribute("aria-label", t.close);
    teaser.querySelector(".guided-tour-kicker").textContent = t.new;
    teaser.querySelector("h2").textContent = t.teaserTitle;
    teaser.querySelector("p").textContent = t.teaserText;
    teaser.querySelector(".guided-tour-teaser-later").textContent = t.later;
    teaser.querySelector(".guided-tour-teaser-start").textContent = t.start;
    document.querySelectorAll("[data-guided-tour-open]").forEach(button => {
      button.textContent = lang() === "en" ? "Tour" : "Rundgang";
    });
    if (active) renderStepCopy();
  }

  function dismissTeaser() {
    if (!teaser) return;
    storageSet(TEASER_KEY, "1");
    teaser.classList.remove("is-visible");
    window.setTimeout(() => { teaser.hidden = true; }, reducedMotion() ? 0 : 180);
  }

  function maybeShowTeaser() {
    ensureUi();
    if (!ready || active || storageGet(TEASER_KEY) || storageGet(STORAGE_KEY)) return;
    if ([...document.querySelectorAll("dialog")].some(dialog => dialog.open)) return;
    teaser.hidden = false;
    requestAnimationFrame(() => teaser.classList.add("is-visible"));
  }

  async function start() {
    if (active) return;
    ensureUi();
    dismissTeaser();
    active = true;
    index = 0;
    originalView = document.getElementById("calView")?.hidden ? "uebersicht" : "kalender";
    originalScroll = window.scrollY;
    layer.hidden = false;
    document.body.classList.add("guided-tour-active");
    await showStep();
  }

  function prepareStep() {
    if (index < 5) setView("uebersicht");
    else setView("kalender");
  }

  async function showStep() {
    if (!active) return;
    prepareStep();
    await nextPaint();
    const target = document.querySelector(selectors[index]);
    if (!target) {
      if (index < selectors.length - 1) {
        index += 1;
        return showStep();
      }
      return stop(true);
    }
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    const targetRect = target.getBoundingClientRect();
    const targetTop = index === selectors.length - 1
      ? window.scrollY + targetRect.top - 16
      : window.innerWidth <= 680
        ? window.scrollY + targetRect.top - 112
      : window.scrollY + targetRect.top - Math.max(16, (window.innerHeight - targetRect.height) / 2);
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, Math.max(0, targetTop));
    await nextPaint();
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
    renderStepCopy();
    position(target);
    card.querySelector("h2").focus({ preventScroll:true });
  }

  function renderStepCopy() {
    const t = text();
    const [title, body] = t.steps[index];
    card.querySelector(".guided-tour-progress-copy").textContent = t.progress(index + 1, selectors.length);
    card.querySelector(".guided-tour-progress span").style.width = ((index + 1) / selectors.length * 100) + "%";
    card.querySelector("h2").textContent = title;
    card.querySelector("#guidedTourBody").textContent = body;
    card.querySelector(".guided-tour-back").textContent = t.back;
    card.querySelector(".guided-tour-back").disabled = index === 0;
    card.querySelector(".guided-tour-next").textContent = index === selectors.length - 1 ? t.finish : t.next;
  }

  function position(target) {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const left = Math.max(6, rect.left - pad);
    const top = Math.max(6, rect.top - pad);
    const width = Math.min(window.innerWidth - left - 6, rect.width + pad * 2);
    const height = Math.min(window.innerHeight - top - 6, rect.height + pad * 2);
    Object.assign(spotlight.style, {
      left:left + "px",
      top:top + "px",
      width:Math.max(0, width) + "px",
      height:Math.max(0, height) + "px"
    });
    card.classList.remove("is-centered");
    if (window.innerWidth <= 680) {
      card.style.left = "12px";
      card.style.top = "";
      card.style.bottom = "12px";
      return;
    }
    card.style.bottom = "";
    const cardWidth = Math.min(390, window.innerWidth - 24);
    const estimatedHeight = card.offsetHeight || 290;
    const below = rect.bottom + 16;
    const above = rect.top - estimatedHeight - 16;
    const cardTop = below >= 12 && below + estimatedHeight <= window.innerHeight - 12 ? below : Math.max(12, above);
    const cardLeft = Math.min(window.innerWidth - cardWidth - 12, Math.max(12, rect.left));
    card.style.left = cardLeft + "px";
    card.style.top = cardTop + "px";
  }

  function schedulePosition() {
    if (!active || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      const target = document.querySelector(selectors[index]);
      if (target) position(target);
    });
  }

  function previous() {
    if (!active || index === 0) return;
    index -= 1;
    showStep();
  }

  function next() {
    if (!active) return;
    if (index === selectors.length - 1) {
      stop(true);
      return;
    }
    index += 1;
    showStep();
  }

  function stop(completed) {
    if (!active) return;
    active = false;
    layer.hidden = true;
    document.body.classList.remove("guided-tour-active");
    if (completed) {
      storageSet(STORAGE_KEY, "1");
      showToast(text().done);
    }
    setView(originalView);
    requestAnimationFrame(() => window.scrollTo({ top:originalScroll, behavior:"auto" }));
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "guided-tour-complete-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-guided-tour-open]")) start();
  });
  window.addEventListener("uilanguagechange", refreshCopy);
  window.addEventListener("dashboardready", () => {
    ready = true;
    ensureUi();
    window.setTimeout(maybeShowTeaser, 700);
  });
})();
