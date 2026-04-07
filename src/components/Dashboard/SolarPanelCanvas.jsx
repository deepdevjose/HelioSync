import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useHelioStore } from '../../store/useHelioStore';
import * as THREE from 'three';
import { formatLocaleNumber, useLocale } from '../../i18n/locale';

const PANEL_COLUMNS = 6;
const PANEL_ROWS = 10;
const PANEL_SURFACE_WIDTH = 2.84;
const PANEL_SURFACE_HEIGHT = 3.7;
const PANEL_CELL_GAP = 0.04;
const PANEL_CELL_WIDTH = (PANEL_SURFACE_WIDTH - (PANEL_COLUMNS - 1) * PANEL_CELL_GAP) / PANEL_COLUMNS;
const PANEL_CELL_HEIGHT = (PANEL_SURFACE_HEIGHT - (PANEL_ROWS - 1) * PANEL_CELL_GAP) / PANEL_ROWS;
const PANEL_CELL_POSITIONS = Array.from({ length: PANEL_COLUMNS * PANEL_ROWS }, (_, index) => {
  const column = index % PANEL_COLUMNS;
  const row = Math.floor(index / PANEL_COLUMNS);

  return {
    key: `${row}-${column}`,
    x: (-PANEL_SURFACE_WIDTH / 2) + (PANEL_CELL_WIDTH / 2) + column * (PANEL_CELL_WIDTH + PANEL_CELL_GAP),
    z: (-PANEL_SURFACE_HEIGHT / 2) + (PANEL_CELL_HEIGHT / 2) + row * (PANEL_CELL_HEIGHT + PANEL_CELL_GAP),
  };
});

const FRAME_RAIL_X = [-1.18, 1.18];
const FRAME_RAIL_Z = [-1.72, -0.58, 0.58, 1.72];
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PANEL_PIVOT_OFFSET = new THREE.Vector3(0, 0.22, 0);
const PANEL_BASE_AZIMUTH = 180;
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 18.5;
const SOLAR_RADIUS = 9.3;

function isFiniteNumber(value) {
  return Number.isFinite(value);
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

function getSunState(simHour, lux = 0) {
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

function getPanelWorldPoint(x, y, z, tilt, scenePan) {
  return new THREE.Vector3(x, y, z)
    .applyAxisAngle(WORLD_RIGHT, THREE.MathUtils.degToRad(tilt))
    .applyAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(scenePan))
    .add(PANEL_PIVOT_OFFSET.clone());
}

function getPanelState(panel, sun) {
  const tracking = supportsTracking(panel?.tracking_mode);
  const measuredTilt = THREE.MathUtils.clamp(
    panel?.angle_measured_deg ?? panel?.angle_target_deg ?? 54,
    0,
    78,
  );
  const optimalTilt = THREE.MathUtils.clamp(
    panel?.angle_target_deg ?? measuredTilt,
    0,
    78,
  );
  const angleError = Math.abs(panel?.angle_error_deg ?? (optimalTilt - measuredTilt));
  const tilt = angleError > 2 || panel?.servo_active
    ? optimalTilt
    : measuredTilt;
  const azimuth = tracking
    ? THREE.MathUtils.clamp(sun.azimuth, 110, 250)
    : PANEL_BASE_AZIMUTH;
  const scenePan = toSceneAzimuth(azimuth);
  const normal = new THREE.Vector3(0, 1, 0)
    .applyAxisAngle(WORLD_RIGHT, THREE.MathUtils.degToRad(tilt))
    .applyAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(scenePan))
    .normalize();
  const pivot = PANEL_PIVOT_OFFSET.clone();
  const sunDirection = sun.position.clone().sub(PANEL_PIVOT_OFFSET).normalize();
  const incidenceAngle = THREE.MathUtils.radToDeg(normal.angleTo(sunDirection));
  const incidenceFactor = THREE.MathUtils.clamp(normal.dot(sunDirection), 0, 1);
  const normalEnd = pivot.clone().add(normal.clone().multiplyScalar(2.05));
  const sunVectorEnd = pivot.clone().add(sunDirection.clone().multiplyScalar(2.45));
  const arcPoints = Array.from({ length: 16 }, (_, index) => {
    const progress = index / 15;
    const direction = normal.clone().lerp(sunDirection, progress).normalize();
    return pivot.clone().add(direction.multiplyScalar(1.08));
  });

  const targetPoints = [
    getPanelWorldPoint(-1.04, 0.105, 1.02, tilt, scenePan),
    getPanelWorldPoint(0, 0.115, 0.05, tilt, scenePan),
    getPanelWorldPoint(1.04, 0.105, -0.98, tilt, scenePan),
  ];

  return {
    tracking,
    tilt,
    measuredTilt,
    optimalTilt,
    angleError,
    azimuth,
    scenePan,
    pivot,
    normal,
    normalEnd,
    sunDirection,
    sunVectorEnd,
    incidenceAngle,
    incidenceFactor,
    arcPoints,
    targetPoints,
  };
}

