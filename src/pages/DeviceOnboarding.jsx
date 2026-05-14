import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Compass,
  LoaderCircle,
  MapPin,
  Router,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import LanguageToggle from '../components/ui/LanguageToggle';
import { AuthInput } from '../components/auth/AuthShell';
import {
  completeDeviceSetup,
  fetchDeviceSetupStatus,
  isSetupComplete,
  submitDeviceAccount,
  submitDeviceLocation,
  submitDeviceWifi,
} from '../services/deviceSetup';

const STEPS = ['hello', 'wifi', 'cloud', 'location', 'finish'];

function getStepState(index, currentStep) {
  if (index < currentStep) return 'done';
  if (index === currentStep) return 'active';
  return 'idle';
}

function StepPill({ index, currentStep, label }) {
  const state = getStepState(index, currentStep);

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm ${
      state === 'done'
        ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
        : state === 'active'
          ? 'border-sky-300/24 bg-sky-300/10 text-white'
          : 'border-white/10 bg-white/[0.04] text-slate-400'
    }`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-current/20 bg-black/20 text-xs font-semibold">
        {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function Notice({ tone = 'info', icon: IconComponent = AlertTriangle, children }) {
  const classes = {
    info: 'border-sky-300/18 bg-sky-300/10 text-sky-50',
    good: 'border-emerald-300/22 bg-emerald-300/10 text-emerald-50',
    warn: 'border-amber-300/22 bg-amber-300/10 text-amber-50',
    bad: 'border-rose-300/22 bg-rose-300/10 text-rose-50',
  };

  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${classes[tone]}`}>
      {createElement(IconComponent, { className: 'mt-0.5 h-4 w-4 shrink-0' })}
      <div>{children}</div>
    </div>
  );
}

function StatusCard({ title, value, body, tone = 'info' }) {
  const toneClass = {
    info: 'border-white/10 bg-white/[0.04]',
    good: 'border-emerald-300/20 bg-emerald-300/10',
    warn: 'border-amber-300/20 bg-amber-300/10',
    bad: 'border-rose-300/20 bg-rose-300/10',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{title}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {body ? <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div> : null}
    </div>
  );
}

function isFiniteCoordinate(value) {
  return Number.isFinite(Number(value));
}

