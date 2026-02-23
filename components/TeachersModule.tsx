
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Teacher, ScheduleEntry, ClassSection, Lesson, ModuleType, ShiftType, SchoolConfig, Student, GradeRecord, Gender, AttendanceRecord, UserRole, LessonLog, Exam, GradeMetadata } from '../types';
import { getSectionColor, getBranchColor, hexToRgba, standardizeBranchCode, parseGradeFromName, standardizeDayCode } from '../utils';
import { analyzeAttendanceImage, analyzeGradeImage } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { QRCodeCanvas } from 'qrcode.react';

interface TeachersModuleProps {
   teachers: Teacher[];
   setTeachers: (t: Teacher[]) => void;
   classes: ClassSection[];
   setClasses: (c: ClassSection[] | ((prev: ClassSection[]) => ClassSection[])) => void;
   editMode: boolean;
   setEditMode?: (e: boolean) => void;
   schedule: ScheduleEntry[];
   allClasses: ClassSection[];
   allLessons: Lesson[];
   setActiveModule?: (m: ModuleType) => void;
   onNavigateToClass?: (className: string) => void;
   onDeleteTeacher?: (teacherId: string) => void;
   onDeleteTeacherDB?: (teacherId: string) => void;
   initialTeacherId?: string | null;
   initialTab?: string | null;
   activeTab?: string;
   schoolConfig: SchoolConfig;
   onSuccess: (msg?: string) => void;
   onWatchModeAttempt?: () => void;
   userRole?: UserRole;
   currentUserId?: string;
}

type StudentWithContext = Student & { displayGrade?: number; displayAbsent?: number };

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const DAYS_SHORT = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM'];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8];

const GradeInput: React.FC<{
   initialValue: number | undefined;
   onCommit: (val: number | undefined) => void;
   colorClass: string;
}> = ({ initialValue, onCommit, colorClass }) => {
   const [localVal, setLocalVal] = useState<string>(initialValue === undefined ? '' : initialValue.toString());
   useEffect(() => { setLocalVal(initialValue === undefined ? '' : initialValue.toString()); }, [initialValue]);
   const handleBlur = () => { const numeric = localVal === '' ? undefined : parseInt(localVal); if (numeric !== initialValue) onCommit(numeric); };
   const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); };
   return (<input type="number" placeholder="--" className={`w-14 h-10 bg-black/40 border border-white/5 text-center text-[16px] font-black outline-none transition-all focus:border-[#fbbf24] ${localVal === '' ? 'text-slate-700' : colorClass}`} value={localVal} onChange={e => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} onFocus={(e) => e.target.select()} />);
};

