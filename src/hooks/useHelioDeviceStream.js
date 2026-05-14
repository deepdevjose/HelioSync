import { useEffect, useRef } from 'react';
import { useHelioStore } from '../store/useHelioStore';
import {
  fetchLatestDevicePayload,
  getDeviceBaseUrl,
  getDeviceWebSocketUrl,
  isDeviceStale,
  postDeviceGps,
  resolveGpsPayload,
  sendGpsOverWebSocket,
} from '../services/heliosyncDevice';
import { notifyStoragePressure } from '../services/storageNotifications';

const HTTP_POLL_MS = 5000;
const WS_RECONNECT_MS = 2500;

export function useHelioDeviceStream() {
  const ingestDevicePayload = useHelioStore((state) => state.ingestDevicePayload);
  const setStatus = useHelioStore((state) => state.setStatus);
  const userSetup = useHelioStore((state) => state.userSetup);
  const lastSeenRef = useRef(0);
  const gpsPromiseRef = useRef(null);

  useEffect(() => {
    let active = true;
    let socket = null;
    let pollIntervalId = 0;
    let reconnectTimeoutId = 0;

    const baseUrl = getDeviceBaseUrl();
    gpsPromiseRef.current = null;

    const ingest = (payload) => {
      if (!active || !payload) {
        return;
      }

      lastSeenRef.current = Date.now();
      ingestDevicePayload(payload);
      notifyStoragePressure(payload.storage).catch(() => {});
      setStatus('ESP AP');
    };

    const sendGps = async () => {
      if (!gpsPromiseRef.current) {
        gpsPromiseRef.current = resolveGpsPayload(userSetup);
      }

      const gps = await gpsPromiseRef.current;
      if (!active || !gps) {
        return;
      }

      sendGpsOverWebSocket(socket, gps);
      postDeviceGps(baseUrl, gps).catch(() => {});
    };

    const pollSnapshot = async () => {
      try {
        const payload = await fetchLatestDevicePayload(baseUrl);
        ingest(payload);
      } catch {
        if (active && isDeviceStale(lastSeenRef.current)) {
          setStatus('Offline');
        }
      }
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimeoutId) {
        return;
      }

      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = 0;
        connectWebSocket();
      }, WS_RECONNECT_MS);
    };

    const connectWebSocket = () => {
      if (!active || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        return;
      }

      try {
        socket = new WebSocket(getDeviceWebSocketUrl(baseUrl));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', () => {
        setStatus('ESP AP');
        sendGps();
        pollSnapshot();
      });

      socket.addEventListener('message', (event) => {
        try {
          ingest(JSON.parse(event.data));
        } catch {
          // Ignore non-telemetry acknowledgements such as consent confirmations.
        }
      });

      socket.addEventListener('close', () => {
        socket = null;
        if (isDeviceStale(lastSeenRef.current)) {
          setStatus('Offline');
        }
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (isDeviceStale(lastSeenRef.current)) {
          setStatus('Offline');
        }
      });
    };

    pollSnapshot();
    connectWebSocket();
    pollIntervalId = window.setInterval(pollSnapshot, HTTP_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(pollIntervalId);
      window.clearTimeout(reconnectTimeoutId);

      if (socket) {
        socket.close();
      }
    };
  }, [ingestDevicePayload, setStatus, userSetup]);
}
