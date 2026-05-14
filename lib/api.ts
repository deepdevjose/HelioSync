/// <reference types="vite/client" />

const DEFAULT_DEVICE_URL = "http://192.168.4.1";

function getApiUrl() {
  return (import.meta.env.VITE_HELIOSYNC_DEVICE_URL || DEFAULT_DEVICE_URL).replace(/\/+$/, "");
}

export async function getLatestData() {
  const res = await fetch(`${getApiUrl()}/data`, {
    cache: "no-store"
  });

  if (!res.ok) throw new Error("Error fetching data");

  return res.json();
}

export async function getHistory(hours = 12) {
  const res = await fetch(
    `${getApiUrl()}/api/heliosync/history?hours=${hours}`,
    { cache: "no-store" }
  );

  if (!res.ok) throw new Error("Error fetching history");

  return res.json();
}
