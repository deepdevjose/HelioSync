import { AlertTriangle, CloudUpload, Database } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';

export default function StorageNotice() {
  const storage = useHelioStore((state) => state.data.storage);

  if (!storage?.near_full) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-300/22 bg-amber-300/[0.08] px-4 py-3 text-amber-50 shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="rounded-full border border-amber-200/20 bg-amber-200/10 p-2">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Memoria local cerca del límite</div>
            <div className="mt-1 text-sm leading-6 text-amber-100/75">
              {storage.cloud_ready
                ? 'Cuando tengas internet, sincroniza el histórico para conservarlo en la nube.'
                : `HelioSync conserva ${storage.retention_days || 30} días en LittleFS y después elimina lo más antiguo automáticamente.`}
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/12 px-3 py-2 text-sm text-amber-50">
          {storage.cloud_ready ? <CloudUpload className="h-4 w-4" /> : <Database className="h-4 w-4" />}
          <span>{Math.round(storage.used_percent || 0)}% usado</span>
        </div>
      </div>
    </div>
  );
}
