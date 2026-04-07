import { Droplets, SunDim, Thermometer } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { useHelioStore } from '../../store/useHelioStore';
import { getDashboardInsights } from './dashboardInsights';
import { useLocale } from '../../i18n/locale';

const environmentIcons = {
  sunlight: SunDim,
  temperature: Thermometer,
  humidity: Droplets,
};

const environmentTones = {
  sunlight: 'bg-yellow-500/10 text-yellow-300 border-yellow-400/15',
  temperature: 'bg-orange-500/10 text-orange-300 border-orange-400/15',
  humidity: 'bg-sky-500/10 text-sky-300 border-sky-400/15',
};

export default function EnvironmentCard() {
  const { locale, t } = useLocale();
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const insights = getDashboardInsights(data, status, history, locale, t);

  return (
    <GlassCard delay={0.2} className="flex h-full min-h-[340px] flex-col gap-5 !p-6 md:!p-7">
      <div className="space-y-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{t('dashboard.environment')}</span>
        <h2 className="m-0 text-2xl font-semibold text-white">{t('dashboard.whySystemLooksThisWay')}</h2>
        <p className="m-0 text-sm leading-6 text-slate-400">
          {t('dashboard.contextFirst')}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {insights.environment.map((item) => {
          const Icon = environmentIcons[item.key];

          return (
            <div key={item.key} className="rounded-3xl border border-white/[0.08] bg-black/10 p-4">
              <div className="flex items-start gap-4">
                <div className={`rounded-2xl border p-3 ${environmentTones[item.key]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
                  <div className="mt-2 text-lg font-medium text-white">{item.meaning}</div>
                  <div className="mt-1 text-sm text-slate-400">{item.value}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
