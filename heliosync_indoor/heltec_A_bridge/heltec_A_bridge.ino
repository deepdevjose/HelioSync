#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include "HT_SSD1306Wire.h"
#include <RadioLib.h>
#include <esp_wifi.h>
#include <esp_sleep.h>

// =====================================
// CONFIG
// =====================================
#define ESPNOW_CHANNEL 1
#define LORA_FREQUENCY 915.0
static const unsigned long ACTIVE_WINDOW_MS = 5UL * 60UL * 1000UL;
static const unsigned long CONFIG_BEACON_MS = 5000UL;
static const uint64_t SLEEP_INTERVAL_US = 60ULL * 60ULL * 1000000ULL;

// Pines OLED Heltec WiFi LoRa 32 V3
static const uint8_t OLED_SDA_PIN = 17;
static const uint8_t OLED_SCL_PIN = 18;
static const uint8_t OLED_RST_PIN = 21;

// Control de Vext en V3
static const uint8_t VEXT_CTRL_PIN = 36;

static SSD1306Wire display(
  0x3c,
  500000,
  OLED_SDA_PIN,
  OLED_SCL_PIN,
  GEOMETRY_128_64,
  OLED_RST_PIN
);

// SX1262 Heltec V3
SX1262 radio = new Module(8, 14, 12, 13);

// =====================================
// PAQUETE DESDE ESP32
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

SensorBridgePacket incomingData;
SensorBridgePacket pendingData;

// =====================================
// ESTADO
// =====================================
String espNowStatus = "WAIT";
String loraStatus   = "IDLE";
unsigned long lastPacketTime = 0;
bool newPacketForLoRa = false;
String loraPayload = "";
String heltecAMac = "";
bool esp32Linked = false;
bool hasSensorData = false;
volatile bool pendingEspNowPacket = false;
volatile bool pendingTextMessage = false;
volatile bool pendingBadLength = false;
volatile int lastBadLength = 0;
char pendingText[112] = "";
String lastControlMessage = "";
uint32_t rxCount = 0;
uint32_t badLengthCount = 0;
unsigned long bootStartedMs = 0;
unsigned long lastConfigBeaconMs = 0;
unsigned long lastSetupDrawMs = 0;
bool screenDirty = true;
RTC_DATA_ATTR uint32_t bootCount = 0;

enum BridgePhase {
  PHASE_WAIT_PANEL,
  PHASE_PANEL_LINKED,
  PHASE_LORA_TX,
  PHASE_LORA_DONE
};

BridgePhase phase = PHASE_WAIT_PANEL;

// =====================================
// OLED power
// =====================================
void VextON(void) {
  pinMode(VEXT_CTRL_PIN, OUTPUT);
  digitalWrite(VEXT_CTRL_PIN, LOW);   // V2/V3: LOW = ON
}

void drawSetupScreen() {
  screenDirty = false;
  lastSetupDrawMs = millis();
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "HelioSync indoor");
  display.drawString(0, 12, "Pon este codigo");
  display.drawString(0, 24, "en config panel:");
  display.drawString(0, 38, heltecAMac.length() ? heltecAMac : WiFi.macAddress());
  display.drawString(0, 52, esp32Linked ? "ESP32 conectado" : "Esperando ESP32");
  display.display();
}

void drawSleepScreen() {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "HelioSync indoor");
  display.drawString(0, 18, "Durmiendo 60 min");
  display.drawString(0, 34, "Ventana activa: 5m");
  display.display();
}

void enterDeepSleep() {
  Serial.println("Heltec A entra en deep sleep 60 min");
  drawSleepScreen();
  delay(800);
  radio.sleep();
  esp_now_deinit();
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_US);
  delay(100);
  esp_deep_sleep_start();
}

void sendConfigBeacon() {
  if (esp32Linked || millis() - lastConfigBeaconMs < CONFIG_BEACON_MS) {
    return;
  }

  String payload = "HELIOCFG," + heltecAMac;
  phase = PHASE_WAIT_PANEL;
  int state = radio.transmit(payload);
  loraStatus = (state == RADIOLIB_ERR_NONE) ? "CFG TX" : "CFG ERR";
  Serial.println("Beacon config LoRa: " + payload);
  lastConfigBeaconMs = millis();
  screenDirty = true;
}

String formatCsvPayload(const SensorBridgePacket& p) {
  String s;
  s.reserve(96);
  s += String(p.seq);
  s += ",";
  s += String(p.tempC, 2);
  s += ",";
  s += String(p.humRH, 2);
  s += ",";
  s += String(p.lux, 1);
  s += ",";
  s += String(p.voltageV, 3);
  s += ",";
  s += String(p.currentA, 3);
  s += ",";
  s += String(p.powerW, 3);
  s += ",";
  s += String(p.flags);
  return s;
}

