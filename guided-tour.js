/* Gemeinsame, datensichere Guided Tour für index.html und plan.html.
   Sie hebt ausschließlich vorhandene UI hervor; fachliche Aktionen wie
   Speichern, Zuordnen oder Löschen löst sie niemals selbst aus. */
(() => {
  "use strict";

  const VERSION = "2";
  const ACTIVE_KEY = "raumplan-guided-tour-active";
  // v3 unterscheidet erstmals bewusst zwischen bloßem Schließen und der
  // ausdrücklichen Entscheidung „Später“. Frühere Versionen merkten den
  // Hinweis bereits beim Anzeigen als erledigt.
  const teaserKey = "guided-tour-teaser-dismissed-v3";
  const completeKey = type => `guided-tour-${type}-complete-v${VERSION}`;

  let config = null;
  let active = null;
  let chooser = null;
  let layer = null;
  let spotlight = null;
  let card = null;
  let teaser = null;
  let followup = null;
  let positionFrame = 0;
  let transitioning = false;

  const text = (key, vars) => typeof tr === "function" ? tr(key, vars) : key;
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const tourScrollBehavior = () =>
    document.documentElement.getAttribute("data-theme") === "contrast" && !reducedMotion() ? "smooth" : "auto";
  const waitsForNavigation = step => typeof step?.waitForNavigation === "function"
    ? !!step.waitForNavigation()
    : !!step?.waitForNavigation;
  const nextPaint = () => new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };
    const fallback = window.setTimeout(finish, 180);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.clearTimeout(fallback);
      finish();
    }));
  });

  function safeSessionGet() {
    try { return JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null"); }
    catch { return null; }
  }
  function safeSessionSet(value) {
    try {
      if (value) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }

  function ensureUi() {
    if (chooser) return;

    chooser = document.createElement("dialog");
    chooser.className = "guided-tour-chooser";
    chooser.setAttribute("aria-labelledby", "guidedTourChooserTitle");
    chooser.innerHTML = `
      <div class="guided-tour-chooser-head">
        <div>
          <span class="guided-tour-kicker" data-tour-text="tourKicker"></span>
          <h2 id="guidedTourChooserTitle" data-tour-text="tourChooserTitle"></h2>
        </div>
        <button type="button" class="icon-btn" data-tour-close-chooser aria-label="">×</button>
      </div>
      <p class="guided-tour-chooser-intro" data-tour-text="tourChooserIntro"></p>
      <div class="guided-tour-choices"></div>
      <div class="guided-tour-chooser-foot">
        <button type="button" class="link-btn" data-tour-reset></button>
        <span class="guided-tour-reset-status" role="status" aria-live="polite"></span>
      </div>`;
    document.body.appendChild(chooser);

    layer = document.createElement("div");
    layer.className = "guided-tour-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <div class="guided-tour-spotlight" aria-hidden="true"></div>
      <section class="guided-tour-card" role="dialog" aria-modal="false" aria-labelledby="guidedTourTitle" aria-describedby="guidedTourBody">
        <div class="guided-tour-card-top">
          <span class="guided-tour-progress-copy"></span>
          <button type="button" class="guided-tour-close icon-btn" aria-label="">×</button>
        </div>
        <div class="guided-tour-progress" aria-hidden="true"><span></span></div>
        <div class="guided-tour-announcement" aria-live="polite" aria-atomic="true">
          <span class="guided-tour-kicker" data-tour-text="tourKicker"></span>
          <h2 id="guidedTourTitle" tabindex="-1"></h2>
          <p id="guidedTourBody"></p>
          <p class="guided-tour-interaction" hidden></p>
        </div>
        <div class="guided-tour-actions">
          <button type="button" class="link-btn guided-tour-skip"></button>
          <span class="guided-tour-action-spacer"></span>
          <button type="button" class="guided-tour-back"></button>
          <button type="button" class="primary guided-tour-next"></button>
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
      <button type="button" class="guided-tour-teaser-close icon-btn" aria-label="">×</button>
      <span class="guided-tour-kicker" data-tour-text="tourNew"></span>
      <h2 id="guidedTourTeaserTitle" data-tour-text="tourTeaserTitle"></h2>
      <p data-tour-text="tourTeaserText"></p>
      <div class="guided-tour-teaser-actions">
        <button type="button" class="link-btn" data-tour-teaser-dismiss></button>
        <button type="button" class="primary" data-tour-teaser-start></button>
      </div>`;
    document.body.appendChild(teaser);

    followup = document.createElement("aside");
    followup.className = "guided-tour-followup";
    followup.hidden = true;
    followup.setAttribute("role", "dialog");
    followup.setAttribute("aria-labelledby", "guidedTourFollowupTitle");
    followup.innerHTML = `
      <button type="button" class="guided-tour-followup-close icon-btn" aria-label="">×</button>
      <span class="guided-tour-kicker" data-tour-text="tourCrewFollowupKicker"></span>
      <h2 id="guidedTourFollowupTitle" data-tour-text="tourCrewFollowupTitle" tabindex="-1"></h2>
      <p data-tour-text="tourCrewFollowupText"></p>
      <div class="guided-tour-teaser-actions">
        <button type="button" class="link-btn" data-tour-followup-dismiss></button>
        <button type="button" class="primary" data-tour-followup-start></button>
      </div>`;
    document.body.appendChild(followup);

    chooser.addEventListener("click", event => {
      if (event.target.closest("[data-tour-close-chooser]")) chooser.close();
      const launch = event.target.closest("[data-tour-kind]");
      if (launch) {
        chooser.close();
        start(launch.dataset.tourKind);
      }
      if (event.target.closest("[data-tour-reset]")) reset();
    });
    layer.querySelector(".guided-tour-close").addEventListener("click", () => stop("dismissed"));
    layer.querySelector(".guided-tour-skip").addEventListener("click", () => stop("skipped"));
    layer.querySelector(".guided-tour-back").addEventListener("click", previous);
    layer.querySelector(".guided-tour-next").addEventListener("click", next);
    teaser.querySelector(".guided-tour-teaser-close").addEventListener("click", () => dismissTeaser());
    teaser.querySelector("[data-tour-teaser-dismiss]").addEventListener("click", () => {
      dismissTeaser({ remember: true });
      showNotice("tourLaterNotice", 4200);
    });
    teaser.querySelector("[data-tour-teaser-start]").addEventListener("click", () => {
      dismissTeaser({ remember: true });
      start("public");
    });
    followup.querySelector(".guided-tour-followup-close").addEventListener("click", () => dismissFollowup());
    followup.querySelector("[data-tour-followup-dismiss]").addEventListener("click", () => dismissFollowup());
    followup.querySelector("[data-tour-followup-start]").addEventListener("click", () => {
      dismissFollowup(false);
      start("crew");
    });

    document.addEventListener("keydown", event => {
      if (!active || event.target.matches("input, textarea, select")) return;
      if (event.key === "Escape") { event.preventDefault(); stop("dismissed"); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
      else if (event.key === "ArrowRight") {
        const step = active.steps[active.index];
        if (!waitsForNavigation(step) || typeof step.onNext === "function") {
          event.preventDefault();
          next();
        }
      }
    });
    document.addEventListener("click", event => {
      if (!active || config?.page !== "index" || active.type !== "public") return;
      const link = event.target.closest('a[href*="plan.html?con="]');
      if (!link) return;
      safeSessionSet({ type: "public", page: "plan" });
    }, true);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.addEventListener("raumplan-theme-change", refreshActiveTarget);
    refreshLanguage();
  }

  function refreshLanguage() {
    if (!chooser) return;
    document.querySelectorAll("[data-tour-text]").forEach(element => {
      element.textContent = text(element.dataset.tourText);
    });
    chooser.querySelector("[data-tour-close-chooser]").setAttribute("aria-label", text("tourClose"));
    chooser.querySelector("[data-tour-reset]").textContent = text("tourReset");
    layer.querySelector(".guided-tour-close").setAttribute("aria-label", text("tourClose"));
    layer.querySelector(".guided-tour-skip").textContent = text("tourSkip");
    teaser.querySelector(".guided-tour-teaser-close").setAttribute("aria-label", text("tourClose"));
    teaser.querySelector("[data-tour-teaser-dismiss]").textContent = text("tourLater");
    teaser.querySelector("[data-tour-teaser-start]").textContent = text("tourStart");
    followup.querySelector(".guided-tour-followup-close").setAttribute("aria-label", text("tourClose"));
    followup.querySelector("[data-tour-followup-dismiss]").textContent = text("tourCrewFollowupLater");
    followup.querySelector("[data-tour-followup-start]").textContent = text("tourCrewFollowupStart");
    document.querySelectorAll("[data-tour-open]").forEach(button => {
      button.textContent = text("tourFooter");
    });
    renderChoices();
    if (active) {
      renderStepCopy();
      // applyLang() zeichnet unmittelbar nach den Refresh-Hooks die aktuelle
      // Ansicht neu. Im nächsten Frame deshalb das neue Zielelement greifen.
      requestAnimationFrame(refreshActiveTarget);
    }
  }

  function renderChoices() {
    if (!chooser || !config) return;
    const choices = chooser.querySelector(".guided-tour-choices");
    const publicDone = Prefs.get(completeKey("public"), "") === "1";
    const crewDone = Prefs.get(completeKey("crew"), "") === "1";
    const crewAvailable = !!config.canCrew?.();
    choices.innerHTML = `
      <button type="button" class="guided-tour-choice" data-tour-kind="public">
        <span class="guided-tour-choice-icon" aria-hidden="true">⌕</span>
        <span><strong>${esc(text("tourPublicName"))}</strong><small>${esc(text("tourPublicDesc"))}</small></span>
        <span class="guided-tour-choice-state">${publicDone ? esc(text("tourDone")) : "→"}</span>
      </button>
      ${crewAvailable ? `<button type="button" class="guided-tour-choice" data-tour-kind="crew">
        <span class="guided-tour-choice-icon" aria-hidden="true">⚙</span>
        <span><strong>${esc(text("tourCrewName"))}</strong><small>${esc(text("tourCrewDesc"))}</small></span>
        <span class="guided-tour-choice-state">${crewDone ? esc(text("tourDone")) : "→"}</span>
      </button>` : ""}`;
  }

  function mountFooterLink() {
    const credits = document.getElementById("credits");
    if (!credits || credits.querySelector("[data-tour-open]")) return;
    const separator = document.createTextNode(" · ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tour-footer-link";
    button.dataset.tourOpen = "";
    button.textContent = text("tourFooter");
    button.addEventListener("click", openChooser);
    credits.append(separator, button);
  }

  function openChooser() {
    ensureUi();
    dismissFollowup(false);
    refreshLanguage();
    chooser.querySelector(".guided-tour-reset-status").textContent = "";
    chooser.showModal();
  }

  function maybeShowTeaser() {
    if (!config?.showTeaser
        || Prefs.get(teaserKey, "") === "1"
        || Prefs.get(completeKey("public"), "") === "1") return;
    window.setTimeout(() => {
      if (active || document.querySelector("dialog[open]")) return;
      teaser.hidden = false;
      requestAnimationFrame(() => teaser.classList.add("is-visible"));
    }, 900);
  }

  function dismissTeaser({ remember = false } = {}) {
    if (!teaser || teaser.hidden) return;
    if (remember) Prefs.set(teaserKey, "1");
    teaser.classList.remove("is-visible");
    window.setTimeout(() => { teaser.hidden = true; }, reducedMotion() ? 0 : 180);
  }

  function showCrewFollowup() {
    if (!followup || !config?.canCrew?.() || !config.tours?.crew?.steps?.length) return;
    followup.hidden = false;
    requestAnimationFrame(() => {
      followup.classList.add("is-visible");
      followup.querySelector("h2").focus({ preventScroll: true });
    });
  }

  function dismissFollowup(restoreFocus = true) {
    if (!followup || followup.hidden) return;
    followup.classList.remove("is-visible");
    window.setTimeout(() => { followup.hidden = true; }, reducedMotion() ? 0 : 180);
    if (restoreFocus) {
      document.querySelector("[data-tour-open]")?.focus?.({ preventScroll: true });
    }
  }

  function showNotice(key, duration = 3200) {
    const existing = document.querySelector(".guided-tour-complete-toast");
    if (existing) existing.remove();
    const status = document.createElement("div");
    status.className = "guided-tour-complete-toast";
    status.setAttribute("role", "status");
    status.textContent = text(key);
    document.body.appendChild(status);
    requestAnimationFrame(() => status.classList.add("is-visible"));
    window.setTimeout(() => {
      status.classList.remove("is-visible");
      window.setTimeout(() => status.remove(), reducedMotion() ? 0 : 200);
    }, duration);
  }

  function reset() {
    Prefs.set(teaserKey, "");
    Prefs.set(completeKey("public"), "");
    Prefs.set(completeKey("crew"), "");
    safeSessionSet(null);
    chooser.querySelector(".guided-tour-reset-status").textContent = text("tourResetDone");
    renderChoices();
  }

  function resolveTarget(step) {
    const candidate = typeof step.target === "function" ? step.target() : step.target;
    if (!candidate) return null;
    if (candidate instanceof Element) return candidate;
    return document.querySelector(candidate);
  }

  async function start(type, options = {}) {
    ensureUi();
    dismissTeaser();
    dismissFollowup(false);
    if (type === "public") Prefs.set(teaserKey, "1");
    if (!options.resume && type === "public" && config.publicStartUrl) {
      safeSessionSet({ type: "public", page: "index" });
      location.href = config.publicStartUrl;
      return;
    }
    const tour = config.tours?.[type];
    if (!tour?.steps?.length || (type === "crew" && !config.canCrew?.())) return;
    const availableSteps = tour.steps.filter(step => typeof step.when === "function" ? step.when() : step.when !== false);
    if (!availableSteps.length) return;
    if (active) stop("switch", { restore: true, clearSession: false });
    const focused = document.activeElement;
    const focusIsInsideTour = focused?.closest?.(".guided-tour-chooser, .guided-tour-teaser, .guided-tour-followup");
    active = {
      type,
      steps: availableSteps,
      index: 0,
      originalState: config.captureState?.(),
      target: null,
      returnFocus: !focusIsInsideTour && focused instanceof HTMLElement
        ? focused
        : document.querySelector("[data-tour-open]"),
    };
    safeSessionSet({ type, page: config.page });
    layer.hidden = false;
    document.documentElement.classList.add("guided-tour-active");
    await showStep(0);
    card.querySelector("h2").focus({ preventScroll: true });
  }

  async function showStep(index, direction = 1) {
    if (!active) return;
    if (index < 0) index = 0;
    if (index >= active.steps.length) { complete(); return; }
    const step = active.steps[index];
    active.index = index;
    await step.prepare?.();
    await nextPaint();
    const target = resolveTarget(step);
    if ((!target || target.hidden || target.getClientRects().length === 0) && step.optional) {
      return showStep(index + direction, direction);
    }
    active.target = target;
    renderStepCopy();
    if (target) {
      target.scrollIntoView({ behavior: tourScrollBehavior(), block: "center", inline: "nearest" });
      await nextPaint();
      await makeVerticalRoom(target);
    }
    position();
  }

  async function makeVerticalRoom(target) {
    const raw = target.getBoundingClientRect();
    const cardHeight = card.getBoundingClientRect().height;
    const margin = 12;
    const gap = 16;
    const fitsBelow = raw.bottom + gap + cardHeight <= innerHeight - margin;
    const fitsAbove = raw.top - gap - cardHeight >= margin;
    const canFitTogether = raw.height + gap + cardHeight <= innerHeight - margin * 2;
    if (fitsBelow || fitsAbove || !canFitTogether) return;

    const header = document.querySelector(".app-header:not([hidden])");
    const headerPosition = header ? getComputedStyle(header).position : "";
    const headerBottom = header && (headerPosition === "sticky" || headerPosition === "fixed")
      ? Math.min(header.getBoundingClientRect().bottom, innerHeight / 3)
      : 0;
    const desiredTop = Math.max(margin, headerBottom + margin);
    const maximumTop = innerHeight - margin - cardHeight - gap - raw.height;
    const targetTop = Math.min(desiredTop, Math.max(margin, maximumTop));
    const delta = raw.top - targetTop;
    if (Math.abs(delta) < 3) return;
    window.scrollBy({ top: delta, behavior: "auto" });
    await nextPaint();
  }

  function renderStepCopy() {
    if (!active) return;
    const step = active.steps[active.index];
    const count = active.steps.length;
    const titleKey = typeof step.titleKey === "function" ? step.titleKey() : step.titleKey;
    const bodyKey = typeof step.bodyKey === "function" ? step.bodyKey() : step.bodyKey;
    layer.querySelector(".guided-tour-progress-copy").textContent =
      text("tourStepOf", { current: active.index + 1, count });
    layer.querySelector(".guided-tour-progress span").style.width = `${((active.index + 1) / count) * 100}%`;
    layer.querySelector("#guidedTourTitle").textContent =
      titleKey ? text(titleKey, step.vars?.()) : step.title || "";
    layer.querySelector("#guidedTourBody").textContent =
      bodyKey ? text(bodyKey, step.vars?.()) : step.body || "";
    const interaction = layer.querySelector(".guided-tour-interaction");
    const waiting = waitsForNavigation(step);
    interaction.hidden = !waiting;
    interaction.textContent = waiting ? text("tourChooseConHint") : "";
    // Beim interaktiven Con-Schritt kann die Karte je nach Fensterhöhe
    // teilweise über der hervorgehobenen, vollflächig klickbaren Con-Karte
    // liegen. Textflächen lassen Klicks deshalb gezielt durch; die eigenen
    // Tour-Buttons bleiben weiterhin bedienbar.
    card.classList.toggle("is-waiting", waiting);
    const back = layer.querySelector(".guided-tour-back");
    back.textContent = text("tourBack");
    back.disabled = active.index === 0;
    const nextButton = layer.querySelector(".guided-tour-next");
    nextButton.hidden = waiting && typeof step.onNext !== "function";
    nextButton.textContent = waiting || active.index < count - 1 ? text("tourNext") : text("tourFinish");
  }

  function schedulePosition() {
    if (!active || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      position();
    });
  }

  function refreshActiveTarget() {
    if (!active) return;
    active.target = resolveTarget(active.steps[active.index]);
    position();
  }

  function position() {
    if (!active || layer.hidden) return;
    const target = active.target;
    if (!target || target.getClientRects().length === 0) {
      spotlight.hidden = true;
      card.classList.add("is-centered");
      card.style.removeProperty("top");
      card.style.removeProperty("left");
      return;
    }
    spotlight.hidden = false;
    card.classList.remove("is-centered");
    const raw = target.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, raw.left - margin);
    const top = Math.max(margin, raw.top - margin);
    const right = Math.min(innerWidth - margin, raw.right + margin);
    const bottom = Math.min(innerHeight - margin, raw.bottom + margin);
    spotlight.style.left = `${left}px`;
    spotlight.style.top = `${top}px`;
    spotlight.style.width = `${Math.max(24, right - left)}px`;
    spotlight.style.height = `${Math.max(24, bottom - top)}px`;

    const cardRect = card.getBoundingClientRect();
    const gap = 16;
    let cardTop = bottom + gap;
    if (cardTop + cardRect.height > innerHeight - margin) cardTop = top - cardRect.height - gap;
    if (cardTop < margin) cardTop = Math.max(margin, (innerHeight - cardRect.height) / 2);
    let cardLeft = left + (right - left - cardRect.width) / 2;
    cardLeft = Math.max(margin, Math.min(cardLeft, innerWidth - cardRect.width - margin));
    card.style.top = `${cardTop}px`;
    card.style.left = `${cardLeft}px`;
  }

  async function move(direction) {
    if (!active || transitioning) return;
    if (direction < 0 && active.index === 0) return;
    transitioning = true;
    const back = layer.querySelector(".guided-tour-back");
    const nextButton = layer.querySelector(".guided-tour-next");
    back.disabled = true;
    nextButton.disabled = true;
    try {
      const step = active.steps[active.index];
      if (direction > 0 && waitsForNavigation(step) && typeof step.onNext === "function") {
        await step.onNext();
      } else {
        await showStep(active.index + direction, direction);
      }
    } finally {
      transitioning = false;
      if (active) {
        back.disabled = active.index === 0;
        nextButton.disabled = false;
      }
    }
  }
  function next() {
    move(1);
  }
  function previous() {
    move(-1);
  }
  function complete() {
    if (!active) return;
    Prefs.set(completeKey(active.type), "1");
    stop("complete");
  }

  function stop(reason, options = {}) {
    if (!active) return;
    const previousActive = active;
    active = null;
    transitioning = false;
    layer.hidden = true;
    document.documentElement.classList.remove("guided-tour-active");
    if (options.clearSession !== false) safeSessionSet(null);
    if (options.restore !== false) config.restoreState?.(previousActive.originalState);
    if (reason !== "switch") {
      requestAnimationFrame(() => {
        const focusTarget = previousActive.returnFocus?.isConnected
          ? previousActive.returnFocus
          : document.querySelector("[data-tour-open]");
        focusTarget?.focus?.({ preventScroll: true });
      });
    }
    if (reason === "skipped" || reason === "dismissed") {
      window.setTimeout(() => showNotice("tourSkipNotice", 3800), 80);
    } else if (reason === "complete") {
      const offerCrew = previousActive.type === "public"
        && !!config.canCrew?.()
        && !!config.tours?.crew?.steps?.length;
      window.setTimeout(() => {
        if (offerCrew && config.canCrew?.()) showCrewFollowup();
        else showNotice("tourComplete", 2600);
      }, 80);
    }
  }

  function configure(nextConfig) {
    config = nextConfig;
    ensureUi();
    mountFooterLink();
    refreshLanguage();
    const refreshers = window.__authUIRefreshers || (window.__authUIRefreshers = []);
    if (!refreshers.includes(refreshLanguage)) refreshers.push(refreshLanguage);

    const url = new URL(location.href);
    const requested = url.searchParams.get("tour");
    if (requested) {
      url.searchParams.delete("tour");
      history.replaceState(null, "", url.href);
    }
    const resumed = safeSessionGet();
    queueMicrotask(() => {
      if (requested && config.tours?.[requested]) start(requested, { resume: true });
      else if (resumed?.page === config.page && config.tours?.[resumed.type]) {
        start(resumed.type, { resume: true });
      } else {
        maybeShowTeaser();
      }
    });
  }

  window.GuidedTour = { configure, open: openChooser, start, stop, refreshLanguage };
})();
