const db = require('../config/database');

const ensurePpiTargetColumns = async () => {
    const columns = [
        ['potensi', 'TEXT'],
        ['hambatan', 'TEXT'],
        ['target_akademik', 'TEXT'],
        ['target_motorik', 'TEXT'],
        ['target_komunikasi', 'TEXT'],
        ['target_bina_diri', 'TEXT']
    ];

    for (const [name, definition] of columns) {
        const [rows] = await db.execute(`SHOW COLUMNS FROM ppi LIKE '${name}'`);
        if (!rows.length) {
            await db.execute(`ALTER TABLE ppi ADD COLUMN ${name} ${definition}`);
        }
    }

    const [legacySosial] = await db.execute(`SHOW COLUMNS FROM ppi LIKE 'target_sosial'`);
    if (legacySosial.length) {
        await db.execute(`
            UPDATE ppi
            SET target_komunikasi = target_sosial
            WHERE (target_komunikasi IS NULL OR target_komunikasi = '')
              AND target_sosial IS NOT NULL
        `);
    }

    const [legacyPerilaku] = await db.execute(`SHOW COLUMNS FROM ppi LIKE 'target_perilaku'`);
    if (legacyPerilaku.length) {
        await db.execute(`
            UPDATE ppi
            SET target_bina_diri = target_perilaku
            WHERE (target_bina_diri IS NULL OR target_bina_diri = '')
              AND target_perilaku IS NOT NULL
        `);
    }
};

const normalizePpiTargets = (ppi) => {
    if (!ppi) return ppi;
    ppi.target_komunikasi = ppi.target_komunikasi || ppi.target_sosial || null;
    ppi.target_bina_diri = ppi.target_bina_diri || ppi.target_perilaku || null;
    return ppi;
};

