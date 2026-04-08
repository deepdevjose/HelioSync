import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import AuthShell, { AuthInput, AuthLinkRow } from '../components/auth/AuthShell';
import { signInWithEmail, signInWithGoogle } from '../services/authClient';
import { getAuthErrorMessage } from '../services/authMessages';
import { useLocale } from '../i18n/locale';

export default function Login() {
  const { locale, t } = useLocale();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submission, setSubmission] = useState('');
  const [error, setError] = useState('');

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleEmailLogin = async (event) => {
    event.preventDefault();
    setSubmission('email');
    setError('');

    try {
      await signInWithEmail(form);
    } catch (authError) {
      setError(getAuthErrorMessage(authError, locale, t('login.emailFallback')));
      setSubmission('');
    }
  };

  const handleGoogleLogin = async () => {
    setSubmission('google');
    setError('');

    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(getAuthErrorMessage(authError, locale, t('login.googleFallback')));
      setSubmission('');
    }
  };

  return (
    <AuthShell
      eyebrow={t('login.eyebrow')}
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={<AuthLinkRow prompt={t('login.footerPrompt')} label={t('login.footerLabel')} to="/register" />}
    >
      <div className="space-y-5">
        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500/72">
            {t('login.googleSection')}
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submission.length > 0}
            className="flex w-full items-center gap-4 rounded-[28px] border border-helium-300/16 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(125,211,252,0.12),rgba(8,18,30,0.92))] px-4 py-4 text-left text-white shadow-[0_16px_38px_rgba(56,189,248,0.1)] transition duration-200 hover:-translate-y-0.5 hover:border-helium-300/28 hover:shadow-[0_24px_48px_rgba(56,189,248,0.16)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submission === 'google' ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-white" />
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950 shadow-[0_10px_20px_rgba(15,23,42,0.25)]">
                G
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t('login.google')}</span>
              <span className="mt-1 block text-xs text-slate-300/72">{t('login.googleHint')}</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500/80">
          <span className="h-px flex-1 bg-white/10" />
          {t('login.or')}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-4" onSubmit={handleEmailLogin}>
          <AuthInput
            label={t('login.emailLabel')}
            type="email"
            autoComplete="email"
            placeholder={t('login.emailPlaceholder')}
            value={form.email}
            onChange={handleChange('email')}
            required
          />

          <AuthInput
            label={t('login.passwordLabel')}
            type="password"
            autoComplete="current-password"
            placeholder={t('login.passwordPlaceholder')}
            value={form.password}
            onChange={handleChange('password')}
            required
          />

          <div className="flex justify-end text-sm">
            <Link to="/forgot-password" className="font-medium text-slate-300 transition hover:text-white">
              {t('login.forgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            disabled={submission.length > 0}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_26px_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-helium-200/30 hover:bg-slate-100 hover:shadow-[0_0_0_10px_rgba(255,255,255,0.04),0_18px_34px_rgba(255,255,255,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submission === 'email' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{t('login.submit')}</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
