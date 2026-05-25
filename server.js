const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '.')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/api/', rateLimit({ windowMs: 60000, max: 200 }));

// ── Routes ────────────────────────────────────────────────────────────────────
const {
  authRouter, requireAuth,
  musteriRouter, cihazRouter, satisRouter,
  imeiRouter, dashRouter, takipRouter
} = require('./routes/index');
const servisRouter = require('./routes/servis');
const ayarlarRouter = require('./routes/ayarlar');

app.use('/api/auth',      authRouter);
app.use('/api/takip',     takipRouter);                    // public
app.use('/api/servis',    requireAuth, servisRouter);
app.use('/api/musteriler',requireAuth, musteriRouter);
app.use('/api/cihazlar',  requireAuth, cihazRouter);
app.use('/api/satislar',  requireAuth, satisRouter);
app.use('/api/imei',      requireAuth, imeiRouter);
app.use('/api/dashboard', requireAuth, dashRouter);
app.use('/api/ayarlar',   requireAuth, ayarlarRouter);
app.use('/api/sistem',    requireAuth, sistemRouter);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Servis Panel: http://localhost:${PORT}`));
