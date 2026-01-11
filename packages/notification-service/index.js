const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const amqp = require('amqplib');
const cors = require('cors');
const { Kafka } = require('kafkajs');
const axios = require('axios');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3003;
const RISK_FAAS_URL = process.env.RISK_FAAS_URL || 'http://faas-risk:8080/';
const EMAIL_FAAS_URL = process.env.EMAIL_FAAS_URL || 'http://faas-email:8080/';

const truckState = {}; 
const alertHistory = {};

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Redis Adapter
const pubClient = createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:6379` });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis Adapter Connected');
}).catch(err => console.error('Redis Connection Error:', err));

// KAFKA CONSUMER (Telemetry)
const kafka = new Kafka({ 
    clientId: 'notif-service', 
    brokers: [process.env.KAFKA_BROKER || 'kafka:29092'] 
});
const kafkaConsumer = kafka.consumer({ groupId: 'notif-group' });

async function startKafkaConsumer() {
    try {
        await kafkaConsumer.connect();
        await kafkaConsumer.subscribe({ topic: 'telemetry-stream', fromBeginning: false });
        
        await kafkaConsumer.run({
            eachMessage: async ({ message }) => {
                const data = JSON.parse(message.value.toString());
                
                const truckId = data.truckId;
                truckState[truckId] = data;
                io.emit('truck_update', data);

                const issues = [];
                let type = 'INFO';

                if (data.temperature > 8.0 || data.temperature < 2.0) {
                    issues.push(`Temperature deviation: ${data.temperature}°C`);
                    type = 'WARNING';
                }
                if (data.vibration > 4.0) {
                    issues.push(`High Shock Detected: ${data.vibration}G`);
                    type = 'CRITICAL';
                }

                if (issues.length === 0) {
                    if (alertHistory[truckId]) delete alertHistory[truckId];
                    return; 
                }

                const now = Date.now();
                const lastAlert = alertHistory[truckId];

                // Spam Prevention (1 minute debounce)
                const isSpam = lastAlert && 
                               lastAlert.type === type && 
                               (now - lastAlert.timestamp < 60000);

                if (isSpam) return;

                console.log(`New Alert for ${truckId} (${type}):`, issues);
                alertHistory[truckId] = { timestamp: now, type: type };

                let riskData = null;

                // Call FaaS if Critical
                if (type === 'CRITICAL') {
                    try {
                        console.log(`Triggering Risk Assessment FaaS for ${truckId}...`);
                        const riskResponse = await axios.post(RISK_FAAS_URL, {
                            truckId: truckId,
                            vibration: data.vibration,
                            temperature: data.temperature,
                            timestamp: data.timestamp
                        }, { timeout: 2000 });
                        
                        riskData = riskResponse.data;        
                        console.log(`FaaS Audit: Loss est. $${riskData.estimated_loss}`);
                
                        axios.post(EMAIL_FAAS_URL, {
                            to: 'manager@pharmaguard.com',
                            truckId: truckId,
                            subject: `CRITICAL ALERT: ${truckId} Crashed`,
                            message: `Loss: $${riskData.estimated_loss}. Location: ${data.latitude}, ${data.longitude}`
                        }).catch(e => console.error("Email failed", e.message));

                    } catch (err) {
                        console.error("FaaS Failed, proceeding without risk data.");
                    }
                }

                // Send Alert to Frontend
                io.emit('notification', {
                    id: now,
                    truckId: truckId,
                    time: new Date().toLocaleTimeString(),
                    type: type,
                    message: issues.join(', '),
                    location: { lat: data.latitude, lng: data.longitude },
                    riskData: riskData 
                });
            },
        });
    } catch (err) {
        console.error("Kafka Error:", err.message);
        setTimeout(startKafkaConsumer, 5000);
    }
}

// RABBITMQ CONSUMER (Orders)
async function startRabbitConsumer() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_HOST || 'amqp://guest:guest@rabbitmq:5672');
        const channel = await connection.createChannel();
        const exchange = 'pharmaguard_events';
        
        await channel.assertExchange(exchange, 'topic', { durable: false });
        const q = await channel.assertQueue('', { exclusive: true });
        channel.bindQueue(q.queue, exchange, '#'); 

        console.log('RabbitMQ Connected');

        channel.consume(q.queue, (msg) => {
            if (msg.content) {
                const routingKey = msg.fields.routingKey;
                const data = JSON.parse(msg.content.toString());
                
                console.log(`Event: ${routingKey}`);

                if (routingKey.includes('order')) {
                    io.emit('order_update', { 
                        status: routingKey.split('.')[1], 
                        data: data 
                    });
                } else if (routingKey.includes('alert')) {
                    io.emit('alert', { type: 'CRITICAL', data });
                }

                io.emit('notification', { title: routingKey, body: data });
            }
        }, { noAck: true });

    } catch (err) {
        console.error('RabbitMQ Error:', err.message);
        setTimeout(startRabbitConsumer, 5000);
    }
}

// SOCKET CONNECTION
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send Initial Truck Positions on Load
    const currentTrucks = Object.values(truckState);
    if (currentTrucks.length > 0) {
        currentTrucks.forEach(t => socket.emit('truck_update', t));
    }
    
    socket.on('join_room', (userId) => {
        socket.join(userId);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Notification Service running on port ${PORT}`);
    startKafkaConsumer();
    startRabbitConsumer();
});
