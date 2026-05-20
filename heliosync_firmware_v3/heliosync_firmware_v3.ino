/*
 * ============================================================
 *  HelioSync Firmware v3.0
 *  ESP32 WROOM-32 — Edge Computing + Store & Forward
 * ============================================================
 *  Sensores  : DHT22, INA219, BH1750, MPU6050
 *  Red       : WiFi AP propio + WebSocket servidor
 *  Algoritmo : Posición solar UPV/EHU (azimut + elevación)
 *  GPS       : Recibido desde la PWA (WS o HTTP POST)
 *  Storage   : LittleFS — histórico local 30 días (hourly)
 *  Firebase  : Auth REST opcional desde el ESP32; fallback local 30 días.
 * ============================================================
 *
 *  DEPENDENCIAS (Arduino IDE / PlatformIO):
 *   - DHT sensor library        (Adafruit)
 *   - Adafruit INA219            (Adafruit)
 *   - BH1750                     (Christopher Laws)
 *   - MPU6050                    (Electronic Cats)
 *   - ESPAsyncWebServer          (me-no-dev)
 *   - AsyncTCP                   (me-no-dev)
 *   - ArduinoJson                >= 6.x
 *   - LittleFS                   (built-in ESP32 Arduino core)
 *
 *  PINES ESP32 WROOM-32:
 *   DHT22  → GPIO 4
 *   I2C    → SDA=21  SCL=22   (INA219 + BH1750 + MPU6050)
 *
 *  ACCESO PWA:
 *   SSID   : HelioSync-XXXX   Pass: heliosync
 *   URL    : http://192.168.4.1
 *   WS     : ws://192.168.4.1/ws
 *
 *  ALMACENAMIENTO:
 *   /data/YYYY-MM-DD.jsonl  — una lectura por hora, formato JSONL
 *   /meta/index.json        — índice de archivos + espacio usado
 *   /meta/consent.json      — consentimiento del usuario
 *   NVS heliosync           — WiFi, cuenta local, sesión 90 días
 *
 *  RETENCIÓN: 30 días. Al superar el límite se elimina el día
 *  más antiguo automáticamente (circular buffer por día).
 * ============================================================
 */

// ── Core ──────────────────────────────────────────────────
#include <WiFi.h>
#include <DNSServer.h>
#include <Wire.h>
#include <math.h>
#include <time.h>
#include <sys/time.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include <esp_now.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#include <mbedtls/md.h>

// ── Servidor ──────────────────────────────────────────────
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>

// ── Utilidades ────────────────────────────────────────────
#include <ArduinoJson.h>
#include "web_assets.h"

// ── Sensores ──────────────────────────────────────────────
#include <DHT.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>
#include <MPU6050.h>

// ============================================================
//  CONFIGURACIÓN — ajustar según necesidad
// ============================================================
namespace Config {
#ifndef HELIOSYNC_FIREBASE_API_KEY
#define HELIOSYNC_FIREBASE_API_KEY "AIzaSyCntVnew9yfmqcUc2XFUVVCBzbOqx6AqAo"
#endif
#ifndef HELIOSYNC_FIREBASE_PROJECT_ID
#define HELIOSYNC_FIREBASE_PROJECT_ID "heliosync"
#endif

  // WiFi AP
  static const char*         AP_PASS       = "heliosync";
  static const int           AP_CHANNEL    = 1; // Igual que el puente Heltec indoor por ESP-NOW
  static const int           AP_MAX_CONN   = 4;
  static const byte          DNS_PORT      = 53;
  static const unsigned long WIFI_TEST_MS  = 25000UL;

  // Zona horaria: UTC-6 (México Centro, sin DST)
  static const long          GMT_OFFSET    = -6L * 3600L;
  static const int           DST_OFFSET    = 0;

  // Tracking
  static const float         ALERT_DEG     = 5.0f;   // error mínimo para alertar
  static const float         LUX_MIN_SUN   = 1000.0f;// lux mínimo para alerta activa

  // Intervalos
  static const unsigned long WS_MS         = 1000UL;          // WebSocket broadcast
  static const unsigned long SOLAR_MS      = 60UL*60UL*1000UL;// recalcular sol
  static const unsigned long STORE_MS      = 60UL*60UL*1000UL;// guardar en LittleFS
  static const uint64_t      SMART_SLEEP_US = 60ULL*60ULL*1000000ULL; // despertar cada 60 min
  static const unsigned long TIMER_WAKE_WINDOW_MS = 12000UL;

  // LittleFS
  static const int           MAX_DAYS      = 30;    // días de retención
  static const size_t        MAX_FS_BYTES  = 1200UL*1024UL; // 1.2 MB tope de uso

  // Identidad del nodo
  static const char*         PROJECT_NAME  = "HelioSync";
  static const char*         DEFAULT_LOCATION = "Panel HelioSync";
  static const char*         FIREBASE_API_KEY = HELIOSYNC_FIREBASE_API_KEY;
  static const char*         FIREBASE_PROJECT_ID = HELIOSYNC_FIREBASE_PROJECT_ID;

  // Pines
  static const int           DHT_PIN       = 4;
  static const int           SDA_PIN       = 21;
  static const int           SCL_PIN       = 22;
}

// ============================================================
//  ESTRUCTURAS DE DATOS
// ============================================================
struct SensorData {
  float tempC    = 0; float humidRH = 0; bool dhtOk  = false;
  float voltageV = 0; float currentA= 0; float powerW= 0; bool inaOk = false;
  float lux      = 0; bool  bhOk    = false;
  float pitchDeg = 0; float rollDeg = 0; bool  mpuOk = false;
};

struct SolarPos {
  float azDeg    = 0; float elDeg   = 0;
  float targetDeg= 0; bool  valid   = false;
};

struct GpsData {
  double lat = 0; double lon = 0; bool set = false;
  int timezoneOffsetMin = -360;
};

struct Alert {
  bool  active = false; float errorDeg = 0;
  char  msg[72] = "Panel alineado";
};

// Estado de consentimiento del usuario (persiste en LittleFS)
struct Consent {
  bool given     = false;   // ¿aceptó compartir datos?
  bool anonymous = true;    // ¿datos anonimizados?
  char uid[64]   = "";      // UID Firebase (vacío = sin cuenta)
};

struct DeviceSetupState {
  char operationMode[12] = "outdoor";
  char heltecPeerMac[18] = "10:51:DB:52:8B:B4";
  bool operationConfigured = false;

  bool wifiConfigured = false;
  bool wifiVerified   = false;
  bool wifiBusy       = false;
  bool wifiSkipped    = false;
  char wifiSsid[33]   = "";
  char wifiError[96]  = "";

  bool cloudAvailable = false;
  bool cloudBusy      = false;
  bool cloudReady     = false;
  bool cloudSkipped   = false;
  char cloudEmail[96] = "";
  char cloudUid[96]   = "";
  char cloudError[128]= "";

  bool locationSet    = false;
  bool setupComplete  = false;
  char locationSource[16] = "phone";
};

struct BridgeState {
  bool ready = false;
  bool peerConfigured = false;
  bool initialBusy = false;
  bool initialSent = false;
  bool linkTestBusy = false;
  bool linkTestOk = false;
  uint8_t peerMac[6] = {0x10, 0x51, 0xDB, 0x52, 0x8B, 0xB4};
  uint32_t sequence = 0;
  uint32_t sentOk = 0;
  uint32_t sentFail = 0;
  unsigned long lastSendMs = 0;
  char lastStatus[16] = "idle";
  char error[96] = "";
};

struct PowerState {
  bool smartSleep = false;
  bool pendingSleep = false;
  bool timerWake = false;
  unsigned long sleepAt = 0;
  esp_sleep_wakeup_cause_t wakeCause = ESP_SLEEP_WAKEUP_UNDEFINED;
};

struct LocalAuthState {
  bool localAccountReady = false;
  char username[96]      = "";
  char passwordSalt[33]  = "";
  char passwordHash[65]  = "";
  char sessionToken[65]  = "";
  uint64_t sessionUntil  = 0;
};

// Entrada del histórico local
struct HistoryEntry {
  char  ts[32]   = "";
  float tempC    = 0; float humidRH = 0; float lux    = 0;
  float voltageV = 0; float currentA= 0; float powerW = 0;
  float pitchDeg = 0; float elDeg   = 0; float azDeg  = 0;
  bool  alertWas = false;
};

// ============================================================
//  OBJETOS GLOBALES
// ============================================================
DHT             dht(Config::DHT_PIN, DHT22);
Adafruit_INA219 ina219;
BH1750          bh1750;
MPU6050         mpu;

AsyncWebServer  server(80);
AsyncWebSocket  ws("/ws");
Preferences     prefs;
DNSServer       dnsServer;

SensorData sensors;
SolarPos   solar;
GpsData    gps;
Alert      alert;
Consent    consent;
DeviceSetupState setupState;
LocalAuthState authState;
BridgeState bridgeState;
PowerState powerState;

unsigned long lastWs    = 0;
unsigned long lastSolar = 0;
unsigned long lastStore = 0;
unsigned long seq       = 0;
bool          ntpOk     = false;
String        apSSID;
bool          apActive  = false;

enum SetupJobType {
  SETUP_JOB_NONE,
  SETUP_JOB_WIFI_VERIFY,
  SETUP_JOB_FIREBASE_ACCOUNT,
  SETUP_JOB_INDOOR_LINK_TEST,
  SETUP_JOB_INDOOR_INITIAL_SEND
};

SetupJobType pendingSetupJob = SETUP_JOB_NONE;
unsigned long pendingSetupJobAt = 0;
String pendingWifiSsid;
String pendingWifiPassword;
String pendingAccountEmail;
String pendingAccountPassword;

bool applyEpochMs(double epochMsDouble){
  if(epochMsDouble <= 1600000000000.0){
    return false;
  }

  uint64_t epochMs = (uint64_t)epochMsDouble;
  struct timeval tv;
  tv.tv_sec = (time_t)(epochMs / 1000ULL);
  tv.tv_usec = (suseconds_t)((epochMs % 1000ULL) * 1000ULL);
  settimeofday(&tv, nullptr);
  ntpOk = true;
  return true;
}

// ============================================================
//  NAMESPACE IMU — Filtro complementario MPU6050
// ============================================================
namespace IMU {
  float roll = 0, pitch = 0;
  unsigned long lastUs = 0;
  const float A = 0.98f;

  void update() {
    int16_t ax,ay,az,gx,gy,gz;
    mpu.getMotion6(&ax,&ay,&az,&gx,&gy,&gz);

    unsigned long now = micros();
    float dt = (lastUs == 0) ? 0.01f : constrain((now-lastUs)/1e6f, 0.001f, 1.0f);
    lastUs = now;

    float aRoll  = atan2f((float)ay,(float)az) * 180.0f/M_PI;
    float aPitch = atan2f(-(float)ax, sqrtf((float)ay*ay+(float)az*az)) * 180.0f/M_PI;
    float gRoll  = (float)gx / 131.0f;
    float gPitch = (float)gy / 131.0f;

    roll  = A*(roll  + gRoll *dt) + (1-A)*aRoll;
    pitch = A*(pitch + gPitch*dt) + (1-A)*aPitch;
  }
}

// ============================================================
//  NAMESPACE SOLAR — Algoritmo UPV/EHU
//  http://www.sc.ehu.es/sbweb/fisica3/celeste/sol/sol.html
// ============================================================
namespace Solar {
  const double DEG = M_PI/180.0;

  double clamp(double v, double lo, double hi){
    return v<lo?lo:(v>hi?hi:v);
  }

  double julianDay(int Y,int M,int D,int h,int mi,int s){
    int a=(14-M)/12, y=Y+4800-a, m=M+12*a-3;
    double JDN = D+(153*m+2)/5+365*y+y/4-y/100+y/400-32045;
    return JDN + (h-12.0)/24.0 + mi/1440.0 + s/86400.0;
  }

  SolarPos calculate(double lat, double lon, struct tm& t){
    SolarPos p;
    int hUTC = t.tm_hour - (Config::GMT_OFFSET/3600);
    double JD = julianDay(t.tm_year+1900, t.tm_mon+1, t.tm_mday, hUTC, t.tm_min, t.tm_sec);
    double T  = (JD - 2451545.0) / 36525.0;

    double L0  = fmod(280.46646 + 36000.76983*T, 360.0);
    double M0  = fmod(357.52911 + 35999.05029*T - 0.0001537*T*T, 360.0);
    double C   = (1.914602 - 0.004817*T - 0.000014*T*T)*sin(M0*DEG)
               + (0.019993 - 0.000101*T)*sin(2*M0*DEG)
               + 0.000289*sin(3*M0*DEG);
    double sLon = L0 + C;

    double omega = 125.04 - 1934.136*T;
    double eps   = 23.439291 - 0.013004*T + 0.000164*sin(omega*DEG);
    double lam   = sLon - 0.00569 - 0.00478*sin(omega*DEG);
    double dec   = asin(sin(eps*DEG)*sin(lam*DEG)) / DEG;

    double y2 = tan((eps/2.0)*DEG); y2 *= y2;
    double e  = 0.016708634;
    double eqT = 4.0*(y2*sin(2*L0*DEG) - 2*e*sin(M0*DEG)
                + 4*e*y2*sin(M0*DEG)*cos(2*L0*DEG)
                - 0.5*y2*y2*sin(4*L0*DEG)
                - 1.25*e*e*sin(2*M0*DEG)) / DEG;

    double solarNoon = 720.0 - 4.0*lon - eqT;
    double minDay    = hUTC*60.0 + t.tm_min + t.tm_sec/60.0;
    double ha        = (minDay - solarNoon) * (15.0/60.0);

    double latR=lat*DEG, decR=dec*DEG, haR=ha*DEG;
    double sinEl = sin(latR)*sin(decR)+cos(latR)*cos(decR)*cos(haR);
    double el    = asin(clamp(sinEl,-1,1))/DEG;
    double cosAz = (sin(decR)-sin(latR)*sinEl)/(cos(latR)*cos(asin(sinEl)));
    double az    = acos(clamp(cosAz,-1,1))/DEG;
    if(sin(haR)>0) az = 360-az;

    p.azDeg     = (float)az;
    p.elDeg     = (float)el;
    p.targetDeg = (el>0) ? (float)(90.0-el) : 90.0f;
    p.valid     = (el > -5.0);
    return p;
  }
}

