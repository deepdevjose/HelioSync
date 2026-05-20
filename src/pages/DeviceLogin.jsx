import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AuthInput } from '../components/auth/AuthShell';
import {
  fetchDeviceAuthStatus,
  fetchDeviceSetupStatus,
  isSetupComplete,
  signInDevicePortal,
} from '../services/deviceSetup';

export default function DeviceLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [knownUser, setKnownUser] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const goToDeviceHome = useCallback(async () => {
    const status = await fetchDeviceSetupStatus();
    navigate(isSetupComplete(status) ? '/dashboard' : '/setup', { replace: true });
  }, [navigate]);

  useEffect(() => {
    let active = true;

    fetchDeviceAuthStatus()
      .then(async (authStatus) => {
        if (!active) return;

        setKnownUser(authStatus?.username || '');
        setForm((current) => ({ ...current, username: current.username || authStatus?.username || '' }));

        if (!authStatus?.local_account_ready) {
          navigate('/setup', { replace: true });
          return;
        }

        if (!authStatus?.account_required || authStatus?.authenticated) {
          await goToDeviceHome();
          return;
        }

        setChecking(false);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos revisar tu acceso. Verifica que sigas conectado a la red HelioSync.');
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [goToDeviceHome, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await signInDevicePortal({
        username: form.username.trim(),
        password: form.password,
      });
      await goToDeviceHome();
    } catch (requestError) {
      setError(requestError.message || 'Usuario o contraseña incorrectos.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen glass-mesh-bg px-3 py-4 sm:px-5 sm:py-6 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col justify-center gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
              <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
              HelioSync
            </div>
            <h1 className="m-0 mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Acceso del panel</h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Esta contraseña protege la pantalla principal dentro de la red del panel y se mantiene por 3 meses en este teléfono.
            </p>
          </div>
        </header>

        <main className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[24px] border border-white/10 bg-slate-950/60 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="mt-4 text-xl font-semibold text-white">Protección del panel</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              La cuenta se guarda en el panel. Si también conectaste la NUBE, usa ese mismo correo cuando tengas internet.
            </p>
            {knownUser ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Correo guardado</div>
                <div className="mt-2 text-sm font-medium text-white">{knownUser}</div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-6">
            {checking ? (
              <div className="flex min-h-[260px] items-center justify-center gap-3 text-sm text-slate-300">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                Revisando acceso...
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {error ? (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                <AuthInput
                  label="Usuario o correo"
                  type="text"
                  autoComplete="username"
                  placeholder="nombre@correo.com"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  required
                />

                <div className="relative">
                  <AuthInput
                    label="Contraseña"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Contraseña del panel"
                    className="pr-12"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className="absolute bottom-2.5 right-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                  Entrar al panel
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
