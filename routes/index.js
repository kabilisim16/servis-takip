// ═══════════════════════════════════════════════════════════════════
// auth.js
// ═══════════════════════════════════════════════════════════════════
const express   = require('express');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');

const authRouter = express.Router();
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'servis2025';
const SESSION_TTL    = 8 * 60 * 60 * 1000;
const sessions       = new Map();

const authLimiter = rateLimit({ windowMs: 15 * 60000, max: 10,
  message: { hata: 'Çok fazla deneme. 15 dakika bekleyin.' } });

authRouter.post('/login', authLimiter, (req, res) => {
  const { sifre } = req.body;
  if (!sifre) return res.status(400).json({ hata: 'Şifre gerekli' });
  const exp = Buffer.from(PANEL_PASSWORD), giv = Buffer.from(sifre);
  const ok  = exp.length === giv.length && crypto.timingSafeEqual(exp, giv);
  if (!ok) return res.status(401).json({ hata: 'Hatalı şifre' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
  res.json({ token, expires_in: SESSION_TTL });
});

authRouter.post('/logout', (req, res) => {
  const t = req.headers['x-session-token'];
  if (t) sessions.delete(t);
  res.json({ ok: true });
});

authRouter.get('/check', (req, res) => {
  const t = req.headers['x-session-token'];
  const s = sessions.get(t);
  if (!s || Date.now() > s.expiresAt) return res.status(401).json({ ok: false });
  s.expiresAt = Date.now() + SESSION_TTL;
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (!req.headers['x-session-token'] && req.query.token) {
    req.headers['x-session-token'] = req.query.token;
  }
  const t = req.headers['x-session-token'];
  const s = sessions.get(t);
  if (!s || Date.now() > s.expiresAt) { sessions.delete(t); return res.status(401).json({ hata: 'Oturum gerekli' }); }
  s.expiresAt = Date.now() + SESSION_TTL;
  next();
}

module.exports = { authRouter, requireAuth };

// ═══════════════════════════════════════════════════════════════════
// musteri.js  (export at bottom)
// ═══════════════════════════════════════════════════════════════════
const musteriRouter = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../services/db');

musteriRouter.get('/', (req, res) => {
  const { ara } = req.query;
  let q = 'SELECT * FROM musteriler', p = [];
  if (ara) { q += ' WHERE ad LIKE ? OR soyad LIKE ? OR telefon LIKE ?'; p.push(`%${ara}%`,`%${ara}%`,`%${ara}%`); }
  q += ' ORDER BY created_at DESC';
  res.json(db.prepare(q).all(...p));
});

musteriRouter.get('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM musteriler WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ hata: 'Bulunamadı' });
  const servisler = db.prepare('SELECT * FROM servis_kayitlari WHERE musteri_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...m, servisler });
});

musteriRouter.post('/', (req, res) => {
  const { ad, soyad, telefon, email, adres, notlar } = req.body;
  if (!ad) return res.status(400).json({ hata: 'Ad zorunlu' });
  const id = uuidv4();
  db.prepare('INSERT INTO musteriler (id,ad,soyad,telefon,email,adres,notlar) VALUES (?,?,?,?,?,?,?)').run(id,ad,soyad,telefon,email,adres,notlar);
  res.json(db.prepare('SELECT * FROM musteriler WHERE id=?').get(id));
});

musteriRouter.put('/:id', (req, res) => {
  const { ad, soyad, telefon, email, adres, notlar } = req.body;
  db.prepare('UPDATE musteriler SET ad=?,soyad=?,telefon=?,email=?,adres=?,notlar=? WHERE id=?').run(ad,soyad,telefon,email,adres,notlar,req.params.id);
  res.json(db.prepare('SELECT * FROM musteriler WHERE id=?').get(req.params.id));
});

musteriRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM musteriler WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// cihaz.js
// ═══════════════════════════════════════════════════════════════════
const cihazRouter = express.Router();

cihazRouter.get('/', (req, res) => {
  const { durum, ara } = req.query;
  let q = `SELECT c.*, m.ad||' '||COALESCE(m.soyad,'') as musteri_adi FROM cihazlar c LEFT JOIN musteriler m ON c.musteri_id=m.id`;
  const p=[],f=[];
  if (durum) { f.push('c.durum=?'); p.push(durum); }
  if (ara)   { f.push('(c.marka LIKE ? OR c.model LIKE ? OR c.imei LIKE ?)'); p.push(`%${ara}%`,`%${ara}%`,`%${ara}%`); }
  if (f.length) q += ' WHERE '+f.join(' AND ');
  q += ' ORDER BY c.created_at DESC';
  res.json(db.prepare(q).all(...p));
});

cihazRouter.post('/', (req, res) => {
  const { musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum,notlar } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO cihazlar (id,musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum,notlar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum||'stok',notlar);
  res.json(db.prepare('SELECT * FROM cihazlar WHERE id=?').get(id));
});

cihazRouter.put('/:id', (req, res) => {
  const { musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum,notlar } = req.body;
  db.prepare('UPDATE cihazlar SET musteri_id=?,marka=?,model=?,imei=?,seri_no=?,renk=?,depolama=?,satin_alma_fiyat=?,satis_fiyat=?,durum=?,notlar=? WHERE id=?').run(musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum,notlar,req.params.id);
  res.json(db.prepare('SELECT * FROM cihazlar WHERE id=?').get(req.params.id));
});

cihazRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cihazlar WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// satis.js
// ═══════════════════════════════════════════════════════════════════
const satisRouter = express.Router();

satisRouter.get('/', (req, res) => {
  const rows = db.prepare(`SELECT s.*, c.marka, c.model, c.imei, c.satin_alma_fiyat,
    m.ad||' '||COALESCE(m.soyad,'') as musteri_adi
    FROM satislar s LEFT JOIN cihazlar c ON s.cihaz_id=c.id LEFT JOIN musteriler m ON s.musteri_id=m.id
    ORDER BY s.created_at DESC`).all();
  res.json(rows);
});

satisRouter.post('/', (req, res) => {
  const { cihaz_id, musteri_id, satis_fiyat, odeme_tipi, notlar } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO satislar (id,cihaz_id,musteri_id,satis_fiyat,odeme_tipi,notlar) VALUES (?,?,?,?,?,?)').run(id,cihaz_id,musteri_id,satis_fiyat,odeme_tipi||'nakit',notlar);
  db.prepare("UPDATE cihazlar SET durum='satildi',satis_fiyat=? WHERE id=?").run(satis_fiyat,cihaz_id);
  res.json(db.prepare('SELECT * FROM satislar WHERE id=?').get(id));
});

// ═══════════════════════════════════════════════════════════════════
// imei.js
// ═══════════════════════════════════════════════════════════════════
const imeiRouter = express.Router();

function luhnCheck(imei) {
  const d = imei.split('').map(Number);
  const odd = d.filter((_,i) => i%2===d.length%2);
  const even = d.filter((_,i) => i%2!==d.length%2);
  const es = even.reduce((s,x) => { const v=x*2; return s+(v>9?v-9:v); }, 0);
  return (odd.reduce((a,b)=>a+b,0)+es)%10===0;
}
const TAC = {'00':'ABD','01':'ABD','30':'Fransa','35':'İngiltere','44':'İngiltere','49':'Almanya','50':'Almanya','72':'Çin','74':'Japonya','75':'G.Kore','86':'Çin','89':'Hindistan','95':'G.Kore'};

imeiRouter.post('/sorgu', async (req, res) => {
  const { imei, serial } = req.body;
  if (!imei && !serial) return res.status(400).json({ hata: 'imei veya serial gerekli' });
  const sorgu = (imei||serial).trim();
  if (imei && !/^\d{15}$/.test(imei)) return res.status(400).json({ hata: 'IMEI 15 haneli rakam olmalı' });
  const luhn = imei ? luhnCheck(imei) : null;
  const ulke = imei ? (TAC[imei.slice(0,2)] || 'Bilinmiyor') : null;
  const sonuc = {
    imei: sorgu, karar: imei ? (luhn ? 'SAFE' : 'RISKY') : 'UNKNOWN',
    ozet: imei ? { kayit_ulkesi: ulke, luhn_gecerli: luhn, tac: imei.slice(0,8) } : {},
    sonuclar: imei ? [{ kaynak:'TAC Analiz', durum: luhn?'ok':'warning', veri:{ tac:imei.slice(0,8), kayit_ulkesi:ulke, luhn_gecerli:luhn, uyari:luhn?null:'Luhn geçersiz' } }] : []
  };
  db.prepare('INSERT INTO imei_sorgular (id,sorgu,tip,sonuc,detaylar) VALUES (?,?,?,?,?)').run(uuidv4(),sorgu,imei?'imei':'serial',sonuc.karar,JSON.stringify(sonuc));
  res.json(sonuc);
});

imeiRouter.get('/gecmis', (req, res) => {
  res.json(db.prepare('SELECT * FROM imei_sorgular ORDER BY created_at DESC LIMIT 50').all()
    .map(r => ({ ...r, detaylar: JSON.parse(r.detaylar||'{}') })));
});

// ═══════════════════════════════════════════════════════════════════
// dashboard.js
// ═══════════════════════════════════════════════════════════════════
const dashRouter = express.Router();

dashRouter.get('/', (req, res) => {
  const satisKar = db.prepare(`SELECT COALESCE(SUM(s.satis_fiyat-COALESCE(c.satin_alma_fiyat,0)),0) as kar, COALESCE(SUM(s.satis_fiyat),0) as toplam_satis FROM satislar s LEFT JOIN cihazlar c ON s.cihaz_id=c.id WHERE strftime('%Y-%m',s.created_at)=strftime('%Y-%m','now')`).get();
  const tamirKar = db.prepare(`SELECT COALESCE(SUM(toplam_ucret),0) as kar, COALESCE(SUM(parca_maliyeti),0) as parca_gider FROM servis_kayitlari WHERE durum='tamamlandi' AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now')`).get();
  const gSatis   = db.prepare(`SELECT COALESCE(SUM(s.satis_fiyat-COALESCE(c.satin_alma_fiyat,0)),0) as kar FROM satislar s LEFT JOIN cihazlar c ON s.cihaz_id=c.id`).get();
  const gTamir   = db.prepare(`SELECT COALESCE(SUM(toplam_ucret-parca_maliyeti),0) as kar FROM servis_kayitlari WHERE durum='tamamlandi'`).get();
  const stok     = db.prepare(`SELECT COALESCE(SUM(satin_alma_fiyat),0) as maliyet, COUNT(*) as adet FROM cihazlar WHERE durum='stok'`).get();
  res.json({
    toplam_musteri:       db.prepare('SELECT COUNT(*) as c FROM musteriler').get().c,
    stok_cihaz:           stok.adet,
    stok_deger:           stok.maliyet,
    serviste_cihaz:       db.prepare("SELECT COUNT(*) as c FROM cihazlar WHERE durum='serviste'").get().c,
    bekleyen_servis:      db.prepare("SELECT COUNT(*) as c FROM servis_kayitlari WHERE durum NOT IN ('tamamlandi','iptal')").get().c,
    tamamlanan_servis_ay: db.prepare(`SELECT COUNT(*) as c FROM servis_kayitlari WHERE durum='tamamlandi' AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now')`).get().c,
    bugun_imei_sorgu:     db.prepare("SELECT COUNT(*) as c FROM imei_sorgular WHERE DATE(created_at)=DATE('now')").get().c,
    ay_satis_kar:         satisKar.kar,
    ay_satis_ciro:        satisKar.toplam_satis,
    ay_tamir_kar:         tamirKar.kar - tamirKar.parca_gider,
    ay_tamir_ciro:        tamirKar.kar,
    ay_toplam_kar:        satisKar.kar + (tamirKar.kar - tamirKar.parca_gider),
    genel_satis_kar:      gSatis.kar,
    genel_tamir_kar:      gTamir.kar,
    genel_toplam_kar:     gSatis.kar + gTamir.kar,
    son_sorgular:         db.prepare('SELECT sorgu,tip,sonuc,created_at FROM imei_sorgular ORDER BY created_at DESC LIMIT 5').all(),
    son_servisler:        db.prepare(`SELECT s.ariza_tanimi,s.durum,s.toplam_ucret,s.cihaz_tipi, COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model, m.ad musteri_ad FROM servis_kayitlari s LEFT JOIN cihazlar c ON s.cihaz_id=c.id LEFT JOIN musteriler m ON s.musteri_id=m.id ORDER BY s.created_at DESC LIMIT 5`).all(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// takip.js  (public — no auth)
// ═══════════════════════════════════════════════════════════════════
const takipRouter = express.Router();

takipRouter.get('/', (req, res) => {
  const { telefon } = req.query;
  if (!telefon || telefon.length < 7) return res.status(400).json({ hata: 'Geçerli telefon giriniz' });
  const temiz = telefon.replace(/\s/g,'');
  const musteri = db.prepare('SELECT * FROM musteriler WHERE telefon LIKE ?').get('%'+temiz+'%');
  if (!musteri) return res.status(404).json({ hata: 'Bu telefon numarasına kayıtlı müşteri bulunamadı' });
  const servisler = db.prepare(`SELECT s.id,s.ariza_tanimi,s.durum,s.teknisyen,s.teslim_tarihi,s.toplam_ucret,s.iade_tutari,s.cihaz_tipi,s.notlar,s.created_at,s.updated_at, COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model FROM servis_kayitlari s LEFT JOIN cihazlar c ON s.cihaz_id=c.id WHERE s.musteri_id=? ORDER BY s.created_at DESC`).all(musteri.id);
  const { getAyar } = require('../services/db');
  res.json({
    musteri: { ad: musteri.ad, soyad: musteri.soyad, telefon: musteri.telefon },
    servisler,
    gmb_link: getAyar('firma_gmb_link', ''),
    firma_adi: getAyar('firma_adi', 'Teknik Servis'),
    firma_telefon: getAyar('firma_telefon', ''),
  });
});

module.exports = { authRouter, requireAuth, musteriRouter, cihazRouter, satisRouter, imeiRouter, dashRouter, takipRouter };
