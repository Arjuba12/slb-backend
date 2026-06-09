const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');
const swaggerSpec = require('./config/swagger');
const db = require('./config/database');

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
    origin: '*', // Android app - allow all, atau sesuaikan dengan IP server
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Request logger (development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

// ============================================================
// ROUTES
// ============================================================
app.use('/api', routes);

// Swagger UI Docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'SLB Monitoring API Docs',
    customCss: '.swagger-ui .topbar { background-color: #2c3e50; }',
    swaggerOptions: {
        persistAuthorization: true,  // Token tidak hilang saat refresh
        defaultModelsExpandDepth: -1
    }
}));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), app: 'SLB Monitoring API' });
});

app.get('/health/database', async (req, res) => {
    try {
        await db.execute('SELECT user_id FROM users LIMIT 1');
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(503).json({
            status: 'unavailable',
            code: err.code || 'DATABASE_ERROR'
        });
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} tidak ditemukan` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SLB Monitoring API running on port ${PORT}`);
    console.log(`📡 Health check : http://localhost:${PORT}/health`);
    console.log(`🔑 Base URL     : http://localhost:${PORT}/api`);
    console.log(`📖 API Docs     : http://localhost:${PORT}/api/docs`);
});
