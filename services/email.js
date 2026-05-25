const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { db, getAyar } = require('./db');

function getTransporter() {
  const host = getAyar('smtp_host');
  const port = parseInt(getAyar('smtp_port', '587'));
  const user = getAyar('smtp_user');
  const pass = getAyar('smtp_pass');
  const ssl  = getAyar('smtp_ssl', '0') === '1';

  if (!host || !user || !pass) throw new Error('SMTP ayarları eksik');

  return nodemailer.createTransport({
    host, port,
    secure: ssl,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

async function sendMail({ to, subject, html, tip = 'genel' }) {
  const fromName = getAyar('smtp_from', 'Teknik Servis');
  const fromMail = getAyar('smtp_user');
  const logId = uuidv4();

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"${fromName}" <${fromMail}>`,
      to, subject, html
    });
    db.prepare('INSERT INTO email_log (id,alici,konu,tip,durum) VALUES (?,?,?,?,?)')
      .run(logId, to, subject, tip, 'gonderildi');
    console.log(`[MAIL] ✓ ${tip} → ${to}`);
    return true;
  } catch(e) {
    db.prepare('INSERT INTO email_log (id,alici,konu,tip,durum,hata) VALUES (?,?,?,?,?,?)')
      .run(logId, to, subject, tip, 'hata', e.message);
    console.error(`[MAIL] ✗ ${tip} → ${e.message}`);
    return false;
  }
}

function mailAlindiHtml(kayit, musteri, takipUrl) {
  const firmaAdi  = getAyar('firma_adi', 'Teknik Servis');
  const firmaTel  = getAyar('firma_telefon', '');
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;overflow:hidden}
  .header{background:#4f7cff;color:#fff;padding:24px;text-align:center}
  .header h1{margin:0;font-size:20px}
  .body{padding:24px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
  .label{color:#888}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;background:#e8f0ff;color:#4f7cff;font-size:12px;font-weight:600}
  .btn{display:block;background:#4f7cff;color:#fff;text-decoration:none;padding:12px;text-align:center;border-radius:8px;margin-top:20px;font-weight:600}
  .footer{text-align:center;font-size:12px;color:#aaa;padding:16px}
</style></head>
<body>
<div class="card">
  <div class="header"><h1>⚡ ${firmaAdi}</h1><p style="margin:4px 0 0;opacity:.85">Servis Bilgilendirmesi</p></div>
  <div class="body">
    <p>Sayın <strong>${musteri.ad} ${musteri.soyad || ''}</strong>,</p>
    <p><strong>${kayit.marka || ''} ${kayit.model || ''}</strong> cihazınız servisimize alınmıştır.</p>
    <div class="row"><span class="label">Arıza</span><span>${kayit.ariza_tanimi}</span></div>
    <div class="row"><span class="label">Durum</span><span class="badge">Servise Alındı</span></div>
    <div class="row"><span class="label">Tarih</span><span>${new Date(kayit.created_at).toLocaleDateString('tr-TR')}</span></div>
    ${kayit.teslim_tarihi ? `<div class="row"><span class="label">Tahmini Teslim</span><span>${kayit.teslim_tarihi}</span></div>` : ''}
    <a href="${takipUrl}" class="btn">🔗 Servis Durumunu Takip Et</a>
  </div>
  <div class="footer">${firmaAdi}${firmaTel ? ' · ' + firmaTel : ''}</div>
</div>
</body></html>`;
}

function mailTamamlandiHtml(kayit, musteri) {
  const firmaAdi = getAyar('firma_adi', 'Teknik Servis');
  const firmaTel = getAyar('firma_telefon', '');
  const gmbLink  = getAyar('firma_gmb_link', '');
  const iadeStr  = kayit.iade_tutari > 0
    ? `<div class="row"><span class="label">İade Tutarı</span><span style="color:#f59e0b;font-weight:600">${Number(kayit.iade_tutari).toLocaleString('tr-TR')} ₺</span></div>`
    : `<div class="row"><span class="label">Toplam Ücret</span><span style="color:#22c55e;font-weight:600">${Number(kayit.toplam_ucret).toLocaleString('tr-TR')} ₺</span></div>`;
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:10px;max-width:520px;margin:0 auto;overflow:hidden}
  .header{background:#22c55e;color:#fff;padding:24px;text-align:center}
  .header h1{margin:0;font-size:20px}
  .body{padding:24px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
  .label{color:#888}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;background:#dcfce7;color:#22c55e;font-size:12px;font-weight:600}
  .btn{display:block;color:#fff;text-decoration:none;padding:12px;text-align:center;border-radius:8px;margin-top:12px;font-weight:600}
  .footer{text-align:center;font-size:12px;color:#aaa;padding:16px}
</style></head>
<body>
<div class="card">
  <div class="header"><h1>✅ ${firmaAdi}</h1><p style="margin:4px 0 0;opacity:.85">Cihazınız Hazır!</p></div>
  <div class="body">
    <p>Sayın <strong>${musteri.ad} ${musteri.soyad || ''}</strong>,</p>
    <p><strong>${kayit.marka || ''} ${kayit.model || ''}</strong> cihazınızın servisi tamamlanmıştır.</p>
    <div class="row"><span class="label">Yapılan İşlem</span><span>${kayit.ariza_tanimi}</span></div>
    ${kayit.notlar ? `<div class="row"><span class="label">Notlar</span><span>${kayit.notlar}</span></div>` : ''}
    <div class="row"><span class="label">Durum</span><span class="badge">Tamamlandı ✓</span></div>
    ${iadeStr}
    ${gmbLink ? `<a href="${gmbLink}" class="btn" style="background:#4285f4">⭐ Google'da Yorumunuzu Bırakın</a>` : ''}
    <a href="tel:${firmaTel}" class="btn" style="background:#4f7cff;margin-top:8px">📞 Teslim İçin Arayın</a>
  </div>
  <div class="footer">${firmaAdi}${firmaTel ? ' · ' + firmaTel : ''}</div>
</div>
</body></html>`;
}

async function testMail(to) {
  const firmaAdi = getAyar('firma_adi', 'Teknik Servis');
  return sendMail({
    to, tip: 'test',
    subject: `${firmaAdi} — Test Maili`,
    html: `<div style="font-family:Arial;padding:20px"><h2>✅ Mail sistemi çalışıyor</h2><p>Bu bir test mailidir.</p></div>`
  });
}

module.exports = { sendMail, mailAlindiHtml, mailTamamlandiHtml, testMail };