void drawScreen() {
  screenDirty = false;
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);

  String statusText = "Listo";
  if (loraStatus == "TX...") statusText = "Enviando";
  else if (loraStatus == "TX ERR" || loraStatus == "ERR") statusText = "Error";

  display.drawString(0, 0, "HelioSync A");
  display.drawString(76, 0, statusText);

  if (!hasSensorData) {
    display.drawString(0, 14, "Panel conectado");
    display.drawString(0, 30, "Esperando lectura");
    display.display();
    return;
  }

  display.drawString(0, 12, "Panel conectado");
  display.drawString(0, 24, "#" + String(incomingData.seq) + "  Luz " + String(incomingData.lux, 0));
  display.drawString(0, 36, "T " + String(incomingData.tempC, 1) + "C  H " + String(incomingData.humRH, 0) + "%");
  display.drawString(0, 48, "V" + String(incomingData.voltageV, 2) + " A" + String(incomingData.currentA, 2) + " W" + String(incomingData.powerW, 1));

  display.display();
}

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len >= (int)sizeof(SensorBridgePacket) && len <= (int)sizeof(SensorBridgePacket) + 3) {
    memset(&pendingData, 0, sizeof(pendingData));
    size_t copyLen = len < (int)sizeof(pendingData) ? (size_t)len : sizeof(pendingData);
    memcpy(&pendingData, data, copyLen);
    pendingEspNowPacket = true;
    return;
  }

  if (len > 0 && len < (int)sizeof(pendingText)) {
    memcpy(pendingText, data, len);
    pendingText[len] = '\0';
    pendingTextMessage = true;
    return;
  }

  {
    lastBadLength = len;
    pendingBadLength = true;
    return;
  }
}

void handleEspNowPacket(const SensorBridgePacket& packet) {
  incomingData = packet;
  esp32Linked = true;
  hasSensorData = true;
  phase = PHASE_PANEL_LINKED;
  espNowStatus = "RX OK";
  lastPacketTime = millis();
  rxCount++;

  loraPayload = formatCsvPayload(incomingData);
  newPacketForLoRa = true;
  screenDirty = true;

  Serial.println("=== ESP-NOW RX ===");
  Serial.println(loraPayload);
}

void handleTextMessage(const char* message) {
  lastControlMessage = String(message);
  esp32Linked = true;
  phase = PHASE_PANEL_LINKED;
  espNowStatus = "LISTO";
  lastPacketTime = millis();
  screenDirty = true;

  Serial.println("=== ESP-NOW TEXT ===");
  Serial.println(lastControlMessage);
}

void processEspNowEvents() {
  if (pendingBadLength) {
    pendingBadLength = false;
    badLengthCount++;
    espNowStatus = "BADLEN";
    Serial.print("ESP-NOW bad len: ");
    Serial.println(lastBadLength);
    screenDirty = true;
  }

  if (!pendingEspNowPacket) {
    if (pendingTextMessage) {
      char text[112];
      strncpy(text, pendingText, sizeof(text));
      text[sizeof(text) - 1] = '\0';
      pendingTextMessage = false;
      handleTextMessage(text);
    }
    return;
  }

  SensorBridgePacket packet;
  memcpy(&packet, &pendingData, sizeof(packet));
  pendingEspNowPacket = false;
  handleEspNowPacket(packet);

  if (pendingTextMessage) {
    char text[112];
    strncpy(text, pendingText, sizeof(text));
    text[sizeof(text) - 1] = '\0';
    pendingTextMessage = false;
    handleTextMessage(text);
  }
}

bool initEspNow() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, true);
  WiFi.setSleep(false);
  delay(200);
  esp_wifi_set_ps(WIFI_PS_NONE);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  Serial.print("MAC Heltec A: ");
  Serial.println(WiFi.macAddress());
  heltecAMac = WiFi.macAddress();

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error iniciando ESP-NOW");
    return false;
  }

  esp_now_register_recv_cb(onDataRecv);
  return true;
}

bool initLoRa() {
  int state = radio.begin(LORA_FREQUENCY);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print("LoRa init fallo, code: ");
    Serial.println(state);
    return false;
  }

  radio.setOutputPower(14);
  radio.setSpreadingFactor(9);
  radio.setBandwidth(125.0);
  radio.setCodingRate(7);
  radio.setPreambleLength(8);
  return true;
}

void transmitQueuedLoRa() {
  if (!newPacketForLoRa) {
    return;
  }

  newPacketForLoRa = false;
  phase = PHASE_LORA_TX;
  loraStatus = "TX...";
  drawScreen();

  int state = radio.transmit(loraPayload);

  if (state == RADIOLIB_ERR_NONE) {
    loraStatus = "TX OK";
    Serial.println("LoRa enviado OK");
  } else {
    loraStatus = "TX ERR";
    Serial.print("Error LoRa TX: ");
    Serial.println(state);
  }

  phase = PHASE_LORA_DONE;
  screenDirty = true;
}

void refreshScreenIfNeeded() {
  if (!esp32Linked) {
    if (screenDirty || millis() - lastSetupDrawMs > 1000UL) {
      drawSetupScreen();
    }
    return;
  }

  if (millis() - lastPacketTime > 5000UL && espNowStatus != "WAIT") {
    espNowStatus = "WAIT";
    screenDirty = true;
  }

  if (screenDirty) {
    drawScreen();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  bootStartedMs = millis();
  bootCount++;

  VextON();
  delay(100);
  display.init();
  display.clear();
  drawSetupScreen();

  if (!initEspNow()) {
    while (true) delay(1000);
  }

  if (!initLoRa()) {
    loraStatus = "ERR";
    drawScreen();
    while (true) delay(1000);
  }

  loraStatus = "READY";
  espNowStatus = "READY";
  screenDirty = true;
  drawSetupScreen();
}

void loop() {
  processEspNowEvents();

  if (millis() - bootStartedMs >= ACTIVE_WINDOW_MS && !newPacketForLoRa && phase != PHASE_LORA_TX) {
    enterDeepSleep();
  }

  if (!esp32Linked) {
    sendConfigBeacon();
    processEspNowEvents();
    refreshScreenIfNeeded();
    delay(20);
    return;
  }

  transmitQueuedLoRa();
  refreshScreenIfNeeded();

  delay(20);
}
