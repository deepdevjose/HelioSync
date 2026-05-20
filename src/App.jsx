import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from './components/ui/AppLoader';
import { useHelioStore } from './store/useHelioStore';
import { getAuthProvider, subscribeToSession } from './services/authClient';
import { fetchDeviceAuthStatus, fetchDeviceSetupStatus, isSetupComplete } from './services/deviceSetup';
import { getUserSetup, syncUserProfileFromSession } from './services/userData';
import { useLocale } from './i18n/locale';
import { isDevicePortalOrigin, isWebAuthRequired } from './config/runtime';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const DeviceOnboarding = lazy(() => import('./pages/DeviceOnboarding'));
const DeviceLogin = lazy(() => import('./pages/DeviceLogin'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Register = lazy(() => import('./pages/Register'));

function resolveUserPath(session, userSetup) {
  if (!isWebAuthRequired()) {
    return '/dashboard';
  }

  if (!session) {
    return '/login';
  }

  if (userSetup?.onboardingCompleted) {
    return '/dashboard';
  }

  return '/onboarding';
}

function AuthOnlyRoute({ children }) {
  const session = useHelioStore((state) => state.session);
  const userSetup = useHelioStore((state) => state.userSetup);

  if (session) {
    return <Navigate to={resolveUserPath(session, userSetup)} replace />;
  }

  return children;
}

function OnboardingRoute({ children }) {
  const session = useHelioStore((state) => state.session);
  const userSetup = useHelioStore((state) => state.userSetup);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (userSetup?.onboardingCompleted) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function DashboardRoute({ children }) {
  const session = useHelioStore((state) => state.session);
  const userSetup = useHelioStore((state) => state.userSetup);

  if (!isWebAuthRequired()) {
    return children;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!userSetup?.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

function RouteLoader() {
  const { t } = useLocale();

  return (
    <AppLoader
      title={t('routeLoader.title')}
      message={t('routeLoader.message')}
    />
  );
}

function DeviceRootRedirect() {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let active = true;

    fetchDeviceAuthStatus()
      .then(async (authStatus) => {
        if (authStatus?.account_required && !authStatus?.authenticated) {
          return '/device-login';
        }

        const status = await fetchDeviceSetupStatus();
        if (!authStatus?.local_account_ready) {
          return '/setup';
        }

        return isSetupComplete(status) ? '/dashboard' : '/setup';
      })
      .then((nextTarget) => {
        if (active) {
          setTarget(nextTarget);
        }
      })
      .catch(() => {
        if (active) {
          setTarget('/device-login');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!target) {
    return <RouteLoader />;
  }

  return <Navigate to={target} replace />;
}

function DeviceAuthRoute({ children, requireLocalAccount = false }) {
  const [redirect, setRedirect] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    fetchDeviceAuthStatus()
      .then((authStatus) => {
        if (!active) {
          return;
        }

        if (authStatus?.account_required && !authStatus?.authenticated) {
          setRedirect('/device-login');
        } else if (requireLocalAccount && !authStatus?.local_account_ready) {
          setRedirect('/setup');
        } else {
          setRedirect('');
        }

        setReady(true);
      })
      .catch(() => {
        if (active) {
          setRedirect('/device-login');
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [requireLocalAccount]);

  if (!ready) {
    return <RouteLoader />;
  }

  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  return children;
}

export default function App() {
  const authReady = useHelioStore((state) => state.authReady);
  const setAuthReady = useHelioStore((state) => state.setAuthReady);
  const setSession = useHelioStore((state) => state.setSession);
  const setUserProfile = useHelioStore((state) => state.setUserProfile);
  const setUserSetup = useHelioStore((state) => state.setUserSetup);
  const clearUserContext = useHelioStore((state) => state.clearUserContext);
  const session = useHelioStore((state) => state.session);
  const userSetup = useHelioStore((state) => state.userSetup);
  const devicePortal = isDevicePortalOrigin();

  useEffect(() => {
    if (devicePortal) {
      setAuthReady(true);
      return undefined;
    }

    if (!isWebAuthRequired()) {
      setAuthReady(true);
      return undefined;
    }

    const unsubscribe = subscribeToSession(async (user) => {
      setAuthReady(false);

      if (!user) {
        clearUserContext();
        setAuthReady(true);
        return;
      }

      setSession(user);

      try {
        const [profile, setup] = await Promise.all([
          syncUserProfileFromSession(user),
          getUserSetup(user.uid),
        ]);

        setUserProfile(profile);
        setUserSetup(setup);
      } catch (userContextError) {
        console.error('Failed to sync user context from Firebase.', userContextError);
        setUserProfile({
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          provider: getAuthProvider(user),
          createdAt: user.metadata?.creationTime || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setUserSetup(null);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [clearUserContext, devicePortal, setAuthReady, setSession, setUserProfile, setUserSetup]);

  if (!authReady) {
    return <RouteLoader />;
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      {devicePortal ? (
        <Routes>
          <Route path="/" element={<DeviceRootRedirect />} />
          <Route path="/device-login" element={<DeviceLogin />} />
          <Route
            path="/setup"
            element={(
              <DeviceAuthRoute>
                <DeviceOnboarding />
              </DeviceAuthRoute>
            )}
          />
          <Route
            path="/dashboard"
            element={(
              <DeviceAuthRoute requireLocalAccount>
                <Dashboard />
              </DeviceAuthRoute>
            )}
          />
          <Route path="*" element={<DeviceRootRedirect />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/" element={<Navigate to={resolveUserPath(session, userSetup)} replace />} />
        <Route
          path="/login"
          element={(
            <AuthOnlyRoute>
              <Login />
            </AuthOnlyRoute>
          )}
        />
        <Route
          path="/register"
          element={(
            <AuthOnlyRoute>
              <Register />
            </AuthOnlyRoute>
          )}
        />
        <Route
          path="/forgot-password"
          element={(
            <AuthOnlyRoute>
              <ForgotPassword />
            </AuthOnlyRoute>
          )}
        />
        <Route
          path="/onboarding"
          element={(
            <OnboardingRoute>
              <Onboarding />
            </OnboardingRoute>
          )}
        />
        <Route
          path="/dashboard"
          element={(
            <DashboardRoute>
              <Dashboard />
            </DashboardRoute>
          )}
        />
        <Route path="*" element={<Navigate to={resolveUserPath(session, userSetup)} replace />} />
        </Routes>
      )}
    </Suspense>
  );
}
