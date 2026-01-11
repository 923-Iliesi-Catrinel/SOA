const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';
const RABBIT_HOST = process.env.RABBITMQ_HOST || 'amqp://guest:guest@rabbitmq:5672';

const DB_URI = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:5432/${process.env.DB_NAME}`;
const sequelize = new Sequelize(DB_URI, { dialect: 'postgres', logging: false });

const Order = sequelize.define('Order', {
    productName: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'PENDING' }, // PENDING -> SHIPPED -> DELIVERED (or CANCELLED)
    createdBy: { type: DataTypes.STRING },
    truckId: { type: DataTypes.STRING, allowNull: true }
});

let channel;
async function setupRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_HOST);
        channel = await connection.createChannel();
        await channel.assertExchange('pharmaguard_events', 'topic', { durable: false });
        console.log('RabbitMQ Connected');
    } catch (error) {
        setTimeout(setupRabbitMQ, 5000);
    }
}

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token Required' });

    // Verify the token created by Auth Service
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token' });
        req.user = user;
        next();
    });
};

const publishEvent = (routingKey, data) => {
    if (channel) {
        channel.publish(
            'pharmaguard_events', 
            routingKey, 
            Buffer.from(JSON.stringify(data))
        );
        console.log(`Event Published: ${routingKey}`);
    }
};

// Create order (Pharmacists Only)
app.post('/orders', authenticateToken, async (req, res) => {
    try {
        const newOrder = await Order.create({
            productName: req.body.productName,
            quantity: req.body.quantity,
            createdBy: req.user.username
        });

        if (channel) {
            const eventPayload = {
                event: 'ORDER_CREATED',
                orderId: newOrder.id,
                product: newOrder.productName,
                user: req.user.username
            };
            channel.publish('pharmaguard_events', 'order.created', Buffer.from(JSON.stringify(eventPayload)));
        }
        res.status(201).json(newOrder);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List orders
// Manager -> Sees ALL orders
// Pharmacist -> Sees ONLY their own orders
app.get('/orders', authenticateToken, async (req, res) => {
    try {
        let orders;
        if (req.user.role === 'MANAGER') {
            orders = await Order.findAll({ order: [['createdAt', 'DESC']] }); // Admin view
        } else {
           orders = await Order.findAll({ 
                where: { createdBy: req.user.username },
                order: [['createdAt', 'DESC']]
            }); // User view
        }
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel order
app.put('/orders/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id);
        
        if (!order) return res.status(404).json({ message: 'Order not found' });
        
        // Security check: You can only cancel your own orders (unless you are manager)
        if (order.createdBy !== req.user.username && req.user.role !== 'MANAGER') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        order.status = 'CANCELLED';
        await order.save();

        publishEvent('order.cancelled', {
            id: order.id,
            status: 'CANCELLED'
        });
        res.json({ message: 'Order cancelled', order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dispatch (Manager Only)
app.put('/orders/:id/dispatch', authenticateToken, async (req, res) => {
    try {
        // Only Managers can dispatch trucks
        if (req.user.role !== 'MANAGER') return res.status(403).json({ message: 'Unauthorized' });

        const order = await Order.findByPk(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Update the Order
        order.truckId = req.body.truckId; // e.g., "TRUCK-101"
        order.status = 'SHIPPED';
        await order.save();

        // Notify System
        publishEvent('order.shipped', {
            id: order.id,
            truckId: order.truckId,
            status: 'SHIPPED'
        });

        res.json({ message: `Order dispatched on ${order.truckId}`, order });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Deliver (Manager Only)
app.put('/orders/:id/deliver', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'MANAGER') {
            return res.status(403).json({ message: 'Only Managers can confirm delivery' });
        }

        const order = await Order.findByPk(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (order.status === 'CANCELLED') {
            return res.status(400).json({ message: 'Cannot deliver a cancelled order' });
        }

        order.status = 'DELIVERED';
        await order.save();

        publishEvent('order.delivered', {
            id: order.id,
            product: order.productName,
            status: 'DELIVERED',
            deliveredAt: new Date()
        });

        res.json({ message: 'Order delivered successfully', order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Startup
sequelize.sync({ alter: true }).then(async () => {
    await setupRabbitMQ();
    app.listen(PORT, () => console.log(`Order Service running on ${PORT}`));
});
