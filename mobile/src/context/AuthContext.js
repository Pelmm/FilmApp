import { createContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getCurrentUser, loginUser } from '../services/api';

export const AuthContext = createContext(null);
const SESSION_KEY = 'filmapp.session';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [message, setMessage] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const currentSession = useRef(null);
  currentSession.current = session;

  useEffect(() => {
    const controller = new AbortController();

    async function restoreSession() {
      setRestoring(true);
      setMessage('');
      setCanRetry(false);

      try {
        const stored = await SecureStore.getItemAsync(SESSION_KEY);
        if (controller.signal.aborted) {
          return;
        }
        if (!stored) {
          return;
        }

        let saved;
        try {
          saved = JSON.parse(stored);
        } catch {
          saved = null;
        }

        if (
          typeof saved?.token !== 'string' ||
          !saved.token ||
          !Number.isFinite(Date.parse(saved.expiresAt))
        ) {
          await SecureStore.deleteItemAsync(SESSION_KEY);
          if (!controller.signal.aborted) {
            setSession(null);
            setMessage('Den sparade sessionen är ogiltig. Logga in igen.');
          }
          return;
        }
        if (Date.parse(saved.expiresAt) <= Date.now()) {
          await SecureStore.deleteItemAsync(SESSION_KEY);
          if (!controller.signal.aborted) {
            setSession(null);
            setMessage('Din session har gått ut. Logga in igen.');
          }
          return;
        }

        const user = await getCurrentUser(saved.token, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setSession({ token: saved.token, expiresAt: saved.expiresAt, user });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error.status === 401) {
          setSession(null);
          setMessage('Sessionen är ogiltig eller har gått ut. Logga in igen.');
          try {
            await SecureStore.deleteItemAsync(SESSION_KEY);
          } catch {
            setMessage('Sessionen är ogiltig men kunde inte raderas. Försök igen.');
            setCanRetry(true);
          }
        } else {
          // Behåll SecureStore-innehållet när servern eller lagringen inte kan nås.
          setMessage('Kunde inte återställa sessionen. Din sparade inloggning behålls. Försök igen.');
          setCanRetry(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setRestoring(false);
        }
      }
    }

    restoreSession();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!session) {
      return;
    }

    function expireSession() {
      return invalidateSession(session.token);
    }

    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timeout = setTimeout(expireSession, Math.max(0, remaining));
    // Timers kan pausas i bakgrunden. Kontrollera tiden även när appen åter öppnas.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() >= Date.parse(session.expiresAt)) {
        expireSession();
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [session]);

  async function invalidateSession(rejectedToken) {
    // Ett sent 401-svar från en gammal session får inte logga ut en ny användare.
    if (currentSession.current?.token !== rejectedToken) {
      return;
    }
    setSession(null);
    setMessage('Sessionen är ogiltig eller har gått ut. Logga in igen.');
    if (busy.current) {
      return;
    }
    busy.current = true;

    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      setMessage('Sessionen är ogiltig men kunde inte raderas. Försök igen.');
      setCanRetry(true);
    } finally {
      busy.current = false;
    }
  }

  async function signIn(credentials, options) {
    if (busy.current) {
      throw new Error('En sessionsåtgärd pågår. Försök igen.');
    }
    busy.current = true;

    try {
      const data = await loginUser(credentials, options);
      if (options?.signal?.aborted) {
        return;
      }
      if (Date.parse(data.expiresAt) <= Date.now()) {
        throw new Error('Din session har gått ut. Logga in igen.');
      }

      try {
        // Även utgångstiden sparas säkert, så att ingen JWT-avkodare behövs i appen.
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({
          token: data.token,
          expiresAt: data.expiresAt,
        }));
      } catch {
        throw new Error('Kunde inte spara inloggningen säkert. Försök igen.');
      }

      if (options?.signal?.aborted || Date.parse(data.expiresAt) <= Date.now()) {
        try {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        } catch {
          throw new Error('Den avbrutna inloggningen kunde inte raderas. Försök igen.');
        }
        return;
      }
      setSession(data);
      setMessage('');
      setCanRetry(false);
    } finally {
      busy.current = false;
    }
  }

  async function signOut() {
    if (busy.current) {
      throw new Error('En sessionsåtgärd pågår. Försök igen.');
    }
    busy.current = true;

    try {
      try {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } catch {
        throw new Error('Kunde inte logga ut säkert. Försök igen.');
      }
      setSession(null);
      setMessage('');
      setCanRetry(false);
    } finally {
      busy.current = false;
    }
  }

  function retryRestore() {
    if (busy.current) {
      return;
    }
    setRestoring(true);
    setAttempt((current) => current + 1);
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        token: session?.token || null,
        isAuthenticated: Boolean(session) && Date.parse(session.expiresAt) > Date.now(),
        restoring,
        message,
        canRetry,
        retryRestore,
        signIn,
        signOut,
        invalidateSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
