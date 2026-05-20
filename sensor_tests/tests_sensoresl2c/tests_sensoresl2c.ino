/*
 * ============================================================
 *  HelioSync — Test I2C Bus Web
 *  Escáner completo del bus I2C vía navegador
 * ============================================================
 *  CONEXIÓN:
 *    SDA → GPIO 21
 *    SCL → GPIO 22
 *
 *  DISPOSITIVOS ESPERADOS:
 *    0x40 → INA219  voltaje/corriente
 *    0x23 → BH1750  luminancia, ADDR=GND
 *    0x68 → MPU6050 giroscopio/acelerómetro, AD0=GND
 *
 *  ACCESO:
 *    Principal:
 *      http://heliosync-i2c.local
 *
 *    Si falla el WiFi:
 *      SSID: HelioSync-I2C
 *      PASS: 12345678
 *      URL : http://192.168.4.1
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>

// ── WiFi principal ──────────────────────────────────────────
const char* WIFI_SSID = "Jose's Network";
const char* WIFI_PASS = "helloworld";

// ── WiFi fallback modo AP ───────────────────────────────────
const char* AP_SSID = "HelioSync-I2C";
const char* AP_PASS = "12345678";

// ── Pines I2C ESP32 ─────────────────────────────────────────
#define SDA_PIN 21
#define SCL_PIN 22

WebServer server(80);

// ── Dispositivos esperados ──────────────────────────────────
struct ExpectedDevice {
  byte addr;
  const char* name;
  const char* note;
};

ExpectedDevice expected[] = {
  { 0x40, "INA219",  "Sensor de voltaje/corriente" },
  { 0x23, "BH1750",  "Sensor de luminancia, ADDR=GND" },
  { 0x68, "MPU6050", "Giroscopio/Acelerometro, AD0=GND" },
};

const int NUM_EXPECTED = sizeof(expected) / sizeof(expected[0]);

// ── Direcciones alternativas ────────────────────────────────
struct AltAddress {
  byte primary;
  byte alternate;
  const char* name;
  const char* altNote;
};

AltAddress altMap[] = {
  { 0x23, 0x5C, "BH1750",  "BH1750 con ADDR=3V3" },
  { 0x68, 0x69, "MPU6050", "MPU6050 con AD0=3V3" },
  { 0x40, 0x41, "INA219",  "INA219 con A0=1" },
};

const int NUM_ALT = sizeof(altMap) / sizeof(altMap[0]);

// ── Estado de conexión ──────────────────────────────────────
String connectionMode = "STA";
String localAddress = "";

// ── Utilidades ──────────────────────────────────────────────
String hexAddress(byte addr) {
  char buffer[8];
  sprintf(buffer, "0x%02X", addr);
  return String(buffer);
}

String getExpectedName(byte addr) {
  for (int i = 0; i < NUM_EXPECTED; i++) {
    if (expected[i].addr == addr) {
      return String(expected[i].name);
    }
  }

  for (int i = 0; i < NUM_ALT; i++) {
    if (altMap[i].alternate == addr) {
      return String(altMap[i].name);
    }
  }

  return "Desconocido";
}

String getDeviceNote(byte addr) {
  for (int i = 0; i < NUM_EXPECTED; i++) {
    if (expected[i].addr == addr) {
      return String(expected[i].note);
    }
  }

  for (int i = 0; i < NUM_ALT; i++) {
    if (altMap[i].alternate == addr) {
      return String(altMap[i].altNote);
    }
  }

  return "Dispositivo I2C no identificado";
}

bool isExpectedPrimary(byte addr) {
  for (int i = 0; i < NUM_EXPECTED; i++) {
    if (expected[i].addr == addr) return true;
  }
  return false;
}

bool isAlternativeAddress(byte addr) {
  for (int i = 0; i < NUM_ALT; i++) {
    if (altMap[i].alternate == addr) return true;
  }
  return false;
}

// ── Escaneo I2C completo ────────────────────────────────────
void scanBus(bool found[128], int &count, String &devicesJson) {
  count = 0;
  devicesJson = "[";

  for (int i = 0; i < 128; i++) {
    found[i] = false;
  }

  bool firstDevice = true;

  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();

    if (err == 0) {
      found[addr] = true;
      count++;

      if (!firstDevice) devicesJson += ",";
      firstDevice = false;

      String type = "unknown";
      if (isExpectedPrimary(addr)) type = "expected";
      else if (isAlternativeAddress(addr)) type = "alternate";

      devicesJson += "{";
      devicesJson += "\"address\":\"" + hexAddress(addr) + "\",";
      devicesJson += "\"decimal\":" + String(addr) + ",";
      devicesJson += "\"name\":\"" + getExpectedName(addr) + "\",";
      devicesJson += "\"note\":\"" + getDeviceNote(addr) + "\",";
      devicesJson += "\"type\":\"" + type + "\"";
      devicesJson += "}";
    }
  }

  devicesJson += "]";
}

// ── API JSON ────────────────────────────────────────────────
void handleApi() {
  bool found[128];
  int count = 0;
  String devicesJson;

  scanBus(found, count, devicesJson);

  String expectedJson = "[";
  bool allOk = true;
  bool hasWarning = false;

  for (int i = 0; i < NUM_EXPECTED; i++) {
    byte primary = expected[i].addr;

    bool presentPrimary = found[primary];
    bool presentAlt = false;
    byte altAddr = 0;
    String altNote = "";

    for (int j = 0; j < NUM_ALT; j++) {
      if (altMap[j].primary == primary && found[altMap[j].alternate]) {
        presentAlt = true;
        altAddr = altMap[j].alternate;
        altNote = String(altMap[j].altNote);
        break;
      }
    }

    String status = "missing";
    String detectedAddress = "";

    if (presentPrimary) {
      status = "ok";
      detectedAddress = hexAddress(primary);
    } else if (presentAlt) {
      status = "alternate";
      detectedAddress = hexAddress(altAddr);
      hasWarning = true;
    } else {
      status = "missing";
      detectedAddress = "No detectado";
      allOk = false;
    }

    if (i > 0) expectedJson += ",";

    expectedJson += "{";
    expectedJson += "\"name\":\"" + String(expected[i].name) + "\",";
    expectedJson += "\"expectedAddress\":\"" + hexAddress(primary) + "\",";
    expectedJson += "\"detectedAddress\":\"" + detectedAddress + "\",";
    expectedJson += "\"note\":\"" + String(expected[i].note) + "\",";
    expectedJson += "\"status\":\"" + status + "\",";
    expectedJson += "\"altNote\":\"" + altNote + "\"";
    expectedJson += "}";
  }

  expectedJson += "]";

  String globalStatus = "OK";
  if (!allOk) {
    globalStatus = "ERROR";
  } else if (hasWarning) {
    globalStatus = "WARNING";
  }

  String json = "{";
  json += "\"total\":" + String(count) + ",";
  json += "\"globalStatus\":\"" + globalStatus + "\",";
  json += "\"mode\":\"" + connectionMode + "\",";
  json += "\"ip\":\"" + localAddress + "\",";
  json += "\"sda\":" + String(SDA_PIN) + ",";
  json += "\"scl\":" + String(SCL_PIN) + ",";
  json += "\"devices\":" + devicesJson + ",";
  json += "\"expected\":" + expectedJson;
  json += "}";

  server.send(200, "application/json", json);
}

// ── Página web ──────────────────────────────────────────────
void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HelioSync — Test I2C</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Arial, Helvetica, sans-serif;
      background: #050505;
      color: #f5f5f5;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, #1e293b 0, transparent 35%),
        #050505;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
    }

    .card {
      width: min(96vw, 760px);
      padding: 28px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(18px);
    }

    h1 {
      margin: 0;
      font-size: 1.7rem;
      letter-spacing: -0.04em;
    }

    .subtitle {
      margin-top: 8px;
      color: #a3a3a3;
      font-size: 0.95rem;
    }

    .status {
      margin-top: 22px;
      padding: 14px 16px;
      border-radius: 16px;
      font-weight: 700;
      text-align: center;
    }

    .ok {
      background: rgba(34, 197, 94, 0.16);
      color: #86efac;
      border: 1px solid rgba(34, 197, 94, 0.35);
    }

    .error {
      background: rgba(239, 68, 68, 0.16);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.35);
    }

    .warn {
      background: rgba(245, 158, 11, 0.16);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 22px;
    }

    .metric {
      padding: 18px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .label {
      color: #a3a3a3;
      font-size: 0.85rem;
      margin-bottom: 8px;
    }

    .value {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.06em;
    }

    .section-title {
      margin-top: 28px;
      margin-bottom: 12px;
      color: #e5e5e5;
      font-weight: 700;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.06);
    }

    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.9rem;
    }

    th {
      color: #a3a3a3;
      font-weight: 600;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .pill {
      display: inline-block;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .pill-ok {
      background: rgba(34, 197, 94, 0.16);
      color: #86efac;
    }

    .pill-error {
      background: rgba(239, 68, 68, 0.16);
      color: #fca5a5;
    }

    .pill-warn {
      background: rgba(245, 158, 11, 0.16);
      color: #fcd34d;
    }

    .pill-unknown {
      background: rgba(148, 163, 184, 0.16);
      color: #cbd5e1;
    }

    .footer {
      margin-top: 22px;
      color: #a3a3a3;
      font-size: 0.82rem;
      line-height: 1.5;
    }

    code {
      color: #e5e5e5;
    }

    @media (max-width: 620px) {
      .grid {
        grid-template-columns: 1fr;
      }

      table {
        font-size: 0.8rem;
      }

      th, td {
        padding: 10px 8px;
      }
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>HelioSync — Test I2C</h1>
    <div class="subtitle">Escaneo en vivo del bus I2C desde ESP32</div>

    <div id="status" class="status warn">Escaneando bus I2C...</div>

    <section class="grid">
      <div class="metric">
        <div class="label">Dispositivos detectados</div>
        <div class="value" id="total">--</div>
      </div>

      <div class="metric">
        <div class="label">Pines I2C</div>
        <div class="value">21/22</div>
      </div>
    </section>

    <div class="section-title">Sensores esperados</div>
    <table>
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Esperado</th>
          <th>Detectado</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody id="expectedBody">
        <tr>
          <td colspan="4">Cargando...</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Dispositivos encontrados en el bus</div>
    <table>
      <thead>
        <tr>
          <th>Dirección</th>
          <th>Nombre</th>
          <th>Nota</th>
        </tr>
      </thead>
      <tbody id="devicesBody">
        <tr>
          <td colspan="3">Cargando...</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Modo de conexión: <code id="mode">--</code></div>
      <div>IP de la ESP32: <code id="ip">--</code></div>
      <div>Actualización automática cada 5 segundos.</div>
    </div>
  </main>

  <script>
    function statusPill(status) {
      if (status === 'ok') {
        return '<span class="pill pill-ok">OK</span>';
      }

      if (status === 'alternate') {
        return '<span class="pill pill-warn">ALT</span>';
      }

      if (status === 'missing') {
        return '<span class="pill pill-error">FALTA</span>';
      }

      return '<span class="pill pill-unknown">?</span>';
    }

    function devicePill(type) {
      if (type === 'expected') {
        return ' <span class="pill pill-ok">Esperado</span>';
      }

      if (type === 'alternate') {
        return ' <span class="pill pill-warn">Alternativo</span>';
      }

      return ' <span class="pill pill-unknown">Desconocido</span>';
    }

    async function updateData() {
      try {
        const response = await fetch('/api');
        const data = await response.json();

        document.getElementById('total').textContent = data.total;
        document.getElementById('mode').textContent = data.mode;
        document.getElementById('ip').textContent = data.ip;

        const status = document.getElementById('status');
        status.className = 'status';

        if (data.globalStatus === 'OK') {
          status.textContent = 'Todos los sensores esperados fueron detectados';
          status.classList.add('ok');
        } else if (data.globalStatus === 'WARNING') {
          status.textContent = 'Sensores detectados, pero alguno usa dirección alternativa';
          status.classList.add('warn');
        } else {
          status.textContent = 'Faltan sensores en el bus I2C';
          status.classList.add('error');
        }

        const expectedBody = document.getElementById('expectedBody');
        expectedBody.innerHTML = '';

        data.expected.forEach(item => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${item.name}</td>
            <td><code>${item.expectedAddress}</code></td>
            <td><code>${item.detectedAddress}</code></td>
            <td>${statusPill(item.status)}</td>
          `;
          expectedBody.appendChild(row);
        });

        const devicesBody = document.getElementById('devicesBody');
        devicesBody.innerHTML = '';

        if (data.devices.length === 0) {
          devicesBody.innerHTML = `
            <tr>
              <td colspan="3">No se detectó ningún dispositivo I2C.</td>
            </tr>
          `;
        } else {
          data.devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td><code>${device.address}</code></td>
              <td>${device.name}${devicePill(device.type)}</td>
              <td>${device.note}</td>
            `;
            devicesBody.appendChild(row);
          });
        }

      } catch (error) {
        const status = document.getElementById('status');
        status.textContent = 'ERROR: no se pudo actualizar el escaneo';
        status.className = 'status error';
      }
    }

    updateData();
    setInterval(updateData, 5000);
  </script>
</body>
</html>
)rawliteral";

  server.send(200, "text/html", html);
}

// ── Conexión WiFi ───────────────────────────────────────────
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.println("Conectando a WiFi...");

  unsigned long startAttempt = millis();
  const unsigned long timeout = 15000;

  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < timeout) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    connectionMode = "WiFi STA";
    localAddress = WiFi.localIP().toString();

    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(localAddress);

    if (MDNS.begin("heliosync-i2c")) {
      Serial.println("mDNS activo: http://heliosync-i2c.local");
    } else {
      Serial.println("No se pudo iniciar mDNS");
    }

  } else {
    connectionMode = "Access Point";

    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);

    localAddress = WiFi.softAPIP().toString();

    Serial.println("No se pudo conectar al WiFi principal.");
    Serial.println("Modo AP activado.");
    Serial.print("SSID: ");
    Serial.println(AP_SSID);
    Serial.print("PASS: ");
    Serial.println(AP_PASS);
    Serial.print("IP: ");
    Serial.println(localAddress);
  }
}

// ── Setup ───────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========================================");
  Serial.println("  HelioSync — Test I2C Web");
  Serial.println("========================================");
  Serial.printf("SDA: GPIO %d | SCL: GPIO %d\n", SDA_PIN, SCL_PIN);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  Wire.setTimeOut(50);

  connectWiFi();

  server.on("/", handleRoot);
  server.on("/api", handleApi);

  server.begin();

  Serial.println("Servidor web iniciado");
}

// ── Loop ────────────────────────────────────────────────────
void loop() {
  server.handleClient();
}