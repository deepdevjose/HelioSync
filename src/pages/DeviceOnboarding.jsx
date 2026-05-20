import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Compass,
  Eye,
  EyeOff,
  LoaderCircle,
  MapPin,
  Router,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { AuthInput } from '../components/auth/AuthShell';
import {
  completeDeviceSetup,
  continueDeviceSetupOffline,
  fetchDeviceSetupStatus,
  isSetupComplete,
  submitDeviceAccount,
  submitDeviceLocation,
  submitDeviceOperationMode,
  submitDeviceWifi,
} from '../services/deviceSetup';

const DEFAULT_HELTEC_MAC = '10:51:DB:52:8B:B4';
const STEPS = ['hello', 'mode', 'wifi', 'cloud', 'location', 'finish'];

const DEVICE_ONBOARDING_COPY = {
  'es-MX': {
    showPassword: 'Ver contraseña',
    hidePassword: 'Ocultar contraseña',
    steps: ['Inicio', 'Uso', 'Internet', 'Acceso', 'Ubicación', 'Listo'],
    modeRequired: 'Elige cómo vas a usar tu panel antes de continuar.',
    modeSaved: 'Listo. Guardamos cómo usarás tu panel.',
    modeFailed: 'No pudimos guardar el modo de uso.',
    modeTesting: 'Estamos comprobando la tarjeta de pared. La red del panel puede apagarse unos segundos.',
    modeTestOk: 'La tarjeta de pared respondió. Ya puedes seguir con la configuración.',
    modeTestFailed: 'La tarjeta de pared no respondió. Revisa que esté encendida y que el código sea correcto.',
    bridgeInitialMessage: 'Estamos enviando la primera lectura a la tarjeta de pared. La red del panel puede apagarse unos segundos antes de abrir la pantalla principal.',
    bridgeInitialFailed: 'No pudimos confirmar la primera lectura con la tarjeta de pared. Revisa que esté encendida y que el código sea el que aparece en su pantalla.',
    outdoorTitle: 'Campamento',
    outdoorBody: 'Para llevarlo fuera de casa o usarlo sin internet. No tienes que preparar otra tarjeta; el panel guarda hasta 30 días y trabaja solo.',
    indoorTitle: 'Casa o azotea',
    indoorBody: 'Para dejarlo fijo en casa. Escribe el código de la tarjeta de pared para que el panel mande sus lecturas sin ocupar tu internet.',
    heltecMacLabel: 'Pon el código que te muestra la pantalla en la tarjeta que tienes instalada en tu pared.',
    heltecMacPlaceholder: 'Código de la pantalla',
    saveMode: 'Guardar uso',
    panelNotResponding: 'El panel no responde. Asegúrate de seguir conectado a la red HelioSync.',
    panelReconnecting: 'El panel está cambiando de red. Espera unos segundos; si tu teléfono se desconecta, vuelve a entrar a la red HelioSync.',
    wifiNameRequired: 'Escribe el nombre de la red de tu casa.',
    wifiTesting: 'El panel está probando esa red. La página puede desconectarse un momento. Si no vuelve sola, reconéctate a la red HelioSync.',
    wifiRequestFailed: 'No pudimos enviar la red al panel.',
    offlineEnabled: 'Modo sin internet activado. El panel seguirá funcionando y guardará hasta 30 días de historial.',
    offlineFailed: 'No pudimos activar el modo sin internet.',
    invalidAccount: 'Usa un correo válido y una contraseña de al menos 8 caracteres.',
    accountCloudMessage: 'Guardamos tu acceso en el panel y estamos intentando conectar esa misma cuenta con la NUBE. La página puede desconectarse un momento.',
    accountLocalMessage: 'Acceso creado. Este correo y contraseña protegen la pantalla principal del panel.',
    accountFailed: 'No pudimos iniciar el registro.',
    geoUnsupported: 'Este teléfono no compartió ubicación. Puedes escribir los dos números manualmente.',
    locationSaved: 'Ubicación guardada en el panel. No se sube a la NUBE.',
    locationFailed: 'No pudimos guardar la ubicación.',
    geoDenied: 'No pudimos leer la ubicación. Si tu teléfono la bloquea, escribe los dos números manualmente.',
    invalidCoordinates: 'Revisa los dos números de ubicación. Solo necesitamos esos datos.',
    finishFailed: 'No pudimos finalizar la configuración.',
    helloTitle: 'Accede a HelioSync',
    helloBody: 'Ya estás conectado a tu panel solar. Desliza hacia abajo para comenzar tu configuración.',
    panelNetwork: 'Red del panel',
    panelNetworkReady: 'Conectado y listo para configurar.',
    history: 'Historial',
    historyValue: 'Hasta 30 días',
    historyBody: 'Se guardan tus datos de energía.',
    location: 'Ubicación',
    locationValue: 'Solo en el panel',
    locationBody: 'Para calcular la trayectoria del sol.',
    wifiNotice: 'Si tienes internet en casa, escríbelo aquí para activar respaldo en la NUBE. Si vas a usar el panel fuera de la ciudad, también puedes seguir sin internet.',
    wifiVerified: (ssid) => `Red verificada: ${ssid}. El panel ya puede usarla cuando necesite salir a internet.`,
    wifiSkipped: 'Modo sin internet activo. El panel funcionará desde su propia red y guardará el historial durante 30 días.',
    wifiSsidLabel: 'Nombre de tu red',
    wifiSsidPlaceholder: 'Red de casa',
    password: 'Contraseña',
    wifiPasswordPlaceholder: 'Contraseña de la red',
    testWifi: 'Probar red',
    skipWifi: 'Seguir sin internet',
    cloudLocalOnly: 'Crea tu acceso con correo y contraseña. La sesión queda guardada por 3 meses y tus datos se quedan en el panel hasta por 30 días.',
    cloudDeferred: 'Crea tu acceso con correo y contraseña. Como elegiste seguir sin internet, la NUBE queda pendiente para cuando tengas conexión.',
    cloudNotice: 'Crea tu acceso con correo y contraseña. Primero se guarda en el panel y luego intentaremos crear esa misma cuenta en la NUBE.',
    accountReady: (username) => `Acceso listo para ${username}. La pantalla principal ya pedirá contraseña dentro de la red del panel.`,
    cloudReady: (email) => `Cuenta creada para ${email}. Podrás ver tus datos desde cualquier lugar con internet.`,
    email: 'Correo',
    emailPlaceholder: 'nombre@correo.com',
    passwordPlaceholder: 'Mínimo 8 caracteres',
    createCloud: 'Crear acceso y conectar NUBE',
    createLocal: 'Crear acceso',
    locationNotice: 'Necesitamos tu ubicación para orientar el panel al sol. Se guarda solo en el panel y se actualizará otra vez cada vez que abras HelioSync en un nuevo lugar.',
    locationReady: (lat, lon) => `Ubicación lista: ${lat}, ${lon}.`,
    usePhoneLocation: 'Usar ubicación del teléfono',
    latitude: 'Latitud',
    longitude: 'Longitud',
    saveCoordinates: 'Guardar ubicación',
    finishNotice: 'Tu panel está listo. Solo enciéndelo, conéctate a su red y abre HelioSync, sin computadora ni cables extra.',
    externalWifi: 'Internet de casa',
    operationMode: 'Uso',
    indoor: 'Casa',
    outdoor: 'Campamento',
    verified: 'Verificado',
    noWifi: 'Sin internet',
    pending: 'Pendiente',
    cloud: 'NUBE',
    active: 'Activa',
    localMode: 'Solo panel',
    solarTracking: 'Ubicación del sol',
    withLocation: 'Con ubicación',
    withoutLocation: 'Sin ubicación',
    enterDashboard: 'Entrar a la pantalla principal',
    headerTitle: 'Configuración inicial',
    headerSubtitle: 'Desliza hacia abajo para comenzar tu configuración.',
    currentStatus: 'Estado actual',
    connectedActive: 'Conectado y activo.',
    memory: 'Memoria',
    memoryValue: (days) => `${days}/30 días`,
    almostFull: 'Casi llena.',
    spaceAvailable: 'Con espacio disponible.',
    cloudFallback: 'No pudimos conectar con la NUBE por ahora. Dejamos el panel protegido con tu acceso y puedes continuar; cuando tengas internet puedes volver a configurar.',
    continue: 'Continuar',
  }
};

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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getPhonePosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function getPhonePositionWithRetry() {
  try {
    return await getPhonePosition({
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
    });
  } catch (firstError) {
    if (firstError?.code === 1) {
      throw firstError;
    }

    return getPhonePosition({
      enableHighAccuracy: true,
      timeout: 18000,
      maximumAge: 0,
    });
  }
}

