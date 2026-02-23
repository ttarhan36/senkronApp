
export enum UserRole {
  ADMIN = 'İDARECİ',
  TEACHER = 'ÖĞRETMEN',
  STUDENT = 'ÖĞRENCİ'
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED'
}

export interface UserSession {
  role: UserRole;
  id: string;
  name: string;
  schoolId: string;
  email?: string;
  isFirstLogin?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: number;
}

export enum ModuleType {
  DASHBOARD = 'DASHBOARD',
  CLASSES = 'CLASSES',
  LESSONS = 'LESSONS',
  TEACHERS = 'TEACHERS',
  SCHEDULING = 'SCHEDULING',
  CLASS_SCHEDULES = 'CLASS_SCHEDULES',
  SETTINGS = 'SETTINGS',
  ABSENCE_REPORT = 'ABSENCE_REPORT',
  CHAT = 'AI_ENGINE',
  GUARD_DUTY = 'GUARD_DUTY',
  COMMUNICATION = 'COMMUNICATION',
  COURSES = 'KURSLAR',
  CREDENTIALS = 'ŞİFRE_İŞLEMLERİ',
  // Student Specific Modules
  STUDENT_OVERVIEW = 'STUDENT_OVERVIEW',
  STUDENT_ATTENDANCE = 'STUDENT_ATTENDANCE',
  STUDENT_TOPICS = 'STUDENT_TOPICS', // New: Konular
  STUDENT_EXAMS = 'STUDENT_EXAMS',   // New: Sınavlar
  STUDENT_GRADES = 'STUDENT_GRADES',
  STUDENT_COURSES = 'STUDENT_COURSES',
  // Teacher Specific Modules
  TEACHER_OVERVIEW = 'TEACHER_OVERVIEW',
  TEACHER_AGENDA = 'TEACHER_AGENDA',
  TEACHER_CLASSES = 'TEACHER_CLASSES',
  TEACHER_EXAMS = 'TEACHER_EXAMS', // New: Sınavlar
  TEACHER_SCHEDULE = 'TEACHER_SCHEDULE',
  TEACHER_CONSTRAINTS = 'TEACHER_CONSTRAINTS',
  TEACHER_PERFORMANCE = 'TEACHER_PERFORMANCE',
  TEACHER_STUDENTS = 'TEACHER_STUDENTS',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  EXAMS = 'EXAMS'
}

export enum ShiftType {
  SABAH = 'SABAH',
  OGLE = 'ÖĞLE'
}

export enum Gender {
  FEMALE = 'FEMALE',
  MALE = 'MALE'
}

export interface StudentObservation {
  id: string;
  teacherName: string;
  content: string;
  date: string;
  timestamp: number;
}

export interface GradeMetadata {
  proofUrl?: string;
  studentAnswers?: Record<string, string>;
  correctCount?: number;
  wrongCount?: number;
  emptyCount?: number;
  examGroup?: string;
  analyzedAt?: number;
}

export interface GradeRecord {
  lessonId: string;
  exam1?: number;
  exam2?: number;
  exam3?: number;
  exam4?: number;
  exam5?: number;
  exam6?: number;
  exam7?: number;
  exam8?: number;
  oral1?: number;
  oral2?: number;
  average?: number;
  isNew?: boolean;
  metadata?: Record<string, GradeMetadata>; // Key: exam1, exam2 etc.
}

export interface Exam {
  id: string;
  lessonId: string;
  slot: 'exam1' | 'exam2' | 'exam3' | 'exam4' | 'exam5' | 'exam6' | 'exam7' | 'exam8';
  date: string;
  status: 'PLANNED' | 'DONE';
  answerKey?: Record<'A' | 'B', Record<string, { key: string, points: number }>>;
}

export interface LessonLog {
  id: string;
  date: string;
  hour: number;
  subject: string;
  homework: string;
  teacherId: string;
  timestamp: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  lessonName: string;
  status: 'ABSENT' | 'LATE' | 'PRESENT';
  period: number;
  teacherName: string;
  proofImageUrl?: string;
  method: 'OPTICAL' | 'MANUAL';
  timestamp: number;
}

export interface Course {
  id: string;
  name: string;
  teacherName: string;
  capacity: number;
  enrolledCount: number;
  schedule: string;
  category: string;
  targetGrades?: number[];
  location?: string;
}

export enum CommsType {
  ANNOUNCEMENT = 'DUYURU',
  EVENT = 'ETKİNLİK',
  NOTIFICATION = 'BİLDİRİM'
}

export enum CommsCategory {
  ACADEMIC = 'ACADEMIC',
  SOCIAL = 'SOCIAL',
  URGENT = 'URGENT'
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: CommsType;
  category: CommsCategory;
  timestamp: number;
  audience: 'ALL' | 'TEACHERS' | string;
  isPinned?: boolean;
  readCount: number;
  location?: string;
}

export interface Student {
  id: string;
  number: string;
  is_blocked?: boolean;
  name: string;
  gender: Gender;
  grades: GradeRecord[];
  attendanceCount: number;
  attendanceHistory: AttendanceRecord[];
  observations?: StudentObservation[];
  courseIds?: string[];
  parentName?: string;
  parentPhone?: string;
  emergencyContact?: string;
  gpa?: number;
  maxAbsenteeism?: number;
  accessCode?: string;
  socialDNA?: string[];
  importBatchId?: string;
  class_id?: string;
  classId?: string;
  username?: string;
  password?: string;
}

export interface ThemeConfig {
  mode: ThemeMode;
  fontFamily: 'JetBrains Mono' | 'Inter' | 'Roboto' | 'Montserrat';
  fontScale: number;
  accentColor: string;
  gridOpacity: number;
  isGlowEnabled: boolean;
  borderThickness: number;
}

