# TekServis Panel

Teknik servis yönetim paneli — servis takip, cihaz stok, IMEI sorgulama.

## Kurulum

```bash
# Şifreyi ayarla (zorunlu)
cp .env.example .env
nano .env   # PANEL_PASSWORD değiştir

# Docker ile başlat
docker-compose up -d
```

Panel: http://localhost:3002

## Şifre Değiştirme

`.env` dosyasında `PANEL_PASSWORD` değerini değiştirip container'ı restart et:
```bash
docker-compose restart
```

## Notlar

- Session süresi: 8 saat (sliding)
- Login deneme limiti: 15 dakikada 10 deneme
- Müşteri takip sayfası (`/api/takip`) auth gerektirmez (müşteri erişimi)
- DB: `data/servis.db` — volume mount ile kalıcı