// ============================================================
//  NAMESPACE STORAGE — LittleFS store-and-forward
// ============================================================
namespace Storage {

  // Devuelve ruta del archivo del día: /data/YYYY-MM-DD.jsonl
  String dayPath(struct tm& t){
    char buf[32];
    snprintf(buf,sizeof(buf),"/data/%04d-%02d-%02d.jsonl",
             t.tm_year+1900, t.tm_mon+1, t.tm_mday);
    return String(buf);
  }

  // Bytes usados actualmente en /data/
  size_t usedBytes(){
    size_t total = 0;
    File root = LittleFS.open("/data");
    if(!root || !root.isDirectory()) return 0;
    File f = root.openNextFile();
    while(f){ total += f.size(); f = root.openNextFile(); }
    return total;
  }

  // Elimina el archivo .jsonl más antiguo en /data/
  void deleteOldest(){
    File root = LittleFS.open("/data");
    if(!root || !root.isDirectory()) return;
    String oldest = "";
    File f = root.openNextFile();
    while(f){
      String name = String("/data/") + f.name();
      if(oldest == "" || name < oldest) oldest = name;
      f = root.openNextFile();
    }
    if(oldest != ""){
      LittleFS.remove(oldest);
      Serial.printf("[FS] Eliminado día antiguo: %s\n", oldest.c_str());
    }
  }

  // Contar archivos de días en /data/
  int countDays(){
    int n = 0;
    File root = LittleFS.open("/data");
    if(!root || !root.isDirectory()) return 0;
    File f = root.openNextFile();
    while(f){ n++; f = root.openNextFile(); }
    return n;
  }

  // ── Inicializar sistema de archivos ──────────────────────
  bool begin(){
    if(!LittleFS.begin(true)){   // true = formatear si falla
      Serial.println("[FS] ERROR montando LittleFS");
      return false;
    }
    // Crear directorios si no existen
    if(!LittleFS.exists("/data")) LittleFS.mkdir("/data");
    if(!LittleFS.exists("/meta")) LittleFS.mkdir("/meta");
    Serial.printf("[FS] Montado. Usado: %u KB / %u KB\n",
                  LittleFS.usedBytes()/1024, LittleFS.totalBytes()/1024);
    return true;
  }

  // ── Guardar lectura horaria ───────────────────────────────
  void saveReading(const HistoryEntry& e){
    struct tm t; getLocalTime(&t, 1000);

    // Rotar si hay demasiados días
    while(countDays() >= Config::MAX_DAYS) deleteOldest();

    // Rotar si el espacio supera el tope
    while(usedBytes() > Config::MAX_FS_BYTES) deleteOldest();

    String path = dayPath(t);
    File f = LittleFS.open(path, FILE_APPEND);
    if(!f){
      Serial.printf("[FS] No se pudo abrir %s\n", path.c_str());
      return;
    }

    // Formato JSONL (una línea JSON por lectura)
    StaticJsonDocument<384> doc;
    doc["ts"]   = e.ts;
    doc["t"]    = roundf(e.tempC    *10)/10.0f;
    doc["h"]    = roundf(e.humidRH  *10)/10.0f;
    doc["lux"]  = roundf(e.lux);
    doc["v"]    = roundf(e.voltageV *100)/100.0f;
    doc["i"]    = roundf(e.currentA *1000)/1000.0f;
    doc["w"]    = roundf(e.powerW   *1000)/1000.0f;
    doc["pit"]  = roundf(e.pitchDeg *10)/10.0f;
    doc["el"]   = roundf(e.elDeg    *10)/10.0f;
    doc["az"]   = roundf(e.azDeg    *10)/10.0f;
    doc["alrt"] = e.alertWas;

    String line;
    serializeJson(doc, line);
    f.println(line);
    f.close();

    Serial.printf("[FS] Guardado en %s  (%u bytes usados)\n",
                  path.c_str(), (unsigned)usedBytes());
  }

  // ── Leer archivo de un día completo → String JSONL ───────
  String readDay(const String& date){
    String path = "/data/" + date + ".jsonl";
    if(!LittleFS.exists(path)) return "";
    File f = LittleFS.open(path, FILE_READ);
    if(!f) return "";
    String out = f.readString();
    f.close();
    return out;
  }

  // ── Lista de días disponibles → JSON array ────────────────
  String listDays(){
    StaticJsonDocument<512> doc;
    JsonArray arr = doc.to<JsonArray>();
    File root = LittleFS.open("/data");
    if(root && root.isDirectory()){
      File f = root.openNextFile();
      while(f){
        // Extraer YYYY-MM-DD del nombre del archivo
        String name = f.name();
        name.replace(".jsonl","");
        arr.add(name);
        f = root.openNextFile();
      }
    }
    String out; serializeJson(doc, out);
    return out;
  }

  // ── Guardar / cargar consentimiento ───────────────────────
  void saveConsent(const Consent& c){
    File f = LittleFS.open("/meta/consent.json", FILE_WRITE);
    if(!f) return;
    StaticJsonDocument<128> doc;
    doc["given"]     = c.given;
    doc["anonymous"] = c.anonymous;
    doc["uid"]       = c.uid;
    serializeJson(doc, f);
    f.close();
    Serial.printf("[FS] Consentimiento guardado: given=%d anon=%d\n",
                  c.given, c.anonymous);
  }

  void loadConsent(Consent& c){
    if(!LittleFS.exists("/meta/consent.json")) return;
    File f = LittleFS.open("/meta/consent.json", FILE_READ);
    if(!f) return;
    StaticJsonDocument<128> doc;
    if(!deserializeJson(doc, f)){
      c.given     = doc["given"]     | false;
      c.anonymous = doc["anonymous"] | true;
      strlcpy(c.uid, doc["uid"] | "", sizeof(c.uid));
    }
    f.close();
    Serial.printf("[FS] Consentimiento cargado: given=%d anon=%d uid=%s\n",
                  c.given, c.anonymous, c.uid);
  }

  // ── Estadísticas FS para diagnóstico ─────────────────────
  void printStats(){
    Serial.printf("[FS] Total: %u KB  Usado: %u KB  Días: %d\n",
                  LittleFS.totalBytes()/1024,
                  LittleFS.usedBytes()/1024,
                  countDays());
  }

  void clearDataDir(){
    File root = LittleFS.open("/data");
    if(root && root.isDirectory()){
      File f = root.openNextFile();
      while(f){
        String name = f.name();
        String path = name.startsWith("/") ? name : String("/data/") + name;
        f.close();
        LittleFS.remove(path);
        f = root.openNextFile();
      }
    }
  }

  void factoryReset(){
    clearDataDir();
    LittleFS.remove("/meta/consent.json");
    if(!LittleFS.exists("/data")) LittleFS.mkdir("/data");
    if(!LittleFS.exists("/meta")) LittleFS.mkdir("/meta");
    Serial.println("[FS] Historial y metadatos locales borrados");
  }
}

void recalcSolar();
void readAllSensors();
void updateAlert();

// ============================================================
//  ESP-NOW INDOOR — ESP32 sensor -> Heltec A
// ============================================================
namespace EspNowBridge {
  const uint8_t FLAG_DHT_OK = 1 << 0;
  const uint8_t FLAG_BH_OK  = 1 << 1;
  const uint8_t FLAG_INA_OK = 1 << 2;
  const char* LINK_TEST_MESSAGE = "Todo fue correcto, ahora ya puedes volver a conectarte a la red de HelioSync";

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

  bool isIndoorMode(){
    return strcmp(setupState.operationMode, "indoor") == 0;
  }

  int hexValue(char c){
    if(c >= '0' && c <= '9') return c - '0';
    if(c >= 'a' && c <= 'f') return c - 'a' + 10;
    if(c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  }

  bool parseMac(const String& macText, uint8_t out[6]){
    if(macText.length() != 17) return false;

    for(int i = 0; i < 6; i++){
      int pos = i * 3;
      int hi = hexValue(macText.charAt(pos));
      int lo = hexValue(macText.charAt(pos + 1));
      if(hi < 0 || lo < 0) return false;
      if(i < 5 && macText.charAt(pos + 2) != ':') return false;
      out[i] = (uint8_t)((hi << 4) | lo);
    }

    return true;
  }

  bool macLooksValid(const String& macText){
    uint8_t tmp[6];
    return parseMac(macText, tmp);
  }

  void copyError(const char* msg){
    strlcpy(bridgeState.error, msg, sizeof(bridgeState.error));
    strlcpy(bridgeState.lastStatus, "error", sizeof(bridgeState.lastStatus));
  }

  void onDataSent(const wifi_tx_info_t*, esp_now_send_status_t status){
    bridgeState.lastSendMs = millis();
    if(status == ESP_NOW_SEND_SUCCESS){
      bridgeState.sentOk++;
      strlcpy(bridgeState.lastStatus, "ok", sizeof(bridgeState.lastStatus));
      strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
    } else {
      bridgeState.sentFail++;
      strlcpy(bridgeState.lastStatus, "fail", sizeof(bridgeState.lastStatus));
      copyError("La tarjeta de pared no confirmó la lectura.");
    }
  }

  void stop(){
    if(bridgeState.ready){
      esp_now_deinit();
    }
    bridgeState.ready = false;
    bridgeState.peerConfigured = false;
  }

  bool beginOrRefresh(){
    if(!isIndoorMode()){
      stop();
      strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
      strlcpy(bridgeState.lastStatus, "idle", sizeof(bridgeState.lastStatus));
      return false;
    }

    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);

    uint8_t peer[6];
    if(!parseMac(String(setupState.heltecPeerMac), peer)){
      copyError("Código de la tarjeta de pared inválido. Escríbelo tal como aparece en la pantalla.");
      bridgeState.peerConfigured = false;
      return false;
    }

    memcpy(bridgeState.peerMac, peer, sizeof(bridgeState.peerMac));

    if(!bridgeState.ready){
      if(esp_now_init() != ESP_OK){
        copyError("No pudimos preparar el envío a la tarjeta de pared.");
        return false;
      }
      esp_now_register_send_cb(onDataSent);
      bridgeState.ready = true;
    }

    esp_wifi_set_channel(Config::AP_CHANNEL, WIFI_SECOND_CHAN_NONE);

    if(esp_now_is_peer_exist(bridgeState.peerMac)){
      esp_now_del_peer(bridgeState.peerMac);
    }

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, bridgeState.peerMac, sizeof(peerInfo.peer_addr));
    peerInfo.channel = Config::AP_CHANNEL;
    peerInfo.encrypt = false;
    peerInfo.ifidx = WIFI_IF_STA;

    if(esp_now_add_peer(&peerInfo) != ESP_OK){
      bridgeState.peerConfigured = false;
      copyError("No pudimos guardar la tarjeta de pared como destino.");
      return false;
    }

