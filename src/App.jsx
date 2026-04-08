import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from './components/ui/AppLoader';
import { useHelioStore } from './store/useHelioStore';
import { getAuthProvider, subscribeToSession } from './services/authClient';
import { getUserSetup, syncUserProfileFromSession } from './services/userData';
import { useLocale } from './i18n/locale';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Register = lazy(() => import('./pages/Register'));

function resolveUserPath(session, userSetup) {
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

export default function App() {
  const authReady = useHelioStore((state) => state.authReady);
  const setAuthReady = useHelioStore((state) => state.setAuthReady);
  const setSession = useHelioStore((state) => state.setSession);
  const setUserProfile = useHelioStore((state) => state.setUserProfile);
  const setUserSetup = useHelioStore((state) => state.setUserSetup);
  const clearUserContext = useHelioStore((state) => state.clearUserContext);
  const session = useHelioStore((state) => state.session);
  const userSetup = useHelioStore((state) => state.userSetup);

  useEffect(() => {
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
  }, [clearUserContext, setAuthReady, setSession, setUserProfile, setUserSetup]);

  if (!authReady) {
    return <RouteLoader />;
  }

  return (
    <Suspense fallback={<RouteLoader />}>
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
    </Suspense>
  );
}
