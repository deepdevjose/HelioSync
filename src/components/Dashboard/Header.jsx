import { useState } from 'react';
import { LoaderCircle, LogOut, Moon, Settings, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';
import { getDashboardInsights } from './dashboardInsights';
import { signOutUser } from '../../services/authClient';
import { factoryResetDeviceStorage, requestDeviceSmartSleep, returnToDeviceOnboarding, signOutDevicePortal } from '../../services/deviceSetup';
import { isDevicePortalOrigin } from '../../config/runtime';
import { useLocale } from '../../i18n/locale';

export default function Header() {
  const { locale, t } = useLocale();
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const telemetrySource = useHelioStore((state) => state.telemetrySource);
  const userSetup = useHelioStore((state) => state.userSetup);
  const userProfile = useHelioStore((state) => state.userProfile);
  const session = useHelioStore((state) => state.session);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [openingSetup, setOpeningSetup] = useState(false);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [factoryResetConfirm, setFactoryResetConfirm] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const devicePortal = isDevicePortalOrigin();

  const hasLiveTelemetry = telemetrySource === 'device';
  const insights = getDashboardInsights(data, status, history, userSetup, locale, t, hasLiveTelemetry);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutUser();
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeviceSignOut = async () => {
    setResetting(true);
    try {
      await signOutDevicePortal();
      window.location.href = '/device-login';
    } catch {
      window.location.href = '/device-login';
    } finally {
      setResetting(false);
    }
  };

  const handleOpenSetup = async () => {
    setOpeningSetup(true);
    try {
      await returnToDeviceOnboarding();
      window.location.href = '/setup';
    } catch {
      window.location.href = '/setup';
    } finally {
      setOpeningSetup(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!factoryResetConfirm) {
      setFactoryResetConfirm(true);
      return;
    }

    setFactoryResetting(true);
    try {
      await factoryResetDeviceStorage();
      window.location.href = '/setup';
    } catch {
      window.location.href = '/setup';
    } finally {
      setFactoryResetting(false);
    }
  };

  const handleSmartSleep = async () => {
    setSleeping(true);
    try {
      await requestDeviceSmartSleep();
    } finally {
      window.setTimeout(() => setSleeping(false), 1600);
    }
  };

  return (
    <header className="mb-1 flex flex-col gap-4 lg:mb-2 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
          <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
          {t('common.brand')}
        </div>
        <div>
          <h1 className="m-0 text-[1.9rem] font-semibold tracking-tight text-white sm:text-3xl">{t('header.title')}</h1>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-400">
            {insights.locationLabel} · {insights.profileLabel} · {insights.modeLabel}
          </p>
          <p className="m-0 mt-1 text-sm leading-6 text-slate-500">
            {userProfile?.displayName ? `${userProfile.displayName} · ` : ''}{insights.profileMessage}
          </p>
        </div>
      </div>

      <div className="relative w-full sm:w-auto">
        {devicePortal ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 sm:w-auto"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Configurar</span>
            </button>

            {settingsOpen ? (
              <div className="absolute right-0 z-20 mt-3 w-full min-w-[260px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur sm:w-[300px]">
                <button
                  type="button"
                  onClick={handleOpenSetup}
                  disabled={openingSetup}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openingSetup ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                  <span>{t('common.openSetup')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSmartSleep}
                  disabled={sleeping}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sleeping ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />}
                  <span>Ahorrar energía</span>
                </button>

                <button
                  type="button"
                  id="btn-sign-out"
                  onClick={handleDeviceSignOut}
                  disabled={resetting}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  <span>{t('common.signOut')}</span>
                </button>

                <div className="my-2 h-px bg-white/10" />

                <button
                  type="button"
                  onClick={handleFactoryReset}
                  disabled={factoryResetting}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    factoryResetConfirm
                      ? 'bg-rose-300/12 text-rose-50 hover:bg-rose-300/18'
                      : 'text-slate-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {factoryResetting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>{factoryResetConfirm ? 'Confirmar estado de fábrica' : 'Estado de fábrica'}</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {session && !devicePortal ? (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 lg:w-auto"
          >
            {signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            <span>{t('common.signOut')}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
