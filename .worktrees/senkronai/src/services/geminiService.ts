
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    const totalAssignedHours = activeClasses.reduce((acc:any, c:any) => acc + (c.assignments?.reduce((s:any, a:any) => s + a.hours, 0) || 0), 0);

    const prompt = `ROL: Sen Google OR-Tools mantığıyla çalışan, matematiksel kesinliğe sahip bir 'Ders Programı Dağıtım Motoru'sun.

    GİRDİ VERİLERİ:
    Sınıflar ve Atamalar: ${JSON.stringify(activeClasses)}
    Öğretmen Listesi: ${JSON.stringify(data.teachers)}
    Ders Tanımları: ${JSON.stringify(data.lessons)}

    HEDEF:
    Verilen 'assignments' listesindeki TÜM dersleri eksiksiz yerleştir.
    BEKLENEN TOPLAM SLOT SAYISI: ${totalAssignedHours} (Bu sayıya tam olarak ulaşmalısın).

    SERT KISITLAR (ASLA İHLAL EDİLEMEZ - HARD CONSTRAINTS):
    
    1. BLOK DERS KURALI (KRİTİK):
       - Haftalık saati 2 olan dersler: KESİNLİKLE 2 saat BLOK (peş peşe) yapılmalıdır (Örn: 1. ve 2. saat). ASLA farklı günlere 1+1 bölünemez.
       - Haftalık saati 3 olan dersler: 2+1 şeklinde bölünmelidir (2 saat blok, 1 saat tek).
       - Haftalık saati 4 olan dersler: 2+2 şeklinde iki ayrı blok olarak yapılmalıdır.
       - Haftalık saati 5 ve üzeri dersler: Mümkün olduğunca 2'li bloklar halinde dağıtılmalıdır.
       - Blok dersler aynı gün içinde ardışık saatlere (n ve n+1) denk gelmelidir.

    2. ÖĞRETMEN ÇAKIŞMASI (SIFIR TOLERANS):
       - Bir öğretmen (Name/ID) aynı GÜN ve aynı SAATTE (ders_saati) birden fazla sınıfa ders veremez.
       - Her atama öncesi: "Bu öğretmen, bu gün ve saatte başka bir sınıfa atandı mı?" kontrolü yap. Atandıysa o saati pas geç.

    3. MİKTAR DOĞRULAMASI:
       - Bir ders için 'hours: 2' denmişse, çıktı listesinde o ders ve öğretmen için tam olarak 2 kayıt olmalıdır. 1 veya 3 olamaz.

    4. FORMAT VE KODLAR:
       - Günler: "PZT", "SAL", "ÇAR", "PER", "CUM".
       - Ders Saatleri: Sabahçı/Tam gün için genelde 1-8 arası.

    ALGORİTMA ADIMLARI (CHAIN OF THOUGHT):
    Adım 1: Önce tüm sınıfların BLOK derslerini (2, 4, 5 saatlikler) öğretmen çakışması olmayacak şekilde şablona yerleştir.
    Adım 2: Kalan TEK saatlik dersleri (1 saatlik veya 3'ten artan 1'ler) kalan boşluklara, öğretmenlerin boş saatlerine göre yerleştir.
    Adım 3: Sonuç listesindeki toplam eleman sayısını say. Eğer ${totalAssignedHours} değerinden azsa, eksik dersleri bul ve boş yerlere (Gerekirse kural esneterek ama çakışma yaratmadan) ekle.

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
