import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { useHelioStore } from '../../store/useHelioStore';
import { formatRelativeUpdate, getDashboardInsights, getToneClasses } from './dashboardInsights';
import { useLocale } from '../../i18n/locale';

const directionIcons = {
  '↑': ArrowUpRight,
  '→': ArrowRight,
  '↓': ArrowDownRight,
};

export default function ElectricalCard() {
  const { locale, t } = useLocale();
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const lastUpdatedAt = useHelioStore((state) => state.lastUpdatedAt);
  const userSetup = useHelioStore((state) => state.userSetup);
  const [now, setNow] = useState(() => Date.now());
  const insights = getDashboardInsights(data, status, history, userSetup, locale, t);
  const DirectionIcon = directionIcons[insights.outputState.symbol] || ArrowRight;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const updatedLabel = formatRelativeUpdate(lastUpdatedAt, locale, t, now);

  return (
    <GlassCard delay={0.15} className="flex h-full min-h-[300px] flex-col justify-between gap-5 overflow-hidden !p-5 sm:min-h-[340px] sm:gap-6 sm:!p-6 lg:!p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{t('dashboard.system')}</span>
          <div className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${getToneClasses(insights.systemState.tone)}`}>
            {insights.systemState.label}
          </div>
          <p className="m-0 max-w-xl text-sm leading-6 text-slate-300">
            {insights.systemState.reason}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 lg:min-w-[190px]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{t('dashboard.liveFeedback')}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
            <span>{updatedLabel}</span>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{t('dashboard.output')}</span>
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-5xl font-light tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
              <CountUp end={data.electrical.power_w} decimals={1} duration={1.8} separator="," />
            </span>
            <span className="pb-2 text-xl font-semibold text-helium-400 sm:pb-3 sm:text-2xl">W</span>
          </div>
        </div>

        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium ${getToneClasses(insights.outputState.tone)}`}>
          <DirectionIcon className="h-4 w-4" />
          <span>{insights.outputState.label}</span>
        </div>

        <p className="m-0 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
          {insights.outputState.reason}
        </p>
      </div>

      <div className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
        {insights.supportMetrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{metric.label}</div>
            <div className="mt-2 text-lg font-medium text-slate-100">{metric.value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
