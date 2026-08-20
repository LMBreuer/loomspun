(function exposeLoomspunConModel(global) {
  "use strict";

  function asDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function sourceKey(sources) {
    if (sources.playabl && sources.loomspun) return "both";
    if (sources.playabl) return "playabl";
    return "loomspun";
  }

  function sourceLabel(sources) {
    if (sources.playabl && sources.loomspun) return "Playabl + Loomspun";
    if (sources.playabl) return "Playabl";
    return "Loomspun";
  }

  function timeBucket(endDate, startDate, now) {
    const end = asDate(endDate) || asDate(startDate);
    return end && end.getTime() < now.getTime() ? "past" : "upcoming";
  }

  function normalizeConDirectory({ playablEvents = [], loomspunCons = [], memberships = [], managedPlayablEventIds = [], now = new Date() }) {
    const membershipIds = new Set(memberships.map(entry => String(entry.conId)));
    const managedPlayablIds = new Set(managedPlayablEventIds.map(String));
    const playablById = new Map(playablEvents.map(event => [String(event.id), event]));
    const loomspunByPlayablId = new Map();
    const nativeLoomspunCons = [];

    loomspunCons.forEach(con => {
      if (con.playablEventId != null) loomspunByPlayablId.set(String(con.playablEventId), con);
      else nativeLoomspunCons.push(con);
    });

    const records = [];

    playablEvents.forEach(event => {
      const playablId = String(event.id);
      const con = loomspunByPlayablId.get(playablId) || null;
      const managed = managedPlayablIds.has(playablId) || Boolean(con && membershipIds.has(String(con.id)));
      const isPublic = event.public !== false || Boolean(con?.public);
      if (!managed && !isPublic) return;

      const sources = { playabl: true, loomspun: Boolean(con) };
      const hasRoomPlan = Boolean(con?.hasRoomPlan);
      records.push({
        key: con ? `loomspun:${con.id}` : `playabl:${playablId}`,
        prototypeKey: event.prototypeKey || con?.prototypeKey || `playabl-${playablId}`,
        name: con?.name || event.name,
        startDate: con?.startDate || event.startDate,
        endDate: con?.endDate || event.endDate || event.startDate,
        community: con?.community || event.community || { id: null, name: "Ohne Community" },
        public: isPublic,
        managed,
        scope: managed ? "mine" : "public",
        time: timeBucket(con?.endDate || event.endDate, con?.startDate || event.startDate, now),
        sources,
        sourceKey: sourceKey(sources),
        sourceLabel: sourceLabel(sources),
        externalIds: { playabl: playablId, loomspun: con ? String(con.id) : null },
        slug: con?.slug || null,
        capabilities: {
          dashboard: true,
          roomPlan: hasRoomPlan,
          crew: Boolean(con?.crewEnabled),
          canCreateRoomPlan: !hasRoomPlan,
        },
        setupState: !con ? "playabl-only" : hasRoomPlan ? "ready" : "room-plan-missing",
      });
    });

    nativeLoomspunCons.forEach(con => {
      const managed = membershipIds.has(String(con.id));
      const isPublic = con.public !== false;
      if (!managed && !isPublic) return;
      const sources = { playabl: false, loomspun: true };
      const hasRoomPlan = Boolean(con.hasRoomPlan);
      records.push({
        key: `loomspun:${con.id}`,
        prototypeKey: con.prototypeKey || `loomspun-${con.id}`,
        name: con.name,
        startDate: con.startDate,
        endDate: con.endDate || con.startDate,
        community: con.community || { id: null, name: "Ohne Community" },
        public: isPublic,
        managed,
        scope: managed ? "mine" : "public",
        time: timeBucket(con.endDate, con.startDate, now),
        sources,
        sourceKey: sourceKey(sources),
        sourceLabel: sourceLabel(sources),
        externalIds: { playabl: null, loomspun: String(con.id) },
        slug: con.slug || null,
        capabilities: {
          dashboard: false,
          roomPlan: hasRoomPlan,
          crew: Boolean(con.crewEnabled),
          canCreateRoomPlan: !hasRoomPlan,
        },
        setupState: hasRoomPlan ? "ready" : "room-plan-missing",
      });
    });

    return records.sort((left, right) => {
      const leftTime = asDate(left.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = asDate(right.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (left.time !== right.time) return left.time === "upcoming" ? -1 : 1;
      const dateOrder = left.time === "past" ? rightTime - leftTime : leftTime - rightTime;
      return dateOrder || left.name.localeCompare(right.name, "de");
    });
  }

  const SAMPLE_DATA = {
    playablEvents: [
      { id: 81, prototypeKey: "past", name: "3W6 Con 2025", startDate: "2025-08-22T08:00:00+02:00", endDate: "2025-08-24T20:00:00+02:00", community: { id: "3w6", name: "3W6 Community" }, public: true },
      { id: 104, prototypeKey: "planned", name: "3W6 Con 2026", startDate: "2026-08-21T08:00:00+02:00", endDate: "2026-08-23T20:00:00+02:00", community: { id: "3w6", name: "3W6 Community" }, public: true },
      { id: 105, prototypeKey: "dashboard-only", name: "3W6 Con 2026 · Workshops & Panels", startDate: "2026-08-20T09:00:00+02:00", endDate: "2026-08-20T18:00:00+02:00", community: { id: "3w6", name: "3W6 Community" }, public: true },
      { id: 224, prototypeKey: "indie", name: "Indie Games Weekend 2026", startDate: "2026-11-14T09:00:00+01:00", endDate: "2026-11-15T18:00:00+01:00", community: { id: "indie-vienna", name: "Indie Games Vienna" }, public: true },
      { id: 178, prototypeKey: "winter", name: "Wiener Winter Minicon", startDate: "2027-01-03T09:00:00+01:00", endDate: "2027-01-03T20:00:00+01:00", community: { id: "vienna-storygames", name: "Vienna Storygames" }, public: true },
    ],
    loomspunCons: [
      { id: "con-2025", playablEventId: 81, slug: "3w6-con-2025", hasRoomPlan: true, crewEnabled: false, public: true },
      { id: "con-2026", playablEventId: 104, slug: "3w6-con-2026-9o4z", hasRoomPlan: true, crewEnabled: true, public: true },
      { id: "con-workshops", playablEventId: 105, slug: "3w6-workshops-2026", hasRoomPlan: false, crewEnabled: false, public: true },
      { id: "con-native-1", prototypeKey: "native", name: "Narrative Games Meetup", slug: "narrative-games-meetup", startDate: "2026-12-05T17:00:00+01:00", endDate: "2026-12-05T23:00:00+01:00", community: { id: "open-table-vienna", name: "Open Table Vienna" }, hasRoomPlan: false, crewEnabled: false, public: true },
    ],
    memberships: [{ conId: "con-2026" }, { conId: "con-workshops" }],
    managedPlayablEventIds: [],
  };

  global.LoomspunConModel = { normalizeConDirectory, SAMPLE_DATA };
})(globalThis);