export enum ThemeMode {
  DARK = 'DARK',
  LIGHT = 'LIGHT'
}

export interface SchoolConfig {
  schoolName: string;
  isDualShift: boolean;
  morningPeriodCount: number;
  afternoonPeriodCount: number;
  dailyPeriodCount: number;
  lessonDuration: number;
  breakDuration: number;
  morningStartTime: string;
  afternoonStartTime: string;
  lunchBreakStart?: string;
  lunchBreakEnd?: string;
  lunchBreakAfter?: number;
}

export interface ClassLessonAssignment {
  lessonId: string;
  teacherId?: string;
  hours: number;
}

export interface GuardDutyAssignment {
  day: string;
  morningLocation: string;
  afternoonLocation: string;
}

export interface Teacher {
  id: string;
  name: string;
  gender?: Gender;
  branch: string;
  branchShort: string;
  is_blocked?: boolean;
  branches?: string[];
  branchShorts?: string[];
  lessonCount: number;
  availableDays: string[];
  loadPercentage?: number;
  restrictedDays?: string[];
  blockedSlots?: string[];
  guardDutyDays: string[];
  guardDuties?: GuardDutyAssignment[];
  preferredShift?: ShiftType;
  noMorningLessons?: boolean;
  blockLessonsPriority?: boolean;
  fixedLunchBreak?: boolean;
  maxHoursPerDay?: number;
  contactInfo?: string;
  notes?: string;
  lastUpdated?: string;
  assignedClassIds?: string[];
  isExemptFromDuty?: boolean;
  importBatchId?: string;
  username?: string;
  password?: string;
}

export interface ClassSection {
  id: string;
  name: string;
  grade: number;
  type: string;
  shift: ShiftType;
  assignments?: ClassLessonAssignment[];
  students?: Student[];
  exams?: Exam[];
  lessonLogs?: LessonLog[];
  importBatchId?: string;
}

export interface Lesson {
  id: string;
  name: string;
  hours: number;
  branch: string;
  teacherId?: string;
  category?: string;
  importBatchId?: string;
}

export interface ScheduleEntry {
  id?: string;
  sinif: string;
  gun: string;
  ders_saati: number;
  ders: string;
  ogretmen: string;
  shift?: ShiftType;
  isLocked?: boolean;
  isManual?: boolean;
}

export interface GeminiMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  type?: 'text' | 'image' | 'audio';
  imageUrl?: string;
  timestamp: number;
}

export interface ImportLog {
  id: string;
  timestamp: number;
  fileName: string;
  recordCount: number;
  type: 'STUDENT' | 'TEACHER' | 'LESSON' | 'EOKUL';
  snapshot: {
    classes?: ClassSection[];
    teachers?: Teacher[];
    lessons?: Lesson[];
  };
}

// =====================================================
// AI TELAFİ MOTORU - SINAV SİSTEMİ TİPLERİ
// =====================================================

export type ExamType = 'LGS' | 'TYT' | 'AYT' | 'YDT' | 'TARAMA_11';

export type SessionType = 'SÖZEL' | 'SAYISAL' | 'TYT' | 'AYT' | 'YDT' | 'TARAMA';

export type AIAnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export type StudentField = 'SAY' | 'EA' | 'SÖZ' | 'DİL';

export type TrafficLightStatus = 'RED' | 'YELLOW' | 'GREEN';

export interface ExamPackage {
  id: string;
  schoolId: string;
  name: string;
  examType: ExamType;
  targetGrade?: number;
  appliedDate?: string;
  wrongPenaltyRatio: number;
  status: 'PLANNED' | 'DONE';
  sessions?: ExamSession[];
  createdAt?: number;
}

export interface ExamSession {
  id: string;
  examId: string;
  sessionName: SessionType;
  durationMinutes?: number;
  questionCount?: number;
  sessionOrder: number;
  questions?: ExamQuestion[];
}

export interface Objective {
  id: string;
  schoolId: string;
  code?: string;
  description: string;
  subject: string;
  testContext?: 'TYT' | 'AYT' | 'YDT' | null;
  grade?: number;
  unit?: string;
  topic?: string;
}

export interface ExamQuestion {
  id: string;
  sessionId: string;
  questionNumber: number;
  subject: string;
  correctAnswer?: string;
  pointWeight: number;
  objectiveId?: string;
  objective?: Objective;
  aiAnalysisStatus: AIAnalysisStatus;
  aiConfidenceScore?: number;
  questionText?: string;
}

export interface StudentResponse {
  id: string;
  studentId: string;
  questionId: string;
  question?: ExamQuestion;
  givenAnswer?: string;
  isCorrect?: boolean;
  isEmpty: boolean;
  rawScore?: number;
  lostPoints?: number;
  createdAt?: number;
}

export interface PercentileEntry {
  score: number;
  percentile: number;
}

export interface PercentileData {
  year: number;
  examType: ExamType;
  table: PercentileEntry[];
}

export interface CompensationAlert {
  objectiveId: string;
  objectiveDescription: string;
  subject: string;
  status: TrafficLightStatus;
  successRate: number;
  lostPoints: number;
  wrongCount: number;
  totalQuestions: number;
}

export interface SubjectSummary {
  subject: string;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  rawScore: number;
  lostPoints: number;
  successRate: number;
}

export interface ExamResult {
  examPackage: ExamPackage;
  sessionResults: SessionResult[];
  totalNet: number;
  totalScore: number;
  lostPoints: number;
  percentileProjection?: PercentileEntry;
  compensationAlerts: CompensationAlert[];
}

export interface SessionResult {
  session: ExamSession;
  subjectSummaries: SubjectSummary[];
  totalNet: number;
  totalScore: number;
  lostPoints: number;
}
