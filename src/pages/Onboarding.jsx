import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  MoveHorizontal,
  Sparkles,
  SunMedium,
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { AuthInput } from '../components/auth/AuthShell';
import LanguageToggle from '../components/ui/LanguageToggle';
import { useHelioStore } from '../store/useHelioStore';
import { updateCurrentUserDisplayName } from '../services/authClient';
import { getAuthErrorMessage } from '../services/authMessages';
import { buildLocationLabel, getStaticOrientationRecommendation, getTrackingRecommendation } from '../services/solarRecommendations';
import { saveUserSetup, updateUserProfileData } from '../services/userData';
import { useLocale } from '../i18n/locale';

const STEP_IDS = ['welcome', 'location', 'mode', 'details', 'finish'];

function parseCoordinate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildInitialLocation(userSetup) {
  const location = userSetup?.location;

  return {
    city: location?.city || '',
    region: location?.region || '',
    country: location?.country || '',
    latitude: Number.isFinite(location?.latitude) ? String(location.latitude) : '',
    longitude: Number.isFinite(location?.longitude) ? String(location.longitude) : '',
  };
}

function hasLocationValue(location) {
  const hasText = [location.city, location.region, location.country].some((item) => item.trim().length > 0);
  const hasCoordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
  return hasText || hasCoordinates;
}

function StepMarker({ index, currentStep, label }) {
  const isActive = index === currentStep;
  const isComplete = index < currentStep;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
          isComplete
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : isActive
              ? 'border-helium-400/40 bg-helium-400/12 text-helium-200'
              : 'border-white/10 bg-white/[0.04] text-slate-400'
        }`}
      >
        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
      </div>
      <div>
        <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-400'}`}>{label}</div>
      </div>
    </div>
  );
}

function SelectionCard({ selected, icon, title, body, badge, onClick }) {
  const IconComponent = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[28px] border p-5 text-left transition ${
        selected
          ? 'border-helium-400/35 bg-helium-400/10 shadow-[0_0_40px_rgba(56,189,248,0.08)]'
          : 'border-white/[0.08] bg-black/10 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300">
          <IconComponent className="h-5 w-5" />
        </div>
        {badge ? (
          <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-300">
            {badge}
          </div>
        ) : null}
      </div>

      <div className="mt-5 text-xl font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{body}</div>
    </button>
  );
}

