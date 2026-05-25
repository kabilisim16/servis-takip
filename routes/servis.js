const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db, getAyar } = require('../services/db');
const { msgAlindi, msgTamamlandi, sendSafe } = require('../services/whatsapp');
const { sendMail, mailAlindiHtml, mailTamamlandiHtml } = require('../services/email');
const { servisFormHtml, topluListeHtml, htmlToPdf } = require('../services/pdf');
const path = require('path');
const fs = require('fs');

const TAKIP_URL = process.env.TAKIP_URL || 'https://kabilisim.com.tr/servis-takip';

// ── Bildirim gönder ───────────────────────────────────────────────────────────
async function bildirimGonder(tip, kayit, musteri) {
  if (!musteri) return;
  const kanal    = getAyar('bildirim_kanal', 'wa');
  const aktifKey = `bildirim_${tip}`;
  if (getAyar(aktifKey, '1') !== '1') return;

  const takipUrl = TAKIP_URL + '?telefon=' + encodeURIComponent(musteri.telefon || '');

  // WA
  if ((kanal === 'wa' || kanal === 'her') && musteri.telefon) {
    let mesaj;
    if (tip === 'alindi') {
      mesaj = msgAlindi(kayit.marka, kayit.model, kayit.cihaz_tipi, musteri.telefon);
    } else if (tip === 'tamamlandi') {
      mesaj = msgTamamlandi(kayit.marka, kayit.model, kayit.cihaz_tipi,
        kayit.ariza_tanimi, kayit.notlar, kayit.toplam_ucret, kayit.iade_tutari);
    }
    if (mesaj) {
      const sent = await sendSafe(musteri.telefon, mesaj, `servis-${tip}`);
      if (sent) {
        const field = tip === 'alindi' ? 'wa_alindi_at' : 'wa_tamamlandi_at';
        db.prepare(`UPDATE servis_kayitlari SET ${field}=CURRENT_TIMESTAMP WHERE id=?`).run(kayit.id);
      }
    }
  }

  // E-posta
  if ((kanal === 'mail' || kanal === 'her') && musteri.email) {
    let html, konu;
    if (tip === 'alindi') {
      html = mailAlindiHtml(kayit, musteri, takipUrl);
      konu = `${getAyar('firma_adi', 'Servis')} — Cihazınız Servise Alındı`;
    } else if (tip === 'tamamlandi') {
      html = mailTamamlandiHtml(kayit, musteri);
      konu = `${getAyar('firma_adi', 'Servis')} — Cihazınız Hazır!`;
    }
    if (html) {
      const sent = await sendMail({ to: musteri.email, subject: konu, html, tip });
      if (sent) {
        const field = tip === 'alindi' ? 'email_alindi_at' : 'email_tamamlandi_at';
        db.prepare(`UPDATE servis_kayitlari SET ${field}=CURRENT_TIMESTAMP WHERE id=?`).run(kayit.id);
      }
    }
  }
}

// ── GET /api/servis ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { durum, cihaz_tipi } = req.query;
  let q = `SELECT s.*,
    COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model,
    c.imei, m.ad||' '||COALESCE(m.soyad,'') as musteri_adi, m.telefon, m.email
    FROM servis_kayitlari s
    LEFT JOIN cihazlar c ON s.cihaz_id=c.id
    LEFT JOIN musteriler m ON s.musteri_id=m.id`;
  const p = []; const f = [];
  if (durum)      { f.push('s.durum=?'); p.push(durum); }
  if (cihaz_tipi) { f.push('s.cihaz_tipi=?'); p.push(cihaz_tipi); }
  if (f.length) q += ' WHERE ' + f.join(' AND ');
  q += ' ORDER BY s.created_at DESC';
  res.json(db.prepare(q).all(...p));
});

// ── GET /api/servis/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const kayit = db.prepare(`SELECT s.*,
    COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model,
    m.ad, m.soyad, m.telefon, m.email, m.adres
    FROM servis_kayitlari s
    LEFT JOIN cihazlar c ON s.cihaz_id=c.id
    LEFT JOIN musteriler m ON s.musteri_id=m.id
    WHERE s.id=?`).get(req.params.id);
  if (!kayit) return res.status(404).json({ hata: 'Bulunamadı' });
  res.json(kayit);
});

// ── POST /api/servis ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { cihaz_id, musteri_id, cihaz_tipi, marka, model,
    ariza_tanimi, teknisyen, parca_maliyeti, iscilik_maliyeti, teslim_tarihi, notlar } = req.body;
  if (!ariza_tanimi) return res.status(400).json({ hata: 'Arıza tanımı zorunlu' });

  const id = uuidv4();
  const toplam = (parseFloat(parca_maliyeti) || 0) + (parseFloat(iscilik_maliyeti) || 0);

  db.prepare(`INSERT INTO servis_kayitlari
    (id,cihaz_id,musteri_id,cihaz_tipi,marka,model,ariza_tanimi,teknisyen,
     parca_maliyeti,iscilik_maliyeti,toplam_ucret,teslim_tarihi,notlar)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, cihaz_id||null, musteri_id||null, cihaz_tipi||'telefon',
      marka||null, model||null, ariza_tanimi, teknisyen,
      parca_maliyeti||0, iscilik_maliyeti||0, toplam, teslim_tarihi, notlar);

  if (cihaz_id) db.prepare("UPDATE cihazlar SET durum='serviste' WHERE id=?").run(cihaz_id);

  const kayit = db.prepare('SELECT * FROM servis_kayitlari WHERE id=?').get(id);
  res.json(kayit);

  // Bildirim (async)
  if (musteri_id && getAyar('bildirim_alindi', '1') === '1') {
    const musteri = db.prepare('SELECT * FROM musteriler WHERE id=?').get(musteri_id);
    await bildirimGonder('alindi', kayit, musteri);
  }
});

