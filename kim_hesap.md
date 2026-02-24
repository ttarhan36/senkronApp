# Deneme Sınavlarında Puanlama ve Veri İşleme Süreci

Deneme sınavlarında puanların hesaplanması, sınavın türüne ve uygulandığı merkeze göre farklılık gösterir. Bu süreç genellikle "Ölçme ve Değerlendirme" birimleri tarafından yönetilir.

## 1. Puanlamayı Kim/Ne Hesaplar?

Puanlama süreci insan eliyle değil, tamamen yazılımsal sistemler aracılığıyla gerçekleştirilir:

* **Optik Okuyucu Cihazlar:** Sınav bittikten sonra optik formlar, yüksek hızlı tarayıcılara (Optik Okuyucu) verilir. Bu cihazlar form üzerindeki siyah işaretlemeleri sayısal veriye dönüştürür.
* **Ölçme-Değerlendirme Yazılımları:** Optik cihazdan gelen ham veriler (Örn: 1-A, 2-B, 3-Boş), özel yazılımlara aktarılır. Bu yazılımlar; doğru, yanlış ve boş sayılarını hesaplayarak ilgili sınavın puanlama formülüne göre (LGS veya YKS katsayıları) nihai puanı üretir.
* **Yayınevi Portalları:** Eğer sınav Türkiye geneli bir deneme ise (Özdebir, TÖDER vb.), veriler ilgili kurumun bulut sistemine yüklenir ve tüm Türkiye'deki öğrencilerle karşılaştırılarak **yüzdelik dilim** ve **sıralama** hesaplanır.

---

## 2. Puanlama Formülü ve Katsayılar

Puanlama, sadece doğru sayısına bakılarak yapılmaz. Türkiye'deki sistemde **"3 yanlış 1 doğruyu götürür"** kuralı (LGS ve YKS için) geçerlidir.

### Net Hesaplama Formülü:
$$Net Sayısı = Doğru Sayısı - (Yanlış Sayısı / 3)$$

### Puan Hesaplama:
Her dersin ağırlığı (katsayısı) farklıdır. Örneğin LGS'de:
* **Türkçe, Matematik, Fen Bilimleri:** 4 katsayı ile çarpılır.
* **İnkılap, Din, İngilizce:** 1 katsayı ile çarpılır.



---

## 3. Senkron ve Benzeri Uygulamaların Rolü

Senkron gibi mobil tabanlı AI OCR sistemleri, geleneksel optik okuyucu cihazlara olan ihtiyacı ortadan kaldırır:

1.  **Görüntü İşleme:** Öğrenci, sınav kağıdının veya optik formun fotoğrafını çeker.
2.  **Yapay Zeka Analizi:** Uygulama içindeki yapay zeka, işaretlenen şıkları "0" ve "1" verisine dönüştürür.
3.  **Anlık Hesaplama:** Uygulama, önceden tanımlanmış katsayıları kullanarak sonucu saniyeler içinde kullanıcıya sunar.

## 4. Standart Sapma Faktörü

Türkiye geneli denemelerde "Standart Sapma" da hesaplamaya dahil edilir:
* Bir soruyu az sayıda öğrenci doğru cevaplamışsa, o sorunun puan değeri teorik olarak artabilir.
* Ancak çoğu denemede ve gerçek LGS/YKS'de puanlama; ders bazlı ortalamalar ve öğrencinin o testteki başarısı üzerinden standart puana dönüştürülerek yapılır.

---

> **Geliştirici Notu:** Senkron üzerinde puanlama yaparken, MEB ve ÖSYM'nin her yıl güncellediği katsayıları (Örn: Standart puan hesaplama tabloları) API üzerinden dinamik olarak çekmek, en doğru sonucu verecektir.