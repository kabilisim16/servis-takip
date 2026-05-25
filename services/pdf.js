const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { getAyar } = require('./db');

const EXPORT_DIR = path.join(__dirname, '../public/exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

function fiyat(n) {
  return Number(n || 0).toLocaleString('tr-TR') + ' ₺';
}
function fmt(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('tr-TR');
}

const durumTR = {
  beklemede: 'Beklemede',
  incelemede: 'İncelemede',
  tamir_asamasinda: 'Tamir Aşamasında',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};

function servisFormHtml(kayit, musteri) {
  const firmaAdi   = getAyar('firma_adi', 'Teknik Servis');
  const firmaAdres = getAyar('firma_adres', '');
  const firmaTel   = getAyar('firma_telefon', '');
  const firmaMail  = getAyar('firma_email', '');

  const tipIkon = { telefon: '📱', tablet: '📟', bilgisayar: '💻', diger: '📦' };

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 28px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:16px; border-bottom:2px solid #4f7cff; margin-bottom:16px; }
  .firma-adi { font-size:22px; font-weight:700; color:#4f7cff; }
  .firma-bilgi { font-size:11px; color:#666; margin-top:4px; line-height:1.7; }
  .servis-no { text-align:right; }
  .servis-no .no { font-size:18px; font-weight:700; color:#4f7cff; }
  .servis-no .tarih { font-size:11px; color:#666; margin-top:4px; }
  .section { margin-bottom:14px; }
  .section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#4f7cff; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #e8efff; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .field { background:#f8f9ff; padding:8px 10px; border-radius:6px; border-left:3px solid #4f7cff; }
  .field-label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; }
  .field-value { font-size:13px; font-weight:600; color:#1a1a2e; }
  .ariza-box { background:#f8f9ff; border:1px solid #e8efff; border-radius:6px; padding:12px; min-height:60px; font-size:13px; line-height:1.6; }
  .notlar-box { background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px; min-height:40px; font-size:13px; line-height:1.6; }
  .ucret-tablo { width:100%; border-collapse:collapse; margin-top:8px; }
  .ucret-tablo td { padding:8px 10px; border-bottom:1px solid #eee; font-size:13px; }
  .ucret-tablo .toplam td { font-weight:700; font-size:15px; border-top:2px solid #4f7cff; border-bottom:none; color:#4f7cff; }
  .durum-badge { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px; font-weight:700; }
  .durum-tamamlandi { background:#dcfce7; color:#16a34a; }
  .durum-beklemede { background:#f1f5f9; color:#64748b; }
  .durum-incelemede { background:#e8f0ff; color:#4f7cff; }
  .durum-tamir_asamasinda { background:#fef3c7; color:#d97706; }
  .durum-iptal { background:#fee2e2; color:#dc2626; }
  .imza-alani { display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-top:24px; }
  .imza-box { border-top:1px solid #ccc; padding-top:8px; text-align:center; font-size:11px; color:#888; }
  .footer { margin-top:20px; padding-top:12px; border-top:1px solid #eee; text-align:center; font-size:10px; color:#aaa; }
  .badge-cihaz { display:inline-block; background:#e8f0ff; color:#4f7cff; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; }
  @media print { body { padding: 14px; } }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="firma-adi">⚡ ${firmaAdi}</div>
    <div class="firma-bilgi">
      ${firmaAdres ? firmaAdres + '<br>' : ''}
      ${firmaTel ? '📞 ' + firmaTel : ''}
      ${firmaMail ? ' · ✉ ' + firmaMail : ''}
    </div>
  </div>
  <div class="servis-no">
    <div class="no">SRV-${kayit.id.slice(-6).toUpperCase()}</div>
    <div class="tarih">Tarih: ${fmt(kayit.created_at)}</div>
    <div style="margin-top:6px">
      <span class="durum-badge durum-${kayit.durum}">${durumTR[kayit.durum] || kayit.durum}</span>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Müşteri Bilgileri</div>
  <div class="grid3">
    <div class="field">
      <div class="field-label">Ad Soyad</div>
      <div class="field-value">${musteri ? musteri.ad + ' ' + (musteri.soyad || '') : '—'}</div>
    </div>
    <div class="field">
      <div class="field-label">Telefon</div>
      <div class="field-value">${musteri?.telefon || '—'}</div>
    </div>
    <div class="field">
      <div class="field-label">E-posta</div>
      <div class="field-value">${musteri?.email || '—'}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Cihaz Bilgileri</div>
  <div class="grid3">
    <div class="field">
      <div class="field-label">Cihaz Tipi</div>
      <div class="field-value"><span class="badge-cihaz">${tipIkon[kayit.cihaz_tipi || 'telefon'] || '📱'} ${kayit.cihaz_tipi || 'Telefon'}</span></div>
    </div>
    <div class="field">
      <div class="field-label">Marka / Model</div>
      <div class="field-value">${kayit.marka || '—'} ${kayit.model || ''}</div>
    </div>
    <div class="field">
      <div class="field-label">Tahmini Teslim</div>
      <div class="field-value">${kayit.teslim_tarihi || '—'}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Arıza Tanımı</div>
  <div class="ariza-box">${kayit.ariza_tanimi}</div>
</div>

${kayit.notlar ? `
<div class="section">
  <div class="section-title">Notlar</div>
  <div class="notlar-box">${kayit.notlar}</div>
</div>` : ''}

<div class="section">
  <div class="section-title">Ücret Bilgisi</div>
  <table class="ucret-tablo">
    <tr><td>Parça Maliyeti</td><td style="text-align:right">${fiyat(kayit.parca_maliyeti)}</td></tr>
    <tr><td>İşçilik Maliyeti</td><td style="text-align:right">${fiyat(kayit.iscilik_maliyeti)}</td></tr>
    ${kayit.durum === 'iptal' ? `
    <tr class="toplam"><td>${kayit.iade_tutari > 0 ? 'İade Tutarı' : 'Ücret Alınmadı'}</td>
      <td style="text-align:right">${kayit.iade_tutari > 0 ? fiyat(kayit.iade_tutari) : '0 ₺'}</td></tr>
    ` : `
    <tr class="toplam"><td>TOPLAM</td><td style="text-align:right">${fiyat(kayit.toplam_ucret)}</td></tr>
    `}
  </table>
</div>

<div class="imza-alani">
  <div class="imza-box">Teknisyen İmzası: ${kayit.teknisyen || ''}<br><br><br></div>
  <div class="imza-box">Müşteri İmzası / Tarih:<br><br><br></div>
</div>

<div class="footer">
  ${firmaAdi} · Servis No: SRV-${kayit.id.slice(-6).toUpperCase()} · ${fmt(kayit.created_at)}
</div>

</body></html>`;
}

function topluListeHtml(kayitlar, baslik = 'Servis Listesi') {
  const firmaAdi = getAyar('firma_adi', 'Teknik Servis');
  const rows = kayitlar.map(k => `
    <tr>
      <td>SRV-${k.id.slice(-6).toUpperCase()}</td>
      <td>${fmt(k.created_at)}</td>
      <td>${k.musteri_adi || '—'}</td>
      <td>${k.marka || ''} ${k.model || ''}</td>
      <td>${k.ariza_tanimi?.slice(0, 40)}${k.ariza_tanimi?.length > 40 ? '...' : ''}</td>
      <td><span class="durum-badge durum-${k.durum}">${durumTR[k.durum] || k.durum}</span></td>
      <td style="text-align:right">${k.durum === 'iptal' ? (k.iade_tutari > 0 ? fiyat(k.iade_tutari) : '0 ₺') : fiyat(k.toplam_ucret)}</td>
    </tr>`).join('');
  const toplam = kayitlar.reduce((s, k) => s + (k.durum !== 'iptal' ? (k.toplam_ucret || 0) : 0), 0);

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8">
<style>
  body { font-family:Arial,sans-serif; font-size:12px; padding:20px; color:#1a1a2e; }
  h1 { font-size:18px; color:#4f7cff; margin-bottom:4px; }
  .meta { color:#888; font-size:11px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#4f7cff; color:#fff; padding:8px 10px; text-align:left; font-size:11px; text-transform:uppercase; }
  td { padding:7px 10px; border-bottom:1px solid #eee; }
  tr:nth-child(even) td { background:#f8f9ff; }
  .toplam-row td { font-weight:700; border-top:2px solid #4f7cff; font-size:13px; }
  .durum-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; }
  .durum-tamamlandi { background:#dcfce7; color:#16a34a; }
  .durum-beklemede { background:#f1f5f9; color:#64748b; }
  .durum-incelemede { background:#e8f0ff; color:#4f7cff; }
  .durum-tamir_asamasinda { background:#fef3c7; color:#d97706; }
  .durum-iptal { background:#fee2e2; color:#dc2626; }
</style></head>
<body>
<h1>⚡ ${firmaAdi} — ${baslik}</h1>
<div class="meta">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')} · Toplam: ${kayitlar.length} kayıt</div>
<table>
  <tr>
    <th>Servis No</th><th>Tarih</th><th>Müşteri</th><th>Cihaz</th>
    <th>Arıza</th><th>Durum</th><th>Tutar</th>
  </tr>
  ${rows}
  <tr class="toplam-row">
    <td colspan="6">TOPLAM (Tamamlanan)</td>
    <td style="text-align:right">${fiyat(toplam)}</td>
  </tr>
</table>
</body></html>`;
}

async function htmlToPdf(html, dosyaAdi) {
  const filePath = path.join(EXPORT_DIR, dosyaAdi);
  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      headless: true
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: filePath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    return filePath;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { servisFormHtml, topluListeHtml, htmlToPdf };