    bridgeState.peerConfigured = true;
    strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
    if(strcmp(bridgeState.lastStatus, "idle") == 0 || strcmp(bridgeState.lastStatus, "error") == 0){
      strlcpy(bridgeState.lastStatus, "ready", sizeof(bridgeState.lastStatus));
    }
    return true;
  }

  bool sendLatest(){
    if(!isIndoorMode()){
      return false;
    }

    if(!bridgeState.ready || !bridgeState.peerConfigured){
      if(!beginOrRefresh()){
        return false;
      }
    }

    SensorBridgePacket pkt = {};
    pkt.seq = ++bridgeState.sequence;
    pkt.tempC = sensors.dhtOk ? sensors.tempC : -999.0f;
    pkt.humRH = sensors.dhtOk ? sensors.humidRH : -999.0f;
    pkt.lux = sensors.bhOk ? sensors.lux : -1.0f;
    pkt.voltageV = sensors.inaOk ? sensors.voltageV : -999.0f;
    pkt.currentA = sensors.inaOk ? sensors.currentA : -999.0f;
    pkt.powerW = sensors.inaOk ? sensors.powerW : -999.0f;
    pkt.flags = 0;
    if(sensors.dhtOk) pkt.flags |= FLAG_DHT_OK;
    if(sensors.bhOk) pkt.flags |= FLAG_BH_OK;
    if(sensors.inaOk) pkt.flags |= FLAG_INA_OK;

    esp_err_t result = esp_now_send(bridgeState.peerMac, (uint8_t*)&pkt, sizeof(pkt));
    if(result != ESP_OK){
      bridgeState.sentFail++;
      copyError("No pudimos enviar la lectura a la tarjeta de pared.");
      return false;
    }

    strlcpy(bridgeState.lastStatus, "tx", sizeof(bridgeState.lastStatus));
    return true;
  }

  bool sendLatestWithRetries(uint8_t attempts = 3, unsigned long ackTimeoutMs = 800UL){
    for(uint8_t attempt = 0; attempt < attempts; attempt++){
      uint32_t okBefore = bridgeState.sentOk;
      uint32_t failBefore = bridgeState.sentFail;

      if(!sendLatest()){
        delay(120);
        continue;
      }

      unsigned long startedAt = millis();
      while(bridgeState.sentOk == okBefore && bridgeState.sentFail == failBefore && millis() - startedAt < ackTimeoutMs){
        delay(20);
      }

      if(bridgeState.sentOk > okBefore){
        return true;
      }

      delay(180);
    }

    return false;
  }

  bool sendTextWithRetries(const char* text, uint8_t attempts = 6, unsigned long ackTimeoutMs = 850UL){
    if(!isIndoorMode()){
      return false;
    }

    if(!bridgeState.ready || !bridgeState.peerConfigured){
      if(!beginOrRefresh()){
        return false;
      }
    }

    size_t len = strlen(text);
    for(uint8_t attempt = 0; attempt < attempts; attempt++){
      uint32_t okBefore = bridgeState.sentOk;
      uint32_t failBefore = bridgeState.sentFail;
      esp_err_t result = esp_now_send(bridgeState.peerMac, (const uint8_t*)text, len);
      if(result != ESP_OK){
        bridgeState.sentFail++;
        copyError("No pudimos enviar el mensaje de prueba a la tarjeta de pared.");
        delay(160);
        continue;
      }

      strlcpy(bridgeState.lastStatus, "test", sizeof(bridgeState.lastStatus));
      unsigned long startedAt = millis();
      while(bridgeState.sentOk == okBefore && bridgeState.sentFail == failBefore && millis() - startedAt < ackTimeoutMs){
        delay(20);
      }

      if(bridgeState.sentOk > okBefore){
        strlcpy(bridgeState.lastStatus, "ok", sizeof(bridgeState.lastStatus));
        strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
        return true;
      }

      delay(220);
    }

    if(strlen(bridgeState.error) == 0){
      copyError("La tarjeta de pared no respondió. Revisa que esté encendida y que el código sea correcto.");
    }
    return false;
  }
}

// ============================================================
//  AUTH LOCAL — cuenta y sesión guardadas en el ESP32
// ============================================================
namespace DeviceAuth {
  static const uint64_t SESSION_SECONDS = 90ULL * 24ULL * 60ULL * 60ULL;

  String normalizeUsername(String value){
    value.trim();
    value.toLowerCase();
    return value;
  }

  bool hasTrustedClock(){
    return time(nullptr) > 1600000000;
  }

  uint64_t nextSessionExpiry(){
    time_t now = time(nullptr);
    if(now > 1600000000){
      return (uint64_t)now + SESSION_SECONDS;
    }

    return 0;
  }

  String bytesToHex(const uint8_t* bytes, size_t len){
    static const char* HEX_CHARS = "0123456789abcdef";
    String out;
    out.reserve(len * 2);

    for(size_t i = 0; i < len; i++){
      out += HEX_CHARS[(bytes[i] >> 4) & 0x0F];
      out += HEX_CHARS[bytes[i] & 0x0F];
    }

    return out;
  }

  String randomHex(size_t bytes){
    String out;
    out.reserve(bytes * 2);

    for(size_t i = 0; i < bytes; i++){
      uint8_t b = (uint8_t)(esp_random() & 0xFF);
      char chunk[3];
      snprintf(chunk, sizeof(chunk), "%02x", b);
      out += chunk;
    }

    return out;
  }

  String sha256Hex(const String& input){
    uint8_t digest[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if(!info || mbedtls_md(info, (const unsigned char*)input.c_str(), input.length(), digest) != 0){
      return "";
    }

    return bytesToHex(digest, sizeof(digest));
  }

  bool safeEquals(const char* stored, const String& candidate){
    size_t storedLen = strlen(stored);
    if(storedLen != candidate.length()){
      return false;
    }

    uint8_t diff = 0;
    for(size_t i = 0; i < storedLen; i++){
      diff |= ((uint8_t)stored[i]) ^ ((uint8_t)candidate[i]);
    }

    return diff == 0;
  }

  void load(){
    prefs.begin("heliosync", true);
    String username = prefs.getString("auth_user", "");
    String salt = prefs.getString("auth_salt", "");
    String hash = prefs.getString("auth_hash", "");
    String token = prefs.getString("auth_token", "");
    uint64_t until = prefs.getULong64("auth_until", 0);
    prefs.end();

    authState.localAccountReady = username.length() > 0 && salt.length() > 0 && hash.length() == 64;
    strlcpy(authState.username, username.c_str(), sizeof(authState.username));
    strlcpy(authState.passwordSalt, salt.c_str(), sizeof(authState.passwordSalt));
    strlcpy(authState.passwordHash, hash.c_str(), sizeof(authState.passwordHash));
    strlcpy(authState.sessionToken, token.c_str(), sizeof(authState.sessionToken));
    authState.sessionUntil = until;
  }

  bool hasActiveSession(){
    if(!authState.localAccountReady || strlen(authState.sessionToken) == 0){
      return false;
    }

    if(authState.sessionUntil == 0 || !hasTrustedClock()){
      return true;
    }

    return (uint64_t)time(nullptr) <= authState.sessionUntil;
  }

  bool tokenValid(const String& token){
    String clean = token;
    clean.trim();
    return clean.length() > 0 && hasActiveSession() && safeEquals(authState.sessionToken, clean);
  }

  String requestToken(AsyncWebServerRequest* req){
    if(req->hasHeader("X-HelioSync-Session")){
      return req->getHeader("X-HelioSync-Session")->value();
    }

    if(req->hasParam("token")){
      return req->getParam("token")->value();
    }

    return "";
  }

  bool requestAuthenticated(AsyncWebServerRequest* req){
    if(!authState.localAccountReady){
      return true;
    }

    return tokenValid(requestToken(req));
  }

  void clearSession(){
    prefs.begin("heliosync", false);
    prefs.putString("auth_token", "");
    prefs.putULong64("auth_until", 0);
    prefs.end();

    strlcpy(authState.sessionToken, "", sizeof(authState.sessionToken));
    authState.sessionUntil = 0;
  }

  bool startSession(String& tokenOut){
    tokenOut = randomHex(32);
    authState.sessionUntil = nextSessionExpiry();
    strlcpy(authState.sessionToken, tokenOut.c_str(), sizeof(authState.sessionToken));

    prefs.begin("heliosync", false);
    prefs.putString("auth_token", tokenOut);
    prefs.putULong64("auth_until", authState.sessionUntil);
    prefs.end();

    return tokenOut.length() > 0;
  }

  bool saveLocalAccount(const String& username, const String& password, String& tokenOut){
    String normalized = normalizeUsername(username);
    if(normalized.length() < 3 || normalized.length() >= sizeof(authState.username) || password.length() < 8){
      return false;
    }

    String salt = randomHex(16);
    String hash = sha256Hex(salt + ":" + password);
    if(salt.length() == 0 || hash.length() != 64){
      return false;
    }

    prefs.begin("heliosync", false);
    prefs.putString("auth_user", normalized);
    prefs.putString("auth_salt", salt);
    prefs.putString("auth_hash", hash);
    prefs.end();

    authState.localAccountReady = true;
    strlcpy(authState.username, normalized.c_str(), sizeof(authState.username));
    strlcpy(authState.passwordSalt, salt.c_str(), sizeof(authState.passwordSalt));
    strlcpy(authState.passwordHash, hash.c_str(), sizeof(authState.passwordHash));

    return startSession(tokenOut);
  }

  bool passwordMatches(const String& username, const String& password){
    if(!authState.localAccountReady){
      return false;
    }

    String normalized = normalizeUsername(username);
    if(!safeEquals(authState.username, normalized)){
      return false;
    }

    String hash = sha256Hex(String(authState.passwordSalt) + ":" + password);
    return hash.length() == 64 && safeEquals(authState.passwordHash, hash);
  }

  String buildStatusJson(AsyncWebServerRequest* req, const String& token = ""){
    StaticJsonDocument<512> doc;
    bool authenticated = !authState.localAccountReady || token.length() > 0 || requestAuthenticated(req);

    doc["local_account_ready"] = authState.localAccountReady;
    doc["account_required"] = authState.localAccountReady;
    doc["authenticated"] = authenticated;
    doc["username"] = authState.username;
    doc["session_days"] = 90;
    if(authState.sessionUntil > 0){
      doc["session_expires_at"] = authState.sessionUntil;
    }
    if(token.length() > 0){
      doc["token"] = token;
    }

    String out;
    serializeJson(doc, out);
    return out;
  }
}

// ============================================================
//  SETUP DEL DISPOSITIVO — AP, WiFi externo y onboarding local
// ============================================================
namespace DeviceSetup {
  void copyTo(char* dest, size_t destSize, const String& value){
    strlcpy(dest, value.c_str(), destSize);
  }

  bool firebaseAvailable(){
    return strlen(Config::FIREBASE_API_KEY) > 10 && strlen(Config::FIREBASE_PROJECT_ID) > 0;
  }

  bool looksLikeEmail(const String& email){
    int at = email.indexOf('@');
    int dot = email.lastIndexOf('.');
    return email.length() >= 6 && at > 0 && dot > at + 1 && dot < (int)email.length() - 1;
  }

  bool isIndoorMode(){
    return strcmp(setupState.operationMode, "indoor") == 0;
  }

  bool modeIsValid(const String& mode){
    return mode == "outdoor" || mode == "indoor";
  }

  void load(){
    prefs.begin("heliosync", true);
    String mode = prefs.getString("op_mode", "outdoor");
    if(!modeIsValid(mode)) mode = "outdoor";
    copyTo(setupState.operationMode, sizeof(setupState.operationMode), mode);
    copyTo(setupState.heltecPeerMac, sizeof(setupState.heltecPeerMac), prefs.getString("heltec_mac", "10:51:DB:52:8B:B4"));
    setupState.operationConfigured = prefs.getBool("op_set", false);

    String ssid = prefs.getString("wifi_ssid", "");
    setupState.wifiConfigured = ssid.length() > 0;
    setupState.wifiVerified   = prefs.getBool("wifi_ok", false);
    setupState.wifiSkipped    = prefs.getBool("wifi_skip", false);
    copyTo(setupState.wifiSsid, sizeof(setupState.wifiSsid), ssid);
    copyTo(setupState.wifiError, sizeof(setupState.wifiError), prefs.getString("wifi_err", ""));

    setupState.cloudAvailable = firebaseAvailable();
    setupState.cloudReady     = prefs.getBool("cloud_ok", false);
    setupState.cloudSkipped   = prefs.getBool("cloud_skip", !setupState.cloudAvailable);
    copyTo(setupState.cloudEmail, sizeof(setupState.cloudEmail), prefs.getString("cloud_email", ""));
    copyTo(setupState.cloudUid, sizeof(setupState.cloudUid), prefs.getString("cloud_uid", ""));
    copyTo(setupState.cloudError, sizeof(setupState.cloudError), prefs.getString("cloud_err", ""));

    setupState.locationSet    = prefs.getBool("loc_set", gps.set);
    setupState.setupComplete  = prefs.getBool("setup_done", false);
    copyTo(setupState.locationSource, sizeof(setupState.locationSource), prefs.getString("loc_source", "phone"));
    powerState.smartSleep     = prefs.getBool("smart_sleep", false);
    prefs.end();

    if(!setupState.cloudAvailable && !setupState.cloudSkipped){
      setupState.cloudSkipped = true;
    }
  }

  String getStoredWifiPassword(){
    prefs.begin("heliosync", true);
    String password = prefs.getString("wifi_pass", "");
    prefs.end();
    return password;
  }

  void saveOperationMode(const String& mode, const String& heltecMac){
    String nextMode = modeIsValid(mode) ? mode : "outdoor";
    String nextMac = heltecMac;
    nextMac.trim();
    nextMac.toUpperCase();
    if(nextMac.length() == 0){
      nextMac = "10:51:DB:52:8B:B4";
    }

    prefs.begin("heliosync", false);
    prefs.putString("op_mode", nextMode);
    prefs.putString("heltec_mac", nextMac);
    prefs.putBool("op_set", true);
    prefs.end();

    copyTo(setupState.operationMode, sizeof(setupState.operationMode), nextMode);
    copyTo(setupState.heltecPeerMac, sizeof(setupState.heltecPeerMac), nextMac);
    setupState.operationConfigured = true;
    bridgeState.linkTestBusy = false;
    bridgeState.linkTestOk = nextMode != "indoor";
    bridgeState.initialBusy = false;
    bridgeState.initialSent = false;
    strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
    EspNowBridge::beginOrRefresh();
  }

