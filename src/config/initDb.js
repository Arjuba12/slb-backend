const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const databaseConfig = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'slb_monitoring'
};

async function initDatabase() {
    const connection = await mysql.createConnection({
        ...databaseConfig,
        multipleStatements: true
    });

    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await connection.query(schema);
        console.log('Database schema initialized successfully');
    } finally {
        await connection.end();
    }
}

initDatabase().catch(err => {
    console.error('Database initialization failed:', err.code || err.message);
    process.exit(1);
});
