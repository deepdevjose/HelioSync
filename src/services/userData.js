import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseMockConfig } from './firebase';
import { getAuthProvider } from './authClient';

const USER_PROFILE_KEY_PREFIX = 'heliosync:user-profile:';
const USER_SETUP_KEY_PREFIX = 'heliosync:user-setup:';

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function readLocalDocument(key) {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeLocalDocument(key, value) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    );
  }

  return value;
}

function getProfileKey(uid) {
  return `${USER_PROFILE_KEY_PREFIX}${uid}`;
}

function getSetupKey(uid) {
  return `${USER_SETUP_KEY_PREFIX}${uid}`;
}

function getNowIso() {
  return new Date().toISOString();
}

function buildLocationLabel(location = {}) {
  if (location.label) {
    return location.label;
  }

  const pieces = [location.city, location.region, location.country].filter(Boolean);

  if (pieces.length) {
    return pieces.join(', ');
  }

  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`;
  }

  return '';
}

export function getModePresentation(mode) {
  return mode === 'tracking'
    ? {
        telemetryMode: 'TRACKING',
        metaMode: 'tracking',
        diagnosticsProfile: 'single_axis_tracking',
      }
    : {
        telemetryMode: 'STATIC',
        metaMode: 'static',
        diagnosticsProfile: 'guided_static_alignment',
      };
}

export function applySetupToTelemetry(data, setup) {
  if (!setup) {
    return data;
  }

  const locationLabel = buildLocationLabel(setup.location) || data.meta.location;
  const modePresentation = getModePresentation(setup.operatingMode);
  const nextAngle = setup.staticOrientation?.initialAlignmentDeg;

  return {
    ...data,
    meta: {
      ...data.meta,
      location: locationLabel,
      mode: modePresentation.metaMode,
    },
    panel: {
      ...data.panel,
      tracking_mode: modePresentation.telemetryMode,
      angle_target_deg: Number.isFinite(nextAngle) ? nextAngle : data.panel.angle_target_deg,
      servo_active: setup.operatingMode === 'tracking' ? data.panel.servo_active : false,
    },
    diagnostics: {
      ...data.diagnostics,
      profile: modePresentation.diagnosticsProfile,
      simulation: data.diagnostics.simulation,
    },
  };
}

export async function syncUserProfileFromSession(user) {
  if (!user) {
    return null;
  }

  const now = getNowIso();
  const baseProfile = {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    provider: getAuthProvider(user),
    createdAt: user.metadata?.creationTime || now,
    updatedAt: now,
  };

  if (isFirebaseMockConfig) {
    const existing = readLocalDocument(getProfileKey(user.uid));
    const nextProfile = {
      ...existing,
      ...baseProfile,
      createdAt: existing?.createdAt || baseProfile.createdAt,
    };
    writeLocalDocument(getProfileKey(user.uid), nextProfile);
    return nextProfile;
  }

  const ref = doc(db, 'users', user.uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const nextProfile = {
    ...existing,
    ...baseProfile,
    createdAt: existing?.createdAt || baseProfile.createdAt,
  };

  await setDoc(ref, nextProfile, { merge: true });
  return nextProfile;
}

export async function updateUserProfileData(uid, patch) {
  if (!uid) {
    return null;
  }

  const now = getNowIso();
  const safePatch = stripUndefinedDeep(patch);

  if (isFirebaseMockConfig) {
    const existing = readLocalDocument(getProfileKey(uid)) || { uid, createdAt: now };
    const nextProfile = {
      ...existing,
      ...safePatch,
      uid,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    writeLocalDocument(getProfileKey(uid), nextProfile);
    return nextProfile;
  }

  const ref = doc(db, 'users', uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : { uid, createdAt: now };
  const nextProfile = {
    ...existing,
    ...safePatch,
    uid,
    updatedAt: now,
    createdAt: existing.createdAt || now,
  };

  await setDoc(ref, nextProfile, { merge: true });
  return nextProfile;
}

export async function getUserSetup(uid) {
  if (!uid) {
    return null;
  }

  if (isFirebaseMockConfig) {
    return readLocalDocument(getSetupKey(uid));
  }

  const ref = doc(db, 'userSetups', uid);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserSetup(uid, setup) {
  if (!uid) {
    return null;
  }

  const now = getNowIso();
  const safeSetup = stripUndefinedDeep(setup);

  if (isFirebaseMockConfig) {
    const existing = readLocalDocument(getSetupKey(uid));
    const nextSetup = {
      ...existing,
      ...safeSetup,
      uid,
      setupCompleted: true,
      onboardingCompleted: true,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };
    writeLocalDocument(getSetupKey(uid), nextSetup);
    return nextSetup;
  }

  const ref = doc(db, 'userSetups', uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const nextSetup = {
    ...existing,
    ...safeSetup,
    uid,
    setupCompleted: true,
    onboardingCompleted: true,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
  };

  await setDoc(ref, nextSetup, { merge: true });
  return nextSetup;
}
