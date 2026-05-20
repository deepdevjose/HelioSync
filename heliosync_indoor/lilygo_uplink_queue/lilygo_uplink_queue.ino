#define TINY_GSM_MODEM_SIM7070
#define TINY_GSM_RX_BUFFER 1024

#include <WiFi.h>
#include <esp_now.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <esp_wifi.h>

#define SerialMon Serial
#define SerialAT  Serial1

// =====================================
// CONFIG
// =====================================
#define ESPNOW_CHANNEL 1
#define MODEM_TX       26
#define MODEM_RX       27
#define MODEM_PWRKEY    4

const char* WIFI_SSID = "Network";
const char* WIFI_PASS = "helloworld";

const char apn[]      = "internet.movistar.mx";
const char gprsUser[] = "movistar";
const char gprsPass[] = "movistar";

const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;
const char* MQTT_TOPIC  = "heliosync/sensores/nodo1";

const char* PROJECT_NAME  = "HelioSync";
const char* NODE_ID       = "nodo1";
const char* LOCATION      = "Atitalaquia, Hidalgo, Mexico";
const char* MODE          = "REAL_SENSOR_BRIDGE";
const char* TRACKING_MODE = "STATIC";

const char* QUEUE_FILE = "/queue.txt";
const unsigned long FLUSH_INTERVAL_MS = 300000UL; // 5 min

// =====================================
// PAQUETE DESDE HELTEC B
// =====================================
typedef struct {
  uint32_t seq;
  float tempC;
  float humRH;
  float lux;
  float voltageV;
  float currentA;
  float powerW;
  int rssi;
  uint8_t flags;
} GatewayPacket;

GatewayPacket incomingData;
volatile bool newData = false;

// flags bitmask
const uint8_t FLAG_DHT_OK = 1 << 0;
const uint8_t FLAG_BH_OK  = 1 << 1;
const uint8_t FLAG_INA_OK = 1 << 2;

// =====================================
// CLIENTES
// =====================================
TinyGsm modem(SerialAT);
TinyGsmClient gsmClient(modem);
WiFiClient wifiClient;
PubSubClient mqttCell(gsmClient);
PubSubClient mqttWiFi(wifiClient);

// =====================================
// ESTADO
// =====================================
bool espNowReady = false;
unsigned long lastFlushAttemptMs = 0;

// =====================================
// ESP-NOW
// =====================================
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(GatewayPacket)) {
    SerialMon.print("BAD LEN: ");
    SerialMon.println(len);
    return;
  }

  memcpy(&incomingData, data, sizeof(incomingData));
  newData = true;
}

bool initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(200);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (esp_now_init() != ESP_OK) {
    SerialMon.println("ESP-NOW init error");
    return false;
  }

  esp_now_register_recv_cb(onDataRecv);
  espNowReady = true;

  SerialMon.println("ESP-NOW listo");
  SerialMon.print("MAC LilyGO: ");
  SerialMon.println(WiFi.macAddress());

  return true;
}

void stopEspNow() {
  if (espNowReady) {
    esp_now_deinit();
    espNowReady = false;
    SerialMon.println("ESP-NOW detenido");
  }
}

// =====================================
// JSON FINAL
// =====================================
String buildJson(const GatewayPacket& p) {
  StaticJsonDocument<768> doc;

  doc["seq"] = p.seq;

  JsonObject meta = doc.createNestedObject("meta");
  meta["project"] = PROJECT_NAME;
  meta["nodeId"] = NODE_ID;
  meta["location"] = LOCATION;
  meta["mode"] = MODE;
  meta["timestamp_source"] = "lilygo_uplink";
  meta["gateway_uptime_s"] = millis() / 1000;

  JsonObject environment = doc.createNestedObject("environment");
  environment["temp_c"] = roundf(p.tempC * 100.0f) / 100.0f;
  environment["humidity_rh"] = roundf(p.humRH * 100.0f) / 100.0f;
  environment["lux_bh1750"] = roundf(p.lux);

  JsonObject panel = doc.createNestedObject("panel");
  panel["angle_target_deg"] = 54.0;
  panel["angle_measured_deg"] = 54.0;
  panel["angle_error_deg"] = 0.0;
  panel["gyro_stable"] = true;
  panel["servo_active"] = false;
  panel["tracking_mode"] = TRACKING_MODE;

  JsonObject electrical = doc.createNestedObject("electrical");
  electrical["voltage_v"] = roundf(p.voltageV * 1000.0f) / 1000.0f;
  electrical["current_a"] = roundf(p.currentA * 1000.0f) / 1000.0f;
  electrical["power_w"] = roundf(p.powerW * 1000.0f) / 1000.0f;

  JsonObject diagnostics = doc.createNestedObject("diagnostics");
  diagnostics["simulation"] = false;
  diagnostics["profile"] = "espnow_lora_espnow_real_sensors";
  diagnostics["wifi_rssi_dbm"] = WiFi.RSSI();
  diagnostics["free_heap_bytes"] = ESP.getFreeHeap();
  diagnostics["dht_ok"] = (p.flags & FLAG_DHT_OK) != 0;
  diagnostics["bh1750_ok"] = (p.flags & FLAG_BH_OK) != 0;
  diagnostics["ina219_ok"] = (p.flags & FLAG_INA_OK) != 0;
  diagnostics["queue_file"] = QUEUE_FILE;

  JsonObject network = doc.createNestedObject("network");
  network["transport"] = "espnow->lora->espnow->mqtt";
  network["lora_rssi_dbm"] = p.rssi;

  String json;
  serializeJson(doc, json);
  return json;
}

