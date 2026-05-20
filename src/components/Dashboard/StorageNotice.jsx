import { AlertTriangle, CloudUpload, Database } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';

export default function StorageNotice() {
  const storage = useHelioStore((state) => state.data.storage);

  if (!storage?.near_full) {
    return null;
  }

  const isNearCapacity = (storage.used_percent || 0) >= 90;
  const isAtRetention = (storage.days_stored || 0) >= (storage.retention_days || 30) - 1;

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.2)] ${
      isNearCapacity || isAtRetention
        ? 'border-rose-300/22 bg-rose-300/[0.08] text-rose-50'
        : 'border-amber-300/22 bg-amber-300/[0.08] text-amber-50'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className={`rounded-full border p-2 ${
            isNearCapacity || isAtRetention
              ? 'border-rose-200/20 bg-rose-200/10'
              : 'border-amber-200/20 bg-amber-200/10'
          }`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              {isNearCapacity || isAtRetention ? 'Panel lleno' : 'Panel casi lleno'}
            </div>
            <div className={`mt-1 text-sm leading-6 ${
              isNearCapacity || isAtRetention ? 'text-rose-100/75' : 'text-amber-100/75'
            }`}>
              {storage.cloud_ready
                ? 'El panel necesita sincronizar datos a la NUBE. Conéctate a una red con internet para guardar tu historial antes de que se pierda.'
                : `Tu panel puede guardar hasta ${storage.retention_days || 30} días de datos. Los más antiguos se borrarán cuando se llene la memoria.`}
            </div>
          </div>
        </div>

        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
          isNearCapacity || isAtRetention
            ? 'border-rose-200/20 bg-black/12 text-rose-50'
            : 'border-amber-200/20 bg-black/12 text-amber-50'
        }`}>
          {storage.cloud_ready ? <CloudUpload className="h-4 w-4" /> : <Database className="h-4 w-4" />}
          <span>{Math.round(storage.used_percent || 0)}% lleno ({storage.days_stored || 0} de {storage.retention_days || 30} días)</span>
        </div>
      </div>
    </div>
  );
}
