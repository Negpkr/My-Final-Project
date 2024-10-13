const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

const mongoURI = 'mongodb+srv://neginpakrooh:7jRFiBfCPUZnK9jm@sit314.wplq9.mongodb.net/?retryWrites=true&w=majority&appName=sit314';
mongoose.connect(mongoURI);

//**MongoDB
const SensorSchema = new mongoose.Schema({
    plant: String,
    status: String, // 'on' or 'off'
    temperature: Number,
    soilMoisture: Number,
    timestamp: { type: Date, default: Date.now }
});

const SensorData = mongoose.model('plantsData', SensorSchema);
// Pump status and mode state
let pumpStatus = false;
let mode = 'auto'; // Default to auto mode

const app = express();
app.use(bodyParser.json());

// MQTT client
const SENSOR_DATA_TOPIC = 'plant/sensor';
const PUMP_CONTROL_TOPIC = 'plant/pump';
const SOIL_CONTROL_TOPIC = 'plant/soil';

// MQTT connection and message handling
mqttClient.on('connect', () => {
    console.log('Connected to MQTT Broker');
    mqttClient.subscribe([SENSOR_DATA_TOPIC, PUMP_CONTROL_TOPIC, SOIL_CONTROL_TOPIC], (err) => {
        if (err) console.error('Failed to subscribe to topics:', err);
        console.log('Subscribed to sensor topics');
    });
});

mqttClient.on('message', async (topic, message) => {
    const payload = JSON.parse(message.toString());

    if (topic === SENSOR_DATA_TOPIC || topic === SOIL_CONTROL_TOPIC) {
        try {
            // Save sensor data to MongoDB
            const sensorData = new SensorData(payload);
            await sensorData.save();
            console.log('Sensor data saved:', payload);
        } catch (error) {
            console.error('Failed to save sensor data:', error);
        }
    } else if (topic === PUMP_CONTROL_TOPIC) {
        // Update pump status based on MQTT message
        const pumpStatus = payload.action === 'on';
        console.log(`Pump turned ${pumpStatus ? 'ON' : 'OFF'}`);
        
        if (pumpStatus) {
            sendEmailNotification();  // Send email if pump is turned on
        }
    }
});

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '***********',
        pass: '********',
    },
});

// Send email notification when pump is turned on
function sendEmailNotification() {
    const mailOptions = {
        from: '*********',
        to: '*********',
        subject: 'Pump Status Notification',
        text: 'The pump has been turned ON.',
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// API to switch between manual and auto mode
app.post('/mode/:mode', (req, res) => {
    mode = req.params.mode;
    res.status(200).send(`Mode switched to ${mode}.`);
  });

// API to get the current mode
app.get('/mode', (req, res) => {
    res.status(200).json({ mode });
});

// API to control individual plant status in auto mode
app.post('/plant/:plantId/:status', async (req, res) => {
    const { plantId, status } = req.params;
    await SensorData.findOneAndUpdate({ plant: plantId }, { status }, { upsert: true });
    res.status(200).send(`Plant ${plantId} turned ${status}`);
});

// API to get the status of all plants
app.get('/plants', async (req, res) => {
    const plants = await SensorData.find();
    res.status(200).json(plants);
});

// API to get the latest sensor data
app.get('/data/latest', async (req, res) => {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    res.status(200).json(latestData);
});

// API to get watering status for all plants
app.get('/watering/status', async (req, res) => {
    const plants = await SensorData.aggregate([
        { $sort: { plant: 1, timestamp: -1 } }, // Sort by plant name and latest data
        { $group: { _id: "$plant", latestData: { $first: "$$ROOT" } } }
    ]);

    const status = plants.map((plant) => ({
        plant: plant._id,
        needsWater: plant.latestData.soilMoisture < 500 ? 'Yes' : 'No'
    }));
    res.status(200).json(status);
});

// API to calculate watering intervals for each plant
app.get('/watering/intervals', async (req, res) => {
    const plants = await SensorData.aggregate([
        { $sort: { plant: 1, timestamp: 1 } }, // Sort by plant name and timestamp
        { $group: { _id: "$plant", readings: { $push: "$timestamp" } } }
    ]);

    const intervals = plants.map((plant) => {
        const differences = plant.readings.map((time, index) => {
            if (index === 0) return null;
            const diff = (new Date(time) - new Date(plant.readings[index - 1])) / (1000 * 60 * 60 * 24); // Days
            return diff;
        }).filter(diff => diff !== null);

        const avgInterval = differences.reduce((a, b) => a + b, 0) / differences.length;
        return {
            plant: plant._id,
            interval: avgInterval < 7 ? 'Once every few days' : 'Once a week'
        };
    });

    res.status(200).json(intervals);
});

// API to check if a plant needs water
app.get('/plant/:plant/needs-water', async (req, res) => {
    const plant = req.params.plant;
    const latestData = await SensorData.findOne({ plant }).sort({ timestamp: -1 });
    //we can implement tempreture in future projects here
    //(e.g. if tempreture>30 && soilMoisture <300 --> turn on the pump )
    if (latestData.soilMoisture < 500) {
        res.status(200).send(`${plant} needs water.`);
    } else {
        res.status(200).send(`${plant} does not need water.`);
    }
});

// API to get data for a specific plant
app.get('/data/plant/:plant', async (req, res) => {
    try {
        const plant = req.params.plant;
        const data = await SensorData.findOne({ plant }).sort({ timestamp: -1 });
        if (data) {
            res.status(200).json(data);
        } else {
            res.status(404).send('No data found for the specified plant.');
        }
    } catch (error) {
        res.status(500).send('Error retrieving plant data.');
    }
});

// API to control the pump (manual or automatic)
app.post('/pump/:status', async (req, res) => {
    const status = req.params.status === 'on';
    pumpStatus = status;

    try {
        // Send the control signal to the Arduino
        await axios.post('http://<arduino-ip>/control', { action: status ? 'on' : 'off' });

        if (status) {
            sendEmailNotification(); // Send email when pump is turned on
        }

        res.status(200).send(`Pump turned ${status ? 'ON' : 'OFF'}.`);
    } catch (error) {
        res.status(500).send('Error communicating with Arduino.');
    }
});

// API to get the pump status
app.get('/pump/status', (req, res) => {
    res.status(200).json({ status: pumpStatus ? 'on' : 'off' });
});

// API to filter sensor data based on timestamps 
app.get('/data/filter', async (req, res) => {
    try {
        const { start, end } = req.query;

        // Check if both start and end timestamps are provided
        if (!start || !end) {
            return res.status(400).send('Please provide both start and end timestamps.');
        }

        const query = {
            timestamp: {
                $gte: new Date(start),
                $lte: new Date(end),
            },
        };

        const filteredData = await SensorData.find(query).sort({ timestamp: 1 });

        res.status(200).json(filteredData);
    } catch (error) {
        console.error('Error filtering data:', error);
        res.status(500).json({ error: 'Error filtering data' });
    }
});

// API to get all unique plant names from the database
app.get('/plants/names', async (req, res) => {
    try {
        const plants = await SensorData.distinct('plant');
        res.status(200).json(plants);
    } catch (error) {
        console.error('Error fetching plant names:', error);
        res.status(500).send('Error fetching plant names');
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
