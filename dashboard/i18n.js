const UI_LANGUAGE_KEY = "playabl-dashboard-language";
const UI_COPY = {
  de: {
    skip: "Zum Inhalt springen", header:"Dashboard-Kopfzeile", eyebrow: "Playabl · Spielangebot pro Slot", pageLoading:"Spielangebot pro Slot", dataLoading:"Daten werden live von Playabl geladen …", statusLoading:"Lade Daten von Playabl …", slotsLoading:"werden geladen …",
    nav: "Ansicht, Event und Ziel wählen", view:"Ansicht", activeSettings:"Aktive Einstellungen", theme:"Farbschema wählen", calendarView:"Kalender-Ansicht", overview: "Übersicht", calendar: "Kalender",
    contextTitle:"Kontext", contextIntro:"Zufällige Ausschnitte aus Rundenbeschreibungen.", contextClose:"Kontext schließen", contextRefresh:"Andere Ausschnitte", sectionInfoTitle:"Information", sectionInfoClose:"Information schließen",
    community: "Community", event: "Event wechseln", setup: "Setup", language: "Sprache wählen", targetSetting:"Ziel-Plätze pro Slot", slotsSetting:"Slots",
    eventSwitchTitle:"Veranstaltung wechseln", eventSwitchIntro:"Wähle eine öffentliche Veranstaltung aus Playabl.", eventSwitchClose:"Dialog schließen", eventField:"Veranstaltung",
    setupTitle:"Dashboard-Setup", setupIntro:"Passe Zielkorridor, Sonderformat-Zählung und Zeitfenster für dieses Event an. Die Einstellungen bleiben lokal in diesem Browser.",
    setupClose:"Dialog schließen", setupTargetTitle:"Ziel-Plätze pro Slot", setupFrom:"Von", setupTo:"Bis", setupMin:"Ziel von", setupMax:"Ziel bis",
    setupIncludeSpecial:"Sonderformate mitzählen", setupIncludeSpecialHint:"Bezieht sie lokal in Platz-, Frei- und Bedarfszahlen ein.",
    setupPersonalTitle:"Mein Kalender", setupPersonalChange:"Zuordnung festlegen", setupPersonalReset:"Zuordnung zurücksetzen",
    setupSlotsTitle:"Slot-Zeiten", setupAdd:"+ Slot hinzufügen", setupResetSlots:"Slots neu ermitteln", setupCancel:"Abbrechen", setupSave:"Setup speichern",
    setupName:"Name", setupRemove:"Slot entfernen", setupInvalidTarget:"Bitte gültige Ziel-Werte angeben (von ≤ bis).", setupInvalidSlots:"Bitte mindestens einen gültigen Slot angeben.",
    personalTitle:"Mein Kalender", personalIntro:"Hinterlege deinen Playabl-Namen oder deine E-Mail-Adresse, um eigene Angebote, bestätigte Anmeldungen und Wartelistenplätze zu sehen.",
    personalClose:"Dialog schließen", personalIdentity:"Playabl-Name oder E-Mail-Adresse", personalPrivacy:"Die E-Mail-Adresse wird nicht gespeichert. Lokal bleiben nur Profil-ID und Playabl-Name; auf Playabl wird nichts verändert.", personalCancel:"Abbrechen", personalSave:"Meine Spiele anzeigen",
    infoOpen: "Informationen zu Zielplätzen, Slots und Teilnehmendenplanung", infoClose: "Informationen schließen",
    infoTitle: "Wie funktionieren Zielplätze, Slots und Teilnehmendenplanung?",
    infoIntro: "Hintergrund zur Auswertung, automatischen Erkennung, Teilnehmendenplanung und lokalen Konfiguration.",
    infoTargetTitle: "Ziel-Plätze pro Slot",
    infoTargetText: "Der Zielkorridor beschreibt, wie viele Personen in jedem Zeitfenster durch angebotene Runden untergebracht werden sollen. Wenn Playabl Event-Freischaltungen bereitstellt, schätzt das Dashboard daraus automatisch einen Korridor von ungefähr 85–100 Prozent und rundet ihn sinnvoll. Sobald RSVPs vorhanden sind, dient die höchste eindeutige Nachfrage eines Slots zusätzlich als Untergrenze. Manuelle Werte haben Vorrang; „Ziel neu ermitteln“ stellt die automatische Schätzung wieder her.",
    infoCountText: "<strong>Gezählt werden Spielplätze plus anbietende Person</strong> pro Session. Journaling, Workshops und eindeutig slot-unabhängige Formate werden als Sonderformate gekennzeichnet und sind standardmäßig ausgenommen. Im Setup können sie für dieses Event und diesen Browser wieder in Platzbedarf, freie Plätze und Zielerreichung einbezogen werden. Der Zielwert verändert keine Daten auf Playabl.",
    infoSourcesTitle: "Woher kommen die Slots?",
    infoSourceManual: "<strong>Manuelle Einstellung:</strong> Eine im Setup gespeicherte Konfiguration hat immer Vorrang.",
    infoSourcePlan: "<strong>Loomspun-Raumplan:</strong> Ist das Event mit einer Raumplanung verbunden, werden deren Zeitfenster übernommen.",
    infoSourceAuto: "<strong>Automatische Erkennung:</strong> Ohne diese Quellen untersucht das Dashboard beim ersten Laden die Startzeiten aller Sessions.",
    infoSourceFallback: "<strong>Fallback:</strong> Reichen die Daten für eine verlässliche Schätzung nicht aus, gilt Vormittag 0–14 Uhr und Nachmittag 14–24 Uhr.",
    infoDetectionTitle: "Wie funktioniert die automatische Erkennung?",
    infoDetectionText: "Nahe beieinanderliegende Startzeiten werden zu Gruppen zusammengefasst. Eine größere zeitliche Lücke deutet auf einen neuen Slot hin. Aus der Lage dieser Gruppen entstehen Bezeichnungen wie Vormittag, Nachmittag oder Abend sowie passende Grenzen zwischen den Zeitfenstern.",
    infoDetectionStable: "Die Schätzung wird nur einmal angelegt. Danach bleibt sie stabil, auch wenn später neue Sessions dazukommen. Im Setup kann sie jederzeit geprüft und korrigiert werden.",
    infoParticipationTitle: "Wie wird die Teilnehmendenplanung berechnet?",
    infoParticipationText: "Sobald die Anmeldung geöffnet ist, wertet das Dashboard alle Personen mit Event-Freischaltung aus. Als sicher eingeplant gilt, wer innerhalb der Spielplatz-Kapazität einer RSVP-Liste liegt oder selbst eine Session anbietet. Eine Warteliste zählt nicht als sicher. „Vollständig verplant“ bedeutet, in jedem erkannten Programmslot bestätigt oder selbst anbietend zu sein; Sonderformate zählen dabei als persönliche Termine.",
    infoParticipationPrivacy: "Öffentlich erscheinen ausschließlich zusammengefasste Zahlen, niemals Namen oder Kontaktdaten. Da Playabl keine individuellen Anwesenheitstage liefert, nimmt die Vollplanungsquote an, dass alle Event-Freigeschalteten grundsätzlich in allen Slots teilnehmen könnten.",
    infoStorageTitle: "Speicherung und erneute Ermittlung",
    infoStorageText: "Manuell eingestellte oder automatisch erkannte Slots werden nur lokal in diesem Browser gespeichert. Sie verändern weder Playabl noch die Con-Raumplanung. <strong>„Slots neu ermitteln“</strong> entfernt die lokale Slot-Konfiguration und führt die Quellenlogik erneut aus: Raumplanung, automatische Erkennung und zuletzt der Standard-Fallback. Der Zielkorridor bleibt dabei unverändert."
  },
  en: {
    skip: "Skip to content", header:"Dashboard header", eyebrow: "Playabl · Session capacity per slot", pageLoading:"Session capacity per slot", dataLoading:"Data is loaded live from Playabl …", statusLoading:"Loading data from Playabl …", slotsLoading:"loading …",
    nav: "Choose view, event and target", view:"View", activeSettings:"Active settings", theme:"Choose colour scheme", calendarView:"Calendar view", overview: "Overview", calendar: "Calendar",
    contextTitle:"Context", contextIntro:"Random excerpts from session descriptions.", contextClose:"Close context", contextRefresh:"Different excerpts", sectionInfoTitle:"Information", sectionInfoClose:"Close information",
    community: "Community", event: "Change event", setup: "Setup", language: "Choose language", targetSetting:"Target capacity per slot", slotsSetting:"Slots",
    eventSwitchTitle:"Change event", eventSwitchIntro:"Choose a public event from Playabl.", eventSwitchClose:"Close dialog", eventField:"Event",
    setupTitle:"Dashboard setup", setupIntro:"Adjust the target range, special-format counting, and time windows for this event. Settings remain local to this browser.",
    setupClose:"Close dialog", setupTargetTitle:"Target capacity per slot", setupFrom:"From", setupTo:"To", setupMin:"Target from", setupMax:"Target to",
    setupIncludeSpecial:"Count special formats", setupIncludeSpecialHint:"Locally includes them in capacity, availability, and demand figures.",
    setupPersonalTitle:"My calendar", setupPersonalChange:"Set association", setupPersonalReset:"Reset association",
    setupSlotsTitle:"Slot times", setupAdd:"+ Add slot", setupResetSlots:"Redetect slots", setupCancel:"Cancel", setupSave:"Save setup",
    setupName:"Name", setupRemove:"Remove slot", setupInvalidTarget:"Enter a valid target range (from ≤ to).", setupInvalidSlots:"Enter at least one valid slot.",
    personalTitle:"My calendar", personalIntro:"Enter your Playabl name or email address to see sessions you run, confirmed registrations, and waitlist positions.",
    personalClose:"Close dialog", personalIdentity:"Playabl name or email address", personalPrivacy:"The email address is not stored. Only the profile ID and Playabl name remain in this browser; nothing is changed on Playabl.", personalCancel:"Cancel", personalSave:"Show my games",
    infoOpen: "Information about target capacity, slots, and participant planning", infoClose: "Close information",
    infoTitle: "How do target capacity, slots, and participant planning work?",
    infoIntro: "Background on the analysis, automatic detection, participant planning, and local configuration.",
    infoTargetTitle: "Target capacity per slot",
    infoTargetText: "The target range describes how many people should be accommodated by the sessions offered in each time window. When Playabl provides event access data, the dashboard automatically estimates a range of roughly 85–100 percent and rounds it sensibly. Once RSVPs exist, the highest unique demand in any slot also acts as a lower bound. Manual values take priority; “Redetect target” restores the automatic estimate.",
    infoCountText: "<strong>Capacity includes player seats plus the person running each counted session.</strong> Journaling, workshops, and clearly slot-independent formats are marked as special formats and excluded by default. Setup can include them again in demand, available-seat, and target calculations for this event and browser. The target does not change any data on Playabl.",
    infoSourcesTitle: "Where do the slots come from?",
    infoSourceManual: "<strong>Manual configuration:</strong> A configuration saved in Setup always takes priority.",
    infoSourcePlan: "<strong>Con room plan:</strong> If the event is linked to a room plan, its time windows are used.",
    infoSourceAuto: "<strong>Automatic detection:</strong> Without either source, the dashboard examines all session start times when the event is loaded for the first time.",
    infoSourceFallback: "<strong>Fallback:</strong> If there is not enough data for a reliable estimate, the defaults are Morning 0–14 and Afternoon 14–24.",
    infoDetectionTitle: "How does automatic detection work?",
    infoDetectionText: "Start times that are close together are grouped. A larger gap indicates the beginning of a new slot. The positions of these groups produce labels such as Morning, Afternoon, or Evening, together with suitable boundaries between the time windows.",
    infoDetectionStable: "The estimate is created only once. It then remains stable even when more sessions are added later. It can be reviewed and corrected in Setup at any time.",
    infoParticipationTitle: "How is participant planning calculated?",
    infoParticipationText: "Once registration has opened, the dashboard evaluates everyone with event access. A person counts as confirmed if they are within a session’s player capacity according to the RSVP order or if they run a session themselves. A waitlist does not count as confirmed. “Fully planned” means being confirmed or facilitating in every detected programme slot; special formats count as personal commitments here.",
    infoParticipationPrivacy: "Only aggregate figures are shown publicly—never names or contact details. Because Playabl does not provide individual attendance days, the full-planning percentage assumes that everyone with event access could attend all slots.",
    infoStorageTitle: "Storage and redetection",
    infoStorageText: "Manually configured or automatically detected slots are stored only in this browser. They do not change Playabl or the con room plan. <strong>“Redetect slots”</strong> removes the local slot configuration and runs the source logic again: room plan, automatic detection, and finally the standard fallback. The target range remains unchanged."
  }
};
function applyLanguage(language) {
  const key = UI_COPY[language] ? language : "de";
  const copy = UI_COPY[key];
  document.documentElement.lang = key;
  try { localStorage.setItem(UI_LANGUAGE_KEY, key); } catch {}
  document.querySelectorAll("[data-language]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.language === key)));
  document.querySelector(".skip-link").textContent = copy.skip;
  document.querySelector(".dashboard-head").setAttribute("aria-label", copy.header);
  document.querySelector(".dashboard-eyebrow").firstChild.nodeValue = copy.eyebrow;
  document.querySelector(".controls-group .sr-only").textContent = copy.theme;
  document.querySelector(".language-switch").setAttribute("aria-label", copy.language);
  document.querySelector(".controls").setAttribute("aria-label", copy.nav);
  document.querySelector(".tabs").setAttribute("aria-label", copy.view);
  document.querySelector(".controls-settings").setAttribute("aria-label", copy.activeSettings);
  document.getElementById("calView").setAttribute("aria-label", copy.calendarView);
  document.getElementById("tabOverview").textContent = copy.overview;
  document.getElementById("tabCalendar").textContent = copy.calendar;
  document.querySelector("label[for='communitySelect'] > span").textContent = copy.community;
  document.querySelector("label[for='eventSelect'] > span").textContent = copy.eventField;
  document.getElementById("eventSwitchOpen").setAttribute("title", copy.eventSwitchTitle);
  document.getElementById("eventSwitchOpen").setAttribute("aria-label", copy.eventSwitchTitle);
  document.getElementById("eventSwitchTitle").textContent = copy.eventSwitchTitle;
  document.querySelector("#eventSwitchTitle + p").textContent = copy.eventSwitchIntro;
  document.getElementById("eventSwitchClose").setAttribute("aria-label", copy.eventSwitchClose);
  document.getElementById("slotConfigOpen").textContent = copy.setup;
  document.getElementById("slotConfigTitle").textContent = copy.setupTitle;
  document.getElementById("slotConfigIntro").textContent = copy.setupIntro;
  document.getElementById("slotConfigClose").setAttribute("aria-label", copy.setupClose);
  document.getElementById("setupTargetTitle").textContent = copy.setupTargetTitle;
  document.getElementById("targetMinLabel").textContent = copy.setupFrom;
  document.getElementById("zielMin").setAttribute("aria-label", copy.setupMin);
  document.getElementById("targetMaxLabel").textContent = copy.setupTo;
  document.getElementById("zielMax").setAttribute("aria-label", copy.setupMax);
  document.getElementById("includeSpecialFormatsLabel").textContent = copy.setupIncludeSpecial;
  document.getElementById("includeSpecialFormatsHint").textContent = copy.setupIncludeSpecialHint;
  document.getElementById("setupPersonalTitle").textContent = copy.setupPersonalTitle;
  document.getElementById("personalCalendarSetupChange").textContent = copy.setupPersonalChange;
  document.getElementById("personalCalendarReset").textContent = copy.setupPersonalReset;
  document.getElementById("setupSlotsTitle").textContent = copy.setupSlotsTitle;
  document.getElementById("slotConfigAdd").textContent = copy.setupAdd;
  document.getElementById("slotConfigReset").textContent = copy.setupResetSlots;
  document.getElementById("slotConfigCancel").textContent = copy.setupCancel;
  document.getElementById("slotConfigSave").textContent = copy.setupSave;
  document.querySelectorAll("[data-slot-name-copy]").forEach(element => { element.textContent = copy.setupName; });
  document.querySelectorAll("[data-slot-from-copy]").forEach(element => { element.textContent = copy.setupFrom; });
  document.querySelectorAll("[data-slot-to-copy]").forEach(element => { element.textContent = copy.setupTo; });
  document.querySelectorAll("[data-slot-remove]").forEach(element => { element.setAttribute("aria-label", copy.setupRemove); });
  document.getElementById("personalCalendarTitle").textContent = copy.personalTitle;
  document.getElementById("personalCalendarIntro").textContent = copy.personalIntro;
  document.getElementById("personalCalendarClose").setAttribute("aria-label", copy.personalClose);
  document.getElementById("personalCalendarIdentityLabel").textContent = copy.personalIdentity;
  document.getElementById("personalCalendarPrivacy").textContent = copy.personalPrivacy;
  document.getElementById("personalCalendarCancel").textContent = copy.personalCancel;
  document.getElementById("personalCalendarSave").textContent = copy.personalSave;
  const settingLabels = document.querySelectorAll(".setting-summary-label");
  if (settingLabels[0]) settingLabels[0].textContent = copy.targetSetting;
  if (settingLabels[1]) settingLabels[1].textContent = copy.slotsSetting;
  document.getElementById("settingsInfoOpen").setAttribute("aria-label", copy.infoOpen);
  document.getElementById("settingsInfoClose").setAttribute("aria-label", copy.infoClose);
  document.getElementById("settingsInfoTitle").textContent = copy.infoTitle;
  document.getElementById("settingsInfoIntro").textContent = copy.infoIntro;
  document.getElementById("settingsInfoTargetTitle").textContent = copy.infoTargetTitle;
  document.getElementById("settingsInfoTargetText").textContent = copy.infoTargetText;
  document.getElementById("settingsInfoCountText").innerHTML = copy.infoCountText;
  document.getElementById("settingsInfoSourcesTitle").textContent = copy.infoSourcesTitle;
  document.getElementById("settingsInfoSourceManual").innerHTML = copy.infoSourceManual;
  document.getElementById("settingsInfoSourcePlan").innerHTML = copy.infoSourcePlan;
  document.getElementById("settingsInfoSourceAuto").innerHTML = copy.infoSourceAuto;
  document.getElementById("settingsInfoSourceFallback").innerHTML = copy.infoSourceFallback;
  document.getElementById("settingsInfoDetectionTitle").textContent = copy.infoDetectionTitle;
  document.getElementById("settingsInfoDetectionText").textContent = copy.infoDetectionText;
  document.getElementById("settingsInfoDetectionStable").textContent = copy.infoDetectionStable;
  document.getElementById("settingsInfoParticipationTitle").textContent = copy.infoParticipationTitle;
  document.getElementById("settingsInfoParticipationText").textContent = copy.infoParticipationText;
  document.getElementById("settingsInfoParticipationPrivacy").textContent = copy.infoParticipationPrivacy;
  document.getElementById("settingsInfoStorageTitle").textContent = copy.infoStorageTitle;
  document.getElementById("settingsInfoStorageText").innerHTML = copy.infoStorageText;
  document.getElementById("wordContextTitle").textContent = copy.contextTitle;
  document.getElementById("wordContextIntro").textContent = copy.contextIntro;
  document.getElementById("wordContextClose").setAttribute("aria-label", copy.contextClose);
  document.getElementById("wordContextRefresh").textContent = copy.contextRefresh;
  document.getElementById("sectionInfoTitle").textContent = copy.sectionInfoTitle;
  document.getElementById("sectionInfoClose").setAttribute("aria-label", copy.sectionInfoClose);
  if (typeof dashboardState === "undefined" || !dashboardState) {
    document.getElementById("pageTitle").textContent = copy.pageLoading;
    document.getElementById("pageSub").textContent = copy.dataLoading;
    document.getElementById("status").textContent = copy.statusLoading;
    document.getElementById("slotsSummary").textContent = copy.slotsLoading;
  }
  document.querySelectorAll(".theme-switch-group").forEach(renderThemeSwitch);
  renderContrastAidSwitch();
  renderArtCaption();
  window.dispatchEvent(new CustomEvent("uilanguagechange", { detail:{ language:key } }));
}
document.querySelector(".language-switch").addEventListener("click", event => {
  const button = event.target.closest("button[data-language]");
  if (button) applyLanguage(button.dataset.language);
});
try { applyLanguage(localStorage.getItem(UI_LANGUAGE_KEY) || "de"); } catch { applyLanguage("de"); }
