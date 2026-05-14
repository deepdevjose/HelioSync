import { create } from 'zustand';
import { appendLiveHistory, normalizeDevicePayload } from '../services/heliosyncDevice';
import { applySetupToTelemetry, getConnectivityStatus } from '../services/userData';

/**
 * @typedef {Object} MetaInfo
 * @property {string} project
 * @property {string} nodeId
 * @property {string} location
 * @property {string} mode
 * @property {string} timestamp
 */

/**
 * @typedef {Object} EnvironmentData
 * @property {number} temp_c
 * @property {number} humidity_rh
 * @property {number} lux_bh1750
 */

/**
 * @typedef {Object} PanelData
 * @property {number} angle_target_deg
 * @property {number} angle_measured_deg
 * @property {number} angle_error_deg
 * @property {number} azimuth_deg
 * @property {boolean} gyro_stable
 * @property {boolean} servo_active
 * @property {string} tracking_mode
 */

/**
 * @typedef {Object} ElectricalData
 * @property {number} voltage_v
 * @property {number} current_a
 * @property {number} power_w
 */

/**
 * @typedef {Object} DiagnosticsData
 * @property {boolean} simulation
 * @property {string} profile
 */

/**
 * @typedef {Object} HelioSyncPayload
 * @property {number} seq
 * @property {number} simHour
 * @property {MetaInfo} meta
 * @property {EnvironmentData} environment
 * @property {PanelData} panel
 * @property {ElectricalData} electrical
 * @property {DiagnosticsData} diagnostics
 */

// Datos de prueba iniciales basados en el payload
const initialMockData = {
  seq: 1234,
  simHour: 12,
  meta: {
    project: "HelioSync",
    nodeId: "nodo1",
    location: "Atitalaquia, Hidalgo, Mexico",
    mode: "STATIC_TEST",
    timestamp: "2026-03-25T12:00:00-06:00"
  },
  environment: {
    temp_c: 22.5,
    humidity_rh: 40.5,
    lux_bh1750: 62000
  },
  panel: {
    angle_target_deg: 54.0,
    angle_measured_deg: 53.8,
    angle_error_deg: -0.2,
    roll_deg: 0,
    azimuth_deg: 180,
    gyro_stable: true,
    servo_active: false,
    tracking_mode: "STATIC"
  },
  electrical: {
    voltage_v: 19.5,
    current_a: 1.7,
    power_w: 33.15
  },
  diagnostics: {
    simulation: true,
    profile: "clear_sky_static_panel"
  },
  solar: {
    azimuth_deg: 180,
    elevation_deg: 45,
    valid: false,
  },
  alert: {
    active: false,
    message: '',
    error_deg: 0,
  },
  storage: {
    days_stored: 0,
    used_kb: 0,
    max_kb: 1200,
    used_percent: 0,
    near_full: false,
    retention_days: 30,
    cloud_ready: false,
  }
};

const baseTelemetryData = structuredClone(initialMockData);

// Array histórico pre-cargado para demostración en Card 3 (24 horas)
const initialHistory = Array.from({ length: 24 }, (_, i) => {
  const basePower = 33.15;
  const hour = i;
  let simulatedPower = 0;
  
  if (hour > 6 && hour < 19) {
    // Curva de campana para simular ciclo solar
    simulatedPower = basePower * Math.sin(((hour - 6) / 12) * Math.PI) + (Math.random() * 5 - 2.5);
  }

  return {
    time: `${hour.toString().padStart(2, '0')}:00`,
    power_w: Math.max(0, simulatedPower).toFixed(2),
  };
});


export const useHelioStore = create((set) => ({
  status: 'ESP AP', // 'Online' | 'Offline' | 'ESP AP'
  data: structuredClone(baseTelemetryData),
  history: initialHistory,
  lastUpdatedAt: Date.now(),
  telemetrySource: 'mock', // 'mock' | 'device'
  session: null, // Firebase Auth session
  authReady: false,
  userProfile: null,
  userSetup: null,
  
  updateData: (newData) => set((state) => ({ 
    data: { ...state.data, ...newData },
    lastUpdatedAt: Date.now(),
    // Actualizar historial aquí si fuera necesario
  })),

  ingestDevicePayload: (payload) => set((state) => {
    const nextData = normalizeDevicePayload(payload, state.data);

    return {
      data: nextData,
      history: appendLiveHistory(
        state.telemetrySource === 'device' ? state.history : [],
        nextData,
      ),
      lastUpdatedAt: Date.now(),
      telemetrySource: 'device',
      status: 'ESP AP',
    };
  }),
  
  setStatus: (newStatus) => set({ status: newStatus }),
  
  setSession: (user) => set({ session: user }),

  setAuthReady: (authReady) => set({ authReady }),

  setUserProfile: (userProfile) => set({ userProfile }),

  setUserSetup: (userSetup) => set((state) => ({
    userSetup,
    data: state.telemetrySource === 'device'
      ? state.data
      : applySetupToTelemetry(
          userSetup ? state.data : structuredClone(baseTelemetryData),
          userSetup,
        ),
    status: userSetup ? getConnectivityStatus(userSetup) : state.status,
  })),

  clearUserContext: () => set({
    session: null,
    userProfile: null,
    userSetup: null,
    data: structuredClone(baseTelemetryData),
    history: initialHistory,
    telemetrySource: 'mock',
  }),
}));