  void saveSmartSleep(bool enabled){
    powerState.smartSleep = enabled;
    prefs.begin("heliosync", false);
    prefs.putBool("smart_sleep", enabled);
    prefs.end();
  }

  void saveWifiSuccess(const String& ssid, const String& password){
    prefs.begin("heliosync", false);
    prefs.putString("wifi_ssid", ssid);
    prefs.putString("wifi_pass", password);
    prefs.putBool("wifi_ok", true);
    prefs.putBool("wifi_skip", false);
    prefs.putString("wifi_err", "");
    prefs.end();

    setupState.wifiConfigured = true;
    setupState.wifiVerified = true;
    setupState.wifiSkipped = false;
    setupState.wifiBusy = false;
    copyTo(setupState.wifiSsid, sizeof(setupState.wifiSsid), ssid);
    strlcpy(setupState.wifiError, "", sizeof(setupState.wifiError));
  }

  void saveWifiFailure(const String& ssid, const String& error){
    prefs.begin("heliosync", false);
    prefs.putString("wifi_ssid", ssid);
    prefs.putBool("wifi_ok", false);
    prefs.putBool("wifi_skip", false);
    prefs.putString("wifi_err", error);
    prefs.end();

    setupState.wifiConfigured = ssid.length() > 0;
    setupState.wifiVerified = false;
    setupState.wifiSkipped = false;
    setupState.wifiBusy = false;
    copyTo(setupState.wifiSsid, sizeof(setupState.wifiSsid), ssid);
    copyTo(setupState.wifiError, sizeof(setupState.wifiError), error);
  }

  void skipWifi(){
    prefs.begin("heliosync", false);
    prefs.putString("wifi_ssid", "");
    prefs.putString("wifi_pass", "");
    prefs.putBool("wifi_ok", false);
    prefs.putBool("wifi_skip", true);
    prefs.putString("wifi_err", "");
    prefs.end();

    setupState.wifiConfigured = false;
    setupState.wifiVerified = false;
    setupState.wifiSkipped = true;
    setupState.wifiBusy = false;
    strlcpy(setupState.wifiSsid, "", sizeof(setupState.wifiSsid));
    strlcpy(setupState.wifiError, "", sizeof(setupState.wifiError));
  }

  void saveCloudSuccess(const String& email, const String& uid, const String& refreshToken){
    prefs.begin("heliosync", false);
    prefs.putBool("cloud_ok", true);
    prefs.putBool("cloud_skip", false);
    prefs.putString("cloud_email", email);
    prefs.putString("cloud_uid", uid);
    prefs.putString("cloud_refresh", refreshToken);
    prefs.putString("cloud_err", "");
    time_t now = time(nullptr);
    if(now > 1600000000){
      prefs.putULong64("cloud_until", (uint64_t)now + 90ULL * 24ULL * 60ULL * 60ULL);
    }
    prefs.end();

    setupState.cloudReady = true;
    setupState.cloudSkipped = false;
    setupState.cloudBusy = false;
    copyTo(setupState.cloudEmail, sizeof(setupState.cloudEmail), email);
    copyTo(setupState.cloudUid, sizeof(setupState.cloudUid), uid);
    strlcpy(setupState.cloudError, "", sizeof(setupState.cloudError));
    consent.given = true;
    consent.anonymous = true;
    copyTo(consent.uid, sizeof(consent.uid), uid);
    Storage::saveConsent(consent);
  }

  void saveCloudFailure(const String& error){
    prefs.begin("heliosync", false);
    prefs.putBool("cloud_ok", false);
    prefs.putBool("cloud_skip", true);
    prefs.putString("cloud_err", error);
    prefs.end();

    setupState.cloudReady = false;
    setupState.cloudSkipped = true;
    setupState.cloudBusy = false;
    copyTo(setupState.cloudError, sizeof(setupState.cloudError), error);
  }

  void skipCloud(const String& note = ""){
    prefs.begin("heliosync", false);
    prefs.putBool("cloud_ok", false);
    prefs.putBool("cloud_skip", true);
    prefs.putString("cloud_err", note);
    prefs.end();

    setupState.cloudReady = false;
    setupState.cloudSkipped = true;
    setupState.cloudBusy = false;
    copyTo(setupState.cloudError, sizeof(setupState.cloudError), note);
  }

  void saveLocation(double lat, double lon, int timezoneOffsetMin, const String& source){
    gps.lat = lat;
    gps.lon = lon;
    gps.timezoneOffsetMin = timezoneOffsetMin;
    gps.set = true;
    setupState.locationSet = true;
    copyTo(setupState.locationSource, sizeof(setupState.locationSource), source.length() ? source : "phone");

    prefs.begin("heliosync", false);
    prefs.putDouble("lat", gps.lat);
    prefs.putDouble("lon", gps.lon);
    prefs.putInt("tz_min", gps.timezoneOffsetMin);
    prefs.putBool("loc_set", true);
    prefs.putString("loc_source", setupState.locationSource);
    prefs.end();

    recalcSolar();
  }

  void markComplete(bool complete){
    setupState.setupComplete = complete;
    if(!setupState.cloudReady){
      setupState.cloudSkipped = true;
    }

    prefs.begin("heliosync", false);
    prefs.putBool("setup_done", complete);
    prefs.putBool("cloud_skip", setupState.cloudSkipped);
    prefs.end();
  }

  String buildStatusJson(){
    StaticJsonDocument<1900> doc;
    doc["setup_complete"] = setupState.setupComplete;
    doc["project"] = Config::PROJECT_NAME;

    auto auth = doc.createNestedObject("auth");
    auth["local_account_ready"] = authState.localAccountReady;
    auth["account_required"] = authState.localAccountReady;
    auth["username"] = authState.username;
    auth["session_days"] = 90;

    auto ap = doc.createNestedObject("ap");
    ap["ssid"] = apSSID;
    ap["password"] = Config::AP_PASS;
    ap["ip"] = WiFi.softAPIP().toString();
    ap["active"] = apActive;

    auto operation = doc.createNestedObject("operation");
    operation["mode"] = setupState.operationMode;
    operation["configured"] = setupState.operationConfigured;
    operation["indoor"] = isIndoorMode();
    operation["outdoor"] = !isIndoorMode();
    operation["heltec_peer_mac"] = setupState.heltecPeerMac;
    operation["espnow_channel"] = Config::AP_CHANNEL;

    auto bridge = doc.createNestedObject("espnow");
    bridge["ready"] = bridgeState.ready;
    bridge["peer_configured"] = bridgeState.peerConfigured;
    bridge["link_test_busy"] = bridgeState.linkTestBusy;
    bridge["link_test_ok"] = bridgeState.linkTestOk;
    bridge["initial_busy"] = bridgeState.initialBusy;
    bridge["initial_sent"] = bridgeState.initialSent;
    bridge["peer_mac"] = setupState.heltecPeerMac;
    bridge["sent_ok"] = bridgeState.sentOk;
    bridge["sent_fail"] = bridgeState.sentFail;
    bridge["last_status"] = bridgeState.lastStatus;
    bridge["error"] = bridgeState.error;

    auto power = doc.createNestedObject("power");
    power["smart_sleep"] = powerState.smartSleep;
    power["timer_minutes"] = 60;
    power["timer_wake"] = powerState.timerWake;
    power["pending_sleep"] = powerState.pendingSleep;

    auto wifi = doc.createNestedObject("wifi");
    wifi["configured"] = setupState.wifiConfigured;
    wifi["verified"] = setupState.wifiVerified;
    wifi["busy"] = setupState.wifiBusy;
    wifi["skipped"] = setupState.wifiSkipped;
    wifi["ssid"] = setupState.wifiSsid;
    wifi["error"] = setupState.wifiError;

    auto cloud = doc.createNestedObject("cloud");
    cloud["available"] = setupState.cloudAvailable;
    cloud["busy"] = setupState.cloudBusy;
    cloud["ready"] = setupState.cloudReady;
    cloud["skipped"] = setupState.cloudSkipped;
    cloud["email"] = setupState.cloudEmail;
    cloud["uid"] = setupState.cloudUid;
    cloud["error"] = setupState.cloudError;

    auto loc = doc.createNestedObject("location");
    loc["set"] = setupState.locationSet && gps.set;
    loc["lat"] = gps.set ? gps.lat : 0;
    loc["lon"] = gps.set ? gps.lon : 0;
    loc["source"] = setupState.locationSource;
    loc["timezone_offset_min"] = gps.timezoneOffsetMin;

    auto store = doc.createNestedObject("storage");
    int usedKb = (int)(LittleFS.usedBytes()/1024);
    int maxKb = (int)(Config::MAX_FS_BYTES/1024);
    int days = Storage::countDays();
    int usedPercent = maxKb > 0 ? (int)((usedKb * 100L) / maxKb) : 0;
    store["days_stored"] = days;
    store["retention_days"] = Config::MAX_DAYS;
    store["used_kb"] = usedKb;
    store["max_kb"] = maxKb;
    store["used_percent"] = constrain(usedPercent, 0, 100);
    store["near_full"] = usedPercent >= 85 || days >= Config::MAX_DAYS - 2;

    String out;
    serializeJson(doc, out);
    return out;
  }

  void resetOnboarding(){
    setupState.setupComplete = false;
    prefs.begin("heliosync", false);
    prefs.putBool("setup_done", false);
    prefs.end();
  }

  void factoryReset(){
    prefs.begin("heliosync", false);
    prefs.clear();
    prefs.end();

    Storage::factoryReset();

    setupState = DeviceSetupState();
    setupState.cloudAvailable = firebaseAvailable();
    setupState.cloudSkipped = !setupState.cloudAvailable;
    authState = LocalAuthState();
    bridgeState = BridgeState();
    powerState = PowerState();
    consent = Consent();
    gps = GpsData();
    solar = SolarPos();
    alert = Alert();
    pendingSetupJob = SETUP_JOB_NONE;
    pendingWifiSsid = "";
    pendingWifiPassword = "";
    pendingAccountEmail = "";
    pendingAccountPassword = "";
  }
}

void stopAccessPoint(){
  EspNowBridge::stop();
  if(apActive){
    dnsServer.stop();
    WiFi.softAPdisconnect(true);
    apActive = false;
  }
}

void startAccessPoint(){
  stopAccessPoint();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apSSID.c_str(), Config::AP_PASS, Config::AP_CHANNEL, 0, Config::AP_MAX_CONN);
  apActive = true;
  dnsServer.start(Config::DNS_PORT, "*", WiFi.softAPIP());
  EspNowBridge::beginOrRefresh();
  Serial.printf("[WiFi]    AP: %s  IP: %s\n",
                apSSID.c_str(), WiFi.softAPIP().toString().c_str());
}

bool connectExternalWifi(const String& ssid, const String& password, unsigned long timeoutMs){
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long startedAt = millis();
  while(WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs){
    delay(250);
  }

  return WiFi.status() == WL_CONNECTED;
}

String firebaseAuthRequest(const char* endpoint, const String& email, const String& password, bool& ok){
  ok = false;
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String("https://identitytoolkit.googleapis.com/v1/") + endpoint + "?key=" + Config::FIREBASE_API_KEY;

  if(!http.begin(client, url)){
    return "No pudimos conectar con la NUBE.";
  }

  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<256> requestDoc;
  requestDoc["email"] = email;
  requestDoc["password"] = password;
  requestDoc["returnSecureToken"] = true;
  String body;
  serializeJson(requestDoc, body);

  int code = http.POST(body);
  String response = http.getString();
  http.end();

  if(code >= 200 && code < 300){
    ok = true;
    return response;
  }

  DynamicJsonDocument errorDoc(1024);
  String message = "La NUBE no aceptó el registro.";
  if(!deserializeJson(errorDoc, response)){
    message = errorDoc["error"]["message"] | message;
  }

  return message;
}

String cloudIsoNow(){
  time_t now = time(nullptr);
  if(now <= 1600000000){
    return String("panel-boot-") + String(millis());
  }

  struct tm t;
  gmtime_r(&now, &t);
  char buf[28];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
  return String(buf);
}

void addFirestoreString(JsonObject fields, const char* key, const String& value){
  fields.createNestedObject(key)["stringValue"] = value;
}

void addFirestoreBool(JsonObject fields, const char* key, bool value){
  fields.createNestedObject(key)["booleanValue"] = value;
}

bool firestorePatchDocument(const String& path, const String& updateMask, const String& body, const String& idToken, String& error){
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String("https://firestore.googleapis.com/v1/projects/")
    + Config::FIREBASE_PROJECT_ID
    + "/databases/(default)/documents/"
    + path
    + "?key="
    + Config::FIREBASE_API_KEY
    + updateMask;

  if(!http.begin(client, url)){
    error = "No pudimos conectar con la NUBE.";
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + idToken);
  int code = http.PATCH(body);
  String response = http.getString();
  http.end();

  if(code >= 200 && code < 300){
    return true;
  }

  DynamicJsonDocument errorDoc(1024);
  error = "La NUBE creó la cuenta, pero no pudimos preparar su espacio.";
  if(!deserializeJson(errorDoc, response)){
    error = errorDoc["error"]["message"] | error;
  }
  return false;
}

