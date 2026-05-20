#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>
#include <esp_wifi.h>

// =====================================
// CONFIG
// =====================================
#define ESPNOW_CHANNEL 1
#define TEST_MODE true
const unsigned long SEND_INTERVAL_MS = TEST_MODE ? 10000UL : 3600000UL;

// MAC de Heltec A
uint8_t heltecMac[] = {0x10, 0x51, 0xDB, 0x52, 0x8B, 0xB4};

// =====================================
// SENSORES
// =====================================
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
Adafruit_INA219 ina219;
BH1750 lightMeter;

// =====================================
// PAQUETE COMPACTO PARA ESP-NOW
// Nota: se usa paquete compacto en vez de JSON completo
// porque ESP-NOW clásico suele trabajar de forma segura
// con cargas <= 250 bytes.
// =====================================
typedef struct __attribute__((packed)) {
  uint32_t seq;
  float tempC;
  float humRH;
  float lux;
  float voltageV;
  float currentA;
  float powerW;
  uint8_t flags;
} SensorBridgePacket;

SensorBridgePacket pkt;
uint32_t sequenceNumber = 0;
unsigned long lastSendMs = 0;

// flags bitmask
const uint8_t FLAG_DHT_OK    = 1 << 0;
const uint8_t FLAG_BH_OK     = 1 << 1;
const uint8_t FLAG_INA_OK    = 1 << 2;

// =====================================
// CALLBACKS
// =====================================
void onDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  Serial.print("ESP-NOW -> Heltec A: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "ERROR");
}

// =====================================
// INIT
// =====================================
bool initSensors() {
  Wire.begin(21, 22);

  dht.begin();

  if (!ina219.begin()) {
    Serial.println("No se encontró INA219.");
    return false;
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("No se encontró BH1750.");
    return false;
  }

  Serial.println("DHT22 + INA219 + BH1750 listos.");
  return true;
}

bool initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(200);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  Serial.print("MAC ESP32 origen: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error inicializando ESP-NOW");
    return false;
  }

  esp_now_register_send_cb(onDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, heltecMac, 6);
  peerInfo.channel = ESPNOW_CHANNEL;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Error agregando peer Heltec A");
    return false;
  }

  Serial.println("ESP-NOW listo.");
  return true;
}

// =====================================
// LECTURA Y ENVIO
// =====================================
void readSensorsAndFillPacket() {
  float tempC = dht.readTemperature();
  float humRH = dht.readHumidity();
  float lux = lightMeter.readLightLevel();

  float shuntVoltage_mV = ina219.getShuntVoltage_mV();
  float busVoltage_V    = ina219.getBusVoltage_V();
  float current_mA      = ina219.getCurrent_mA();
  float power_mW        = ina219.getPower_mW();
  float loadVoltage_V   = busVoltage_V + (shuntVoltage_mV / 1000.0f);
  float currentA        = current_mA / 1000.0f;
  float powerW          = power_mW / 1000.0f;

  bool dhtOk = !(isnan(tempC) || isnan(humRH));
  bool bhOk  = !(isnan(lux) || lux < 0);
  bool inaOk = !(isnan(loadVoltage_V) || isnan(currentA) || isnan(powerW));

  pkt.seq = ++sequenceNumber;
  pkt.tempC = dhtOk ? tempC : -999.0f;
  pkt.humRH = dhtOk ? humRH : -999.0f;
  pkt.lux = bhOk ? lux : -1.0f;
  pkt.voltageV = inaOk ? loadVoltage_V : -999.0f;
  pkt.currentA = inaOk ? currentA : -999.0f;
  pkt.powerW = inaOk ? powerW : -999.0f;
  pkt.flags = 0;

  if (dhtOk) pkt.flags |= FLAG_DHT_OK;
  if (bhOk)  pkt.flags |= FLAG_BH_OK;
  if (inaOk) pkt.flags |= FLAG_INA_OK;

  Serial.println("=========== SENSOR NODE ===========");
  Serial.print("SEQ: "); Serial.println(pkt.seq);
  Serial.print("Temp C: "); Serial.println(pkt.tempC, 2);
  Serial.print("Hum RH: "); Serial.println(pkt.humRH, 2);
  Serial.print("Lux: "); Serial.println(pkt.lux, 2);
  Serial.print("Voltage V: "); Serial.println(pkt.voltageV, 3);
  Serial.print("Current A: "); Serial.println(pkt.currentA, 3);
  Serial.print("Power W: "); Serial.println(pkt.powerW, 3);
  Serial.print("Flags: "); Serial.println(pkt.flags, BIN);
  Serial.println("===================================\n");
}

void sendPacket() {
  esp_err_t result = esp_now_send(heltecMac, (uint8_t *)&pkt, sizeof(pkt));
  if (result != ESP_OK) {
    Serial.print("Error enviando a Heltec A: ");
    Serial.println(result);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  if (!initSensors()) {
    while (true) delay(1000);
  }

  if (!initEspNow()) {
    while (true) delay(1000);
  }

  readSensorsAndFillPacket();
  sendPacket();
  lastSendMs = millis();
}

void loop() {
  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    readSensorsAndFillPacket();
    sendPacket();
    lastSendMs = millis();
  }

  delay(50);
}
