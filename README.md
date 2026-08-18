# Loomspun

*Where stories gather.*

Loomspun ist eine statisch auslieferbare Gesamtanwendung für slotbasierte Veranstaltungen. Sie verbindet die vollständige Con-/Raumplanung mit dem vollständigen Playabl-Dashboard und lässt Playabl weiterhin als externe Datenquelle zu.

## Bereiche

- **`index.html` – Cons:** gemeinsames Verzeichnis öffentlicher Playabl-Events und in Loomspun angelegter Cons; Suche sowie Filter nach Zeitraum, eigener Verwaltung, Community und Datenquelle.
- **`dashboard/` – Dashboard und Kalender:** echte Live-Auswertungen, Teilnehmendenplanung, Event- und Kalenderansichten aus dem bisherigen Playabl-Dashboard.
- **`plan.html` – Raumplan:** öffentliche Raster-, Tabellen-, Raum- und Lageplanansichten sowie persönliche Kalenderexporte.
- **Crew:** Rollen, Räume, Tische, Slots, Zuordnungen, Änderungswünsche, Spiele, Lageplan und Druckansichten innerhalb von `plan.html`.

Die Kopfzeile verwendet überall dieselben vier Produktbereiche: **Cons / Dashboard / Raumplan / Crew**. Links werden nur aktiviert, wenn die ausgewählte Veranstaltung die jeweilige Funktion unterstützt.

## Gemeinsamer Veranstaltungskontext

- Dashboard-URLs verwenden `dashboard/?event=<playabl-event-id>`.
- Raumplan-URLs verwenden `plan.html?con=<loomspun-slug>`.
- Verknüpfte Datensätze werden über `cons.playabl_event_id` zusammengeführt.
- `con-model.js` normalisiert Playabl-Events, Loomspun-Cons, Sichtbarkeit, Verwaltungsrechte, Zeitstatus und verfügbare Funktionen für das gemeinsame Verzeichnis.
- Kalenderkarten verlinken mit `game=<playabl-game-id>` in den Raumplan; Spielkarten verlinken mit derselben ID zurück in den Kalender.

## Betrieb

Die aktuelle Anwendung benötigt keinen Build-Schritt und kann statisch, etwa über GitHub Pages, ausgeliefert werden. Live-Daten kommen aus der öffentlichen Playabl-API und aus dem vorhandenen Supabase-Projekt der Raumplanung. Schreibzugriffe und Crew-Rechte werden weiterhin serverseitig durch Supabase Row-Level Security geschützt.

Lokaler Test:

```sh
python3 -m http.server 8770
```

Danach `http://localhost:8770/` öffnen.

## Herkunft und Kompatibilität

Loomspun führt die Funktionen aus `playabl-dashboard` und `con-raumplan` in einem eigenen Repository zusammen. Die bisherigen Repositories und öffentlichen URLs bleiben separat bestehen. Spätere Weiterleitungen sollen ihre Query-Parameter und Hashes erhalten, damit alte Event-, Kalender- und Raumplanlinks weiterhin funktionieren.

## Perspektive

Die statische Architektur bleibt zunächst bewusst erhalten. Native Registrierung, Wartelisten, E-Mail-Versand und serverseitiges Accountmanagement benötigen später einen eigenen Backend-Ausbau; sie sind nicht als scheinbar sichere Frontend-Funktionen vorgetäuscht.
