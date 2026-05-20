import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseMockConfig } from './firebase';

const MOCK_USERS_KEY = 'heliosync:mock-users';
const MOCK_SESSION_KEY = 'heliosync:mock-session';
const SESSION_LOGIN_AT_KEY = 'heliosync:login-at';
const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000; // 90 días
const mockListeners = new Set();
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});

let persistencePromise;

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function readMockUsers() {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    return JSON.parse(storage.getItem(MOCK_USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveMockUsers(users) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

function buildMockSession(user) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    providerData: [{ providerId: user.provider }],
    metadata: {
      creationTime: user.createdAt,
    },
  };
}

function readMockSession() {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(MOCK_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMockSession(user) {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  if (!user) {
    storage.removeItem(MOCK_SESSION_KEY);
    return null;
  }

  const session = buildMockSession(user);
  storage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  return session;
}

function emitMockSession(user) {
  mockListeners.forEach((listener) => {
    listener(user);
  });
}

function getProviderId(user) {
  return user?.providerData?.[0]?.providerId || 'password';
}

function buildFirebaseUser(user) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    providerData: user.providerData,
    metadata: user.metadata,
  };
}

export function ensureAuthPersistence() {
  if (isFirebaseMockConfig) {
    return Promise.resolve();
  }

  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence);
  }

  return persistencePromise;
}

export function subscribeToSession(callback) {
  if (isFirebaseMockConfig) {
    callback(readMockSession());
    mockListeners.add(callback);

    return () => {
      mockListeners.delete(callback);
    };
  }

  let unsubscribe = () => {};
  let active = true;

  ensureAuthPersistence()
    .then(() => {
      if (!active) {
        return;
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          callback(null);
          return;
        }

        // Verificar expiración de 3 meses
        const storage = getLocalStorage();
        const loginAt = Number(storage?.getItem(SESSION_LOGIN_AT_KEY) || 0);
        if (loginAt > 0 && Date.now() - loginAt > SESSION_MAX_MS) {
          storage?.removeItem(SESSION_LOGIN_AT_KEY);
          await signOut(auth);
          callback(null);
          return;
        }
        // Registrar primera vez
        if (!loginAt) {
          storage?.setItem(SESSION_LOGIN_AT_KEY, String(Date.now()));
        }

        callback(buildFirebaseUser(user));
      });
    })
    .catch(() => {
      if (active) {
        callback(null);
      }
    });

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function signInWithEmail({ email, password }) {
  if (isFirebaseMockConfig) {
    const users = readMockUsers();
    const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());

    if (!user || user.password !== password) {
      const error = new Error('Invalid credentials');
      error.code = 'auth/invalid-credential';
      throw error;
    }

    const session = writeMockSession(user);
    emitMockSession(session);
    return session;
  }

  await ensureAuthPersistence();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return buildFirebaseUser(credential.user);
}

export async function registerWithEmail({ displayName, email, password }) {
  if (isFirebaseMockConfig) {
    const users = readMockUsers();
    const existing = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());

    if (existing) {
      const error = new Error('Email already in use');
      error.code = 'auth/email-already-in-use';
      throw error;
    }

    const user = {
      uid: `mock_${crypto.randomUUID()}`,
      displayName: displayName.trim(),
      email: email.trim(),
      password,
      provider: 'password',
      createdAt: new Date().toISOString(),
    };

    saveMockUsers([...users, user]);
    const session = writeMockSession(user);
    emitMockSession(session);
    return session;
  }

  await ensureAuthPersistence();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName.trim()) {
    await updateProfile(credential.user, {
      displayName: displayName.trim(),
    });
  }

  return buildFirebaseUser(auth.currentUser || credential.user);
}

export async function signInWithGoogle() {
  if (isFirebaseMockConfig) {
    const users = readMockUsers();
    const mockEmail = 'demo.google@heliosync.mock';
    const existing = users.find((entry) => entry.email === mockEmail);

    const user = existing || {
      uid: `mock_google_${crypto.randomUUID()}`,
      displayName: 'Solar User',
      email: mockEmail,
      password: null,
      provider: 'google.com',
      createdAt: new Date().toISOString(),
    };

    if (!existing) {
      saveMockUsers([...users, user]);
    }

    const session = writeMockSession(user);
    emitMockSession(session);
    return session;
  }

  await ensureAuthPersistence();
  const credential = await signInWithPopup(auth, googleProvider);
  return buildFirebaseUser(credential.user);
}

export async function sendPasswordReset(email) {
  if (isFirebaseMockConfig) {
    const users = readMockUsers();
    const existing = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());

    if (!existing) {
      const error = new Error('User not found');
      error.code = 'auth/user-not-found';
      throw error;
    }

    return { simulated: true };
  }

  await ensureAuthPersistence();
  await sendPasswordResetEmail(auth, email);
  return { simulated: false };
}

export async function signOutUser() {
  if (isFirebaseMockConfig) {
    writeMockSession(null);
    emitMockSession(null);
    return;
  }

  getLocalStorage()?.removeItem(SESSION_LOGIN_AT_KEY);
  await signOut(auth);
}

export async function updateCurrentUserDisplayName(displayName) {
  if (!displayName.trim()) {
    return null;
  }

  if (isFirebaseMockConfig) {
    const session = readMockSession();
    const users = readMockUsers();

    if (!session) {
      return null;
    }

    const updatedUsers = users.map((entry) => (
      entry.uid === session.uid
        ? { ...entry, displayName: displayName.trim() }
        : entry
    ));

    saveMockUsers(updatedUsers);
    const currentUser = updatedUsers.find((entry) => entry.uid === session.uid);
    const nextSession = writeMockSession(currentUser);
    emitMockSession(nextSession);
    return nextSession;
  }

  if (!auth.currentUser) {
    return null;
  }

  await updateProfile(auth.currentUser, { displayName: displayName.trim() });
  return buildFirebaseUser(auth.currentUser);
}

export function getAuthProvider(user) {
  const providerId = getProviderId(user);

  if (providerId === 'google.com') {
    return 'google';
  }

  return 'password';
}