bool createCloudBootstrapDocuments(const String& uid, const String& email, const String& idToken, String& error){
  if(uid.length() == 0 || idToken.length() == 0){
    error = "La NUBE no terminó de crear la cuenta.";
    return false;
  }

  String nowIso = cloudIsoNow();

  {
    DynamicJsonDocument profileDoc(1024);
    JsonObject fields = profileDoc.createNestedObject("fields");
    addFirestoreString(fields, "uid", uid);
    addFirestoreString(fields, "displayName", "");
    addFirestoreString(fields, "email", email);
    addFirestoreString(fields, "provider", "password");
    addFirestoreString(fields, "createdAt", nowIso);
    addFirestoreString(fields, "updatedAt", nowIso);

    String body;
    serializeJson(profileDoc, body);
    String mask = "&updateMask.fieldPaths=uid&updateMask.fieldPaths=displayName&updateMask.fieldPaths=email&updateMask.fieldPaths=provider&updateMask.fieldPaths=createdAt&updateMask.fieldPaths=updatedAt";
    if(!firestorePatchDocument("users/" + uid, mask, body, idToken, error)){
      return false;
    }
  }

  {
    DynamicJsonDocument setupDoc(1536);
    JsonObject fields = setupDoc.createNestedObject("fields");
    bool indoor = DeviceSetup::isIndoorMode();
    addFirestoreString(fields, "uid", uid);
    addFirestoreString(fields, "systemProfile", indoor ? "home" : "outdoor");
    addFirestoreString(fields, "connectivityMode", indoor ? "connected" : "autonomous");
    addFirestoreBool(fields, "syncEnabled", true);
    addFirestoreString(fields, "operatingMode", "tracking");
    addFirestoreBool(fields, "setupCompleted", false);
    addFirestoreBool(fields, "onboardingCompleted", false);
    addFirestoreString(fields, "createdAt", nowIso);
    addFirestoreString(fields, "updatedAt", nowIso);

    JsonObject locationFields = fields.createNestedObject("location").createNestedObject("mapValue").createNestedObject("fields");
    addFirestoreString(locationFields, "source", "phone");
    addFirestoreString(locationFields, "city", "");
    addFirestoreString(locationFields, "region", "");
    addFirestoreString(locationFields, "country", "");
    addFirestoreString(locationFields, "timezone", "");
    addFirestoreString(locationFields, "label", "");

    String body;
    serializeJson(setupDoc, body);
    String mask = "&updateMask.fieldPaths=uid&updateMask.fieldPaths=location&updateMask.fieldPaths=systemProfile&updateMask.fieldPaths=connectivityMode&updateMask.fieldPaths=syncEnabled&updateMask.fieldPaths=operatingMode&updateMask.fieldPaths=setupCompleted&updateMask.fieldPaths=onboardingCompleted&updateMask.fieldPaths=createdAt&updateMask.fieldPaths=updatedAt";
    if(!firestorePatchDocument("userSetups/" + uid, mask, body, idToken, error)){
      return false;
    }
  }

  return true;
}

String friendlyCloudError(const String& message){
  if(message.indexOf("WEAK_PASSWORD") >= 0){
    return "La contraseña necesita al menos 8 caracteres.";
  }
  if(message == "EMAIL_EXISTS"){
    return "Ese correo ya existe en la NUBE.";
  }
  if(message.indexOf("INVALID_PASSWORD") >= 0 || message.indexOf("EMAIL_NOT_FOUND") >= 0 || message.indexOf("INVALID_LOGIN_CREDENTIALS") >= 0){
    return "El correo o la contraseña no coinciden con la cuenta de la NUBE.";
  }
  if(message.indexOf("TOO_MANY") >= 0){
    return "Hubo demasiados intentos. Inténtalo de nuevo en unos minutos.";
  }
  if(message.indexOf("Firebase") >= 0 || message.indexOf("UID") >= 0){
    return "La NUBE no terminó el registro. Puedes continuar con el acceso del panel.";
  }
  return message;
}

void runWifiVerificationJob(){
  Serial.printf("[SETUP] Verificando WiFi externo: %s\n", pendingWifiSsid.c_str());
  stopAccessPoint();
  delay(350);

  bool connected = connectExternalWifi(pendingWifiSsid, pendingWifiPassword, Config::WIFI_TEST_MS);

  if(connected){
    Serial.printf("[SETUP] WiFi externo OK. IP STA: %s\n", WiFi.localIP().toString().c_str());
    configTime(Config::GMT_OFFSET, Config::DST_OFFSET, "pool.ntp.org","time.nist.gov");
    struct tm t;
    ntpOk = getLocalTime(&t,3000);
    DeviceSetup::saveWifiSuccess(pendingWifiSsid, pendingWifiPassword);
  } else {
    Serial.println("[SETUP] WiFi externo falló");
    DeviceSetup::saveWifiFailure(
      pendingWifiSsid,
      "No pudimos conectarnos. Revisa nombre de red y contraseña."
    );
  }

  WiFi.disconnect(true);
  pendingWifiSsid = "";
  pendingWifiPassword = "";
  startAccessPoint();
}

void runFirebaseAccountJob(){
  setupState.cloudBusy = true;
  setupState.cloudAvailable = DeviceSetup::firebaseAvailable();

  if(!setupState.cloudAvailable){
    DeviceSetup::saveCloudFailure("La NUBE no está disponible en este panel.");
    pendingAccountEmail = "";
    pendingAccountPassword = "";
    startAccessPoint();
    return;
  }

  String ssid = setupState.wifiSsid;
  String wifiPassword = DeviceSetup::getStoredWifiPassword();
  if(!setupState.wifiVerified || ssid.length() == 0){
    DeviceSetup::saveCloudFailure("Primero verifica el internet de casa.");
    pendingAccountEmail = "";
    pendingAccountPassword = "";
    startAccessPoint();
    return;
  }

  Serial.printf("[SETUP] Creando acceso Firebase para %s\n", pendingAccountEmail.c_str());
  stopAccessPoint();
  delay(350);

  if(!connectExternalWifi(ssid, wifiPassword, Config::WIFI_TEST_MS)){
    DeviceSetup::saveCloudFailure("No pudimos usar el internet guardado.");
    pendingAccountEmail = "";
    pendingAccountPassword = "";
    startAccessPoint();
    return;
  }

  bool ok = false;
  String response = firebaseAuthRequest("accounts:signUp", pendingAccountEmail, pendingAccountPassword, ok);

  if(!ok && response == "EMAIL_EXISTS"){
    response = firebaseAuthRequest("accounts:signInWithPassword", pendingAccountEmail, pendingAccountPassword, ok);
  }

  if(ok){
    DynamicJsonDocument doc(4096);
    DeserializationError err = deserializeJson(doc, response);
    if(err){
      DeviceSetup::saveCloudFailure("La NUBE respondió, pero no pudimos terminar el registro.");
    } else {
      String uid = doc["localId"] | "";
      String idToken = doc["idToken"] | "";
      String refreshToken = doc["refreshToken"] | "";
      if(uid.length() > 0){
        String cloudError;
        if(createCloudBootstrapDocuments(uid, pendingAccountEmail, idToken, cloudError)){
          DeviceSetup::saveCloudSuccess(pendingAccountEmail, uid, refreshToken);
        } else {
          DeviceSetup::saveCloudFailure(cloudError);
        }
      } else {
        DeviceSetup::saveCloudFailure("La NUBE no terminó de crear la cuenta.");
      }
    }
  } else {
    DeviceSetup::saveCloudFailure(friendlyCloudError(response));
  }

  WiFi.disconnect(true);
  pendingAccountEmail = "";
  pendingAccountPassword = "";
  startAccessPoint();
}

void runIndoorLinkTestJob(){
  if(!DeviceSetup::isIndoorMode()){
    bridgeState.linkTestBusy = false;
    bridgeState.linkTestOk = true;
    bridgeState.initialBusy = false;
    bridgeState.initialSent = true;
    return;
  }

  Serial.println("[INDOOR] Probando tarjeta de pared");
  bridgeState.linkTestBusy = true;
  bridgeState.linkTestOk = false;
  bridgeState.initialBusy = true;
  bridgeState.initialSent = false;
  strlcpy(bridgeState.error, "", sizeof(bridgeState.error));

  stopAccessPoint();
  delay(350);

  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  delay(220);

  readAllSensors();
  recalcSolar();
  updateAlert();

  bool dataOk = EspNowBridge::sendLatestWithRetries(8, 900UL);
  bridgeState.initialSent = dataOk;
  delay(180);

  bool textOk = false;
  if(dataOk){
    textOk = EspNowBridge::sendTextWithRetries(EspNowBridge::LINK_TEST_MESSAGE, 5, 850UL);
  }

  bool ok = dataOk && textOk;
  bridgeState.linkTestOk = ok;
  bridgeState.linkTestBusy = false;
  bridgeState.initialBusy = false;

  if(ok){
    Serial.println("[INDOOR] Tarjeta de pared confirmada con lectura inicial");
  } else if(!dataOk){
    strlcpy(bridgeState.error, "La tarjeta de pared no recibió la primera lectura. Revisa que esté encendida y que el código sea correcto.", sizeof(bridgeState.error));
  } else if(strlen(bridgeState.error) == 0){
    strlcpy(bridgeState.error, "La tarjeta de pared no respondió. Revisa que esté encendida y que el código sea correcto.", sizeof(bridgeState.error));
  }

  delay(220);
  WiFi.disconnect(true, true);
  startAccessPoint();
}

void runIndoorInitialBridgeJob(){
  if(!DeviceSetup::isIndoorMode()){
    bridgeState.initialBusy = false;
    bridgeState.initialSent = true;
    return;
  }

  Serial.println("[INDOOR] Enviando lectura inicial a Heltec A");
  bridgeState.initialBusy = true;
  bridgeState.initialSent = false;

  stopAccessPoint();
  delay(350);

  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  delay(200);

  readAllSensors();
  recalcSolar();
  updateAlert();

  bridgeState.initialSent = EspNowBridge::sendLatestWithRetries(6, 900UL);
  bridgeState.initialBusy = false;

  if(bridgeState.initialSent){
    Serial.println("[INDOOR] Lectura inicial confirmada por Heltec A");
  } else {
    Serial.println("[INDOOR] No hubo confirmación de Heltec A");
    if(strlen(bridgeState.error) == 0){
      strlcpy(bridgeState.error, "No recibimos confirmación de la tarjeta de pared. Revisa que esté encendida y usa el código que muestra su pantalla.", sizeof(bridgeState.error));
    }
  }

  delay(200);
  WiFi.disconnect(true, true);
  startAccessPoint();
}

void runPendingSetupJob(){
  if(pendingSetupJob == SETUP_JOB_NONE || millis() < pendingSetupJobAt){
    return;
  }

  SetupJobType job = pendingSetupJob;
  pendingSetupJob = SETUP_JOB_NONE;

  if(job == SETUP_JOB_WIFI_VERIFY){
    runWifiVerificationJob();
  } else if(job == SETUP_JOB_FIREBASE_ACCOUNT){
    runFirebaseAccountJob();
  } else if(job == SETUP_JOB_INDOOR_LINK_TEST){
    runIndoorLinkTestJob();
  } else if(job == SETUP_JOB_INDOOR_INITIAL_SEND){
    runIndoorInitialBridgeJob();
  }
}

// ============================================================
//  LECTURA DE SENSORES
// ============================================================
void readAllSensors(){
  // DHT22
  float tc = dht.readTemperature();
  float rh = dht.readHumidity();
  sensors.dhtOk = !(isnan(tc)||isnan(rh));
  if(sensors.dhtOk){ sensors.tempC=tc; sensors.humidRH=rh; }

  // BH1750
  float lux = bh1750.readLightLevel();
  sensors.bhOk = (lux>=0 && !isnan(lux));
  if(sensors.bhOk) sensors.lux = lux;

  // INA219
  float shunt = ina219.getShuntVoltage_mV();
  float bus   = ina219.getBusVoltage_V();
  float iA    = ina219.getCurrent_mA()/1000.0f;
  float pW    = ina219.getPower_mW()  /1000.0f;
  sensors.inaOk = !(isnan(bus)||isnan(iA)||isnan(pW));
  if(sensors.inaOk){
    sensors.voltageV = bus + shunt/1000.0f;
    sensors.currentA = iA;
    sensors.powerW   = pW;
  }

  // MPU6050
  IMU::update();
  sensors.pitchDeg = IMU::pitch;
  sensors.rollDeg  = IMU::roll;
  sensors.mpuOk    = true;
}

// ============================================================
//  ALERTA DE TRACKING
// ============================================================
void updateAlert(){
  if(!solar.valid || !sensors.mpuOk){
    alert.active=false;
    alert.errorDeg=0;
    strlcpy(alert.msg,"Esperando GPS / IMU",sizeof(alert.msg));
    return;
  }
  float err = solar.targetDeg - sensors.pitchDeg;
  alert.errorDeg = err;
  if(fabsf(err)>=Config::ALERT_DEG && sensors.lux>=Config::LUX_MIN_SUN){
    alert.active = true;
    if(err>0) snprintf(alert.msg,sizeof(alert.msg),"Inclina +%.1f° hacia el sol",fabsf(err));
    else      snprintf(alert.msg,sizeof(alert.msg),"Reduce inclinación %.1f°",fabsf(err));
  } else {
    alert.active = false;
    strlcpy(alert.msg,"Panel alineado",sizeof(alert.msg));
  }
}

