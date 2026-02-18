
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_API_KEY || '' });

let globalAudioContext: AudioContext | null = null;
export const getAudioContext = async () => {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  if (globalAudioContext.state === 'suspended') {
    await globalAudioContext.resume();
  }
  return globalAudioContext;
};

export const chatWithGemini = async (message: string, content?: any) => {
  try {
    const ai = getAI();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: message,
      config: {
        systemInstruction: "Sen bir okul yönetimi uzmanısın. Her zaman Türkçe yanıt ver.",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Yanıt üretilemedi.";
  } catch (error) {
    return "Bağlantı hatası.";
  }
};

export const generateSchedule = async (data: any) => {
  try {
    const ai = getAI();
    const activeClasses = data.classes.filter((c: any) => c.assignments && c.assignments.length > 0);

    if (activeClasses.length === 0) {
      throw new Error("HATA: Hiçbir şubeye ders atanmamış.");
    }

    // Toplam ders yükünü hesapla (Doğrulama için)
    const totalAssignedHours = activeClasses.reduce((acc: any, c: any) => acc + (c.assignments?.reduce((s: any, a: any) => s + a.hours, 0) || 0), 0);

    // Sınıf bazlı saat dağılımı (AI'ya bildirilecek)
    const classHourBreakdown = activeClasses.map((c: any) => {
      const totalHours = c.assignments?.reduce((s: any, a: any) => s + a.hours, 0) || 0;
      return `${c.name}: ${totalHours} saat`;
    }).join(', ');

    const prompt = `ROL: Sen Google OR-Tools mantığıyla çalışan, matematiksel kesinliğe sahip bir 'Ders Programı Dağıtım Motoru'sun.

    GİRDİ VERİLERİ:
    Sınıflar ve Atamalar: ${JSON.stringify(activeClasses)}
    Öğretmen Listesi: ${JSON.stringify(data.teachers)}
    Ders Tanımları: ${JSON.stringify(data.lessons)}

    HEDEF:
    Verilen 'assignments' listesindeki TÜM dersleri eksiksiz yerleştir.
    BEKLENEN TOPLAM SLOT SAYISI: ${totalAssignedHours} (Bu sayıya tam olarak ulaşmalısın).

    SINIF BAZLI SAAT LİMİTLERİ (KRİTİK): ${classHourBreakdown}
    Her sınıf için SADECE yukarıdaki saat kadar ders slotu oluştur. Fazla slot OLUŞTURMA. Boş kalan saatler BOŞ kalmalıdır.

    SERT KISITLAR (ASLA İHLAL EDİLEMEZ - HARD CONSTRAINTS):
    
    1. 2'Lİ BLOK MANTIĞI VE GÜNLÜK LİMİT (HAYATİ & İHLAL EDİLEMEZ):
       - GÜNLÜK MAKSİMUM KOTA: Bir dersin bir günde alabileceği toplam saat EN FAZLA 2'dir. (İSTİSNA YOK).
       - YASAK: Aynı dersten, aynı günde 3 veya 4 saat olması (Arka arkaya veya aralıklı) KESİNLİKLE YASAKTIR.
       - DAĞITIM ŞABLONU:
         * Haftalık 2 saat -> 1 Blok (2 saat) [1 GÜN]
         * Haftalık 3 saat -> 1 Blok + 1 Tek (2+1) [2 FARKLI GÜN]
         * Haftalık 4 saat -> 2 Blok (2+2) [2 FARKLI GÜN] -> ASLA AYNI GÜNE 2+2 KOYMA.
         * Haftalık 5 saat -> 2 Blok + 1 Tek (2+2+1) [3 FARKLI GÜN]
         * Haftalık 6 saat -> 3 Blok (2+2+2) [3 FARKLI GÜN]
       - Blok dersler (2 saatlik) mutlaka ardışık saatlere (n ve n+1) denk gelmelidir.

    2. ÖĞRETMEN ÇAKIŞMASI (SIFIR TOLERANS):
       - Bir öğretmen (Name/ID) aynı GÜN ve aynı SAATTE (ders_saati) birden fazla sınıfa ders veremez.
       - Her atama öncesi: "Bu öğretmen, bu gün ve saatte başka bir sınıfa atandı mı?" kontrolü yap. Atandıysa o saati pas geç.

    3. EKSİKSİZ MİKTAR DOĞRULAMASI (KIRMIZI ÇİZGİ):
       - HEDEF: Her dersin 'hours' değeri kadar kayıt oluşturmak ZORUNDASIN. (Örn: Matematik 5 saat ise, 5 tane kayıt olmalı. 4 olursa BAŞARISIZsin).
       - ASLA EKSİK BIRAKMA: Zorlu kombinasyon olsa bile, bir şekilde boşluk bulup tüm dersleri yerleştir.
       - FAZLA DA OLMAZ: Belirtilen saatten fazla ders koyma.
       - Sadece verilen 'assignments' listesini kullan. (Dışarıdan ders uydurma).

    4. FORMAT VE KODLAR (HAYATİ ÖNEM TAŞIR):
       - Günler: "PZT", "SAL", "ÇAR", "PER", "CUM".
       - Ders Saatleri: Sabahçı/Tam gün için genelde 1-8 arası.
       - 'ders' ALANI: KESİNLİKLE 'assignments' listesindeki 'lessonId' değerini kullan (Örn: "L-MATE"). Eğer ID yoksa 'lessons' listesindeki 'name' alanını BİREBİR kullan. ASLA kısaltma yapma veya değiştirme.
       - 'ogretmen' ALANI: KESİNLİKLE 'assignments' listesindeki 'teacherId' değerini kullan (Örn: "T105"). Eğer ID yoksa 'teachers' listesindeki 'name' alanını BİREBİR kullan.
       -RENK TUTARLILIĞI İÇİN BU KODLAR ŞARTTIR.

    ALGORİTMA ADIMLARI (CHAIN OF THOUGHT):
    Adım 1: Önce tüm sınıfların BLOK derslerini (2, 4, 5 saatlikler) öğretmen çakışması olmayacak şekilde şablona yerleştir.
    KRİTİK KURAL: Bir dersi bir güne koyarken sayacı kontrol et. Eğer o gün o dersten 2 saat (1 blok) koyduysan, o gün o ders için KOTA DOLMUŞTUR. Kesinlikle o güne daha fazla o dersten koyma. Başka güne geç.
    Adım 2: Kalan TEK saatlik dersleri (1 saatlik veya 3'ten artan 1'ler) kalan boşluklara, öğretmenlerin boş saatlerine göre yerleştir.
    Adım 3 (SON KONTROL & ACİL TAMAMLAMA):
    - Üretilen toplam ders sayısını kontrol et. HEDEF: ${totalAssignedHours}.
    - Eğer eksik varsa: Hangi sınıfın hangi dersi eksik? Bul ve o sınıfın BOŞ saatlerine (Öğretmen müsaitse) yerleştir.
    - Kriz Durumu: Eğer yer yoksa, "Günde Max 2 Saat" kuralını ihlal etmen gerekse bile EKSİK DERSİ KOY. (Tek kural: Öğretmen çakışması olmasın).
    - Hedef sayıya ULAŞMADAN ÇIKTI ÜRETME.

    ÇIKTI: Sadece 'schedule' dizisi içeren geçerli bir JSON dön. Yorum yazma.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sinif: { type: Type.STRING },
                  gun: { type: Type.STRING, description: "Must be PZT, SAL, ÇAR, PER, or CUM" },
                  ders_saati: { type: Type.INTEGER },
                  ders: { type: Type.STRING },
                  ogretmen: { type: Type.STRING },
                  shift: { type: Type.STRING }
                },
                required: ["sinif", "gun", "ders_saati", "ders", "ogretmen", "shift"]
              }
            }
          },
          required: ["schedule"]
        },
        maxOutputTokens: 60000, // JSON kesilmemesi için artırıldı
        thinkingConfig: { thinkingBudget: 8000 } // Daha derin analiz için artırıldı
      }
    });
    return response.text;
  } catch (error) {
    throw error;
  }
};

export const analyzeAttendanceImage = async (img: string, numbers: string[], targetHour: number) => {
  try {
    const ai = getAI();
    const base64Data = img.split(',')[1];
    const mimeType = img.split(',')[0].split(':')[1].split(';')[0];

    const prompt = `GÖREV: El yazısı yoklama kağıdından öğrenci numaralarını ayıkla.
    Görselde dikey sütunlar ders saatlerini (1. DERS, 2. DERS, vb.) temsil eder.
    
    HEDEF SÜTUN: ${targetHour}. DERS
    DOĞRULAMA HAVUZU (DNA): ${JSON.stringify(numbers)}
    
    TALİMATLAR:
    1. Sadece ${targetHour}. DERS başlığı altındaki dikey sütuna odaklan.
    2. Bu sütun içindeki tüm sayıları oku.
    3. Okuduğun her sayıyı "DOĞRULAMA HAVUZU" ile karşılaştır. Sadece havuzda olanları kabul et.
    4. Diğer sütunlardaki sayıları kesinlikle görmezden gel.
    
    ÇIKTI FORMATI (JSON):
    {
      "results": [ { "studentNumber": "bulunan_numara" } ],
      "logs": [ "analiz süreci hakkında kısa Türkçe notlar" ]
    }`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { inlineData: { data: base64Data, mimeType: mimeType } },
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{\"results\": []}";
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (error) {
    console.error("Yoklama Analiz Hatası:", error);
    return { results: [], logs: ["Sistem hatası oluştu."] };
  }
};

export const analyzeGradeImage = async (img: string, studentNumbers: string[], keys: any, field: string) => {
  try {
    const ai = getAI();
    const base64Data = img.split(',')[1];
    const mimeType = img.split(',')[0].split(':')[1].split(';')[0];

    const prompt = `GÖREV: Sınav Optik Formunu Analiz Et ve Puanla.
    
    FORM YAPISI:
    1. Üst bölümde el yazısı ile "Okul Numarası" yazar.
    2. Sağ üstte Sınav Grubu (A, B, C) işaretleme alanı vardır.
    3. Alt bölümde SOL SÜTUN (1-15) ve SAĞ SÜTUN (16-30) olarak şıklar (A-E) yer alır.
    
    CEVAP ANAHTARI (DNA): ${JSON.stringify(keys)}
    GEÇERLİ ÖĞRENCİ NUMARALARI: ${JSON.stringify(studentNumbers)}

    TALİMATLAR:
    1. Okul Numarası alanındaki sayıyı oku. (Örn: "24"). Bu sayı listede yoksa en yakınına odaklanma, direkt oku.
    2. Sınav Grubu alanında hangi harf (A veya B) işaretlenmiş tespit et.
    3. Tespit edilen gruba ait CEVAP ANAHTARINI kullanarak öğrencinin şıklarını karşılaştır.
    4. Her doğru cevap için cevap anahtarındaki "points" değerini topla.
    
    ÇIKTI FORMATI (JSON):
    {
      "studentNumber": "okunan_numara",
      "examGroup": "A_veya_B",
      "score": 100,
      "correctCount": 15,
      "wrongCount": 5,
      "emptyCount": 10,
      "detectedChoices": { "1": "A", "2": "C" }
    }`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { inlineData: { data: base64Data, mimeType: mimeType } },
        { text: prompt }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanJson = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson || "null");
  } catch (error) {
    console.error("Grade Analysis Error:", error);
    return null;
  }
};

export const getTTSAudio = async (text: string) => {
  try {
    const ai = getAI();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.substring(0, 500) }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;
    const ctx = await getAudioContext();
    return await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
  } catch (error) {
    return null;
  }
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) { channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; }
  }
  return buffer;
}
