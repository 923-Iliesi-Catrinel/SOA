const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3004
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const DB_URI = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:5432/${process.env.DB_NAME}`;

const sequelize = new Sequelize(DB_URI, {
    dialect: 'postgres',
    logging: false
});

// We store every single 'ping' from the truck for history
const TelemetryLog = sequelize.define('TelemetryLog', {
    truckId: DataTypes.STRING,
    latitude: DataTypes.FLOAT,
    longitude: DataTypes.FLOAT,
    temperature: DataTypes.FLOAT,
    vibration: DataTypes.FLOAT, // > 4.0G means a crash/drop happened
    timestamp: DataTypes.DATE
});

const kafka = new Kafka({
    clientId: 'telemetry-service',
    brokers: [KAFKA_BROKER]
});

const producer = kafka.producer();

const trucks = [
    { id: 'TRUCK-101', lat: 46.7712, lng: 23.6236, temp: 4.0 },
    { id: 'TRUCK-102', lat: 46.7546, lng: 23.5559, temp: -2.0 },
    { id: 'TRUCK-103', lat: 46.7765, lng: 23.5741, temp: 3.5 },
    { id: 'TRUCK-104', lat: 46.7962, lng: 23.6145, temp: 3.2 },
    { id: 'TRUCK-105', lat: 46.7695, lng: 23.6335, temp: 6.1 },
    { id: 'TRUCK-106', lat: 46.7784, lng: 23.6119, temp: 4.2 },
    { id: 'TRUCK-107', lat: 46.7554, lng: 23.5932, temp: 3.8 },
    { id: 'TRUCK-201', lat: 44.4355, lng: 26.1025, temp: 4.5 },
    { id: 'TRUCK-202', lat: 44.4268, lng: 26.1025, temp: 5.0 },
    { id: 'TRUCK-301', lat: 47.1585, lng: 27.5870, temp: 2.1 },
    { id: 'TRUCK-302', lat: 47.1750, lng: 27.5700, temp: 1.5 }
];

async function generateAndSend() {
    for (const truck of trucks) {
        // Simulate Movement
        truck.lat += (Math.random() - 0.5) * 0.001;
        truck.lng += (Math.random() - 0.5) * 0.001;
        
        // Simulate Sensors
        // 99% chance temp is stable
        if (Math.random() > 0.99) truck.temp += 1.5; 
        else truck.temp += (Math.random() - 0.5) * 0.1;

        // 80% chance smooth ride, 20% chance of SHOCK (Vibration > 4.0)
        const isShock = Math.random() > 0.995; 
        const vibration = isShock ? (Math.random() * 5 + 3) : (Math.random() * 0.5);

        const payload = {
            truckId: truck.id,
            latitude: truck.lat,
            longitude: truck.lng,
            temperature: parseFloat(truck.temp.toFixed(2)),
            vibration: parseFloat(vibration.toFixed(2)),
            timestamp: new Date()
        };

        try {
            // Send to Kafka (Stream)
            await producer.send({
                topic: 'telemetry-stream',
                messages: [{ value: JSON.stringify(payload) }],
            });

            // Save to DB (History)
            // We don't await this, let it run in background
            TelemetryLog.create(payload).catch(err => console.error('DB Error:', err.message));

            if (vibration > 4.0) {
                console.log(`RANDOM SHOCK DETECTED: ${truck.id} [${payload.vibration}G]`);
            } else {
                console.log(`Sent update for ${truck.id}`);
            }

        } catch (err) {
            console.error('Kafka Publish Error:', err.message);
        }
    }
}

// Endpoint to manually simulate a crash/shock event
app.post('/simulate/shock', async (req, res) => {
    const { truckId } = req.body;
    
    const shockData = {
        truckId: truckId || 'TRUCK-101',
        temperature: 6.0,
        vibration: 15.0, // MASSIVE SHOCK
        location: { lat: 46.77, lng: 23.60 },
        timestamp: new Date().toISOString()
    };

    await producer.send({
        topic: 'telemetry-stream',
        messages: [{ value: JSON.stringify(shockData) }],
    });

    console.log(`MANUAL SHOCK CREATED: ${shockData.truckId}`);
    res.json({ message: 'Crash simulated!', data: shockData });
});

async function start() {
    try {
        await sequelize.sync();
        console.log('Database Connected (Telemetry)');

        await producer.connect();
        console.log('Kafka Producer Connected');

        // Start Loop (Every 1 second)
        console.log('Starting Simulation...');
        setInterval(generateAndSend, 1000);

    } catch (err) {
        console.error('Startup Failed:', err.message);
        setTimeout(start, 5000);
    }
}

start();