const TeachersModule: React.FC<TeachersModuleProps> = ({
   teachers = [], setTeachers, classes = [], setClasses, editMode, setEditMode, schedule = [],
   allClasses = [], allLessons = [], setActiveModule, onNavigateToClass, onDeleteTeacher, onDeleteTeacherDB, initialTeacherId,
   initialTab, activeTab, schoolConfig, onSuccess, onWatchModeAttempt, userRole, currentUserId
}) => {
   const isAdmin = useMemo(() => {
      if (userRole === UserRole.ADMIN) return true;
      const r = String(userRole || '').toUpperCase();
      return r === 'ADMIN' || r === 'İDARECİ' || r === 'YÖNETİCİ';
   }, [userRole]);

   const [searchTerm, setSearchTerm] = useState('');
   const [shiftFilter, setShiftFilter] = useState<'TÜMÜ' | ShiftType>('TÜMÜ');
   const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(initialTeacherId || null);
   // Shortened Tab Names
   const [activeDetailTab, setActiveDetailTab] = useState<'GENEL' | 'AJANDA' | 'ŞUBE' | 'PLAN' | 'SINAV' | 'KISIT' | 'PERF' | 'ÖĞRENCİ'>((initialTab as any) || 'GENEL');
   const [activeAssignActionId, setActiveAssignActionId] = useState<string | null>(null);
   const [activeListActionId, setActiveListActionId] = useState<string | null>(null);
   const [isDrawerOpen, setIsDrawerOpen] = useState(false);
   const [drawerMode, setDrawerMode] = useState<'ADD' | 'EDIT'>('ADD');
   const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);

   const [teacherData, setTeacherData] = useState({ name: '', branchShorts: [] as string[], lessonCount: 22, shift: ShiftType.SABAH, gender: Gender.MALE, username: '', password: '' });
   const [credentials, setCredentials] = useState({ username: '', password: '' });

   const [isBranchPickerOpen, setIsBranchPickerOpen] = useState(false);
   const [branchSearchTerm, setBranchSearchTerm] = useState('');

   // YOKLAMA TERMİNALİ STATE
   const [isAttendanceTerminalOpen, setIsAttendanceTerminalOpen] = useState(false);
   const [attendanceViewMode, setAttendanceViewMode] = useState<'SCANNER' | 'LIST'>('LIST');
   const [attendanceTarget, setAttendanceTarget] = useState<ScheduleEntry | null>(null);
   const [selectedStudentNumbers, setSelectedStudentNumbers] = useState<string[]>([]);
   const [showSummary, setShowSummary] = useState(false);
   const [isUploadingProof, setIsUploadingProof] = useState(false);
   const [attendanceSearchTerm, setAttendanceSearchTerm] = useState('');

   // DİJİTAL SINIF DEFTERİ (LESSON LOG) STATE
   const [isLogModalOpen, setIsLogModalOpen] = useState(false);
   const [logTarget, setLogTarget] = useState<ScheduleEntry | null>(null);
   const [logForm, setLogForm] = useState<{ subject: string, homework: string }>({ subject: '', homework: '' });

   // SINIF DEFTERİ YÖNETİCİSİ (MANUEL/HISTORY MODE) STATE
   const [isClassLogManagerOpen, setIsClassLogManagerOpen] = useState(false);
   const [classLogManagerTarget, setClassLogManagerTarget] = useState<{ classId: string, className: string, lessonName: string } | null>(null);
   const [manualLogForm, setManualLogForm] = useState({ date: new Date().toISOString().split('T')[0], hour: 1, subject: '', homework: '' });

   // NOT TERMİNALİ VE TARAYICI STATE
   const [isGradeTerminalOpen, setIsGradeTerminalOpen] = useState(false);
   const [gradeSearchTerm, setGradeSearchTerm] = useState('');
   const [isGradeScannerOpen, setIsGradeScannerOpen] = useState(false);
   const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
   const [gradeTerminalTarget, setGradeTerminalTarget] = useState<{ classId: string, className: string, lessonId: string, lessonName: string } | null>(null);

   // SINAV PLANLAMA STATE
   const [isExamSchedulerOpen, setIsExamSchedulerOpen] = useState(false);
   const [examSchedulerTarget, setExamSchedulerTarget] = useState<{ classId: string, className: string, lessonId: string, lessonName: string } | null>(null);
   const [examSchedulerForm, setExamSchedulerForm] = useState<{ date: string, slot: string }>({ date: '', slot: 'exam1' });

   // SINAV DÜZENLEME VE SİLME STATE
   const [isEditExamModalOpen, setIsEditExamModalOpen] = useState(false);
   const [examToEdit, setExamToEdit] = useState<Exam & { classId: string, className: string, lessonName: string } | null>(null);
   const [editExamForm, setEditExamForm] = useState<{ date: string, slot: string }>({ date: '', slot: '' });
   const [activeExamMenuId, setActiveExamMenuId] = useState<string | null>(null);
   const [examToDelete, setExamToDelete] = useState<Exam & { classId: string, lessonName: string, date: string } | null>(null);

   // CEVAP ANAHTARI STATE
   const [lessonAnswerKeys, setLessonAnswerKeys] = useState<Record<string, Record<string, Record<'A' | 'B', Record<string, { key: string, points: number }>>>>>({});
   const [activeKeyGroup, setActiveKeyGroup] = useState<'A' | 'B'>('A');
   const [questionCount, setQuestionCount] = useState<number>(20); // Dinamik Soru Sayısı

   const [activeSemester, setActiveSemester] = useState<1 | 2>(1);
   const [activeExamSlot, setActiveExamSlot] = useState<number>(1); // 1-4 yazılı, 5 sözlü

   const [capturedImage, setCapturedImage] = useState<string | null>(null);
   const [isAnalyzing, setIsAnalyzing] = useState(false);
   const [analysisTimer, setAnalysisTimer] = useState(0);
   const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);

   const [scanPreview, setScanPreview] = useState<{ studentName: string, studentNumber: string, score: number, corrects: number, wrongs: number, empties: number, studentId: string, examGroup: string, details?: any } | null>(null);

   // ÖĞRENCİ DETAYLARI
   const [viewingStudentAttendance, setViewingStudentAttendance] = useState<StudentWithContext | null>(null);
   const [studentModalTab, setStudentModalTab] = useState<'ATTENDANCE' | 'GRADES' | 'OBSERVATIONS'>('ATTENDANCE');
   const [observationText, setObservationText] = useState('');
   const [isSavingObservation, setIsSavingObservation] = useState(false);
   const [attendanceMonth, setAttendanceMonth] = useState(new Date());
   const [selectedDayCorrection, setSelectedDayCorrection] = useState<{ date: string, records: AttendanceRecord[] } | null>(null);
   const [proofImageToView, setProofImageToView] = useState<string | null>(null);

   const videoRef = useRef<HTMLVideoElement>(null);
   const gradeVideoRef = useRef<HTMLVideoElement>(null);
   const gradeImageInputRef = useRef<HTMLInputElement>(null);
   const timerIntervalRef = useRef<number | null>(null);

   const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
   const [selectedContextTab, setSelectedContextTab] = useState<string | null>(null);

   // DAILY ABSENCE REPORT STATE
   const [isAbsenceReportModalOpen, setIsAbsenceReportModalOpen] = useState(false);

   // QR Code State
   const [isQRModalOpen, setIsQRModalOpen] = useState(false);
   const [qrData, setQrData] = useState<string>('');
   const [qrTeacherName, setQrTeacherName] = useState<string>('');

   const handleAddObservation = async () => {
      if (!viewingStudentAttendance || !observationText.trim()) return;
      setIsSavingObservation(true);
      try {
         const newObservation = {
            id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
            teacherName: teachers.find(t => t.id === currentUserId)?.name || 'ÖĞRETMEN',
            content: observationText.trim(),
            date: new Date().toLocaleDateString('tr-TR'),
            timestamp: Date.now()
         };

         const currentObservations = viewingStudentAttendance.observations || [];
         const updatedObservations = [newObservation, ...currentObservations];

         const { error } = await supabase.from('students').update({
            observations: updatedObservations
         }).eq('id', viewingStudentAttendance.id);

         if (error) throw error;

         // Update local state
         const updatedStudent = { ...viewingStudentAttendance, observations: updatedObservations };
         setViewingStudentAttendance(updatedStudent);

         // Update classes state
         setClasses(prev => prev.map(c => {
            if (c.students?.some(s => s.id === updatedStudent.id)) {
               return {
                  ...c,
                  students: c.students?.map(s => s.id === updatedStudent.id ? updatedStudent : s)
               };
            }
            return c;
         }));

         setObservationText('');
         onSuccess('Gözlem notu eklendi');
      } catch (error: any) {
         console.error('Observation save error:', error);
         onSuccess('Hata: ' + error.message);
      } finally {
         setIsSavingObservation(false);
      }
   };

   const renderStudentObservations = () => {
      if (!viewingStudentAttendance) return null;
      const obsList = viewingStudentAttendance.observations || [];

      return (
         <div className="space-y-4 animate-in slide-in-from-bottom-2">
            <div className="bg-[#1e293b]/60 border border-white/5 p-4 rounded-sm">
               <span className="text-[10px] font-black text-[#a855f7] uppercase tracking-[0.4em] block mb-3">YENİ KANAAT / GÖZLEM EKLE</span>
               <div className="space-y-3">
                  <textarea
                     className="w-full bg-black/40 border border-white/10 p-3 text-[11px] font-bold text-white outline-none focus:border-[#a855f7] transition-all min-h-[80px] resize-none rounded-sm"
                     placeholder="Öğrenci hakkında gözlem veya kanaat notunuzu buraya yazın..."
                     value={observationText}
                     onChange={(e) => setObservationText(e.target.value)}
                  />
                  <div className="flex justify-end">
                     <button
                        onClick={handleAddObservation}
                        disabled={isSavingObservation || !observationText.trim()}
                        className={`px-6 h-9 bg-[#a855f7] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all border border-white/10 ${isSavingObservation || !observationText.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                     >
                        {isSavingObservation ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                     </button>
                  </div>
               </div>
            </div>

            <div className="space-y-3">
               <div className="flex items-center gap-2 mb-2">
                  <i className="fa-solid fa-history text-slate-500 text-xs"></i>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">GEÇMİŞ GÖZLEMLER ({obsList.length})</span>
               </div>

               {obsList.length > 0 ? (
                  obsList.map(obs => (
                     <div key={obs.id} className="bg-black/20 border border-white/5 p-3 rounded-sm relative group hover:bg-black/40 transition-all">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#a855f7]/50"></div>
                        <p className="text-[11px] font-medium text-white/90 pl-2 leading-relaxed italic">"{obs.content}"</p>
                        <div className="flex justify-between items-center mt-2 pl-2 border-t border-white/5 pt-2">
                           <span className="text-[9px] font-black text-[#a855f7] uppercase tracking-wider">{obs.teacherName}</span>
                           <span className="text-[8px] font-bold text-slate-600 uppercase">{obs.date}</span>
                        </div>
                     </div>
                  ))
               ) : (
                  <div className="py-12 text-center opacity-30 border border-dashed border-white/5">
                     <i className="fa-solid fa-comment-slash text-2xl mb-2 text-slate-600"></i>
                     <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">HENÜZ GÖZLEM BULUNMUYOR</p>
                  </div>
               )}
            </div>
         </div>
      );
   };

   useEffect(() => {
      if (userRole === UserRole.TEACHER && currentUserId) {
         setSelectedTeacherId(currentUserId);
      }
   }, [userRole, currentUserId, teachers]);

   useEffect(() => {
      if (activeTab) {
         setActiveDetailTab(activeTab as any);
      }
   }, [activeTab]);

   // RESET MODAL STATE ON STUDENT CHANGE
   useEffect(() => {
      if (viewingStudentAttendance) {
         setAttendanceMonth(new Date());
         setSelectedDayCorrection(null);
         setProofImageToView(null);
      }
   }, [viewingStudentAttendance?.id]);

   const teacher = useMemo(() => teachers.find(t => t.id === selectedTeacherId), [teachers, selectedTeacherId]);

   // MISSING CALCULATIONS
   const totalHours = useMemo(() => {
      if (!teacher) return 0;
      return allClasses.reduce((acc, cls) => acc + (cls.assignments?.filter(a => a.teacherId === teacher.id).reduce((s, a) => s + a.hours, 0) || 0), 0);
   }, [allClasses, teacher]);

   const isOwnProfile = userRole === UserRole.TEACHER && currentUserId === teacher?.id;
   const canEditCredentials = isOwnProfile || (userRole === UserRole.ADMIN && editMode);

   const timingStats = useMemo(() => {
      if (!teacher) return { dutyDays: 0, gapsCount: 0 };
      const dutyDaysCount = teacher.guardDuties?.length || 0;

      let gaps = 0;
      const teacherSchedule = schedule.filter(s => s.ogretmen && s.ogretmen.toUpperCase() === teacher.name.toUpperCase());

      DAYS_SHORT.forEach(day => {
         const dayLessons = teacherSchedule
            .filter(s => standardizeDayCode(s.gun) === day)
            .map(s => s.ders_saati)
            .sort((a, b) => a - b);

         if (dayLessons.length > 1) {
            for (let i = 0; i < dayLessons.length - 1; i++) {
               const diff = dayLessons[i + 1] - dayLessons[i];
               if (diff > 1) {
                  gaps += (diff - 1);
               }
            }
         }
      });

      return { dutyDays: dutyDaysCount, gapsCount: gaps };
   }, [teacher, schedule]);

   const teacherAssignments = useMemo(() => {
      if (!teacher) return [];
      const list: any[] = [];
      allClasses.forEach(cls => {
         cls.assignments?.forEach(asn => {
            if (asn.teacherId === teacher.id) {
               const lesson = allLessons.find(l => l.id === asn.lessonId);
               list.push({
                  classId: cls.id,
                  className: cls.name,
                  lessonId: asn.lessonId,
                  lesson,
                  hours: asn.hours,
                  classShift: cls.shift
               });
            }
         });
      });
      return list;
   }, [allClasses, teacher, allLessons]);

   const myExams = useMemo(() => {
      if (!teacher) return [];
      const examsList: any[] = [];
      allClasses.forEach(cls => {
         (cls.exams || []).forEach(ex => {
            const isMyLesson = cls.assignments?.some(a => a.lessonId === ex.lessonId && a.teacherId === teacher.id);
            if (isMyLesson) {
               const lesson = allLessons.find(l => l.id === ex.lessonId);
               examsList.push({
                  ...ex,
                  className: cls.name,
                  classId: cls.id,
                  lessonName: lesson?.name || 'DERS'
               });
            }
         });
      });
      return examsList.sort((a, b) => {
         // Simple date parse for sort
         const parseDate = (d: string) => {
            if (!d) return 0;
            if (d.includes('-')) { const p = d.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime(); }
            const p = d.split('.'); return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
         };
         return parseDate(a.date) - parseDate(b.date);
      });
   }, [allClasses, teacher, allLessons]);

   const performanceStats = useMemo(() => {
      if (!teacher) return [];
      return teacherAssignments.map(assign => {
         const cls = allClasses.find(c => c.id === assign.classId);
         if (!cls) return null;
         const students = cls.students || [];
         if (students.length === 0) return { ...assign, studentCount: 0, average: 0 };

         let totalAvg = 0;
         let count = 0;
         students.forEach(s => {
            const g = s.grades?.find(gr => gr.lessonId === assign.lessonId);
            if (g && g.average) {
               totalAvg += g.average;
               count++;
            }
         });
         return {
            className: cls.name,
            lessonName: assign.lesson?.name,
            studentCount: students.length,
            average: count > 0 ? Math.round(totalAvg / count) : 0
         };
      }).filter(Boolean) as any[];
   }, [teacherAssignments, allClasses]);

   const myCourseLoad = useMemo(() => {
      return teacherAssignments.map(a => ({
         uniqueId: `${a.classId}-${a.lessonId}`,
         classId: a.classId,
         className: a.className,
         lessonId: a.lessonId,
         lessonName: a.lesson?.name || ''
      }));
   }, [teacherAssignments]);

   const dailyAbsenceReport = useMemo(() => {
      const todayStr = new Date().toLocaleDateString('tr-TR');
      const grouped: Record<string, { student: Student, className: string, records: AttendanceRecord[] }> = {};

      allClasses.forEach(cls => {
         const hasTeacher = cls.assignments?.some(a => a.teacherId === teacher?.id);
         if (!hasTeacher) return;

         (cls.students || []).forEach(student => {
            (student.attendanceHistory || []).forEach(record => {
               if (record.date === todayStr && record.status === 'ABSENT' && record.teacherName === teacher?.name) {
                  if (!grouped[student.id]) {
                     grouped[student.id] = { student, className: cls.name, records: [] };
                  }
                  grouped[student.id].records.push(record);
               }
            });
         });
      });

      return Object.values(grouped).sort((a, b) => {
         // Sort by Class Name, then Student Number
         const classCompare = a.className.localeCompare(b.className);
         if (classCompare !== 0) return classCompare;
         return parseInt(a.student.number) - parseInt(b.student.number);
      });
   }, [allClasses, teacher]);

   // Auto-select first class in Students tab (defined here to access myCourseLoad)
   useEffect(() => {
      if (activeDetailTab === 'ÖĞRENCİ' && !selectedContextTab && myCourseLoad.length > 0) {
         setSelectedContextTab(myCourseLoad[0].uniqueId);
      }
   }, [activeDetailTab, selectedContextTab, myCourseLoad]);

   const studentsInSelectedContext = useMemo((): StudentWithContext[] => {
      if (!selectedContextTab) return [];
      const ctx = myCourseLoad.find(c => c.uniqueId === selectedContextTab);
      if (!ctx) return [];
      const cls = allClasses.find(c => c.id === ctx.classId);
      if (!cls) return [];

      return (cls.students || []).map(s => {
         const g = s.grades?.find(gr => gr.lessonId === ctx.lessonId);

         const attendance = s.attendanceHistory?.filter(h => {
            if (h.status !== 'ABSENT') return false;

            // 1. Doğrudan ID Eşleşmesi
            if (h.lessonName === ctx.lessonId) return true;

            // 2. İsim Eşleşmesi (Tam)
            if (h.lessonName === ctx.lessonName) return true;

            // 3. Lesson ID Çözümleme ve Eşleştirme
            const lessonObj = allLessons.find(l => l.name === h.lessonName || l.id === h.lessonName);
            if (lessonObj && lessonObj.id === ctx.lessonId) return true;

            return false;
         }).length || 0;

         return {
            ...s,
            displayGrade: g?.average,
            displayAbsent: attendance
         };
      });
   }, [selectedContextTab, myCourseLoad, allClasses, allLessons]);

   const handleUpdateGradeTerminal = (classId: string, studentId: string, lessonId: string, field: string, value: number | undefined, metadata?: GradeMetadata) => {
      setClasses((prev: ClassSection[]) => prev.map(c => {
         if (c.id === classId) {
            const students = (c.students || []).map(s => {
               if (s.id === studentId) {
                  const grades = [...(s.grades || [])];
                  let gradeIndex = grades.findIndex(g => g.lessonId === lessonId);
                  let newGrade: GradeRecord;

                  if (gradeIndex === -1) {
                     newGrade = { lessonId, [field]: value, metadata: metadata ? { [field]: metadata } : undefined };
                     grades.push(newGrade);
                  } else {
                     const existing = grades[gradeIndex];
                     newGrade = {
                        ...existing,
                        [field]: value,
                        metadata: {
                           ...(existing.metadata || {}),
                           ...(metadata ? { [field]: metadata } : {})
                        }
                     };
                     grades[gradeIndex] = newGrade;
                  }

                  // Recalculate average
                  const fields = ['exam1', 'exam2', 'exam3', 'exam4', 'exam5', 'exam6', 'exam7', 'exam8', 'oral1', 'oral2'];
                  let sum = 0;
                  let count = 0;
                  fields.forEach(f => {
                     const v = (newGrade as any)[f];
                     if (v !== undefined) {
                        sum += v;
                        count++;
                     }
                  });
                  newGrade.average = count > 0 ? Math.round(sum / count) : undefined;

                  return { ...s, grades };
               }
               return s;
            });
            return { ...c, students };
         }
         return c;
      }));
   };

   const renderStudentAttendanceCalendar = () => {
      if (!viewingStudentAttendance) return null;
      const daysInMonth = new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth() + 1, 0).getDate();
      const startDay = new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth(), 1).getDay() || 7;
      const days = [];
      for (let i = 1; i < startDay; i++) days.push(<div key={`empty-${i}`} className="h-14 bg-black/20 border border-white/5"></div>);
      for (let d = 1; d <= daysInMonth; d++) {
         const dateStr = `${d < 10 ? '0' + d : d}.${(attendanceMonth.getMonth() + 1) < 10 ? '0' + (attendanceMonth.getMonth() + 1) : (attendanceMonth.getMonth() + 1)}.${attendanceMonth.getFullYear()}`;
         const records = viewingStudentAttendance.attendanceHistory?.filter(h => h.date === dateStr && h.status === 'ABSENT');
         const hasAbsent = records && records.length > 0;

         days.push(
            <div key={d} className={`h-14 border border-white/5 p-1 relative ${hasAbsent ? 'bg-red-900/20' : 'bg-[#1e293b]/40'}`}>
               <span className="text-[10px] font-black text-slate-500 absolute top-1 left-1">{d}</span>
               {hasAbsent && <div className="mt-4 text-[8px] font-black text-red-500 text-center">{records?.length} DERS</div>}
            </div>
         );
      }
      return (
         <div className="space-y-4">
            <div className="flex items-center justify-between bg-black/40 p-2 border border-white/5">
               <button onClick={() => setAttendanceMonth(new Date(attendanceMonth.setMonth(attendanceMonth.getMonth() - 1)))} className="text-white"><i className="fa-solid fa-chevron-left"></i></button>
               <span className="text-[11px] font-black text-[#fbbf24] uppercase">{attendanceMonth.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span>
               <button onClick={() => setAttendanceMonth(new Date(attendanceMonth.setMonth(attendanceMonth.getMonth() + 1)))} className="text-white"><i className="fa-solid fa-chevron-right"></i></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
               {['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS', 'PAZ'].map(day => <div key={day} className="text-center text-[9px] font-black text-slate-500 py-1">{day}</div>)}
               {days}
            </div>

            {/* PAST ABSENCES LIST */}
            <div className="bg-[#1e293b]/60 border border-white/5 p-4 rounded-sm mt-4">
               <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] block mb-3">
                  DEVAMSIZLIK LİSTESİ ({(viewingStudentAttendance.attendanceHistory?.filter(h => h.status === 'ABSENT') || []).length})
               </span>
               <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {(viewingStudentAttendance.attendanceHistory?.filter(h => h.status === 'ABSENT') || []).length > 0 ? (
                     viewingStudentAttendance.attendanceHistory?.filter(h => h.status === 'ABSENT').slice().reverse().map(rec => {
                        const lessonObj = allLessons.find(l => l.id === rec.lessonName || l.name === rec.lessonName);
                        const displayLessonName = lessonObj ? (lessonObj.name || rec.lessonName) : rec.lessonName;
                        return (
                           <div key={rec.id} className="bg-black/20 border-l-2 border-red-500 p-2 flex justify-between items-center group hover:bg-black/40 transition-all">
                              <div>
                                 <span className="text-[10px] font-medium text-white/80 block uppercase truncate">{standardizeBranchCode(displayLessonName)}</span>
                                 <span className="text-[8px] text-slate-500 font-bold uppercase">{rec.date} | {rec.period}. DERS</span>
                              </div>
                              <span className="text-[8px] font-black text-slate-600 uppercase group-hover:text-slate-400 transition-colors">{rec.teacherName}</span>
                           </div>
                        );
                     })
                  ) : (
                     <div className="text-center opacity-30 py-4 text-[9px] uppercase tracking-widest border border-dashed border-white/10">KAYIT YOK</div>
                  )}
               </div>
            </div>
         </div>
      );
   };

   const renderStudentGrades = () => {
      if (!viewingStudentAttendance) return null;
      return (
         <div className="space-y-2">
            {viewingStudentAttendance.grades?.map(g => {
               const lesson = allLessons.find(l => l.id === g.lessonId);
               return (
                  <div key={g.lessonId} className="bg-[#1e293b] border border-white/5 p-3">
                     <div className="flex justify-between mb-2">
                        <span className="text-[11px] font-medium text-white/80 truncate">{lesson?.name || 'DERS'}</span>
                        <span className={`text-[12px] font-black ${(g.average || 0) < 50 ? 'text-red-500' : 'text-white'}`}>{g.average || '-'}</span>
                     </div>
                     <div className="grid grid-cols-10 gap-1">
                        {[g.exam1, g.exam2, g.exam3, g.exam4, g.oral1, g.exam5, g.exam6, g.exam7, g.exam8, g.oral2].map((v, i) => (
                           <div key={i} className="h-6 bg-black/40 flex items-center justify-center text-[8px] font-bold text-slate-400 border border-white/5">
                              {v || '-'}
                           </div>
                        ))}
                     </div>
                  </div>
               );
            })}
         </div>
      );
   };

   const filteredBranches = [
      { code: 'MATE', name: 'MATEMATİK' }, { code: 'FIZI', name: 'FİZİK' },
      { code: 'KIMY', name: 'KİMYA' }, { code: 'BIYO', name: 'BİYOLOJİ' },
      { code: 'TDEB', name: 'TÜRK DİLİ EDB.' }, { code: 'TARI', name: 'TARİH' },
      { code: 'COGR', name: 'COĞRAFYA' }, { code: 'FELS', name: 'FELSEFE' },
      { code: 'INGI', name: 'İNGİLİZCE' }, { code: 'ALMA', name: 'ALMANCA' },
      { code: 'BEDE', name: 'BEDEN EĞİTİMİ' }, { code: 'GORS', name: 'GÖRSEL SANATLAR' },
      { code: 'MUZI', name: 'MÜZİK' }, { code: 'DKAB', name: 'DİN KÜLTÜRÜ' },
      { code: 'REHB', name: 'REHBERLİK' }, { code: 'BILI', name: 'BİLİŞİM' },
      { code: 'GENEL', name: 'GENEL' }
   ].filter(b => b.name.includes(branchSearchTerm.toUpperCase()) || b.code.includes(branchSearchTerm.toUpperCase()));

   const toggleBranchSelection = (code: string) => {
      setTeacherData(prev => {
         const exists = prev.branchShorts.includes(code);
         return {
            ...prev,
            branchShorts: exists ? prev.branchShorts.filter(b => b !== code) : [...prev.branchShorts, code]
         };
      });
   };

   useEffect(() => {
      if (teacher) {
         setCredentials({ username: teacher.username || '', password: teacher.password || '' });
      }
   }, [teacher]);

   const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { const target = e.target; if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select(); };

   const startAnalysisTimer = () => { setAnalysisTimer(0); setAnalysisLogs(["SİSTEM_BAŞLATILIYOR...", "GÖRÜNTÜ_DNA_İŞLENİYOR..."]); timerIntervalRef.current = window.setInterval(() => { setAnalysisTimer(prev => prev + 1); }, 1000); };
   const stopAnalysisTimer = () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };

   // ... Handlers ...
   const handleStartAttendance = (entry: ScheduleEntry) => {
      setAttendanceTarget(entry);
      setAttendanceViewMode('LIST');
      setCapturedImage(null);
      setAnalysisLogs([]);
      setShowSummary(false);
      setIsUploadingProof(false);
      setAttendanceSearchTerm('');

      const todayStr = new Date().toLocaleDateString('tr-TR');
      const classObj = allClasses.find(c => c.name === entry.sinif);
      if (classObj) {
         const existingAbsentees = (classObj.students || [])
            .filter(s => s.attendanceHistory?.some(h =>
               h.date === todayStr &&
               h.period === entry.ders_saati &&
               h.status === 'ABSENT'
            ))
            .map(s => s.number);
         setSelectedStudentNumbers(existingAbsentees);
      } else { setSelectedStudentNumbers([]); }
      setIsAttendanceTerminalOpen(true);
   };

   const handleOpenLogModal = (entry: ScheduleEntry) => {
      setLogTarget(entry);
      setLogForm({ subject: '', homework: '' });
      const todayStr = new Date().toLocaleDateString('tr-TR');
      const classObj = allClasses.find(c => c.name === entry.sinif);
      if (classObj && classObj.lessonLogs) {
         const existingLog = classObj.lessonLogs.find(l => l.date === todayStr && l.hour === entry.ders_saati);
         if (existingLog) { setLogForm({ subject: existingLog.subject, homework: existingLog.homework }); }
      }
      setIsLogModalOpen(true);
   };

   const handleSaveLog = () => {
      if (!logTarget || !teacher) return;
      if (!logForm.subject) return;
      const todayStr = new Date().toLocaleDateString('tr-TR');
      setClasses((currentClasses: ClassSection[]) => {
         return currentClasses.map(c => {
            if (c.name === logTarget.sinif) {
               const currentLogs = c.lessonLogs || [];
               const existingIndex = currentLogs.findIndex(l => l.date === todayStr && l.hour === logTarget.ders_saati);
               const newLog: LessonLog = {
                  id: existingIndex !== -1 ? currentLogs[existingIndex].id : `LOG-${Date.now()}-${logTarget.sinif}-${logTarget.ders_saati}`,
                  date: todayStr,
                  hour: logTarget.ders_saati,
                  subject: logForm.subject,
                  homework: logForm.homework,
                  teacherId: teacher.id,
                  timestamp: Date.now()
               };
               let updatedLogs = [...currentLogs];
               if (existingIndex !== -1) { updatedLogs[existingIndex] = newLog; } else { updatedLogs.push(newLog); }
               return { ...c, lessonLogs: updatedLogs };
            }
            return c;
         });
      });
      setIsLogModalOpen(false);
      onSuccess("DEFTER_İŞLENDİ");
   };

   const handleOpenEditExam = (exam: any) => {
      let dateVal = exam.date;
      // Format conversion to YYYY-MM-DD for input
      if (dateVal.includes('.')) {
         const [d, m, y] = dateVal.split('.');
         dateVal = `${y}-${m}-${d}`;
      }
      setExamToEdit(exam);
      setEditExamForm({ date: dateVal, slot: exam.slot });
      setIsEditExamModalOpen(true);
      setActiveExamMenuId(null); // Close menu
   };

   const handleUpdateExam = () => {
      if (!examToEdit || !editExamForm.date) return;

      // Format conversion back to DD.MM.YYYY for storage
      const parts = editExamForm.date.split('-');
      const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;

      setClasses(prev => prev.map(c => {
         if (c.id === examToEdit.classId) {
            return {
               ...c,
               exams: (c.exams || []).map(e => e.id === examToEdit.id ? { ...e, date: formattedDate, slot: editExamForm.slot as any } : e)
            };
         }
         return c;
      }));
      setIsEditExamModalOpen(false);
      onSuccess("SINAV GÜNCELLENDİ");
   };

   const handleOpenClassLogManager = (classId: string, className: string, lessonName: string) => { setClassLogManagerTarget({ classId, className, lessonName }); setManualLogForm({ date: new Date().toISOString().split('T')[0], hour: 1, subject: '', homework: '' }); setIsClassLogManagerOpen(true); };
   const handleSaveManualLog = () => { if (!classLogManagerTarget || !teacher || !manualLogForm.subject) return; const parts = manualLogForm.date.split('-'); const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`; setClasses((currentClasses: ClassSection[]) => { return currentClasses.map(c => { if (c.id === classLogManagerTarget.classId) { const newLog: LessonLog = { id: `LOG-MAN-${Date.now()}`, date: formattedDate, hour: manualLogForm.hour, subject: manualLogForm.subject, homework: manualLogForm.homework, teacherId: teacher.id, timestamp: Date.now() }; return { ...c, lessonLogs: [...(c.lessonLogs || []), newLog] }; } return c; }); }); setManualLogForm(prev => ({ ...prev, subject: '', homework: '' })); onSuccess("GİRİŞ DEFTERE EKLENDİ"); };
   const handleSaveExamSchedule = () => { if (!examSchedulerTarget || !examSchedulerForm.date) return; const parts = examSchedulerForm.date.split('-'); const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`; const newExam: Exam = { id: `EX-${Date.now()}`, lessonId: examSchedulerTarget.lessonId, slot: examSchedulerForm.slot as any, date: formattedDate, status: 'PLANNED' }; setClasses(prev => prev.map(c => { if (c.id === examSchedulerTarget.classId) { return { ...c, exams: [...(c.exams || []), newExam] }; } return c; })); setIsExamSchedulerOpen(false); setExamSchedulerForm({ date: '', slot: 'exam1' }); onSuccess(`SINAV TARİHİ KAYDEDİLDİ: ${formattedDate}`); };

   const executeDeleteExam = () => {
      if (!examToDelete) return;
      setClasses(prev => prev.map(c => { if (c.id === examToDelete.classId) { return { ...c, exams: (c.exams || []).filter(e => e.id !== examToDelete.id) }; } return c; }));
      setExamToDelete(null);
      onSuccess("SINAV TAKVİMDEN SİLİNDİ");
   };

   const processOpticalData = async (img: string) => { if (!attendanceTarget) return; setIsAnalyzing(true); startAnalysisTimer(); try { setAnalysisLogs(prev => [...prev, "SEÇİCİ_SÜTUN_TARAMASI_BAŞLATILDI...", `HEDEF: ${attendanceTarget.ders_saati}. DERS SÜTUNU`]); const classObj = allClasses.find(c => c.name === attendanceTarget.sinif); const students = classObj?.students || []; const numbers = students.map(s => s.number); const result = await analyzeAttendanceImage(img, numbers, attendanceTarget.ders_saati); const detected = (result.results || []).map((r: any) => r.studentNumber).filter((num: string) => numbers.includes(num)); const rawLogs = result.logs || []; setAnalysisLogs(prev => [...prev, ...rawLogs, `${detected.length} ÖĞRENCİ DNA EŞLEŞTİ`]); setSelectedStudentNumbers(detected); setAttendanceViewMode('LIST'); if (detected.length > 0) onSuccess(`${detected.length} ÖĞRENCİ TESPİT EDİLDİ`); else onSuccess("ANALİZ_TEMİZ: BU SÜTUN BOŞ"); } catch (e) { onSuccess("TARAMA HATASI: MANUEL GİRİŞE GEÇİN"); } finally { setIsAnalyzing(false); stopAnalysisTimer(); } };
   const uploadProofImage = async (base64Image: string, className: string, lesson: string, type: 'attendance' | 'exam'): Promise<string | undefined> => { try { const byteCharacters = atob(base64Image.split(',')[1]); const byteNumbers = new Array(byteCharacters.length); for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); } const byteArray = new Uint8Array(byteNumbers); const blob = new Blob([byteArray], { type: 'image/jpeg' }); const fileName = `${type}_${className}_${lesson}_${Date.now()}.jpg`.replace(/\s+/g, '_'); const bucket = type === 'attendance' ? 'attendance_proofs' : 'exam_proofs'; const filePath = `proofs/${fileName}`; const { data, error } = await supabase.storage.from(bucket).upload(filePath, blob, { contentType: 'image/jpeg', upsert: true }); if (error) { console.error("Storage Error:", error); return undefined; } const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath); return publicUrlData.publicUrl; } catch (error) { console.error("Upload Error:", error); return undefined; } };
   const finalizeAttendanceCommit = async () => { if (!attendanceTarget || !teacher) return; const classObj = allClasses.find(c => c.name === attendanceTarget.sinif); if (!classObj) return; setIsUploadingProof(true); let proofUrl: string | undefined = undefined; if (capturedImage) { proofUrl = await uploadProofImage(capturedImage, attendanceTarget.sinif, attendanceTarget.ders, 'attendance'); } const timestamp = Date.now(); const dateStr = new Date().toLocaleDateString('tr-TR'); setClasses((currentClasses: ClassSection[]) => { return currentClasses.map(c => { if (c.id === classObj.id) { const updatedStudents = (c.students || []).map(s => { const isSelected = selectedStudentNumbers.includes(s.number); const existingRecordIndex = (s.attendanceHistory || []).findIndex(h => h.date === dateStr && h.period === attendanceTarget.ders_saati); if (isSelected && existingRecordIndex === -1) { const newRecord: AttendanceRecord = { id: `ATT-${timestamp}-${s.id}-${attendanceTarget.ders_saati}`, date: dateStr, lessonName: attendanceTarget.ders, status: 'ABSENT', period: attendanceTarget.ders_saati, teacherName: teacher.name, proofImageUrl: proofUrl, method: capturedImage ? 'OPTICAL' : 'MANUAL', timestamp }; return { ...s, attendanceHistory: [...(s.attendanceHistory || []), newRecord], attendanceCount: (s.attendanceCount || 0) + 1 }; } if (!isSelected && existingRecordIndex !== -1) { const newHistory = [...(s.attendanceHistory || [])]; newHistory.splice(existingRecordIndex, 1); return { ...s, attendanceHistory: newHistory, attendanceCount: Math.max(0, (s.attendanceCount || 0) - 1) }; } return s; }); return { ...c, students: updatedStudents }; } return c; }); }); setIsUploadingProof(false); setShowSummary(false); setIsAttendanceTerminalOpen(false); onSuccess("YOKLAMA VERİTABANINA İŞLENDİ"); };
   const getTargetField = (): keyof GradeRecord => { if (activeExamSlot === 5) return activeSemester === 1 ? 'oral1' : 'oral2'; const base = activeSemester === 1 ? 0 : 4; return `exam${base + activeExamSlot}` as keyof GradeRecord; };
   const updateAnswerKey = (qIdx: number, key: string, points: number) => { if (!gradeTerminalTarget) return; const lessonId = gradeTerminalTarget.lessonId; const field = getTargetField(); setLessonAnswerKeys(prev => { const lessonKeys = prev[lessonId] || {}; const examKeys = lessonKeys[field] || { A: {}, B: {} }; const groupKeys = examKeys[activeKeyGroup] || {}; groupKeys[qIdx] = { key, points }; return { ...prev, [lessonId]: { ...lessonKeys, [field]: { ...examKeys, [activeKeyGroup]: groupKeys } } }; }); };
   useEffect(() => { if (isGradeTerminalOpen && gradeTerminalTarget) { const classObj = allClasses.find(c => c.id === gradeTerminalTarget.classId); if (classObj && classObj.exams) { const currentSlot = getTargetField(); const loadedKeys: any = {}; classObj.exams.forEach(ex => { if (ex.lessonId === gradeTerminalTarget.lessonId && ex.answerKey) { if (!loadedKeys[ex.lessonId]) loadedKeys[ex.lessonId] = {}; loadedKeys[ex.lessonId][ex.slot] = ex.answerKey; } }); if (Object.keys(loadedKeys).length > 0) { setLessonAnswerKeys(prev => ({ ...prev, ...loadedKeys })); } } } }, [isGradeTerminalOpen, gradeTerminalTarget, allClasses]);
   const handleSaveAnswerKey = () => { if (!gradeTerminalTarget) return; const lessonId = gradeTerminalTarget.lessonId; const slot = activeExamSlot === 5 ? (activeSemester === 1 ? 'oral1' : 'oral2') : `exam${(activeSemester === 1 ? 0 : 4) + activeExamSlot}`; const targetField = getTargetField(); const currentKeys = lessonAnswerKeys[lessonId]?.[targetField]; if (currentKeys) { setClasses(prev => prev.map(c => { if (c.id === gradeTerminalTarget.classId) { let updatedExams = [...(c.exams || [])]; const examIndex = updatedExams.findIndex(e => e.lessonId === lessonId && e.slot === slot as any); if (examIndex !== -1) { updatedExams[examIndex] = { ...updatedExams[examIndex], answerKey: currentKeys }; } else { updatedExams.push({ id: `EX-KEY-${Date.now()}`, lessonId, slot: slot as any, date: new Date().toLocaleDateString('tr-TR'), status: 'PLANNED', answerKey: currentKeys }); } return { ...c, exams: updatedExams }; } return c; })); onSuccess("CEVAP ANAHTARI KAYDEDİLDİ"); } setIsAnswerKeyModalOpen(false); };
   const processGradeScan = async (img: string) => { if (!gradeTerminalTarget) return; setIsAnalyzing(true); startAnalysisTimer(); try { setAnalysisLogs(prev => [...prev, "SINAV_KAĞIDI_DNA_ANALİZİ_BAŞLATILDI..."]); const classObj = allClasses.find(c => c.id === gradeTerminalTarget.classId); const studentNumbers = (classObj?.students || []).map(s => s.number); const targetField = getTargetField(); const currentKeys = lessonAnswerKeys[gradeTerminalTarget.lessonId]?.[targetField] || { A: {}, B: {} }; const result = await analyzeGradeImage(img, studentNumbers, currentKeys, targetField); if (result && result.studentNumber) { const student = classObj?.students?.find(s => s.number === result.studentNumber || s.number.padStart(4, '0') === result.studentNumber.padStart(4, '0')); if (student) { setScanPreview({ studentName: student.name, studentNumber: student.number, score: result.score || 0, corrects: result.correctCount || 0, wrongs: result.wrongCount || 0, empties: result.emptyCount || 0, studentId: student.id, examGroup: result.examGroup || 'A', details: result }); onSuccess(`DNA EŞLEŞTİ: ${student.name} (${result.score} PUAN)`); } else { setAnalysisLogs(prev => [...prev, `HATA: ${result.studentNumber} NUMARALI ÖĞRENCİ DNA KAYITLARINDA YOK.`]); onSuccess("ÖĞRENCİ BULUNAMADI"); } } else { setAnalysisLogs(prev => [...prev, "HATA: GÖRÜNTÜ OKUNAMADI VEYA NUMARA TESPİT EDİLEMEDİ."]); onSuccess("TARAMA BAŞARISIZ"); } } catch (e) { setAnalysisLogs(prev => [...prev, "SİSTEMSEL ANALİZ HATASI."]); onSuccess("SİSTEM HATASI"); } finally { setIsAnalyzing(false); stopAnalysisTimer(); } };
   const handleApplyScanResult = async () => { if (scanPreview && gradeTerminalTarget) { let proofUrl: string | undefined = undefined; if (capturedImage) { proofUrl = await uploadProofImage(capturedImage, gradeTerminalTarget.className, gradeTerminalTarget.lessonName, 'exam'); } const field = getTargetField(); const metadata: GradeMetadata = { proofUrl, studentAnswers: scanPreview.details?.detectedChoices, correctCount: scanPreview.corrects, wrongCount: scanPreview.wrongs, emptyCount: scanPreview.empties, examGroup: scanPreview.examGroup, analyzedAt: Date.now() }; handleUpdateGradeTerminal(gradeTerminalTarget.classId, scanPreview.studentId, gradeTerminalTarget.lessonId, field, scanPreview.score, metadata); onSuccess(`DNA_MÜHÜRLENDİ: ${scanPreview.studentName} -> ${scanPreview.score}`); setScanPreview(null); setCapturedImage(null); setIsGradeScannerOpen(false); } };
   const handleGradeImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (evt) => { const imgData = evt.target?.result as string; setCapturedImage(imgData); setIsGradeScannerOpen(true); processGradeScan(imgData); }; reader.readAsDataURL(file); } if (gradeImageInputRef.current) gradeImageInputRef.current.value = ''; };
   useEffect(() => { const startCamera = async (ref: React.RefObject<HTMLVideoElement | null>) => { try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' } }); if (ref.current) ref.current.srcObject = stream; } catch (err) { console.error("Kamera hatası:", err); } }; if (isAttendanceTerminalOpen && attendanceViewMode === 'SCANNER' && !capturedImage) startCamera(videoRef); if (isGradeScannerOpen && !capturedImage) startCamera(gradeVideoRef); return () => { [videoRef, gradeVideoRef].forEach(ref => { if (ref.current && ref.current.srcObject) { (ref.current.srcObject as MediaStream).getTracks().forEach(track => track.stop()); } }); }; }, [isAttendanceTerminalOpen, isGradeScannerOpen, capturedImage, attendanceViewMode]);

   // MODAL AÇILDIĞINDA SORU SAYISINI AUTOMATİK BELİRLE
   useEffect(() => {
      if (isAnswerKeyModalOpen && gradeTerminalTarget) {
         const lessonId = gradeTerminalTarget.lessonId;
         const field = getTargetField();
         const currentKeys = lessonAnswerKeys[lessonId]?.[field] || {};
         let maxQ = 20;
         ['A', 'B'].forEach(grp => {
            const grpKeys = currentKeys[grp as 'A' | 'B'] || {};
            const indices = Object.keys(grpKeys).map(Number);
            if (indices.length > 0) {
               const m = Math.max(...indices);
               if (m > maxQ) maxQ = m;
            }
         });
         const allowed = [10, 20, 25, 40, 50, 100];
         let selected = 20;
         for (const n of allowed) {
            if (maxQ <= n) { selected = n; break; }
            selected = 100;
         }
         setQuestionCount(selected);
      }
   }, [isAnswerKeyModalOpen, gradeTerminalTarget]);

   const planShiftView = useMemo(() => teacher?.preferredShift || ShiftType.SABAH, [teacher]);
   const HOURS = useMemo(() => { const count = planShiftView === ShiftType.SABAH ? schoolConfig.morningPeriodCount : schoolConfig.afternoonPeriodCount; const arr = []; for (let i = 1; i <= count; i++) arr.push(i); return arr; }, [schoolConfig, planShiftView]);
   const dailyAgenda = useMemo(() => {
      if (!teacher || !teacher.name) return [];
      const dayIdx = new Date().getDay();
      // Pazar (0) veya Cumartesi (6) ise boş dön
      // Ancak kullanıcı hafta sonu da olsa Pazartesi planını görmek istemiyorsa boş liste dönmeli.
      // Ekranda "BUGÜNKÜ DERS AKIŞI" yazıyor.
      if (dayIdx === 0 || dayIdx === 6) return [];

      const todayName = DAYS[dayIdx - 1];
      if (!todayName) return [];

      const dayShort = standardizeDayCode(todayName);
      return schedule.filter(s => {
         if (standardizeDayCode(s.gun) !== dayShort) return false;
         const og = (s.ogretmen || '').toUpperCase();
         const tn = teacher.name.toUpperCase();
         const ti = (teacher.id || '').toUpperCase();
         if (og === tn) return true;
         if (og === ti) return true;
         const parts = teacher.name.trim().split(/\s+/);
         if (parts.length > 1) {
            const fmt = `${parts[0][0]}.${parts[parts.length - 1]}`.toUpperCase();
            if (og === fmt) return true;
         }
         return false;
      }).sort((a, b) => a.ders_saati - b.ders_saati);
   }, [teacher, schedule]);
   // ... (Other calculations unchanged) ...
   const filtered = useMemo(() => { const term = searchTerm.toLowerCase(); return teachers.filter(t => { if (!t) return false; const bShorts = t.branchShorts || [t.branchShort || '']; const matchSearch = (t.name || '').toLowerCase().includes(term) || bShorts.some(b => b.toLowerCase().includes(term)); return matchSearch && (shiftFilter === 'TÜMÜ' || (t.preferredShift || ShiftType.SABAH) === shiftFilter); }); }, [teachers, searchTerm, shiftFilter]);
   const teacherStats = useMemo(() => ({ male: teachers.filter(t => t.gender === Gender.MALE).length, female: teachers.filter(t => t.gender === Gender.FEMALE).length }), [teachers]);
   const groupedTeachers = useMemo(() => { const groups: Record<string, Teacher[]> = {}; filtered.forEach(t => { if (!t) return; const branch = (t.branchShorts && t.branchShorts.length > 0) ? t.branchShorts[0] : (t.branchShort || 'DİĞER'); const normalizedBranch = standardizeBranchCode(branch); if (!groups[normalizedBranch]) groups[normalizedBranch] = []; groups[normalizedBranch].push(t); }); return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)); }, [filtered]);
   const handleToggleBlockedSlot = (day: string, hour: number) => { if (!editMode || !teacher) return onWatchModeAttempt?.(); const slot = `${standardizeDayCode(day)}-${hour}`; const currentBlocked = teacher.blockedSlots || []; const isBlocked = currentBlocked.includes(slot); setTeachers(teachers.map(t => t.id === teacher.id ? { ...t, blockedSlots: isBlocked ? currentBlocked.filter(s => s !== slot) : [...currentBlocked, slot] } : t)); onSuccess(isBlocked ? "SLOT_ERİŞİME_AÇILDI" : "SLOT_KAPATILDI"); };

   const printOpticalForm = () => {
      if (!gradeTerminalTarget) return;
      const w = window.open('', '_blank');
      if (!w) { alert("Lütfen açılır pencere engelleyicisini kapatın."); return; }

      const qCount = questionCount;
      let colCount = 2; // Default for 20
      if (qCount <= 10) colCount = 1;
      else if (qCount <= 25) colCount = 2;
      else if (qCount <= 60) colCount = 3;
      else colCount = 4;

      const qPerCol = Math.ceil(qCount / colCount);

      const htmlContent = `
         <!DOCTYPE html>
         <html lang="tr">
         <head>
            <meta charset="UTF-8">
            <title>${gradeTerminalTarget.lessonName} - Optik Form</title>
            <style>
               @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap');
               @page { size: A4 landscape; margin: 0; }
               body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: white; display: flex; width: 297mm; height: 210mm; }
               .page-a5 { width: 148.5mm; height: 210mm; position: relative; box-sizing: border-box; padding: 10mm; border-right: 1px dashed #ccc; display: flex; flex-direction: column; }
               .page-a5:last-child { border-right: none; }
               .marker { position: absolute; width: 5mm; height: 5mm; background: black; }
               .tl { top: 7mm; left: 7mm; } .tr { top: 7mm; right: 7mm; } .bl { bottom: 7mm; left: 7mm; } .br { bottom: 7mm; right: 7mm; }
               .header { text-align: center; margin-bottom: 3mm; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-top: 5mm; }
               .school-name { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
               .exam-name { font-size: 11pt; font-weight: 800; margin-top: 2mm; text-transform: uppercase; }
               .exam-meta { font-size: 7pt; font-weight: bold; color: #555; margin-top: 1mm; text-transform: uppercase; }
               .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; font-size: 8pt; margin-bottom: 4mm; font-weight: bold; }
               .field { border: 1px solid #000; padding: 2mm; display: flex; flex-direction: column; gap: 1mm; height: 10mm; justify-content: center; }
               .label { font-size: 6pt; text-transform: uppercase; color: #666; font-weight: bold; letter-spacing: 0.5px; }
               .questions-container { flex: 1; display: flex; gap: 3mm; align-items: flex-start; justify-content: center; padding-top: 2mm; }
               .col { flex: 1; display: flex; flex-direction: column; gap: 1.25mm; }
               .q-row { display: flex; align-items: center; justify-content: flex-end; }
               .q-no { min-width: 5mm; text-align: right; margin-right: 1.5mm; font-weight: bold; font-size: 8pt; font-family: 'Roboto Mono', monospace; }
               .options { display: flex; gap: 1.2mm; }
               .opt { width: 4mm; height: 4mm; border: 1px solid #333; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 5pt; font-weight: bold; color: #333; }
               .footer { margin-top: auto; text-align: center; font-size: 6pt; color: #999; border-top: 1px solid #ddd; padding-top: 2mm; }
               .footer-code { font-family: 'Roboto Mono', monospace; letter-spacing: 2px; }
               @media print { body { -webkit-print-color-adjust: exact; } .page-a5 { border-right: none; } }
            </style>
         </head>
         <body>
            ${renderPage(gradeTerminalTarget.className, activeExamSlot)}
            ${renderPage(gradeTerminalTarget.className, activeExamSlot)}
         </body>
         </html>
      `;

      function renderPage(clsName: string, slot: any) {
         return `
            <div class="page-a5">
               <div class="marker tl"></div><div class="marker tr"></div><div class="marker bl"></div><div class="marker br"></div>
               <div class="header">
                  <div class="school-name">CEVAP FORMU</div>
                  <div class="exam-name">${gradeTerminalTarget?.lessonName}</div>
                  <div class="exam-meta">${clsName} | ${slot === 5 ? 'SÖZLÜ' : slot + '. YAZILI'} | ${new Date().toLocaleDateString('tr-TR')}</div>
               </div>
               <div class="info-grid">
                  <div class="field"><span class="label">AD SOYAD</span></div> <div class="field"><span class="label">NUMARA</span></div>
                  <div class="field"><span class="label">SINIF</span><span style="font-size:9pt">${clsName}</span></div>
                  <div class="field" style="flex-direction:row; align-items:center; justify-content:space-between;"><span class="label">KİTAPÇIK</span> <div style="display:flex; gap:2mm;"><div style="border:1px solid #000; width:4mm; height:4mm; display:flex; align-items:center; justify-content:center; font-size:6pt;">A</div><div style="border:1px solid #000; width:4mm; height:4mm; display:flex; align-items:center; justify-content:center; font-size:6pt;">B</div></div></div>
               </div>
               <div class="questions-container">
                  ${Array.from({ length: colCount }).map((_, cIdx) => `
                     <div class="col">
                        ${Array.from({ length: qPerCol }).map((_, rIdx) => {
            const qNum = cIdx * qPerCol + rIdx + 1;
            if (qNum > qCount) return '';
            return `
                              <div class="q-row">
                                 <div class="q-no">${qNum}</div>
                                 <div class="options">
                                    ${['A', 'B', 'C', 'D', 'E'].map(o => `<div class="opt">${o}</div>`).join('')}
                                 </div>
                              </div>`;
         }).join('')}
                     </div>
                  `).join('')}
               </div>
               <div class="footer"><div class="footer-code">SENKRON-V3-${qCount}-${new Date().getFullYear()}</div></div>
            </div>`;
      }
      w.document.write(htmlContent); w.document.close();
   };
   const handleToggleTeacherShift = () => { if (!editMode || !teacher) return onWatchModeAttempt?.(); const newShift = teacher.preferredShift === ShiftType.SABAH ? ShiftType.OGLE : ShiftType.SABAH; setTeachers(teachers.map(t => t.id === teacher.id ? { ...t, preferredShift: newShift } : t)); onSuccess(`VARDİYA_DEĞİŞTİRİLDİ: ${newShift}`); };
   const handleOpenAdd = () => { if (!editMode) return onWatchModeAttempt?.(); setDrawerMode('ADD'); setTeacherData({ name: '', branchShorts: [], lessonCount: 22, shift: ShiftType.SABAH, gender: Gender.MALE, username: '', password: '' }); setIsDrawerOpen(true); };
   const handleEditTeacher = (t: Teacher) => { setEditingTeacherId(t.id); setTeacherData({ name: t.name || '', branchShorts: t.branchShorts || [t.branchShort || ''], lessonCount: t.lessonCount || 22, shift: t.preferredShift || ShiftType.SABAH, gender: t.gender || Gender.MALE, username: t.username || '', password: t.password || '' }); setDrawerMode('EDIT'); setIsDrawerOpen(true); setActiveListActionId(null); };
   const handleSaveTeacher = async () => {
      if (!teacherData.name || teacherData.branchShorts.length === 0) return;

      const standardizedBranchShorts = teacherData.branchShorts.map(b => standardizeBranchCode(b));
      const normalizedUsername = teacherData.username?.trim();

      // Check for duplicate username
      if (normalizedUsername) {
         // Check in teachers list (local state is sufficient for same table check usually, but for strict consistency DB check is better. Here we check local state for speed)
         const isDuplicateTeacher = teachers.some(t => t.username === normalizedUsername && t.id !== editingTeacherId);
         if (isDuplicateTeacher) {
            onSuccess("BU KULLANICI ADI ZATEN BİR ÖĞRETMEN TARAFINDAN KULLANIMDA");
            return;
         }

         // Check in students table (must query DB)
         const { data: existingStudent } = await supabase
            .from('students')
            .select('id')
            .eq('username', normalizedUsername)
            .maybeSingle();

         if (existingStudent) {
            onSuccess("BU KULLANICI ADI BİR ÖĞRENCİ TARAFINDAN KULLANIMDA");
            return;
         }
      }

      // Determine School ID
      const schoolId = (teachers.find(t => (t as any).school_id) as any)?.school_id ||
         (allClasses.find(c => (c as any).school_id) as any)?.school_id;

      if (!schoolId && teachers.length === 0) {
         onSuccess("SİSTEM HATASI: OKUL KİMLİĞİ BULUNAMADI. LÜTFEN SAYFAYI YENİLEYİN.");
         return;
      }

      const dbPayload = {
         name: teacherData.name.toUpperCase().trim(),
         gender: teacherData.gender,
         branch: standardizedBranchShorts[0],
         branch_short: standardizedBranchShorts[0],
         lesson_count: teacherData.lessonCount,
         preferred_shift: teacherData.shift,
         username: normalizedUsername,
         password: teacherData.password,
         school_id: schoolId,
         available_days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
         is_first_login: drawerMode === 'ADD' ? true : undefined
      };

      try {
         if (drawerMode === 'ADD') {
            const { data, error } = await supabase.from('teachers').insert([dbPayload]).select().single();
            if (error) throw error;

            // Map back to local Teacher interface
            const savedTeacher: Teacher = {
               ...data,
               id: data.id,
               branchShort: data.branch_short,
               branchShorts: [data.branch_short],
               preferredShift: data.preferred_shift,
               lessonCount: data.lesson_count,
               availableDays: data.available_days || [],
               blockedSlots: data.blocked_slots || [],
               guardDutyDays: data.guard_duty_days || [],
               isExemptFromDuty: data.is_exempt_from_duty,
               isFirstLogin: data.is_first_login // Mapped property
            };

            setTeachers([...teachers, savedTeacher]);
            onSuccess("PERSONEL KAYDEDİLDİ");
         } else if (editingTeacherId) {
            const { data, error } = await supabase.from('teachers').update(dbPayload).eq('id', editingTeacherId).select().single();
            if (error) throw error;

            setTeachers(teachers.map(t => t.id === editingTeacherId ? {
               ...t,
               ...data,
               branchShort: data.branch_short,
               preferredShift: data.preferred_shift,
               lessonCount: data.lesson_count,
               name: data.name,
               username: data.username,
               password: data.password
            } : t));
            onSuccess("PERSONEL GÜNCELLENDİ");
         }
         setIsDrawerOpen(false);
      } catch (err: any) {
         console.error(err);
         onSuccess("KAYIT HATASI: " + err.message);
      }
   };
   const handleUpdateSelfCredentials = async () => {
      if (!teacher || !credentials.username) return;
      try {
         const { error } = await supabase.from('teachers').update({
            username: credentials.username,
            password: credentials.password
         }).eq('id', teacher.id);

         if (error) throw error;

         setTeachers(teachers.map(t => t.id === teacher.id ? { ...t, username: credentials.username, password: credentials.password } : t));
         onSuccess("KİMLİK BİLGİLERİ GÜNCELLENDİ");
      } catch (err: any) {
         console.error(err);
         onSuccess("GÜNCELLEME HATASI: " + err.message);
      }
   };
   const updateTeacherQuota = (teacherId: string, newVal: number) => { setTeachers(teachers.map(t => t.id === teacherId ? { ...t, lessonCount: Math.max(0, newVal) } : t)); };
   const executeDeleteTeacher = () => { if (!teacherToDelete) return; const idToDel = teacherToDelete.id; if (onDeleteTeacherDB) onDeleteTeacherDB(idToDel); setTeachers(teachers.filter(t => t.id !== idToDel)); setTeacherToDelete(null); };

   const handleToggleDutyExempt = () => {
      if (!editMode || !teacher) return onWatchModeAttempt?.();
      const newVal = !teacher.isExemptFromDuty;
      setTeachers(teachers.map(t => t.id === teacher.id ? { ...t, isExemptFromDuty: newVal } : t));
      onSuccess(newVal ? "PERSONEL NÖBETTEN MUAF TUTULDU" : "NÖBET MUAFİYETİ KALDIRILDI");
   };

   const handleGenerateQR = (t: Teacher) => {
      if (!t.username || !t.password) {
         onSuccess("QR İÇİN KULLANICI ADI VE ŞİFRE GEREKLİ");
         return;
      }
      // School ID is retrieved from the teacher object (dynamic prop) or we assume current session context
      // Since we don't have direct access to schoolId prop, we try to get it from the teacher object if it exists (via any)
      const sid = (t as any).school_id;
      if (!sid) {
         onSuccess("OKUL KİMLİĞİ BULUNAMADI");
         return;
      }

      const url = `${window.location.origin}/?action=qrlimit&u=${t.username}&p=${t.password}&s=${sid}`;
      setQrData(url);
      setQrTeacherName(t.name);
      setIsQRModalOpen(true);
   };

   return (
      <div className="bg-[#0f172a] h-full flex flex-col overflow-hidden relative">
         {/* ABSENCE REPORT MODAL */}
         {isAbsenceReportModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <div className="bg-[#1e293b] border border-white/10 w-full max-w-4xl max-h-[90%] flex flex-col shadow-2xl rounded-sm animate-in zoom-in-95">
                  <div className="flex justify-between items-center p-3 border-b border-white/10 bg-[#0f172a]">
                     <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-500/10 flex items-center justify-center border border-red-500/20">
                           <i className="fa-solid fa-clipboard-user text-red-500 text-sm"></i>
                        </div>
                        <div>
                           <h3 className="text-[11px] font-black text-white uppercase tracking-wider whitespace-nowrap">GÜNLÜK YOKLAMA RAPORU</h3>
                           <p className="text-[9px] font-bold text-slate-500 uppercase">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                     </div>
                     <button onClick={() => setIsAbsenceReportModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white transition-all bg-white/5 hover:bg-red-600 hover:border-red-500 border border-transparent rounded-sm">
                        <i className="fa-solid fa-xmark"></i>
                     </button>
                  </div>

                  <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                     {dailyAbsenceReport.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                           <div className="grid grid-cols-12 gap-1 pb-2 border-b border-white/10 text-[9px] font-black text-slate-500 uppercase tracking-widest px-2">
                              <div className="col-span-2 border-r border-white/5 text-center">DERSLER</div>
                              <div className="col-span-2 border-r border-white/5 pl-2">SINIF</div>
                              <div className="col-span-1 border-r border-white/5 pl-2">NO</div>
                              <div className="col-span-3 border-r border-white/5 pl-2">AD SOYAD</div>
                              <div className="col-span-4 pl-2">DERS ADI</div>
                           </div>
                           {dailyAbsenceReport.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-1 py-1 border-b border-white/5 items-center hover:bg-white/5 transition-all px-2 relative group">
                                 <div className="col-span-2 flex justify-center flex-wrap gap-1">
                                    {item.records
                                       .sort((a, b) => a.period - b.period)
                                       .map((rec, rIdx) => (
                                          <span key={rIdx} className="w-5 h-5 flex items-center justify-center bg-black/40 border border-white/10 text-[9px] font-black text-white rounded-sm">
                                             {rec.period}
                                          </span>
                                       ))}
                                 </div>
                                 <div className="col-span-2 flex items-center">
                                    <span className="text-[9px] font-black text-[#fbbf24] px-1 py-0 bg-[#fbbf24]/10 border border-[#fbbf24]/20 rounded-sm">{item.className}</span>
                                 </div>
                                 <div className="col-span-1 flex items-center">
                                    <span className="text-[9px] font-bold text-slate-400 font-mono">{item.student.number}</span>
                                 </div>
                                 <div className="col-span-3 flex items-center overflow-hidden">
                                    <span className="text-[10px] font-bold text-white uppercase truncate whitespace-nowrap" title={item.student.name}>{item.student.name}</span>
                                 </div>
                                 <div className="col-span-4 flex items-center gap-1 overflow-hidden flex-wrap">
                                    {item.records
                                       .sort((a, b) => a.period - b.period)
                                       .map((rec, rIdx) => {
                                          const lObj = allLessons.find(l => l.id === rec.lessonName || l.name === rec.lessonName);
                                          const displayName = lObj ? (lObj.name || rec.lessonName) : rec.lessonName;
                                          return (
                                             <span key={rIdx} className="text-[8px] font-medium text-white/80 uppercase bg-black/80 border border-white/20 px-2 py-0.5 rounded-sm shadow-sm truncate" title={displayName}>
                                                {displayName}
                                             </span>
                                          );
                                       })}
                                 </div>
                              </div>
                           ))}
                        </div>
                     ) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-30">
                           <i className="fa-solid fa-check-circle text-6xl mb-4 text-green-500"></i>
                           <span className="text-[12px] font-black uppercase tracking-[0.2em] text-white">BUGÜN DEVAMSIZ ÖĞRENCİ YOK</span>
                        </div>
                     )}
                  </div>

                  <div className="p-4 border-t border-white/10 bg-[#0f172a] flex justify-between items-center">
                     <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        TOPLAM: <span className="text-white font-black text-[11px]">{dailyAbsenceReport.length}</span> ÖĞRENCİ
                     </div>
                     <button onClick={() => window.print()} className="px-4 py-2 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 rounded-sm border border-white/10">
                        <i className="fa-solid fa-print"></i> YAZDIR
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* ... (Header) ... */}
         {
            selectedTeacherId && teacher ? (
               <div className="flex flex-col h-full animate-in fade-in duration-200 overflow-hidden relative" onClick={() => { setActiveAssignActionId(null); setActiveExamMenuId(null); }}>
                  <div className="bg-[#0f172a] border-b border-[#64748b]/40 shrink-0">
                     <div className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           {userRole !== UserRole.TEACHER && (
                              <button onClick={() => setSelectedTeacherId(null)} className="w-8 h-8 flex items-center justify-center border border-[#64748b] text-white hover:bg-white/10 active:scale-95 transition-all"><i className="fa-solid fa-arrow-left text-[12px]"></i></button>
                           )}
                           <div>
                              <div className="flex items-center gap-2">
                                 <h2 className="text-[14px] font-black text-white uppercase tracking-tight text-high-contrast">{teacher.name}</h2>
                                 <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${teacher.gender === Gender.FEMALE ? 'bg-pink-500 shadow-[0_0_8px_#ec4899]' : 'bg-slate-500 shadow-[0_0_8px_#64748b]'}`}></div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                 {(teacher.branchShorts || [teacher.branchShort]).map((bs, idx) => bs && (<span key={idx} className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-[#fbbf24]/30 text-[#fbbf24] bg-[#fbbf24]/5">{standardizeBranchCode(bs)}</span>))}
                                 <button onClick={(e) => { e.stopPropagation(); handleToggleTeacherShift(); }} className={`text-[8px] font-black uppercase px-1.5 py-0.5 border transition-all active:scale-95 ${teacher.preferredShift === ShiftType.SABAH ? 'text-[#3b82f6] border-[#3b82f6]/30 bg-[#3b82f6]/5 hover:bg-[#3b82f6]/10' : 'text-[#fcd34d] border-[#fcd34d]/30 bg-[#fcd34d]/5 hover:bg-[#fcd34d]/10'}`}>{teacher.preferredShift || 'SABAH'}</button>
                              </div>
                           </div>
                        </div>
                     </div>
                     {/* Show Tabs ONLY if not in teacher self-view (as these are moved to sidebar) */}
                     {userRole !== UserRole.TEACHER && (
                        <div className="px-3 py-2 flex gap-1 bg-black/40 border-t border-[#64748b]/20 overflow-x-auto no-scrollbar">
                           {['GENEL', 'AJANDA', 'ŞUBE', 'PLAN', 'SINAV', 'KISIT', 'PERF', 'ÖĞRENCİ'].map(tab => (
                              <button key={tab} onClick={() => setActiveDetailTab(tab as any)} className={`flex-1 min-w-[70px] h-10 text-[9px] font-black tracking-[0.2em] transition-all flex items-center justify-center relative overflow-hidden ${activeDetailTab === tab ? 'bg-[#334155] text-white' : 'text-slate-500 hover:text-white'}`}>{activeDetailTab === tab && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3b82f6] shadow-[0_0_100px_rgba(59,130,246,0.3)]"></div>}{tab}</button>
                           ))}
                        </div>
                     )}
                  </div>
                  <div className="flex-1 overflow-hidden p-3 bg-grid-hatched relative">
                     {/* ... Other Tabs Content (GENEL) ... */}
                     {activeDetailTab === 'GENEL' && (
                        <div className="space-y-4 h-full overflow-y-auto no-scrollbar pb-24 animate-in slide-in-from-bottom-2">
                           <div className="bg-[#1e293b]/60 border border-white/10 p-5 shadow-xl flex flex-col relative overflow-hidden rounded-sm">
                              <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em] block">PERSONEL_MESİ_KAPASİTESİ</span>{editMode && <span className="text-[6px] font-bold text-[#3b82f6] uppercase tracking-widest animate-pulse">! DÜZENLEME_AÇIK</span>}</div>
                              <div className="flex items-center gap-4">
                                 <div className="flex items-baseline gap-2">
                                    <span className={`text-[36px] font-black ${totalHours > teacher.lessonCount ? 'text-red-500' : 'text-white'}`}>{totalHours}</span>
                                    <div className="flex items-center group">
                                       <span className="text-[14px] font-black text-slate-500">/</span>
                                       {editMode ? (
                                          <div className="flex items-center gap-1.5 ml-2 bg-black/40 p-1 border border-white/10 rounded-sm">
                                             <button onClick={() => updateTeacherQuota(teacher.id, teacher.lessonCount - 1)} className="w-8 h-8 flex items-center justify-center bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-all"><i className="fa-solid fa-minus text-xs"></i></button>
                                             <input name="quotaInput" type="number" value={teacher.lessonCount === 0 ? '' : teacher.lessonCount} onFocus={handleInputFocus} onChange={(e) => updateTeacherQuota(teacher.id, parseInt(e.target.value) || 0)} className="w-12 h-8 bg-transparent text-center text-[18px] font-black text-[#fbbf24] outline-none" />
                                             <button onClick={() => updateTeacherQuota(teacher.id, teacher.lessonCount + 1)} className="w-8 h-8 flex items-center justify-center bg-green-600/10 text-green-500 hover:bg-green-600 hover:text-white transition-all"><i className="fa-solid fa-plus text-xs"></i></button>
                                          </div>
                                       ) : (<span className="text-[20px] font-black text-slate-400 ml-2">{teacher.lessonCount} s</span>)}
                                    </div>
                                 </div>
                              </div>
                              <div className="mt-6 h-1.5 bg-black/40 w-full overflow-hidden rounded-full"><div className={`h-full transition-all duration-700 ${totalHours > teacher.lessonCount ? 'bg-red-500' : 'bg-[#3b82f6]'}`} style={{ width: `${Math.min(100, (teacher.lessonCount > 0 ? (totalHours / teacher.lessonCount) * 100 : 0))}%` }}></div></div>
                              <div className="flex justify-between items-center mt-3"><span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">VERİMLİLİK_ANALİZİ</span><span className={`text-[10px] font-black uppercase ${(teacher.lessonCount > 0 ? (totalHours / teacher.lessonCount) * 100 : 0) > 100 ? 'text-red-500' : 'text-[#3b82f6]'}`}>%{Math.round(teacher.lessonCount > 0 ? (totalHours / teacher.lessonCount) * 100 : 0)}</span></div>
                           </div>

                           {(isAdmin || userRole === UserRole.TEACHER) && (
                              <div className="bg-[#1e293b]/80 border border-white/5 p-4 shadow-lg relative overflow-hidden rounded-sm group hover:border-[#3b82f6]/40 transition-all">
                                 <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2"><i className="fa-solid fa-key text-[#3b82f6] text-xs"></i><span className="text-[9px] font-black text-white/90 uppercase tracking-widest">HESAP_KİMLİK_BİLGİLERİ</span></div>
                                    {(canEditCredentials || userRole === UserRole.TEACHER) && <span className="text-[7px] font-bold text-green-500 uppercase tracking-widest animate-pulse">DÜZENLEME AKTİF</span>}
                                 </div>
                                 <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                       <div className="flex flex-col gap-1">
                                          <span className="text-[8px] font-bold text-slate-500 uppercase ml-1">KULLANICI ADI</span>
                                          {(canEditCredentials || userRole === UserRole.TEACHER) ? (
                                             <input
                                                className="bg-black border border-white/10 p-2 text-[11px] font-black text-white outline-none focus:border-[#3b82f6] transition-all"
                                                value={credentials.username}
                                                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                                             />
                                          ) : (
                                             <div className="bg-black/30 p-2 border border-white/5 text-[9px] font-black text-white">{teacher.username || 'TANIMSIZ'}</div>
                                          )}
                                       </div>

                                       <div className="flex flex-col gap-1">
                                          <span className="text-[8px] font-bold text-slate-500 uppercase ml-1">ŞİFRE</span>
                                          {(canEditCredentials || userRole === UserRole.TEACHER) ? (
                                             <input
                                                type="text"
                                                className="bg-black border border-white/10 p-2 text-[11px] font-black text-[#fbbf24] outline-none focus:border-[#fbbf24] transition-all"
                                                value={credentials.password}
                                                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                                             />
                                          ) : (
                                             <div className="bg-black/30 p-2 border border-white/5 text-[9px] font-black text-[#fbbf24] font-mono tracking-wider">{teacher.password || 'BELİRLENMEMİŞ'}</div>
                                          )}
                                       </div>
                                    </div>

                                    <div className="flex gap-2 mt-2">
                                       {(canEditCredentials || userRole === UserRole.TEACHER) && (
                                          <button onClick={handleUpdateSelfCredentials} className="flex-1 h-10 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg">GÜNCELLE</button>
                                       )}
                                       <button onClick={() => handleGenerateQR(teacher)} className="h-10 px-4 bg-white text-black font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2" title="Hızlı Giriş QR Kodu">
                                          <i className="fa-solid fa-qrcode"></i> QR
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           )}

                           <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="bg-[#1e293b]/80 border border-white/5 p-4 shadow-lg relative overflow-hidden rounded-sm group hover:border-[#3b82f6]/40 transition-all">
                                 <div className="flex items-center gap-2 mb-4"><i className="fa-solid fa-clock text-[#3b82f6] text-xs"></i><span className="text-[9px] font-black text-white/90 uppercase tracking-widest">ZAMANLAMA_VE_PERİYOT</span></div>
                                 <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-black/30 p-2 border border-white/5"><span className="text-[8px] font-bold text-slate-500 uppercase">VARDİYA</span><span className={`text-[9px] font-black uppercase ${teacher.preferredShift === ShiftType.SABAH ? 'text-[#3b82f6]' : 'text-[#fbbf24]'}`}>{teacher.preferredShift || 'SABAH'}</span></div>
                                    <div className="flex justify-between items-center bg-black/30 p-2 border border-white/5"><span className="text-[8px] font-bold text-slate-500 uppercase">NÖBET_GÜNÜ</span><span className="text-[9px] font-black text-white uppercase truncate ml-2 text-right">{timingStats.dutyDays}</span></div>
                                    <div className="flex justify-between items-center bg-black/30 p-2 border border-white/5"><span className="text-[8px] font-bold text-slate-500 uppercase">BOŞ_DERS_SAYISI</span><div className="flex items-center gap-1.5"><span className={`text-[11px] font-black ${timingStats.gapsCount > 3 ? 'text-red-500' : 'text-green-500'}`}>{timingStats.gapsCount}</span><span className="text-[6px] font-bold text-slate-700 uppercase">PENCERE</span></div></div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}

                     {activeDetailTab === 'AJANDA' && (
                        <div className="space-y-3 h-full overflow-y-auto no-scrollbar pb-24 animate-in slide-in-from-bottom-2">
                           <div className="flex flex-col mb-4 gap-2">
                              <span className="text-[9px] font-black text-[#fbbf24] uppercase tracking-[0.4em] ml-1">BUGÜNKÜ_DERS_AKIŞI</span>
                              <div className="flex items-center justify-end gap-2">
                                 {userRole !== UserRole.TEACHER && (
                                    <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-sm text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                       YÖNETİCİ GÖRÜNÜMÜ
                                    </div>
                                 )}
                                 <button
                                    onClick={() => setIsAbsenceReportModalOpen(true)}
                                    className="px-3 py-1 bg-red-600/10 border border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white transition-all rounded-sm text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
                                 >
                                    <i className="fa-solid fa-clipboard-list"></i>
                                    GÜNLÜK YOKLAMA RAPORU ({dailyAbsenceReport.length})
                                 </button>
                              </div>
                           </div>
                           {dailyAgenda.length > 0 ? dailyAgenda.map((entry, idx) => {
                              const classColor = getSectionColor(entry.sinif);
                              const todayStr = new Date().toLocaleDateString('tr-TR');
                              const classObj = allClasses.find(c => c.name === entry.sinif);
                              const hasLog = classObj?.lessonLogs?.some(l => l.date === todayStr && l.hour === entry.ders_saati);

                              // Ders adını çözümle (ID ise ismini bul)
                              const lessonObj = allLessons.find(l => l.id === entry.ders || l.name === entry.ders);
                              const lessonName = lessonObj ? lessonObj.name : entry.ders;

                              return (
                                 <div key={idx} className="bg-[#1e293b] border border-white/5 p-4 flex flex-col gap-4 shadow-xl relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: classColor }}></div>
                                    <div className="flex items-center gap-4">
                                       <div className="w-10 h-10 border border-white/10 flex flex-col items-center justify-center bg-black/20 shrink-0"><span className="text-[14px] font-black text-white">{entry.ders_saati}</span><span className="text-[6px] font-black text-slate-500 uppercase">SAAT</span></div>
                                       <div className="flex flex-col justify-center min-w-0">
                                          <div className="text-[13px] font-medium text-white/80 uppercase leading-tight truncate">
                                             {lessonName}
                                          </div>
                                          <div className="text-[9px] font-black text-[#3b82f6] uppercase tracking-widest mt-1">{entry.sinif} ŞUBESİ</div>
                                       </div>
                                       <button onClick={(e) => { e.stopPropagation(); setIsAttendanceTerminalOpen(false); setTimeout(() => setIsAttendanceTerminalOpen(false), 100); }} className="ml-auto w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button>
                                    </div>
                                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 w-full">
                                       {!isAdmin && (
                                          <>
                                             <button onClick={(e) => { e.stopPropagation(); handleStartAttendance(entry); }} className="flex-1 h-10 bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] font-black text-[9px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all shadow-lg shadow-[#3b82f6]/10 relative group flex items-center justify-center gap-2" >
                                                {isUploadingProof ? <i className="fa-solid fa-cloud-arrow-up animate-bounce"></i> : <i className="fa-solid fa-clipboard-check"></i>}
                                                <span>YOKLAMA AL</span>
                                                <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] border-2 border-[#1e293b] transition-opacity duration-300 ${isAnalyzing ? 'animate-ping opacity-100' : 'opacity-0'}`}></div>
                                             </button>
                                             <button onClick={(e) => { e.stopPropagation(); handleOpenLogModal(entry); }} className={`h-10 w-12 flex items-center justify-center border font-black text-[12px] uppercase transition-all shadow-lg ${hasLog ? 'bg-[#fbbf24] text-black border-[#fbbf24]' : 'bg-[#fbbf24]/10 border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black'}`}> <i className={`fa-solid ${hasLog ? 'fa-book-open' : 'fa-book'}`}></i> </button>
                                          </>
                                       )}
                                    </div>
                                 </div>);
                           }) : (<div className="py-24 text-center border-2 border-dashed border-white/5 opacity-20"><i className="fa-solid fa-calendar-day text-5xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">BUGÜN İÇİN PLANLI DERS YOK</p></div>)}
                        </div>
                     )}

                     {/* ... Other Tabs Content (ŞUBE, PLAN, ETC.) ... */}
                     {activeDetailTab === 'ŞUBE' && (
                        <div className="h-full overflow-y-auto no-scrollbar pb-24 animate-in slide-in-from-bottom-2">
                           <div className="flex items-center justify-between mb-4"><span className="text-[9px] font-black text-[#fbbf24] uppercase tracking-[0.4em] ml-1">GİRİLEN_ŞUBELER_MATRİSİ</span></div>
                           <div className="grid grid-cols-2 gap-3">
                              {teacherAssignments.length > 0 ? teacherAssignments.map((a, idx) => {
                                 const classColor = getSectionColor(a.className);
                                 const isShiftMismatch = teacher.preferredShift && a.classShift !== teacher.preferredShift;
                                 return (
                                    <div key={idx} className={`bg-[#1e293b] border p-2 flex flex-col gap-1 shadow-md relative overflow-hidden transition-all h-24 ${isShiftMismatch ? 'border-red-600/40 bg-red-950/10' : 'border-white/5 hover:bg-slate-800'}`}>
                                       <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: classColor }}></div>

                                       {/* Üst Satır: Sınıf ve Branş */}
                                       <div className="pl-2 w-full flex justify-between items-start">
                                          <div className="flex flex-col">
                                             <div className="flex items-baseline gap-2">
                                                <span className="text-[16px] font-black text-white leading-none">{a.className}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{standardizeBranchCode(a.lesson?.name || '')}</span>
                                             </div>
                                             <div className="text-[8px] font-medium text-white/80 truncate max-w-[100px] mt-0.5">{a.lesson?.name || 'BELİRSİZ'}</div>
                                          </div>
                                          <div className="flex flex-col items-end gap-1">
                                             <span className={`text-[6px] font-black px-1 py-px border rounded-sm ${a.classShift === ShiftType.SABAH ? 'border-blue-500/30 text-blue-500' : 'border-amber-500/30 text-amber-500'}`}>{a.classShift === ShiftType.SABAH ? 'SAB' : 'ÖĞL'}</span>
                                             <span className="text-[9px] font-black text-white/50">{a.hours}s</span>
                                          </div>
                                       </div>

                                       {isShiftMismatch && <span className="text-[6px] font-black text-red-500 uppercase tracking-tighter mt-1 block animate-pulse pl-2">! UYUMSUZ</span>}

                                       {/* Alt Satır: Aksiyon Butonları */}
                                       <div className="flex items-center gap-1 pl-2 w-full mt-auto">
                                          {!isAdmin && (
                                             <>
                                                <button onClick={(e) => { e.stopPropagation(); setExamSchedulerTarget({ classId: a.classId, className: a.className, lessonId: a.lessonId, lessonName: a.lesson?.name || 'DERS' }); setExamSchedulerForm({ date: '', slot: 'exam1' }); setIsExamSchedulerOpen(true); }} className="h-6 w-6 flex items-center justify-center bg-orange-600/10 border border-orange-500/40 text-orange-500 hover:bg-orange-600 hover:text-white transition-all rounded-sm shrink-0" title="Sınav"> <i className="fa-solid fa-calendar-plus text-[9px]"></i> </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleOpenClassLogManager(a.classId, a.className, a.lesson?.name || 'DERS'); }} className="h-6 w-6 flex items-center justify-center bg-[#22d3ee]/10 border border-[#22d3ee]/40 text-[#22d3ee] hover:bg-[#22d3ee] hover:text-black transition-all rounded-sm shrink-0" title="Defter"> <i className="fa-solid fa-book text-[9px]"></i> </button>
                                                <button onClick={(e) => { e.stopPropagation(); setGradeTerminalTarget({ classId: a.classId, className: a.className, lessonId: a.lessonId, lessonName: a.lesson?.name || '' }); setIsGradeTerminalOpen(true); }} className="h-6 flex-1 border border-[#fbbf24] text-[#fbbf24] bg-[#fbbf24]/5 font-black text-[8px] uppercase tracking-widest hover:bg-[#fbbf24] hover:text-black active:scale-95 transition-all rounded-sm flex items-center justify-center gap-1" >
                                                   <i className="fa-solid fa-pen-nib text-[9px]"></i> NOT
                                                </button>
                                             </>
                                          )}
                                       </div>
                                    </div>);
                              }) : (<div className="col-span-2 py-24 text-center border-2 border-dashed border-white/5 opacity-20"><i className="fa-solid fa-user-slash text-5xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">BU HOCAYA ŞUBE ATANMAMIŞ</p></div>)}
                           </div>
                        </div>
                     )}

                     {/* ... Other Tabs (PLAN, SINAV, KISIT, PERF, ÖĞRENCİ) ... */}
                     {activeDetailTab === 'PLAN' && (
                        <div className="h-full flex flex-col bg-[#0d141b] border border-white/5 overflow-hidden animate-in slide-in-from-bottom-2 shadow-2xl">
                           <table className="w-full h-full border-collapse table-fixed">
                              <thead> <tr className="bg-[#1a242e] border-b border-white/10 sticky top-0 z-10"> <th className="w-10 py-3 border-r border-white/5 text-[8px] font-black text-slate-500 uppercase">H</th> {DAYS_SHORT.map(d => <th key={d} className="text-[9px] font-black text-white tracking-[0.2em]">{d}</th>)} </tr> </thead>
                              <tbody> {HOURS.map(h => (<tr key={h} className="border-b border-white/[0.03]" style={{ height: `${100 / HOURS.length}%` }}> <td className="bg-black/20 border-r border-white/5 text-center text-[10px] font-black text-slate-600">{h}</td> {DAYS_SHORT.map(day => {
                                 const entry = schedule.find(s => { if (!s.ogretmen || !teacher.name) return false; if (standardizeDayCode(s.gun) !== day) return false; if (Number(s.ders_saati) !== Number(h)) return false; const og = s.ogretmen.toUpperCase(); const tn = teacher.name.toUpperCase(); const ti = (teacher.id || '').toUpperCase(); if (og === tn) return true; if (og === ti) return true; const parts = teacher.name.trim().split(/\s+/); if (parts.length > 1) { const fmt = `${parts[0][0]}.${parts[parts.length - 1]}`.toUpperCase(); if (og === fmt) return true; } return false; }); const slotKey = `${day}-${h}`; const isBlocked = teacher.blockedSlots?.includes(slotKey); const lessonObj = entry ? allLessons.find(l => l.id === entry.ders || l.name === entry.ders) : null;
                                 const lessonDisplay = lessonObj ? (lessonObj.name || entry.ders) : entry ? entry.ders : '';
                                 const lessonShort = lessonObj ? standardizeBranchCode(lessonObj.branch || lessonObj.name) : entry ? standardizeBranchCode(entry.ders) : '';
                                 const lessonColor = entry ? getBranchColor(lessonObj?.branch || lessonObj?.name || entry.ders) : 'transparent';
                                 const classColor = entry ? getSectionColor(entry.sinif) : 'transparent';
                                 return (
                                    <td key={slotKey} className={`p-0.5 relative transition-all ${isBlocked ? 'bg-red-950/20' : ''}`}>
                                       {entry ? (
                                          <div className="h-full w-full flex flex-col items-center justify-center bg-[#1e293b] border-l-[3px] shadow-md hover:brightness-125 cursor-pointer" style={{ borderLeftColor: classColor }} title={lessonDisplay}>
                                             <span className="text-[11px] font-black text-white leading-none uppercase">{entry.sinif}</span>
                                             <span className="text-[7px] font-black text-slate-500 uppercase mt-1" style={{ color: lessonColor }}>{lessonShort}</span>
                                          </div>
                                       ) : isBlocked ? (
                                          <div className="h-full w-full border border-dashed border-red-500/20 flex items-center justify-center">
                                             <i className="fa-solid fa-lock text-red-500/20 text-[8px]"></i>
                                          </div>
                                       ) : (
                                          <div className="h-full w-full opacity-[0.02]"></div>
                                       )}
                                    </td>
                                 );
                              })} </tr>))} </tbody>
                           </table>
                        </div>
                     )}

                     {activeDetailTab === 'SINAV' && (
                        <div className="space-y-4 h-full overflow-y-auto no-scrollbar pb-24 animate-in slide-in-from-bottom-2" onClick={() => setActiveExamMenuId(null)}>
                           <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em]">SINAV_TAKVİMİ_MATRİSİ</span></div>
                           {myExams.length > 0 ? myExams.map(exam => {
                              const isMenuOpen = activeExamMenuId === exam.id;

                              // DATE LOGIC
                              let examDateObj: Date;
                              const d = exam.date || '';
                              if (!d) {
                                 examDateObj = new Date();
                              } else if (d.includes('-')) {
                                 const parts = d.split('-');
                                 examDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                              } else {
                                 const parts = d.split('.');
                                 examDateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                              }

                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const utcExam = Date.UTC(examDateObj.getFullYear(), examDateObj.getMonth(), examDateObj.getDate());
                              const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                              const diffDays = Math.ceil((utcExam - utcToday) / (1000 * 60 * 60 * 24));

                              const isPast = diffDays < 0;
                              const isToday = diffDays === 0;

                              return (
                                 <div key={exam.id} className="relative overflow-hidden group">
                                    <div className={`bg-[#1e293b] border border-white/5 p-4 flex items-center justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${isMenuOpen ? '-translate-x-32' : ''} ${isPast ? 'opacity-50 grayscale bg-[#1e293b]/50' : ''}`}>
                                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24]"></div>
                                       <div className="flex items-center gap-4">
                                          <div className="flex flex-col items-center justify-center w-12 h-12 bg-black/20 border border-white/10 rounded-sm">
                                             <span className="text-[14px] font-black text-white">{(exam.date || '').split('.')[0]}</span>
                                             <span className="text-[6px] font-bold text-slate-500 uppercase">{(exam.date || '').split('.')[1] || 'AY'}</span>
                                          </div>
                                          <div className="flex flex-col">
                                             <span className="text-[11px] font-medium text-white/80 uppercase truncate">{exam.lessonName}</span>
                                             <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{exam.className}</span>
                                                <span className="text-[7px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-1.5 py-0.5 border border-[#fbbf24]/20 uppercase">{exam.slot.replace('exam', '').toUpperCase()}. YAZILI</span>

                                                {/* STATUS BADGE */}
                                                {isPast ? (
                                                   <span className="text-[7px] font-bold text-green-500 uppercase tracking-widest ml-2 border border-green-500/30 px-1">TAMAMLANDI</span>
                                                ) : isToday ? (
                                                   <span className="text-[7px] font-black text-red-500 uppercase tracking-widest ml-2 animate-pulse">BUGÜN</span>
                                                ) : (
                                                   <span className="text-[7px] font-bold text-slate-300 uppercase tracking-widest ml-2">{diffDays} GÜN KALDI</span>
                                                )}
                                             </div>
                                          </div>
                                       </div>

                                       {/* 3 DOTS MENU TRIGGER */}
                                       {!isAdmin && (
                                          <div className="flex items-center h-full pl-4 border-l border-white/5 ml-2">
                                             <button
                                                onClick={(e) => { e.stopPropagation(); setActiveExamMenuId(isMenuOpen ? null : exam.id); }}
                                                className={`w-8 h-8 flex items-center justify-center transition-all rounded-full hover:bg-white/5 ${isMenuOpen ? 'text-[#3b82f6]' : 'text-slate-500'}`}
                                             >
                                                <i className="fa-solid fa-ellipsis-vertical text-lg"></i>
                                             </button>
                                          </div>
                                       )}
                                    </div>

                                    {/* SLIDING MENU */}
                                    <div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ zIndex: 20 }}>
                                       <button onClick={(e) => { e.stopPropagation(); handleOpenEditExam(exam); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all pointer-events-auto shadow-lg">
                                          <i className="fa-solid fa-pen text-xs mb-1"></i>
                                          <span className="text-[6px] font-black uppercase tracking-widest">DÜZENLE</span>
                                       </button>
                                       <button onClick={(e) => { e.stopPropagation(); setExamToDelete({ ...exam, classId: exam.classId, lessonName: exam.lessonName || 'DERS', date: exam.date }); setActiveExamMenuId(null); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all pointer-events-auto shadow-lg">
                                          <i className="fa-solid fa-trash-can text-xs mb-1"></i>
                                          <span className="text-[6px] font-black uppercase tracking-widest">SİL</span>
                                       </button>
                                    </div>
                                 </div>
                              )
                           }) : (
                              <div className="py-24 text-center border-2 border-dashed border-white/5 opacity-20">
                                 <i className="fa-solid fa-calendar-xmark text-5xl mb-4"></i>
                                 <p className="text-[10px] font-black uppercase tracking-[0.4em]">SINAV TAKVİMİ BOŞ</p>
                              </div>
                           )}
                        </div>
                     )}

                     {activeDetailTab === 'KISIT' && (
                        <div className="h-full flex flex-col bg-[#0d141b] border border-white/5 overflow-hidden animate-in slide-in-from-bottom-2 shadow-2xl relative">
                           {/* Dedicated Toolbar Space for Duty Exempt Button */}
                           <div className="h-12 flex items-center justify-end px-4 border-b border-white/5 bg-[#1a242e]/50 shrink-0">
                              <button
                                 onClick={() => {
                                    if (!editMode || !teacher) return onWatchModeAttempt?.();
                                    const newVal = !teacher.isExemptFromDuty;
                                    setTeachers(teachers.map(t => t.id === teacher.id ? { ...t, isExemptFromDuty: newVal } : t));
                                    onSuccess(newVal ? "PERSONEL NÖBETTEN MUAF TUTULDU" : "NÖBET MUAFİYETİ KALDIRILDI");
                                 }}
                                 className={`px-4 py-1.5 border font-black text-[9px] uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 rounded-sm ${teacher.isExemptFromDuty ? 'bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)] animate-pulse' : 'bg-black/40 border-white/10 text-slate-500 hover:text-white hover:border-white/20'}`}
                              >
                                 <i className={`fa-solid ${teacher.isExemptFromDuty ? 'fa-ban' : 'fa-shield-halved'}`}></i>
                                 {teacher.isExemptFromDuty ? 'NÖBET MUAF' : 'NÖBET YAZILABİLİR'}
                              </button>
                           </div>

                           {/* Table without legends */}
                           <table className="w-full h-full border-collapse table-fixed">
                              <thead> <tr className="bg-[#1a242e] border-b border-white/10 sticky top-0 z-10"> <th className="w-10 py-3 border-r border-white/5 text-[8px] font-black text-slate-500 uppercase">H</th> {DAYS_SHORT.map(d => <th key={d} className="text-[9px] font-black text-white tracking-[0.2em]">{d}</th>)} </tr> </thead>
                              <tbody> {(HOURS && HOURS.length > 0 ? HOURS : [1, 2, 3, 4, 5, 6, 7, 8]).map(h => (<tr key={h} className="border-b border-white/[0.03]" style={{ height: `${100 / (HOURS?.length || 8)}%` }}> <td className="bg-black/20 border-r border-white/5 text-center text-[10px] font-black text-slate-600">{h}</td> {DAYS_SHORT.map(day => {
                                 const slotKey = `${day}-${h}`;
                                 const isBlocked = teacher.blockedSlots?.includes(slotKey);
                                 return (
                                    <td key={slotKey} onClick={() => handleToggleBlockedSlot(day, h)} className={`p-0.5 relative transition-all cursor-pointer hover:brightness-110 ${isBlocked ? 'bg-red-950/40' : ''}`}>
                                       {isBlocked ? (<div className="h-full w-full flex items-center justify-center border border-dashed border-red-500/30"><i className="fa-solid fa-lock text-red-500 text-lg shadow-[0_0_15px_rgba(239,68,68,0.4)]"></i></div>) : <div className="h-full w-full opacity-[0.02]"></div>}
                                    </td>
                                 );
                              })} </tr>))} </tbody>
                           </table>
                        </div>
                     )}

                     {activeDetailTab === 'PERF' && (
                        <div className="space-y-4 h-full overflow-y-auto no-scrollbar pb-24 animate-in slide-in-from-bottom-2">
                           <span className="text-[10px] font-black text-white uppercase tracking-[0.4em] ml-1">SINIF_BAZLI_BAŞARI_ANALİZİ</span>
                           <div className="grid grid-cols-1 gap-3">
                              {performanceStats.length > 0 ? performanceStats.map((stat, idx) => (
                                 <div key={idx} className="bg-[#1e293b] border border-white/5 p-4 shadow-xl relative overflow-hidden group">
                                    <div className="flex justify-between items-center mb-3">
                                       <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <div className="w-10 h-10 flex items-center justify-center bg-black/20 border border-white/10 font-black text-white text-sm">{stat.className}</div>
                                          <div className="flex flex-col min-w-0 flex-1">
                                             <span className="text-[11px] font-medium text-white/80 uppercase truncate">{stat.lessonName}</span>
                                             <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{stat.studentCount} ÖĞRENCİ</span>
                                          </div>
                                       </div>
                                       <div className="text-right">
                                          <span className={`text-[20px] font-black leading-none ${stat.average < 50 ? 'text-red-500' : stat.average >= 85 ? 'text-green-500' : 'text-[#fbbf24]'}`}>{stat.average}</span>
                                          <span className="text-[6px] font-bold text-slate-600 uppercase block tracking-widest">ORTALAMA</span>
                                       </div>
                                    </div>
                                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                       <div className={`h-full transition-all duration-1000 ${stat.average < 50 ? 'bg-red-600' : stat.average >= 85 ? 'bg-green-500' : 'bg-[#fbbf24]'}`} style={{ width: `${stat.average}%` }}></div>
                                    </div>
                                 </div>
                              )) : (
                                 <div className="py-24 text-center border-2 border-dashed border-white/5 opacity-20">
                                    <i className="fa-solid fa-chart-pie text-5xl mb-4"></i>
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">ANALİZ VERİSİ YETERSİZ</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     )}

                     {activeDetailTab === 'ÖĞRENCİ' && (
                        <div className="h-full flex flex-col animate-in slide-in-from-bottom-2">
                           <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-2 shrink-0">
                              {myCourseLoad.map(ctx => (
                                 <button
                                    key={ctx.uniqueId}
                                    onClick={() => setSelectedContextTab(ctx.uniqueId)}
                                    className={`px-3 py-2 border text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedContextTab === ctx.uniqueId ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-lg' : 'bg-black/40 border-white/10 text-slate-500 hover:text-white'}`}
                                 >
                                    {ctx.className} - {standardizeBranchCode(ctx.lessonName)}
                                 </button>
                              ))}
                           </div>

                           {/* STUDENT LIST HEADER WITH GENDER STATS */}
                           {studentsInSelectedContext.length > 0 && (
                              <div className="flex items-center gap-4 px-2 mb-2">
                                 <span className="text-[10px] font-black text-white uppercase tracking-[0.4em]">ÖĞRENCİ LİSTESİ ({studentsInSelectedContext.length})</span>
                                 <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-pink-500 flex items-center gap-1 bg-pink-500/5 px-1.5 py-0.5 rounded-sm border border-pink-500/20"><i className="fa-solid fa-venus text-[8px]"></i> {studentsInSelectedContext.filter(s => s.gender === Gender.FEMALE).length}</span>
                                    <span className="text-[9px] font-bold text-blue-500 flex items-center gap-1 bg-blue-500/5 px-1.5 py-0.5 rounded-sm border border-blue-500/20"><i className="fa-solid fa-mars text-[8px]"></i> {studentsInSelectedContext.filter(s => s.gender === Gender.MALE).length}</span>
                                 </div>
                              </div>
                           )}

                           <div className="flex-1 overflow-y-auto no-scrollbar pb-24 bg-grid-hatched border-t border-white/5 pt-2">
                              {studentsInSelectedContext.length > 0 ? (
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {studentsInSelectedContext.map(s => {
                                       const avg = s.displayGrade || 0;
                                       const statusColor = avg < 50 ? 'text-red-500' : avg >= 85 ? 'text-green-500' : 'text-white';

                                       return (
                                          <div
                                             key={s.id}
                                             onClick={() => setViewingStudentAttendance(s)}
                                             className="bg-[#1e293b]/80 border border-white/5 p-2 flex items-center justify-between hover:bg-slate-800 cursor-pointer group transition-all"
                                          >
                                             <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-8 h-8 rounded-sm flex items-center justify-center border font-black text-[10px] shrink-0 ${s.gender === Gender.FEMALE ? 'border-pink-500/30 text-pink-500 bg-pink-500/5' : 'border-blue-500/30 text-blue-500 bg-blue-500/5'}`}>
                                                   <div className="flex flex-col items-center leading-none gap-0.5">
                                                      <span>{s.number}</span>
                                                      <i className={`fa-solid ${s.gender === Gender.FEMALE ? 'fa-venus' : 'fa-mars'} text-[6px] opacity-50`}></i>
                                                   </div>
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                   <span className="text-[9px] font-medium text-white/80 uppercase truncate leading-tight">{s.name}</span>
                                                   <div className="flex items-center gap-2 mt-0.5">
                                                      <span className="text-[8px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-1 border border-[#fbbf24]/20">{myCourseLoad.find(c => c.uniqueId === selectedContextTab)?.className || 'ŞUBE'}</span>
                                                      <span className={`text-[8px] font-bold ${s.displayAbsent && s.displayAbsent > 0 ? 'text-red-500' : 'text-slate-500'}`}>{s.displayAbsent || 0} DEVAMSIZ</span>
                                                   </div>
                                                </div>
                                             </div>
                                             <div className="text-right pl-2">
                                                <span className={`text-[14px] font-black ${statusColor}`}>{avg || '--'}</span>
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              ) : (
                                 <div className="py-24 text-center opacity-20">
                                    <i className="fa-solid fa-users-slash text-5xl mb-4"></i>
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">BU SINIFTA ÖĞRENCİ YOK</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            ) : (
               // ... (General Teacher List View - Unchanged) ...
               <div className="space-y-4 h-full flex flex-col overflow-hidden animate-slide-up relative px-1">
                  <div className="flex flex-col gap-3 shrink-0">
                     <div className="flex gap-2 items-center">
                        <div className="flex-1 relative h-11">
                           <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#3b82f6] text-[10px]"></i>
                           <input type="text" placeholder="KADRO ARA..." className="w-full h-full bg-black border border-[#64748b]/40 pl-11 pr-4 text-[11px] font-black uppercase text-white outline-none focus:border-[#3b82f6]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-1 bg-black/40 border border-[#64748b]/40 h-11 px-3 items-center rounded-sm shrink-0">
                           <div className="flex items-center gap-1.5 mr-2"><i className="fa-solid fa-mars text-[#3b82f6] text-[10px]"></i><span className="text-[10px] font-black text-white">{teacherStats.male}</span></div>
                           <div className="w-px h-4 bg-white/10"></div>
                           <div className="flex items-center gap-1.5 ml-2"><i className="fa-solid fa-venus text-pink-500 text-[10px]"></i><span className="text-[10px] font-black text-white">{teacherStats.female}</span></div>
                        </div>
                        {editMode && <button onClick={handleOpenAdd} className="px-5 h-11 bg-[#3b82f6] text-white font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all hover:brightness-110"><i className="fa-solid fa-plus mr-2"></i> EKLE</button>}
                     </div>
                     <div className="flex gap-1.5 px-0.5">{['TÜMÜ', ShiftType.SABAH, ShiftType.OGLE].map(f => (<button key={f} onClick={() => setShiftFilter(f as any)} className={`flex-1 h-9 text-[9px] font-black uppercase tracking-widest border transition-all ${shiftFilter === f ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg' : 'bg-black/40 border-[#354a5f] text-slate-500 hover:bg-[#1e2e3d]'}`}>{f === 'TÜMÜ' ? 'TÜM' : f}</button>))}</div>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-32 px-1">
                     {groupedTeachers.length > 0 ? groupedTeachers.map(([branch, members]) => (
                        <div key={branch} className="space-y-1.5"><span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-[0.4em] px-2">{branch}</span>
                           {members.map(t => {
                              if (!t) return null;
                              const isMenuOpen = activeListActionId === t.id;
                              const currentBranchShorts = t.branchShorts || [t.branchShort || ''];
                              const teacherClasses = allClasses.filter(c => (c.assignments || []).some(a => a.teacherId === t.id));
                              const teacherStudentCount = teacherClasses.reduce((acc, c) => acc + (c.students?.length || 0), 0);
                              const teacherSectionCount = teacherClasses.length;
                              return (
                                 <div key={t.id} className="relative overflow-hidden group h-[62px] shrink-0">
                                    <div onClick={() => setSelectedTeacherId(t.id)} className={`flex items-center px-4 h-full border cursor-pointer transition-all duration-300 bg-[#1e293b]/60 border-white/5 hover:bg-slate-800 shadow-md active:scale-[0.98] relative overflow-hidden ${isMenuOpen ? '-translate-x-32' : ''}`}>
                                       <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <div className={`w-2 h-2 rounded-full shrink-0 ${t.gender === Gender.FEMALE ? 'bg-pink-500 shadow-[0_0_8px_#ec4899]' : 'bg-slate-500 shadow-[0_0_8px_#64748b]'}`}></div>
                                          <div className="flex flex-col min-w-0 flex-1">
                                             <div className="flex items-center justify-between gap-2">
                                                <span className="text-[13px] font-black uppercase leading-tight truncate text-high-contrast flex-1">{t.name}</span>
                                                {t.isExemptFromDuty && <i className="fa-solid fa-shield-halved text-orange-500 text-[10px] shrink-0 drop-shadow-[0_0_6px_rgba(234,88,12,0.5)]" title="NÖBET MUAF"></i>}
                                                <div className="flex items-center gap-1.5 shrink-0 opacity-80 bg-black/40 px-2 py-0.5 rounded-sm border border-white/5">
                                                   <div className="flex items-center gap-1"> <span className={`text-[8px] font-black ${teacherSectionCount === 0 ? 'text-red-500' : 'text-[#3b82f6]'}`}>{teacherSectionCount}</span> <span className="text-[5px] font-black text-slate-500 uppercase">Ş</span> </div>
                                                   <div className="w-[1px] h-2 bg-white/10"></div>
                                                   <div className="flex items-center gap-1"> <span className="text-[8px] font-black text-[#22c55e]">{teacherStudentCount}</span> <span className="text-[5px] font-black text-slate-500 uppercase">Ö</span> </div>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-2 mt-1.5 overflow-x-auto no-scrollbar mask-fade-right">
                                                <span className={`text-[6px] font-black uppercase px-1 border leading-none shrink-0 py-0.5 rounded-sm ${t.preferredShift === ShiftType.OGLE ? 'text-[#fcd34d] border-[#fcd34d]/40' : 'text-[#3b82f6] border-[#3b82f6]/40'}`}>{t.preferredShift || 'SABAH'}</span>
                                                <div className="flex items-center gap-1"> {currentBranchShorts.map((bs, bi) => bs && (<span key={bi} className="text-[6px] font-black text-[#fbbf24] uppercase border border-[#fbbf24]/20 px-1.5 py-0.5 leading-none bg-[#fbbf24]/5 whitespace-nowrap rounded-sm">{standardizeBranchCode(bs)}</span>))} </div>
                                             </div>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-4 shrink-0 border-l border-white/5 pl-4 ml-2">
                                          <div className="flex flex-col items-end"> <span className="text-[11px] font-black text-slate-400 leading-none">{t.lessonCount}s</span> <span className="text-[5px] font-black text-slate-600 uppercase mt-1 opacity-60">KOTA</span> </div>
                                          {editMode && <button onClick={(e) => { e.stopPropagation(); setActiveListActionId(isMenuOpen ? null : t.id); }} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-[#3b82f6] transition-all"><i className="fa-solid fa-ellipsis-vertical text-lg"></i></button>}
                                       </div>
                                    </div>
                                    <div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-48 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ zIndex: 100 }}>
                                       <button onClick={(e) => { e.stopPropagation(); handleGenerateQR(t); setActiveListActionId(null); }} className="w-16 h-full bg-white text-black flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all pointer-events-auto shadow-lg"><i className="fa-solid fa-qrcode text-sm mb-1"></i><span className="text-[6px] font-black uppercase">QR</span></button>
                                       <button onClick={(e) => { e.stopPropagation(); handleEditTeacher(t); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all pointer-events-auto"><i className="fa-solid fa-pen text-sm mb-1"></i><span className="text-[6px] font-black uppercase">DÜZENLE</span></button>
                                       <button onClick={(e) => { e.stopPropagation(); setTeacherToDelete(t); setActiveListActionId(null); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all pointer-events-auto"><i className="fa-solid fa-trash-can text-sm mb-1"></i><span className="text-[6px] font-black uppercase">SİL</span></button>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )) : (<div className="py-20 text-center opacity-20"><i className="fa-solid fa-user-slash text-4xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">VERİ_BULUNAMADI</p></div>)}
                  </div>
               </div>
            )
         }

         {/* ... (Existing modals remain unchanged) ... */}
         {
            viewingStudentAttendance && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  {/* ... Student Modal Content ... */}
                  <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-lg shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 duration-200 h-[85vh] rounded-sm overflow-hidden">
                     <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center justify-center rounded-full text-[#3b82f6]">
                              <i className="fa-solid fa-user-graduate text-lg"></i>
                           </div>
                           <div>
                              <h3 className="text-[12px] font-medium text-white/80 uppercase tracking-widest leading-none">{viewingStudentAttendance.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                 <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">NO: {viewingStudentAttendance.number}</span>
                                 <span className="text-[8px] font-black text-[#fbbf24] uppercase tracking-widest truncate max-w-[150px]">ORT: {viewingStudentAttendance.displayGrade || '--'}</span>
                              </div>
                           </div>
                        </div>
                        <button onClick={() => setViewingStudentAttendance(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="flex p-1 bg-black/40 border-b border-white/5 shrink-0">
                        <button onClick={() => setStudentModalTab('ATTENDANCE')} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest transition-all ${studentModalTab === 'ATTENDANCE' ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>DEVAMSIZLIK</button>
                        <button onClick={() => setStudentModalTab('GRADES')} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest transition-all ${studentModalTab === 'GRADES' ? 'bg-[#fbbf24] text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}>NOTLAR & ANALİZ</button>
                        <button onClick={() => setStudentModalTab('OBSERVATIONS')} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest transition-all ${studentModalTab === 'OBSERVATIONS' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>KANAAT & GÖZLEM</button>
                     </div>

                     <div className="flex-1 overflow-y-auto no-scrollbar p-4 bg-grid-hatched">
                        {studentModalTab === 'ATTENDANCE' && renderStudentAttendanceCalendar()}
                        {studentModalTab === 'GRADES' && renderStudentGrades()}
                        {studentModalTab === 'OBSERVATIONS' && renderStudentObservations()}
                     </div>
                  </div>
               </div>
            )
         }

         {/* ... (Other modals for Exam Scheduler, Attendance Terminal, Logbook, Grade Terminal, Answer Key, Grade Scanner, Proof Viewer, Branch Picker - All unchanged) ... */}

         {/* EXAM SCHEDULER MODAL */}
         {
            isExamSchedulerOpen && examSchedulerTarget && (
               <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-t-4 border-orange-500 p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest">SINAV PLANLA</h3>
                           <div className="flex items-center gap-2 mt-2">
                              <span className="text-[8px] font-black text-orange-500 uppercase tracking-[0.4em]">{examSchedulerTarget.lessonName} | {examSchedulerTarget.className}</span>
                              <span className="text-[8px] font-bold text-pink-500 flex items-center gap-1 border-l border-white/10 pl-2 ml-1"><i className="fa-solid fa-venus text-[7px]"></i> {allClasses.find(c => c.name === examSchedulerTarget.className)?.students?.filter(s => s.gender === Gender.FEMALE).length || 0}</span>
                              <span className="text-[8px] font-bold text-blue-500 flex items-center gap-1"><i className="fa-solid fa-mars text-[7px]"></i> {allClasses.find(c => c.name === examSchedulerTarget.className)?.students?.filter(s => s.gender === Gender.MALE).length || 0}</span>
                           </div>
                        </div>
                        <button onClick={() => setIsExamSchedulerOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">SINAV NO</label>
                           <div className="grid grid-cols-4 gap-2">
                              {['exam1', 'exam2', 'exam3', 'exam4'].map((slot, idx) => (
                                 <button
                                    key={slot}
                                    onClick={() => setExamSchedulerForm({ ...examSchedulerForm, slot })}
                                    className={`h-10 border text-[10px] font-black uppercase transition-all ${examSchedulerForm.slot === slot ? 'bg-orange-500 text-white border-orange-500 shadow-lg' : 'bg-black border-white/10 text-slate-500 hover:text-white'}`}
                                 >
                                    {idx + 1}. YAZILI
                                 </button>
                              ))}
                           </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">TARİH SEÇİNİZ</label>
                           <input
                              type="date"
                              className="w-full bg-black border border-white/10 p-3 text-[12px] font-bold text-white outline-none focus:border-orange-500 uppercase"
                              value={examSchedulerForm.date}
                              onChange={(e) => setExamSchedulerForm({ ...examSchedulerForm, date: e.target.value })}
                           />
                        </div>

                        <button
                           onClick={handleSaveExamSchedule}
                           disabled={!examSchedulerForm.date}
                           className="w-full h-14 bg-orange-600 text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-50 disabled:grayscale"
                        >
                           SINAV TARİHİNİ KAYDET
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* EDIT EXAM MODAL */}
         {
            isEditExamModalOpen && examToEdit && (
               <div className="fixed inset-0 z-[8200] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest">SINAV DÜZENLE</h3>
                           <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.4em] mt-2 block">{examToEdit.lessonName} | {examToEdit.className}</span>
                        </div>
                        <button onClick={() => setIsEditExamModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">SINAV NO</label>
                           <div className="grid grid-cols-4 gap-2">
                              {['exam1', 'exam2', 'exam3', 'exam4'].map((slot, idx) => (
                                 <button
                                    key={slot}
                                    onClick={() => setEditExamForm({ ...editExamForm, slot })}
                                    className={`h-10 border text-[10px] font-black uppercase transition-all ${editExamForm.slot === slot ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-lg' : 'bg-black border-white/10 text-slate-500 hover:text-white'}`}
                                 >
                                    {idx + 1}. YAZILI
                                 </button>
                              ))}
                           </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">TARİH SEÇİNİZ</label>
                           <input
                              type="date"
                              className="w-full bg-black border border-white/10 p-3 text-[12px] font-bold text-white outline-none focus:border-[#3b82f6] uppercase"
                              value={editExamForm.date}
                              onChange={(e) => setEditExamForm({ ...editExamForm, date: e.target.value })}
                           />
                        </div>

                        <button
                           onClick={handleUpdateExam}
                           disabled={!editExamForm.date}
                           className="w-full h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-50 disabled:grayscale"
                        >
                           GÜNCELLEMEYİ KAYDET
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* CONFIRM DELETE EXAM MODAL */}
         {
            examToDelete && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 rounded-sm">
                     <h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">SINAV_SİLME_ONAYI</h3>
                     <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">
                        BU SINAV KAYDI SİSTEMDEN KALICI OLARAK SİLİNECEKTİR: <br />
                        <span className="text-red-500 text-lg block mt-2 font-black">{examToDelete.lessonName} - {examToDelete.date}</span>
                     </p>
                     <div className="flex gap-4">
                        <button onClick={() => setExamToDelete(null)} className="flex-1 h-12 border border-[#64748b] text-[#f1f5f9] font-black text-[10px] uppercase hover:bg-white/5 transition-all">İPTAL</button>
                        <button onClick={executeDeleteExam} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl hover:brightness-110 transition-all">EVET_SİL</button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* ... Remaining modals ... */}
         {
            isAttendanceTerminalOpen && attendanceTarget && (
               <div className="fixed inset-0 z-[9000] flex flex-col bg-[#0f172a] animate-in slide-in-from-bottom-5">
                  <div className="p-4 bg-[#162431] border-b border-white/10 flex flex-col gap-4 shadow-2xl z-10 shrink-0">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                           <div className="w-12 h-12 flex items-center justify-center bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.2)] rounded-full shrink-0">
                              <i className="fa-solid fa-clipboard-user text-xl"></i>
                           </div>
                           <div className="min-w-0">
                              <h2 className="text-[13px] font-black text-white uppercase tracking-tighter leading-none truncate">{attendanceTarget.sinif} - {allLessons.find(l => l.id === attendanceTarget.ders || l.name === attendanceTarget.ders)?.name || attendanceTarget.ders}</h2>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 block">{attendanceTarget.ders_saati}. DERS YOKLAMASI</span>
                           </div>
                        </div>
                        <button onClick={() => setIsAttendanceTerminalOpen(false)} className="w-10 h-10 flex items-center justify-center border border-white/10 text-slate-400 hover:text-white transition-all rounded-full bg-black/20 shrink-0"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>
                     <div className="flex items-center gap-2 w-full">
                        <button onClick={() => setAttendanceViewMode(attendanceViewMode === 'LIST' ? 'SCANNER' : 'LIST')} className="flex-1 h-12 bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-2 rounded-sm"> <i className={`fa-solid ${attendanceViewMode === 'LIST' ? 'fa-camera' : 'fa-list'}`}></i> {attendanceViewMode === 'LIST' ? 'KAMERA' : 'LİSTE'} </button>
                        <button onClick={() => { if (showSummary) finalizeAttendanceCommit(); else setShowSummary(true); }} className="flex-[2] h-12 bg-[#3b82f6] text-white font-black text-[10px] uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 rounded-sm"> {isUploadingProof ? <i className="fa-solid fa-cloud-arrow-up animate-bounce"></i> : <i className="fa-solid fa-check-double"></i>} {showSummary ? 'ONAYLA' : 'TAMAMLA'} </button>
                     </div>
                     {attendanceViewMode === 'LIST' && (
                        <div className="relative">
                           <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                           <input
                              type="text"
                              placeholder="ÖĞRENCİ ARA..."
                              className="w-full h-10 bg-black/40 border border-white/10 pl-9 pr-4 text-[11px] font-bold text-white uppercase outline-none focus:border-[#3b82f6] transition-all"
                              value={attendanceSearchTerm}
                              onChange={(e) => setAttendanceSearchTerm(e.target.value)}
                           />
                        </div>
                     )}
                  </div>
                  <div className="flex-1 overflow-hidden relative"> {attendanceViewMode === 'SCANNER' ? (<div className="h-full relative bg-black"> <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-60" /> <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"> <div className="w-[80%] h-[60%] border-2 border-[#3b82f6] shadow-[0_0_100px_rgba(59,130,246,0.3)] relative animate-pulse"> <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#3b82f6] -mt-1 -ml-1"></div> <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#3b82f6] -mt-1 -mr-1"></div> <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#3b82f6] -mb-1 -ml-1"></div> <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#3b82f6] -mb-1 -mr-1"></div> </div> <p className="mt-8 text-[12px] font-black text-white bg-black/60 px-4 py-2 uppercase tracking-widest border border-white/10">YOKLAMA KAĞIDINI HİZALAYIN</p> </div> <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-auto"> <button onClick={() => { if (videoRef.current) { const canvas = document.createElement('canvas'); canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight; canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0); const img = canvas.toDataURL('image/jpeg'); setCapturedImage(img); processOpticalData(img); } }} className="w-20 h-20 bg-white rounded-full border-4 border-[#3b82f6] shadow-[0_0_50px_rgba(59,130,246,0.5)] flex items-center justify-center active:scale-90 transition-all group"> <div className="w-16 h-16 bg-[#3b82f6] rounded-full group-hover:scale-90 transition-transform"></div> </button> </div> {isAnalyzing && (<div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50"> <div className="w-24 h-24 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mb-8"></div> <div className="space-y-2 text-center"> {analysisLogs.map((log, i) => (<p key={i} className="text-[10px] font-mono text-[#3b82f6] uppercase tracking-widest animate-pulse">{log}</p>))} </div> </div>)} </div>) : (<div className="h-full overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 content-start"> {allClasses.find(c => c.name === attendanceTarget.sinif)?.students?.filter(s => s.name.includes(attendanceSearchTerm.toUpperCase()) || s.number.includes(attendanceSearchTerm)).map(s => { const isAbsent = selectedStudentNumbers.includes(s.number); return (<div key={s.number} onClick={() => setSelectedStudentNumbers(prev => prev.includes(s.number) ? prev.filter(n => n !== s.number) : [...prev, s.number])} className={`px-3 py-2 border transition-all cursor-pointer relative overflow-hidden group flex items-center ${isAbsent ? 'bg-red-600 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.3)] z-10 scale-[1.02]' : 'bg-[#1e293b] border-white/5 hover:border-white/20'}`} > <div className="flex items-center gap-2 relative z-10 min-w-0 w-full"> <div className={`text-[11px] font-bold min-w-[24px] text-right border-r pr-2 mr-2 transition-all ${isAbsent ? 'text-white border-white/30' : 'text-slate-500 border-white/10'}`}> {s.number} </div> <div className="flex flex-col min-w-0 flex-1"> <span className={`text-[10px] font-bold uppercase truncate leading-tight ${isAbsent ? 'text-white' : 'text-slate-300'}`}>{s.name}</span> <span className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${isAbsent ? 'text-white/80' : 'text-slate-600'}`}>{isAbsent ? 'YOK' : 'VAR'}</span> </div> </div> {isAbsent && <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xl text-black/20"><i className="fa-solid fa-user-xmark"></i></div>} </div>); })} </div>)} </div> {showSummary && (<div className="absolute inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in zoom-in-95"> <div className="w-24 h-24 bg-[#3b82f6]/10 border-2 border-[#3b82f6] rounded-full flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(59,130,246,0.3)]"> <span className="text-4xl font-black text-[#3b82f6]">{selectedStudentNumbers.length}</span> </div> <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] mb-2">YOKLAMA ÖZETİ</h3> <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-12">SEÇİLEN ÖĞRENCİLER "YOK" OLARAK İŞLENECEKTİR.</p> <div className="flex gap-4 w-full max-w-md"> <button onClick={() => setShowSummary(false)} className="flex-1 h-14 border border-slate-600 text-slate-400 font-black text-[12px] uppercase tracking-widest hover:text-white hover:border-white transition-all">GERİ DÖN</button> <button onClick={finalizeAttendanceCommit} className="flex-1 h-14 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">ONAYLA VE BİTİR</button> </div> </div>)} </div>)
         }

         {isLogModalOpen && logTarget && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4"> <div className="bg-[#0d141b] border-t-4 border-[#fbbf24] p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200"> <div className="flex justify-between items-center mb-6"> <div> <h3 className="text-[14px] font-black text-white uppercase tracking-widest">DİJİTAL SINIF DEFTERİ</h3> <span className="text-[8px] font-black text-[#fbbf24] uppercase tracking-[0.4em] mt-2 block">{logTarget.sinif} - {allLessons.find(l => l.id === logTarget.ders || l.name === logTarget.ders)?.name || logTarget.ders} ({logTarget.ders_saati}. DERS)</span>
         </div> <button onClick={() => setIsLogModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button> </div> <div className="space-y-4"> <div className="space-y-1.5"> <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">İŞLENEN KONU / KAZANIM</label> <textarea rows={3} className="w-full bg-black border border-white/10 p-4 text-[12px] font-bold text-white outline-none focus:border-[#fbbf24] resize-none" placeholder="Bugün neler işlendi?" value={logForm.subject} onChange={e => setLogForm({ ...logForm, subject: e.target.value })} autoFocus /> </div> <div className="space-y-1.5"> <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">ÖDEV / PROJE</label> <textarea rows={2} className="w-full bg-black border border-white/10 p-4 text-[12px] font-bold text-white outline-none focus:border-[#fbbf24] resize-none" placeholder="Varsa ödev notu..." value={logForm.homework} onChange={e => setLogForm({ ...logForm, homework: e.target.value })} /> </div> <button onClick={handleSaveLog} disabled={!logForm.subject} className="w-full h-14 bg-[#fbbf24] text-black font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-50 disabled:grayscale"> DEFTERİ İMZALA </button> </div> </div> </div>)}

         {
            isClassLogManagerOpen && classLogManagerTarget && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-2 border-[#22d3ee] w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 rounded-sm">
                     <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest">DEFTER YÖNETİCİSİ</h3>
                           <span className="text-[8px] font-black text-[#22d3ee] uppercase tracking-[0.4em] mt-2 block">{classLogManagerTarget.className} | {classLogManagerTarget.lessonName}</span>
                        </div>
                        <button onClick={() => setIsClassLogManagerOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>
                     <div className="flex-1 flex overflow-hidden">
                        <div className="w-1/3 border-r border-white/5 bg-black/20 overflow-y-auto no-scrollbar p-2 space-y-2">
                           {allClasses.find(c => c.id === classLogManagerTarget.classId)?.lessonLogs?.sort((a, b) => b.timestamp - a.timestamp).map(log => (
                              <div key={log.id} className="bg-[#1e293b] border border-white/5 p-3 hover:border-[#22d3ee]/40 transition-all group cursor-pointer">
                                 <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-white">{log.date}</span>
                                    <span className="text-[8px] font-bold text-[#22d3ee]">{log.hour}. DERS</span>
                                 </div>
                                 <p className="text-[9px] font-medium text-slate-400 line-clamp-2 italic">{log.subject}</p>
                              </div>
                           ))}
                           {(!allClasses.find(c => c.id === classLogManagerTarget.classId)?.lessonLogs?.length) && <div className="text-center py-10 opacity-30 text-[9px]">KAYIT YOK</div>}
                        </div>
                        <div className="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar bg-grid-hatched">
                           <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] border-b border-white/10 pb-2 mb-4">MANUEL KAYIT EKLE</h4>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase">TARİH</label><input type="date" className="w-full bg-black border border-white/10 p-3 text-[11px] text-white outline-none focus:border-[#22d3ee]" value={manualLogForm.date} onChange={e => setManualLogForm({ ...manualLogForm, date: e.target.value })} /></div>
                              <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase">DERS SAATİ</label><div className="flex items-center gap-2 bg-black border border-white/10 p-1"><button onClick={() => setManualLogForm(prev => ({ ...prev, hour: Math.max(1, prev.hour - 1) }))} className="w-8 h-8 flex items-center justify-center text-[#22d3ee]"><i className="fa-solid fa-minus"></i></button><span className="flex-1 text-center text-white font-black">{manualLogForm.hour}</span><button onClick={() => setManualLogForm(prev => ({ ...prev, hour: Math.min(10, prev.hour + 1) }))} className="w-8 h-8 flex items-center justify-center text-[#22d3ee]"><i className="fa-solid fa-plus"></i></button></div></div>
                           </div>
                           <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase">KONU</label><textarea rows={3} className="w-full bg-black border border-white/10 p-3 text-[11px] text-white outline-none focus:border-[#22d3ee]" value={manualLogForm.subject} onChange={e => setManualLogForm({ ...manualLogForm, subject: e.target.value })} /></div>
                           <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase">ÖDEV</label><textarea rows={2} className="w-full bg-black border border-white/10 p-3 text-[11px] text-white outline-none focus:border-[#22d3ee]" value={manualLogForm.homework} onChange={e => setManualLogForm({ ...manualLogForm, homework: e.target.value })} /></div>
                           <button onClick={handleSaveManualLog} disabled={!manualLogForm.subject} className="w-full h-12 bg-[#22d3ee] text-black font-black text-[10px] uppercase tracking-[0.2em] hover:brightness-110 transition-all disabled:opacity-50">KAYDET</button>
                        </div>
                     </div>
                  </div>
               </div>
            )
         }

         {/* GRADE TERMINAL MODAL */}
         {/* GRADE TERMINAL MODAL */}
         {
            isGradeTerminalOpen && gradeTerminalTarget && (<div className="fixed inset-0 z-[9500] flex flex-col bg-[#0f172a] animate-in zoom-in-95 duration-200"> <div className="h-16 bg-[#162431] border-b border-white/10 flex items-center justify-between px-3 md:px-6 shrink-0 shadow-2xl z-10 gap-2">
               <div className="flex items-center gap-3 shrink-0"> <div className="w-9 h-9 bg-[#fbbf24] text-black flex items-center justify-center font-black text-base shadow-[0_0_20px_rgba(251,191,36,0.4)] md:w-10 md:h-10 md:text-lg"> <i className="fa-solid fa-pen-nib"></i> </div> <div> <h2 className="text-[14px] md:text-[18px] font-black text-white uppercase tracking-tighter leading-none">{gradeTerminalTarget.className}</h2> <div className="flex items-center gap-2 mt-0.5 md:hidden"> <span className="text-[9px] font-bold text-pink-500 flex items-center gap-1"><i className="fa-solid fa-venus text-[8px]"></i> {allClasses.find(c => c.id === gradeTerminalTarget.classId)?.students?.filter(s => s.gender === Gender.FEMALE).length || 0}</span> <span className="text-[9px] font-bold text-blue-500 flex items-center gap-1"><i className="fa-solid fa-mars text-[8px]"></i> {allClasses.find(c => c.id === gradeTerminalTarget.classId)?.students?.filter(s => s.gender === Gender.MALE).length || 0}</span> </div> <span className="hidden md:block text-[9px] font-bold text-[#fbbf24] uppercase tracking-widest mt-1 truncate max-w-[200px]" title={gradeTerminalTarget.lessonName}>{gradeTerminalTarget.lessonName}</span> </div> </div>

               {/* SEARCH BAR ADDED */}
               <div className="flex-1 max-w-[140px] md:max-w-xs mx-2 relative min-w-0">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                  <input
                     type="text"
                     placeholder="ARA..."
                     className="w-full h-8 md:h-9 bg-black/40 border border-white/10 pl-8 pr-2 text-[10px] font-bold text-white uppercase outline-none focus:border-[#fbbf24] transition-all rounded-sm"
                     value={gradeSearchTerm}
                     onChange={(e) => setGradeSearchTerm(e.target.value)}
                  />
               </div>

               <div className="flex items-center gap-2 shrink-0"> <div className="flex bg-black/40 p-0.5 border border-white/10 rounded-sm"> <button onClick={() => setActiveSemester(1)} className={`px-2 py-1.5 text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all ${activeSemester === 1 ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>1.DÖN</button> <button onClick={() => setActiveSemester(2)} className={`px-2 py-1.5 text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all ${activeSemester === 2 ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>2.DÖN</button> </div> <button onClick={() => setIsGradeTerminalOpen(false)} className="w-9 h-9 border border-white/10 text-white/40 hover:text-white transition-all ml-1"><i className="fa-solid fa-xmark text-lg"></i></button> </div> </div> <div className="flex bg-[#0a0a0a] border-b border-white/5 p-2 gap-2 overflow-x-auto no-scrollbar shrink-0"> {['exam1', 'exam2', 'exam3', 'exam4', 'oral'].map((col, idx) => { const label = col === 'oral' ? 'SZL' : `${idx + 1}. YZ`; const isActive = activeExamSlot === (col === 'oral' ? 5 : idx + 1); return (<button key={col} onClick={() => setActiveExamSlot(col === 'oral' ? 5 : idx + 1)} className={`flex-1 h-12 flex flex-col items-center justify-center border transition-all ${isActive ? 'bg-[#fbbf24]/10 border-[#fbbf24] text-[#fbbf24]' : 'bg-black border-white/10 text-slate-500 hover:bg-white/5'}`} > <span className="text-[10px] font-black uppercase">{label}</span> {isActive && <div className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full mt-1 shadow-[0_0_10px_#fbbf24]"></div>} </button>); })} </div> <div className="flex-1 overflow-auto bg-grid-hatched p-4"> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">

                  {/* STUDENT LIST FILTERED */}
                  {allClasses.find(c => c.id === gradeTerminalTarget.classId)?.students?.filter(s => s.name.toUpperCase().includes(gradeSearchTerm.toUpperCase()) || s.number.includes(gradeSearchTerm)).map(student => {
                     const gradeRecord = student.grades?.find(g => g.lessonId === gradeTerminalTarget.lessonId) || { lessonId: gradeTerminalTarget.lessonId }; const fieldName = activeExamSlot === 5 ? (activeSemester === 1 ? 'oral1' : 'oral2') : `exam${(activeSemester === 1 ? 0 : 4) + activeExamSlot}` as keyof GradeRecord; const currentVal = (gradeRecord as any)[fieldName];
                     const currentMetadata = gradeRecord.metadata?.[fieldName as string];

                     return (<div key={student.id} className={`bg-[#1e293b] border p-2 flex items-center justify-between shadow-sm group hover:bg-slate-800 transition-all ${currentVal ? 'border-[#fbbf24]/40' : 'border-white/5'}`}> <div className="flex items-center gap-3 overflow-hidden">
                        {/* COMPACT NUMBER WITH GENDER INDICATOR */}
                        <div className={`w-8 flex-shrink-0 text-right font-black text-[12px] border-r border-white/10 pr-2 leading-none flex flex-col items-end gap-0.5 ${student.gender === Gender.FEMALE ? 'text-pink-500' : 'text-blue-500'}`}>
                           <span>{student.number}</span>
                           <i className={`fa-solid ${student.gender === Gender.FEMALE ? 'fa-venus' : 'fa-mars'} text-[8px] opacity-60`}></i>
                        </div>
                        <div className="min-w-0 flex-1"> <span className="text-[11px] font-bold text-white uppercase block truncate leading-tight" title={student.name}>{student.name}</span> <div className="flex items-center gap-2 mt-0.5"> <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none">ORT: {gradeRecord.average || '-'}</span>

                           {currentMetadata && currentMetadata.proofUrl && (
                              <button
                                 onClick={() => setProofImageToView(currentMetadata.proofUrl || null)}
                                 className="w-5 h-5 flex items-center justify-center bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] rounded-sm hover:bg-[#3b82f6] hover:text-white transition-all ml-2"
                                 title="Sınav Kağıdını Gör"
                              >
                                 <i className="fa-solid fa-eye text-[9px]"></i>
                              </button>
                           )}
                        </div> </div> </div> <GradeInput initialValue={currentVal} onCommit={(val) => handleUpdateGradeTerminal(gradeTerminalTarget.classId, student.id, gradeTerminalTarget.lessonId, fieldName, val)} colorClass={(currentVal || 0) < 50 ? 'text-red-500' : 'text-[#fbbf24]'} /> </div>);
                  })} </div> </div>
               <div className="h-16 bg-[#162431] border-t border-white/10 flex items-center justify-end px-6 shrink-0">
                  <div className="flex gap-3">
                     {/* CEVAP ANAHTARI BUTTON */}
                     <button onClick={() => setIsAnswerKeyModalOpen(true)} className="px-6 h-10 bg-[#a855f7] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 border border-white/10"> <i className="fa-solid fa-key"></i> CEVAP ANAHTARI </button>

                     {/* SCANNER BUTTON (Trigger AI Camera) */}
                     <button onClick={() => { setIsGradeScannerOpen(true); setCapturedImage(null); }} className="px-6 h-10 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 border border-white/10">
                        <i className="fa-solid fa-camera"></i> Tara
                     </button>
                  </div>
               </div>
            </div>)
         }

         {
            isAnswerKeyModalOpen && gradeTerminalTarget && (
               <div className="fixed inset-0 z-[9800] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-2 border-[#a855f7] w-full max-w-3xl h-[80vh] flex flex-col shadow-[0_0_100px_rgba(168,85,247,0.3)] animate-in zoom-in-95 duration-200 rounded-sm">
                     <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest">OPTİK CEVAP ANAHTARI</h3>
                           <div className="flex items-center gap-2 mt-2">
                              <span className="text-[8px] font-black text-[#a855f7] uppercase tracking-[0.2em]">{gradeTerminalTarget.lessonName} | {activeExamSlot === 5 ? 'SÖZLÜ' : activeExamSlot + '. YAZILI'}</span>
                              <span className="text-[8px] font-bold text-pink-500 flex items-center gap-1 border-l border-white/10 pl-2 ml-1"><i className="fa-solid fa-venus text-[7px]"></i> {allClasses.find(c => c.id === gradeTerminalTarget.classId)?.students?.filter(s => s.gender === Gender.FEMALE).length || 0}</span>
                              <span className="text-[8px] font-bold text-blue-500 flex items-center gap-1"><i className="fa-solid fa-mars text-[7px]"></i> {allClasses.find(c => c.id === gradeTerminalTarget.classId)?.students?.filter(s => s.gender === Gender.MALE).length || 0}</span>
                           </div>
                        </div>
                        <button onClick={() => setIsAnswerKeyModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="p-2 bg-black/40 border-b border-white/5 flex flex-col gap-2 shrink-0">
                        <div className="flex items-center justify-between px-1 border-b border-white/5 pb-2">
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SORU SAYISI SEÇİMİ:</span>
                           <div className="flex gap-1">
                              {[10, 20, 25, 30, 40, 50, 100].map(n => (
                                 <button
                                    key={n}
                                    onClick={() => setQuestionCount(n)}
                                    className={`px-3 py-1 text-[9px] font-black border transition-all ${questionCount === n ? 'bg-[#a855f7] text-white border-[#a855f7]' : 'bg-[#0f172a] text-slate-500 border-white/10 hover:text-white'}`}
                                 >
                                    {n}
                                 </button>
                              ))}
                           </div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => setActiveKeyGroup('A')} className={`flex-1 h-10 font-black text-[10px] uppercase tracking-widest border transition-all ${activeKeyGroup === 'A' ? 'bg-[#a855f7] text-white border-[#a855f7]' : 'bg-transparent text-slate-500 border-white/10 hover:text-white'}`}>A GRUBU KİTAPÇIĞI</button>
                           <button onClick={() => setActiveKeyGroup('B')} className={`flex-1 h-10 font-black text-[10px] uppercase tracking-widest border transition-all ${activeKeyGroup === 'B' ? 'bg-[#a855f7] text-white border-[#a855f7]' : 'bg-transparent text-slate-500 border-white/10 hover:text-white'}`}>B GRUBU KİTAPÇIĞI</button>
                        </div>
                     </div>

                     <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-grid-hatched">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                           {Array.from({ length: questionCount }, (_, i) => i + 1).map(qIdx => {
                              const targetField = getTargetField();
                              const defaultPoints = Math.floor(100 / questionCount);
                              const existingKey = lessonAnswerKeys[gradeTerminalTarget.lessonId]?.[targetField]?.[activeKeyGroup]?.[qIdx] || { key: '', points: defaultPoints };

                              return (
                                 <div key={qIdx} className="bg-[#1e293b] border border-white/5 p-2 flex items-center justify-between shadow-sm hover:border-[#a855f7]/50 transition-all group">
                                    <div className="w-8 h-8 bg-black/40 flex items-center justify-center font-black text-white border border-white/10 text-sm">{qIdx}</div>
                                    <div className="flex gap-1">
                                       {['A', 'B', 'C', 'D', 'E'].map(opt => (
                                          <button
                                             key={opt}
                                             onClick={() => updateAnswerKey(qIdx, opt, existingKey.points)}
                                             className={`w-7 h-7 text-[10px] font-black border transition-all ${existingKey.key === opt ? 'bg-[#a855f7] text-white border-[#a855f7] shadow-lg' : 'bg-transparent text-slate-500 border-white/10 hover:bg-white/5'}`}
                                          >{opt}</button>
                                       ))}
                                    </div>
                                    <div className="flex items-center gap-1">
                                       <input
                                          type="number"
                                          className="w-10 h-7 bg-black/40 border border-white/10 text-center text-[11px] font-black text-[#fbbf24] outline-none focus:border-[#a855f7]"
                                          value={existingKey.points}
                                          onChange={(e) => updateAnswerKey(qIdx, existingKey.key, parseInt(e.target.value) || 0)}
                                       />
                                       <span className="text-[6px] font-bold text-slate-500 uppercase">PN</span>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                     <div className="p-4 bg-[#162431] border-t border-white/10 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                           <div className="flex items-center gap-2">
                              <i className="fa-solid fa-circle-info text-[#a855f7]"></i>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">BU ANAHTAR AI TARAMALARINDA KULLANILACAK</span>
                           </div>
                           <button onClick={printOpticalForm} className="px-4 h-8 bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/50 font-black text-[9px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all flex items-center gap-2 rounded-sm ml-4">
                              <i className="fa-solid fa-print"></i> ŞABLON İNDİR (A5)
                           </button>
                        </div>
                        <button onClick={handleSaveAnswerKey} className="px-8 h-10 bg-white text-black font-black text-[10px] uppercase tracking-widest hover:brightness-90 transition-all">KAYDET VE KAPAT</button>
                     </div>
                  </div>
               </div>
            )
         }

         {isGradeScannerOpen && (<div className="fixed inset-0 z-[9999] flex flex-col bg-black animate-in slide-in-from-bottom-10"> <div className="absolute top-6 right-6 z-50"> <button onClick={() => setIsGradeScannerOpen(false)} className="w-12 h-12 bg-black/50 text-white rounded-full flex items-center justify-center border-2 border-white/20 hover:bg-red-600 transition-all"><i className="fa-solid fa-xmark text-xl"></i></button> </div> <div className="flex-1 relative"> {!capturedImage ? (<> <video ref={gradeVideoRef} autoPlay playsInline className="w-full h-full object-cover" /> <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"> <div className="w-[85%] aspect-[3/4] border-4 border-[#fbbf24] shadow-[0_0_100px_rgba(251,191,36,0.3)] relative"> <div className="absolute top-0 left-0 w-12 h-12 border-t-8 border-l-8 border-[#fbbf24] -mt-2 -ml-2"></div> <div className="absolute top-0 right-0 w-12 h-12 border-t-8 border-r-8 border-[#fbbf24] -mt-2 -mr-2"></div> <div className="absolute bottom-0 left-0 w-12 h-12 border-b-8 border-l-8 border-[#fbbf24] -mb-2 -ml-2"></div> <div className="absolute bottom-0 right-0 w-12 h-12 border-b-8 border-r-8 border-[#fbbf24] -mb-2 -mr-2"></div> <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50"></div> </div> <p className="mt-8 text-[14px] font-black text-white bg-black/60 px-6 py-3 uppercase tracking-[0.2em] border border-white/20 backdrop-blur-md">OPTİK FORMU ÇERÇEVEYE ALIN</p> </div> <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-auto"> <button onClick={() => { if (gradeVideoRef.current) { const canvas = document.createElement('canvas'); canvas.width = gradeVideoRef.current.videoWidth; canvas.height = gradeVideoRef.current.videoHeight; canvas.getContext('2d')?.drawImage(gradeVideoRef.current, 0, 0); const img = canvas.toDataURL('image/jpeg'); setCapturedImage(img); processGradeScan(img); } }} className="w-24 h-24 bg-white rounded-full border-4 border-[#fbbf24] shadow-[0_0_60px_rgba(251,191,36,0.6)] flex items-center justify-center active:scale-90 transition-all group"> <div className="w-20 h-20 bg-[#fbbf24] rounded-full group-hover:scale-90 transition-transform"></div> </button> </div> </>) : (<div className="w-full h-full flex flex-col items-center justify-center bg-grid-hatched"> {isAnalyzing ? (<div className="flex flex-col items-center"> <div className="relative mb-10"> <div className="w-32 h-32 border-4 border-[#fbbf24] border-t-transparent rounded-full animate-spin shadow-[0_0_40px_rgba(251,191,36,0.3)]"></div> <div className="absolute inset-0 flex flex-col items-center justify-center"> <span className="text-3xl font-black text-white font-mono">{analysisTimer}</span> <span className="text-[10px] font-bold text-[#fbbf24] uppercase tracking-widest">SN</span> </div> </div> <h3 className="text-2xl font-black text-white uppercase tracking-[0.3em] animate-pulse">DNA ANALİZİ YAPILIYOR...</h3> <div className="mt-6 space-y-2 text-center"> {analysisLogs.map((log, i) => <p key={i} className="text-[12px] font-mono text-[#fbbf24] uppercase tracking-widest">{log}</p>)} </div> </div>) : scanPreview ? (<div className="bg-[#1e293b] border-2 border-[#fbbf24] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 text-center relative overflow-hidden"> <div className="absolute top-0 left-0 w-full h-2 bg-[#fbbf24] shadow-[0_0_20px_#fbbf24]"></div> <div className="mb-6"> <div className="w-20 h-20 bg-[#fbbf24] text-black rounded-full flex items-center justify-center text-3xl font-black mx-auto mb-4 shadow-lg"> {scanPreview.score} </div> <h2 className="text-2xl font-black text-white uppercase tracking-tight">{scanPreview.studentName}</h2> <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mt-1">NO: {scanPreview.studentNumber}</p> </div> <div className="grid grid-cols-3 gap-2 mb-8"> <div className="bg-green-900/30 border border-green-500/30 p-2"><span className="block text-2xl font-black text-green-500">{scanPreview.corrects}</span><span className="text-[8px] font-bold text-slate-400 uppercase">DOĞRU</span></div> <div className="bg-red-900/30 border border-red-500/30 p-2"><span className="block text-2xl font-black text-red-500">{scanPreview.wrongs}</span><span className="text-[8px] font-bold text-slate-400 uppercase">YANLIŞ</span></div> <div className="bg-slate-800/50 border border-white/10 p-2"><span className="block text-2xl font-black text-white">{scanPreview.empties}</span><span className="text-[8px] font-bold text-slate-400 uppercase">BOŞ</span></div> </div> <div className="flex gap-4"> <button onClick={() => { setCapturedImage(null); setScanPreview(null); }} className="flex-1 h-14 border border-slate-500 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-white hover:border-white transition-all">REDDET</button> <button onClick={handleApplyScanResult} className="flex-1 h-14 bg-[#fbbf24] text-black font-black text-[11px] uppercase tracking-widest shadow-xl hover:brightness-110 active:scale-95 transition-all">NOTU İŞLE</button> </div> </div>) : (<div className="text-center"> <h3 className="text-xl font-black text-red-500 uppercase tracking-widest mb-4">TARAMA BAŞARISIZ</h3> <button onClick={() => setCapturedImage(null)} className="px-8 h-12 bg-white text-black font-black text-[12px] uppercase tracking-widest hover:bg-slate-200">TEKRAR DENE</button> </div>)} </div>)} </div> </div>)}

         {/* PROOF IMAGE VIEWER */}
         {
            proofImageToView && (
               <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4" onClick={() => setProofImageToView(null)}>
                  <img src={proofImageToView} className="max-w-full max-h-full border-2 border-[#fbbf24] shadow-[0_0_50px_rgba(251,191,36,0.2)] rounded-sm" />
                  <div className="absolute top-4 right-4 bg-[#fbbf24] px-4 py-2 text-black font-black text-[12px] uppercase tracking-widest rounded-sm">SINAV KAĞIDI KANITI</div>
                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/80 px-6 py-3 rounded-full text-white font-bold uppercase tracking-widest border border-white/20">KAPATMAK İÇİN TIKLAYIN</div>
               </div>
            )
         }

         {/* STUDENT DETAILS MODAL */}
         {
            viewingStudentAttendance && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  {/* Modal Content */}
                  <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-lg shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 duration-200 h-[85vh] rounded-sm overflow-hidden">

                     {/* HEADER */}
                     <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                        <div>
                           <h3 className="text-[16px] font-black text-white uppercase tracking-widest">{viewingStudentAttendance.name}</h3>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{viewingStudentAttendance.number}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm ${viewingStudentAttendance.gender === Gender.FEMALE ? 'bg-pink-500/20 text-pink-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                 {viewingStudentAttendance.gender === Gender.FEMALE ? 'KIZ ÖĞRENCİ' : 'ERKEK ÖĞRENCİ'}
                              </span>
                           </div>
                        </div>
                        <button onClick={() => setViewingStudentAttendance(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all bg-black/20 flex items-center justify-center rounded-sm"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     {/* TABS */}
                     <div className="flex border-b border-white/10 shrink-0">
                        <button onClick={() => setStudentModalTab('ATTENDANCE')} className={`flex-1 h-12 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${studentModalTab === 'ATTENDANCE' ? 'border-[#3b82f6] text-white bg-[#3b82f6]/10' : 'border-transparent text-slate-500 hover:text-white hover:bg-white/5'}`}>DEVAMSIZLIK</button>
                        <button onClick={() => setStudentModalTab('GRADES')} className={`flex-1 h-12 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${studentModalTab === 'GRADES' ? 'border-[#3b82f6] text-white bg-[#3b82f6]/10' : 'border-transparent text-slate-500 hover:text-white hover:bg-white/5'}`}>NOTLAR</button>
                        <button onClick={() => setStudentModalTab('OBSERVATIONS')} className={`flex-1 h-12 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${studentModalTab === 'OBSERVATIONS' ? 'border-[#a855f7] text-white bg-[#a855f7]/10' : 'border-transparent text-slate-500 hover:text-white hover:bg-white/5'}`}>KANAAT & GÖZLEM</button>
                     </div>

                     {/* CONTENT */}
                     <div className="flex-1 overflow-y-auto custom-scrollbar p-5 relative bg-grid-hatched">
                        {studentModalTab === 'ATTENDANCE' && renderStudentAttendanceCalendar()}
                        {studentModalTab === 'GRADES' && renderStudentGrades()}
                        {studentModalTab === 'OBSERVATIONS' && renderStudentObservations()}
                     </div>
                  </div>
               </div>
            )
         }

         {/* ... Branch Picker ... */}
         {isBranchPickerOpen && (<div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/95 backdrop-blur-md px-4 py-4"> <div className="bg-[#0d141b] border-2 border-[#fbbf24] p-6 max-md w-full shadow-2xl flex flex-col h-[70vh] rounded-sm bg-grid-hatched"> <div className="flex justify-between items-center mb-6 shrink-0 relative z-20"> <div><h3 className="text-[13px] font-black text-white uppercase tracking-widest">BRANŞ_KATALOĞU</h3></div> <button onClick={() => setIsBranchPickerOpen(false)} className="w-12 h-12 border border-white/10 text-white transition-all bg-black/20 flex items-center justify-center rounded-sm"><i className="fa-solid fa-xmark text-xl"></i></button> </div> <input placeholder="BRANŞ ARA..." className="w-full bg-black border border-white/10 p-3 text-[12px] font-black text-white uppercase mb-4 outline-none focus:border-[#fbbf24] shrink-0" value={branchSearchTerm} onChange={e => setBranchSearchTerm(e.target.value)} /> <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 gap-2 p-1"> {filteredBranches.map(b => { const isSelected = teacherData.branchShorts.includes(b.code); return (<button key={b.code} onClick={() => toggleBranchSelection(b.code)} className={`p-4 border transition-all text-left flex items-center justify-between group ${isSelected ? 'bg-[#fbbf24] border-[#fbbf24] text-black shadow-lg' : 'bg-[#162431] border-white/5 text-slate-400 hover:border-[#fbbf24]/40 hover:text-white'}`}><div className="flex flex-col"><span className="text-[12px] font-black uppercase">{b.name}</span><span className={`text-[7px] font-bold uppercase ${isSelected ? 'text-black/60' : 'text-slate-600'}`}>{b.code}</span></div>{isSelected && <i className="fa-solid fa-check"></i>}</button>); })} </div> <button onClick={() => setIsBranchPickerOpen(false)} className="w-full h-14 bg-[#fbbf24] text-black font-black text-[11px] uppercase tracking-widest mt-6 shadow-xl active:scale-0.95 transition-all border border-white/10 shrink-0">SEÇİMİ_TAMAMLA</button> </div> </div>)}

         {/* QR CODE MODAL */}
         {
            isQRModalOpen && (
               <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-white p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 rounded-sm flex flex-col items-center">
                     <h3 className="text-xl font-black text-black uppercase tracking-widest mb-2 text-center">{qrTeacherName}</h3>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">HIZLI GİRİŞ QR KODU</p>

                     <div className="p-4 border-4 border-black mb-6">
                        <QRCodeCanvas value={qrData} size={200} />
                     </div>

                     <div className="w-full space-y-3">
                        <p className="text-[9px] text-center text-slate-400 font-bold uppercase mb-2 px-4">
                           BU QR KOD İLE İLK GİRİŞ YAPILDIĞINDA ŞİFRE DEĞİŞİKLİĞİ ZORUNLUDUR.
                        </p>

                        <a
                           href={`https://wa.me/?text=${encodeURIComponent(`🎓 SENKRON GİRİŞ LİNKİ\n\nSayın ${qrTeacherName},\n\nAşağıdaki linke tıklayarak sisteme giriş yapabilirsiniz:\n${qrData}\n\n⚠️ İlk girişinizde şifrenizi değiştirmeniz gerekmektedir.`)}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="w-full h-12 bg-[#25D366] text-white font-black text-[11px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all rounded-sm"
                        >
                           <i className="fa-brands fa-whatsapp text-lg"></i>
                           WHATSAPP İLE PAYLAŞ
                        </a>

                        <button onClick={() => setIsQRModalOpen(false)} className="w-full h-12 bg-black text-white font-black text-[11px] uppercase tracking-widest hover:bg-[#3b82f6] transition-all shadow-xl rounded-sm">
                           KAPAT
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {
            isDrawerOpen && (
               <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm bg-grid-hatched">
                     <div className="flex justify-between items-center mb-8 shrink-0">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest leading-none">{drawerMode === 'ADD' ? 'YENİ_KADRO_KAYDI' : 'KADRO_GÜNCELLEME'}</h3>
                           <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.4em] mt-2 block">PERSONEL_DNA_GİRİŞİ</span>
                        </div>
                        <button onClick={() => setIsDrawerOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="space-y-6">
                        <div className="space-y-1.5">
                           <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">AD SOYAD</label>
                           <input
                              autoFocus
                              className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6] shadow-inner"
                              value={teacherData.name}
                              onFocus={handleInputFocus}
                              onChange={e => setTeacherData({ ...teacherData, name: e.target.value.toUpperCase() })}
                           />
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">BRANŞLAR (ÇOKLU SEÇİM)</label>
                           <button
                              onClick={() => setIsBranchPickerOpen(true)}
                              className="w-full bg-black border border-white/10 p-3 text-left flex items-center justify-between group hover:border-[#3b82f6] transition-all"
                           >
                              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                                 {teacherData.branchShorts.length > 0 ? teacherData.branchShorts.map(b => (
                                    <span key={b} className="text-[9px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-0.5 border border-[#fbbf24]/20 rounded-sm">{standardizeBranchCode(b)}</span>
                                 )) : <span className="text-[11px] font-bold text-slate-600">BRANŞ SEÇİNİZ...</span>}
                              </div>
                              <i className="fa-solid fa-chevron-right text-slate-600 group-hover:text-[#3b82f6]"></i>
                           </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1.5">
                              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">DERS YÜKÜ (KOTA)</label>
                              <div className="flex items-center gap-2 bg-black border border-white/10 p-1">
                                 <button onClick={() => setTeacherData(p => ({ ...p, lessonCount: Math.max(0, p.lessonCount - 1) }))} className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-white/5"><i className="fa-solid fa-minus"></i></button>
                                 <span className="flex-1 text-center text-xl font-black text-white">{teacherData.lessonCount}</span>
                                 <button onClick={() => setTeacherData(p => ({ ...p, lessonCount: p.lessonCount + 1 }))} className="w-10 h-10 flex items-center justify-center text-green-500 hover:bg-white/5"><i className="fa-solid fa-plus"></i></button>
                              </div>
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">TERCİH EDİLEN VARDİYA</label>
                              <div className="flex gap-1">
                                 <button onClick={() => setTeacherData(p => ({ ...p, shift: ShiftType.SABAH }))} className={`flex-1 h-12 border text-[9px] font-black uppercase transition-all ${teacherData.shift === ShiftType.SABAH ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}>SABAH</button>
                                 <button onClick={() => setTeacherData(p => ({ ...p, shift: ShiftType.OGLE }))} className={`flex-1 h-12 border text-[9px] font-black uppercase transition-all ${teacherData.shift === ShiftType.OGLE ? 'bg-[#fcd34d] border-[#fcd34d] text-black shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}>ÖĞLE</button>
                              </div>
                           </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">CİNSİYET</label>
                           <div className="flex gap-2">
                              <button onClick={() => setTeacherData(p => ({ ...p, gender: Gender.MALE }))} className={`flex-1 h-10 border flex items-center justify-center gap-2 transition-all ${teacherData.gender === Gender.MALE ? 'bg-slate-700 border-slate-500 text-white' : 'bg-black border-white/10 text-slate-600'}`}><i className="fa-solid fa-mars"></i> ERKEK</button>
                              <button onClick={() => setTeacherData(p => ({ ...p, gender: Gender.FEMALE }))} className={`flex-1 h-10 border flex items-center justify-center gap-2 transition-all ${teacherData.gender === Gender.FEMALE ? 'bg-pink-600 border-pink-500 text-white' : 'bg-black border-white/10 text-slate-600'}`}><i className="fa-solid fa-venus"></i> KADIN</button>
                           </div>
                        </div>

                        <div className="p-3 bg-black/20 border border-white/5 space-y-2">
                           <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-widest block border-b border-white/5 pb-1">SİSTEM GİRİŞ BİLGİLERİ</span>
                           <div className="grid grid-cols-2 gap-2">
                              <input placeholder="KULLANICI ADI" className="bg-black border border-white/10 p-2 text-[10px] font-bold text-white outline-none focus:border-[#3b82f6]" value={teacherData.username} onChange={e => setTeacherData({ ...teacherData, username: e.target.value })} />
                              <input placeholder="ŞİFRE" className="bg-black border border-white/10 p-2 text-[10px] font-bold text-[#fbbf24] outline-none focus:border-[#3b82f6]" value={teacherData.password} onChange={e => setTeacherData({ ...teacherData, password: e.target.value })} />
                           </div>
                        </div>

                        <button
                           onClick={handleSaveTeacher}
                           disabled={!teacherData.name || teacherData.branchShorts.length === 0}
                           className="w-full h-14 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.4em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-20 disabled:grayscale"
                        >
                           {drawerMode === 'ADD' ? 'DNAYI_KAYDET' : 'GÜNCELLEMEYİ_MÜHÜRLLE'}
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {
            teacherToDelete && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 rounded-sm">
                     <h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">PERSONEL_SİLME_ONAYI</h3>
                     <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">
                        BU PERSONEL VE İLGİLİ DERS PROGRAMI KAYITLARI SİLİNECEKTİR: <br />
                        <span className="text-red-500 text-lg block mt-2 font-black">{teacherToDelete.name}</span>
                     </p>
                     <div className="flex gap-4">
                        <button onClick={() => setTeacherToDelete(null)} className="flex-1 h-12 border border-[#64748b] text-[#f1f5f9] font-black text-[10px] uppercase hover:bg-white/5 transition-all">İPTAL</button>
                        <button onClick={executeDeleteTeacher} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl hover:brightness-110 transition-all">EVET_SİL</button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* EDIT EXAM MODAL FOR TEACHER PANEL */}
         {
            isEditExamModalOpen && examToEdit && (
               <div className="fixed inset-0 z-[8200] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-[14px] font-black text-white uppercase tracking-widest">SINAV DÜZENLE</h3>
                           <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.4em] mt-2 block">{examToEdit.lessonName} | {examToEdit.className}</span>
                        </div>
                        <button onClick={() => setIsEditExamModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
                     </div>

                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">SINAV NO</label>
                           <div className="grid grid-cols-4 gap-2">
                              {['exam1', 'exam2', 'exam3', 'exam4'].map((slot, idx) => (
                                 <button
                                    key={slot}
                                    onClick={() => setEditExamForm({ ...editExamForm, slot })}
                                    className={`h-10 border text-[10px] font-black uppercase transition-all ${editExamForm.slot === slot ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-lg' : 'bg-black border-white/10 text-slate-500 hover:text-white'}`}
                                 >
                                    {idx + 1}. YAZILI
                                 </button>
                              ))}
                           </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">TARİH SEÇİNİZ</label>
                           <input
                              type="date"
                              className="w-full bg-black border border-white/10 p-3 text-[12px] font-bold text-white outline-none focus:border-[#3b82f6] uppercase"
                              value={editExamForm.date}
                              onChange={(e) => setEditExamForm({ ...editExamForm, date: e.target.value })}
                           />
                        </div>

                        <button
                           onClick={handleUpdateExam}
                           disabled={!editExamForm.date}
                           className="w-full h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-50 disabled:grayscale"
                        >
                           GÜNCELLEMEYİ KAYDET
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* CONFIRM DELETE EXAM MODAL */}
         {
            examToDelete && (
               <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
                  <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 rounded-sm">
                     <h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">SINAV_SİLME_ONAYI</h3>
                     <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">
                        BU SINAV KAYDI SİSTEMDEN KALICI OLARAK SİLİNECEKTİR: <br />
                        <span className="text-red-500 text-lg block mt-2 font-black">{examToDelete.lessonName} - {examToDelete.date}</span>
                     </p>
                     <div className="flex gap-4">
                        <button onClick={() => setExamToDelete(null)} className="flex-1 h-12 border border-[#64748b] text-[#f1f5f9] font-black text-[10px] uppercase hover:bg-white/5 transition-all">İPTAL</button>
                        <button onClick={executeDeleteExam} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl hover:brightness-110 transition-all">EVET_SİL</button>
                     </div>
                  </div>
               </div>
            )
         }
      </div >
   );
};

export default TeachersModule;
