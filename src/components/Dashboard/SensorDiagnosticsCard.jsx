import { createElement } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cpu, Gauge, SunDim, Thermometer } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { useHelioStore } from '../../store/useHelioStore';

const SENSOR_ROWS = [
  {
    key: 'dht22',
    name: 'Temperatura',
    role: 'Pieza marcada DHT22',
    hint: 'Revisa que el cable del conector 4 esté firme. Si sigue en rojo, cambia la pieza marcada DHT22.',
    Icon: Thermometer,
  },
  {
    key: 'ina219',
    name: 'Energía',
    role: 'Pieza marcada INA219',
    hint: 'Revisa que el cable de cuatro hilos esté firme. Si sigue en rojo, cambia la pieza marcada INA219.',
    Icon: Gauge,
  },
  {
    key: 'bh1750',
    name: 'Luz solar',
    role: 'Pieza marcada BH1750',
    hint: 'Revisa que la pieza vea la luz y que el cable esté firme. Si sigue en rojo, cambia la pieza marcada BH1750.',
    Icon: SunDim,
  },
  {
    key: 'mpu6050',
    name: 'Movimiento',
    role: 'Pieza marcada MPU6050',
    hint: 'Deja quieto el panel al encender y revisa que el cable esté firme. Si sigue en rojo, cambia la pieza marcada MPU6050.',
    Icon: Cpu,
  },
];

export default function SensorDiagnosticsCard() {
  const sensors = useHelioStore((state) => state.data.sensor_status);
  const telemetrySource = useHelioStore((state) => state.telemetrySource);
  const online = telemetrySource === 'device';
  const okCount = SENSOR_ROWS.filter((sensor) => sensors?.[sensor.key]).length;

  return (
    <GlassCard delay={0.22} className="flex h-full flex-col gap-5 !p-5 sm:!p-6 md:!p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">Revisión del panel</span>
          <h2 className="m-0 text-[1.45rem] font-semibold text-white sm:text-2xl">Piezas principales</h2>
          <p className="m-0 text-sm leading-6 text-slate-400">
            Si una pieza aparece en rojo, revisa su cable o cámbiala antes de salir.
          </p>
        </div>

        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
          online && okCount === SENSOR_ROWS.length
            ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
            : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
        }`}>
          <Activity className="h-4 w-4" />
          <span>{online ? `${okCount}/${SENSOR_ROWS.length} listas` : 'Esperando panel'}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SENSOR_ROWS.map(({ key, name, role, hint, Icon }) => {
          const ok = Boolean(sensors?.[key]);

          return (
            <div
              key={key}
              className={`rounded-2xl border p-4 ${
                ok
                  ? 'border-emerald-300/16 bg-emerald-300/[0.07]'
                  : 'border-rose-300/18 bg-rose-300/[0.07]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-2xl border p-2.5 ${
                  ok
                    ? 'border-emerald-200/18 bg-emerald-200/10 text-emerald-100'
                    : 'border-rose-200/18 bg-rose-200/10 text-rose-100'
                }`}>
                  {createElement(Icon, { className: 'h-5 w-5' })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{name}</div>
                    {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <AlertTriangle className="h-4 w-4 text-rose-200" />}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">{role}</div>
                  <div className={`mt-2 text-sm leading-6 ${ok ? 'text-emerald-100/75' : 'text-rose-100/75'}`}>
                    {ok ? 'Está leyendo bien.' : hint}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
