import { Activity } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '../ui/GlassCard';
import { useHelioStore } from '../../store/useHelioStore';
import { getDashboardInsights } from './dashboardInsights';
import { useLocale } from '../../i18n/locale';

function CustomTooltip({ active, payload, label, formatTooltip }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#131a27]/92 px-3 py-2 shadow-[0_18px_48px_rgba(0,0,0,0.32)]">
        <p className="m-0 text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
        <p className="m-0 mt-2 text-sm font-medium text-white">{formatTooltip(payload[0].value)}</p>
      </div>
    );
  }

  return null;
}

export default function HistoryChartCard() {
  const { locale, t } = useLocale();
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const insights = getDashboardInsights(data, status, history, locale, t);
  const titleMap = {
    [t('insights.rising')]: t('history.risingWindow'),
    [t('insights.falling')]: t('history.fallingWindow'),
    [t('insights.steady')]: t('history.steadyWindow'),
  };

  return (
    <GlassCard delay={0.25} className="group flex min-h-[330px] min-w-0 flex-col gap-5 !p-6 md:!p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{t('dashboard.trend')}</span>
          <h2 className="m-0 text-2xl font-semibold text-white">{titleMap[insights.trend.direction] || t('history.steadyWindow')}</h2>
          <p className="m-0 text-sm leading-6 text-slate-400">{insights.trend.detail}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
          <Activity className="h-4 w-4 text-helium-400" />
          <span>{t('dashboard.outputPattern24h')}</span>
        </div>
      </div>

      <div className="relative h-[250px] w-full min-w-0 sm:h-[280px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={280}
          minHeight={250}
          initialDimension={{ width: 640, height: 250 }}
        >
          <AreaChart data={history} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#ffffff0b" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#8a94a7"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis
              stroke="#8a94a7"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip content={<CustomTooltip formatTooltip={(value) => t('history.tooltipPower', { value })} />} cursor={{ stroke: '#38BDF8', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="power_w"
              stroke="#7DD3FC"
              strokeWidth={2.5}
              fill="url(#trendFill)"
              fillOpacity={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
