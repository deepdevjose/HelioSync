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
 * @property {boolean} dht_ok
 * @property {boolean} bh_ok
 */

/**
 * @typedef {Object} PanelData
 * @property {number} angle_target_deg
 * @property {number} angle_measured_deg
 * @property {number} angle_error_deg
 * @property {number} azimuth_deg
 * @property {number} roll_deg
 * @property {number} pitch_raw_deg
 * @property {number} roll_raw_deg
 * @property {boolean} gyro_stable
 * @property {boolean} mpu_ok
 * @property {boolean} orientation_calibrated
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

// Estado inicial vacío — los datos reales llegan del ESP32 por WebSocket
const baseTelemetryData = {
  seq: 0,
  simHour: new Date().getHours(),
  meta: {
    project: 'HelioSync',
    nodeId: '—',
    location: '—',
    mode: '—',
    timestamp: '',
  },
  environment: {
    temp_c: 0,
    humidity_rh: 0,
    lux_bh1750: 0,
    dht_ok: false,
    bh_ok: false,
  },
  panel: {
    angle_target_deg: 0,
    angle_measured_deg: 0,
    angle_error_deg: 0,
    roll_deg: 0,
    pitch_raw_deg: 0,
    roll_raw_deg: 0,
    azimuth_deg: 180,
    gyro_stable: false,
    mpu_ok: false,
    orientation_calibrated: false,
    servo_active: false,
    tracking_mode: 'STATIC',
  },
  electrical: {
    voltage_v: 0,
    current_a: 0,
    power_w: 0,
    ina_ok: false,
  },
  sensor_status: {
    dht22: false,
    ina219: false,
    bh1750: false,
    mpu6050: false,
  },
  diagnostics: {
    simulation: false,
    profile: 'waiting',
    uptime_s: 0,
    free_heap: 0,
    ntp_ready: false,
    ws_clients: 0,
    ap_ssid: '',
  },
  solar: {
    azimuth_deg: 180,
    elevation_deg: 0,
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
  },
};


export const useHelioStore = create((set) => ({
  status: 'ESP AP', // 'Online' | 'Offline' | 'ESP AP'
  data: structuredClone(baseTelemetryData),
  history: [],
  lastUpdatedAt: Date.now(),
  telemetrySource: 'waiting', // 'waiting' | 'mock' | 'device'
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
    history: [],
    telemetrySource: 'waiting',
  }),
}));
