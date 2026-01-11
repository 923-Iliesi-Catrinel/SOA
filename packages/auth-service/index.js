const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

const DB_URI = `postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:5432/${process.env.DB_NAME}`;
const sequelize = new Sequelize(DB_URI, { dialect: 'postgres', logging: false });

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'PHARMACIST' } // 'PHARMACIST' or 'MANAGER'
});

// Auto-create Admin first
async function seedDatabase() {
    try {
        await sequelize.sync();
        
        const adminExists = await User.findOne({ where: { username: 'admin' } });
        if (!adminExists) {
            console.log('Seeding: Creating default Manager (admin/admin)');
            const hashedPassword = await bcrypt.hash('admin', 10);
            await User.create({
                username: 'admin',
                password: hashedPassword,
                role: 'MANAGER'
            });
        }
    } catch (err) {
        console.error('Seeding Failed:', err.message);
    }
}

// REGISTER (Public - defaults to Pharmacist)
app.post('/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Missing fields' });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = await User.create({ 
            username, 
            password: hashedPassword, 
            role: role || 'PHARMACIST' 
        });
        
        res.status(201).json({ message: 'User created', userId: user.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN (Used by both Managers and Pharmacists)
app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );
        
        // Send back the role so the Frontend knows which screen to show
        res.json({ token, role: user.role });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// VERIFY (For Order Service Gatekeeping)
app.post('/auth/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ valid: false });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user: decoded });
    } catch (err) {
        res.status(401).json({ valid: false });
    }
});

// Startup
async function startServer() {
    let retries = 5;
    while (retries) {
        try {
            await sequelize.authenticate();
            console.log('Database Connected');
            
            // This creates the 'Users' table if it doesn't exist
            await sequelize.sync(); 
            console.log('Tables Synced');

            // Seed Admin User
            const adminExists = await User.findOne({ where: { username: 'admin' } });
            if (!adminExists) {
                console.log('Seeding: Creating Manager (admin/admin)');
                const hashedPassword = await bcrypt.hash('admin', 10);
                await User.create({
                    username: 'admin',
                    password: hashedPassword,
                    role: 'MANAGER'
                });
            }

            // Start Server (Only if DB is ready)
            app.listen(PORT, () => console.log(`Auth Service running on ${PORT}`));
            break;

        } catch (err) {
            console.error(`DB Connection Failed. Retrying in 5s...`);
            console.error(err.message);
            retries -= 1;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
}

startServer();
