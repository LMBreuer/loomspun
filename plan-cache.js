/* Öffentlicher Raumplan-Cache: sofort anzeigen, danach live abgleichen.
   Persistiert werden ausschließlich öffentliche Planungsdaten – keine
   Zugangstokens, Rollen, Wünsche oder Playabl-Profil-/RSVP-IDs. */
const PlanCache = (() => {
  const DB_NAME = "loomspun-public-plan-cache";
  const DB_VERSION = 1;
  const STORE = "snapshots";
  const SNAPSHOT_VERSION = 1;
  const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function get(key) {
    if (!key) return null;
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, "readonly");
      const record = await requestResult(tx.objectStore(STORE).get(String(key)));
      db.close();
      if (!record || record.version !== SNAPSHOT_VERSION || Date.now() - record.savedAt > MAX_AGE_MS) return null;
      return record;
    } catch {
      return null;
    }
  }

  async function put(keys, snapshot) {
    const uniqueKeys = [...new Set((keys || []).filter(Boolean).map(String))];
    if (!uniqueKeys.length || !snapshot) return;
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      const savedAt = Date.now();
      for (const key of uniqueKeys) tx.objectStore(STORE).put({ key, version: SNAPSHOT_VERSION, savedAt, snapshot });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Cache-Probleme dürfen den Live-Raumplan niemals blockieren.
    }
  }

  function publicCon(con) {
    if (!con) return null;
    return {
      id: con.id,
      name: con.name,
      slug: con.slug,
      playabl_event_id: con.playabl_event_id,
      floor_plan_mode: con.floor_plan_mode,
      floor_plan_url: con.floor_plan_url,
    };
  }

  function publicGame(game) {
    return {
      key: game.key,
      gameId: game.gameId,
      title: game.title,
      url: game.url,
      seats: game.seats,
      provider: game.provider,
      ws: game.ws,
      slotKey: game.slotKey,
      slotLabel: game.slotLabel,
      time: game.time,
      start: game.start,
      end: game.end,
      requiredTagIds: game.requiredTagIds || [],
    };
  }

  function publicDbGame(game) {
    return {
      id: game.id,
      con_id: game.con_id,
      title: game.title,
      provider: game.provider,
      seats: game.seats,
      workshop: game.workshop,
      description: game.description,
      created_at: game.created_at,
      updated_at: game.updated_at,
    };
  }

  function createSnapshot(con, data, playablGames) {
    return {
      con: publicCon(con),
      data: {
        rooms: data.rooms || [],
        tables: data.tables || [],
        assignments: data.assignments || [],
        slotBuckets: data.slotBuckets || [],
        slots: data.slots || [],
        featureTags: data.featureTags || [],
        roomFeatureTags: data.roomFeatureTags || [],
        dbGames: (data.dbGames || []).map(publicDbGame),
        gameRequiredTags: data.gameRequiredTags || [],
        publicFloorPlan: data.publicFloorPlan || null,
      },
      games: (playablGames || []).filter(game => !game.manual).map(publicGame),
    };
  }

  const signature = snapshot => JSON.stringify(snapshot || null);
  return { get, put, createSnapshot, signature };
})();
