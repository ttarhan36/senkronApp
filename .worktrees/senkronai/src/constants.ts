
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
