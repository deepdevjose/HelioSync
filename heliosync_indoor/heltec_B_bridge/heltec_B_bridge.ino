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
static const uint64_t SLEEP_INTERVAL_US = 60ULL * 60ULL * 1000000ULL;

// OLED Heltec V3
static SSD1306Wire display(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);

// SX1262 Heltec V3
SX1262 radio = new Module(8, 14, 12, 13);

// MAC de la LilyGO
uint8_t lilygoMac[] = {0x10, 0x06, 0x1C, 0x40, 0xC5, 0x48};

// =====================================
// PAQUETE HACIA LILYGO
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

GatewayPacket pkt;

// =====================================
// ESTADO
// =====================================
String rawMsg = "WAIT";
String loraStatus = "INIT";
String espNowStatus = "WAIT";
int lastRSSI = 0;
unsigned long lastLoRaPacketTime = 0;
unsigned long bootStartedMs = 0;
String heltecAMac = "";
bool setupScreen = true;
RTC_DATA_ATTR uint32_t bootCount = 0;

// =====================================
// OLED power
// =====================================
void VextON(void) {
  pinMode(Vext, OUTPUT);
  digitalWrite(Vext, LOW);
}

void drawSetupScreen() {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "HelioSync indoor");
  display.drawString(0, 12, "Pon este codigo");
  display.drawString(0, 24, "en config panel:");
  display.drawString(0, 38, heltecAMac.length() ? heltecAMac : "Esperando Heltec A");
  display.drawString(0, 52, "LoRa A -> B listo");
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
  Serial.println("Heltec B entra en deep sleep 60 min");
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

void onDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  espNowStatus = (status == ESP_NOW_SEND_SUCCESS) ? "TX OK" : "TX ERR";
  Serial.print("ESP-NOW -> LilyGO: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "ERROR");
}

bool parsePayload(String msg) {
  float values[8];
  int index = 0;
  int start = 0;

  msg.trim();

  for (int i = 0; i <= msg.length(); i++) {
    if (i == msg.length() || msg.charAt(i) == ',') {
      if (index >= 8) return false;

      String token = msg.substring(start, i);
      token.trim();
      if (token.length() == 0) return false;

      values[index] = token.toFloat();
      index++;
      start = i + 1;
    }
  }

  if (index != 8) return false;

  pkt.seq      = (uint32_t)values[0];
  pkt.tempC    = values[1];
  pkt.humRH    = values[2];
  pkt.lux      = values[3];
  pkt.voltageV = values[4];
  pkt.currentA = values[5];
  pkt.powerW   = values[6];
  pkt.flags    = (uint8_t)values[7];
  pkt.rssi     = lastRSSI;

  return true;
}

void drawScreen() {
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.setFont(ArialMT_Plain_10);

  String statusText = "Listo";
  if (loraStatus == "WAIT" || loraStatus == "RX OK") statusText = "Listo";
  else if (loraStatus == "BADFMT" || loraStatus == "RX ERR" || loraStatus == "ERR") statusText = "Error";

  display.drawString(0, 0, "HelioSync B");
  display.drawString(76, 0, statusText);

  display.drawString(0, 12, "Panel conectado");
  display.drawString(0, 24, "#" + String(pkt.seq) + "  Luz " + String(pkt.lux, 0));
  display.drawString(0, 36, "T " + String(pkt.tempC, 1) + "C  H " + String(pkt.humRH, 0) + "%");
  display.drawString(0, 48, "V" + String(pkt.voltageV, 2) + " A" + String(pkt.currentA, 2) + " W" + String(pkt.powerW, 1));

  display.display();
}

bool initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(200);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  Serial.print("MAC Heltec B: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error inicializando ESP-NOW");
    return false;
  }

  esp_now_register_send_cb(onDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, lilygoMac, 6);
  peerInfo.channel = ESPNOW_CHANNEL;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Error agregando peer LilyGO");
    return false;
  }

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

void setup() {
  Serial.begin(115200);
  delay(200);
  bootStartedMs = millis();
  bootCount++;

  VextON();
  delay(100);
  display.init();
  drawSetupScreen();

  pkt = {};
  if (!initEspNow()) {
    espNowStatus = "ERR";
    drawScreen();
    while (true) delay(1000);
  }

  espNowStatus = "READY";

  if (!initLoRa()) {
    loraStatus = "ERR";
    drawScreen();
    while (true) delay(1000);
  }

  loraStatus = "READY";
  drawSetupScreen();
  Serial.println("Heltec B lista.");
}

void loop() {
  if (millis() - bootStartedMs >= ACTIVE_WINDOW_MS) {
    enterDeepSleep();
  }

  String str;
  int state = radio.receive(str);

  if (state == RADIOLIB_ERR_NONE) {
    rawMsg = str;
    lastRSSI = (int)radio.getRSSI();
    lastLoRaPacketTime = millis();

    if (str.startsWith("HELIOCFG,")) {
      heltecAMac = str.substring(9);
      heltecAMac.trim();
      loraStatus = "CFG RX";
      setupScreen = true;
      Serial.println("MAC Heltec A recibida: " + heltecAMac);
      drawSetupScreen();
      delay(50);
      return;
    }

    if (parsePayload(str)) {
      setupScreen = false;
      loraStatus = "RX OK";
      pkt.rssi = lastRSSI;

      Serial.println("=========== LORA RX ===========");
      Serial.println(rawMsg);
      Serial.print("RSSI: "); Serial.println(pkt.rssi);

      esp_err_t result = esp_now_send(lilygoMac, (uint8_t *)&pkt, sizeof(pkt));
      if (result != ESP_OK) {
        Serial.print("Error al enviar a LilyGO: ");
        Serial.println(result);
        espNowStatus = "SENDERR";
      }

      drawScreen();
    } else {
      loraStatus = "BADFMT";
      Serial.println("Error: payload LoRa inválido");
      Serial.println(rawMsg);
      drawScreen();
    }
  } else if (state != RADIOLIB_ERR_RX_TIMEOUT) {
    loraStatus = "RX ERR";
    Serial.print("LoRa RX error: ");
    Serial.println(state);
    drawScreen();
  }

  if (setupScreen) {
    drawSetupScreen();
  } else if (millis() - lastLoRaPacketTime > 5000 && loraStatus == "RX OK") {
    loraStatus = "WAIT";
    drawScreen();
  }

  delay(50);
}
