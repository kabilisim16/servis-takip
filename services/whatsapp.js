const { getAyar } = require('./db');

const WPP_URL    = process.env.WPP_URL    || 'http://wa-service:21465';
const WPP_SECRET = process.env.WPP_SECRET || 'servisWppKey2025';
const TAKIP_URL  = process.env.TAKIP_URL  || 'https://kabilisim.com.tr/servis-takip';

function waNumFormat(telefon) {
  if (!telefon) return null;
  const t = telefon.replace(/[^0-9]/g, '');
  if (t.startsWith('90') && t.length === 12) return t;
  if (t.startsWith('0')  && t.length === 11) return '90' + t.slice(1);
  if (t.length === 10) return '90' + t;
  return t;
}

async function wppSendMessage(telefon, mesaj) {
  const phone = waNumFormat(telefon);
  if (!phone) throw new Error('Geçersiz telefon numarası');
  const res = await fetch(`${WPP_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WPP_SECRET}` },
    body: JSON.stringify({ phone, message: mesaj })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `WA gönderim hatası: ${res.status}`);
  }
  return res.json();
}

async function wppStatus() {
  try {
    const res = await fetch(`${WPP_URL}/status`, {
      headers: { 'Authorization': `Bearer ${WPP_SECRET}` }
    });
    return await res.json();
  } catch(e) {
    return { status: 'error', message: e.message };
  }
}

async function wppQR() {
  const res = await fetch(`${WPP_URL}/qr`, {
    headers: { 'Authorization': `Bearer ${WPP_SECRET}` }
  });
  return res.json();
}

function cihazAdi(tip) {
  return tip === 'bilgisayar' ? 'Bilgisayarınız' :
         tip === 'tablet'     ? 'Tabletiniz'     : 'Cihazınız';
}

function msgAlindi(marka, model, cihazTipi, telefon) {
  const firmaAdi = getAyar('firma_adi', 'Teknik Servis');
  const takipUrl = TAKIP_URL + '?telefon=' + encodeURIComponent(telefon);
  return `⚡ *${firmaAdi}*\n\n` +
    `📱 *${marka || ''} ${model || ''}* ${cihazAdi(cihazTipi)} servise alındı.\n\n` +
    `Servis sürecinizi takip etmek için:\n🔗 ${takipUrl}\n\n` +
    `_Herhangi bir sorunuz için bizi arayabilirsiniz._`;
}

function msgTamamlandi(marka, model, cihazTipi, ariza, notlar, toplam, iade) {
  const firmaAdi = getAyar('firma_adi', 'Teknik Servis');
  const iadeStr = iade > 0
    ? `💸 *İade Tutarı:* ${Number(iade).toLocaleString('tr-TR')} ₺`
    : `💰 *Toplam Ücret:* ${Number(toplam).toLocaleString('tr-TR')} ₺`;
  return `✅ *${firmaAdi}*\n\n` +
    `*${marka || ''} ${model || ''}* ${cihazAdi(cihazTipi)} hazır!\n\n` +
    `🔧 *Yapılan İşlem:* ${ariza}\n` +
    (notlar ? `📝 *Notlar:* ${notlar}\n` : '') +
    `${iadeStr}\n\n` +
    `Cihazınızı teslim almak için bizi arayabilirsiniz.\n_${firmaAdi}_`;
}

async function sendSafe(telefon, mesaj, logLabel) {
  try {
    await wppSendMessage(telefon, mesaj);
    console.log(`[WA] ✓ ${logLabel} → ${telefon}`);
    return true;
  } catch(e) {
    console.error(`[WA] ✗ ${logLabel} → ${e.message}`);
    return false;
  }
}

module.exports = { wppSendMessage, wppStatus, wppQR, msgAlindi, msgTamamlandi, sendSafe, waNumFormat };