export default function Onboarding() {
  const { locale, t } = useLocale();
  const navigate = useNavigate();
  const session = useHelioStore((state) => state.session);
  const userProfile = useHelioStore((state) => state.userProfile);
  const userSetup = useHelioStore((state) => state.userSetup);
  const setUserProfile = useHelioStore((state) => state.setUserProfile);
  const setUserSetup = useHelioStore((state) => state.setUserSetup);
  const [currentStep, setCurrentStep] = useState(0);
  const [displayName, setDisplayName] = useState(userProfile?.displayName || session?.displayName || '');
  const [locationMethod, setLocationMethod] = useState(userSetup?.location?.source || 'manual');
  const [locationForm, setLocationForm] = useState(() => buildInitialLocation(userSetup));
  const [operatingMode, setOperatingMode] = useState(userSetup?.operatingMode || 'tracking');
  const [alignmentValue, setAlignmentValue] = useState(() => {
    const existing = userSetup?.staticOrientation?.initialAlignmentDeg;
    return Number.isFinite(existing) ? String(existing) : '';
  });
  const [alignmentDirty, setAlignmentDirty] = useState(Boolean(userSetup?.staticOrientation?.initialAlignmentDeg));
  const [geolocationState, setGeolocationState] = useState({ loading: false, error: '', success: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const steps = useMemo(
    () => STEP_IDS.map((id) => ({ id, label: t(`onboarding.stepLabels.${id}`) })),
    [t],
  );

  const normalizedLocation = useMemo(() => ({
    source: locationMethod,
    city: locationForm.city.trim(),
    region: locationForm.region.trim(),
    country: locationForm.country.trim(),
    latitude: parseCoordinate(locationForm.latitude),
    longitude: parseCoordinate(locationForm.longitude),
  }), [locationForm, locationMethod]);

  const staticRecommendation = useMemo(
    () => getStaticOrientationRecommendation(normalizedLocation, locale),
    [locale, normalizedLocation],
  );
  const trackingRecommendation = useMemo(
    () => getTrackingRecommendation(normalizedLocation, locale),
    [locale, normalizedLocation],
  );
  const localizedLocationLabel = buildLocationLabel(normalizedLocation, locale);
  const displayedAlignmentValue = alignmentDirty ? alignmentValue : String(staticRecommendation.tilt);

  const canContinue = useMemo(() => {
    if (STEP_IDS[currentStep] === 'welcome') {
      return displayName.trim().length >= 2;
    }

    if (STEP_IDS[currentStep] === 'location') {
      return hasLocationValue(normalizedLocation);
    }

    if (STEP_IDS[currentStep] === 'mode') {
      return operatingMode === 'static' || operatingMode === 'tracking';
    }

    if (STEP_IDS[currentStep] === 'details' && operatingMode === 'static') {
      const value = Number.parseFloat(displayedAlignmentValue);
      return Number.isFinite(value) && value >= 0 && value <= 90;
    }

    return true;
  }, [currentStep, displayName, displayedAlignmentValue, normalizedLocation, operatingMode]);

  if (!session) {
    return null;
  }

  const locationLabel = localizedLocationLabel;

  const handleLocationChange = (field) => (event) => {
    setLocationMethod('manual');
    setLocationForm((current) => ({ ...current, [field]: event.target.value }));
    setGeolocationState({ loading: false, error: '', success: '' });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeolocationState({
        loading: false,
        error: t('onboarding.currentLocationUnavailable'),
        success: '',
      });
      return;
    }

    setLocationMethod('current');
    setGeolocationState({ loading: true, error: '', success: '' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(5),
          longitude: position.coords.longitude.toFixed(5),
        }));
        setGeolocationState({
          loading: false,
          error: '',
          success: t('onboarding.currentLocationSuccess'),
        });
      },
      (geoError) => {
        setGeolocationState({
          loading: false,
          error: geoError?.code === 1 ? t('onboarding.currentLocationUnavailable') : t('onboarding.currentLocationError'),
          success: '',
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  const handleNext = () => {
    setError('');
    setCurrentStep((step) => Math.min(step + 1, STEP_IDS.length - 1));
  };

  const handleBack = () => {
    setError('');
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const handleFinish = async () => {
    if (!canContinue) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      let nextProfile = userProfile;
      const trimmedName = displayName.trim();

      if (trimmedName && trimmedName !== (userProfile?.displayName || session.displayName || '')) {
        await updateCurrentUserDisplayName(trimmedName);
        nextProfile = await updateUserProfileData(session.uid, {
          displayName: trimmedName,
          email: session.email || userProfile?.email || '',
        });
        setUserProfile(nextProfile);
      }

      const staticAlignment = Number.parseFloat(displayedAlignmentValue);
      const setupPayload = {
        location: {
          ...normalizedLocation,
          label: locationLabel,
        },
        operatingMode,
        setupCompleted: true,
        onboardingCompleted: true,
        staticOrientation: operatingMode === 'static'
          ? {
              recommendedFacing: staticRecommendation.facingDirection,
              recommendedAzimuth: staticRecommendation.azimuth,
              recommendedTiltDeg: staticRecommendation.tilt,
              initialAlignmentDeg: Number.isFinite(staticAlignment) ? staticAlignment : staticRecommendation.tilt,
              recommendationSummary: staticRecommendation.summary,
              reason: staticRecommendation.reason,
              axisNote: staticRecommendation.axisNote,
            }
          : null,
        trackingPreferences: operatingMode === 'tracking'
          ? {
              summary: trackingRecommendation.summary,
              detail: trackingRecommendation.detail,
              axisNote: trackingRecommendation.axisNote,
            }
          : null,
      };

      const savedSetup = await saveUserSetup(session.uid, setupPayload);
      setUserSetup(savedSetup);
      navigate('/dashboard', { replace: true });
    } catch (saveError) {
      setError(getAuthErrorMessage(saveError, locale, t('onboarding.saveFallback')));
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  const renderStep = () => {
    const stepId = STEP_IDS[currentStep];

    if (stepId === 'welcome') {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/[0.08] bg-black/10 p-5">
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="mt-4 text-xl font-semibold text-white">{t('onboarding.welcomeCardTitle')}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {t('onboarding.welcomeCardBody')}
            </div>
          </div>

          <AuthInput
            label={t('onboarding.displayNameLabel')}
            hint={t('onboarding.displayNameHint')}
            type="text"
            autoComplete="name"
            placeholder={t('onboarding.displayNamePlaceholder')}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm leading-6 text-slate-400">
              {t('onboarding.welcomePill1')}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm leading-6 text-slate-400">
              {t('onboarding.welcomePill2')}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm leading-6 text-slate-400">
              {t('onboarding.welcomePill3')}
            </div>
          </div>
        </div>
      );
    }

    if (stepId === 'location') {
      return (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <SelectionCard
              selected={locationMethod === 'current'}
              icon={LocateFixed}
              title={t('onboarding.useCurrentLocationTitle')}
              body={t('onboarding.useCurrentLocationBody')}
              badge={t('common.recommended')}
              onClick={handleUseCurrentLocation}
            />

            <SelectionCard
              selected={locationMethod === 'manual'}
              icon={MapPinned}
              title={t('onboarding.manualLocationTitle')}
              body={t('onboarding.manualLocationBody')}
              onClick={() => {
                setLocationMethod('manual');
                setGeolocationState({ loading: false, error: '', success: '' });
              }}
            />
          </div>

          {geolocationState.loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {t('onboarding.readingLocation')}
            </div>
          ) : null}

          {geolocationState.success ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {geolocationState.success}
            </div>
          ) : null}

          {geolocationState.error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {geolocationState.error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <AuthInput
              label={t('onboarding.cityLabel')}
              type="text"
              placeholder={t('onboarding.cityPlaceholder')}
              value={locationForm.city}
              onChange={handleLocationChange('city')}
            />
            <AuthInput
              label={t('onboarding.regionLabel')}
              type="text"
              placeholder={t('onboarding.regionPlaceholder')}
              value={locationForm.region}
              onChange={handleLocationChange('region')}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <AuthInput
              label={t('onboarding.countryLabel')}
              type="text"
              placeholder={t('onboarding.countryPlaceholder')}
              value={locationForm.country}
              onChange={handleLocationChange('country')}
            />
            <AuthInput
              label={t('onboarding.latitudeLabel')}
              type="number"
              step="0.0001"
              placeholder="19.4326"
              value={locationForm.latitude}
              onChange={handleLocationChange('latitude')}
            />
            <AuthInput
              label={t('onboarding.longitudeLabel')}
              type="number"
              step="0.0001"
              placeholder="-99.1332"
              value={locationForm.longitude}
              onChange={handleLocationChange('longitude')}
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-4 text-sm leading-6 text-slate-400">
            {t('onboarding.locationHelp')}
          </div>
        </div>
      );
    }

    if (stepId === 'mode') {
      return (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <SelectionCard
              selected={operatingMode === 'tracking'}
              icon={MoveHorizontal}
              title={t('onboarding.trackingModeTitle')}
              body={t('onboarding.trackingModeBody')}
              badge={t('common.recommended')}
              onClick={() => setOperatingMode('tracking')}
            />

            <SelectionCard
              selected={operatingMode === 'static'}
              icon={Compass}
              title={t('onboarding.staticModeTitle')}
              body={t('onboarding.staticModeBody')}
              onClick={() => setOperatingMode('static')}
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-4 text-sm leading-6 text-slate-400">
            {t('onboarding.modeHelp')}
          </div>
        </div>
      );
    }

    if (stepId === 'details' && operatingMode === 'static') {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/[0.08] bg-black/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.staticOrientationTitle')}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{staticRecommendation.summary}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">{staticRecommendation.reason}</div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {staticRecommendation.axisNote}
            </div>
          </div>

          <AuthInput
            label={t('onboarding.initialAlignmentLabel')}
            hint={t('onboarding.initialAlignmentHint')}
            type="number"
            min="0"
            max="90"
            step="0.1"
            value={displayedAlignmentValue}
            onChange={(event) => {
              setAlignmentDirty(true);
              setAlignmentValue(event.target.value);
            }}
          />
        </div>
      );
    }

    if (stepId === 'details') {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/[0.08] bg-black/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.trackingBehaviorTitle')}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{trackingRecommendation.summary}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">{trackingRecommendation.detail}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm leading-6 text-slate-400">
              <div className="text-base font-medium text-white">{t('onboarding.followingSunPathTitle')}</div>
              <div className="mt-2">{trackingRecommendation.axisNote}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 text-sm leading-6 text-slate-400">
              <div className="text-base font-medium text-white">{t('onboarding.smartGuidanceTitle')}</div>
              <div className="mt-2">
                {t('onboarding.smartGuidanceBody')}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.profileLabel')}</div>
            <div className="mt-2 text-lg font-medium text-white">{displayName.trim()}</div>
            <div className="mt-1 text-sm text-slate-400">{session.email}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.locationLabel')}</div>
            <div className="mt-2 text-lg font-medium text-white">{locationLabel}</div>
            <div className="mt-1 text-sm text-slate-400">{t('onboarding.locationUsedFor')}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.operatingMode')}</div>
            <div className="mt-2 text-lg font-medium text-white">{operatingMode === 'tracking' ? t('onboarding.trackingModeTitle') : t('onboarding.staticModeTitle')}</div>
            <div className="mt-1 text-sm text-slate-400">
              {operatingMode === 'tracking' ? t('onboarding.modeSummaryTracking') : t('onboarding.modeSummaryStatic')}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/[0.08] bg-black/10 p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.readyTitle')}</div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {operatingMode === 'tracking' ? trackingRecommendation.summary : staticRecommendation.summary}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-400">
            {t('onboarding.readyBody')}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen glass-mesh-bg px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-300">
              <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
              {t('onboarding.badge')}
            </div>
            <h1 className="m-0 text-4xl font-semibold tracking-[-0.05em] text-white">{t('onboarding.title')}</h1>
            <p className="m-0 max-w-3xl text-sm leading-6 text-slate-400">
              {t('onboarding.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle />
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-300">
              {t('common.stepOf', { current: currentStep + 1, total: steps.length })}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <GlassCard delay={0.04} className="flex h-full flex-col gap-6 !p-6 md:!p-7">
            <div className="space-y-3">
              {steps.map((step, index) => (
                <StepMarker key={step.id} index={index} currentStep={currentStep} label={step.label} />
              ))}
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-black/10 p-5">
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300">
                <SunMedium className="h-5 w-5" />
              </div>
              <div className="mt-4 text-xl font-semibold text-white">{t('onboarding.unlockTitle')}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {t('onboarding.unlockBody')}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.workspaceUser')}</div>
                <div className="mt-2 text-base font-medium text-white">{displayName.trim() || t('onboarding.unsetDisplayName')}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.locationPreview')}</div>
                <div className="mt-2 text-base font-medium text-white">{locationLabel}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('onboarding.operatingMode')}</div>
                <div className="mt-2 text-base font-medium text-white">{operatingMode === 'tracking' ? t('onboarding.trackingModeTitle') : t('onboarding.staticModeTitle')}</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard delay={0.08} className="flex h-full flex-col gap-6 !p-6 md:!p-7">
            {error ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {renderStep()}

            <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 0 || saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('common.back')}
              </button>

              {currentStep === steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving || !canContinue}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  {t('common.finishSetup')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canContinue}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('common.continue')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