function getSolarState(data) {
  const sun = getSunState(data?.simHour, data?.environment?.lux_bh1750);
  const panel = getPanelState(data?.panel, sun);
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

function CameraRig({ compact }) {
  const { camera } = useThree();

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const basePosition = compact
      ? new THREE.Vector3(4.7, 2.95, 6.1)
      : new THREE.Vector3(5.95, 3.45, 7.05);
    const animatedPosition = new THREE.Vector3(
      basePosition.x + Math.sin(time * 0.22) * 0.16,
      basePosition.y + Math.cos(time * 0.32) * 0.08,
      basePosition.z + Math.sin(time * 0.18) * 0.12,
    );

    camera.position.lerp(animatedPosition, 0.04);
    camera.lookAt(0, -0.55, 0);
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

function TrackerModel({ targetTilt, targetPan, solarImpact, castShadow = true }) {
  const heroRef = useRef();
  const pivotRef = useRef();
  const panelRef = useRef();
  const settleUntilRef = useRef(0);
  const frameColor = useMemo(() => {
    const color = new THREE.Color('#9CA8B6');
    return color.lerp(new THREE.Color('#DEE6EF'), solarImpact * 0.45);
  }, [solarImpact]);
  const cellColor = useMemo(() => {
    const color = new THREE.Color('#071321');
    return color.lerp(new THREE.Color('#164D83'), solarImpact * 0.92);
  }, [solarImpact]);
  const cellEmissive = useMemo(() => {
    const color = new THREE.Color('#08111C');
    return color.lerp(new THREE.Color('#245A9B'), solarImpact * 0.62);
  }, [solarImpact]);
  const coreSurfaceColor = useMemo(() => {
    const color = new THREE.Color('#09131E');
    return color.lerp(new THREE.Color('#12304D'), solarImpact * 0.72);
  }, [solarImpact]);
  const glassTint = useMemo(() => {
    const color = new THREE.Color('#CFE6FF');
    return color.lerp(new THREE.Color('#FFFFFF'), solarImpact * 0.5);
  }, [solarImpact]);
  const heatColor = useMemo(() => {
    const color = new THREE.Color('#60A5FA');
    return color.lerp(new THREE.Color('#FBBF24'), solarImpact);
  }, [solarImpact]);
  const glassOpacity = 0.05 + solarImpact * 0.14;
  const highlightOpacity = 0.04 + solarImpact * 0.24;
  const streakOpacity = 0.02 + solarImpact * 0.2;

  useFrame((state, delta) => {
    if (!heroRef.current || !pivotRef.current || !panelRef.current) {
      return;
    }

    const radTilt = THREE.MathUtils.degToRad(targetTilt);
    const radPan = THREE.MathUtils.degToRad(targetPan);
    const time = state.clock.elapsedTime;
    const remainingPan = Math.abs(pivotRef.current.rotation.y - radPan);
    const remainingTilt = Math.abs(panelRef.current.rotation.x - radTilt);
    const remainingMotion = Math.max(remainingPan, remainingTilt);

    if (remainingMotion > 0.018) {
      settleUntilRef.current = time + 0.18;
    }

    const easing = remainingMotion > 0.12
      ? 3.8
      : time < settleUntilRef.current
        ? 1.55
        : 2.35;

    heroRef.current.position.y = THREE.MathUtils.lerp(
      heroRef.current.position.y,
      -0.35 + Math.sin(time * 0.55) * 0.04,
      delta * 2,
    );

    heroRef.current.rotation.z = THREE.MathUtils.lerp(
      heroRef.current.rotation.z,
      Math.sin(time * 0.38) * 0.018,
      delta * 1.2,
    );

    pivotRef.current.rotation.y = THREE.MathUtils.damp(
      pivotRef.current.rotation.y,
      radPan,
      easing,
      delta,
    );

    panelRef.current.rotation.x = THREE.MathUtils.damp(
      panelRef.current.rotation.x,
      radTilt,
      easing,
      delta,
    );
  });

  return (
    <group ref={heroRef}>
      <group ref={pivotRef}>
        <mesh position={[0, -3.1, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <cylinderGeometry args={[0.88, 1.02, 0.18, 36]} />
          <meshStandardMaterial color="#2D3748" metalness={0.4} roughness={0.72} />
        </mesh>

        <mesh position={[0, -1.65, 0]} castShadow={castShadow} receiveShadow={castShadow}>
          <cylinderGeometry args={[0.16, 0.24, 3.05, 24]} />
          <meshStandardMaterial color="#64748B" metalness={0.52} roughness={0.48} />
        </mesh>

        <mesh position={[-0.34, -2.25, 0]} rotation={[0, 0, 0.34]} castShadow={castShadow}>
          <boxGeometry args={[0.08, 1.35, 0.08]} />
          <meshStandardMaterial color="#475569" metalness={0.46} roughness={0.55} />
        </mesh>

        <mesh position={[0.34, -2.25, 0]} rotation={[0, 0, -0.34]} castShadow={castShadow}>
          <boxGeometry args={[0.08, 1.35, 0.08]} />
          <meshStandardMaterial color="#475569" metalness={0.46} roughness={0.55} />
        </mesh>

        <mesh position={[0, -0.18, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={castShadow}>
          <cylinderGeometry args={[0.24, 0.24, 0.92, 24]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.55} roughness={0.3} />
        </mesh>

        <group ref={panelRef} position={[0, 0.22, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow={castShadow} receiveShadow={castShadow}>
            <boxGeometry args={[0.24, 0.34, 0.24]} />
            <meshStandardMaterial color="#64748B" metalness={0.5} roughness={0.44} />
          </mesh>

          <mesh position={[-0.96, -0.14, 0]} castShadow={castShadow} receiveShadow={castShadow}>
            <boxGeometry args={[0.08, 0.18, 3.58]} />
            <meshPhysicalMaterial
              color={frameColor}
              metalness={0.9}
              roughness={0.14}
              clearcoat={1}
              clearcoatRoughness={0.04}
            />
          </mesh>

          <mesh position={[0.96, -0.14, 0]} castShadow={castShadow} receiveShadow={castShadow}>
            <boxGeometry args={[0.08, 0.18, 3.58]} />
            <meshPhysicalMaterial
              color={frameColor}
              metalness={0.9}
              roughness={0.14}
              clearcoat={1}
              clearcoatRoughness={0.04}
            />
          </mesh>

          <mesh castShadow={castShadow} receiveShadow={castShadow}>
            <boxGeometry args={[3.26, 0.14, 4.18]} />
            <meshPhysicalMaterial
              color={frameColor}
              metalness={0.94}
              roughness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.04}
            />
          </mesh>

          <mesh position={[0, 0.032, 0]} receiveShadow={castShadow}>
            <boxGeometry args={[2.98, 0.06, 3.92]} />
            <meshPhysicalMaterial
              color={coreSurfaceColor}
              emissive={cellEmissive}
              emissiveIntensity={0.04 + solarImpact * 0.12}
              metalness={0.52}
              roughness={0.36 - solarImpact * 0.18}
              clearcoat={1}
              clearcoatRoughness={0.02}
            />
          </mesh>

          {PANEL_CELL_POSITIONS.map((cell) => (
            <mesh key={cell.key} position={[cell.x, 0.058, cell.z]}>
              <boxGeometry args={[PANEL_CELL_WIDTH, 0.013, PANEL_CELL_HEIGHT]} />
              <meshPhysicalMaterial
                color={cellColor}
                emissive={cellEmissive}
                emissiveIntensity={0.06 + solarImpact * 0.16}
                metalness={0.74}
                roughness={0.2 - solarImpact * 0.08}
                clearcoat={1}
                clearcoatRoughness={0.02}
              />
            </mesh>
          ))}

          <mesh position={[0, 0.078, 0]}>
            <boxGeometry args={[2.98, 0.01, 3.92]} />
            <meshPhysicalMaterial
              color={glassTint}
              transparent
              opacity={glassOpacity}
              roughness={0.015}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.008}
              transmission={0.28 + solarImpact * 0.18}
              reflectivity={0.92}
              ior={1.45}
            />
          </mesh>

          <mesh position={[-0.32, 0.09, -0.18]} rotation={[0.02, 0.18, 0.02]}>
            <planeGeometry args={[2.26, 0.62]} />
            <meshBasicMaterial
              color="#FFF3CF"
              transparent
              opacity={highlightOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          <mesh position={[0.48, 0.094, 0.18]} rotation={[0.01, -0.14, 0.04]}>
            <planeGeometry args={[1.56, 0.14]} />
            <meshBasicMaterial
              color="#FFFFFF"
              transparent
              opacity={streakOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          <mesh position={[0.22, 0.083, 0.18]} rotation={[-Math.PI / 2, 0.22, 0]}>
            <planeGeometry args={[2.36, 1.04]} />
            <meshBasicMaterial
              color={heatColor}
              transparent
              opacity={0.04 + solarImpact * 0.18}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {FRAME_RAIL_X.map((x) => (
            <mesh key={`rail-x-${x}`} position={[x, 0.07, 0]} receiveShadow={castShadow}>
              <boxGeometry args={[0.05, 0.018, 3.92]} />
              <meshPhysicalMaterial
                color={frameColor}
                emissive="#6EA6C8"
                emissiveIntensity={0.03}
                metalness={0.86}
                roughness={0.14}
                clearcoat={1}
                clearcoatRoughness={0.03}
              />
            </mesh>
          ))}

          {FRAME_RAIL_Z.map((z) => (
            <mesh key={`rail-z-${z}`} position={[0, 0.07, z]} receiveShadow={castShadow}>
              <boxGeometry args={[2.96, 0.018, 0.05]} />
              <meshPhysicalMaterial
                color={frameColor}
                emissive="#6EA6C8"
                emissiveIntensity={0.02}
                metalness={0.84}
                roughness={0.14}
                clearcoat={1}
                clearcoatRoughness={0.03}
              />
            </mesh>
          ))}
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

function Scene({ solarState, compact, geometryLabel, azimuthLabel }) {
  const { sun, panel, solarImpact } = solarState;

  return (
    <>
      <color attach="background" args={['#08111D']} />
      <fog attach="fog" args={['#08111D', 8, 16]} />
      <ambientLight intensity={0.48} color="#E8EEF8" />
      <hemisphereLight intensity={0.96} color="#F4FAFF" groundColor="#07101C" />
      <SunLightRig sun={sun} solarImpact={solarImpact} />
      <directionalLight position={[-4.8, 2.6, 6.4]} intensity={0.92} color="#8FD8FF" />
      <pointLight position={[-5, 0.9, -4]} intensity={1.05} distance={14} decay={2} color="#38BDF8" />

      <CameraRig compact={compact} />
      <StageAtmosphere solarImpact={solarImpact} />
      <SunAccent position={sun.position} solarImpact={solarImpact} />
      <IncidenceRays start={sun.position} targets={panel.targetPoints} intensity={solarImpact} />
      <AngleGuide
        pivot={panel.pivot}
        normalEnd={panel.normalEnd}
        sunVectorEnd={panel.sunVectorEnd}
        arcPoints={panel.arcPoints}
        incidenceAngle={panel.incidenceAngle}
        solarImpact={solarImpact}
      />

      <mesh receiveShadow position={[0, -3.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13, 13]} />
        <shadowMaterial transparent opacity={0.3 + solarImpact * 0.08} />
      </mesh>

      <TrackerModel targetTilt={panel.tilt} targetPan={panel.scenePan} solarImpact={solarImpact} />
      <CompassDial panelAzimuth={panel.azimuth} sunAzimuth={sun.azimuth} label={azimuthLabel} />

      <Html position={[0, 2.7, 0]} center>
        <div className="pointer-events-none rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.28em] text-white/85 shadow-[0_0_30px_rgba(255,255,255,0.08)]">
          {geometryLabel}
        </div>
      </Html>
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
  const cleanupRef = useRef(() => {});
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const solarState = useMemo(() => getSolarState(telemetry), [telemetry]);
  const panelData = telemetry.panel;
  const motionState = useMemo(() => getPanelMotionState(panelData, t), [panelData, t]);
  const mountLabel = useMemo(() => getMountLabel(panelData.tracking_mode, t), [panelData.tracking_mode, t]);
  const incidenceDescriptor = useMemo(
    () => getIncidenceDescriptor(solarState.panel.incidenceAngle, t),
    [solarState.panel.incidenceAngle, t],
  );

  useEffect(() => () => cleanupRef.current(), []);

  const handleCreated = ({ gl }) => {
    const canvas = gl.domElement;

    gl.setPixelRatio(1);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = compact ? 1 : 1.08;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;

    const handleContextLost = (event) => {
      event.preventDefault();
      setContextLost(true);
    };

    const handleContextRestored = () => {
      setContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    cleanupRef.current = () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
    };
  };

  const handleRetry = () => {
    cleanupRef.current();
    setContextLost(false);
    setCanvasKey((value) => value + 1);
  };

  return (
    <div className={`relative w-full min-w-0 overflow-hidden rounded-3xl glass-panel group shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-shadow hover:shadow-[0_0_40px_rgba(56,189,248,0.1)] ${compact ? 'h-[240px] sm:h-[280px]' : 'h-[360px] sm:h-[430px] lg:h-[620px]'}`}>
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

      <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10 text-xs font-mono text-gray-300 shadow-md">
        {t('solar.tilt')} {formatLocaleNumber(locale, solarState.panel.measuredTilt, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}° · {t('solar.azimuth')} {formatLocaleNumber(locale, solarState.panel.azimuth, { maximumFractionDigits: 0 })}°
        {Math.abs(panelData.angle_error_deg) > 0.5 && (
          <span className="ml-2 text-red-400">{t('solar.error')}: {formatLocaleNumber(locale, panelData.angle_error_deg, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}°</span>
        )}
      </div>
      <div className="absolute top-4 right-4 z-10 rounded-2xl border border-helium-500/18 bg-black/42 px-3 py-2 text-right shadow-[0_0_20px_rgba(56,189,248,0.12)] backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-helium-300">{motionState}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{mountLabel}</div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/10 bg-black/34 px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)] sm:left-1/2 sm:right-auto sm:min-w-[240px] sm:-translate-x-1/2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/55">
          {t('solar.alignmentLabel')}
        </div>
        <div className="mt-1 text-lg font-semibold text-white">
          {Math.round(solarState.solarImpact * 100)}%
        </div>
        <div className="mt-1 text-xs text-slate-300/80">
          {t('solar.sunLine', {
            azimuth: formatLocaleNumber(locale, solarState.sun.azimuth, { maximumFractionDigits: 0 }),
            delta: formatLocaleNumber(locale, solarState.panel.incidenceAngle, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          })}
        </div>
      </div>
      <div className="absolute bottom-4 right-4 z-10 rounded-2xl border border-amber-400/14 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(0,0,0,0.18))] px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-amber-100/70">
          {t('solar.geometryLabel')}
        </div>
        <div className="mt-1 text-sm font-medium text-white">
          {t('solar.altHour', {
            altitude: formatLocaleNumber(locale, solarState.sun.altitude, { maximumFractionDigits: 0 }),
            hour: formatLocaleNumber(locale, solarState.sun.hour, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          })}
        </div>
        <div className="mt-1 text-xs text-amber-100/75">
          {incidenceDescriptor}
        </div>
      </div>

      {contextLost ? (
        <ContextLostFallback onRetry={handleRetry} />
      ) : (
        <Canvas
          key={canvasKey}
          className="h-full w-full"
          dpr={1}
          shadows
          camera={{ position: compact ? [4.7, 2.95, 6.1] : [5.95, 3.45, 7.05], fov: compact ? 38 : 34 }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: 'default',
            preserveDrawingBuffer: false,
            stencil: false,
          }}
          onCreated={handleCreated}
        >
          <Scene
            solarState={solarState}
            compact={compact}
            geometryLabel={t('solar.solarGeometryLive')}
            azimuthLabel={t('solar.panelSunAzimuth')}
          />
        </Canvas>
      )}
    </div>
  );
}
