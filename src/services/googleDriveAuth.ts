import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Enable persistent local auth state
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[Google Auth] Could not set browser local persistence:', err);
});

export const WORKSPACE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const provider = new GoogleAuthProvider();
WORKSPACE_DRIVE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

const STORAGE_SESSION_KEY = 'umer_google_drive_auth_session';
const TOKEN_MAX_AGE_MS = 55 * 60 * 1000; // 55 minutes (Google OAuth tokens expire in 60 mins)

interface PersistedSession {
  accessToken: string;
  email: string | null;
  displayName: string | null;
  uid: string;
  savedAt: number;
}

/**
 * Checks if a session has exceeded the token time-to-live
 */
export const isSessionExpired = (savedAt?: number): boolean => {
  if (!savedAt) return true;
  return Date.now() - savedAt > TOKEN_MAX_AGE_MS;
};

/**
 * Clears expired or invalid token cache from memory and storage
 */
export const clearExpiredSession = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  } catch {}
};

// In-memory token cache backed by persistent localStorage with TTL validation
let isSigningIn = false;
let cachedAccessToken: string | null = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed: PersistedSession = JSON.parse(raw);
      if (parsed && parsed.accessToken && !isSessionExpired(parsed.savedAt)) {
        return parsed.accessToken;
      } else {
        clearExpiredSession();
      }
    }
  } catch (e) {}
  return null;
})();

export const getPersistedUser = (): { email: string | null; displayName: string | null } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed: PersistedSession = JSON.parse(raw);
      if (parsed && !isSessionExpired(parsed.savedAt)) {
        return { email: parsed.email, displayName: parsed.displayName };
      }
    }
  } catch (e) {}
  return null;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    let validToken: string | null = null;
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      try {
        const parsed: PersistedSession = JSON.parse(raw);
        if (parsed?.accessToken && !isSessionExpired(parsed.savedAt)) {
          validToken = parsed.accessToken;
          cachedAccessToken = validToken;
        } else {
          clearExpiredSession();
        }
      } catch (e) {}
    }

    if (user && validToken) {
      if (onAuthSuccess) onAuthSuccess(user, validToken);
      return;
    }

    if (!isSigningIn && !validToken) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google Drive access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;

    // Persist session to localStorage so it stays signed in across reloads/devices
    try {
      const sessionData: PersistedSession = {
        accessToken: cachedAccessToken,
        email: result.user.email,
        displayName: result.user.displayName,
        uid: result.user.uid,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('[Google Auth] Could not persist session to localStorage:', e);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed: PersistedSession = JSON.parse(raw);
      if (parsed?.accessToken) {
        if (isSessionExpired(parsed.savedAt)) {
          clearExpiredSession();
          return null;
        }
        cachedAccessToken = parsed.accessToken;
        return parsed.accessToken;
      }
    }
  } catch (e) {}
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    try {
      const existing = localStorage.getItem(STORAGE_SESSION_KEY);
      const parsed = existing ? JSON.parse(existing) : {};
      parsed.accessToken = token;
      parsed.savedAt = Date.now();
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(parsed));
    } catch (e) {}
  }
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('[Google Auth] Signout warning:', e);
  }
  cachedAccessToken = null;
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  } catch (e) {}
};
