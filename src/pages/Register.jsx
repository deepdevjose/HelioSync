import { useMemo, useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import AuthShell, { AuthInput, AuthLinkRow } from '../components/auth/AuthShell';
import { registerWithEmail, signInWithGoogle } from '../services/authClient';
import { getAuthErrorMessage } from '../services/authMessages';
import { useLocale } from '../i18n/locale';

function validateForm(form, t) {
  const errors = {};

  if (!form.displayName.trim()) {
    errors.displayName = t('register.errors.displayName');
  }

  if (!form.email.trim()) {
    errors.email = t('register.errors.email');
  }

  if (form.password.length < 8) {
    errors.password = t('register.errors.password');
  }

  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = t('register.errors.confirmPassword');
  }

  return errors;
}

export default function Register() {
  const { locale, t } = useLocale();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [submission, setSubmission] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [error, setError] = useState('');
  const formIsValid = useMemo(() => Object.keys(validateForm(form, t)).length === 0, [form, t]);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFormErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleEmailRegister = async (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form, t);
    setFormErrors(nextErrors);
    setError('');

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmission('email');

    try {
      await registerWithEmail({
        displayName: form.displayName,
        email: form.email,
        password: form.password,
      });
    } catch (authError) {
      setError(getAuthErrorMessage(authError, locale, t('register.emailFallback')));
      setSubmission('');
    }
  };

  const handleGoogleRegister = async () => {
    setSubmission('google');
    setError('');

    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(getAuthErrorMessage(authError, locale, t('register.googleFallback')));
      setSubmission('');
    }
  };

  return (
    <AuthShell
      eyebrow={t('register.eyebrow')}
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={<AuthLinkRow prompt={t('register.footerPrompt')} label={t('register.footerLabel')} to="/login" />}
    >
      <div className="space-y-5">
        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500/72">
            {t('register.googleSection')}
          </div>

          <button
            type="button"
            onClick={handleGoogleRegister}
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
              <span className="block text-sm font-semibold">{t('register.google')}</span>
              <span className="mt-1 block text-xs text-slate-300/72">{t('register.googleHint')}</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500/80">
          <span className="h-px flex-1 bg-white/10" />
          {t('login.or')}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-4" onSubmit={handleEmailRegister}>
          <AuthInput
            label={t('register.displayNameLabel')}
            type="text"
            autoComplete="name"
            placeholder={t('register.displayNamePlaceholder')}
            value={form.displayName}
            onChange={handleChange('displayName')}
            error={formErrors.displayName}
            required
          />

          <AuthInput
            label={t('register.emailLabel')}
            type="email"
            autoComplete="email"
            placeholder={t('register.emailPlaceholder')}
            value={form.email}
            onChange={handleChange('email')}
            error={formErrors.email}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              label={t('register.passwordLabel')}
              type="password"
              autoComplete="new-password"
              placeholder={t('register.passwordPlaceholder')}
              value={form.password}
              onChange={handleChange('password')}
              error={formErrors.password}
              required
            />

            <AuthInput
              label={t('register.confirmPasswordLabel')}
              type="password"
              autoComplete="new-password"
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={form.confirmPassword}
              onChange={handleChange('confirmPassword')}
              error={formErrors.confirmPassword}
              required
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-400">
            {t('register.lightNote')}
          </div>

          <button
            type="submit"
            disabled={submission.length > 0 || !formIsValid}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_26px_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-helium-200/30 hover:bg-slate-100 hover:shadow-[0_0_0_10px_rgba(255,255,255,0.04),0_18px_34px_rgba(255,255,255,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submission === 'email' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{t('register.submit')}</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
