import { useEffect, useState } from 'react';
import { Cpu, LoaderCircle, LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';
import { formatRelativeUpdate, getDashboardInsights, getToneClasses } from './dashboardInsights';
import { signOutUser } from '../../services/authClient';
import { useLocale } from '../../i18n/locale';
import LanguageToggle from '../ui/LanguageToggle';

const statusIcons = {
  Online: Wifi,
  Offline: WifiOff,
  'ESP AP': Cpu,
};

export default function Header() {
  const { locale, t } = useLocale();
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const lastUpdatedAt = useHelioStore((state) => state.lastUpdatedAt);
  const userSetup = useHelioStore((state) => state.userSetup);
  const userProfile = useHelioStore((state) => state.userProfile);
  const [now, setNow] = useState(() => Date.now());
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const insights = getDashboardInsights(data, status, history, userSetup, locale, t);
  const StatusIcon = statusIcons[status] || Wifi;
  const updatedLabel = formatRelativeUpdate(lastUpdatedAt, locale, t, now);

  const handleSignOut = async () => {
    setSigningOut(true);

    try {
      await signOutUser();
    } finally {
      setSigningOut(false);
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

      <div className="grid w-full gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end lg:gap-3">
        <LanguageToggle className="w-full justify-center sm:justify-center lg:w-auto" />

        <div className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm sm:justify-start lg:w-auto ${getToneClasses(insights.systemState.tone)}`}>
          <StatusIcon className="h-4 w-4" />
          <span className="font-medium">{insights.connectionLabel}</span>
        </div>

        <div className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm sm:justify-start lg:w-auto ${getToneClasses(insights.deviceState.tone)}`}>
          <span className="font-medium">{insights.deviceState.label}</span>
        </div>

        <div className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 sm:justify-start lg:w-auto">
          <RefreshCw className="h-4 w-4" />
          <span className="truncate">{insights.syncLabel} · {updatedLabel}</span>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 lg:w-auto"
        >
          {signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          <span>{t('common.signOut')}</span>
        </button>
      </div>
    </header>
  );
}
