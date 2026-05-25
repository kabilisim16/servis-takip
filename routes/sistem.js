const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const archiver  = require('archiver');
const { db }    = require('../services/db');

const ROOT_DIR   = path.join(__dirname, '..');
const DATA_DIR   = path.join(ROOT_DIR, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const GITHUB_REPO = 'kabilisim16/servis-takip';

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Versiyon ──────────────────────────────────────────────────────────────────
const pkg = require('../package.json');

router.get('/versiyon', (req, res) => {
  res.json({ mevcut: pkg.version });
});

// ── GitHub'dan son versiyon kontrol ──────────────────────────────────────────
router.get('/guncelleme-kontrol', async (req, res) => {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'User-Agent': 'servis-panel' } }
    );
    if (!r.ok) return res.json({ guncelleme_var: false, hata: 'GitHub erişilemedi' });
    const data = await r.json();
    const sonVersiyon = (data.tag_name || '').replace(/^v/, '');
    const mevcutVersiyon = pkg.version;
    const guncellemeVar = sonVersiyon && sonVersiyon !== mevcutVersiyon;
    res.json({
      guncelleme_var: guncellemeVar,
      mevcut: mevcutVersiyon,
      son: sonVersiyon,
      notlar: data.body || '',
      tarih: data.published_at || ''
    });
  } catch(e) {
    res.json({ guncelleme_var: false, hata: e.message });
  }
});

// ── Güncelleme uygula ─────────────────────────────────────────────────────────
router.post('/guncelle', async (req, res) => {
  // Önce DB yedeği al
  const tarih = new Date().toISOString().slice(0,19).replace(/:/g,'-');
  const yedekDosya = path.join(BACKUP_DIR, `guncelleme-oncesi-${tarih}.db`);
  fs.copyFileSync(path.join(DATA_DIR, 'servis.db'), yedekDosya);

  res.json({ ok: true, mesaj: 'Güncelleme başlatıldı, ~30 saniye içinde tamamlanır.' });

  // Async güncelleme
  setTimeout(async () => {
    try {
      console.log('[UPDATE] git pull başlıyor...');
      const { stdout: pullOut } = await execAsync('git pull origin main', { cwd: ROOT_DIR });
      console.log('[UPDATE] git pull:', pullOut);

      console.log('[UPDATE] npm install...');
      await execAsync('npm install --production', { cwd: ROOT_DIR });

      console.log('[UPDATE] container yeniden başlatılıyor...');
      await execAsync('kill -SIGUSR1 1').catch(() => {});

      // package.json versiyonu oku ve logla
      delete require.cache[require.resolve('../package.json')];
      const yeniPkg = require('../package.json');
      console.log(`[UPDATE] ✓ v${yeniPkg.version} yüklendi`);
    } catch(e) {
      console.error('[UPDATE] ✗ Hata:', e.message);
    }
  }, 500);
});

// ── Yedek listesi ─────────────────────────────────────────────────────────────
router.get('/yedekler', (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
  const dosyalar = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip') || f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { ad: f, boyut: stat.size, tarih: stat.mtime };
    })
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
  res.json(dosyalar);
});

// ── Yedek al ─────────────────────────────────────────────────────────────────
router.post('/yedek-al', (req, res) => {
  const tarih    = new Date().toISOString().slice(0,19).replace(/:/g,'-');
  const dosyaAdi = `yedek-${tarih}.zip`;
  const dosyaYol = path.join(BACKUP_DIR, dosyaAdi);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  // DB dosyası
  archive.file(path.join(DATA_DIR, 'servis.db'), { name: 'servis.db' });

  // JSON export — her tablo ayrı dosya
  const tablolar = ['musteriler', 'servis_kayitlari', 'cihazlar', 'satislar', 'ayarlar'];
  for (const tablo of tablolar) {
    try {
      const rows = db.prepare(`SELECT * FROM ${tablo}`).all();
      archive.append(JSON.stringify(rows, null, 2), { name: `${tablo}.json` });
    } catch(e) {}
  }

  // Meta bilgi
  archive.append(JSON.stringify({
    versiyon: pkg.version,
    tarih: new Date().toISOString(),
    kayit_sayilari: {
      musteriler:       db.prepare('SELECT COUNT(*) as c FROM musteriler').get().c,
      servis_kayitlari: db.prepare('SELECT COUNT(*) as c FROM servis_kayitlari').get().c,
      cihazlar:         db.prepare('SELECT COUNT(*) as c FROM cihazlar').get().c,
      satislar:         db.prepare('SELECT COUNT(*) as c FROM satislar').get().c,
    }
  }, null, 2), { name: 'meta.json' });

  archive.finalize();

  // Sunucuda da kaydet
  archive.on('end', () => {
    fs.createReadStream(dosyaYol).pipe(fs.createWriteStream(dosyaYol)).on('error', () => {});
  });
});

// ── Yedek indir ───────────────────────────────────────────────────────────────
router.get('/yedek-indir/:dosya', (req, res) => {
  const dosyaYol = path.join(BACKUP_DIR, path.basename(req.params.dosya));
  if (!fs.existsSync(dosyaYol)) return res.status(404).json({ hata: 'Dosya bulunamadı' });
  res.download(dosyaYol);
});

