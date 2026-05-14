const STORAGE_NOTICE_KEY = 'heliosync:last-storage-pressure-notice';
const NOTICE_INTERVAL_MS = 12 * 60 * 60 * 1000;

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function shouldNotify() {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const lastNoticeAt = Number(storage.getItem(STORAGE_NOTICE_KEY) || 0);
  return Date.now() - lastNoticeAt > NOTICE_INTERVAL_MS;
}

function markNotified() {
  const storage = getStorage();
  storage?.setItem(STORAGE_NOTICE_KEY, String(Date.now()));
}

export async function notifyStoragePressure(storageState) {
  if (!storageState?.near_full || !shouldNotify()) {
    return;
  }

  markNotified();

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  const body = storageState.cloud_ready
    ? 'Conecta el panel a internet para respaldar el histórico antes de que se roten datos antiguos.'
    : `El panel conserva ${storageState.retention_days || 30} días y después elimina lo más antiguo.`;

  try {
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

    if (permission === 'granted') {
      new Notification('HelioSync: memoria casi llena', {
        body,
        tag: 'heliosync-storage-pressure',
      });
    }
  } catch {
    // Browsers usually block notifications on local HTTP origins. The dashboard banner remains visible.
  }
}
