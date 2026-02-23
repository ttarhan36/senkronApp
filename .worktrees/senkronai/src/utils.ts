
import { Gender } from './types';

/**
 * Türkçe karakterleri ASCII muadillerine çevirir ve büyük harf yapar.
 */
export const standardizeForMatch = (text: string): string => {
  if (!text) return "";
  const map: { [key: string]: string } = {
    'İ': 'I', 'I': 'I', 'ı': 'i', 'i': 'i',
    'Ğ': 'G', 'ğ': 'g', 'Ü': 'U', 'ü': 'u',
    'Ş': 'S', 'ş': 's', 'Ö': 'O', 'ö': 'o',
    'Ç': 'C', 'ç': 'c'
  };
  
  let result = text.replace(/[İIıiĞğÜüŞşÖöÇç]/g, (letter) => map[letter] || letter);
  return result.toUpperCase().trim();
};

/**
 * Gün ismini standart 3 harfli koda çevirir (Pazartesi -> PZT)
 * Çarşamba gününü hem ASCII (CAR) hem Türkçe (ÇAR) olarak yakalar.
 */
export const standardizeDayCode = (day: string): string => {
  if (!day) return "";
  const d = standardizeForMatch(day);
  if (d.startsWith("PAZARTE")) return "PZT";
  if (d.startsWith("SALI")) return "SAL";
  if (d.startsWith("CARSAMB") || d.startsWith("ÇAR") || d === "CAR") return "ÇAR";
  if (d.startsWith("PERSEMB")) return "PER";
  if (d.startsWith("CUMA")) return "CUM";
  if (d.length >= 3) {
      const short = d.substring(0, 3);
      if (short === "PZT") return "PZT";
      if (short === "SAL") return "SAL";
      if (short === "CAR" || short === "ÇAR") return "ÇAR";
      if (short === "PER") return "PER";
      if (short === "CUM") return "CUM";
  }
  return d;
};

/**
 * Şube isminden sınıf seviyesini ayıklar (Örn: "10-A" -> 10)
 */
export const parseGradeFromName = (name: string): number => {
  if (!name) return 9;
  const match = name.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 9;
};

/**
 * Branş varyasyonlarını ORTAK 4 KARAKTERLİ STANDARDA çevirir.
 */
export const standardizeBranchCode = (input: string): string => {
  const s = standardizeForMatch(input || "");
  
  const aliases: Record<string, string> = {
    'MAT': 'MATE', 'MATEMATIK': 'MATE',
    'GEO': 'GEOM', 'GEOMETRI': 'GEOM',
    'KIM': 'KIMY', 'KIMYA': 'KIMY',
    'FIZ': 'FIZI', 'FIZIK': 'FIZI',
    'BIY': 'BIYO', 'BIYOLOJI': 'BIYO',
    'TDE': 'TDEB', 'TURKCE': 'TDEB', 'EDEBIYAT': 'TDEB', 'TUR': 'TDEB',
    'ING': 'INGI', 'INGILIZCE': 'INGI',
    'ALM': 'ALMA', 'ALMANCA': 'ALMA',
    'COG': 'COGR', 'COGRAFYA': 'COGR',
    'TAR': 'TARI', 'TARIH': 'TARI',
    'FEL': 'FELS', 'FELSEFE': 'FELS',
    'DIN': 'DKAB', 'DKAB': 'DKAB',
    'BED': 'BEDE', 'BEDEN': 'BEDE',
    'MUZ': 'MUZI', 'MUZIK': 'MUZI',
    'GOR': 'GORS', 'GORSEL': 'GORS',
    'REH': 'REHB', 'REHBERLIK': 'REHB'
  };

  if (aliases[s]) return aliases[s];
  if (s.includes('MATEMATIK')) return 'MATE';
  if (s.includes('EDEBIYAT') || s.includes('TURKCE')) return 'TDEB';
  if (s.includes('FIZIK')) return 'FIZI';
  
  return s.substring(0, 4);
};

export const getSectionColor = (className: string) => {
  const name = className.trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31) + name.charCodeAt(i);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
};

/**
 * Gelişmiş Türkçe İsim/Cinsiyet Analiz Motoru
 * Pınar, Filiz, Sevil gibi isimleri ve ekleri (nur, gül, su, vb.) tanır.
 */
