// Durable queue for one specific, high-stakes action: an agent marking a
// delivery's status forward (picked_up / in_transit / delivered), which
// can include a base64 proof-of-delivery photo. Scoped deliberately to
// just this — NOT delivery acceptance (that's a race between agents and
// must never be replayed blind after a connectivity gap) and NOT GPS
// pings (losing a few is harmless; there's nothing to durably replay).
//
// Uses IndexedDB rather than localStorage because a proof photo easily
// exceeds localStorage's practical size ceiling and IndexedDB handles
// structured/blob-ish data far more comfortably.
const DB_NAME = "pickandearn-offline";
const DB_VERSION = 1;
const STORE = "delivery-advances";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "queueId", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// `deliveryId` + `body` mirror exactly what api.advanceDelivery(token, id, body)
// takes, so replaying later is a direct passthrough — no translation layer
// to keep in sync as the real endpoint evolves.
export async function enqueueAdvance(deliveryId, body) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ deliveryId, body, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedAdvances() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedAdvance(queueId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(queueId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// True for a genuine connectivity failure (fetch never reached the
// server) as opposed to the server responding with a real error (bad
// request, server bug, etc.) — only the former should be queued for
// retry; the latter is a real problem the agent needs to see now.
export function isNetworkError(err) {
  return !navigator.onLine || err instanceof TypeError;
}

// Replays every queued advance in the order they were queued, stopping
// at the first one that still fails for network reasons (no point
// racing ahead out of order). A queued action that the server now
// rejects for a real reason (e.g. the delivery was reassigned while this
// agent was offline) is surfaced via onError rather than silently
// dropped or retried forever.
export async function flushQueuedAdvances({ advanceFn, onSuccess, onError }) {
  const queued = await getQueuedAdvances();
  for (const item of queued.sort((a, b) => a.queuedAt - b.queuedAt)) {
    try {
      await advanceFn(item.deliveryId, item.body);
      await removeQueuedAdvance(item.queueId);
      onSuccess?.(item);
    } catch (err) {
      if (isNetworkError(err)) return; // still offline — stop, try again next time
      await removeQueuedAdvance(item.queueId); // real rejection — don't retry forever
      onError?.(item, err);
    }
  }
}
