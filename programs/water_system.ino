//Negin Pakrooh
//SIT315

#include <WiFiNINA.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <PinChangeInterrupt.h> 

// Pin Definitions
#define DHTPIN 2  
#define SOIL_MOISTURE_PIN A1  
#define PUMP_PIN 5  
#define LED_PIN 13  
#define SECOND_SOIL_SENSOR_PIN A2 
#define DHTTYPE DHT22  

// WiFi Credentials
const char* ssid = "NOKIA-2731"; 
const char* password = "******";  

// MQTT Broker (HiveMQ)
const char* mqttServer = "broker.hivemq.com";
const int mqttPort = 1883;
const char* clientID = "ArduinoClient";

// MQTT Topics
const char* SENSOR_DATA_TOPIC = "plant/sensor";
const char* PUMP_CONTROL_TOPIC = "plant/pump";
const char* SOIL_CONTROL_TOPIC = "plant/soil";

DHT dht(DHTPIN, DHTTYPE);  
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

volatile bool soilSensorTriggered = false;  // Flag for soil sensor interrupts
unsigned long previousMillis = 0; 
const long interval = 5000;  // Timer interval (5 seconds for testing)

void setup() {
  Serial.begin(9600);

  dht.begin();

  pinMode(SOIL_MOISTURE_PIN, INPUT);
  pinMode(SECOND_SOIL_SENSOR_PIN, INPUT);
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);  

  // Connect to WiFi and MQTT broker
  connectWiFi();
  mqttClient.setServer(mqttServer, mqttPort);
  mqttClient.setCallback(mqttCallback);
  connectMQTT();

  // Attach Pin Change Interrupts (PCINT) for soil moisture sensors
  attachPCINT(digitalPinToPCINT(SOIL_MOISTURE_PIN), soilSensorISR, CHANGE);
  attachPCINT(digitalPinToPCINT(SECOND_SOIL_SENSOR_PIN), soilSensorISR, CHANGE);
}

void loop() {
  // Ensure MQTT connection stays active
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // Check for timer interrupt
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    timerISR();
  }

  // Handle soil sensor interrupt
  if (soilSensorTriggered) {
    soilSensorTriggered = false;  // Reset the flag
    publishSoilData(); 
  }

  delay(500);
}

// Soil Sensor Interrupt Service Routine (ISR)
void soilSensorISR() {
  soilSensorTriggered = true;  // Set the interrupt flag
}

// Timer Interrupt Service Routine
void timerISR() {
  digitalWrite(LED_PIN, !digitalRead(LED_PIN));  // Toggle LED state
  publishSensorData(); 
}

// Connect to WiFi
void connectWiFi() {
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi.");
}

// Connect to MQTT broker
void connectMQTT() {
  Serial.print("Connecting to MQTT broker...");
  while (!mqttClient.connected()) {
    if (mqttClient.connect(clientID)) {
      Serial.println("\nConnected to MQTT broker.");
      mqttClient.subscribe(PUMP_CONTROL_TOPIC);
      mqttClient.subscribe(SOIL_CONTROL_TOPIC);
    } else {
      Serial.print(".");
      delay(1000);
    }
  }
}

// Publish temperature data to MQTT topic
void publishSensorData() {
  float temperature = dht.readTemperature();
  if (isnan(temperature)) {
    Serial.println("Failed to read temperature from DHT sensor.");
    return;
  }

  String payload = "{\"plant\":\"Plant 1\",\"temperature\":" + String(temperature) + "}";
  mqttClient.publish(SENSOR_DATA_TOPIC, payload.c_str());
  Serial.println("Published sensor data: " + payload);
}

// Publish soil moisture data to MQTT topic
void publishSoilData() {
  int soilMoisture = analogRead(SOIL_MOISTURE_PIN);
  String payload = "{\"plant\":\"Plant 1\",\"soilMoisture\":" + String(soilMoisture) + "}";
  mqttClient.publish(SOIL_CONTROL_TOPIC, payload.c_str());
  Serial.println("Published soil data: " + payload);
}

// MQTT callback to handle incoming messages
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Message received on topic ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(message);

  // Handle pump control messages
  if (String(topic) == PUMP_CONTROL_TOPIC) {
    if (message == "{\"action\":\"on\"}") {
      digitalWrite(PUMP_PIN, HIGH);
      Serial.println("Pump turned ON.");
    } else if (message == "{\"action\":\"off\"}") {
      digitalWrite(PUMP_PIN, LOW);
      Serial.println("Pump turned OFF.");
    }
  }
}