function isReconnectLikelyError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('abort') || text.includes('failed to fetch') || text.includes('network') || text.includes('load failed');
}

function getFriendlySetupError(error, fallback) {
  const message = `${error?.message || error || ''}`;

  if (!message) return fallback;
  if (/heltec|esp-now|espnow|lora/i.test(message)) {
    return 'No pudimos hablar con la tarjeta de pared. Revisa que esté encendida y que el código sea el mismo que aparece en su pantalla.';
  }
  if (/esp32|dashboard|firebase|uid|token|json|body|api/i.test(message)) {
    return fallback;
  }

  return message;
}

function PasswordInput({ label, visible, onToggleVisible, showLabel, hideLabel, ...props }) {
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <AuthInput
        {...props}
        label={label}
        type={visible ? 'text' : 'password'}
        className="pr-12"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? hideLabel : showLabel}
        className="absolute bottom-2.5 right-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function DeviceOnboarding() {
  const navigate = useNavigate();
  const copy = DEVICE_ONBOARDING_COPY['es-MX'];
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [modeForm, setModeForm] = useState({ mode: 'outdoor', heltecMac: DEFAULT_HELTEC_MAC });
  const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
  const [accountForm, setAccountForm] = useState({ email: '', password: '' });
  const [locationForm, setLocationForm] = useState({ latitude: '', longitude: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [showAccountPassword, setShowAccountPassword] = useState(false);

  const stepLabels = copy.steps;
  const cloudAvailable = Boolean(status?.cloud?.available);
  const operationMode = status?.operation?.mode || modeForm.mode;
  const operationIndoor = operationMode === 'indoor';
  const modeBridgeReady = !operationIndoor || Boolean(status?.espnow?.link_test_ok);
  const modeStepComplete = Boolean(status?.operation?.configured) && modeBridgeReady;
  const wifiVerified = Boolean(status?.wifi?.verified);
  const wifiSkipped = Boolean(status?.wifi?.skipped);
  const wifiStepComplete = wifiVerified || wifiSkipped;
  const cloudReady = Boolean(status?.cloud?.ready);
  const cloudSkipped = !cloudAvailable || Boolean(status?.cloud?.skipped);
  const localAccountReady = Boolean(status?.auth?.local_account_ready);
  const cloudStepComplete = localAccountReady && (cloudReady || cloudSkipped);
  const cloudFallbackActive = localAccountReady && cloudSkipped && !cloudReady && Boolean(status?.cloud?.error);
  const accountWillUseCloud = cloudAvailable && wifiVerified && !wifiSkipped;
  const locationSet = Boolean(status?.location?.set);
  const setupComplete = isSetupComplete(status);
  const reconnectExpected = busy === 'wifi'
    || busy === 'cloud'
    || busy === 'finish'
    || busy === 'mode'
    || Boolean(status?.wifi?.busy)
    || Boolean(status?.cloud?.busy)
    || Boolean(status?.espnow?.link_test_busy)
    || Boolean(status?.espnow?.initial_busy);

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

        if (nextStatus?.operation?.configured && nextStatus?.operation?.mode && currentStep !== 1 && busy !== 'mode') {
          setModeForm({
            mode: nextStatus.operation.mode,
            heltecMac: nextStatus.operation.heltec_peer_mac || DEFAULT_HELTEC_MAC,
          });
        }
      } catch {
        if (active) {
          setStatusError(reconnectExpected ? copy.panelReconnecting : copy.panelNotResponding);
        }
      }
    };

    loadStatus();
    intervalId = window.setInterval(loadStatus, 3000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [busy, copy.panelNotResponding, copy.panelReconnecting, currentStep, reconnectExpected]);

  useEffect(() => {
    if (!status) return;

    if (setupComplete && !localAccountReady) {
      setCurrentStep(3);
      return;
    }

    if (setupComplete) {
      setCurrentStep(5);
      return;
    }

    if (!modeStepComplete) {
      setCurrentStep((step) => Math.min(step, 1));
      return;
    }

    if (modeStepComplete && !wifiStepComplete && currentStep < 2) {
      setCurrentStep(2);
      return;
    }

    if (!wifiStepComplete) {
      setCurrentStep((step) => Math.min(step, 2));
      return;
    }

    if (!cloudStepComplete && currentStep < 3) {
      setCurrentStep(3);
      return;
    }

    if (cloudStepComplete && !locationSet && currentStep < 4) {
      setCurrentStep(4);
      return;
    }

    if (cloudStepComplete && locationSet && currentStep < 5) {
      setCurrentStep(5);
    }
  }, [cloudStepComplete, currentStep, localAccountReady, locationSet, modeStepComplete, setupComplete, status, wifiStepComplete]);

  const canContinue = useMemo(() => {
    const stepId = STEPS[currentStep];

    if (stepId === 'hello') return true;
    if (stepId === 'mode') return modeStepComplete;
    if (stepId === 'wifi') return wifiStepComplete;
    if (stepId === 'cloud') return cloudStepComplete;
    if (stepId === 'location') return locationSet;
    return true;
  }, [cloudStepComplete, currentStep, locationSet, modeStepComplete, wifiStepComplete]);

  const refreshStatus = async () => {
    const nextStatus = await fetchDeviceSetupStatus();
    setStatus(nextStatus);
    return nextStatus;
  };

  const waitForSetupStatus = async (predicate, options = {}) => {
    const attempts = options.attempts ?? 18;
    const firstDelayMs = options.firstDelayMs ?? 1200;
    const intervalMs = options.intervalMs ?? 1400;
    let latestStatus = status;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await delay(attempt === 0 ? firstDelayMs : intervalMs);
      try {
        latestStatus = await refreshStatus();
      } catch {
        continue;
      }

      if (predicate(latestStatus)) {
        return latestStatus;
      }
    }

    return latestStatus;
  };

  const handleModeSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy('mode');

    try {
      const modeStatus = await submitDeviceOperationMode({
        mode: modeForm.mode,
        heltecMac: modeForm.mode === 'indoor' ? modeForm.heltecMac.trim() : DEFAULT_HELTEC_MAC,
      });
      setStatus(modeStatus);

      if (modeForm.mode === 'indoor') {
        setMessage(copy.modeTesting);
        const testedStatus = await waitForSetupStatus(
          (nextStatus) => Boolean(nextStatus?.espnow?.link_test_ok)
            || (!nextStatus?.espnow?.link_test_busy && Boolean(nextStatus?.espnow?.error)),
          { attempts: 16, firstDelayMs: 1600, intervalMs: 1300 },
        );

        if (!testedStatus?.espnow?.link_test_ok) {
          throw new Error(testedStatus?.espnow?.error || copy.modeTestFailed);
        }

        setMessage(copy.modeTestOk);
      } else {
        setMessage(copy.modeSaved);
      }

      setCurrentStep(2);
    } catch (requestError) {
      if (modeForm.mode === 'indoor' && isReconnectLikelyError(requestError)) {
        setMessage(copy.modeTesting);
        const testedStatus = await waitForSetupStatus(
          (nextStatus) => Boolean(nextStatus?.espnow?.link_test_ok)
            || (!nextStatus?.espnow?.link_test_busy && Boolean(nextStatus?.espnow?.error)),
          { attempts: 16, firstDelayMs: 1600, intervalMs: 1300 },
        );

        if (testedStatus?.espnow?.link_test_ok) {
          setMessage(copy.modeTestOk);
          setCurrentStep(2);
        } else {
          setError(getFriendlySetupError(testedStatus?.espnow?.error, copy.modeTestFailed));
        }
      } else {
        setError(getFriendlySetupError(requestError, copy.modeFailed));
      }
    } finally {
      setBusy('');
    }
  };

  const handleWifiSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!wifiForm.ssid.trim()) {
      setError(copy.wifiNameRequired);
      return;
    }

    setBusy('wifi');

    try {
      await submitDeviceWifi({
        ssid: wifiForm.ssid.trim(),
        password: wifiForm.password,
      });
      setMessage(copy.wifiTesting);
    } catch (requestError) {
      if (isReconnectLikelyError(requestError)) {
        setMessage(copy.wifiTesting);
      } else {
        setError(getFriendlySetupError(requestError, copy.wifiRequestFailed));
      }
    } finally {
      setBusy('');
    }
  };

  const handleSkipWifi = async () => {
    setError('');
    setMessage('');
    setBusy('offline');

    try {
      await continueDeviceSetupOffline();
      await refreshStatus();
      setMessage(copy.offlineEnabled);
      setCurrentStep(3);
    } catch (requestError) {
      setError(getFriendlySetupError(requestError, copy.offlineFailed));
    } finally {
      setBusy('');
    }
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isValidEmail(accountForm.email) || accountForm.password.length < 8) {
      setError(copy.invalidAccount);
      return;
    }

    setBusy('cloud');

    try {
      const accountStatus = await submitDeviceAccount({
        email: accountForm.email.trim(),
        password: accountForm.password,
        syncCloud: accountWillUseCloud,
      });
      setStatus(accountStatus);
      if (accountWillUseCloud) {
        setMessage(copy.accountCloudMessage);
        const readyStatus = await waitForSetupStatus(
          (nextStatus) => Boolean(nextStatus?.auth?.local_account_ready)
            && (!nextStatus?.cloud?.busy)
            && (Boolean(nextStatus?.cloud?.ready) || Boolean(nextStatus?.cloud?.skipped) || !nextStatus?.cloud?.available),
          { attempts: 24, firstDelayMs: 1800, intervalMs: 1500 },
        );

        if (!readyStatus?.auth?.local_account_ready) {
          throw new Error(copy.accountFailed);
        }

        setStatus(readyStatus);
        setCurrentStep(4);
      } else {
        const readyStatus = await refreshStatus();
        setStatus(readyStatus);
        setMessage(copy.accountLocalMessage);
        setCurrentStep(4);
      }
    } catch (requestError) {
      if (accountWillUseCloud && isReconnectLikelyError(requestError)) {
        setMessage(copy.accountCloudMessage);
        const readyStatus = await waitForSetupStatus(
          (nextStatus) => Boolean(nextStatus?.auth?.local_account_ready)
            && (!nextStatus?.cloud?.busy)
            && (Boolean(nextStatus?.cloud?.ready) || Boolean(nextStatus?.cloud?.skipped) || !nextStatus?.cloud?.available),
          { attempts: 24, firstDelayMs: 1800, intervalMs: 1500 },
        );

        if (readyStatus?.auth?.local_account_ready) {
          setStatus(readyStatus);
          setCurrentStep(4);
        } else {
          setError(copy.accountFailed);
        }
      } else {
        setError(getFriendlySetupError(requestError, copy.accountFailed));
      }
    } finally {
      setBusy('');
    }
  };

  const handleUseLocation = async () => {
    setError('');
    setMessage('');

    if (!navigator.geolocation) {
      setError(copy.geoUnsupported);
      return;
    }

    setBusy('location');
    let gotPosition = false;

    try {
      const position = await getPhonePositionWithRetry();
      gotPosition = true;
      const nextLocation = {
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      };

      setLocationForm(nextLocation);
      const locationStatus = await submitDeviceLocation({
        lat: Number(nextLocation.latitude),
        lon: Number(nextLocation.longitude),
        source: 'phone',
      });
      setStatus(locationStatus);
      setMessage(copy.locationSaved);
      setCurrentStep(5);
    } catch (requestError) {
      setError(gotPosition ? getFriendlySetupError(requestError, copy.locationFailed) : copy.geoDenied);
    } finally {
      setBusy('');
    }
  };

  const handleManualLocationSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isFiniteCoordinate(locationForm.latitude) || !isFiniteCoordinate(locationForm.longitude)) {
      setError(copy.invalidCoordinates);
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
      setMessage(copy.locationSaved);
      setCurrentStep(5);
    } catch (requestError) {
      setError(getFriendlySetupError(requestError, copy.locationFailed));
    } finally {
      setBusy('');
    }
  };

  const handleFinish = async () => {
    setBusy('finish');
    setError('');

    try {
      const finishStatus = await completeDeviceSetup();
      let nextStatus = finishStatus;

      if (finishStatus?.operation?.mode === 'indoor') {
        setMessage(copy.bridgeInitialMessage);

        for (let attempt = 0; attempt < 14; attempt += 1) {
          await delay(attempt === 0 ? 1800 : 1400);
          try {
            nextStatus = await refreshStatus();
          } catch {
            continue;
          }

          if (!nextStatus?.operation?.indoor || nextStatus?.espnow?.initial_sent) {
            break;
          }

          if (!nextStatus?.espnow?.initial_busy && nextStatus?.espnow?.error) {
            throw new Error(nextStatus.espnow.error);
          }
        }

        if (nextStatus?.operation?.indoor && !nextStatus?.espnow?.initial_sent) {
          throw new Error(nextStatus?.espnow?.error || copy.bridgeInitialFailed);
        }
      } else {
        await refreshStatus();
      }

      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(getFriendlySetupError(requestError, copy.finishFailed));
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
            <h2 className="m-0 mt-4 text-2xl font-semibold text-white">{copy.helloTitle}</h2>
            <p className="m-0 mt-2 text-sm leading-6 text-slate-300">
              {copy.helloBody}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard title={copy.panelNetwork} value={status?.ap?.ssid || 'HelioSync'} body={copy.panelNetworkReady} />
            <StatusCard title={copy.history} value={copy.historyValue} body={copy.historyBody} />
            <StatusCard title={copy.location} value={copy.locationValue} body={copy.locationBody} />
          </div>
        </div>
      );
    }

    if (stepId === 'mode') {
      return (
        <form className="space-y-5" onSubmit={handleModeSubmit}>
          <Notice icon={Compass}>
            {copy.modeRequired}
          </Notice>

          {modeStepComplete ? (
            <Notice tone="good" icon={CheckCircle2}>
              {operationMode === 'indoor' ? copy.indoorBody : copy.outdoorBody}
            </Notice>
          ) : null}

          {status?.espnow?.link_test_busy ? (
            <Notice icon={Router}>
              {copy.modeTesting}
            </Notice>
          ) : null}

          {operationMode === 'indoor' && status?.espnow?.link_test_ok ? (
            <Notice tone="good" icon={CheckCircle2}>
              {copy.modeTestOk}
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                id: 'outdoor',
                title: copy.outdoorTitle,
                body: copy.outdoorBody,
                icon: Compass,
              },
              {
                id: 'indoor',
                title: copy.indoorTitle,
                body: copy.indoorBody,
                icon: Router,
              },
            ].map((item) => {
              const Icon = item.icon;
              const active = modeForm.mode === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setModeForm((current) => ({ ...current, mode: item.id }))}
                  className={`flex min-h-[178px] flex-col items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    active
                      ? 'border-helium-300/35 bg-helium-300/12 text-white'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="inline-flex rounded-2xl border border-current/15 bg-black/20 p-3">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-semibold">{item.title}</span>
                  <span className="text-sm leading-6 text-slate-400">{item.body}</span>
                </button>
              );
            })}
          </div>

          {modeForm.mode === 'indoor' ? (
            <AuthInput
              label={copy.heltecMacLabel}
              type="text"
              autoComplete="off"
              placeholder={copy.heltecMacPlaceholder}
              value={modeForm.heltecMac}
              onChange={(event) => setModeForm((current) => ({ ...current, heltecMac: event.target.value.toUpperCase() }))}
              required
            />
          ) : null}

          {status?.espnow?.error && !status?.espnow?.link_test_busy ? (
            <Notice tone="bad">
              {getFriendlySetupError(status.espnow.error, copy.bridgeInitialFailed)}
            </Notice>
          ) : null}

          <button
            type="submit"
            disabled={busy === 'mode' || Boolean(status?.espnow?.link_test_busy)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === 'mode' || status?.espnow?.link_test_busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {copy.saveMode}
          </button>
        </form>
      );
    }

    if (stepId === 'wifi') {
      return (
        <form className="space-y-5" onSubmit={handleWifiSubmit}>
          <Notice icon={Wifi}>
            {copy.wifiNotice}
          </Notice>

          {status?.wifi?.verified ? (
            <Notice tone="good" icon={CheckCircle2}>
              {copy.wifiVerified(status.wifi.ssid)}
            </Notice>
          ) : null}

          {status?.wifi?.skipped ? (
            <Notice tone="warn" icon={Wifi}>
              {copy.wifiSkipped}
            </Notice>
          ) : null}

          {status?.wifi?.error ? (
            <Notice tone="bad">
              {getFriendlySetupError(status.wifi.error, 'No pudimos conectarnos. Revisa el nombre de la red y la contraseña.')}
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label={copy.wifiSsidLabel}
              type="text"
              autoComplete="off"
              placeholder={copy.wifiSsidPlaceholder}
              value={wifiForm.ssid}
              onChange={(event) => setWifiForm((current) => ({ ...current, ssid: event.target.value }))}
              required
            />
            <PasswordInput
              label={copy.password}
              autoComplete="off"
              placeholder={copy.wifiPasswordPlaceholder}
              showLabel={copy.showPassword}
              hideLabel={copy.hidePassword}
              visible={showWifiPassword}
              onToggleVisible={() => setShowWifiPassword((value) => !value)}
              value={wifiForm.password}
              onChange={(event) => setWifiForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy === 'wifi'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {busy === 'wifi' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Router className="h-4 w-4" />}
              {copy.testWifi}
            </button>

            <button
              type="button"
              onClick={handleSkipWifi}
              disabled={busy === 'offline'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {busy === 'offline' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              {copy.skipWifi}
            </button>
          </div>
        </form>
      );
    }

    if (stepId === 'cloud') {
      return (
        <form className="space-y-5" onSubmit={handleAccountSubmit}>
          {!cloudAvailable ? (
            <Notice tone="warn" icon={Cloud}>
              {copy.cloudLocalOnly}
            </Notice>
          ) : wifiSkipped ? (
            <Notice tone="warn" icon={Cloud}>
              {copy.cloudDeferred}
            </Notice>
          ) : (
            <Notice icon={ShieldCheck}>
              {copy.cloudNotice}
            </Notice>
          )}

          {localAccountReady ? (
            <Notice tone="good" icon={CheckCircle2}>
              {copy.accountReady(status.auth.username)}
            </Notice>
          ) : null}

          {status?.cloud?.ready ? (
            <Notice tone="good" icon={CheckCircle2}>
              {copy.cloudReady(status.cloud.email)}
            </Notice>
          ) : null}

          {status?.cloud?.error && !cloudFallbackActive ? (
            <Notice tone="bad">
              {getFriendlySetupError(status.cloud.error, copy.cloudFallback)}
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label={copy.email}
              type="email"
              autoComplete="email"
              placeholder={copy.emailPlaceholder}
              value={accountForm.email}
              onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
            <PasswordInput
              label={copy.password}
              autoComplete="new-password"
              placeholder={copy.passwordPlaceholder}
              showLabel={copy.showPassword}
              hideLabel={copy.hidePassword}
              visible={showAccountPassword}
              onToggleVisible={() => setShowAccountPassword((value) => !value)}
              value={accountForm.password}
              onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy === 'cloud' || (accountWillUseCloud && !wifiVerified)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'cloud' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {accountWillUseCloud ? copy.createCloud : copy.createLocal}
            </button>
          </div>
        </form>
      );
    }

    if (stepId === 'location') {
      return (
        <form className="space-y-5" onSubmit={handleManualLocationSubmit}>
          <Notice icon={MapPin}>
            {copy.locationNotice}
          </Notice>

          {locationSet ? (
            <Notice tone="good" icon={CheckCircle2}>
              {copy.locationReady(Number(status.location.lat).toFixed(5), Number(status.location.lon).toFixed(5))}
            </Notice>
          ) : null}

          <button
            type="button"
            onClick={handleUseLocation}
            disabled={busy === 'location'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === 'location' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {copy.usePhoneLocation}
          </button>

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label={copy.latitude}
              type="number"
              step="0.000001"
              placeholder="19.432608"
              value={locationForm.latitude}
              onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))}
            />
            <AuthInput
              label={copy.longitude}
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
            {copy.saveCoordinates}
          </button>
        </form>
      );
    }

    return (
      <div className="space-y-5">
        <Notice tone="good" icon={CheckCircle2}>
          {copy.finishNotice}
        </Notice>

        <div className="grid gap-3 sm:grid-cols-4">
          <StatusCard title={copy.operationMode} value={operationMode === 'indoor' ? copy.indoor : copy.outdoor} tone={operationMode === 'indoor' ? 'good' : 'info'} />
          <StatusCard title={copy.externalWifi} value={wifiVerified ? copy.verified : wifiSkipped ? copy.noWifi : copy.pending} tone={wifiVerified ? 'good' : 'warn'} />
          <StatusCard title={copy.cloud} value={cloudReady ? copy.active : copy.localMode} tone={cloudReady ? 'good' : 'info'} />
          <StatusCard title={copy.solarTracking} value={locationSet ? copy.withLocation : copy.withoutLocation} tone={locationSet ? 'good' : 'warn'} />
        </div>

        <button
          type="button"
          onClick={handleFinish}
          disabled={busy === 'finish' || !locationSet}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {busy === 'finish' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {copy.enterDashboard}
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
            <h1 className="m-0 mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.headerTitle}</h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {copy.headerSubtitle}
            </p>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr]">
          <aside className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="grid gap-3">
              {stepLabels.map((label, index) => (
                <StepPill key={label} label={label} index={index} currentStep={currentStep} />
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">{copy.currentStatus}</div>
              <div className="mt-3 grid gap-3">
                <StatusCard title={copy.panelNetwork} value={status?.ap?.ssid || 'HelioSync'} body={statusError || copy.connectedActive} />
                <StatusCard title={copy.memory} value={copy.memoryValue(status?.storage?.days_stored ?? 0)} body={status?.storage?.near_full ? copy.almostFull : copy.spaceAvailable} tone={status?.storage?.near_full ? 'warn' : 'info'} />
              </div>
            </div>

          </aside>

          <main className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="space-y-4">
              {statusError ? <Notice tone="warn">{statusError}</Notice> : null}
              {message ? <Notice tone="good" icon={CheckCircle2}>{message}</Notice> : null}
              {cloudFallbackActive ? (
                <Notice tone="warn" icon={Cloud}>
                  {copy.cloudFallback}
                </Notice>
              ) : null}
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
                  {copy.continue}
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