// ── Yedek sil ─────────────────────────────────────────────────────────────────
router.delete('/yedek/:dosya', (req, res) => {
  const dosyaYol = path.join(BACKUP_DIR, path.basename(req.params.dosya));
  if (fs.existsSync(dosyaYol)) fs.unlinkSync(dosyaYol);
  res.json({ ok: true });
});

// ── Import ────────────────────────────────────────────────────────────────────
router.post('/import', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  const multer  = require('multer');
  res.status(400).json({ hata: 'Multipart form kullanın' });
});

// Multer ile ZIP import
const multer  = require('multer');
const unzipper = require('unzipper');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/import-zip', upload.single('yedek'), async (req, res) => {
  if (!req.file) return res.status(400).json({ hata: 'Dosya yüklenmedi' });

  try {
    const dir = await unzipper.Open.buffer(req.file.buffer);
    const sonuc = { eklenen: {}, atlanan: {}, hatalar: [] };

    for (const entry of dir.files) {
      const isim = path.basename(entry.path);
      if (!isim.endsWith('.json')) continue;

      const tablo = isim.replace('.json', '');
      const desteklenen = ['musteriler', 'servis_kayitlari', 'cihazlar', 'satislar'];
      if (!desteklenen.includes(tablo)) continue;

      const icerik = await entry.buffer();
      const rows   = JSON.parse(icerik.toString());

      sonuc.eklenen[tablo] = 0;
      sonuc.atlanan[tablo] = 0;

      const insertMap = {
        musteriler:       'INSERT OR IGNORE INTO musteriler (id,ad,soyad,telefon,email,adres,notlar,created_at) VALUES (@id,@ad,@soyad,@telefon,@email,@adres,@notlar,@created_at)',
        servis_kayitlari: 'INSERT OR IGNORE INTO servis_kayitlari (id,cihaz_id,musteri_id,cihaz_tipi,marka,model,ariza_tanimi,durum,teknisyen,parca_maliyeti,iscilik_maliyeti,toplam_ucret,iade_tutari,teslim_tarihi,notlar,created_at,updated_at) VALUES (@id,@cihaz_id,@musteri_id,@cihaz_tipi,@marka,@model,@ariza_tanimi,@durum,@teknisyen,@parca_maliyeti,@iscilik_maliyeti,@toplam_ucret,@iade_tutari,@teslim_tarihi,@notlar,@created_at,@updated_at)',
        cihazlar:         'INSERT OR IGNORE INTO cihazlar (id,musteri_id,marka,model,imei,seri_no,renk,depolama,satin_alma_fiyat,satis_fiyat,durum,notlar,created_at) VALUES (@id,@musteri_id,@marka,@model,@imei,@seri_no,@renk,@depolama,@satin_alma_fiyat,@satis_fiyat,@durum,@notlar,@created_at)',
        satislar:         'INSERT OR IGNORE INTO satislar (id,cihaz_id,musteri_id,satis_fiyat,odeme_tipi,notlar,created_at) VALUES (@id,@cihaz_id,@musteri_id,@satis_fiyat,@odeme_tipi,@notlar,@created_at)',
      };

      const stmt = db.prepare(insertMap[tablo]);
      const insertMany = db.transaction((kayitlar) => {
        for (const k of kayitlar) {
          try { const r = stmt.run(k); if (r.changes > 0) sonuc.eklenen[tablo]++; else sonuc.atlanan[tablo]++; }
          catch(e) { sonuc.atlanan[tablo]++; }
        }
      });
      insertMany(rows);
    }

    res.json({ ok: true, sonuc });
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

// ── Otomatik yedek (cron gibi — her gece çağrılır) ───────────────────────────
function otomatikYedekAl() {
  const tarih    = new Date().toISOString().slice(0,10);
  const hedef    = path.join(BACKUP_DIR, `otomatik-${tarih}.db`);
  if (fs.existsSync(hedef)) return; // Bugün zaten alındı
  try {
    fs.copyFileSync(path.join(DATA_DIR, 'servis.db'), hedef);
    console.log(`[BACKUP] Otomatik yedek alındı: ${hedef}`);
    // 30 günden eski otomatik yedekleri sil
    const dosyalar = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('otomatik-'));
    dosyalar.sort().reverse().slice(30).forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    });
  } catch(e) {
    console.error('[BACKUP] Otomatik yedek hatası:', e.message);
  }
}

// Gece yarısı çalıştır
const simdi = new Date();
const yarinGece = new Date(simdi);
yarinGece.setHours(3, 0, 0, 0); // 03:00'da
if (yarinGece <= simdi) yarinGece.setDate(yarinGece.getDate() + 1);
setTimeout(() => {
  otomatikYedekAl();
  setInterval(otomatikYedekAl, 24 * 60 * 60 * 1000);
}, yarinGece - simdi);

// Başlangıçta da bir kez al
setTimeout(otomatikYedekAl, 5000);

module.exports = router;
