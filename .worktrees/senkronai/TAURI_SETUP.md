# Tauri ile Masaüstü Uygulamaya Dönüştürme

## Özellikler
✅ Electron'dan 10x daha küçük (3-5 MB)
✅ Daha hızlı başlatma
✅ Daha az bellek kullanımı
✅ Native sistem API'leri
✅ Windows, Mac, Linux

## 1. Gereksinimler

**Windows:**
```powershell
# Microsoft C++ Build Tools kurulu olmalı
# Rust kurulu olmalı: https://rustup.rs/

# Rust kurulumu:
winget install Rustlang.Rustup
```

## 2. Tauri CLI Kurun

```powershell
npm install --save-dev @tauri-apps/cli
```

## 3. Tauri Başlat

```powershell
npx tauri init
```

**Sorular:**
- App name: `Senkron V2`
- Window title: `Senkron V2 - Bulut Modu`
- Web assets location: `../dist`
- Dev server URL: `http://localhost:3000`
- Dev server command: `npm run dev`
- Build command: `npm run build`

## 4. package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

## 5. tauri.conf.json Ayarları

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:3000",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Senkron V2",
    "version": "2.5.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "window": {
        "all": false,
        "close": true,
        "hide": true,
        "show": true,
        "maximize": true,
        "minimize": true
      }
    },
    "bundle": {
      "active": true,
      "category": "Education",
      "copyright": "",
      "deb": {
        "depends": []
      },
      "externalBin": [],
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.senkron.app",
      "longDescription": "",
      "macOS": {
        "entitlements": null,
        "exceptionDomain": "",
        "frameworks": [],
        "providerShortName": null,
        "signingIdentity": null
      },
      "resources": [],
      "shortDescription": "",
      "targets": "all",
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": ""
      }
    },
    "security": {
      "csp": null
    },
    "updater": {
      "active": false
    },
    "windows": [
      {
        "fullscreen": false,
        "height": 800,
        "resizable": true,
        "title": "Senkron V2",
        "width": 1280,
        "minWidth": 1024,
        "minHeight": 768
      }
    ]
  }
}
```

## 6. İkonlar Oluşturun

```powershell
npx @tauri-apps/cli icon path/to/icon.png
```

Bu otomatik olarak tüm platform ikonlarını oluşturur.

## 7. Çalıştırma

**Development:**
```powershell
npm run tauri:dev
```

**Production Build:**
```powershell
npm run tauri:build
```

## 8. Çıktılar

**Windows:**
- `src-tauri/target/release/bundle/msi/Senkron-V2_2.5.0_x64.msi` (Installer)
- `src-tauri/target/release/bundle/nsis/Senkron-V2_2.5.0_x64-setup.exe`

**Dosya Boyutu:**
- Electron: ~150-200 MB
- Tauri: ~3-8 MB ✅

## 9. Rust Backend (Opsiyonel)

`src-tauri/src/main.rs` - Rust fonksiyonları ekleyebilirsiniz:

```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Merhaba, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Frontend'den çağırma:**
```typescript
import { invoke } from '@tauri-apps/api/tauri';

const message = await invoke('greet', { name: 'Senkron' });
```

## Avantajlar vs Electron

| Özellik | Tauri | Electron |
|---------|-------|----------|
| Boyut | 3-8 MB | 150-200 MB |
| RAM | ~50 MB | ~200-500 MB |
| Hız | ⚡ Hızlı | Orta |
| Backend | Rust | Node.js |

## Sınırlamalar

- ❌ Rust öğrenme eğrisi
- ❌ Daha az community plugin
- ✅ Ama çok daha hafif ve hızlı!
