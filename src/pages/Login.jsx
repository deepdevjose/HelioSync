import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import AuthShell, { AuthInput, AuthLinkRow } from '../components/auth/AuthShell';
import { signInWithEmail, signInWithGoogle } from '../services/authClient';
import { getAuthErrorMessage } from '../services/authMessages';
import { isFirebaseMockConfig } from '../services/firebase';
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
        {isFirebaseMockConfig ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {t('login.demoBanner')}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submission.length > 0}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submission === 'google' ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
              G
            </span>
          )}
          <span>{t('login.google')}</span>
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-500">
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

          <div className="flex items-center justify-between gap-3 text-sm">
            <Link to="/forgot-password" className="font-medium text-slate-300 transition hover:text-white">
              {t('login.forgotPassword')}
            </Link>
            <span className="text-slate-500">{t('login.identityHint')}</span>
          </div>

          <button
            type="submit"
            disabled={submission.length > 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submission === 'email' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{t('login.submit')}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
