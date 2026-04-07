import { Languages } from 'lucide-react';
import { useLocale } from '../../i18n/locale';

export default function LanguageToggle({ className = '' }) {
  const { locale, setLocale, t } = useLocale();
  const isSpanish = locale === 'es-MX';

  return (
    <button
      type="button"
      onClick={() => setLocale(isSpanish ? 'en' : 'es-MX')}
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/10 ${className}`}
      aria-label={t('common.languageSwitchLabel')}
      title={t('common.languageSwitchLabel')}
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{isSpanish ? 'ES / EN' : 'EN / ES'}</span>
    </button>
  );
}
