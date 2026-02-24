# LGS ve YKS Sınav Yapısı: Kitapçık Grupları ve Soru Sayıları

Türkiye'deki merkezi sınavlarda kopya riskini minimize etmek ve ölçme güvenliğini sağlamak amacıyla belirli bir kitapçık ve soru düzeni izlenir.

## 1. Kitapçık Grupları (Türleri)

Sınavlarda soruların içeriği aynı kalmakla birlikte, **soruların ve şıkların yerleri** değiştirilerek farklı kitapçık türleri oluşturulur.

* **Merkezi Sınavlar (LGS & YKS):** Genellikle **A ve B** olmak üzere 2 farklı kitapçık grubu kullanılır.
* **Türkiye Geneli Denemeler (ÖZDEBİR, TÖDER vb.):** Genelde **A ve B** kitapçığı kullanılır.
* **Bazı Özel Kurumsal Denemeler:** Nadiren de olsa **A, B, C ve D** olmak üzere 4 farklı grup yapılabilir.

> **Senkron Geliştirici Notu:** AI OCR sistemi, öğrencinin işaretlediği kitapçık türünü (A veya B) optik form üzerinden doğru okumalıdır. Aksi takdirde cevap anahtarı yanlış eşleşeceği için net hesaplaması hatalı olacaktır.

---

## 2. Soru Sayıları ve Dağılımları

### A. LGS (Liselere Geçiş Sistemi) - Ortaokul 8. Sınıf
LGS iki oturumdan oluşur ve toplamda **90 soru** sorulur.

| Oturum | Ders | Soru Sayısı | Toplam Soru | Süre |
| :--- | :--- | :---: | :---: | :---: |
| **Sözel** | Türkçe | 20 | | |
| | T.C. İnkılap Tarihi | 10 | **50 Soru** | 75 Dakika |
| | Din Kültürü | 10 | | |
| | İngilizce | 10 | | |
| **Sayısal** | Matematik | 20 | **40 Soru** | 80 Dakika |
| | Fen Bilimleri | 20 | | |

---

### B. YKS (Yükseköğretim Kurumları Sınavı) - Lise 12. Sınıf & Mezun
Üniversiteye giriş sınavı üç farklı oturumdan oluşur.

#### 1. Oturum: TYT (Temel Yeterlilik Testi) - Herkes İçin Zorunlu
| Ders Alanı | Soru Sayısı | İçerik |
| :--- | :---: | :--- |
| **Türkçe** | 40 | Dil bilgisi ve paragraf |
| **Sosyal Bilimler** | 20 | Tarih (5), Coğrafya (5), Felsefe (5), Din (5) |
| **Temel Matematik** | 40 | Geometri dahil temel matematik |
| **Fen Bilimleri** | 20 | Fizik (7), Kimya (7), Biyoloji (6) |
| **TOPLAM** | **120 Soru** | **Süre: 165 Dakika** |

#### 2. Oturum: AYT (Alan Yeterlilik Testleri)
Öğrenci kendi alanına göre (Sayısal, Sözel, Eşit Ağırlık) soruları çözer. Her test **40 sorudur**.
* **Matematik Testi:** 40 Soru
* **Fen Bilimleri Testi:** 40 Soru (Fizik 14, Kimya 13, Biyoloji 13)
* **Türk Dili ve Ed. - Sosyal 1:** 40 Soru
* **Sosyal Bilimler 2:** 40 Soru

#### 3. Oturum: YDT (Yabancı Dil Testi)
* **Toplam:** 80 Soru
* **Süre:** 120 Dakika

---

## 3. Özet Tablo: Uygulama İçin Veri Girişi

| Sınav Adı | Toplam Soru | Oturum Sayısı | Kitapçık Türü |
| :--- | :---: | :---: | :---: |
| **LGS** | 90 | 2 | A, B |
| **TYT** | 120 | 1 | A, B |
| **AYT** | 160 (Max) | 1 | A, B |
| **YDT** | 80 | 1 | A, B |