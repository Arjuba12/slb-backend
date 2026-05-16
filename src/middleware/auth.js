const jwt = require('jsonwebtoken');
const db = require('../config/database');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log("AUTH HEADER:", authHeader);
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [rows] = await db.execute(
            'SELECT id, nama, email, role, is_aktif FROM users WHERE id = ?',
            [decoded.id]
        );

        if (!rows.length || !rows[0].is_aktif) {
            return res.status(401).json({ success: false, message: 'Akun tidak valid atau nonaktif' });
        }

        req.user = rows[0];
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired, silakan login ulang' });
        }
        return res.status(401).json({ success: false, message: 'Token tidak valid' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke fitur ini'
            });
        }
        next();
    };
};

module.exports = { auth, authorize };
