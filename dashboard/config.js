// Standardwerte, falls Eventdaten, URL-Parameter oder erkannte Slots fehlen.
const CONFIG = {
  eventId: 104,
  zielMin: 70,
  zielMax: 80,
  zielNotiz: "Erfahrungswert aus dem Vorjahr: 13–16 Sessions für 70–80 Personen je Slot",
  erwartete: "~90",
  cutoffStunde: 14,
  zeitzone: "Europe/Vienna",
  // Optionale Familienwertung nach Nennungen in System, Titel oder Beschreibung.
  systemFamilien: [
    "Carved from Brindlewood",
    "Powered by the Apocalypse",
    "Belonging Outside Belonging",
    "Forged in the Dark",
    "Descended from the Queen",
    "No Dice No Masters",
  ],
};

const NON_CAPACITY_FORMATS = [
  { key:"programme", pattern:/\b(?:workshop|panel|vortrag|talk|podcast|lesung|reading|keynote)\b/i },
  { key:"journaling", pattern:/\bjournal(?:ing)?\b/i }
];

function capacityFormat(game) {
  const titleAndSystem = `${game?.system || ""} ${game?.title || ""}`;
  const matched = NON_CAPACITY_FORMATS.find(format => format.pattern.test(titleAndSystem));
  if (matched) return matched.key;
  const description = String(game?.description || "").replace(/<[^>]+>/g, " ");
  if (/\b(?:läuft|findet)\s+nicht\s+in\s+einem\s+slot\b|\bkein(?:e|en|er|es)?\s+fest(?:e|en|er|es)?\s+slot\b|\bslot[-\s]?unabhängig\b|\b(?:während|über)\s+(?:der|die)?\s*(?:gesamten?|ganzen?)\s+con\b|\bnebenher\s+(?:während|über)\b|\b(?:does\s+not|doesn't|won't)\s+(?:run|take\s+place)\s+in\s+(?:a|one)\s+slot\b|\bno\s+fixed\s+slot\b|\bthroughout\s+the\s+(?:whole\s+)?(?:con|event)\b|\bruns?\s+all\s+weekend\b/i.test(description)) return "slot-independent";
  return "capacity";
}

const params  = new URLSearchParams(location.search);
const EVENT   = params.get("event") || String(CONFIG.eventId);
const REQUESTED_GAME = params.get("game");
let LO        = parseInt(params.get("min") || CONFIG.zielMin, 10);
let HI        = parseInt(params.get("max") || CONFIG.zielMax, 10);
const CUTOFF  = CONFIG.cutoffStunde;
const TZ      = CONFIG.zeitzone;
const EVENT_URL = `https://app.playabl.io/events/${EVENT}/overview`;
let activeTargetSource = params.has("min") || params.has("max") ? "manual" : "fallback";
let eligibleTargetCount = null;
let peakTargetRsvps = 0;
