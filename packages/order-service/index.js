const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json()); // Allows us to read JSON bodies in POST requests
app.use(cors());         // Allows the Frontend to talk to this API

const PORT = 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';
const RABBIT_HOST = process.env.RABBITMQ_HOST || 'amqp://guest:guest@rabbitmq:5672';
const DB_URI = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:5432/${process.env.DB_NAME}`;

// We use Sequelize (ORM) so we don't have to write raw SQL queries.
const sequelize = new Sequelize(DB_URI, {
    dialect: 'postgres',
    logging: false
});

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'PHARMACIST' }
});

const Order = sequelize.define('Order', {
    productName: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'PENDING' },
    createdBy: { type: DataTypes.STRING } // Stores the username of who created it
});

// RabbitMQ
// We use a 'Topic Exchange' pattern. This allows us to broadcast events 
// like 'order.created' to anyone listening (Inventory, Notification, etc).
let channel;

async function setupRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_HOST);
        channel = await connection.createChannel();
        
        // Assert Exchange: Ensures the exchange exists before we publish to it.
        // Type 'topic' allows for flexible routing keys.
        await channel.assertExchange('pharmaguard_events', 'topic', { durable: false });
        
        console.log('RabbitMQ Connected and Exchange asserted');
    } catch (error) {
        console.error('RabbitMQ Connection Failed:', error.message);
        setTimeout(setupRabbitMQ, 5000); // Retry after 5s
    }
}

// This function runs before protected routes. It checks if the request
// has a valid JWT token in the Authorization header.
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access Token Required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token' });
        req.user = user; // Attach user info to the request object
        next(); // Proceed to the actual route handler
    });
};

// API Routes

// Route: Register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.json({ token, username: user.username, role: user.role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: Create Order (SECURED)
// 1. Validates token
// 2. Saves order to DB
// 3. Publishes 'order.created' event to RabbitMQ
app.post('/orders', authenticateToken, async (req, res) => {
    const { productName, quantity } = req.body;

    try {
        const newOrder = await Order.create({
            productName,
            quantity,
            createdBy: req.user.username
        });

        // We publish to the exchange 'pharmaguard_events' with routing key 'order.created'.
        // The Notification Service will listen for this key.
        if (channel) {
            const eventPayload = {
                event: 'ORDER_CREATED',
                orderId: newOrder.id,
                product: newOrder.productName,
                user: req.user.username,
                timestamp: new Date()
            };
            
            channel.publish(
                'pharmaguard_events', 
                'order.created', 
                Buffer.from(JSON.stringify(eventPayload))
            );
            console.log(`Event published: order.created for Order #${newOrder.id}`);
        }

        res.status(201).json(newOrder);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route: List Orders (SECURED)
app.get('/orders', authenticateToken, async (req, res) => {
   try {
        const orders = await Order.findAll();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Server Startup
// We sync the database schema first, then connect to RabbitMQ, then start the server.
sequelize.sync().then(async () => {
    console.log('PostgreSQL Database Synced');
    await setupRabbitMQ();
    app.listen(PORT, () => {
        console.log(`Order Service running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Startup failed:', err);
});