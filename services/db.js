const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/servis.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migrations ────────────────────────────────────────────────────────────────
const migrations = [
  'ALTER TABLE servis_kayitlari ADD COLUMN marka TEXT',
  'ALTER TABLE servis_kayitlari ADD COLUMN model TEXT',
  'ALTER TABLE servis_kayitlari ADD COLUMN cihaz_tipi TEXT DEFAULT "telefon"',
  'ALTER TABLE servis_kayitlari ADD COLUMN iade_tutari REAL DEFAULT 0',
  'ALTER TABLE servis_kayitlari ADD COLUMN wa_alindi_at DATETIME',
  'ALTER TABLE servis_kayitlari ADD COLUMN wa_tamamlandi_at DATETIME',
  'ALTER TABLE servis_kayitlari ADD COLUMN email_alindi_at DATETIME',
  'ALTER TABLE servis_kayitlari ADD COLUMN email_tamamlandi_at DATETIME',
];
for (const m of migrations) { try { db.exec(m); } catch(e) {} }

db.exec(`
  CREATE TABLE IF NOT EXISTS musteriler (
    id TEXT PRIMARY KEY,
    ad TEXT NOT NULL,
    soyad TEXT,
    telefon TEXT,
    email TEXT,
    adres TEXT,
    notlar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cihazlar (
    id TEXT PRIMARY KEY,
    musteri_id TEXT REFERENCES musteriler(id),
    marka TEXT,
    model TEXT,
    imei TEXT,
    seri_no TEXT,
    renk TEXT,
    depolama TEXT,
    satin_alma_fiyat REAL,
    satis_fiyat REAL,
    durum TEXT DEFAULT 'stok',
    notlar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS servis_kayitlari (
    id TEXT PRIMARY KEY,
    cihaz_id TEXT REFERENCES cihazlar(id),
    musteri_id TEXT REFERENCES musteriler(id),
    cihaz_tipi TEXT DEFAULT 'telefon',
    marka TEXT,
    model TEXT,
    ariza_tanimi TEXT NOT NULL,
    durum TEXT DEFAULT 'beklemede',
    teknisyen TEXT,
    parca_maliyeti REAL DEFAULT 0,
    iscilik_maliyeti REAL DEFAULT 0,
    toplam_ucret REAL DEFAULT 0,
    iade_tutari REAL DEFAULT 0,
    teslim_tarihi TEXT,
    notlar TEXT,
    wa_alindi_at DATETIME,
    wa_tamamlandi_at DATETIME,
    email_alindi_at DATETIME,
    email_tamamlandi_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS imei_sorgular (
    id TEXT PRIMARY KEY,
    sorgu TEXT NOT NULL,
    tip TEXT,
    sonuc TEXT,
    detaylar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS satislar (
    id TEXT PRIMARY KEY,
    cihaz_id TEXT REFERENCES cihazlar(id),
    musteri_id TEXT,
    satis_fiyat REAL,
    odeme_tipi TEXT DEFAULT 'nakit',
    notlar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ayarlar (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    alici TEXT,
    konu TEXT,
    tip TEXT,
    durum TEXT,
    hata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Ayarlar helpers ───────────────────────────────────────────────────────────
function getAyar(key, defaultVal = '') {
  const row = db.prepare('SELECT value FROM ayarlar WHERE key=?').get(key);
  return row ? row.value : defaultVal;
}

function setAyar(key, value) {
  db.prepare(`INSERT INTO ayarlar (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
    .run(key, String(value));
}

function getAyarlar(keys) {
  const result = {};
  for (const k of keys) result[k] = getAyar(k);
  return result;
}

// Varsayılan ayarları yükle
const defaults = {
  firma_adi: 'Teknik Servis',
  firma_adres: '',
  firma_telefon: '',
  firma_email: '',
  firma_gmb_link: '',
  dil: 'tr',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: 'Teknik Servis',
  smtp_ssl: '0',
  bildirim_kanal: 'wa',
  bildirim_alindi: '1',
  bildirim_tamamlandi: '1',
  bildirim_iptal: '1',
};
for (const [k, v] of Object.entries(defaults)) {
  const mevcut = db.prepare('SELECT value FROM ayarlar WHERE key=?').get(k);
  if (!mevcut) setAyar(k, v);
}

module.exports = { db, getAyar, setAyar, getAyarlar };
