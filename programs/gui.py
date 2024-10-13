import tkinter as tk
from tkinter import messagebox
import paho.mqtt.client as mqtt
import json

# MQTT Configuration
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
SENSOR_TOPIC = "plant/sensor"
SOIL_TOPIC = "plant/soil"
PUMP_TOPIC = "plant/pump"

class PlantMonitorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Smart Plant Monitoring System")

        # Temperature Display
        tk.Label(root, text="Temperature (°C):", font=("Arial", 14)).grid(row=0, column=0, padx=10, pady=10)
        self.temp_value = tk.Label(root, text="N/A", font=("Arial", 14))
        self.temp_value.grid(row=0, column=1, padx=10, pady=10)

        # Soil Moisture Display
        tk.Label(root, text="Soil Moisture:", font=("Arial", 14)).grid(row=1, column=0, padx=10, pady=10)
        self.soil_value = tk.Label(root, text="N/A", font=("Arial", 14))
        self.soil_value.grid(row=1, column=1, padx=10, pady=10)

        # Pump Control Buttons
        tk.Button(root, text="Turn Pump ON", command=self.turn_pump_on, font=("Arial", 12)).grid(row=2, column=0, padx=10, pady=10)
        tk.Button(root, text="Turn Pump OFF", command=self.turn_pump_off, font=("Arial", 12)).grid(row=2, column=1, padx=10, pady=10)

        # MQTT Client Configuration
        self.mqtt_client = mqtt.Client("GUIClient")
        self.mqtt_client.on_connect = self.on_connect
        self.mqtt_client.on_message = self.on_message
        self.mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        self.mqtt_client.loop_start()

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker.")
            client.subscribe(SENSOR_TOPIC)
            client.subscribe(SOIL_TOPIC)
        else:
            print("Failed to connect, return code %d\n", rc)

    def on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload)
            if "temperature" in data:
                self.temp_value.config(text=f"{data['temperature']} °C")
            elif "soilMoisture" in data:
                self.soil_value.config(text=f"{data['soilMoisture']}")
        except json.JSONDecodeError:
            print("Error decoding JSON message.")

    def turn_pump_on(self):
        self.mqtt_client.publish(PUMP_TOPIC, '{"action":"on"}')
        messagebox.showinfo("Pump Control", "Pump turned ON.")

    def turn_pump_off(self):
        self.mqtt_client.publish(PUMP_TOPIC, '{"action":"off"}')
        messagebox.showinfo("Pump Control", "Pump turned OFF.")

if __name__ == "__main__":
    root = tk.Tk()
    app = PlantMonitorGUI(root)
    root.mainloop()
