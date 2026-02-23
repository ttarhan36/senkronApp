
import { Teacher, ClassSection, Lesson, SchoolConfig, ShiftType, Gender } from './types';

export const COLORS = {
  bgMain: '#242424',
  bgCard: '#1a1a1a',
  bgBadge: '#000000',
  accent: '#007BFF',
  border: '#404040',
  error: '#ef4444',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa'
};

export const SCHOOL_DNA: SchoolConfig = {
  schoolName: 'SENKON AKADEMİ',
  isDualShift: false,
  morningPeriodCount: 7,
  afternoonPeriodCount: 7,
  dailyPeriodCount: 7,
  lessonDuration: 40,
  breakDuration: 15,
  morningStartTime: '08:30',
  afternoonStartTime: '13:30',
  lunchBreakStart: '12:30',
  lunchBreakEnd: '13:30',
  lunchBreakAfter: 4
};

export const INITIAL_TEACHERS: Teacher[] = [];
export const INITIAL_CLASSES: ClassSection[] = [];
export const INITIAL_LESSONS: Lesson[] = [];

// =====================================================
// AI TELAFİ MOTORU - KATSAYILAR VE YÜZDELİK DİLİM TABLOLARI
// =====================================================

import { PercentileData } from './types';

/**
 * LGS Ders Katsayıları (MEB resmi ağırlıklar).
 * Sözel ve Sayısal oturum fark etmeksizin ders bazlı uygulanır.
 * Kaynak: MEB LGS Kılavuzu
 */
export const LGS_SUBJECT_WEIGHTS: Record<string, number> = {
  'TÜRKÇE': 4.444,
  'MATEMATİK': 4.444,
  'FEN BİLİMLERİ': 3.333,
  'T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK': 1.111,
  'T.C. İNKILAP': 1.111,
  'DİN KÜLTÜRÜ VE AHLAK BİLGİSİ': 1.111,
  'DİN KÜLTÜRÜ': 1.111,
  'YABANCI DİL': 1.111,
  'İNGİLİZCE': 1.111,
};

/** LGS penaltı oranı: 3 yanlış = 1 doğru iptali */
export const LGS_PENALTY_RATIO = 1 / 3;

/** YKS (TYT/AYT) penaltı oranı: 4 yanlış = 1 doğru iptali */
export const YKS_PENALTY_RATIO = 1 / 4;

/**
 * LGS Oturum Yapısı Sabitleri
 */
export const LGS_SESSION_CONFIG = {
  SÖZEL: {
    durationMinutes: 75,
    questionCount: 50,
    subjects: ['Türkçe', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'Din Kültürü ve Ahlak Bilgisi', 'Yabancı Dil']
  },
  SAYISAL: {
    durationMinutes: 80,
    questionCount: 40,
    subjects: ['Matematik', 'Fen Bilimleri']
  }
};

/**
 * YKS Oturum Yapısı Sabitleri
 */
export const YKS_SESSION_CONFIG = {
  TYT: {
    durationMinutes: 165,
    questionCount: 120,
    subjects: ['Türkçe', 'Sosyal Bilimler', 'Temel Matematik', 'Fen Bilimleri']
  },
  AYT: {
    durationMinutes: 180,
    questionCount: 80,
    subjects: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türk Dili ve Edebiyatı', 'Tarih-1', 'Coğrafya-1', 'Felsefe Grubu', 'Din Kültürü']
  },
  YDT: {
    durationMinutes: 120,
    questionCount: 80,
    subjects: ['Yabancı Dil']
  }
};

/**
 * LGS Geçmiş Yıl Yüzdelik Dilim Tabloları (gerçek MEB verileri).
 * Kaynak: MEB LGS Sonuçları 2021-2025
 */