export const guessGenderFromName = (name: string): Gender => {
  const n = standardizeForMatch(name);
  const nameParts = n.split(/\s+/).filter(p => p.length >= 2);
  if (nameParts.length === 0) return Gender.MALE;
  
  const first = nameParts[0];

  // 1. KESİN KADIN İSİMLERİ LİSTESİ (Sonek kuralına uymayanlar dahil)
  const femaleKeywords = [
    // Belirttiğiniz isimler
    'PINAR', 'FILIZ', 'SEVIL', 'SEVILAY', 'GONUL', 'ISIL', 'IDIL', 'IPEK', 'CIGDEM', 
    'AYSE', 'FATMA', 'ZEYNEP', 'ELIF', 'MERYEM', 'EMINE', 'HATICE', 'SULTAN', 'OZLEM', 
    'ESRA', 'GAMZE', 'MERVE', 'BUSRA', 'KUBRA', 'EDA', 'SEDA', 'HULYA', 'CANAN', 'SENA',
    'GIZEM', 'DAMLA', 'EBRU', 'YAREN', 'BURCU', 'SELIN', 'GOZDE', 'OZGE', 'DUYGU', 'NILAY',
    'BERNA', 'HANDAN', 'SEVDA', 'DILARA', 'BUKET', 'CEREN', 'ASYA', 'EYLUL', 'NESRIN',
    'LEYLA', 'BERRA', 'PELIN', 'MINE', 'NAZ', 'SILA', 'RUMEYSA', 'SUMEYYE', 'HAVVA',
    'SONGUL', 'ARZU', 'DILEK', 'MEHTAP', 'SEVGI', 'GULSEN', 'GULAY', 'GULER', 'NERIMAN',
    'PERIHAN', 'SEMRA', 'TULIN', 'YELIZ', 'ZELIHA', 'ZUHAL', 'BELGIN', 'SADET', 'DERYA',
    'TUGBA', 'BETUL', 'ASLI', 'BUSE', 'HALE', 'LALE', 'JALE', 'FUNDA', 'BANU', 'MELIS',
    'NURAN', 'NURAY', 'NURCAN', 'GULCAN', 'GULISTN', 'SADET', 'NAZLI', 'SERPIL', 'NIL',
    'ILAYDA', 'SINEM', 'SILA', 'BELMA', 'BEYZA', 'NISA', 'DILAN', 'DICLE', 'SIDIKA',
    'SABRIYE', 'REYYAN', 'TAYYIBE', 'MUKADDES', 'MUSERREF', 'MELIKE', 'MUGE', 'YILDIZ',
    'TULAY', 'SULE', 'DEMET', 'DIDEM', 'AHSEN', 'AZRA', 'AYLIN', 'AYSEL', 'AHRU'
  ];
  
  if (femaleKeywords.some(f => first === f)) return Gender.FEMALE;

  // 2. GELİŞMİŞ SON EK (SUFFIX) ANALİZİ
  // Türkçede kadın isimleri genellikle bu eklerle biter.
  const femaleSuffixes = [
    'NUR', 'GUL', 'SU', 'NAZ', 'NISA', 'SARE', 'EDA', 'SEDA', 'CANAN', 'BEL', 'NIL', 'AN'
  ];

  // İstisna: Bazı erkek isimleri 'AN' ile bitebilir (HAKAN, KAAN vb.), 
  // bu yüzden 'AN' kontrolünü sadece bilinen kadın isimleri havuzunda yapıyoruz.
  
  if (first.endsWith('NUR') || first.endsWith('GUL') || first.endsWith('SU') || 
      first.endsWith('NAZ') || first.endsWith('NISA') || first.endsWith('SARE')) {
    return Gender.FEMALE;
  }

  // Özel Karakteristik Bitişler (Örn: 'IZ' -> Filiz, Yeliz, Deniz uniseks ama öğretmenlikte genelde K)
  if (first.endsWith('IZ') && !['AZIZ', 'EDIZ'].includes(first)) return Gender.FEMALE;
  
  // 'IL' Bitişi (Sevil, Işıl, Idil, Serpil vb.) - İstisnalar: Halil, Celal, İsmail
  const maleIL = ['HALIL', 'ISMAIL', 'CELAL', 'BILAL', 'ADIL'];
  if (first.endsWith('IL') && !maleIL.includes(first)) return Gender.FEMALE;

  // 3. ÖN EK (PREFIX) ANALİZİ
  if (first.startsWith('GUL') || first.startsWith('NUR')) return Gender.FEMALE;

  // 4. UNISEKS İSİMLER (SİSTEM TERCİHİ)
  // Deniz, Görkem, Umut vb. isimler için öğretmen kadrosunda istatistiksel olarak 'K' ağırlığı verilebilir
  const commonUnisexAsFemale = ['DENIZ', 'DERIN', 'GUNES', 'YAGMUR'];
  if (commonUnisexAsFemale.includes(first)) return Gender.FEMALE;

  // Default: Erkek
  return Gender.MALE;
};

export const getGradeFromLesson = (lessonName: string, branchCode: string) => {
  const combined = `${lessonName} ${branchCode}`.toUpperCase();
  const match = combined.match(/(\d+)/);
  return match ? parseInt(match[0]) : null;
};

export const getBranchColor = (input: string) => {
  const s = standardizeBranchCode(input);
  if (s.includes('MATE')) return '#a855f7'; 
  if (s.includes('FIZI')) return '#3b82f6'; 
  if (s.includes('KIMY')) return '#f59e0b'; 
  if (s.includes('BIYO')) return '#10b981'; 
  if (s.includes('TDEB')) return '#ef4444'; 
  if (s.includes('GEOM')) return '#6366f1'; 
  if (s.includes('MUZI')) return '#ec4899'; 
  if (s.includes('INGI')) return '#f43f5e'; 
  if (s.includes('BEDE')) return '#0ea5e9'; 
  if (s.includes('TARI')) return '#eab308'; 
  if (s.includes('COGR')) return '#8b5cf6'; 
  if (s.includes('FELS')) return '#14b8a6'; 
  if (s.includes('DKAB')) return '#d946ef'; 
  if (s.includes('ALMA')) return '#fb923c'; 
  if (s.includes('GORS')) return '#22c55e'; 
  
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31) + s.charCodeAt(i);
  }
  const h = Math.abs(hash * 0.618033988749895) % 1;
  return `hsl(${Math.floor(h * 360)}, 80%, 65%)`;
};

export const hexToRgba = (color: string, opacity: number) => {
  if (color.startsWith('hsl')) return color.replace(')', `, ${opacity})`).replace('hsl', 'hsla');
  let r = 0, g = 0, b = 0;
  if (color.length === 7) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
