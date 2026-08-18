/* RFC 5545 export for the games associated with the locally selected Playabl profile. */
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

// Calendar lines are limited to 75 octets. Keep UTF-8 characters intact while folding.
function foldCalendarLine(line) {
  const parts = [];
  let part = "";
  let bytes = 0;
  const limit = () => parts.length ? 74 : 75; // continuation lines start with one space
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
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

function personalCalendarGames() {
  return personalGames()
    .filter(game => game.start && !Number.isNaN(new Date(game.start).getTime()))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function buildPersonalCalendar(games, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Loomspun//Personal Games//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calendarText(`${S.con?.name || "Con"} – ${S.personalProfile?.username || tr("myGames")}`)}`,
  ];
  for (const game of games) {
    const assignment = asgFor(game);
    const table = assignment && S.tables.find(item => item.id === assignment.table_id);
    const room = table && roomOfTable(table.id);
    const end = game.end || game.start;
    const role = personalGameState(game);
    const description = [
      S.con?.name,
      role ? tr(`floorPlanPersonalRole_${role}`) : "",
      game.provider ? tr("providerLabel", { p: game.provider }) : "",
      game.url || "",
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${calendarText(`${S.con?.id || S.con?.slug || "con"}-${game.key}@loomspun`)}`,
      `DTSTAMP:${calendarUtc(now)}`,
      `DTSTART:${calendarUtc(game.start)}`,
      `DTEND:${calendarUtc(end)}`,
      `SUMMARY:${calendarText(game.title)}`,
      `LOCATION:${calendarText([room?.name, table?.name].filter(Boolean).join(" · "))}`,
      `DESCRIPTION:${calendarText(description)}`,
      `STATUS:${role === "waitlist" ? "TENTATIVE" : "CONFIRMED"}`,
      ...(game.url ? [`URL:${game.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}

function calendarFilename() {
  const base = `${S.con?.name || "con"}-${S.personalProfile?.username || "meine-spiele"}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "meine-spiele";
  return `${base}.ics`;
}

function downloadPersonalCalendar() {
  if (!S.personalProfile) {
    openPersonalGamesDialog();
    return;
  }
  const games = personalCalendarGames();
  if (!games.length) {
    window.alert(tr("calendarNoGames"));
    return;
  }
  const url = URL.createObjectURL(new Blob([buildPersonalCalendar(games)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = calendarFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
