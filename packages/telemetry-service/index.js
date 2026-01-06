const { Sequelize, DataTypes } = require('sequelize');
const { Kafka } = require('kafkajs');

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
    { id: 'TRUCK-101', lat: 52.2297, lng: 21.0122, temp: 4.0 }, // Warsaw
    { id: 'TRUCK-202', lat: 48.8566, lng: 2.3522, temp: -2.0 }, // Paris
    { id: 'TRUCK-303', lat: 40.7128, lng: -74.0060, temp: 5.5 } // New York
];

async function generateAndSend() {
    for (const truck of trucks) {
        // Simulate Movement (Jiggle coordinates)
        truck.lat += (Math.random() - 0.5) * 0.001;
        truck.lng += (Math.random() - 0.5) * 0.001;
        
        // Simulate Sensors
        // 95% chance temp is normal, 5% chance it spikes
        if (Math.random() > 0.95) truck.temp += 1.5; 
        else truck.temp += (Math.random() - 0.5) * 0.1;

        // 80% chance smooth ride, 20% chance of SHOCK (Vibration > 4.0)
        const isShock = Math.random() > 0.80;
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
                console.log(`SHOCK DETECTED: ${truck.id} [${payload.vibration}G]`);
            } else {
                console.log('.');
            }

        } catch (err) {
            console.error('Kafka Publish Error:', err.message);
        }
    }
}

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
        console.log('Retrying in 5s...');
        setTimeout(start, 5000);
    }
}

start();