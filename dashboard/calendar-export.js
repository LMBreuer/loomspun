/* Minimal RFC 5545 writer shared by the dashboard's personal-calendar export. */
function calendarText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function calendarUtc(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldCalendarLine(line) {
  const parts = [];
  let part = "";
  let bytes = 0;
  const encoder = new TextEncoder();
  const limit = () => parts.length ? 74 : 75;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (part && bytes + size > limit()) {
      parts.push(part);
      part = character;
      bytes = size;
    } else {
      part += character;
      bytes += size;
    }
  }
  parts.push(part);
  return parts.join("\r\n ");
}

function calendarFilename(value) {
  const base = String(value || "meine-spiele")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "meine-spiele";
  return `${base}.ics`;
}

function buildCalendarFile({ calendarName, events, now = new Date() }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Loomspun//Personal Games//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calendarText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${calendarText(event.uid)}`,
      `DTSTAMP:${calendarUtc(now)}`,
      `DTSTART:${calendarUtc(event.start)}`,
      `DTEND:${calendarUtc(event.end)}`,
      `SUMMARY:${calendarText(event.title)}`,
      `LOCATION:${calendarText(event.location)}`,
      `DESCRIPTION:${calendarText(event.description)}`,
      `STATUS:${event.tentative ? "TENTATIVE" : "CONFIRMED"}`,
      ...(event.url ? [`URL:${event.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}

function downloadCalendarFile(options) {
  const url = URL.createObjectURL(new Blob([buildCalendarFile(options)], { type:"text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = calendarFilename(options.filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