// GET /api/ppi/siswa/:siswaId
const getBySiswa = async (req, res) => {
    try {
        await ensurePpiTargetColumns();

        const [rows] = await db.execute(`
            SELECT p.*, s.nama AS nama_siswa, s.kebutuhan_khusus,
                   k.nama_kelas, u.nama AS nama_guru
            FROM ppi p
            JOIN siswa s ON s.id = p.siswa_id
            LEFT JOIN kelas k ON k.id = s.kelas_id
            JOIN guru g ON g.id = p.guru_id
            JOIN users u ON u.id = g.user_id
            WHERE p.siswa_id = ?
            ORDER BY p.created_at DESC
        `, [req.params.siswaId]);

        for (const ppi of rows) {
            const [detail] = await db.execute(`
                SELECT pd.*, ap.nama AS aspek_nama, ap.kode
                FROM ppi_detail pd
                JOIN aspek_perkembangan ap ON ap.id = pd.aspek_id
                WHERE pd.ppi_id = ?
            `, [ppi.id]);
            ppi.detail = detail;
            normalizePpiTargets(ppi);
        }

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/ppi/:id
const getById = async (req, res) => {
    try {
        await ensurePpiTargetColumns();

        const [rows] = await db.execute(`
            SELECT p.*, s.nama AS nama_siswa, s.kebutuhan_khusus,
                   k.nama_kelas, u.nama AS nama_guru
            FROM ppi p
            JOIN siswa s ON s.id = p.siswa_id
            LEFT JOIN kelas k ON k.id = s.kelas_id
            JOIN guru g ON g.id = p.guru_id
            JOIN users u ON u.id = g.user_id
            WHERE p.id = ?
        `, [req.params.id]);

        if (!rows.length) return res.status(404).json({ success: false, message: 'PPI tidak ditemukan' });

        const [detail] = await db.execute(`
            SELECT pd.*, ap.nama AS aspek_nama, ap.kode
            FROM ppi_detail pd
            JOIN aspek_perkembangan ap ON ap.id = pd.aspek_id
            WHERE pd.ppi_id = ?
        `, [req.params.id]);

        res.json({ success: true, data: normalizePpiTargets({ ...rows[0], detail }) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/ppi - Guru buat PPI baru
const create = async (req, res) => {

    try {
        await ensurePpiTargetColumns();

        const {
            siswa_id,
            semester,
            tahun_ajaran,

            potensi,
            hambatan,

            target_akademik,
            target_motorik,
            target_komunikasi,
            target_bina_diri,
            target_sosial,
            target_perilaku

        } = req.body;

        const komunikasi = target_komunikasi || target_sosial || null;
        const binaDiri = target_bina_diri || target_perilaku || null;

        // cari guru berdasarkan user login
        const [guruRows] = await db.execute(
            'SELECT id FROM guru WHERE user_id = ?',
            [req.user.id]
        );

        if (!guruRows.length) {

            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        const guruId = guruRows[0].id;

        // gabungkan semua target jadi target utama
        const targetUtama = `
Kognitif:
${target_akademik || '-'}

Motorik:
${target_motorik || '-'}

Komunikasi:
${komunikasi || '-'}

Bina Diri:
${binaDiri || '-'}
        `.trim();

        const [result] = await db.execute(
            `
            INSERT INTO ppi (
                siswa_id,
                guru_id,
                semester,
                tahun_ajaran,

                potensi,
                hambatan,

                target_utama,

                target_akademik,
                target_motorik,
                target_komunikasi,
                target_bina_diri,

                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')
            `,
            [
                siswa_id,
                guruId,
                semester,
                tahun_ajaran,

                potensi,
                hambatan,

                targetUtama,

                target_akademik,
                target_motorik,
                komunikasi,
                binaDiri
            ]
        );

        res.status(201).json({
            success: true,
            message: 'PPI berhasil dibuat',
            data: {
                id: result.insertId
            }
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};



// PUT /api/ppi/:id
const update = async (req, res) => {
    try {
        await ensurePpiTargetColumns();

        const {
            target_utama,
            status,
            detail,
            target_akademik,
            target_motorik,
            target_komunikasi,
            target_bina_diri
        } = req.body;

        await db.execute(
            `UPDATE ppi
             SET target_utama = COALESCE(?, target_utama),
                 status = COALESCE(?, status),
                 target_akademik = COALESCE(?, target_akademik),
                 target_motorik = COALESCE(?, target_motorik),
                 target_komunikasi = COALESCE(?, target_komunikasi),
                 target_bina_diri = COALESCE(?, target_bina_diri),
                 updated_at = NOW()
             WHERE id = ?`,
            [
                target_utama || null,
                status || null,
                target_akademik || null,
                target_motorik || null,
                target_komunikasi || null,
                target_bina_diri || null,
                req.params.id
            ]
        );

        if (detail && detail.length) {
            for (const d of detail) {
                if (d.id) {
                    await db.execute(
                        'UPDATE ppi_detail SET target=?, progress=?, status=?, catatan=? WHERE id=?',
                        [d.target, d.progress, d.status, d.catatan, d.id]
                    );
                } else {
                    await db.execute(
                        'INSERT INTO ppi_detail (ppi_id, aspek_id, target, progress, status, catatan) VALUES (?,?,?,?,?,?)',
                        [req.params.id, d.aspek_id, d.target, d.progress || 0, d.status || 'Belum', d.catatan || null]
                    );
                }
            }
        }

        res.json({ success: true, message: 'PPI berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/ppi/kelas/:kelasId - Semua PPI di kelas
const getByKelas = async (req, res) => {

    try {
        await ensurePpiTargetColumns();

        const { semester, tahun_ajaran } = req.query;

        let query = `
            SELECT
                p.id,
                p.semester,
                p.tahun_ajaran,
                p.status,
                p.target_utama,
                p.target_akademik,
                p.target_motorik,
                p.target_komunikasi,
                p.target_bina_diri,

                s.id AS siswa_id,
                s.nama AS nama_siswa,
                s.kebutuhan_khusus,

                u.nama AS nama_guru,

                COUNT(pd.id) AS total_target,

                SUM(
                    CASE
                        WHEN pd.status = 'Tercapai'
                        THEN 1
                        ELSE 0
                    END
                ) AS tercapai

            FROM ppi p

            JOIN siswa s
                ON s.id = p.siswa_id

            JOIN guru g
                ON g.id = p.guru_id

            JOIN users u
                ON u.id = g.user_id

            LEFT JOIN ppi_detail pd
                ON pd.ppi_id = p.id

            WHERE s.kelas_id = ?
        `;

        const params = [req.params.kelasId];

        if (semester) {
            query += ` AND p.semester = ?`;
            params.push(semester);
        }

        if (tahun_ajaran) {
            query += ` AND p.tahun_ajaran = ?`;
            params.push(tahun_ajaran);
        }

        query += `
            GROUP BY p.id
            ORDER BY s.nama ASC
        `;

        const [rows] = await db.execute(query, params);

        res.json({
            success: true,
            data: rows
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getBySiswa,
    getById,
    create,
    update,
    getByKelas
};
