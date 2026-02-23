# Vercel ile Deploy Rehberi

## 🚀 Hızlı Deploy (5 Dakika)

### Adım 1: Vercel CLI ile Giriş

```powershell
vercel login
```

**Seçenekler:**
- Email ile giriş (kod gönderilir)
- GitHub ile giriş (önerilen)
- GitLab
- Bitbucket

### Adım 2: Deploy

```powershell
# Proje dizininde
cd C:\Users\ttrob\Documents\verdent-projects\senkronV2

# İlk deploy
vercel
```

**Sorular:**
1. "Set up and deploy?" → **Y**
2. "Which scope?" → Hesabınızı seçin
3. "Link to existing project?" → **N** (ilk defa)
4. "What's your project's name?" → **senkronv2** (veya istediğiniz)
5. "In which directory is your code located?" → **./** (Enter)
6. "Want to modify settings?" → **N**

**Sonuç:**
```
✅ Production: https://senkronv2.vercel.app
```

### Adım 3: Production Deploy

```powershell
# Production'a deploy (optimize edilmiş)
vercel --prod
```

## 🌐 Özel Domain Bağlama (Opsiyonel)

### Adım 1: Domain Alın

**Türkiye Domain Sağlayıcıları:**
- **DomainRacer.com** - .com.tr: 50-100 TL/yıl
- **NameCheap.com** - .com: $10/yıl (~350 TL)
- **Godaddy.com** - .com: $12/yıl
- **Natro.com** - .com.tr: 89 TL/yıl

**Önerilen Domain:**
- `senkron.app` veya `senkron.io` (modern)
- `senkronv2.com` (klasik)
- `okulpanel.com` (açıklayıcı)

### Adım 2: Vercel'de Domain Ekle

1. Vercel Dashboard → Proje seç → Settings → Domains
2. Domain adını girin: `example.com`
3. "Add" tıklayın

### Adım 3: DNS Ayarları

Domain sağlayıcınızda (Natro, GoDaddy vb.):

**A Record:**
```
Type: A
Name: @
Value: 76.76.21.21
```

**CNAME Record:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Bekleme:** 5-60 dakika (DNS yayılımı)

## ⚙️ vercel.json Yapılandırması

Projenize `vercel.json` ekleyin:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ],
  "env": {
    "VITE_SUPABASE_URL": "@supabase_url",
    "VITE_SUPABASE_ANON_KEY": "@supabase_anon_key"
  }
}
```

## 🔐 Environment Variables

Vercel Dashboard → Proje → Settings → Environment Variables:

```
VITE_SUPABASE_URL = https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GEMINI_API_KEY = AIzaSyXXXXXXXXXXXXXXXXXXXXXXX
```

## 🔄 Otomatik Deploy (Git)

### GitHub ile Bağla

1. GitHub'da repo oluşturun
2. Vercel Dashboard → "Import Project"
3. GitHub repo seçin
4. Otomatik deploy aktif!

**Artık her git push otomatik deploy olur:**
```powershell
git add .
git commit -m "update"
git push
```

→ Vercel otomatik build ve deploy eder! ✅

## 📊 Vercel Limitleri (Ücretsiz)

| Özellik | Ücretsiz Plan |
|---------|---------------|
| Bandwidth | 100 GB/ay |
| Build Time | 6000 dakika/ay |
| Projeler | Sınırsız |
| Team Members | 1 |
| Domain | Sınırsız |
| HTTPS | ✅ Otomatik |
| CDN | ✅ Global |

**Not:** Okul projesi için 100 GB fazlasıyla yeterli!

## 🚀 Deploy Komutları

```powershell
# Development preview
vercel

# Production deploy
vercel --prod

# Alias ekle
vercel alias set senkronv2-xyz.vercel.app senkron.vercel.app

# Logs izle
vercel logs senkronv2

# Proje listesi
vercel list

# Proje sil
vercel remove senkronv2
```

## ✨ Bonus: Preview Deployments

Her git branch için otomatik preview URL:

```
main branch → https://senkronv2.vercel.app
feature-x → https://senkronv2-git-feature-x.vercel.app
```

Test için mükemmel! 🎯

## 📱 Mobil Test

QR kod oluşturun:
```
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://senkronv2.vercel.app
```

## 🔍 Analytics (Opsiyonel)

Vercel Analytics (ücretsiz):
```powershell
npm install @vercel/analytics
```

```typescript
// src/main.tsx
import { Analytics } from '@vercel/analytics/react';

<Analytics />
```

## 📞 Destek

- Dashboard: https://vercel.com/dashboard
- Docs: https://vercel.com/docs
- Status: https://vercel-status.com
- Discord: https://vercel.com/discord

Deploy başarılı olunca link'i buraya yapıştırın! 🎉