// ============================================================
//  RECALCULAR POSICIÓN SOLAR
// ============================================================
void recalcSolar(){
  if(!gps.set||!ntpOk){ solar.valid=false; return; }
  struct tm t; if(!getLocalTime(&t,2000)){ solar.valid=false; return; }
  solar = Solar::calculate(gps.lat, gps.lon, t);
}

void applyBrowserTelemetry(JsonVariantConst msg){
  if(msg.containsKey("timezone_offset_min")){
    gps.timezoneOffsetMin = msg["timezone_offset_min"].as<int>();
  }

  double epochMsDouble = msg["epoch_ms"] | 0.0;
  applyEpochMs(epochMsDouble);

  if(msg.containsKey("lat") && msg.containsKey("lon")){
    DeviceSetup::saveLocation(
      msg["lat"].as<double>(),
      msg["lon"].as<double>(),
      gps.timezoneOffsetMin,
      msg["source"] | "phone"
    );
    Serial.printf("[GPS] %.6f, %.6f  tz=%d min\n", gps.lat, gps.lon, gps.timezoneOffsetMin);
  }

  recalcSolar();
}

// ============================================================
//  CONSTRUIR PAYLOAD WEBSOCKET
// ============================================================
String buildPayload(){
  StaticJsonDocument<2200> doc;
  doc["seq"] = ++seq;

  struct tm t;
  char isoTs[32] = "";
  int localHour = (millis() / (60UL*60UL*1000UL)) % 24;
  bool hasTime = getLocalTime(&t,1000);
  if(hasTime){
    snprintf(isoTs,sizeof(isoTs),"%04d-%02d-%02dT%02d:%02d:%02d-06:00",
             t.tm_year+1900,t.tm_mon+1,t.tm_mday,t.tm_hour,t.tm_min,t.tm_sec);
    localHour = t.tm_hour;
  }
  doc["ts"]      = isoTs;
  doc["hour"]    = localHour;
  doc["simHour"] = localHour;

  // Meta compatible con el dashboard web
  auto meta = doc.createNestedObject("meta");
  meta["project"]   = Config::PROJECT_NAME;
  meta["nodeId"]    = apSSID.length() ? apSSID : "HelioSync-ESP32";
  meta["location"]  = gps.set ? (String(gps.lat, 4) + ", " + String(gps.lon, 4)) : Config::DEFAULT_LOCATION;
  meta["mode"]      = solar.valid ? "tracking" : "local";
  meta["timestamp"] = isoTs;

  // Entorno
  auto env = doc.createNestedObject("environment");
  float tempC    = sensors.dhtOk ? roundf(sensors.tempC   *100)/100.0f : -999;
  float humidRH  = sensors.dhtOk ? roundf(sensors.humidRH *100)/100.0f : -999;
  float luxValue = sensors.bhOk  ? roundf(sensors.lux)                 : -1;
  env["temp_c"]      = tempC;
  env["humidity"]    = humidRH;
  env["humidity_rh"] = humidRH;
  env["lux"]         = luxValue;
  env["lux_bh1750"]  = luxValue;
  env["dht_ok"]      = sensors.dhtOk;
  env["bh_ok"]       = sensors.bhOk;

  // Eléctrico
  auto elec = doc.createNestedObject("electrical");
  elec["voltage_v"] = sensors.inaOk ? roundf(sensors.voltageV*100)/100.0f : -999;
  elec["current_a"] = sensors.inaOk ? roundf(sensors.currentA*1000)/1000.0f : -999;
  elec["power_w"]   = sensors.inaOk ? roundf(sensors.powerW  *1000)/1000.0f : -999;
  elec["ina_ok"]    = sensors.inaOk;

  // Panel / IMU
  auto panel = doc.createNestedObject("panel");
  float pitchDeg  = sensors.mpuOk ? roundf(sensors.pitchDeg*10)/10.0f : -999;
  float rollDeg   = sensors.mpuOk ? roundf(sensors.rollDeg *10)/10.0f : -999;
  float targetDeg = solar.valid   ? roundf(solar.targetDeg*10)/10.0f  : -1;
  float errorDeg  = solar.valid && sensors.mpuOk ? roundf((targetDeg - pitchDeg)*10)/10.0f : 0;
  panel["pitch_deg"]          = pitchDeg;
  panel["roll_deg"]           = rollDeg;
  panel["angle_roll_deg"]     = rollDeg;
  panel["target_deg"]         = targetDeg;
  panel["error_deg"]          = errorDeg;
  panel["angle_measured_deg"] = pitchDeg;
  panel["angle_target_deg"]   = targetDeg;
  panel["angle_error_deg"]    = errorDeg;
  panel["gyro_stable"]        = sensors.mpuOk;
  panel["servo_active"]       = false;
  panel["tracking_mode"]      = solar.valid ? "TRACKING" : "STATIC";
  panel["mpu_ok"]             = sensors.mpuOk;

  // Sol
  auto sun = doc.createNestedObject("solar");
  sun["azimuth_deg"]   = solar.valid ? roundf(solar.azDeg*10)/10.0f : -1;
  sun["elevation_deg"] = solar.valid ? roundf(solar.elDeg*10)/10.0f : -1;
  sun["valid"]         = solar.valid;

  // GPS
  auto gpsObj = doc.createNestedObject("gps");
  gpsObj["lat"] = gps.set ? gps.lat : 0.0;
  gpsObj["lon"] = gps.set ? gps.lon : 0.0;
  gpsObj["set"] = gps.set;
  gpsObj["timezone_offset_min"] = gps.timezoneOffsetMin;

  // Alerta
  auto al = doc.createNestedObject("alert");
  al["active"]    = alert.active;
  al["error_deg"] = alert.errorDeg;
  al["message"]   = alert.msg;

  // Storage / sync info (útil para que la PWA sepa qué subir)
  auto store = doc.createNestedObject("storage");
  int daysStored = Storage::countDays();
  int usedKb = (int)(LittleFS.usedBytes()/1024);
  int maxKb = (int)(Config::MAX_FS_BYTES/1024);
  int usedPercent = maxKb > 0 ? (int)((usedKb * 100L) / maxKb) : 0;
  store["days_stored"]   = daysStored;
  store["retention_days"] = Config::MAX_DAYS;
  store["used_kb"]       = usedKb;
  store["max_kb"]        = maxKb;
  store["used_percent"]  = constrain(usedPercent, 0, 100);
  store["near_full"]     = usedPercent >= 85 || daysStored >= Config::MAX_DAYS - 2;
  store["consent"]       = consent.given;
  store["anonymous"]     = consent.anonymous;
  store["uid"]           = consent.uid;
  store["cloud_ready"]   = setupState.cloudReady;

  // Diagnóstico
  auto diag = doc.createNestedObject("diagnostics");
  diag["simulation"] = false;
  diag["profile"]    = solar.valid ? "esp32_solar_tracking" : "esp32_waiting_gps";
  diag["uptime_s"]   = millis()/1000;
  diag["free_heap"]  = ESP.getFreeHeap();
  diag["ntp_ready"]  = ntpOk;
  diag["time_source"] = ntpOk ? "browser_or_ntp" : "uptime";
  diag["ws_clients"] = ws.count();
  diag["ap_ssid"]    = apSSID;

  auto network = doc.createNestedObject("network");
  network["mode"] = setupState.operationMode;
  network["transport"] = DeviceSetup::isIndoorMode() ? "espnow_lora" : "littlefs_local";
  network["espnow_ready"] = bridgeState.ready;
  network["espnow_status"] = bridgeState.lastStatus;
  network["heltec_peer_mac"] = setupState.heltecPeerMac;

  auto power = doc.createNestedObject("power");
  power["smart_sleep"] = powerState.smartSleep;
  power["timer_minutes"] = 60;

  String out; serializeJson(doc,out); return out;
}

// ============================================================
//  GUARDAR LECTURA EN LITTLEFS (cada hora)
// ============================================================
void storeHourlyReading(){
  if(!ntpOk) return;
  struct tm t; if(!getLocalTime(&t,1000)) return;

  HistoryEntry e;
  snprintf(e.ts,sizeof(e.ts),"%04d-%02d-%02dT%02d:00:00-06:00",
           t.tm_year+1900,t.tm_mon+1,t.tm_mday,t.tm_hour);
  e.tempC    = sensors.tempC;
  e.humidRH  = sensors.humidRH;
  e.lux      = sensors.lux;
  e.voltageV = sensors.voltageV;
  e.currentA = sensors.currentA;
  e.powerW   = sensors.powerW;
  e.pitchDeg = sensors.pitchDeg;
  e.elDeg    = solar.elDeg;
  e.azDeg    = solar.azDeg;
  e.alertWas = alert.active;

  Storage::saveReading(e);
  if(DeviceSetup::isIndoorMode()){
    EspNowBridge::sendLatestWithRetries(3, 700UL);
  }
}

// ============================================================
//  POWER — sueño inteligente con despertar cada 60 min
// ============================================================
namespace Power {
  void scheduleSmartSleep(unsigned long delayMs = 900UL){
    DeviceSetup::saveSmartSleep(true);
    powerState.pendingSleep = true;
    powerState.sleepAt = millis() + delayMs;
  }

  void captureBeforeSleep(){
    readAllSensors();
    recalcSolar();
    updateAlert();
    storeHourlyReading();

    if(!ntpOk && DeviceSetup::isIndoorMode()){
      EspNowBridge::sendLatestWithRetries(3, 700UL);
    }
  }

  void enterDeepSleep(){
    Serial.println("[POWER] Entrando en sueño inteligente por 60 min");
    captureBeforeSleep();
    delay(150);

    ws.closeAll();
    dnsServer.stop();
    EspNowBridge::stop();
    WiFi.softAPdisconnect(true);
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);

    esp_sleep_enable_timer_wakeup(Config::SMART_SLEEP_US);
    delay(150);
    esp_deep_sleep_start();
  }

  void loop(){
    unsigned long now = millis();

    if(powerState.pendingSleep && now >= powerState.sleepAt){
      powerState.pendingSleep = false;
      enterDeepSleep();
    }

    if(powerState.smartSleep && powerState.timerWake && now >= Config::TIMER_WAKE_WINDOW_MS && ws.count() == 0 && pendingSetupJob == SETUP_JOB_NONE){
      enterDeepSleep();
    }
  }
}

// ============================================================
//  WEBSOCKET — eventos
// ============================================================
void onWsEvent(AsyncWebSocket* srv, AsyncWebSocketClient* client,
               AwsEventType type, void* arg, uint8_t* data, size_t len){

  if(type == WS_EVT_CONNECT){
    Serial.printf("[WS] Cliente #%u conectado desde %s\n",
                  client->id(), client->remoteIP().toString().c_str());
    client->text(buildPayload());   // estado inmediato al conectarse

  } else if(type == WS_EVT_DISCONNECT){
    Serial.printf("[WS] Cliente #%u desconectado\n", client->id());

  } else if(type == WS_EVT_DATA){
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if(info->opcode == WS_TEXT){
      String body;
      body.reserve(len);
      for(size_t i=0; i<len; i++) body += (char)data[i];
      StaticJsonDocument<256> msg;
      if(!deserializeJson(msg, body)){

        // ── Recibir GPS ──────────────────────────────────
        if(msg.containsKey("lat") && msg.containsKey("lon")){
          applyBrowserTelemetry(msg.as<JsonVariantConst>());
        }

        // ── Recibir consentimiento del usuario ───────────
        // Mensaje: { "consent": true, "anonymous": true, "uid": "firebase_uid" }
        if(msg.containsKey("consent")){
          consent.given     = msg["consent"]   | false;
          consent.anonymous = msg["anonymous"] | true;
          strlcpy(consent.uid, msg["uid"] | "", sizeof(consent.uid));
          Storage::saveConsent(consent);
          // Confirmar al cliente
          client->text("{\"consent_ack\":true}");
          Serial.printf("[CONSENT] given=%d anon=%d uid=%s\n",
                        consent.given, consent.anonymous, consent.uid);
        }
      }
    }
  }
}