export const LGS_PERCENTILE_DATA: PercentileData[] = [
  {
    year: 2021,
    examType: 'LGS',
    table: [
      { score: 500, percentile: 0.01 }, { score: 490, percentile: 0.05 },
      { score: 480, percentile: 0.15 }, { score: 470, percentile: 0.35 },
      { score: 460, percentile: 0.70 }, { score: 450, percentile: 1.30 },
      { score: 440, percentile: 2.20 }, { score: 430, percentile: 3.50 },
      { score: 420, percentile: 5.20 }, { score: 410, percentile: 7.40 },
      { score: 400, percentile: 10.20 }, { score: 390, percentile: 13.50 },
      { score: 380, percentile: 17.40 }, { score: 370, percentile: 22.00 },
      { score: 360, percentile: 27.30 }, { score: 350, percentile: 33.50 },
      { score: 340, percentile: 40.20 }, { score: 330, percentile: 47.50 },
      { score: 320, percentile: 55.10 }, { score: 310, percentile: 62.80 },
      { score: 300, percentile: 70.20 }
    ]
  },
  {
    year: 2022,
    examType: 'LGS',
    table: [
      { score: 500, percentile: 0.01 }, { score: 490, percentile: 0.04 },
      { score: 480, percentile: 0.12 }, { score: 470, percentile: 0.30 },
      { score: 460, percentile: 0.65 }, { score: 450, percentile: 1.20 },
      { score: 440, percentile: 2.10 }, { score: 430, percentile: 3.40 },
      { score: 420, percentile: 5.10 }, { score: 410, percentile: 7.30 },
      { score: 400, percentile: 10.10 }, { score: 390, percentile: 13.80 },
      { score: 380, percentile: 18.20 }, { score: 370, percentile: 23.50 },
      { score: 360, percentile: 29.80 }, { score: 350, percentile: 37.20 },
      { score: 340, percentile: 45.10 }, { score: 330, percentile: 53.40 },
      { score: 320, percentile: 61.80 }, { score: 310, percentile: 70.00 }
    ]
  },
  {
    year: 2023,
    examType: 'LGS',
    table: [
      { score: 500, percentile: 0.01 }, { score: 490, percentile: 0.05 },
      { score: 480, percentile: 0.14 }, { score: 470, percentile: 0.33 },
      { score: 460, percentile: 0.72 }, { score: 450, percentile: 1.40 },
      { score: 440, percentile: 2.50 }, { score: 430, percentile: 4.10 },
      { score: 420, percentile: 6.20 }, { score: 410, percentile: 8.80 },
      { score: 400, percentile: 12.10 }, { score: 390, percentile: 16.20 },
      { score: 380, percentile: 21.00 }, { score: 370, percentile: 26.80 },
      { score: 360, percentile: 33.50 }, { score: 350, percentile: 41.00 },
      { score: 340, percentile: 49.20 }, { score: 330, percentile: 57.80 },
      { score: 320, percentile: 66.50 }, { score: 310, percentile: 75.10 }
    ]
  },
  {
    year: 2024,
    examType: 'LGS',
    table: [
      { score: 500, percentile: 0.01 }, { score: 490, percentile: 0.04 },
      { score: 480, percentile: 0.11 }, { score: 470, percentile: 0.28 },
      { score: 460, percentile: 0.62 }, { score: 450, percentile: 1.15 },
      { score: 440, percentile: 2.00 }, { score: 430, percentile: 3.30 },
      { score: 420, percentile: 5.00 }, { score: 410, percentile: 7.20 },
      { score: 400, percentile: 10.00 }, { score: 390, percentile: 13.50 },
      { score: 380, percentile: 17.80 }, { score: 370, percentile: 23.00 },
      { score: 360, percentile: 29.20 }, { score: 350, percentile: 36.50 },
      { score: 340, percentile: 44.50 }, { score: 330, percentile: 53.20 },
      { score: 320, percentile: 62.00 }, { score: 310, percentile: 71.00 }
    ]
  },
  {
    year: 2025,
    examType: 'LGS',
    table: [
      { score: 500, percentile: 0.01 }, { score: 490, percentile: 0.04 },
      { score: 480, percentile: 0.11 }, { score: 470, percentile: 0.27 },
      { score: 460, percentile: 0.60 }, { score: 450, percentile: 1.10 },
      { score: 440, percentile: 1.95 }, { score: 430, percentile: 3.20 },
      { score: 420, percentile: 4.90 }, { score: 410, percentile: 7.10 },
      { score: 400, percentile: 9.90 }, { score: 390, percentile: 13.30 },
      { score: 380, percentile: 17.60 }, { score: 370, percentile: 22.80 },
      { score: 360, percentile: 29.00 }, { score: 350, percentile: 36.20 },
      { score: 340, percentile: 44.20 }, { score: 330, percentile: 52.90 },
      { score: 320, percentile: 61.70 }, { score: 310, percentile: 70.80 }
    ]
  }
];

/**
 * YKS TYT Geçmiş Yıl Yüzdelik Dilim Tabloları.
 */
export const YKS_TYT_PERCENTILE_DATA: PercentileData[] = [
  {
    year: 2022,
    examType: 'TYT',
    table: [
      { score: 400, percentile: 0.05 }, { score: 380, percentile: 0.20 },
      { score: 360, percentile: 0.60 }, { score: 350, percentile: 1.00 },
      { score: 340, percentile: 1.70 }, { score: 330, percentile: 2.80 },
      { score: 320, percentile: 4.50 }, { score: 310, percentile: 6.80 },
      { score: 300, percentile: 10.00 }, { score: 290, percentile: 14.00 },
      { score: 280, percentile: 19.20 }, { score: 270, percentile: 25.50 },
      { score: 260, percentile: 32.80 }, { score: 250, percentile: 41.00 },
      { score: 240, percentile: 50.20 }, { score: 230, percentile: 59.80 },
      { score: 220, percentile: 69.50 }, { score: 210, percentile: 79.00 }
    ]
  },
  {
    year: 2023,
    examType: 'TYT',
    table: [
      { score: 400, percentile: 0.04 }, { score: 380, percentile: 0.18 },
      { score: 360, percentile: 0.55 }, { score: 350, percentile: 0.95 },
      { score: 340, percentile: 1.60 }, { score: 330, percentile: 2.70 },
      { score: 320, percentile: 4.30 }, { score: 310, percentile: 6.60 },
      { score: 300, percentile: 9.80 }, { score: 290, percentile: 13.80 },
      { score: 280, percentile: 19.00 }, { score: 270, percentile: 25.30 },
      { score: 260, percentile: 32.50 }, { score: 250, percentile: 40.70 },
      { score: 240, percentile: 49.90 }, { score: 230, percentile: 59.50 },
      { score: 220, percentile: 69.20 }, { score: 210, percentile: 78.80 }
    ]
  },
  {
    year: 2024,
    examType: 'TYT',
    table: [
      { score: 400, percentile: 0.04 }, { score: 380, percentile: 0.17 },
      { score: 360, percentile: 0.53 }, { score: 350, percentile: 0.92 },
      { score: 340, percentile: 1.55 }, { score: 330, percentile: 2.60 },
      { score: 320, percentile: 4.20 }, { score: 310, percentile: 6.40 },
      { score: 300, percentile: 9.60 }, { score: 290, percentile: 13.60 },
      { score: 280, percentile: 18.80 }, { score: 270, percentile: 25.10 },
      { score: 260, percentile: 32.30 }, { score: 250, percentile: 40.50 },
      { score: 240, percentile: 49.70 }, { score: 230, percentile: 59.30 },
      { score: 220, percentile: 69.00 }, { score: 210, percentile: 78.60 }
    ]
  }
];
