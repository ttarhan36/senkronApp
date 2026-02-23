
import React, { useMemo, useState, useEffect } from 'react';
import { Teacher, ClassSection, Lesson, ModuleType, ShiftType, ScheduleEntry, CommsCategory, CommsType, Announcement, UserRole, Course, GradeRecord, Gender, Student } from '../types';
import { getBranchColor, getSectionColor, standardizeDayCode } from '../utils';

interface DashboardProps {
  teachers: Teacher[];
  classes: ClassSection[];
  setClasses?: (c: ClassSection[] | ((prev: ClassSection[]) => ClassSection[])) => void;
  lessons: Lesson[];
  schedule: ScheduleEntry[];
  setActiveModule: (m: ModuleType) => void;
  announcements: Announcement[];
  userRole?: UserRole;
  userName?: string;
  userId?: string;
  courses: Course[];
  setCourses?: (c: Course[]) => void;
  onSuccess?: (msg?: string) => void;
  studentTab?: 'GENEL' | 'DEVAMSIZLIK' | 'KONULAR' | 'SINAVLAR' | 'NOTLARIM' | 'KURSLAR';
}

const Dashboard: React.FC<DashboardProps> = ({ 
  teachers, classes, setClasses, lessons, schedule, setActiveModule, 
  announcements, userRole, userName, userId, courses, setCourses, onSuccess, studentTab
}) => {
  const [activeTab, setActiveTab] = useState<'GENEL' | 'DEVAMSIZLIK' | 'KONULAR' | 'SINAVLAR' | 'NOTLARIM' | 'KURSLAR'>('GENEL');
  const [viewingStudentsId, setViewingStudentsId] = useState<string | null>(null);

  // Parent'tan gelen tab değişirse güncelle
  useEffect(() => {
    if (studentTab) {
        setActiveTab(studentTab);
    }
  }, [studentTab]);

  // Günlük Devamsızlık Analizi
  const todaysAbsentees = useMemo(() => {
    // Öğrenci ise bu veriyi görmemeli veya sadece kendi verisini görmeli (ama genel dashboardda buna gerek yok, öğrenci görünümü ayrı)
    if (userRole === UserRole.STUDENT) return [];

    const todayStr = new Date().toLocaleDateString('tr-TR');
    const list: { student: Student; className: string; missedCount: number; lessons: string[] }[] = [];

    classes.forEach(cls => {
      (cls.students || []).forEach(student => {
        // Bugünün 'ABSENT' kayıtlarını bul
        const todaysRecords = (student.attendanceHistory || []).filter(
          r => r.date === todayStr && r.status === 'ABSENT'
        );

        if (todaysRecords.length > 0) {
          // Tekrar eden ders isimlerini temizle
          const uniqueLessons = Array.from(new Set(todaysRecords.map(r => r.lessonName))) as string[];
          
          list.push({
            student: student,
            className: cls.name,
            missedCount: todaysRecords.length,
            lessons: uniqueLessons
          });
        }
      });
    });

    // En çok ders kaçıran en üstte olsun
    return list.sort((a, b) => b.missedCount - a.missedCount);
  }, [classes, userRole]);

  const studentData = useMemo(() => {
    if (userRole !== UserRole.STUDENT) return null;
    let found = null;
    classes.forEach(c => {
      const s = (c.students || []).find(st => st.number === userId);
      if (s) found = { student: s, class: c };
    });
    return found;
  }, [userRole, userId, classes]);

  const enrolledStudentsForModal = useMemo(() => {
    if (!viewingStudentsId) return [];
    const list: { student: Student; className: string }[] = [];
    classes.forEach(cls => {
      (cls.students || []).forEach(st => {
        if (st.courseIds?.includes(viewingStudentsId)) {
          list.push({ student: st, className: cls.name });
        }
      });
    });
    return list.sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [viewingStudentsId, classes]);

  const viewingCourse = useMemo(() => courses.find(c => c.id === viewingStudentsId), [viewingStudentsId, courses]);

  const handleToggleCourse = (courseId: string) => {
    if (!studentData || !setClasses || !setCourses || !onSuccess) return;
    
    const targetCourse = courses.find(c => c.id === courseId);
    if (!targetCourse) return;

    const currentCourses = studentData.student.courseIds || [];
    const isEnrolled = currentCourses.includes(courseId);

    if (!isEnrolled && targetCourse.enrolledCount >= targetCourse.capacity) {
      onSuccess("HATA: KURS KONTENJANI DOLU!");
      return;
    }

    // 1. ÖĞRENCİ DNA GÜNCELLEME
    setClasses(prev => prev.map(c => {
      if (c.id === studentData.class.id) {
        const students = (c.students || []).map(s => {
          if (s.number === userId) {
            return { 
              ...s, 
              courseIds: isEnrolled ? currentCourses.filter(id => id !== courseId) : [...currentCourses, courseId] 
            };
          }
          return s;
        });
        return { ...c, students };
      }
      return c;
    }));

    // 2. KURS DNA SENKRONİZASYONU
    setCourses(courses.map(c => {
      if (c.id === courseId) {
        return { 
          ...c, 
          enrolledCount: isEnrolled ? Math.max(0, c.enrolledCount - 1) : c.enrolledCount + 1 
        };
      }
      return c;
    }));

    onSuccess(isEnrolled ? "KURS_KAYDI_İPTAL_EDİLDİ" : "KURSA_KAYIT_OLUNDU");
  };

  const studentMissedLessonsSummary = useMemo(() => {
    if (!studentData?.student?.attendanceHistory) return [];
    const stats: Record<string, number> = {};
    studentData.student.attendanceHistory.forEach(h => { 
      if (h.status === 'ABSENT') stats[h.lessonName] = (stats[h.lessonName] || 0) + 1; 
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [studentData]);

  // STUDENT LESSON LOGS (Homeworks & Topics)
  const studentRecentLogs = useMemo(() => {
    if (!studentData?.class?.lessonLogs || !schedule) return [];
    
    const daysMap = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS'];

    return [...studentData.class.lessonLogs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(log => {
            // Find lesson name from schedule based on date and hour
            let lessonName = 'DERS';
            try {
                const [d, m, y] = log.date.split('.').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const dayCode = daysMap[dateObj.getDay()];
                
                const scheduleEntry = schedule.find(s => 
                    s.sinif === studentData.class.name && 
                    standardizeDayCode(s.gun) === dayCode && 
                    Number(s.ders_saati) === Number(log.hour)
                );
                
                if (scheduleEntry) lessonName = scheduleEntry.ders;
            } catch (e) {
                console.error("Date parse error for log", e);
            }

            const teacher = teachers.find(t => t.id === log.teacherId);

            return {
                ...log,
                displayLesson: lessonName,
                displayTeacher: teacher?.name || 'ÖĞRETMEN'
            };
        });
  }, [studentData, schedule, teachers]);

  // STUDENT UPCOMING EXAMS
  const studentUpcomingExams = useMemo(() => {
    if (!studentData?.class?.exams) return [];
    
    const today = new Date();
    today.setHours(0,0,0,0);

    return studentData.class.exams
        .map(e => {
            let dateObj: Date | null = null;
            // Parse diverse date formats (DD.MM.YYYY or YYYY-MM-DD)
            if (e.date.includes('.')) {
                const [d, m, y] = e.date.split('.').map(Number);
                dateObj = new Date(y, m - 1, d);
            } else if (e.date.includes('-')) {
                const [y, m, d] = e.date.split('-').map(Number);
                dateObj = new Date(y, m - 1, d);
            }

            if (!dateObj) return null;

            // Calculate diff days
            const diffTime = dateObj.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const lesson = lessons.find(l => l.id === e.lessonId);

            return {
                ...e,
                lessonName: lesson?.name || 'DERS',
                daysLeft: diffDays,
                displayDate: e.date,
                timestamp: dateObj.getTime()
            };
        })
        .filter(e => e && e.daysLeft >= 0) // Filter out past exams
        .sort((a, b) => a!.daysLeft - b!.daysLeft); // Sort ascending (nearest first)

  }, [studentData, lessons]);

  const computedGPA = useMemo(() => {
    if (!studentData?.student?.grades) return "0.0";
    const validGrades = studentData.student.grades.filter(g => g.average !== undefined);
    if (validGrades.length === 0) return "0.0";
    return (validGrades.reduce((acc, g) => acc + (g.average || 0), 0) / validGrades.length).toFixed(1);
  }, [studentData]);

  const socialHours = useMemo(() => {
    if (!studentData?.student?.courseIds) return 0;
    return studentData.student.courseIds.length * 2;
  }, [studentData]);

  const studentPerformance = useMemo(() => {
    if (!studentData?.student?.grades) return { top: [], bottom: [] };
    const valid = studentData.student.grades
      .filter(g => g.average !== undefined)
      .map(g => {
        const lesson = lessons.find(l => l.id === g.lessonId);
        return { name: lesson?.name || '?', avg: g.average || 0 };
      })
      .sort((a, b) => b.avg - a.avg);
    return {
      top: valid.slice(0, 3),
      bottom: [...valid].reverse().slice(0, 3).filter(x => !valid.slice(0, 3).some(v => v.name === x.name))
    };
  }, [studentData, lessons]);

  if (userRole === UserRole.STUDENT && studentData) {
    const { student, class: studentClass } = studentData;
    
    return (
      <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 overflow-hidden pb-20">
        <div className="bg-[#0f172a] border-2 border-[#3b82f6]/40 p-5 rounded-sm shadow-2xl relative overflow-hidden flex items-center justify-between bg-grid-hatched shrink-0">
           <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-black border-2 border-white/10 rounded-full flex items-center justify-center shadow-inner group overflow-hidden relative">
                 <i className="fa-solid fa-user text-3xl text-slate-800"></i>
                 <div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0f172a] shadow-[0_0_8px_currentColor] ${student.gender === Gender.FEMALE ? 'bg-pink-500 text-pink-500 shadow-[0_0_8px_#ec4899]' : 'bg-slate-500 text-slate-500'}`}></div>
              </div>
              <div className="flex flex-col">
                 <h2 className="text-[22px] font-black text-white uppercase tracking-widest leading-none">{student.name}</h2>
                 <div className="flex items-center gap-3 mt-3">
                    <span className="px-2 py-0.5 bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24] text-[9px] font-black uppercase tracking-widest">NO: {student.number}</span>
                    <span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-[0.2em]">{studentClass.name} ŞUBESİ</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar bg-[#080c10] border border-white/5 rounded-sm relative bg-grid-hatched p-4">
           {activeTab === 'GENEL' && (
              <div className="space-y-4 animate-in slide-in-from-bottom-2 pb-12">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-900/60 border border-white/5 p-4 shadow-xl relative overflow-hidden rounded-sm">
                       <span className="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.4em] block mb-3">VELİ_DNA_VE_İLETİŞİM</span>
                       <div className="space-y-3">
                          <div>
                             <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">VELİ ADI SOYADI</label>
                             <span className="text-[12px] font-black text-white uppercase">{student.parentName || 'BELİRTİLMEDİ'}</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/40 p-2.5 border border-white/5">
                             <div className="flex-1">
                                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">TELEFON_HABERLEŞME</label>
                                <span className="text-[13px] font-black text-[#fbbf24] tracking-widest">{student.parentPhone || 'KAYITSIZ'}</span>
                             </div>
                             {student.parentPhone && <i className="fa-solid fa-phone text-green-500 text-xs"></i>}
                          </div>
                       </div>
                    </div>
                    <div className="bg-slate-900/60 border border-white/5 p-4 shadow-xl relative overflow-hidden rounded-sm flex flex-col h-[140px]">
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-3">İDARİ_NOT_DNA</span>
                       <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                          {(student.observations && student.observations.length > 0) ? student.observations.map(obs => (
                             <div key={obs.id} className="bg-black/20 p-2 border-l-2 border-[#3b82f6]">
                                <p className="text-[10px] font-black text-white italic">"{obs.content}"</p>
                                <div className="flex justify-between mt-1"><span className="text-[7px] font-black text-[#3b82f6]">{obs.teacherName}</span><span className="text-[6px] text-slate-600">{obs.date}</span></div>
                             </div>
                          )) : (
                             <div className="flex items-center justify-center h-full opacity-20 italic text-[9px] uppercase tracking-widest">Gözlem notu bulunmuyor...</div>
                          )}
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm">
                       <span className="text-[28px] font-black text-[#fbbf24] leading-none">{computedGPA}</span>
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">GENEL_ORTALAMA</span>
                    </div>
                    <div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm">
                       <span className="text-[28px] font-black text-white leading-none">{student.attendanceCount || '0'}</span>
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">DEVAMSIZLIK</span>
                    </div>
                    <div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm">
                       <span className="text-[28px] font-black text-[#3b82f6] leading-none">{socialHours} s</span>
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">SOSYAL_GÖREV (S)</span>
                    </div>
                    <div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm">
                       <span className="text-[24px] font-black text-green-500 leading-none">%{Math.round((parseFloat(computedGPA) / 100) * 85 + 15)}</span>
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">AKADEMİK_TREND</span>
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'SINAVLAR' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                 {/* UPCOMING EXAMS SECTION */}
                 <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-calendar-check text-[#fcd34d]"></i>
                        <h3 className="text-[10px] font-black text-[#fcd34d] uppercase tracking-[0.4em]">YAKLAŞAN SINAVLARIM</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        {studentUpcomingExams.length > 0 ? studentUpcomingExams.map(exam => {
                            const isCritical = exam.daysLeft <= 3;
                            const isNear = exam.daysLeft <= 7;
                            const colorClass = isCritical ? 'border-red-500 text-red-500' : isNear ? 'border-orange-500 text-orange-500' : 'border-green-500 text-green-500';
                            const bgClass = isCritical ? 'bg-red-500/10' : isNear ? 'bg-orange-500/10' : 'bg-green-500/10';

                            return (
                                <div key={exam.id} className={`p-4 border-l-4 bg-[#1e293b] border-white/5 rounded-r-sm shadow-lg flex items-center justify-between group hover:brightness-110 transition-all ${isCritical ? 'border-l-red-500' : isNear ? 'border-l-orange-500' : 'border-l-green-500'}`}>
                                    <div>
                                        <span className="text-[14px] font-black text-white uppercase tracking-tight block">{exam.lessonName}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">{exam.displayDate}</span>
                                        <span className="text-[6px] font-black text-[#3b82f6] uppercase bg-[#3b82f6]/10 px-1.5 py-0.5 rounded-sm mt-2 inline-block border border-[#3b82f6]/20">{exam.slot.toUpperCase().replace('EXAM', '')}. YAZILI</span>
                                    </div>
                                    <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 ${colorClass} ${bgClass}`}>
                                        <span className="text-[18px] font-black leading-none">{exam.daysLeft}</span>
                                        <span className="text-[6px] font-bold uppercase">GÜN</span>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="col-span-full py-8 text-center opacity-30 border border-dashed border-white/10 rounded-sm bg-black/20">
                                <i className="fa-solid fa-mug-hot text-2xl mb-3 text-slate-500"></i>
                                <p className="text-[9px] font-black uppercase tracking-[0.3em]">YAKINDA SINAV YOK</p>
                            </div>
                        )}
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'KONULAR' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                 {/* RECENT LESSON LOGS SECTION */}
                 <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-book-open text-[#3b82f6]"></i>
                        <h3 className="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.4em]">SON İŞLENEN KONULAR VE ÖDEVLER</h3>
                    </div>
                    <div className="space-y-3">
                        {studentRecentLogs.length > 0 ? studentRecentLogs.map(log => (
                            <div key={log.id} className="bg-[#1e293b] border border-white/10 p-4 rounded-sm shadow-lg hover:border-[#3b82f6]/40 transition-all group">
                                <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-2">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-4" style={{ backgroundColor: getBranchColor(log.displayLesson) }}></div>
                                            <span className="text-[13px] font-black text-white uppercase tracking-tight">{log.displayLesson}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1 ml-3">{log.displayTeacher}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-0.5 border border-[#fbbf24]/20 rounded-sm">{log.date}</span>
                                        <span className="text-[6px] font-bold text-slate-500 uppercase mt-1 tracking-widest">{log.hour}. DERS</span>
                                    </div>
                                </div>
                                <div className="space-y-3 pl-3">
                                    <div>
                                        <span className="text-[7px] font-black text-[#3b82f6] uppercase tracking-widest block mb-1">İŞLENEN KONU</span>
                                        <p className="text-[11px] font-medium text-slate-300 leading-snug">{log.subject}</p>
                                    </div>
                                    {log.homework && (
                                        <div className="bg-black/20 p-2 border-l-2 border-amber-600/50">
                                            <span className="text-[7px] font-black text-amber-500 uppercase tracking-widest block mb-1">ÖDEV / PROJE</span>
                                            <p className="text-[11px] font-medium text-white leading-snug">{log.homework}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="py-12 text-center opacity-30 border-2 border-dashed border-white/10 rounded-sm">
                                <i className="fa-solid fa-book-open text-4xl mb-4 text-[#3b82f6]"></i>
                                <p className="text-[10px] font-black uppercase tracking-[0.4em]">DEFTER GİRİŞİ BULUNAMADI</p>
                            </div>
                        )}
                    </div>
                 </div>

                 {/* ATTENDANCE ANALYSIS SECTION */}
                 <div className="flex flex-col pt-6 border-t border-white/5">
                    <h3 className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em] mb-4">DERS_BAZLI_DEVAMSIZLIK_ANALİZİ</h3>
                    <div className="min-h-[200px] border border-white/5 bg-black/20 flex flex-col items-center justify-center relative overflow-hidden rounded-sm">
                       <div className="absolute inset-0 bg-grid-hatched opacity-40"></div>
                       {studentMissedLessonsSummary.length === 0 ? (
                          <div className="flex flex-col items-center gap-4 z-10 animate-in zoom-in duration-700">
                             <div className="w-16 h-16 rounded-sm border-2 border-green-500/40 flex items-center justify-center bg-green-500/5">
                                <i className="fa-solid fa-check-double text-2xl text-green-500"></i>
                             </div>
                             <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">TÜM DERSLERDE %100 KATILIM</p>
                          </div>
                       ) : (
                          <div className="w-full grid grid-cols-1 gap-1 z-10 px-4 py-4">
                             {studentMissedLessonsSummary.map(([lesson, count]) => (
                                <div key={lesson} className="h-12 bg-[#1e293b] border border-white/5 px-4 flex items-center justify-between hover:bg-slate-800 transition-all rounded-sm">
                                   <div className="flex items-center gap-4">
                                      <div className="w-1 h-6" style={{ backgroundColor: getBranchColor(lesson) }}></div>
                                      <span className="text-[12px] font-black text-white uppercase">{lesson}</span>
                                   </div>
                                   <span className="text-[14px] font-black text-red-500">{count} DERS</span>
                                </div>
                             ))}
                          </div>
                       )}
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'DEVAMSIZLIK' && (
              <div className="space-y-3 animate-in slide-in-from-bottom-2">
                 {(student.attendanceHistory || []).length > 0 ? (student.attendanceHistory || []).slice().reverse().map(rec => (
                    <div key={rec.id} className="bg-[#1e293b] border border-white/5 p-3 flex items-center justify-between hover:bg-slate-800 transition-all">
                       <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-sm flex items-center justify-center border ${rec.status === 'ABSENT' ? 'bg-red-600/20 border-red-500/40 text-red-500' : 'bg-green-600/20 border-green-500/40 text-green-500'}`}><i className={`fa-solid ${rec.status === 'ABSENT' ? 'fa-xmark' : 'fa-check'} text-[10px]`}></i></div>
                          <div className="flex flex-col">
                             <span className="text-[11px] font-black text-white uppercase">{rec.lessonName}</span>
                             <span className="text-[7px] font-bold text-slate-500 uppercase">{rec.date} | {rec.period}. DERS</span>
                          </div>
                       </div>
                       <span className="text-[10px] font-black text-slate-500 uppercase">{rec.teacherName.split(' ').pop()}</span>
                    </div>
                 )) : <div className="py-24 text-center opacity-20 italic">DEVAMSIZLIK KAYDI BULUNAMADI</div>}
           </div>
           )}

           {activeTab === 'NOTLARIM' && (
              <div className="space-y-1 animate-in slide-in-from-bottom-2">
                 {(studentClass.assignments || []).map(assign => {
                    const lesson = lessons.find(l => l.id === assign.lessonId);
                    const grade = student.grades?.find(g => g.lessonId === assign.lessonId) || { lessonId: assign.lessonId };
                    return (
                      <div key={assign.lessonId} className="bg-[#1e293b] border border-white/5 p-3 flex flex-col gap-2 relative overflow-hidden group hover:bg-[#253447] transition-all">
                         <div className="absolute left-0 top-1 bottom-1 w-1" style={{ backgroundColor: getBranchColor(lesson?.branch || '') }}></div>
                         <div className="flex justify-between items-center pl-1.5">
                            <span className="text-[13px] font-black text-white uppercase truncate">{lesson?.name}</span>
                            <span className={`text-[14px] font-black ${(grade.average || 0) < 50 ? 'text-red-500' : 'text-[#fbbf24]'}`}>{grade.average || '--'}</span>
                         </div>
                         <div className="grid grid-cols-2 gap-2 pl-1.5">
                            <div className="flex flex-col gap-1">
                               <span className="text-[6px] font-black text-[#3b82f6] uppercase tracking-widest opacity-60">I. DÖNEM</span>
                               <div className="flex gap-1">
                                  {[grade.exam1, grade.exam2, grade.exam3, grade.exam4, grade.oral1].map((val, i) => (
                                    <div key={i} className="flex-1 h-7 border border-white/5 bg-black/20 flex flex-col items-center justify-center">
                                       <span className="text-[9px] font-black text-white">{val || '-'}</span>
                                       <span className="text-[4px] font-bold text-slate-700 uppercase">{i === 4 ? 'SZ' : (i+1) + ' s'}</span>
                                    </div>
                                  ))}
                               </div>
                            </div>
                            <div className="flex flex-col gap-1 border-l border-white/5 pl-2">
                               <span className="text-[6px] font-black text-[#fbbf24] uppercase tracking-widest opacity-60">II. DÖNEM</span>
                               <div className="flex gap-1">
                                  {[grade.exam5, grade.exam6, grade.exam7, grade.exam8, grade.oral2].map((val, i) => (
                                    <div key={i} className="flex-1 h-7 border border-white/5 bg-black/20 flex flex-col items-center justify-center">
                                       <span className="text-[9px] font-black text-white">{val || '-'}</span>
                                       <span className="text-[4px] font-bold text-slate-700 uppercase">{i === 4 ? 'SZ' : (i+1) + ' s'}</span>
                                    </div>
                                  ))}
                               </div>
                            </div>
                         </div>
                      </div>
                    );
                 })}
              </div>
           )}

           {activeTab === 'KURSLAR' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 pb-12">
                 {/* AKTİF KURSLAR */}
                 <div className="space-y-2">
                    <span className="text-[9px] font-black text-[#fbbf24] uppercase tracking-[0.4em] ml-1">AKTİF_KURS_DNA</span>
                    <div className="space-y-1">
                       {student.courseIds && student.courseIds.length > 0 ? (
                          courses.filter(k => student.courseIds?.includes(k.id)).map(k => (
                             <div 
                               key={k.id} 
                               onClick={() => setViewingStudentsId(k.id)}
                               className="bg-[#1e293b] border border-white/10 px-4 h-14 flex items-center justify-between shadow-xl relative overflow-hidden group cursor-pointer"
                             >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-[0_0_10px_#22c55e]"></div>
                                <div className="ml-2 flex-1 min-w-0 pr-4">
                                   <div className="text-[13px] font-black text-white uppercase leading-none truncate">{k.name}</div>
                                   <div className="flex items-center gap-2 mt-1.5">
                                      <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">{k.teacherName}</span>
                                      <span className="text-[7px] font-black text-[#fbbf24] uppercase">{k.schedule}</span>
                                   </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleToggleCourse(k.id); }} className="w-10 h-10 border border-white/10 text-red-500 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center"><i className="fa-solid fa-user-minus"></i></button>
                             </div>
                          ))
                       ) : <div className="py-12 text-center opacity-30 border border-dashed border-white/10 uppercase text-[10px] tracking-[0.4em]">Aktif kurs kaydı bulunamadı</div>}
                    </div>
                 </div>

                 {/* KATALOG */}
                 <div className="space-y-2">
                    <span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-[0.4em] ml-1">KATALOG_DNA</span>
                    <div className="grid grid-cols-1 gap-1">
                       {courses.filter(k => !student.courseIds?.includes(k.id)).map(k => {
                          const isFull = k.enrolledCount >= k.capacity;
                          return (
                             <div 
                               key={k.id} 
                               onClick={() => setViewingStudentsId(k.id)}
                               className={`bg-[#1e293b]/40 border border-white/5 px-4 h-14 flex items-center justify-between group hover:bg-[#253447] transition-all cursor-pointer ${isFull ? 'opacity-50 grayscale' : ''}`}
                             >
                                <div className="flex flex-col flex-1 min-w-0 pr-4">
                                   <span className="text-[12px] font-black text-white uppercase truncate">{k.name}</span>
                                   <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest">{k.enrolledCount} / {k.capacity} DOLULUK</span>
                                      <span className="text-[6px] font-black text-[#fbbf24] uppercase tracking-widest">{k.schedule}</span>
                                   </div>
                                </div>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleCourse(k.id); }} 
                                  disabled={isFull}
                                  className={`px-4 h-9 text-white font-black text-[9px] uppercase tracking-widest active:scale-95 shadow-lg transition-all ${isFull ? 'bg-slate-700 cursor-not-allowed border border-white/10' : 'bg-[#3b82f6] border border-white/10 shadow-blue-500/10 hover:brightness-110'}`}
                                >
                                   {isFull ? 'DOLU' : '+ KAYIT'}
                                </button>
                             </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
           )}
        </div>

        {/* STUDENT LIST MODAL FOR DASHBOARD */}
        {viewingStudentsId && viewingCourse && (
          <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
             <div className="bg-[#0d141b] border-2 border-[#fbbf24] w-full max-w-md shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 rounded-sm overflow-hidden h-[80vh] bg-grid-hatched">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#162431]">
                   <div>
                      <h3 className="text-[14px] font-black text-white uppercase tracking-tight leading-tight truncate max-w-[250px]">{viewingCourse.name}</h3>
                      <span className="text-[7px] font-black text-[#fbbf24] uppercase mt-1 block tracking-widest">KATILIMCI LİSTESİ</span>
                   </div>
                   <button onClick={() => setViewingStudentsId(null)} className="w-9 h-9 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
                   {enrolledStudentsForModal.length > 0 ? enrolledStudentsForModal.map(({ student: st, className }) => (
                      <div key={st.id} className="bg-black/40 border border-white/5 p-3 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border border-white/5 flex items-center justify-center ${st.gender === Gender.FEMALE ? 'text-pink-500' : 'text-[#3b82f6]'}`}>
                               <i className={`fa-solid ${st.gender === Gender.FEMALE ? 'fa-venus' : 'fa-mars'} text-[8px]`}></i>
                            </div>
                            <span className="text-[11px] font-bold text-white uppercase">{st.name}</span>
                         </div>
                         <span className="text-[8px] font-black text-[#fbbf24] bg-[#fbbf24]/5 px-2 py-0.5 border border-[#fbbf24]/10">{className}</span>
                      </div>
                   )) : <div className="py-20 text-center opacity-20 text-[10px] uppercase font-black tracking-widest">Kayıt Bulunmuyor</div>}
                </div>
                <div className="p-4 bg-[#162431] border-t border-white/10">
                   <button onClick={() => setViewingStudentsId(null)} className="w-full h-12 bg-white text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">KAPAT</button>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  // Admin / Teacher generic dashboard
  return (
    <div className="space-y-6 animate-slide-up pb-20 overflow-x-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 px-1">
        <div className="bg-[#1e293b]/60 border border-white/10 p-3 flex flex-col justify-between h-28 shadow-lg group">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SİSTEM_KADROSU</span>
          <span className="text-[32px] font-black text-white leading-none">{teachers.length}</span>
          <span className="text-[7px] font-bold text-green-500 uppercase tracking-widest">DNA_AKTİF</span>
        </div>
        <div className="bg-[#1e293b]/60 border border-white/10 p-3 flex flex-col justify-between h-28 shadow-lg">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ŞUBELER</span>
          <span className="text-[32px] font-black text-white leading-none">{classes.length}</span>
          <div className="h-0.5 bg-[#3b82f6] w-full shadow-[0_0_10px_#3b82f6]"></div>
        </div>
        <div className="bg-[#1e293b]/60 border border-white/10 p-3 flex flex-col justify-between h-28 shadow-lg">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ÖĞRENCİLER</span>
          <span className="text-[32px] font-black text-white leading-none">{classes.reduce((acc, c) => acc + (c.students?.length || 0), 0)}</span>
          <div className="flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]"></div><div className="w-1.5 h-1.5 rounded-full bg-pink-500 opacity-50"></div></div>
        </div>
        <div className="bg-[#1e293b]/60 border border-white/10 p-3 flex flex-col justify-between h-28 shadow-lg group">
           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">CORE_ENGINE</span>
           <i className="fa-solid fa-microchip text-2xl text-[#3b82f6]/40 group-hover:scale-110 group-hover:text-[#3b82f6] transition-all"></i>
           <span className="text-[7px] font-black text-[#3b82f6] uppercase">STABILITY_v2.5</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ZAMAN TÜNELİ (DUYURULAR) - Sol Taraf (2/3) */}
        <div className="lg:col-span-2 bg-[#0d141b]/90 border border-[#354a5f]/40 p-5 relative overflow-hidden bg-grid-hatched shadow-2xl rounded-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-[13px] font-black text-white uppercase tracking-[0.4em] leading-none">Z A M A N _ T Ü N E L İ</h3>
              <p className="text-[7px] font-bold text-slate-500 uppercase mt-2 tracking-widest">GÜNCEL OKUL AKIŞI VE BİLDİRİMLER</p>
            </div>
            <button onClick={() => setActiveModule(ModuleType.COMMUNICATION)} className="px-4 py-1.5 bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-[#3b82f6] text-[9px] font-black uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all shadow-lg">TÜMÜ</button>
          </div>
          
          <div className="space-y-3 relative ml-0 h-[300px] overflow-y-auto no-scrollbar">
            <div className="absolute left-[11px] top-0 bottom-0 w-[1px] bg-white/5"></div>
            {announcements.length > 0 ? announcements.slice(0, 8).map((item, idx) => (
              <div key={item.id} className="flex gap-3 relative animate-in slide-in-from-left duration-300">
                <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center shrink-0 z-10 bg-[#0d141b] shadow-xl">
                   <i className="fa-solid fa-circle-info text-[8px] text-[#3b82f6]"></i>
                </div>
                <div className="flex-1 bg-black/40 border border-white/5 p-3.5 rounded-sm hover:border-[#3b82f6]/20 transition-all group">
                   <span className="text-[11px] font-black text-white uppercase tracking-tight group-hover:text-[#3b82f6] transition-colors block mb-1">{item.title}</span>
                   <p className="text-[9px] font-bold text-slate-400 leading-snug italic border-l border-white/10 pl-3">{item.content}</p>
                </div>
              </div>
            )) : (
              <div className="py-24 text-center opacity-10 flex flex-col items-center">
                 <i className="fa-solid fa-stream text-5xl mb-4"></i>
                 <span className="text-[12px] font-black uppercase tracking-[0.5em]">AKIŞ_SESSİZ</span>
              </div>
            )}
          </div>
        </div>

        {/* GÜNLÜK YOKLAMA RADARI - Sağ Taraf (1/3) */}
        <div className="bg-[#0d141b]/90 border border-red-600/30 p-5 relative overflow-hidden bg-grid-hatched shadow-2xl rounded-sm flex flex-col">
           <div className="flex items-center justify-between mb-6 shrink-0">
              <div>
                 <h3 className="text-[13px] font-black text-white uppercase tracking-[0.2em] leading-none">YOKLAMA RADARI</h3>
                 <p className="text-[7px] font-bold text-red-500 uppercase mt-2 tracking-widest">BUGÜNÜN DEVAMSIZLARI ({todaysAbsentees.length})</p>
              </div>
              <div className="w-8 h-8 rounded-full border border-red-600/40 flex items-center justify-center animate-pulse bg-red-600/10">
                 <i className="fa-solid fa-user-xmark text-red-500 text-xs"></i>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 h-[300px]">
              {todaysAbsentees.length > 0 ? todaysAbsentees.map((item, idx) => (
                 <div key={idx} className="bg-black/40 border border-white/5 p-3 flex items-center justify-between group hover:border-red-600/40 transition-all rounded-sm">
                    <div className="flex items-center gap-3">
                       <div className="w-1 h-8 bg-red-600"></div>
                       <div className="flex flex-col">
                          <span className="text-[11px] font-black text-white uppercase">{item.student.name}</span>
                          <div className="flex items-center gap-2">
                             <span className="text-[8px] font-bold text-[#fbbf24] bg-[#fbbf24]/10 px-1 border border-[#fbbf24]/20">{item.className}</span>
                             <span className="text-[7px] font-medium text-slate-500 truncate max-w-[100px]">{item.lessons.slice(0, 2).join(', ')}{item.lessons.length > 2 ? '...' : ''}</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex flex-col items-end">
                       <span className="text-[16px] font-black text-red-500 leading-none">{item.missedCount}</span>
                       <span className="text-[6px] font-bold text-slate-500 uppercase">DERS</span>
                    </div>
                 </div>
              )) : (
                 <div className="h-full flex flex-col items-center justify-center opacity-30">
                    <i className="fa-solid fa-clipboard-check text-5xl mb-4 text-green-500"></i>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center">BUGÜN DEVAMSIZLIK YOK</p>
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
