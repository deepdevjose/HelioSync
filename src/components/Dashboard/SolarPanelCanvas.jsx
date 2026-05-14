import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { AlertTriangle, CheckCircle2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';
import * as THREE from 'three';
import { formatLocaleNumber, useLocale } from '../../i18n/locale';
import { buildSolarGeometryGuide } from '../../services/solarGeometry';

const PANEL_COLUMNS = 6;
const PANEL_ROWS = 10;
const PANEL_SURFACE_WIDTH = 2.84;
const PANEL_SURFACE_HEIGHT = 3.7;
const PANEL_CELL_GAP = 0.04;
const PANEL_CELL_WIDTH = (PANEL_SURFACE_WIDTH - (PANEL_COLUMNS - 1) * PANEL_CELL_GAP) / PANEL_COLUMNS;
const PANEL_CELL_HEIGHT = (PANEL_SURFACE_HEIGHT - (PANEL_ROWS - 1) * PANEL_CELL_GAP) / PANEL_ROWS;
const ALIGNMENT_TILT_TOLERANCE_DEG = 1.5;
const ALIGNMENT_INCIDENCE_TOLERANCE_DEG = 18;
const PANEL_LOCAL_WIDTH_AXIS = new THREE.Vector3(1, 0, 0);
const PANEL_LOCAL_LENGTH_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PANEL_PIVOT_OFFSET = new THREE.Vector3(0, 0.22, 0);
const PANEL_BASE_AZIMUTH = 180;
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 18.5;
const SOLAR_RADIUS = 9.3;
const MOBILE_VIEW_QUERY = '(max-width: 639px)';

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeDegrees(value, fallback = 0) {
  if (!isFiniteNumber(value)) {
    return fallback;
  }

  return ((value % 360) + 360) % 360;
}

function createPanelFaceTexture() {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#0E2235');
  background.addColorStop(0.52, '#071522');
  background.addColorStop(1, '#102A44');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = 30;
  const gap = 8;
  const cellWidth = (canvas.width - pad * 2 - gap * (PANEL_COLUMNS - 1)) / PANEL_COLUMNS;
  const cellHeight = (canvas.height - pad * 2 - gap * (PANEL_ROWS - 1)) / PANEL_ROWS;

  for (let row = 0; row < PANEL_ROWS; row += 1) {
    for (let column = 0; column < PANEL_COLUMNS; column += 1) {
      const x = pad + column * (cellWidth + gap);
      const y = pad + row * (cellHeight + gap);
      const cell = ctx.createLinearGradient(x, y, x + cellWidth, y + cellHeight);
      cell.addColorStop(0, '#164E79');
      cell.addColorStop(0.48, '#092038');
      cell.addColorStop(1, '#061320');

      ctx.fillStyle = cell;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
    }
  }

  const sheen = ctx.createLinearGradient(0, 0, canvas.width, canvas.height * 0.55);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
  sheen.addColorStop(0.18, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(canvas.width * 0.62, 0);
  ctx.lineTo(canvas.width * 0.2, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function dampAngle(current, target, easing, delta) {
  const shortestTarget = current + Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );

  return THREE.MathUtils.damp(current, shortestTarget, easing, delta);
}

function normalizeHour(hour) {
  if (!isFiniteNumber(hour)) {
    return 12;
  }

  const normalized = hour % 24;
  return normalized >= 0 ? normalized : normalized + 24;
}

function toSceneAzimuth(displayAzimuth) {
  return displayAzimuth - 180;
}

function toWorldVector(displayAzimuth, altitude, radius = SOLAR_RADIUS) {
  const azimuth = THREE.MathUtils.degToRad(toSceneAzimuth(displayAzimuth));
  const altitudeRad = THREE.MathUtils.degToRad(altitude);
  const horizontalRadius = Math.cos(altitudeRad) * radius;

  return new THREE.Vector3(
    Math.sin(azimuth) * horizontalRadius,
    0.95 + Math.sin(altitudeRad) * radius * 0.82,
    Math.cos(azimuth) * horizontalRadius * 0.94,
  );
}

function getSunState(simHour, lux = 0, solar) {
  if (
    solar?.valid &&
    isFiniteNumber(solar.azimuth_deg) &&
    isFiniteNumber(solar.elevation_deg)
  ) {
    const altitude = THREE.MathUtils.clamp(solar.elevation_deg, -8, 84);
    const azimuth = ((solar.azimuth_deg % 360) + 360) % 360;
    const daylight = altitude > 0;
    const position = toWorldVector(azimuth, altitude);
    const irradianceFactor = daylight
      ? THREE.MathUtils.clamp((lux || 0) / 70000, 0.18, 1)
      : 0.06;

    return {
      hour: normalizeHour(simHour),
      daylight,
      altitude,
      azimuth,
      position,
      irradianceFactor,
    };
  }

  const hour = normalizeHour(simHour);
  const daylightProgress = (hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  const clampedProgress = THREE.MathUtils.clamp(daylightProgress, 0, 1);
  const daylight = clampedProgress > 0 && clampedProgress < 1;
  const altitude = daylight
    ? 6 + Math.sin(clampedProgress * Math.PI) * 67
    : hour < SUNRISE_HOUR
      ? -6
      : -4;
  const azimuth = daylight
    ? 90 + clampedProgress * 180
    : hour < SUNRISE_HOUR
      ? 82
      : 278;
  const position = toWorldVector(azimuth, altitude);
  const irradianceFactor = daylight
    ? THREE.MathUtils.clamp((lux || 0) / 70000, 0.18, 1)
    : 0.06;

  return {
    hour,
    daylight,
    altitude,
    azimuth,
    position,
    irradianceFactor,
  };
}

function supportsTracking(mode) {
  const normalized = `${mode || ''}`.trim().toUpperCase();
  return normalized && normalized !== 'STATIC' && normalized !== 'OFF';
}

function applyPanelOrientation(vector, tilt, roll, scenePan) {
  return vector.clone()
    .applyAxisAngle(PANEL_LOCAL_LENGTH_AXIS, THREE.MathUtils.degToRad(roll))
    .applyAxisAngle(PANEL_LOCAL_WIDTH_AXIS, THREE.MathUtils.degToRad(tilt))
    .applyAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(scenePan));
}

function getPanelWorldPoint(x, y, z, tilt, roll, scenePan) {
  return applyPanelOrientation(new THREE.Vector3(x, y, z), tilt, roll, scenePan)
    .add(PANEL_PIVOT_OFFSET.clone());
}

function getPanelAzimuth(panel) {
  // The MPU6050 gives pitch/roll, not a reliable yaw; use measured heading only when telemetry has it.
  return normalizeDegrees(
    panel?.azimuth_deg ?? panel?.heading_deg ?? panel?.yaw_deg,
    PANEL_BASE_AZIMUTH,
  );
}

function getPanelState(panel, sun, guide) {
  const tracking = supportsTracking(panel?.tracking_mode);
  const measuredTilt = THREE.MathUtils.clamp(
    panel?.angle_measured_deg ?? panel?.angle_target_deg ?? 54,
    -25,
    88,
  );
  const measuredRoll = THREE.MathUtils.clamp(
    panel?.roll_deg ?? 0,
    -45,
    45,
  );
  const optimalTilt = THREE.MathUtils.clamp(
    guide?.targetTilt ?? panel?.angle_target_deg ?? measuredTilt,
    0,
    88,
  );
  const angleError = Math.abs(optimalTilt - measuredTilt);
  const tilt = measuredTilt;
  const roll = measuredRoll;
  const azimuth = getPanelAzimuth(panel);
  const scenePan = toSceneAzimuth(azimuth);
  const guideAzimuth = guide?.solarValid ? guide.targetAzimuth : azimuth;
  const guideScenePan = toSceneAzimuth(guideAzimuth);
  const guideTilt = optimalTilt;
  const guideRoll = 0;
  const normal = applyPanelOrientation(new THREE.Vector3(0, 1, 0), tilt, roll, scenePan).normalize();
  const targetNormal = applyPanelOrientation(new THREE.Vector3(0, 1, 0), guideTilt, guideRoll, guideScenePan).normalize();
  const pivot = PANEL_PIVOT_OFFSET.clone();
  const sunDirection = sun.position.clone().sub(PANEL_PIVOT_OFFSET).normalize();
  const incidenceAngle = THREE.MathUtils.radToDeg(normal.angleTo(sunDirection));
  const incidenceFactor = THREE.MathUtils.clamp(normal.dot(sunDirection), 0, 1);
  const normalEnd = pivot.clone().add(normal.clone().multiplyScalar(2.05));
  const targetNormalEnd = pivot.clone().add(targetNormal.clone().multiplyScalar(1.8));
  const sunVectorEnd = pivot.clone().add(sunDirection.clone().multiplyScalar(2.45));
  const arcPoints = Array.from({ length: 16 }, (_, index) => {
    const progress = index / 15;
    const direction = normal.clone().lerp(sunDirection, progress).normalize();
    return pivot.clone().add(direction.multiplyScalar(1.08));
  });

  const targetPoints = [
    getPanelWorldPoint(-1.04, 0.105, 1.02, tilt, roll, scenePan),
    getPanelWorldPoint(0, 0.115, 0.05, tilt, roll, scenePan),
    getPanelWorldPoint(1.04, 0.105, -0.98, tilt, roll, scenePan),
  ];
  const guideOutlinePoints = [
    getPanelWorldPoint(-1.68, 0.16, -2.12, guideTilt, guideRoll, guideScenePan),
    getPanelWorldPoint(1.68, 0.16, -2.12, guideTilt, guideRoll, guideScenePan),
    getPanelWorldPoint(1.68, 0.16, 2.12, guideTilt, guideRoll, guideScenePan),
    getPanelWorldPoint(-1.68, 0.16, 2.12, guideTilt, guideRoll, guideScenePan),
    getPanelWorldPoint(-1.68, 0.16, -2.12, guideTilt, guideRoll, guideScenePan),
  ];
  const actualOutlinePoints = [
    getPanelWorldPoint(-1.68, 0.18, -2.12, tilt, roll, scenePan),
    getPanelWorldPoint(1.68, 0.18, -2.12, tilt, roll, scenePan),
    getPanelWorldPoint(1.68, 0.18, 2.12, tilt, roll, scenePan),
    getPanelWorldPoint(-1.68, 0.18, 2.12, tilt, roll, scenePan),
    getPanelWorldPoint(-1.68, 0.18, -2.12, tilt, roll, scenePan),
  ];

  return {
    tracking,
    tilt,
    roll,
    measuredTilt,
    measuredRoll,
    optimalTilt,
    angleError,
    azimuth,
    scenePan,
    guideAzimuth,
    guideScenePan,
    guideTilt,
    guideOutlinePoints,
    actualOutlinePoints,
    pivot,
    normal,
    targetNormal,
    normalEnd,
    targetNormalEnd,
    sunDirection,
    sunVectorEnd,
    incidenceAngle,
    incidenceFactor,
    arcPoints,
    targetPoints,
  };
}

function getSolarState(data) {
  const guide = buildSolarGeometryGuide(data);
  const sun = getSunState(data?.simHour, data?.environment?.lux_bh1750, data?.solar);
  const panel = getPanelState(data?.panel, sun, guide);
  const powerFactor = THREE.MathUtils.clamp((data?.electrical?.power_w || 0) / 42, 0, 1);
  const solarImpact = THREE.MathUtils.clamp(
    panel.incidenceFactor * 0.68 + sun.irradianceFactor * 0.22 + powerFactor * 0.1,
    0,
    1,
  );

  return {
    sun,
    panel,
    solarImpact,
    guide,
  };
}

function getPanelMotionState(panel, t) {
  const mode = `${panel?.tracking_mode || ''}`.trim().toUpperCase();
  const angleError = Math.abs(panel?.angle_error_deg ?? 0);

  if (mode === 'STATIC') {
    return t('solar.staticMode');
  }

  if (panel?.servo_active || angleError > 2) {
    return t('solar.repositioning');
  }

  if (angleError > 0.6) {
    return t('solar.trackingActive');
  }

  return t('solar.aligned');
}

function getMountLabel(mode, t) {
  return supportsTracking(mode) ? t('solar.followingSunPath') : t('solar.recommendedAlignment');
}

function getIncidenceDescriptor(incidenceAngle, t) {
  if (incidenceAngle <= 18) {
    return t('solar.optimalAngle');
  }

  if (incidenceAngle <= 34) {
    return t('solar.alignedWithSun');
  }

  if (incidenceAngle <= 52) {
    return t('solar.capturingEfficiently');
  }

  return t('solar.reducedCapture');
}

function getAlignmentLocked(solarState) {
  return Boolean(
    solarState.guide?.solarValid &&
    solarState.panel.angleError <= ALIGNMENT_TILT_TOLERANCE_DEG &&
    solarState.panel.incidenceAngle <= ALIGNMENT_INCIDENCE_TOLERANCE_DEG,
  );
}

function useMobileSolarView() {
  const [mobileView, setMobileView] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_VIEW_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const media = window.matchMedia(MOBILE_VIEW_QUERY);
    const handleChange = () => setMobileView(media.matches);

    handleChange();
    media.addEventListener('change', handleChange);

    return () => media.removeEventListener('change', handleChange);
  }, []);

  return mobileView;
}

function CameraRig({ compact }) {
  const { camera } = useThree();
  const basePosition = useMemo(() => (
    compact
      ? new THREE.Vector3(1.55, 3.55, 7.25)
      : new THREE.Vector3(3.45, 5.15, 10.8)
  ), [compact]);
  const target = useMemo(() => (
    compact ? new THREE.Vector3(0, -0.2, 0) : new THREE.Vector3(0, -0.55, 0)
  ), [compact]);

  useEffect(() => {
    camera.position.copy(basePosition);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [basePosition, camera, target]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const animatedPosition = new THREE.Vector3(
      basePosition.x + Math.sin(time * 0.16) * 0.08,
      basePosition.y + Math.cos(time * 0.2) * 0.04,
      basePosition.z + Math.sin(time * 0.14) * 0.06,
    );

    camera.position.lerp(animatedPosition, 0.055);
    camera.lookAt(target);
  });

  return null;
}

function StageAtmosphere({ solarImpact }) {
  return (
    <group>
      <mesh position={[0, 1.1, -7.4]}>
        <planeGeometry args={[16, 10]} />
        <meshBasicMaterial color="#0A1220" />
      </mesh>

      <mesh position={[0.6, 0.4, -6.8]}>
        <ringGeometry args={[2.8, 5.2, 72]} />
        <meshBasicMaterial
          color={solarImpact > 0.6 ? '#274D71' : '#17304C'}
          transparent
          opacity={0.07}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, -1.9, -5.5]} rotation={[-Math.PI / 2.55, 0, 0]}>
        <planeGeometry args={[10.5, 5.6]} />
        <meshBasicMaterial color="#0B1422" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      <mesh position={[3.6, 0.6, -5.6]} rotation={[0, -0.48, 0]}>
        <planeGeometry args={[3.8, 7.2]} />
        <meshBasicMaterial color="#112237" transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SunAccent({ position, solarImpact }) {
  const sunRef = useRef();
  const haloRef = useRef();
  const ringRef = useRef();
  const horizontalFlareRef = useRef();
  const diagonalFlareRef = useRef();

  useFrame((state) => {
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 0.7) * 0.03;
    const drift = Math.sin(state.clock.elapsedTime * 0.16) * 0.16;

    if (sunRef.current) {
      sunRef.current.position.set(
        position.x + drift,
        position.y + Math.cos(state.clock.elapsedTime * 0.18) * 0.08,
        position.z - drift * 0.12,
      );
    }

    if (haloRef.current) {
      haloRef.current.scale.setScalar(pulse);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.08;
      ringRef.current.scale.setScalar(1.08 + Math.sin(state.clock.elapsedTime * 0.55) * 0.02);
    }

    if (horizontalFlareRef.current) {
      horizontalFlareRef.current.scale.x = 1 + Math.sin(state.clock.elapsedTime * 0.4) * 0.04;
    }

    if (diagonalFlareRef.current) {
      diagonalFlareRef.current.scale.y = 1 + Math.cos(state.clock.elapsedTime * 0.42) * 0.05;
    }
  });

  return (
    <group ref={sunRef} position={position.toArray()}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[1.28, 24, 24]} />
        <meshBasicMaterial
          color="#FDBA4D"
          transparent
          opacity={0.1 + solarImpact * 0.08}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.58, 24, 24]} />
        <meshBasicMaterial color="#FFE08A" />
      </mesh>

      <mesh ref={ringRef} rotation={[0, 0, Math.PI / 10]}>
        <ringGeometry args={[0.82, 1.42, 48]} />
        <meshBasicMaterial
          color="#FBBF24"
          transparent
          opacity={0.08 + solarImpact * 0.07}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={horizontalFlareRef} rotation={[0, 0, Math.PI / 10]}>
        <planeGeometry args={[4.6, 0.16]} />
        <meshBasicMaterial
          color="#FDE68A"
          transparent
          opacity={0.12 + solarImpact * 0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={diagonalFlareRef} rotation={[0, 0, -Math.PI / 4]}>
        <planeGeometry args={[3.1, 0.1]} />
        <meshBasicMaterial
          color="#FBBF24"
          transparent
          opacity={0.1 + solarImpact * 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SunLightRig({ sun, solarImpact }) {
  const directionalLightRef = useRef();
  const pointLightRef = useRef();
  const baseDirectionalIntensity = sun.daylight ? 2.2 + solarImpact * 2.2 : 0.24;
  const basePointIntensity = 11 + solarImpact * 6;
  const sunlightColor = solarImpact > 0.7 ? '#FFE7AE' : '#FDE68A';

  useFrame((state) => {
    const shimmer = 1 + Math.sin(state.clock.elapsedTime * 0.42) * 0.04;
    const drift = Math.sin(state.clock.elapsedTime * 0.16) * 0.12;
    const animatedPosition = new THREE.Vector3(
      sun.position.x + drift,
      sun.position.y + Math.cos(state.clock.elapsedTime * 0.18) * 0.06,
      sun.position.z - drift * 0.08,
    );

    if (directionalLightRef.current) {
      directionalLightRef.current.position.copy(animatedPosition);
      directionalLightRef.current.intensity = baseDirectionalIntensity * shimmer;
    }

    if (pointLightRef.current) {
      pointLightRef.current.position.copy(animatedPosition);
      pointLightRef.current.intensity = basePointIntensity * shimmer;
    }
  });

  return (
    <>
      <directionalLight
        ref={directionalLightRef}
        castShadow
        position={sun.position.toArray()}
        intensity={baseDirectionalIntensity}
        color={sunlightColor}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0006}
      />
      <pointLight
        ref={pointLightRef}
        position={sun.position.toArray()}
        intensity={basePointIntensity}
        distance={24}
        decay={1.7}
        color="#FFD18A"
      />
    </>
  );
}

function CompassDial({ panelAzimuth, sunAzimuth, label }) {
  return (
    <group position={[0, -2.9, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.72, 1.88, 64]} />
        <meshBasicMaterial color="#B8C3D4" transparent opacity={0.24} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.58, 48]} />
        <meshBasicMaterial color="#09111C" transparent opacity={0.48} />
      </mesh>

      <group rotation={[0, THREE.MathUtils.degToRad(toSceneAzimuth(panelAzimuth)), 0]}>
        <mesh position={[0, 0.05, 0.68]}>
          <boxGeometry args={[0.08, 0.04, 1.3]} />
          <meshBasicMaterial color="#7DD3FC" transparent opacity={0.9} />
        </mesh>
      </group>

      <group rotation={[0, THREE.MathUtils.degToRad(toSceneAzimuth(sunAzimuth)), 0]}>
        <mesh position={[0, 0.06, 0.82]}>
          <boxGeometry args={[0.06, 0.03, 1.58]} />
          <meshBasicMaterial color="#FBBF24" transparent opacity={0.88} />
        </mesh>
      </group>

      <Html position={[0, 0.16, -2.05]} center>
        <div className="pointer-events-none rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/72">
          {label}
        </div>
      </Html>
    </group>
  );
}