// =====================================
// COLA LOCAL EN FLASH
// =====================================
bool initStorage() {
  if (!SPIFFS.begin(true)) {
    SerialMon.println("SPIFFS init error");
    return false;
  }

  if (!SPIFFS.exists(QUEUE_FILE)) {
    File f = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
    if (f) f.close();
  }

  return true;
}

bool enqueuePayload(const String& payload) {
  File f = SPIFFS.open(QUEUE_FILE, FILE_APPEND);
  if (!f) {
    SerialMon.println("No se pudo abrir cola para append");
    return false;
  }

  f.println(payload);
  f.close();
  SerialMon.println("Payload encolado en flash");
  return true;
}

bool dequeueFirstPayload(String& outLine) {
  File in = SPIFFS.open(QUEUE_FILE, FILE_READ);
  if (!in) return false;

  if (!in.available()) {
    in.close();
    return false;
  }

  outLine = in.readStringUntil('\n');
  outLine.trim();

  String rest = "";
  while (in.available()) {
    rest += in.readStringUntil('\n');
    rest += "\n";
  }
  in.close();

  File out = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
  if (!out) return false;
  out.print(rest);
  out.close();

  return outLine.length() > 0;
}

bool queueHasData() {
  File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
  if (!f) return false;
  bool has = f.available();
  f.close();
  return has;
}

// =====================================
// MODEM / WIFI
// =====================================
void powerOnModem() {
  pinMode(MODEM_PWRKEY, OUTPUT);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(100);
  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(1000);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(5000);
}

bool connectCellularWithin(unsigned long timeoutMs) {
  SerialMon.println("Intentando red movil...");
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(300);

  powerOnModem();
  unsigned long start = millis();

  while (millis() - start < timeoutMs) {
    if (!modem.restart()) {
      SerialMon.println("Modem restart fallo, reintentando...");
      delay(2000);
      continue;
    }

    if (!modem.waitForNetwork(15000L)) {
      SerialMon.println("Sin red celular aun...");
      delay(2000);
      continue;
    }

    if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
      SerialMon.println("Sin datos moviles aun...");
      delay(2000);
      continue;
    }

    if (modem.isGprsConnected()) {
      SerialMon.println("Datos moviles OK");
      return true;
    }
  }

  SerialMon.println("Timeout red movil");
  return false;
}

bool connectWiFiFallback(unsigned long timeoutMs) {
  SerialMon.println("Intentando WiFi fallback...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      SerialMon.println("WiFi OK");
      SerialMon.print("IP: ");
      SerialMon.println(WiFi.localIP());
      return true;
    }
    delay(500);
    SerialMon.print(".");
  }

  SerialMon.println();
  SerialMon.println("WiFi fallback timeout");
  return false;
}

bool publishViaCellular(const String& payload) {
  mqttCell.setServer(MQTT_BROKER, MQTT_PORT);
  mqttCell.setBufferSize(1024);

  String clientId = "lilygo-cell-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  if (!mqttCell.connected()) {
    if (!mqttCell.connect(clientId.c_str())) {
      SerialMon.print("MQTT celular fallo rc=");
      SerialMon.println(mqttCell.state());
      return false;
    }
  }

  SerialMon.print("Payload length: ");
  SerialMon.println(payload.length());

  bool ok = mqttCell.publish(MQTT_TOPIC, payload.c_str(), true);

  SerialMon.print("Publish result CELL: ");
  SerialMon.println(ok ? "true" : "false");

  mqttCell.loop();
  SerialMon.println(ok ? "MQTT celular OK" : "MQTT celular FAIL");

  return ok;
}

