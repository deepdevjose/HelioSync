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

        <button
          type="button"
          onClick={handleGoogleRegister}
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
          <span>{t('register.google')}</span>
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-500">
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submission === 'email' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{t('register.submit')}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
