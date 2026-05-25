const express = require('express');
const router = express.Router();
const { db, getAyar, setAyar } = require('../services/db');
const { testMail } = require('../services/email');
const { wppStatus, wppQR } = require('../services/whatsapp');
const fs = require('fs');
const path = require('path');

// Tüm ayarları getir
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM ayarlar').all();
  const ayarlar = {};
  rows.forEach(r => {
    // Şifreyi maskele
    ayarlar[r.key] = r.key === 'smtp_pass' ? (r.value ? '••••••••' : '') : r.value;
  });
  res.json(ayarlar);
});

// Ayarları kaydet
router.post('/', (req, res) => {
  const { ayarlar } = req.body;
  if (!ayarlar || typeof ayarlar !== 'object')
    return res.status(400).json({ hata: 'Geçersiz veri' });

  for (const [key, value] of Object.entries(ayarlar)) {
    // Maskelenmiş şifreyi kaydetme
    if (key === 'smtp_pass' && value === '••••••••') continue;
    setAyar(key, value);
  }
  res.json({ ok: true });
});

// Tek ayar güncelle
router.put('/:key', (req, res) => {
  const { value } = req.body;
  setAyar(req.params.key, value);
  res.json({ ok: true });
});

// Dil dosyalarını listele
router.get('/dil/listele', (req, res) => {
  const localesDir = path.join(__dirname, '../locales');
  const files = fs.readdirSync(localesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  res.json(files);
});

// Aktif dil dosyasını getir
router.get('/dil/aktif', (req, res) => {
  const dil = getAyar('dil', 'tr');
  const filePath = path.join(__dirname, '../locales', dil + '.json');
  if (!fs.existsSync(filePath)) {
    return res.json(require('../locales/tr.json'));
  }
  res.json(require(filePath));
});

// Test mail gönder
router.post('/email/test', async (req, res) => {
  const { hedef } = req.body;
  if (!hedef) return res.status(400).json({ hata: 'Hedef mail adresi gerekli' });
  try {
    await testMail(hedef);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

// Email log
router.get('/email/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM email_log ORDER BY created_at DESC LIMIT 50').all();
  res.json(rows);
});

// WA durum
router.get('/wa/durum', async (req, res) => {
  const status = await wppStatus();
  res.json(status);
});

// WA QR
router.get('/wa/qr', async (req, res) => {
  try {
    const data = await wppQR();
    res.json(data);
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

module.exports = router;