export default function DeviceOnboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
  const [accountForm, setAccountForm] = useState({ email: '', password: '' });
  const [locationForm, setLocationForm] = useState({ latitude: '', longitude: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const stepLabels = ['Inicio', 'WiFi', 'Nube', 'Ubicación', 'Listo'];
  const cloudAvailable = Boolean(status?.cloud?.available);
  const wifiVerified = Boolean(status?.wifi?.verified);
  const cloudReady = Boolean(status?.cloud?.ready);
  const cloudSkipped = !cloudAvailable || Boolean(status?.cloud?.skipped);
  const locationSet = Boolean(status?.location?.set);
  const setupComplete = isSetupComplete(status);

  useEffect(() => {
    let active = true;
    let intervalId = 0;

    const loadStatus = async () => {
      try {
        const nextStatus = await fetchDeviceSetupStatus();
        if (!active) return;

        setStatus(nextStatus);
        setStatusError('');

        if (nextStatus?.location?.set) {
          setLocationForm({
            latitude: String(nextStatus.location.lat ?? ''),
            longitude: String(nextStatus.location.lon ?? ''),
          });
        }
      } catch {
        if (active) {
          setStatusError('Esperando a que el panel vuelva a abrir su red local.');
        }
      }
    };

    loadStatus();
    intervalId = window.setInterval(loadStatus, 3000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!status) return;

    if (setupComplete) {
      setCurrentStep(4);
      return;
    }

    if (!wifiVerified) {
      setCurrentStep((step) => Math.min(step, 1));
      return;
    }

    if (cloudAvailable && !cloudReady && !status.cloud?.error && currentStep < 2) {
      setCurrentStep(2);
      return;
    }

    if (!locationSet && currentStep < 3) {
      setCurrentStep(3);
    }
  }, [cloudAvailable, cloudReady, currentStep, locationSet, setupComplete, status, wifiVerified]);

  const canContinue = useMemo(() => {
    const stepId = STEPS[currentStep];

    if (stepId === 'hello') return true;
    if (stepId === 'wifi') return wifiVerified;
    if (stepId === 'cloud') return cloudReady || cloudSkipped;
    if (stepId === 'location') return locationSet;
    return true;
  }, [cloudReady, cloudSkipped, currentStep, locationSet, wifiVerified]);

  const refreshStatus = async () => {
    const nextStatus = await fetchDeviceSetupStatus();
    setStatus(nextStatus);
    return nextStatus;
  };

  const handleWifiSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!wifiForm.ssid.trim()) {
      setError('Escribe el nombre de la red WiFi de tu casa.');
      return;
    }

    setBusy('wifi');

    try {
      await submitDeviceWifi({
        ssid: wifiForm.ssid.trim(),
        password: wifiForm.password,
      });
      setMessage('El panel va a revisar esa red. Es normal que esta página se desconecte un momento; vuelve a la red HelioSync si tu teléfono no regresa solo.');
    } catch (requestError) {
      setError(requestError.message || 'No pudimos enviar la red al panel.');
    } finally {
      setBusy('');
    }
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!cloudAvailable) {
      setMessage('Este prototipo seguirá en modo local. Conserva 30 días de histórico y borra lo más antiguo automáticamente.');
      await refreshStatus();
      setCurrentStep(3);
      return;
    }

    if (!accountForm.email.trim() || accountForm.password.length < 8) {
      setError('Usa un correo válido y una contraseña de al menos 8 caracteres.');
      return;
    }

    setBusy('cloud');

    try {
      await submitDeviceAccount({
        email: accountForm.email.trim(),
        password: accountForm.password,
      });
      setMessage('Estamos creando tu acceso. La página puede desconectarse mientras el panel usa el WiFi de casa; vuelve a HelioSync en unos segundos.');
    } catch (requestError) {
      setError(requestError.message || 'No pudimos iniciar el registro.');
    } finally {
      setBusy('');
    }
  };

  const handleSkipCloud = async () => {
    setError('');
    setMessage('Modo local activado. HelioSync conservará hasta 30 días de histórico en el panel.');
    setCurrentStep(3);
  };

  const handleUseLocation = () => {
    setError('');
    setMessage('');

    if (!navigator.geolocation) {
      setError('Este navegador no permite leer ubicación. Puedes escribir latitud y longitud manualmente.');
      return;
    }

    setBusy('location');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        };

        setLocationForm(nextLocation);

        try {
          await submitDeviceLocation({
            lat: Number(nextLocation.latitude),
            lon: Number(nextLocation.longitude),
            source: 'phone',
          });
          await refreshStatus();
          setMessage('Ubicación guardada en el panel. No se sube a la nube.');
        } catch (requestError) {
          setError(requestError.message || 'No pudimos guardar la ubicación.');
        } finally {
          setBusy('');
        }
      },
      () => {
        setBusy('');
        setError('No pudimos leer la ubicación. Si el navegador la bloquea, escribe latitud y longitud manualmente.');
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  const handleManualLocationSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isFiniteCoordinate(locationForm.latitude) || !isFiniteCoordinate(locationForm.longitude)) {
      setError('Revisa latitud y longitud. Solo necesitamos esos dos datos.');
      return;
    }

    setBusy('location');

    try {
      await submitDeviceLocation({
        lat: Number(locationForm.latitude),
        lon: Number(locationForm.longitude),
        source: 'manual',
      });
      await refreshStatus();
      setMessage('Ubicación guardada en el panel. No se sube a la nube.');
    } catch (requestError) {
      setError(requestError.message || 'No pudimos guardar la ubicación.');
    } finally {
      setBusy('');
    }
  };

  const handleFinish = async () => {
    setBusy('finish');
    setError('');

    try {
      await completeDeviceSetup();
      await refreshStatus();
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'No pudimos finalizar la configuración.');
    } finally {
      setBusy('');
    }
  };

  const goNext = () => {
    setError('');
    setMessage('');
    setCurrentStep((step) => Math.min(step + 1, STEPS.length - 1));
  };

  const renderStep = () => {
    const stepId = STEPS[currentStep];

    if (stepId === 'hello') {
      return (
        <div className="space-y-5">
          <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-amber-200">
              <Compass className="h-5 w-5" />
            </div>
            <h2 className="m-0 mt-4 text-2xl font-semibold text-white">Accede a HelioSync</h2>
            <p className="m-0 mt-2 text-sm leading-6 text-slate-300">
              Ya estás conectado a la red del panel. Vamos a dejarlo listo para funcionar en casa, en campo y sin computadora externa.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard title="Red del panel" value={status?.ap?.ssid || 'HelioSync'} body="El QR de la etiqueta te trae aquí." />
            <StatusCard title="Histórico local" value="30 días" body="Si no hay nube, se borra lo más antiguo." />
            <StatusCard title="Ubicación" value="Solo local" body="Se usa para orientar el panel al sol." />
          </div>
        </div>
      );
    }

    if (stepId === 'wifi') {
      return (
        <form className="space-y-5" onSubmit={handleWifiSubmit}>
          <Notice icon={Wifi}>
            Conecta el panel al WiFi de tu casa solo para verificar internet y, si está disponible, sincronizar datos. El panel volverá a abrir su propia red HelioSync al terminar.
          </Notice>

          {status?.wifi?.verified ? (
            <Notice tone="good" icon={CheckCircle2}>
              Red verificada: {status.wifi.ssid}. El panel ya puede usarla cuando necesite salir a internet.
            </Notice>
          ) : null}

          {status?.wifi?.error ? (
            <Notice tone="bad">
              {status.wifi.error}
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label="Nombre de la red WiFi"
              type="text"
              autoComplete="off"
              placeholder="Mi WiFi"
              value={wifiForm.ssid}
              onChange={(event) => setWifiForm((current) => ({ ...current, ssid: event.target.value }))}
              required
            />
            <AuthInput
              label="Contraseña"
              type="password"
              autoComplete="off"
              placeholder="Contraseña del WiFi"
              value={wifiForm.password}
              onChange={(event) => setWifiForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={busy === 'wifi'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === 'wifi' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Router className="h-4 w-4" />}
            Probar red
          </button>
        </form>
      );
    }

    if (stepId === 'cloud') {
      return (
        <form className="space-y-5" onSubmit={handleAccountSubmit}>
          {!cloudAvailable ? (
            <Notice tone="warn" icon={Cloud}>
              Este firmware no trae Firebase configurado. No pasa nada: el panel funcionará en modo local y conservará 30 días de histórico en LittleFS.
            </Notice>
          ) : (
            <Notice icon={ShieldCheck}>
              El registro en la nube es opcional. Solo pedimos correo y contraseña para crear tu acceso; los datos de ubicación no se suben.
            </Notice>
          )}

          {status?.cloud?.ready ? (
            <Notice tone="good" icon={CheckCircle2}>
              Acceso creado para {status.cloud.email}. La sesión del panel quedó guardada.
            </Notice>
          ) : null}

          {status?.cloud?.error ? (
            <Notice tone="bad">
              {status.cloud.error}
            </Notice>
          ) : null}

          {cloudAvailable ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthInput
                label="Correo"
                type="email"
                autoComplete="email"
                placeholder="nombre@correo.com"
                value={accountForm.email}
                onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
              <AuthInput
                label="Contraseña"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                value={accountForm.password}
                onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            {cloudAvailable ? (
              <button
                type="submit"
                disabled={busy === 'cloud' || !wifiVerified}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === 'cloud' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                Crear acceso
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleSkipCloud}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              Seguir solo local
            </button>
          </div>
        </form>
      );
    }

    if (stepId === 'location') {
      return (
        <form className="space-y-5" onSubmit={handleManualLocationSubmit}>
          <Notice icon={MapPin}>
            La ubicación se guarda dentro del ESP32 para calcular la trayectoria solar. No se sube a Firebase.
          </Notice>

          {locationSet ? (
            <Notice tone="good" icon={CheckCircle2}>
              Ubicación lista: {Number(status.location.lat).toFixed(5)}, {Number(status.location.lon).toFixed(5)}.
            </Notice>
          ) : null}

          <button
            type="button"
            onClick={handleUseLocation}
            disabled={busy === 'location'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === 'location' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Usar ubicación del teléfono
          </button>

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label="Latitud"
              type="number"
              step="0.000001"
              placeholder="19.432608"
              value={locationForm.latitude}
              onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))}
            />
            <AuthInput
              label="Longitud"
              type="number"
              step="0.000001"
              placeholder="-99.133209"
              value={locationForm.longitude}
              onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={busy === 'location'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Guardar coordenadas
          </button>
        </form>
      );
    }

    return (
      <div className="space-y-5">
        <Notice tone="good" icon={CheckCircle2}>
          El panel está listo. Desde ahora puedes entrar al dashboard sin computadora externa: solo prende el prototipo, conéctate a su red y abre HelioSync.
        </Notice>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard title="WiFi externo" value={wifiVerified ? 'Verificado' : 'Pendiente'} tone={wifiVerified ? 'good' : 'warn'} />
          <StatusCard title="Nube" value={cloudReady ? 'Activa' : 'Modo local'} tone={cloudReady ? 'good' : 'info'} />
          <StatusCard title="Tracking solar" value={locationSet ? 'Con ubicación' : 'Sin ubicación'} tone={locationSet ? 'good' : 'warn'} />
        </div>

        <button
          type="button"
          onClick={handleFinish}
          disabled={busy === 'finish' || !locationSet}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {busy === 'finish' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Entrar al dashboard
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen glass-mesh-bg px-3 py-4 sm:px-5 sm:py-6 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
              <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
              HelioSync
            </div>
            <h1 className="m-0 mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Configuración inicial</h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Hecho para usuarios que solo quieren prender el panel, conectarse y verlo funcionar.
            </p>
          </div>
          <LanguageToggle />
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr]">
          <aside className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="grid gap-3">
              {stepLabels.map((label, index) => (
                <StepPill key={label} label={label} index={index} currentStep={currentStep} />
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Estado actual</div>
              <div className="mt-3 grid gap-3">
                <StatusCard title="AP" value={status?.ap?.ssid || 'HelioSync'} body={statusError || 'Red local del panel activa.'} />
                <StatusCard title="LittleFS" value={`${status?.storage?.days_stored ?? 0}/30 días`} body={status?.storage?.near_full ? 'Memoria cerca del límite.' : 'Histórico local listo.'} tone={status?.storage?.near_full ? 'warn' : 'info'} />
              </div>
            </div>
          </aside>

          <main className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="space-y-4">
              {statusError ? <Notice tone="warn">{statusError}</Notice> : null}
              {message ? <Notice tone="good" icon={CheckCircle2}>{message}</Notice> : null}
              {error ? <Notice tone="bad">{error}</Notice> : null}

              {renderStep()}
            </div>

            {currentStep < STEPS.length - 1 ? (
              <div className="mt-6 flex justify-end border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canContinue}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
