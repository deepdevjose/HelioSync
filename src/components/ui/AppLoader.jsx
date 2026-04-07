import { LoaderCircle, SunMedium } from 'lucide-react';
import { useLocale } from '../../i18n/locale';

export default function AppLoader({
  title,
  message,
}) {
  const { t } = useLocale();
  const resolvedTitle = title || t('appLoader.title');
  const resolvedMessage = message || t('appLoader.message');

  return (
    <div className="min-h-screen glass-mesh-bg px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center justify-center">
        <div className="glass-panel flex w-full max-w-xl flex-col items-center gap-5 rounded-[32px] px-8 py-10 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-300">
            <SunMedium className="h-4 w-4 text-helium-300" />
            HelioSync
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.06] p-4 text-helium-300 shadow-[0_0_40px_rgba(56,189,248,0.12)]">
            <LoaderCircle className="h-7 w-7 animate-spin" />
          </div>

          <div className="space-y-2">
            <h1 className="m-0 text-3xl font-semibold tracking-[-0.03em] text-white">{resolvedTitle}</h1>
            <p className="m-0 text-sm leading-6 text-slate-400">{resolvedMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
