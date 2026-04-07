import { useState } from 'react';
import { ArrowLeft, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import AuthShell, { AuthInput } from '../components/auth/AuthShell';
import { sendPasswordReset } from '../services/authClient';
import { getAuthErrorMessage } from '../services/authMessages';
import { isFirebaseMockConfig } from '../services/firebase';
import { useLocale } from '../i18n/locale';

export default function ForgotPassword() {
  const { locale, t } = useLocale();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const result = await sendPasswordReset(email);
      setSuccess(
        result.simulated
          ? t('forgotPassword.successMock')
          : t('forgotPassword.success'),
      );
    } catch (authError) {
      setError(getAuthErrorMessage(authError, locale, t('forgotPassword.fallback')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t('forgotPassword.eyebrow')}
      title={t('forgotPassword.title')}
      subtitle={t('forgotPassword.subtitle')}
      footer={
        <Link to="/login" className="inline-flex items-center gap-2 font-medium text-white transition hover:text-helium-300">
          <ArrowLeft className="h-4 w-4" />
          {t('forgotPassword.backToLogin')}
        </Link>
      }
    >
      <div className="space-y-5">
        {success ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <span>{success}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <AuthInput
            label={t('forgotPassword.emailLabel')}
            hint={isFirebaseMockConfig ? t('forgotPassword.demoHint') : null}
            type="email"
            autoComplete="email"
            placeholder={t('forgotPassword.emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-400">
            {t('forgotPassword.note')}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{t('forgotPassword.submit')}</span>
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
