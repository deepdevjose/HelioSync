import ElectricalCard from '../components/Dashboard/ElectricalCard';
import EnvironmentCard from '../components/Dashboard/EnvironmentCard';
import Header from '../components/Dashboard/Header';
import HistoryChartCard from '../components/Dashboard/HistoryChartCard';
import SystemViewCard from '../components/Dashboard/SystemViewCard';

export default function Dashboard() {
  return (
    <div className="min-h-screen glass-mesh-bg px-3 py-4 sm:px-4 sm:py-5 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-5">
        <Header />

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
            <HistoryChartCard />
          </div>
        </div>
      </div>
    </div>
  );
}
