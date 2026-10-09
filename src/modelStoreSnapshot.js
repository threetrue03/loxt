// One subscription and list request per desktop adapter, shared by all panels.
const stores = new WeakMap();
export function sharedModelStore(adapter) {
  if (stores.has(adapter)) return stores.get(adapter);
  let snapshot = { data: null, environment: null, error: '', loading: false }, summary = snapshot;
  let generation = 0, epoch = 0, modelSignature = '', environmentSignature = '', started = false, offStore, offEnvironment;
  const listeners = new Set(), requests = new Map();
  function publish(change) {
    const next = { ...snapshot, ...change };
    if (Object.keys(change).every(key => snapshot[key] === change[key])) return;
    snapshot = next;
    if (summary.data !== next.data || summary.error !== next.error || summary.loading !== next.loading) summary = { data: next.data, environment: null, error: next.error, loading: next.loading };
    for (const listener of listeners) listener();
  }
  function reload(force = false, offline = false) {
    if (!started) return Promise.resolve(snapshot.data);
    const key = `${force}:${offline}`;
    if (requests.has(key)) return requests.get(key);
    const token = ++generation; publish({ loading: true });
    const request = Promise.resolve().then(() => adapter.modelStore.list({ force, offline })).then(value => {
      if (started && token === generation) publish({ data: value, error: value.error || '' });
      return value;
    }).catch(error => { if (started && token === generation) publish({ error: error.message || String(error) }); }).finally(() => {
      requests.delete(key); if (started && token === generation) publish({ loading: false });
    });
    requests.set(key, request); return request;
  }
  function receive(value) {
    if (!started) return;
    const environment = Object.fromEntries(['ready', 'busy', 'operation', 'stage', 'progress', 'message', 'error', 'download', 'model', 'device', 'computeType', 'hardwareChecked', 'gpu', 'ram', 'recommended', 'models', 'modelsChecked'].map(key => [key, value[key]]));
    const signature = JSON.stringify(environment);
    if (signature !== environmentSignature) { environmentSignature = signature; publish({ environment }); }
    const models = JSON.stringify([value.gpu, value.ram, value.device, value.computeType, value.hardwareChecked, value.recommended, value.models]);
    if (modelSignature && models !== modelSignature) void reload(false, true);
    modelSignature = models;
  }
  const store = {
    getSnapshot: () => snapshot, getSummary: () => summary, reload,
    subscribe(listener) {
      listeners.add(listener);
      if (!started) {
        started = true; modelSignature = ''; environmentSignature = '';
        const connection = ++epoch;
        offStore = adapter.modelStore.onChange(() => void reload(false, true));
        offEnvironment = adapter.onTranscriptionState(receive);
        adapter.getTranscriptionEnvironment().then(value=>{if(started&&connection===epoch)receive(value);}).catch(() => {});
        void reload(false, true).then(() => { if (started) void reload(); });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && started) { started = false; ++generation; ++epoch; offStore?.(); offEnvironment?.(); publish({ loading: false }); }
      };
    },
  };
  stores.set(adapter, store); return store;
}
