const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const amqp = require('amqplib');
const cors = require('cors');
const { Kafka } = require('kafkajs');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3003;
const FAAS_URL = 'http://risk-calculator:8080/2015-03-31/functions/function/invocations';

// HTTP Server & Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Redis Adapter for Scalability
// This allows multiple instances of this service to sync messages
const pubClient = createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:6379` });
const subClient = pubClient.duplicate();
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Redis Adapter Connected');
}).catch(err => console.error('Redis Connection Error:', err));

// Kafka consumer (for receiving telemetry alerts)
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
                
                // LOGIC: Process Raw Sensor Data
                if (data.type === 'SHOCK') {
                    console.log(`Shock detected for ${data.truckId}: ${data.vibration}G`);
                    
                    // Notify UI immediately
                    io.emit('notification', { title: 'CRITICAL SHOCK', body: data });

                    // TRIGGER FAAS (Email/Alert Action - 1p)
                    axios.post(FAAS_URL, {
                        truckId: data.truckId,
                        status: 'SHOCK',
                        details: `High vibration detected: ${data.vibration}G`
                    }).catch(() => console.log("FaaS Email Service Offline (Lambda Container)"));
                } 

                // UPDATE MAP: Always send live location to dashboard
                io.emit('truck_update', data);
            }
        });
        console.log('Event Streaming: Kafka Connected');
    } catch (err) {
        console.error('Kafka Error:', err.message);
        setTimeout(startKafka, 5000);
    }
}

// RabbitMQ Consumer for orders
async function startRabbitConsumer() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_HOST || 'amqp://guest:guest@rabbitmq:5672');
        const channel = await connection.createChannel();
        
        const exchange = 'pharmaguard_events';
        await channel.assertExchange(exchange, 'topic', { durable: false });
        
        // Create a temporary queue that binds to the exchange
        const q = await channel.assertQueue('', { exclusive: true });
        
        // Listen for keys: "order.created" or "alert.shock"
        channel.bindQueue(q.queue, exchange, '#'); 

        console.log('Connected to RabbitMQ & Listening for events...');

        channel.consume(q.queue, (msg) => {
            if (msg.content) {
                const routingKey = msg.fields.routingKey;
                const data = JSON.parse(msg.content.toString());
                
                console.log(`Received Event [${routingKey}]:`, data);

                // --- BROADCAST TO FRONTEND ---
                if (routingKey.includes('alert')) {
                    io.emit('alert', { type: 'CRITICAL', message: `Truck ${data.truck_id} Issue!`, data });
                }
                
                // If it's an order update, send to specific user room (optional)
                // io.to(data.userId).emit('notification', ...);
                
                // For now, just broadcast everything for the demo
                io.emit('notification', { title: routingKey, body: data });
            }
        }, { noAck: true });

    } catch (err) {
        console.error('RabbitMQ Error:', err.message);
        setTimeout(startRabbitConsumer, 5000);
    }
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    socket.on('join_room', (userId) => {
        socket.join(userId);
        console.log(`Socket ${socket.id} joined room ${userId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

app.get('/', (req, res) => {
    res.send('Notification Service Running');
});

// Start Server
server.listen(PORT, () => {
    console.log(`Notification Service running on port ${PORT}`);
    startKafkaConsumer();
    startRabbitConsumer();
});