// ============================================================
//  RUTAS HTTP
// ============================================================
void sendResponse(AsyncWebServerRequest* req, int code, const char* contentType, const String& body){
  AsyncWebServerResponse* res = req->beginResponse(code, contentType, body);
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

void sendJson(AsyncWebServerRequest* req, int code, const String& body){
  sendResponse(req, code, "application/json", body);
}

bool requireDeviceAuth(AsyncWebServerRequest* req){
  if(DeviceAuth::requestAuthenticated(req)){
    return true;
  }

  sendJson(req, 401, "{\"error\":\"Inicia sesión en el panel HelioSync\"}");
  return false;
}

void sendOptions(AsyncWebServerRequest* req){
  AsyncWebServerResponse* res = req->beginResponse(204, "text/plain", "");
  req->send(res);
}

void redirectToSetup(AsyncWebServerRequest* req){
  AsyncWebServerResponse* res = req->beginResponse(302, "text/plain", "");
  res->addHeader("Location", "http://192.168.4.1/setup");
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

String buildTodayHistoryJson(){
  if(!ntpOk) return "[]";

  struct tm t;
  if(!getLocalTime(&t,1000)) return "[]";

  char date[11];
  snprintf(date,sizeof(date),"%04d-%02d-%02d",t.tm_year+1900,t.tm_mon+1,t.tm_mday);
  String jsonl = Storage::readDay(String(date));
  if(jsonl.isEmpty()) return "[]";

  String out = "[";
  int start = 0;
  int count = 0;

  while(start < jsonl.length()){
    int end = jsonl.indexOf('\n', start);
    if(end < 0) end = jsonl.length();

    String line = jsonl.substring(start, end);
    line.trim();

    if(line.length() > 0){
      if(count > 0) out += ",";
      out += line;
      count++;
    }

    start = end + 1;
  }

  out += "]";
  return out;
}

// ============================================================
//  WEB APP EMBEBIDA — assets Vite comprimidos en PROGMEM
// ============================================================
namespace WebApp {
  const HelioSyncWebAssets::Asset* findAsset(const String& path){
    String normalized = path;

    if(normalized == "/"){
      normalized = "/index.html";
    }

    for(size_t i = 0; i < HelioSyncWebAssets::assetCount; i++){
      if(normalized == HelioSyncWebAssets::assets[i].path){
        return &HelioSyncWebAssets::assets[i];
      }
    }

    return nullptr;
  }

  bool isReservedPath(const String& path){
    return path == "/data" ||
           path == "/gps" ||
           path == "/consent" ||
           path == "/history" ||
           path == "/history/day" ||
           path == "/fs" ||
           path == "/ws" ||
           path == "/sw.js" ||
           path == "/registerSW.js" ||
           path == "/manifest.webmanifest" ||
           path == "/favicon.svg" ||
           path == "/icons.svg" ||
           path.startsWith("/api/setup/") ||
           path.startsWith("/assets/") ||
           path.startsWith("/workbox-") ||
           path.startsWith("/api/");
  }

  const char* cacheControlFor(const String& path){
    if(path.startsWith("/assets/") || path.startsWith("/workbox-")){
      return "public, max-age=31536000, immutable";
    }

    return "no-cache";
  }

  void sendAsset(AsyncWebServerRequest* req, const HelioSyncWebAssets::Asset* asset){
    AsyncWebServerResponse* res = req->beginResponse_P(
      200,
      asset->mimeType,
      asset->data,
      asset->size
    );

    if(asset->gzip){
      res->addHeader("Content-Encoding", "gzip");
      res->addHeader("Vary", "Accept-Encoding");
    }

    res->addHeader("Cache-Control", cacheControlFor(String(asset->path)));
    res->addHeader("X-Content-Type-Options", "nosniff");
    req->send(res);
  }

  bool trySendAsset(AsyncWebServerRequest* req, const String& path){
    const HelioSyncWebAssets::Asset* asset = findAsset(path);

    if(!asset){
      return false;
    }

    sendAsset(req, asset);
    return true;
  }

  void sendShell(AsyncWebServerRequest* req){
    const HelioSyncWebAssets::Asset* shell = findAsset("/index.html");

    if(!shell){
      sendJson(req, 500, "{\"error\":\"Web app no embebida. Ejecuta npm run build:esp32\"}");
      return;
    }

    sendAsset(req, shell);
  }
}

void setupRoutes(){

  // ── Captive portal: Android/iOS muestran "Accede a HelioSync" / iniciar sesión en WiFi
  server.on("/generate_204", HTTP_GET, redirectToSetup);
  server.on("/gen_204", HTTP_GET, redirectToSetup);
  server.on("/hotspot-detect.html", HTTP_GET, redirectToSetup);
  server.on("/library/test/success.html", HTTP_GET, redirectToSetup);
  server.on("/ncsi.txt", HTTP_GET, redirectToSetup);
  server.on("/connecttest.txt", HTTP_GET, redirectToSetup);
  server.on("/redirect", HTTP_GET, redirectToSetup);

  // ── GET / — App web React embebida ───────────────────────
  server.on("/", HTTP_GET, [](AsyncWebServerRequest* req){
    WebApp::sendShell(req);
  });

  // ── Sesión local del portal ESP32 ─────────────────────────
  server.on("/api/auth/status", HTTP_GET, [](AsyncWebServerRequest* req){
    sendJson(req, 200, DeviceAuth::buildStatusJson(req));
  });

  server.on("/api/auth/login", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      StaticJsonDocument<320> doc;
      if(deserializeJson(doc, data, len)){
        sendJson(req, 400, "{\"error\":\"JSON inválido\"}");
        return;
      }

      applyEpochMs(doc["epoch_ms"] | 0.0);

      String username = doc["username"] | "";
      String password = doc["password"] | "";
      if(!DeviceAuth::passwordMatches(username, password)){
        sendJson(req, 401, "{\"error\":\"Usuario o contraseña incorrectos\"}");
        return;
      }

      String token;
      DeviceAuth::startSession(token);
      sendJson(req, 200, DeviceAuth::buildStatusJson(req, token));
    }
  );

  server.on("/api/auth/logout", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      DeviceAuth::clearSession();
      sendJson(req, 200, DeviceAuth::buildStatusJson(req));
    }
  );

  // ── Onboarding local del dispositivo ─────────────────────
  server.on("/api/setup/status", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    sendJson(req, 200, DeviceSetup::buildStatusJson());
  });

  server.on("/api/setup/mode", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<192> doc;
      if(deserializeJson(doc, data, len)){
        sendJson(req, 400, "{\"error\":\"JSON inválido\"}");
        return;
      }

      String mode = doc["mode"] | "outdoor";
      String heltecMac = doc["heltec_mac"] | setupState.heltecPeerMac;
      mode.trim();
      mode.toLowerCase();
      heltecMac.trim();
      heltecMac.toUpperCase();

      if(!DeviceSetup::modeIsValid(mode)){
        sendJson(req, 400, "{\"error\":\"Elige campamento o casa\"}");
        return;
      }

      if(mode == "indoor" && !EspNowBridge::macLooksValid(heltecMac)){
        sendJson(req, 400, "{\"error\":\"Revisa el código de la tarjeta de pared. Escríbelo tal como aparece en su pantalla\"}");
        return;
      }

	      DeviceSetup::saveOperationMode(mode, heltecMac);
	      if(mode == "indoor"){
	        bridgeState.linkTestBusy = true;
	        bridgeState.linkTestOk = false;
	        strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
	        pendingSetupJob = SETUP_JOB_INDOOR_LINK_TEST;
	        pendingSetupJobAt = millis() + 650;
	      }
	      sendJson(req, 200, DeviceSetup::buildStatusJson());
	    }
	  );

  server.on("/api/setup/wifi", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<256> doc;
      if(deserializeJson(doc, data, len)){
        sendJson(req, 400, "{\"error\":\"JSON inválido\"}");
        return;
      }

      String ssid = doc["ssid"] | "";
      String password = doc["password"] | "";
      ssid.trim();

      if(ssid.length() == 0 || ssid.length() > 32){
        sendJson(req, 400, "{\"error\":\"Nombre de red inválido\"}");
        return;
      }

      pendingWifiSsid = ssid;
      pendingWifiPassword = password;
      pendingSetupJob = SETUP_JOB_WIFI_VERIFY;
      pendingSetupJobAt = millis() + 650;
      setupState.wifiBusy = true;
      strlcpy(setupState.wifiError, "", sizeof(setupState.wifiError));

      sendJson(req, 202, "{\"ok\":true,\"reconnect\":true}");
    }
  );

  server.on("/api/setup/offline", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      DeviceSetup::skipWifi();
      DeviceSetup::skipCloud();
      sendJson(req, 200, DeviceSetup::buildStatusJson());
    }
  );

  server.on("/api/setup/account", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<384> doc;
      if(deserializeJson(doc, data, len)){
        sendJson(req, 400, "{\"error\":\"JSON inválido\"}");
        return;
      }

      String email = doc["email"] | "";
      String password = doc["password"] | "";
      email.trim();
      applyEpochMs(doc["epoch_ms"] | 0.0);

      setupState.cloudAvailable = DeviceSetup::firebaseAvailable();
      bool syncCloud = doc["sync_cloud"] | setupState.cloudAvailable;
      if(setupState.cloudAvailable && syncCloud && !setupState.wifiVerified){
        sendJson(req, 409, "{\"error\":\"Primero verifica el internet de casa\"}");
        return;
      }

      if(!DeviceSetup::looksLikeEmail(email) || password.length() < 8){
        sendJson(req, 400, "{\"error\":\"Usa un correo válido y una contraseña de al menos 8 caracteres\"}");
        return;
      }

      String token;
      if(!DeviceAuth::saveLocalAccount(email, password, token)){
        sendJson(req, 500, "{\"error\":\"No pudimos guardar el acceso local\"}");
        return;
      }

      StaticJsonDocument<512> response;
      response["ok"] = true;
      response["token"] = token;
      auto auth = response.createNestedObject("auth");
      auth["local_account_ready"] = true;
      auth["account_required"] = true;
      auth["authenticated"] = true;
      auth["username"] = authState.username;
      auth["session_days"] = 90;

      if(!setupState.cloudAvailable || !syncCloud){
        DeviceSetup::skipCloud();
        response["reconnect"] = false;
        String out;
        serializeJson(response, out);
        sendJson(req, 200, out);
        return;
      }

      pendingAccountEmail = email;
      pendingAccountPassword = password;
      pendingSetupJob = SETUP_JOB_FIREBASE_ACCOUNT;
      pendingSetupJobAt = millis() + 650;
      setupState.cloudBusy = true;
      setupState.cloudSkipped = false;
      strlcpy(setupState.cloudError, "", sizeof(setupState.cloudError));

      response["reconnect"] = true;
      String out;
      serializeJson(response, out);
      sendJson(req, 202, out);
    }
  );

  server.on("/api/setup/location", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<256> doc;
      if(deserializeJson(doc, data, len)){
        sendJson(req, 400, "{\"error\":\"JSON inválido\"}");
        return;
      }

      if(doc.containsKey("timezone_offset_min")){
        gps.timezoneOffsetMin = doc["timezone_offset_min"].as<int>();
      }

      double epochMsDouble = doc["epoch_ms"] | 0.0;
      applyEpochMs(epochMsDouble);

      double lat = doc["lat"] | 999.0;
      double lon = doc["lon"] | 999.0;
      if(lat < -90 || lat > 90 || lon < -180 || lon > 180){
        sendJson(req, 400, "{\"error\":\"Coordenadas inválidas\"}");
        return;
      }

      DeviceSetup::saveLocation(
        lat,
        lon,
        doc["timezone_offset_min"] | gps.timezoneOffsetMin,
        doc["source"] | "phone"
      );
      sendJson(req, 200, DeviceSetup::buildStatusJson());
    }
  );

  server.on("/api/setup/complete", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      DeviceSetup::markComplete(true);
      if(DeviceSetup::isIndoorMode()){
        bridgeState.initialBusy = true;
        bridgeState.initialSent = false;
        strlcpy(bridgeState.error, "", sizeof(bridgeState.error));
        pendingSetupJob = SETUP_JOB_INDOOR_INITIAL_SEND;
        pendingSetupJobAt = millis() + 650;
      }
      sendJson(req, 200, DeviceSetup::buildStatusJson());
    }
  );

  server.on("/api/setup/reset", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      DeviceSetup::resetOnboarding();
      sendJson(req, 200, DeviceSetup::buildStatusJson());
    }
  );

  server.on("/api/setup/factory-reset", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      if(!authState.localAccountReady){
        sendJson(req, 403, "{\"error\":\"Primero termina el registro e inicia sesión antes de borrar datos\"}");
        return;
      }

      if(!requireDeviceAuth(req)) return;

      DeviceSetup::factoryReset();
      sendJson(req, 200, DeviceSetup::buildStatusJson());
    }
  );

  server.on("/api/power/sleep", HTTP_POST,
    [](AsyncWebServerRequest* req){},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t*, size_t, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      Power::scheduleSmartSleep();
      sendJson(req, 200, "{\"ok\":true,\"message\":\"HelioSync entrará en sueño inteligente y despertará cada 60 minutos.\"}");
    }
  );

  // ── GET /diagnostics — Dashboard técnico del nodo ────────
  server.on("/diagnostics", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    String html =
      "<!DOCTYPE html><html><head>"
      "<meta charset='utf-8'><title>HelioSync</title>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<style>"
        "body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:1.5rem;margin:0}"
        "h1{color:#58a6ff;margin:0 0 .5rem}p{color:#8b949e;margin:.2rem 0}"
        "pre{background:#161b22;padding:1rem;border-radius:8px;overflow:auto;font-size:.8rem}"
        ".tag{display:inline-block;background:#21262d;border:1px solid #30363d;"
             "border-radius:4px;padding:.1rem .5rem;margin:.2rem;font-size:.75rem}"
        "#status{color:#3fb950}"
      "</style></head><body>"
      "<h1>⚡ HelioSync Node</h1>"
      "<p id='status'>Conectando WebSocket...</p>"
      "<p class='tag'>WS: <code>ws://192.168.4.1/ws</code></p>"
      "<p class='tag'>GPS: <code>POST /gps</code></p>"
      "<p class='tag'>Días guardados: <span id='days'>–</span></p>"
      "<p class='tag'>Consentimiento: <span id='consent'>–</span></p>"
      "<pre id='payload'>Esperando datos...</pre>"
      "<script>"
        "const ws=new WebSocket('ws://'+location.host+'/ws');"
        "ws.onopen=()=>document.getElementById('status').textContent='✓ Conectado';"
        "ws.onerror=()=>document.getElementById('status').textContent='✗ Error';"
        "ws.onmessage=e=>{"
          "const d=JSON.parse(e.data);"
          "document.getElementById('payload').textContent=JSON.stringify(d,null,2);"
          "if(d.storage){"
            "document.getElementById('days').textContent=d.storage.days_stored;"
            "document.getElementById('consent').textContent=d.storage.consent?'✓ Dado':'✗ Pendiente';"
          "}"
        "};"
      "</script></body></html>";
    req->send(200,"text/html",html);
  });

  // ── POST /gps — GPS vía HTTP (alternativa a WS) ───────────
  server.on("/gps", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<192> doc;
      if(!deserializeJson(doc,data,len)){
        if(doc.containsKey("lat")&&doc.containsKey("lon")){
          applyBrowserTelemetry(doc.as<JsonVariantConst>());
        }
      }
      sendJson(req, 200, "{\"ok\":true}");
    }
  );

  // ── GET /data — snapshot actual ──────────────────────────
  server.on("/data", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    sendJson(req, 200, buildPayload());
  });

  // Alias pensado para clientes web existentes
  server.on("/api/heliosync/latest", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    sendJson(req, 200, buildPayload());
  });

  // ── GET /history — lista de días disponibles ─────────────
  server.on("/history", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    sendJson(req, 200, Storage::listDays());
  });

  server.on("/api/heliosync/history", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    sendJson(req, 200, buildTodayHistoryJson());
  });

  // ── GET /history?date=YYYY-MM-DD — lecturas de un día ────
  // Retorna JSONL: cada línea es un objeto JSON (formato Firebase-ready)
  server.on("/history/day", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    if(!req->hasParam("date")){
      sendJson(req, 400, "{\"error\":\"Falta param date\"}");
      return;
    }
    String date = req->getParam("date")->value();
    // Sanitizar: solo YYYY-MM-DD
    if(date.length()!=10 || date[4]!='-' || date[7]!='-'){
      sendJson(req, 400, "{\"error\":\"Formato inválido\"}");
      return;
    }
    String data = Storage::readDay(date);
    if(data.isEmpty())
      sendJson(req, 404, "{\"error\":\"Sin datos para esa fecha\"}");
    else
      sendResponse(req, 200, "application/x-ndjson", data);
  });

  // ── GET /fs — estadísticas del sistema de archivos ───────
  server.on("/fs", HTTP_GET, [](AsyncWebServerRequest* req){
    if(!requireDeviceAuth(req)) return;

    StaticJsonDocument<128> doc;
    doc["total_kb"]   = (int)(LittleFS.totalBytes()/1024);
    doc["used_kb"]    = (int)(LittleFS.usedBytes()/1024);
    doc["days"]       = Storage::countDays();
    doc["max_days"]   = Config::MAX_DAYS;
    doc["consent"]    = consent.given;
    String out; serializeJson(doc,out);
    sendJson(req, 200, out);
  });

  // ── POST /consent — consentimiento vía HTTP ───────────────
  server.on("/consent", HTTP_POST,
    [](AsyncWebServerRequest* req){
      if(req->contentLength() == 0) sendJson(req, 400, "{\"error\":\"Body requerido\"}");
    },
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t){
      if(!requireDeviceAuth(req)) return;

      StaticJsonDocument<128> doc;
      if(!deserializeJson(doc,data,len)){
        consent.given     = doc["consent"]   | false;
        consent.anonymous = doc["anonymous"] | true;
        strlcpy(consent.uid, doc["uid"] | "", sizeof(consent.uid));
        Storage::saveConsent(consent);
      }
      sendJson(req, 200, "{\"ok\":true}");
    }
  );

  server.on("/data", HTTP_OPTIONS, sendOptions);
  server.on("/gps", HTTP_OPTIONS, sendOptions);
  server.on("/consent", HTTP_OPTIONS, sendOptions);
  server.on("/history", HTTP_OPTIONS, sendOptions);
  server.on("/history/day", HTTP_OPTIONS, sendOptions);
  server.on("/fs", HTTP_OPTIONS, sendOptions);
  server.on("/api/auth/status", HTTP_OPTIONS, sendOptions);
  server.on("/api/auth/login", HTTP_OPTIONS, sendOptions);
  server.on("/api/auth/logout", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/status", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/mode", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/wifi", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/offline", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/account", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/location", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/complete", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/reset", HTTP_OPTIONS, sendOptions);
  server.on("/api/setup/factory-reset", HTTP_OPTIONS, sendOptions);
  server.on("/api/power/sleep", HTTP_OPTIONS, sendOptions);
  server.on("/api/heliosync/latest", HTTP_OPTIONS, sendOptions);
  server.on("/api/heliosync/history", HTTP_OPTIONS, sendOptions);

  server.onNotFound([](AsyncWebServerRequest* req){
    if(req->method() == HTTP_OPTIONS){
      sendOptions(req);
      return;
    }

    if(req->method() == HTTP_GET){
      String path = req->url();

      if(WebApp::trySendAsset(req, path)){
        return;
      }

      if(!WebApp::isReservedPath(path)){
        WebApp::sendShell(req);
        return;
      }
    }

    sendJson(req, 404, "{\"error\":\"Ruta no encontrada\"}");
  });

  // CORS global — necesario para la PWA en desarrollo
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin",  "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Origin, X-HelioSync-Session");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Private-Network", "true");
}