function IncidenceRays({ start, targets, intensity }) {
  const beamSets = useMemo(() => (
    targets.map((target, index) => {
      const spread = index - 1;
      const startPoint = start.clone().add(new THREE.Vector3(spread * 0.36, 0.22 - index * 0.06, -spread * 0.18));
      return {
        startPoint,
        targetPoint: target.clone(),
      };
    })
  ), [start, targets]);
  const glowOpacity = 0.05 + intensity * 0.18;
  const coreOpacity = 0.34 + intensity * 0.4;

  return (
    <group>
      {beamSets.map(({ startPoint, targetPoint }, index) => (
        <group key={`ray-${index}`}>
          <Line
            points={[startPoint.toArray(), targetPoint.toArray()]}
            color="#FDE68A"
            transparent
            opacity={glowOpacity - index * 0.02}
            lineWidth={1.65 - index * 0.16}
            depthWrite={false}
          />
          <Line
            points={[startPoint.toArray(), targetPoint.toArray()]}
            color="#FFF7CC"
            transparent
            opacity={coreOpacity - index * 0.03}
            lineWidth={0.62 - index * 0.04}
            depthWrite={false}
          />
          <mesh position={targetPoint.toArray()}>
            <sphereGeometry args={[0.05 + intensity * 0.02, 12, 12]} />
            <meshBasicMaterial
              color="#FDE68A"
              transparent
              opacity={0.12 + intensity * 0.12}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AngleGuide({ pivot, normalEnd, sunVectorEnd, arcPoints, incidenceAngle, solarImpact }) {
  const labelPosition = useMemo(() => (
    arcPoints[Math.floor(arcPoints.length * 0.55)].clone().add(new THREE.Vector3(0, 0.18, 0))
  ), [arcPoints]);

  return (
    <group>
      <Line
        points={[pivot.toArray(), normalEnd.toArray()]}
        color="#7DD3FC"
        transparent
        opacity={0.84}
        lineWidth={1.2}
        depthWrite={false}
      />
      <Line
        points={[pivot.toArray(), sunVectorEnd.toArray()]}
        color="#FCD34D"
        transparent
        opacity={0.82}
        lineWidth={1.1}
        depthWrite={false}
      />
      <Line
        points={arcPoints.map((point) => point.toArray())}
        color="#E2E8F0"
        transparent
        opacity={0.38 + solarImpact * 0.12}
        lineWidth={0.9}
        depthWrite={false}
      />

      <mesh position={normalEnd.toArray()}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#7DD3FC" transparent opacity={0.9} />
      </mesh>
      <mesh position={sunVectorEnd.toArray()}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#FCD34D" transparent opacity={0.9} />
      </mesh>

      <Html position={labelPosition.toArray()} center>
        <div className="pointer-events-none rounded-full border border-white/10 bg-black/38 px-2.5 py-1 text-[10px] font-semibold text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
          {incidenceAngle.toFixed(0)}°
        </div>
      </Html>
    </group>
  );
}

function TargetPanelGuide({ pivot, outlinePoints, normalEnd, label }) {
  return (
    <group>
      <Line
        points={outlinePoints.map((point) => point.toArray())}
        color="#FBBF24"
        transparent
        opacity={0.72}
        lineWidth={1.1}
        depthWrite={false}
      />
      <Line
        points={[pivot.toArray(), normalEnd.toArray()]}
        color="#FBBF24"
        transparent
        opacity={0.48}
        lineWidth={0.9}
        depthWrite={false}
      />
      <mesh position={normalEnd.toArray()}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color="#FBBF24" transparent opacity={0.84} />
      </mesh>
      <Html position={normalEnd.clone().add(new THREE.Vector3(0, 0.2, 0)).toArray()} center>
        <div className="pointer-events-none rounded-full border border-amber-300/20 bg-black/36 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
          {label}
        </div>
      </Html>
    </group>
  );
}

function ActualPanelGuide({ outlinePoints, normalEnd }) {
  return (
    <group>
      <Line
        points={outlinePoints.map((point) => point.toArray())}
        color="#7DD3FC"
        transparent
        opacity={1}
        lineWidth={2.6}
        depthWrite={false}
        depthTest={false}
      />
      <mesh position={normalEnd.toArray()}>
        <sphereGeometry args={[0.052, 12, 12]} />
        <meshBasicMaterial color="#67E8F9" transparent opacity={1} depthTest={false} fog={false} />
      </mesh>
    </group>
  );
}

function TrackerModel({ targetTilt, targetRoll, targetPan, solarImpact, castShadow = true }) {
  const heroRef = useRef();
  const azimuthRef = useRef();
  const tiltFrameRef = useRef();
  const rollFrameRef = useRef();
  const settleUntilRef = useRef(0);
  const panelTexture = useMemo(() => createPanelFaceTexture(), []);
  const frameColor = useMemo(() => {
    const color = new THREE.Color('#8796A8');
    return color.lerp(new THREE.Color('#DCE6F2'), solarImpact * 0.35);
  }, [solarImpact]);
  const glassTint = useMemo(() => {
    const color = new THREE.Color('#B9E4FF');
    return color.lerp(new THREE.Color('#FFF5D6'), solarImpact * 0.46);
  }, [solarImpact]);
  const glassOpacity = 0.08 + solarImpact * 0.1;
  const highlightOpacity = 0.08 + solarImpact * 0.18;
  const frameRails = [
    { key: 'left', position: [-1.66, 0.205, 0], args: [0.12, 0.09, 4.2] },
    { key: 'right', position: [1.66, 0.205, 0], args: [0.12, 0.09, 4.2] },
    { key: 'top', position: [0, 0.21, -2.12], args: [3.34, 0.1, 0.12] },
    { key: 'bottom', position: [0, 0.21, 2.12], args: [3.34, 0.1, 0.12] },
  ];

  useEffect(() => () => {
    panelTexture?.dispose();
  }, [panelTexture]);

  useFrame((state, delta) => {
    if (!heroRef.current || !azimuthRef.current || !tiltFrameRef.current || !rollFrameRef.current) {
      return;
    }

    const radTilt = THREE.MathUtils.degToRad(targetTilt);
    const radRoll = THREE.MathUtils.degToRad(targetRoll);
    const radPan = THREE.MathUtils.degToRad(targetPan);
    const time = state.clock.elapsedTime;
    const remainingPan = Math.abs(Math.atan2(
      Math.sin(radPan - azimuthRef.current.rotation.y),
      Math.cos(radPan - azimuthRef.current.rotation.y),
    ));
    const remainingTilt = Math.abs(tiltFrameRef.current.rotation.x - radTilt);
    const remainingRoll = Math.abs(rollFrameRef.current.rotation.z - radRoll);
    const remainingMotion = Math.max(remainingPan, remainingTilt, remainingRoll);

    if (remainingMotion > 0.018) {
      settleUntilRef.current = time + 0.18;
    }

    const easing = remainingMotion > 0.12
      ? 4.7
      : time < settleUntilRef.current
        ? 2.3
        : 3.4;

    heroRef.current.position.y = THREE.MathUtils.lerp(
      heroRef.current.position.y,
      -0.18,
      delta * 3,
    );

    heroRef.current.rotation.z = THREE.MathUtils.lerp(
      heroRef.current.rotation.z,
      0,
      delta * 2.4,
    );

    azimuthRef.current.rotation.y = dampAngle(
      azimuthRef.current.rotation.y,
      radPan,
      easing,
      delta,
    );

    tiltFrameRef.current.rotation.x = THREE.MathUtils.damp(
      tiltFrameRef.current.rotation.x,
      radTilt,
      easing,
      delta,
    );

    rollFrameRef.current.rotation.z = THREE.MathUtils.damp(
      rollFrameRef.current.rotation.z,
      radRoll,
      easing,
      delta,
    );
  });

  return (
    <group ref={heroRef}>
      <group ref={azimuthRef}>
        <mesh position={[0, -3.12, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <cylinderGeometry args={[0.95, 1.18, 0.24, 44]} />
          <meshStandardMaterial color="#1E293B" metalness={0.36} roughness={0.76} />
        </mesh>

        <mesh position={[0, -1.72, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <cylinderGeometry args={[0.17, 0.25, 2.86, 28]} />
          <meshStandardMaterial color="#64748B" metalness={0.5} roughness={0.5} />
        </mesh>

        <mesh position={[-0.58, -0.98, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <boxGeometry args={[0.13, 2.4, 0.16]} />
          <meshStandardMaterial color="#526175" metalness={0.5} roughness={0.48} />
        </mesh>

        <mesh position={[0.58, -0.98, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <boxGeometry args={[0.13, 2.4, 0.16]} />
          <meshStandardMaterial color="#526175" metalness={0.5} roughness={0.48} />
        </mesh>

        <mesh position={[-0.36, -2.25, 0]} rotation={[0, 0, 0.36]} castShadow={castShadow}>
          <boxGeometry args={[0.09, 1.42, 0.1]} />
          <meshStandardMaterial color="#475569" metalness={0.46} roughness={0.55} />
        </mesh>

        <mesh position={[0.36, -2.25, 0]} rotation={[0, 0, -0.36]} castShadow={castShadow}>
          <boxGeometry args={[0.09, 1.42, 0.1]} />
          <meshStandardMaterial color="#475569" metalness={0.46} roughness={0.55} />
        </mesh>

        <group ref={tiltFrameRef} position={[0, 0.22, 0]}>
          <group ref={rollFrameRef}>
            <mesh position={[0, -0.24, 1.82]} rotation={[0, 0, Math.PI / 2]} castShadow={castShadow} receiveShadow={castShadow}>
              <cylinderGeometry args={[0.18, 0.18, 1.24, 32]} />
              <meshStandardMaterial color="#94A3B8" metalness={0.55} roughness={0.3} />
            </mesh>

            <mesh position={[0, -0.24, 1.82]} castShadow={castShadow} receiveShadow={castShadow}>
              <boxGeometry args={[0.36, 0.4, 0.36]} />
              <meshStandardMaterial color="#607086" metalness={0.5} roughness={0.44} />
            </mesh>

            <mesh position={[-0.47, -0.42, 1.55]} rotation={[0, 0, 0.18]} castShadow={castShadow}>
              <boxGeometry args={[0.1, 0.98, 0.14]} />
              <meshStandardMaterial color="#64748B" metalness={0.48} roughness={0.48} />
            </mesh>

            <mesh position={[0.47, -0.42, 1.55]} rotation={[0, 0, -0.18]} castShadow={castShadow}>
              <boxGeometry args={[0.1, 0.98, 0.14]} />
              <meshStandardMaterial color="#64748B" metalness={0.48} roughness={0.48} />
            </mesh>

            <mesh position={[0, -0.055, 0]} castShadow={castShadow} receiveShadow={castShadow}>
              <boxGeometry args={[3.34, 0.18, 4.24]} />
              <meshPhysicalMaterial
                color={frameColor}
                metalness={0.82}
                roughness={0.2}
                clearcoat={1}
                clearcoatRoughness={0.08}
              />
            </mesh>

            <mesh position={[0, 0.06, 0]} castShadow={castShadow} receiveShadow={castShadow}>
              <boxGeometry args={[3.04, 0.045, 3.94]} />
              <meshBasicMaterial
                map={panelTexture}
                color="#B8F2FF"
                fog={false}
                toneMapped={false}
              />
            </mesh>

            <mesh position={[0, 0.172, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[3.02, 3.92]} />
              <meshBasicMaterial
                map={panelTexture}
                color="#D7FBFF"
                side={THREE.DoubleSide}
                fog={false}
                toneMapped={false}
              />
            </mesh>

            {frameRails.map((rail) => (
              <mesh key={rail.key} position={rail.position} castShadow={castShadow} receiveShadow={castShadow}>
                <boxGeometry args={rail.args} />
                <meshBasicMaterial
                  color="#D8E4F2"
                  fog={false}
                  toneMapped={false}
                />
              </mesh>
            ))}

            <mesh position={[0, 0.095, 0]}>
              <boxGeometry args={[3.05, 0.012, 3.95]} />
              <meshPhysicalMaterial
                color={glassTint}
                transparent
                opacity={glassOpacity}
                roughness={0.015}
                metalness={0}
                clearcoat={1}
                clearcoatRoughness={0.008}
                reflectivity={0.92}
                ior={1.45}
                depthWrite={false}
              />
            </mesh>

            <mesh position={[0, 0.122, 0]}>
              <boxGeometry args={[3.02, 0.01, 3.92]} />
              <meshBasicMaterial
                color="#38BDF8"
                transparent
                opacity={0.08 + solarImpact * 0.18}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <mesh position={[-0.44, 0.112, -0.26]} rotation={[-Math.PI / 2, 0, 0.2]}>
              <planeGeometry args={[2.24, 0.42]} />
              <meshBasicMaterial
                color="#FFF3CF"
                transparent
                opacity={highlightOpacity}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2.32, 2.37, 72]} />
              <meshBasicMaterial
                color="#7DD3FC"
                transparent
                opacity={0.14 + solarImpact * 0.08}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        </group>

        <mesh position={[0, -3.2, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <cylinderGeometry args={[1.18, 1.32, 0.22, 36]} />
          <meshStandardMaterial color="#1C2532" metalness={0.24} roughness={0.82} />
        </mesh>

        <mesh position={[0, -3.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[4.8, 48]} />
          <meshStandardMaterial color="#070D15" roughness={0.98} metalness={0.04} />
        </mesh>

        <mesh position={[0, -3.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 3.55, 64]} />
          <meshBasicMaterial
            color="#5AC8FA"
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <mesh position={[0.3, -2.92, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.35, 48]} />
          <meshBasicMaterial
            color="#FBBF24"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

      </group>
    </group>
  );
}

function Scene({ solarState, compact, azimuthLabel, targetGuideLabel }) {
  const { sun, panel, solarImpact } = solarState;

  return (
    <>
      <color attach="background" args={['#08111D']} />
      <fog attach="fog" args={['#08111D', 16, 30]} />
      <ambientLight intensity={0.68} color="#E8EEF8" />
      <hemisphereLight intensity={1.18} color="#F4FAFF" groundColor="#07101C" />
      <SunLightRig sun={sun} solarImpact={solarImpact} />
      <directionalLight position={[-4.8, 3.4, 6.4]} intensity={1.12} color="#8FD8FF" />
      <pointLight position={[-5, 0.9, -4]} intensity={1.05} distance={14} decay={2} color="#38BDF8" />

      <CameraRig compact={compact} />
      <StageAtmosphere solarImpact={solarImpact} />
      <SunAccent position={sun.position} solarImpact={solarImpact} />
      {!compact ? (
        <>
          <IncidenceRays start={sun.position} targets={panel.targetPoints} intensity={solarImpact} />
          <AngleGuide
            pivot={panel.pivot}
            normalEnd={panel.normalEnd}
            sunVectorEnd={panel.sunVectorEnd}
            arcPoints={panel.arcPoints}
            incidenceAngle={panel.incidenceAngle}
            solarImpact={solarImpact}
          />
          <TargetPanelGuide
            pivot={panel.pivot}
            outlinePoints={panel.guideOutlinePoints}
            normalEnd={panel.targetNormalEnd}
            label={targetGuideLabel}
          />
        </>
      ) : null}
      <ActualPanelGuide
        outlinePoints={panel.actualOutlinePoints}
        normalEnd={panel.normalEnd}
      />

      <mesh receiveShadow position={[0, -3.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13, 13]} />
        <shadowMaterial transparent opacity={0.3 + solarImpact * 0.08} />
      </mesh>

      <TrackerModel
        targetTilt={panel.tilt}
        targetRoll={panel.roll}
        targetPan={panel.scenePan}
        solarImpact={solarImpact}
      />
      {!compact ? (
        <CompassDial panelAzimuth={panel.guideAzimuth} sunAzimuth={sun.azimuth} label={azimuthLabel} />
      ) : null}

    </>
  );
}

function ContextLostFallback({ onRetry }) {
  const { t } = useLocale();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(9,12,20,0.98))] px-6 text-center">
      <div className="rounded-full border border-amber-400/20 bg-amber-400/10 p-4 text-amber-300">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h3 className="m-0 text-lg font-semibold text-white">{t('solar.contextLostTitle')}</h3>
        <p className="m-0 text-sm text-slate-300/80">
          {t('solar.contextLostBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12]"
      >
        <RotateCcw className="h-4 w-4" />
        {t('solar.retry3d')}
      </button>
    </div>
  );
}

export default function SolarPanelCanvas({ compact = false }) {
  const { locale, t } = useLocale();
  const telemetry = useHelioStore((state) => state.data);
  const mobileView = useMobileSolarView();
  const cleanupRef = useRef(() => {});
  const audioContextRef = useRef(null);
  const previousAlignedRef = useRef(false);
  const lastToneAtRef = useRef(0);
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [alignmentSoundEnabled, setAlignmentSoundEnabled] = useState(false);
  const solarState = useMemo(() => getSolarState(telemetry), [telemetry]);
  const guide = solarState.guide;
  const panelData = telemetry.panel;
  const alignmentLocked = useMemo(() => getAlignmentLocked(solarState), [solarState]);
  const motionState = useMemo(() => getPanelMotionState(panelData, t), [panelData, t]);
  const mountLabel = useMemo(() => getMountLabel(panelData.tracking_mode, t), [panelData.tracking_mode, t]);
  const incidenceDescriptor = useMemo(
    () => getIncidenceDescriptor(solarState.panel.incidenceAngle, t),
    [solarState.panel.incidenceAngle, t],
  );
  const compactView = compact || mobileView;
  const solarImpactPercent = Math.round(solarState.solarImpact * 100);

  const playAlignmentTone = useCallback((force = false) => {
    if (!force && !alignmentSoundEnabled) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
  }, [alignmentSoundEnabled]);

  useEffect(() => () => {
    cleanupRef.current();
    audioContextRef.current?.close?.();
  }, []);

  useEffect(() => {
    const wasAligned = previousAlignedRef.current;
    previousAlignedRef.current = alignmentLocked;

    if (!alignmentSoundEnabled || !alignmentLocked || wasAligned) {
      return;
    }

    const now = Date.now();
    if (now - lastToneAtRef.current < 2500) {
      return;
    }

    lastToneAtRef.current = now;
    playAlignmentTone(true);
  }, [alignmentLocked, alignmentSoundEnabled, playAlignmentTone]);

  const handleCreated = ({ gl, camera }) => {
    const canvas = gl.domElement;
    const wrapper = canvas.parentElement;

    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    });

    if (wrapper) {
      Object.assign(wrapper.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
      });
    }

    const pixelRatio = typeof window === 'undefined'
      ? 1
      : Math.min(window.devicePixelRatio || 1, compactView ? 1.15 : 1.45);

    gl.setPixelRatio(pixelRatio);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = compactView ? 1.16 : 1.08;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;

    const resizeCanvas = () => {
      const bounds = wrapper?.parentElement?.getBoundingClientRect();
      if (!bounds?.width || !bounds?.height) {
        return;
      }

      gl.setSize(bounds.width, bounds.height, false);

      if ('aspect' in camera) {
        camera.aspect = bounds.width / bounds.height;
        camera.updateProjectionMatrix();
      }
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      setContextLost(true);
    };

    const handleContextRestored = () => {
      setContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    window.requestAnimationFrame(resizeCanvas);

    cleanupRef.current = () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
      window.removeEventListener('resize', resizeCanvas);
    };
  };

  const handleRetry = () => {
    cleanupRef.current();
    setContextLost(false);
    setCanvasKey((value) => value + 1);
  };

  const handleToggleSound = () => {
    const nextEnabled = !alignmentSoundEnabled;
    setAlignmentSoundEnabled(nextEnabled);

    if (nextEnabled && alignmentLocked) {
      lastToneAtRef.current = Date.now();
      playAlignmentTone(true);
    }
  };

  return (
    <div className={`heliosync-solar-canvas relative w-full min-w-0 overflow-hidden rounded-[22px] glass-panel group shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-shadow hover:shadow-[0_0_40px_rgba(56,189,248,0.1)] sm:rounded-3xl ${
      compactView ? 'h-[430px] sm:h-[300px]' : 'h-[360px] sm:h-[500px] lg:h-[660px]'
    }`}>
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(circle at 18% 20%, rgba(251, 191, 36, 0.12), transparent 24%), radial-gradient(circle at 84% 28%, rgba(125, 211, 252, 0.08), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.05))',
        }}
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24"
        style={{
          background: 'linear-gradient(180deg, rgba(8,17,29,0), rgba(8,17,29,0.58))',
        }}
      />

      <div className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-6.5rem)] rounded-full border border-white/10 bg-black/44 px-2.5 py-1 text-[9px] font-mono text-gray-300 shadow-md backdrop-blur sm:left-4 sm:top-4 sm:max-w-none sm:px-3 sm:text-xs">
        {t('solar.tilt')} {formatLocaleNumber(locale, solarState.panel.measuredTilt, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}° · {t('solar.roll')} {formatLocaleNumber(locale, solarState.panel.measuredRoll, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}°
        {Math.abs(panelData.angle_error_deg) > 0.5 && (
          <span className="ml-2 hidden text-red-400 sm:inline">{t('solar.error')}: {formatLocaleNumber(locale, panelData.angle_error_deg, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}°</span>
        )}
      </div>
      <div className="absolute right-2.5 top-2.5 z-10 flex max-w-[8.5rem] flex-col items-end gap-2 sm:right-4 sm:top-4 sm:max-w-none">
        <div className={`rounded-2xl border px-2.5 py-1.5 text-right shadow-[0_0_20px_rgba(56,189,248,0.12)] backdrop-blur sm:px-3 sm:py-2 ${
          alignmentLocked
            ? 'border-emerald-300/24 bg-emerald-400/12'
            : 'border-helium-500/18 bg-black/42'
        }`}>
          <div className={`inline-flex items-center justify-end gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] sm:gap-1.5 sm:text-[11px] sm:tracking-[0.2em] ${
            alignmentLocked ? 'text-emerald-100' : 'text-helium-300'
          }`}>
            {alignmentLocked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            <span>{motionState}</span>
          </div>
          <div className="mt-1 hidden text-[10px] uppercase tracking-[0.18em] text-slate-400 sm:block">{mountLabel}</div>
        </div>
        <button
          type="button"
          aria-pressed={alignmentSoundEnabled}
          aria-label={alignmentSoundEnabled ? t('solar.disableAlignmentSound') : t('solar.enableAlignmentSound')}
          onClick={handleToggleSound}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition backdrop-blur sm:px-3 sm:py-2 sm:text-xs ${
            alignmentSoundEnabled
              ? 'border-emerald-300/24 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/18'
              : 'border-white/10 bg-black/36 text-slate-300 hover:bg-white/10'
          }`}
        >
          {alignmentSoundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span>{alignmentSoundEnabled ? t('solar.soundOn') : t('solar.soundOff')}</span>
        </button>
      </div>
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 rounded-2xl border border-white/10 bg-black/38 px-3 py-2.5 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)] sm:bottom-4 sm:left-1/2 sm:right-auto sm:min-w-[240px] sm:-translate-x-1/2 sm:px-4 sm:py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/55">
          {t('solar.alignmentLabel')}
        </div>
        <div className="mt-1 text-base font-semibold text-white sm:text-lg">
          {solarImpactPercent}%
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10 sm:mt-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              alignmentLocked ? 'bg-emerald-300' : 'bg-helium-300'
            }`}
            style={{ width: `${solarImpactPercent}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-slate-300/80 sm:text-xs">
          {t('solar.sunLine', {
            azimuth: formatLocaleNumber(locale, solarState.sun.azimuth, { maximumFractionDigits: 0 }),
            delta: formatLocaleNumber(locale, solarState.panel.incidenceAngle, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          })}
        </div>
        {alignmentLocked ? (
          <div className="mt-1 text-xs font-medium text-emerald-100/85">{t('solar.alignmentLocked')}</div>
        ) : null}
      </div>
      <div className="absolute bottom-[5.8rem] left-3 right-3 z-10 hidden rounded-2xl border border-amber-400/14 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(0,0,0,0.18))] px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.24)] sm:bottom-4 sm:left-auto sm:right-4 sm:block sm:w-auto">
        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-amber-100/70">
          {t('solar.geometryLabel')}
        </div>
        <div className="mt-1 text-sm font-medium text-white">
          {t('solar.targetGeometry', {
            azimuth: formatLocaleNumber(locale, guide.targetAzimuth, { maximumFractionDigits: 0 }),
            tilt: formatLocaleNumber(locale, guide.targetTilt, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          })}
        </div>
        <div className="mt-1 text-xs text-amber-100/75">
          {t('solar.altHour', {
            altitude: formatLocaleNumber(locale, solarState.sun.altitude, { maximumFractionDigits: 0 }),
            hour: formatLocaleNumber(locale, solarState.sun.hour, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          })}
        </div>
        <div className="mt-1 text-xs text-amber-100/60">
          {incidenceDescriptor}
        </div>
      </div>

      {contextLost ? (
        <ContextLostFallback onRetry={handleRetry} />
      ) : (
        <div className="heliosync-canvas-stage absolute inset-0">
          <Canvas
            key={canvasKey}
            className="h-full w-full"
            dpr={compactView ? [1, 1.15] : [1, 1.45]}
            shadows
            camera={{ position: compactView ? [1.55, 3.55, 7.25] : [3.45, 5.15, 10.8], fov: compactView ? 39 : 40 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'default',
              preserveDrawingBuffer: false,
              stencil: false,
            }}
            onCreated={handleCreated}
          >
            <Scene
              solarState={solarState}
              compact={compactView}
              azimuthLabel={t('solar.panelSunAzimuth')}
              targetGuideLabel={t('solar.targetPanelGuide')}
            />
          </Canvas>
        </div>
      )}
    </div>
  );
}
