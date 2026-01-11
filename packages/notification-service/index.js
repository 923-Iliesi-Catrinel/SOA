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

// Stores the last known location of every truck.
// Without this, the map is blank when first log in.
const truckState = {}; 

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Redis Adapter for Scalability
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

                // Update truck state
                truckState[data.truckId] = data;

                // Broadcast to map
                io.emit('truck_update', data);
                
                // Check for risk conditions
                if (data.temperature > 8.0 || data.vibration > 4.0) {
                    try {
                        console.log(`⚠️ Risk Detected: ${data.truckId}`);
                        
                        // Call FaaS 1: Risk Calculator
                        const auditResponse = await axios.post(RISK_FAAS_URL, data);
                        const audit = auditResponse.data;

                        if (audit.should_alert) {
                            // Call FaaS 2: Emailer
                            axios.post(EMAIL_FAAS_URL, {
                                truckId: data.truckId,
                                subject: `ALERT: ${audit.status}`,
                                message: `Issues: ${audit.issues.join(', ')}. Est Loss: $${audit.estimated_loss}`
                            }).catch(e => console.error("Email FaaS Failed:", e.message));

                            // Notify Dashboard
                            io.emit('notification', { 
                                title: `CRITICAL: ${audit.status}`, 
                                body: audit 
                            });
                        }
                    } catch (err) {
                        console.error('FaaS Error:', err.message);
                    }
                }
            }
        });
        console.log('✅ Kafka Connected');
    } catch (err) {
        console.error('Kafka Error:', err.message);
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

                // Send categorized events to Frontend
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

    // Send cached truck states
    const currentTrucks = Object.values(truckState);
    if (currentTrucks.length > 0) {
        socket.emit('init_trucks', currentTrucks);
    }
    
    socket.on('join_room', (userId) => {
        socket.join(userId);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Notification Service running on port ${PORT}`);
    startKafkaConsumer();
    startRabbitConsumer();
});