// ============================================================
//  SETUP
// ============================================================
void setup(){
  Serial.begin(115200);
  delay(800);
  Serial.println("\n╔══════════════════════════╗");
  Serial.println("║   HelioSync v3.0         ║");
  Serial.println("╚══════════════════════════╝");
  powerState.wakeCause = esp_sleep_get_wakeup_cause();
  powerState.timerWake = powerState.wakeCause == ESP_SLEEP_WAKEUP_TIMER;
  if(powerState.timerWake){
    Serial.println("[POWER] Despertó por temporizador de 60 min");
  }

  // ── I2C ──────────────────────────────────────────────────
  Wire.begin(Config::SDA_PIN, Config::SCL_PIN);
  Wire.setClock(400000);

  // ── DHT22 ────────────────────────────────────────────────
  dht.begin();
  Serial.println("[DHT22]   OK");

  // ── INA219 ───────────────────────────────────────────────
  if(!ina219.begin())
    Serial.println("[INA219]  ERROR — revisa SDA/SCL");
  else
    Serial.println("[INA219]  OK");

  // ── BH1750 ───────────────────────────────────────────────
  if(!bh1750.begin(BH1750::CONTINUOUS_HIGH_RES_MODE))
    Serial.println("[BH1750]  ERROR — revisa SDA/SCL");
  else
    Serial.println("[BH1750]  OK");

  // ── MPU6050 ──────────────────────────────────────────────
  mpu.initialize();
  if(!mpu.testConnection()){
    Serial.println("[MPU6050] ERROR — revisa SDA/SCL");
  } else {
    mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
    mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_250);
    Serial.println("[MPU6050] Calibrando (mantener quieto ~3s)...");
    mpu.CalibrateAccel(6);
    mpu.CalibrateGyro(6);
    sensors.mpuOk = true;
    Serial.println("[MPU6050] OK — calibrado");
  }

  // ── LittleFS ─────────────────────────────────────────────
  if(Storage::begin()){
    Storage::loadConsent(consent);
    Storage::printStats();
  }

  // ── GPS desde flash ───────────────────────────────────────
  prefs.begin("heliosync",true);
  gps.lat = prefs.getDouble("lat",0.0);
  gps.lon = prefs.getDouble("lon",0.0);
  gps.timezoneOffsetMin = prefs.getInt("tz_min", gps.timezoneOffsetMin);
  gps.set = (gps.lat!=0.0||gps.lon!=0.0);
  prefs.end();
  if(gps.set)
    Serial.printf("[GPS]     Flash: %.6f, %.6f\n", gps.lat, gps.lon);
  else
    Serial.println("[GPS]     Pendiente — la PWA debe enviarlo");

  DeviceSetup::load();
  DeviceAuth::load();

  // ── WiFi AP ───────────────────────────────────────────────
  uint8_t mac[6]; WiFi.macAddress(mac);
  apSSID  = "HelioSync-";
  char sfx[5]; snprintf(sfx,sizeof(sfx),"%02X%02X",mac[4],mac[5]);
  apSSID += sfx;
  startAccessPoint();

  // ── NTP (si el móvil conectado tiene internet) ────────────
  configTime(Config::GMT_OFFSET, Config::DST_OFFSET, "pool.ntp.org","time.nist.gov");
  struct tm t;
  ntpOk = getLocalTime(&t,4000);
  if(ntpOk) Serial.printf("[NTP]     %02d:%02d:%02d\n",t.tm_hour,t.tm_min,t.tm_sec);
  else       Serial.println("[NTP]     Sin internet aún");

  // ── WebSocket + HTTP ──────────────────────────────────────
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  setupRoutes();
  server.begin();
  Serial.println("[HTTP]    Servidor en puerto 80");

  // ── Cálculo solar inicial ─────────────────────────────────
  recalcSolar();

  Serial.println("\n[OK] Sistema listo");
  Serial.printf("     → Conecta a: %s  (pass: heliosync)\n", apSSID.c_str());
  Serial.println("     → Abre:      http://192.168.4.1");
}

// ============================================================
//  LOOP
// ============================================================
void loop(){
  unsigned long now = millis();

  if(apActive){
    dnsServer.processNextRequest();
  }

  runPendingSetupJob();

  // ── Sensores ──────────────────────────────────────────────
  readAllSensors();

  // ── Recalcular sol cada hora ──────────────────────────────
  if(now - lastSolar >= Config::SOLAR_MS || lastSolar == 0){
    recalcSolar();
    lastSolar = now;
  }

  // ── Alerta ────────────────────────────────────────────────
  updateAlert();

  // ── Guardar en LittleFS cada hora ────────────────────────
  if(now - lastStore >= Config::STORE_MS || lastStore == 0){
    storeHourlyReading();
    lastStore = now;
  }

  // ── Broadcast WebSocket ───────────────────────────────────
  if(now - lastWs >= Config::WS_MS){
    if(ws.count() > 0) ws.textAll(buildPayload());
    ws.cleanupClients();
    lastWs = now;
  }

  // ── NTP retry cada 30s si no está listo ──────────────────
  if(!ntpOk && (now % 30000 < 1100)){
    struct tm t;
    if(getLocalTime(&t,1000)){
      ntpOk = true;
      Serial.printf("[NTP] Sincronizado: %02d:%02d:%02d\n",t.tm_hour,t.tm_min,t.tm_sec);
      recalcSolar();
    }
  }

  Power::loop();

  delay(1000);   // DHT22 necesita mínimo 1s entre lecturas
}

/*
 * ============================================================
 *  GUÍA DE OPERACIÓN LOCAL
 * ============================================================
 *
 *  FLUJO PRINCIPAL:
 *
 *  1. El ESP32 siempre arranca su AP HelioSync-XXXX.
 *  2. El DNS cautivo redirige el teléfono a /setup.
 *  3. /api/setup/wifi recibe SSID/password, apaga AP, prueba WiFi
 *     externo, guarda credenciales si funcionan y vuelve a abrir AP.
 *  4. /api/setup/account siempre crea una cuenta local en el ESP32.
 *     Si HELIOSYNC_FIREBASE_API_KEY está definido, también intenta Firebase Auth.
 *  5. /api/setup/location guarda lat/lon solo en NVS local para el
 *     cálculo solar. No se sube a la nube.
 *  6. El dashboard corre desde el ESP32 sin Node.js, laptop ni servidor.
 *
 *  2. DATOS EN TIEMPO REAL (sin internet):
 *     - PWA recibe JSON cada 1s por WebSocket
 *     - Actualiza dashboard localmente
 *
 *  ENDPOINTS DISPONIBLES EN EL ESP32:
 *   GET  /           → App web embebida
 *   GET  /setup      → Onboarding local
 *   GET  /dashboard  → Dashboard
 *   GET  /diagnostics→ Diagnóstico técnico
 *   GET  /api/setup/status
 *   POST /api/setup/wifi      → { ssid, password }
 *   GET  /api/auth/status
 *   POST /api/auth/login     → { username, password, epoch_ms }
 *   POST /api/auth/logout
 *   POST /api/setup/account  → { email, password, epoch_ms }
 *   POST /api/setup/location  → { lat, lon, epoch_ms, timezone_offset_min }
 *   POST /api/setup/complete
 *   GET  /data        → Snapshot JSON actual
 *   GET  /history     → Lista días disponibles (JSON array)
 *   GET  /history/day?date=YYYY-MM-DD → JSONL del día
 *   GET  /fs          → Estadísticas almacenamiento
 *   POST /gps         → { lat, lon }
 *   POST /consent     → { consent, anonymous, uid }
 *   WS   /ws          → Datos en tiempo real + comandos
 * ============================================================
 */