bool publishViaWiFi(const String& payload) {
  mqttWiFi.setServer(MQTT_BROKER, MQTT_PORT);
  mqttWiFi.setBufferSize(1024);

  String clientId = "lilygo-wifi-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  if (!mqttWiFi.connected()) {
    if (!mqttWiFi.connect(clientId.c_str())) {
      SerialMon.print("MQTT WiFi fallo rc=");
      SerialMon.println(mqttWiFi.state());
      return false;
    }
  }

  SerialMon.print("Payload length: ");
  SerialMon.println(payload.length());

  bool ok = mqttWiFi.publish(MQTT_TOPIC, payload.c_str(), true);

  SerialMon.print("Publish result WIFI: ");
  SerialMon.println(ok ? "true" : "false");

  mqttWiFi.loop();
  SerialMon.println(ok ? "MQTT WiFi OK" : "MQTT WiFi FAIL");

  return ok;
}

void shutdownWiFi() {
  if (mqttWiFi.connected()) {
    mqttWiFi.disconnect();
  }

  if (WiFi.status() == WL_CONNECTED) {
    WiFi.disconnect(true, true);
    delay(200);
  }
}

void shutdownCellular() {
  if (mqttCell.connected()) {
    mqttCell.disconnect();
  }

  if (modem.isGprsConnected()) {
    modem.gprsDisconnect();
  }
}

bool publishWithFallback(const String& payload) {
  bool ok = false;

  stopEspNow();

  if (connectCellularWithin(60000)) {
    ok = publishViaCellular(payload);
    shutdownCellular();
  }

  if (!ok) {
    shutdownCellular();
    if (connectWiFiFallback(15000)) {
      ok = publishViaWiFi(payload);
      shutdownWiFi();
    }
  }

  if (!initEspNow()) {
    SerialMon.println("No se pudo reiniciar ESP-NOW");
  }

  return ok;
}

void flushQueue() {
  if (!queueHasData()) {
    return;
  }

  SerialMon.println("Intentando vaciar cola...");

  while (queueHasData()) {
    String payload;

    if (!dequeueFirstPayload(payload)) {
      SerialMon.println("No se pudo sacar primer elemento");
      break;
    }

    bool ok = publishWithFallback(payload);
    if (!ok) {
      SerialMon.println("No hubo uplink, re-encolando payload");
      enqueuePayload(payload);
      break;
    }
  }
}

void setup() {
  SerialMon.begin(115200);
  delay(1500);

  SerialMon.println();
  SerialMon.println("Iniciando LilyGO uplink node...");

  mqttWiFi.setBufferSize(1024);
  mqttCell.setBufferSize(1024);

  if (!initStorage()) {
    while (true) delay(1000);
  }

  if (!initEspNow()) {
    while (true) delay(1000);
  }

  lastFlushAttemptMs = millis();
}

void loop() {
  if (newData) {
    noInterrupts();
    GatewayPacket pkt = incomingData;
    newData = false;
    interrupts();

    String payload = buildJson(pkt);

    SerialMon.println("======= DATOS RECIBIDOS =======");
    SerialMon.print("SEQ: ");
    SerialMon.println(pkt.seq);

    SerialMon.print("Temp: ");
    SerialMon.print(pkt.tempC);
    SerialMon.println(" C");

    SerialMon.print("Hum: ");
    SerialMon.print(pkt.humRH);
    SerialMon.println(" %");

    SerialMon.print("Lux: ");
    SerialMon.println(pkt.lux);

    SerialMon.print("RSSI LoRa: ");
    SerialMon.println(pkt.rssi);

    SerialMon.print("Payload length: ");
    SerialMon.println(payload.length());

    SerialMon.println("Payload JSON:");
    SerialMon.println(payload);

    enqueuePayload(payload);
    flushQueue();

    SerialMon.println("================================");
  }

  if (millis() - lastFlushAttemptMs >= FLUSH_INTERVAL_MS) {
    lastFlushAttemptMs = millis();
    flushQueue();
  }

  delay(50);
}