import { Wifi } from 'lucide-react';
import ElectricalCard from '../components/Dashboard/ElectricalCard';
import EnvironmentCard from '../components/Dashboard/EnvironmentCard';
import Header from '../components/Dashboard/Header';
import HistoryChartCard from '../components/Dashboard/HistoryChartCard';
import SensorDiagnosticsCard from '../components/Dashboard/SensorDiagnosticsCard';
import StorageNotice from '../components/Dashboard/StorageNotice';
import SystemViewCard from '../components/Dashboard/SystemViewCard';
import { useHelioDeviceStream } from '../hooks/useHelioDeviceStream';
import { useHelioStore } from '../store/useHelioStore';
import { isDevicePortalOrigin } from '../config/runtime';
import { useLocale } from '../i18n/locale';

function NoSignalBanner() {
  const { t } = useLocale();
  const telemetrySource = useHelioStore((state) => state.telemetrySource);
  const devicePortal = isDevicePortalOrigin();

  if (telemetrySource === 'device') {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-300/12 bg-white/[0.04] px-4 py-4 text-slate-300">
      <div className="flex items-center gap-3">
        <div className="rounded-full border border-slate-300/15 bg-white/5 p-2 text-slate-400">
          <Wifi className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">{t('insights.statusWaiting')}</div>
          <div className="mt-0.5 text-sm text-slate-400">
            {devicePortal ? t('dashboard.waitingPanelLocal') : t('dashboard.waitingPanelRemote')}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  useHelioDeviceStream();

  return (
    <div className="min-h-screen glass-mesh-bg px-3 py-4 sm:px-4 sm:py-5 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-5">
        <Header />
        <StorageNotice />
        <NoSignalBanner />

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-12">
            <SystemViewCard />
          </div>

          <div className="min-w-0 lg:col-span-7">
            <ElectricalCard />
          </div>

          <div className="min-w-0 lg:col-span-5">
            <EnvironmentCard />
          </div>

          <div className="min-w-0 lg:col-span-12">
            <SensorDiagnosticsCard />
          </div>

          <div className="min-w-0 lg:col-span-12">
            <HistoryChartCard />
          </div>
        </div>
      </div>
    </div>
  );
}