// ── PUT /api/servis/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { durum, teknisyen, parca_maliyeti, iscilik_maliyeti,
    teslim_tarihi, notlar, ariza_tanimi, iade_tutari, cihaz_tipi } = req.body;
  const toplam = (parseFloat(parca_maliyeti) || 0) + (parseFloat(iscilik_maliyeti) || 0);
  const eskiKayit = db.prepare('SELECT * FROM servis_kayitlari WHERE id=?').get(req.params.id);

  db.prepare(`UPDATE servis_kayitlari
    SET durum=?,teknisyen=?,parca_maliyeti=?,iscilik_maliyeti=?,toplam_ucret=?,
        iade_tutari=?,teslim_tarihi=?,notlar=?,ariza_tanimi=?,cihaz_tipi=COALESCE(?,cihaz_tipi),
        updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(durum, teknisyen, parca_maliyeti||0, iscilik_maliyeti||0, toplam,
      iade_tutari||0, teslim_tarihi, notlar, ariza_tanimi, cihaz_tipi||null, req.params.id);

  const kayit = db.prepare('SELECT * FROM servis_kayitlari WHERE id=?').get(req.params.id);
  if (kayit?.cihaz_id && durum === 'tamamlandi')
    db.prepare("UPDATE cihazlar SET durum='stok' WHERE id=?").run(kayit.cihaz_id);

  res.json(kayit);

  // Tamamlandı bildirimi — sadece ilk kez
  if (durum === 'tamamlandi' && eskiKayit?.durum !== 'tamamlandi'
      && !eskiKayit?.wa_tamamlandi_at && !eskiKayit?.email_tamamlandi_at) {
    if (kayit?.musteri_id) {
      const musteri = db.prepare('SELECT * FROM musteriler WHERE id=?').get(kayit.musteri_id);
      await bildirimGonder('tamamlandi', kayit, musteri);
    }
  }
});

// ── DELETE /api/servis/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM servis_kayitlari WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/servis/wa/:id ───────────────────────────────────────────────────
router.post('/wa/:id', async (req, res) => {
  const { tip } = req.body;
  const kayit = db.prepare(`SELECT s.*, m.telefon, m.email, m.ad, m.soyad
    FROM servis_kayitlari s LEFT JOIN musteriler m ON s.musteri_id=m.id
    WHERE s.id=?`).get(req.params.id);
  if (!kayit) return res.status(404).json({ hata: 'Bulunamadı' });
  if (!kayit.telefon) return res.status(400).json({ hata: 'Müşteri telefonu yok' });

  const musteri = { telefon: kayit.telefon, email: kayit.email, ad: kayit.ad, soyad: kayit.soyad };
  // Geçici olarak bildirim kanalını WA'ya zorla
  const orijinalKanal = getAyar('bildirim_kanal');
  try {
    await bildirimGonder(tip, kayit, musteri);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

// ── GET /api/servis/pdf/:id — Tek servis PDF ──────────────────────────────────
router.get('/pdf/:id', async (req, res) => {
  const kayit = db.prepare(`SELECT s.*,
    COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model
    FROM servis_kayitlari s LEFT JOIN cihazlar c ON s.cihaz_id=c.id
    WHERE s.id=?`).get(req.params.id);
  if (!kayit) return res.status(404).json({ hata: 'Bulunamadı' });

  const musteri = kayit.musteri_id
    ? db.prepare('SELECT * FROM musteriler WHERE id=?').get(kayit.musteri_id)
    : null;

  try {
    const html = servisFormHtml(kayit, musteri);
    const dosya = `servis-${kayit.id.slice(-6)}-${Date.now()}.pdf`;
    const filePath = await htmlToPdf(html, dosya);
    res.download(filePath, `Servis-SRV-${kayit.id.slice(-6).toUpperCase()}.pdf`, () => {
      setTimeout(() => fs.unlink(filePath, () => {}), 5000);
    });
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

// ── POST /api/servis/pdf/toplu — Toplu PDF ───────────────────────────────────
router.post('/pdf/toplu', async (req, res) => {
  const { ids, durum, baslik } = req.body;
  let kayitlar;
  if (ids?.length) {
    kayitlar = ids.map(id => db.prepare(`SELECT s.*,
      COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model,
      m.ad||' '||COALESCE(m.soyad,'') as musteri_adi
      FROM servis_kayitlari s
      LEFT JOIN cihazlar c ON s.cihaz_id=c.id
      LEFT JOIN musteriler m ON s.musteri_id=m.id
      WHERE s.id=?`).get(id)).filter(Boolean);
  } else {
    let q = `SELECT s.*, COALESCE(s.marka,c.marka) as marka, COALESCE(s.model,c.model) as model,
      m.ad||' '||COALESCE(m.soyad,'') as musteri_adi
      FROM servis_kayitlari s
      LEFT JOIN cihazlar c ON s.cihaz_id=c.id
      LEFT JOIN musteriler m ON s.musteri_id=m.id`;
    if (durum && durum !== 'hepsi') q += ` WHERE s.durum='${durum}'`;
    q += ' ORDER BY s.created_at DESC';
    kayitlar = db.prepare(q).all();
  }

  try {
    const html = topluListeHtml(kayitlar, baslik || 'Servis Listesi');
    const dosya = `toplu-${Date.now()}.pdf`;
    const filePath = await htmlToPdf(html, dosya);
    res.download(filePath, `Servis-Listesi-${new Date().toLocaleDateString('tr-TR').replace(/\./g,'-')}.pdf`, () => {
      setTimeout(() => fs.unlink(filePath, () => {}), 5000);
    });
  } catch(e) {
    res.status(500).json({ hata: e.message });
  }
});

module.exports = router;
