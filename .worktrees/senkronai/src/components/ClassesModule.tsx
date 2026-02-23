
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClassSection, Lesson, Teacher, ScheduleEntry, ShiftType, SchoolConfig, ClassLessonAssignment, Student, Gender, GradeRecord, AttendanceRecord, Exam, Course, StudentObservation, UserRole } from '../types';
import { getSectionColor, getBranchColor, getGradeFromLesson, standardizeBranchCode, parseGradeFromName, guessGenderFromName, standardizeDayCode } from '../utils';
import * as XLSX from 'xlsx';

interface ClassesModuleProps {
  classes: ClassSection[];
  setClasses: (c: ClassSection[] | ((prev: ClassSection[]) => ClassSection[])) => void;
  editMode: boolean;
  setEditMode?: (e: boolean) => void;
  onWatchModeAttempt: () => void;
  onSuccess: (msg?: string) => void;
  allLessons: Lesson[];
  setLessons: (l: Lesson[]) => void;
  allTeachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  schedule: ScheduleEntry[];
  setSchedule?: (s: ScheduleEntry[]) => void;
  initialClassName?: string | null;
  onNavigateToTeacher?: (teacherId: string) => void;
  schoolConfig: SchoolConfig;
  courses: Course[];
  setCourses: (c: Course[]) => void;
  userRole?: UserRole;
  userId?: string;
  onDeleteStudentDB?: (id: string) => void;
  onDeleteClassDB?: (id: string) => void;
}

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const DAYS_SHORT = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM'];
const GRADE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const ClassesModule: React.FC<ClassesModuleProps> = ({ 
  classes, setClasses, editMode, setEditMode, onWatchModeAttempt, onSuccess,
  allLessons, setLessons, allTeachers, setTeachers, schedule, setSchedule, 
  initialClassName, onNavigateToTeacher, schoolConfig, courses, setCourses,
  userRole, userId, onDeleteStudentDB, onDeleteClassDB
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(initialClassName ? classes.find(c => c.name === initialClassName)?.id || null : null);
  const [activeTab, setActiveTab] = useState<'PLAN' | 'KADRO' | 'ÖĞRENCİ' | 'SINAV'>('PLAN');
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [activeAttendanceActionId, setActiveAttendanceActionId] = useState<string | null>(null);
  const [activeClassListActionId, setActiveClassListActionId] = useState<string | null>(null);
  const [shiftFilter, setShiftFilter] = useState<'TÜMÜ' | ShiftType>('TÜMÜ');
  const [classSearchTerm, setClassSearchTerm] = useState('');
  
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [examForm, setExamForm] = useState<{lessonId: string, slot: any, date: string}>({lessonId: '', slot: 'exam1', date: ''});

  const [isAssigningTask, setIsAssigningTask] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [assignHours, setAssignHours] = useState<number>(2);
  const [showQuickAddLesson, setShowQuickAddLesson] = useState(false);
  const [showQuickAddTeacher, setShowQuickAddTeacher] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [quickBranchInput, setQuickBranchInput] = useState('');
  const [isQuickBranchManual, setIsQuickBranchManual] = useState(false);
  const [isBranchFilterActive, setIsBranchFilterActive] = useState(true);

  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isEditClassOpen, setIsEditClassOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [newClassData, setNewClassData] = useState({ name: '', grade: 9, type: 'ANADOLU', shift: ShiftType.SABAH });
  const [classToDelete, setClassToDelete] = useState<ClassSection | null>(null);

  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeStudentTab, setActiveStudentTab] = useState<'GENEL' | 'DEVAMSIZLIK' | 'DERSLER' | 'NOTLARIM' | 'KURSLAR'>('GENEL');
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  // Updated state for student data including credentials
  const [newStudentData, setNewStudentData] = useState({ name: '', number: '', gender: Gender.MALE, parentName: '', parentPhone: '', username: '', password: '' });
  const [viewingProofImg, setViewingProofImg] = useState<string | null>(null);
  const [attendanceToDelete, setAttendanceToDelete] = useState<AttendanceRecord | null>(null);
  
  const [isStudentMenuOpen, setIsStudentMenuOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  const [isObservationModalOpen, setIsObservationModalOpen] = useState(false);
  const [observationForm, setObservationForm] = useState({ teacherId: '', content: '' });

  const studentFileRef = useRef<HTMLInputElement>(null);
  const kadroFileRef = useRef<HTMLInputElement>(null);
  const assignSaveRef = useRef<HTMLDivElement>(null);
  
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<(Student & { targetClass: string })[] | null>(null);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [assignmentToDelete, setAssignmentToDelete] = useState<{lessonId: string, lessonName: string} | null>(null);

  const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
  const selectedStudent = useMemo(() => selectedClass?.students?.find(s => s.id === selectedStudentId), [selectedClass, selectedStudentId]);

  const getClassCapacity = (cls: ClassSection) => {
    const dailyHours = (!schoolConfig.isDualShift || cls.shift === ShiftType.SABAH) ? schoolConfig.morningPeriodCount : schoolConfig.afternoonPeriodCount;
    return dailyHours * 5;
  };

  // YETKİ KONTROLÜ: Sınav yönetimi için
  const canManageExam = (lessonId?: string) => {
    if (userRole === UserRole.ADMIN && editMode) return true;
    if (userRole === UserRole.TEACHER && userId && selectedClass) {
        // Eğer belirli bir ders ID'si verilmemişse, bu sınıfta herhangi bir derse atanmış mı diye bak (Modalı açmak için)
        if (!lessonId) {
            return selectedClass.assignments?.some(a => a.teacherId === userId);
        }
        // Belirli bir ders için yetki kontrolü
        return selectedClass.assignments?.some(a => a.lessonId === lessonId && a.teacherId === userId);
    }
    return false;
  };

  const currentTotalHours = useMemo(() => (selectedClass?.assignments || []).reduce((sum, a) => sum + a.hours, 0), [selectedClass]);
  const currentCapacity = useMemo(() => selectedClass ? getClassCapacity(selectedClass) : 0, [selectedClass, schoolConfig]);
  const isOverCapacity = currentTotalHours > currentCapacity;

  const HOURS = useMemo(() => {
    const isMorning = !schoolConfig.isDualShift || (selectedClass?.shift === ShiftType.SABAH);
    const count = isMorning ? schoolConfig.morningPeriodCount : schoolConfig.afternoonPeriodCount;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [schoolConfig, selectedClass]);

  const getTimeString = (hour: number) => {
    const startStr = (!schoolConfig.isDualShift || selectedClass?.shift === ShiftType.SABAH) ? schoolConfig.morningStartTime : schoolConfig.afternoonStartTime;
    const [h, m] = startStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + (hour - 1) * (schoolConfig.lessonDuration + schoolConfig.breakDuration);
    const endMinutes = totalMinutes + schoolConfig.lessonDuration;
    const format = (mins: number) => {
      const hh = Math.floor(mins / 60) % 24;
      const mm = mins % 60;
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    };
    return { start: format(totalMinutes), end: format(endMinutes) };
  };

  const getEntry = (day: string, hour: number) => {
    if (!selectedClass) return undefined;
    const stdDay = standardizeDayCode(day);
    return schedule.find(s => s.sinif === selectedClass.name && standardizeDayCode(s.gun) === stdDay && s.ders_saati === hour);
  };

  const getExamBadge = (lessonId: string) => {
    const exam = selectedClass?.exams?.find(e => e.lessonId === lessonId && (e.status === 'PLANNED' || !e.status));
    if (!exam) return null;
    
    // Tarih parsing ve karşılaştırma (UTC tabanlı)
    let examDateObj: Date;
    if (exam.date.includes('-')) {
        const parts = exam.date.split('-');
        // new Date(year, monthIndex, day) creates date in local time
        examDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
        const parts = exam.date.split('.');
        examDateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }

    const today = new Date();
    // UTC tabanlı karşılaştırma için saatleri sıfırla ve UTC tarihleri al
    const utcExam = Date.UTC(examDateObj.getFullYear(), examDateObj.getMonth(), examDateObj.getDate());
    const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = utcExam - utcToday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return null;
    return { text: diffDays === 0 ? 'BUGÜN SINAV' : `${diffDays} GÜN KALDI`, isUrgent: diffDays <= 3 };
  };

  const handleEditAssignment = (assignment: ClassLessonAssignment) => {
    if (!editMode) return onWatchModeAttempt();
    setSelectedLessonId(assignment.lessonId);
    setSelectedTeacherId(assignment.teacherId || '');
    setAssignHours(assignment.hours);
    setIsAssigningTask(true);
  };

  const handleKadroFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(file) {
        setIsImporting(true);
        setTimeout(() => { setIsImporting(false); onSuccess("KADRO_İÇERİ_AKTARILDI"); }, 1000);
    }
  };

  const handleImportKadro = () => { if (kadroFileRef.current) kadroFileRef.current.click(); };

  const handleDeleteExam = (id: string, lessonId: string) => {
    if (!canManageExam(lessonId)) return onWatchModeAttempt();
    setClasses(prev => prev.map(c => c.id === selectedClassId ? { ...c, exams: (c.exams || []).filter(e => e.id !== id) } : c));
    onSuccess("SINAV_İPTAL_EDİLDİ");
  };

  const handleDownloadPDF = () => { window.print(); };

  const studentMissedLessonsSummary = useMemo(() => {
    if (!selectedStudent?.attendanceHistory) return [];
    const stats: Record<string, number> = {};
    selectedStudent.attendanceHistory.forEach(h => { if (h.status === 'ABSENT') stats[h.lessonName] = (stats[h.lessonName] || 0) + 1; });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [selectedStudent]);

  const handleToggleCourse = (courseId: string) => {
    if (!selectedClass || !selectedStudentId) return;
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) {
            const students = c.students?.map(s => {
                if (s.id === selectedStudentId) {
                    const currentCourses = s.courseIds || [];
                    const isEnrolled = currentCourses.includes(courseId);
                    return { ...s, courseIds: isEnrolled ? currentCourses.filter(id => id !== courseId) : [...currentCourses, courseId] };
                }
                return s;
            });
            return { ...c, students };
        }
        return c;
    }));
    onSuccess("KURS_KAYDI_GÜNCELLENDİ");
  };

  const computedGPA = useMemo(() => {
    if (!selectedStudent?.grades) return "0.0";
    const validGrades = selectedStudent.grades.filter(g => g.average !== undefined);
    if (validGrades.length === 0) return "0.0";
    return (validGrades.reduce((acc, g) => acc + (g.average || 0), 0) / validGrades.length).toFixed(1);
  }, [selectedStudent]);

  const socialHours = useMemo(() => {
    if (!selectedStudent?.courseIds) return 0;
    return selectedStudent.courseIds.length * 2;
  }, [selectedStudent]);

  const studentPerformance = useMemo(() => {
    if (!selectedStudent?.grades) return { top: [], bottom: [] };
    const valid = selectedStudent.grades.filter(g => g.average !== undefined).map(g => {
        const lesson = allLessons.find(l => l.id === g.lessonId);
        return { name: lesson?.name || '?', avg: g.average || 0 };
    }).sort((a, b) => b.avg - a.avg);
    return { top: valid.slice(0, 3), bottom: [...valid].reverse().slice(0, 3).filter(x => !valid.slice(0, 3).some(v => v.name === x.name)) };
  }, [selectedStudent, allLessons]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const imported: (Student & { targetClass: string })[] = [];
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length < 3) continue;
                const name = String(row[1] || row[0] || '').trim();
                const num = String(row[2] || '').trim();
                if (!name || !num) continue;
                const id = `S-IMP-${num}-${Date.now()}`;
                const gender = guessGenderFromName(name);
                imported.push({ id, number: num, name: name.toUpperCase(), gender, grades: [], attendanceCount: 0, attendanceHistory: [], observations: [], gpa: 0, targetClass: selectedClass ? selectedClass.name : '' });
            }
            if (imported.length > 0) setImportPreview(imported);
        } catch (e) { onSuccess("DOSYA_OKUMA_HATASI"); }
        if (studentFileRef.current) studentFileRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleImportStudents = () => { if (studentFileRef.current) studentFileRef.current.click(); };

  const handleEditClass = (cls: ClassSection) => {
    if (!editMode) return onWatchModeAttempt();
    setEditingClassId(cls.id);
    setNewClassData({ name: cls.name, grade: cls.grade, type: cls.type, shift: cls.shift });
    setIsEditClassOpen(true);
    setActiveClassListActionId(null);
  };

  const classTeachers = useMemo(() => {
    if (!selectedClass) return [];
    const ids = selectedClass.assignments?.map(a => a.teacherId).filter(Boolean) || [];
    return allTeachers.filter(t => ids.includes(t.id));
  }, [selectedClass, allTeachers]);

  const handleSaveObservation = () => {
    if (!selectedClass || !selectedStudentId || !observationForm.teacherId || !observationForm.content) return;
    const teacher = allTeachers.find(t => t.id === observationForm.teacherId);
    const newObs: StudentObservation = { id: `OBS-${Date.now()}`, teacherName: teacher?.name || 'BİLİNMİYOR', content: observationForm.content, date: new Date().toLocaleDateString('tr-TR'), timestamp: Date.now() };
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) {
            return { ...c, students: c.students?.map(s => s.id === selectedStudentId ? { ...s, observations: [newObs, ...(s.observations || [])] } : s) };
        }
        return c;
    }));
    setIsObservationModalOpen(false);
    setObservationForm({ teacherId: '', content: '' });
    onSuccess("NOT_KAYDEDİLDİ");
  };

  const finalizeStudentImport = () => {
    if (!importPreview || !selectedClass) return;
    const newStudents = importPreview.map(({ targetClass, ...s }) => s);
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) return { ...c, students: [...(c.students || []), ...newStudents] };
        return c;
    }));
    setImportPreview(null);
    onSuccess(`${newStudents.length} ÖĞRENCİ_EKLENDİ`);
  };

  const handleSaveExam = () => {
    if (!selectedClass || !examForm.lessonId || !examForm.date) return;
    if (!canManageExam(examForm.lessonId)) return onWatchModeAttempt(); // YETKİ KONTROLÜ
    
    const newExam: Exam = { id: `EX-${Date.now()}`, lessonId: examForm.lessonId, slot: examForm.slot, date: examForm.date, status: 'PLANNED' };
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) return { ...c, exams: [...(c.exams || []), newExam] };
        return c;
    }));
    setIsExamModalOpen(false);
    setExamForm({ lessonId: '', slot: 'exam1', date: '' });
    onSuccess("SINAV_PLANLANDI");
  };

  const renderCalendar = () => {
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const startDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() || 7; 
    const days = [];
    for (let i = 1; i < startDay; i++) days.push(<div key={`empty-${i}`} className="h-20 bg-black/20 border border-white/5"></div>);
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${d < 10 ? '0'+d : d}.${(calendarMonth.getMonth()+1) < 10 ? '0'+(calendarMonth.getMonth()+1) : (calendarMonth.getMonth()+1)}.${calendarMonth.getFullYear()}`;
        const hasExam = selectedClass?.exams?.find(e => e.date === dateStr);
        const hasAttendance = selectedStudentId && selectedStudent?.attendanceHistory?.filter(h => h.date === dateStr);
        days.push(
            <div key={d} className="h-20 bg-[#1e293b]/40 border border-white/5 p-1 relative hover:bg-white/5 transition-all">
                <span className="text-[10px] font-black text-slate-500 absolute top-1 left-1">{d}</span>
                {hasExam && <div className="mt-4 bg-[#fbbf24]/20 border border-[#fbbf24]/40 px-1 py-0.5 text-[6px] font-bold text-[#fbbf24] truncate">{hasExam.slot}</div>}
                {hasAttendance && hasAttendance.length > 0 && <div className="mt-1 bg-red-600/20 border border-red-500/40 px-1 py-0.5 text-[6px] font-bold text-red-500 truncate">{hasAttendance.length} DERS YOK</div>}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-7 gap-1 flex-1">
            {['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS', 'PAZ'].map(day => <div key={day} className="text-center text-[9px] font-black text-slate-500 py-2 uppercase">{day}</div>)}
            {days}
        </div>
    );
  };

  const executeDeleteAttendance = () => {
    if (!selectedClass || !selectedStudentId || !attendanceToDelete) return;
    if (attendanceToDelete.id && onDeleteStudentDB) onDeleteStudentDB(attendanceToDelete.id); 
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) {
            const students = c.students?.map(s => {
                if (s.id === selectedStudentId) return { ...s, attendanceHistory: (s.attendanceHistory || []).filter(h => h.id !== attendanceToDelete.id), attendanceCount: Math.max(0, (s.attendanceCount || 0) - 1) };
                return s;
            });
            return { ...c, students };
        }
        return c;
    }));
    setAttendanceToDelete(null);
    onSuccess("YOKLAMA_KAYDI_SİLİNDİ");
  };

  const handleTransferStudent = (targetClassId: string) => {
    if (!selectedClass || !selectedStudent) return;
    if (!editMode) return onWatchModeAttempt();
    const targetClass = classes.find(c => c.id === targetClassId);
    if (!targetClass) return;
    const updatedSourceStudents = (selectedClass.students || []).filter(s => s.id !== selectedStudentId);
    const updatedTargetStudents = [...(targetClass.students || []), { ...selectedStudent, classId: targetClassId }];
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) return { ...c, students: updatedSourceStudents };
        if (c.id === targetClassId) return { ...c, students: updatedTargetStudents };
        return c;
    }));
    setIsTransferModalOpen(false);
    setSelectedStudentId(null);
    onSuccess(`NAKİL BAŞARILI: ${targetClass.name}`);
  };

  const executeDeleteStudent = () => {
    if (!selectedClass || !studentToDelete) return;
    const idToDel = studentToDelete.id;
    if (onDeleteStudentDB) onDeleteStudentDB(idToDel);
    setClasses(prev => prev.map(c => {
        if (c.id === selectedClass.id) return { ...c, students: (c.students || []).filter(s => s.id !== idToDel) };
        return c;
    }));
    setStudentToDelete(null);
    setSelectedStudentId(null);
    onSuccess("ÖĞRENCİ_SİLİNDİ");
  };

  const effectiveGrade = useMemo(() => parseGradeFromName(selectedClass?.name || ''), [selectedClass]);

  const handleLessonNameInput = (val: string) => {
    setQuickInput(val.toUpperCase());
    if (!isQuickBranchManual) {
        const parts = val.toUpperCase().split(' ');
        if (parts.length > 0) setQuickBranchInput(standardizeBranchCode(parts[0]));
    }
  };

  const handleQuickAddLesson = () => {
    if (!quickInput) return;
    const newLesson: Lesson = { id: `L-QUICK-${Date.now()}`, name: quickInput, branch: quickBranchInput || 'GENEL', hours: assignHours };
    setLessons([...allLessons, newLesson]);
    setSelectedLessonId(newLesson.id);
    setQuickInput('');
    setQuickBranchInput('');
    setShowQuickAddLesson(false);
    onSuccess("HIZLI_DERS_EKLENDİ");
  };

  const gradeFilteredLessons = useMemo(() => {
    if (!effectiveGrade) return allLessons;
    return allLessons.filter(l => {
      const g = getGradeFromLesson(l.name, l.branch);
      return g === null || g === effectiveGrade;
    });
  }, [allLessons, effectiveGrade]);

  const handleQuickAddTeacher = () => {
    if (!quickInput) return;
    const newTeacher: Teacher = { id: `T-QUICK-${Date.now()}`, name: quickInput.toUpperCase(), branch: 'GENEL', branchShort: 'GENEL', lessonCount: 22, availableDays: DAYS, guardDutyDays: [] };
    setTeachers([...allTeachers, newTeacher]);
    setSelectedTeacherId(newTeacher.id);
    setQuickInput('');
    setShowQuickAddTeacher(false);
    onSuccess("HIZLI_KADRO_EKLENDİ");
  };

  const handleSelectTeacher = (id: string) => {
    setSelectedTeacherId(id);
    // Scroll to hours section smoothly
    setTimeout(() => {
        assignSaveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  };

  const handleApplyAssignment = () => {
    if (!selectedClass || !selectedLessonId) return;
    const exists = selectedClass.assignments?.some(a => a.lessonId === selectedLessonId);
    setClasses(prev => prev.map(c => {
      if (c.id === selectedClass.id) {
        let newAssignments = [...(c.assignments || [])];
        if (exists) newAssignments = newAssignments.map(a => a.lessonId === selectedLessonId ? { ...a, teacherId: selectedTeacherId, hours: assignHours } : a);
        else newAssignments.push({ lessonId: selectedLessonId, teacherId: selectedTeacherId, hours: assignHours });
        return { ...c, assignments: newAssignments };
      }
      return c;
    }));
    setIsAssigningTask(false);
    setSelectedLessonId('');
    setSelectedTeacherId('');
    onSuccess("GÖREV_MÜHÜRLENDİ");
  };

  const executeDeleteAssignment = () => {
    if (!selectedClass || !assignmentToDelete) return;
    setClasses(prev => prev.map(c => {
      if (c.id === selectedClass.id) return { ...c, assignments: (c.assignments || []).filter(a => a.lessonId !== assignmentToDelete.lessonId) };
      return c;
    }));
    setAssignmentToDelete(null);
    onSuccess("GÖREV_SİLİNDİ");
  };

  const handleSaveClass = () => {
    if (!newClassData.name) return;
    if (editingClassId) {
      setClasses(prev => prev.map(c => c.id === editingClassId ? { ...c, ...newClassData } : c));
      onSuccess("ŞUBE_GÜNCELLENDİ");
    } else {
      const newClass: ClassSection = { id: `C-${Date.now()}`, ...newClassData, assignments: [], students: [], exams: [] };
      setClasses([...classes, newClass]);
      onSuccess("YENİ_ŞUBE_OLUŞTURULDU");
    }
    setIsAddClassOpen(false);
    setIsEditClassOpen(false);
    setNewClassData({ name: '', grade: 9, type: 'ANADOLU', shift: ShiftType.SABAH });
    setEditingClassId(null);
  };

  const executeDeleteClass = () => {
    if (!classToDelete) return;
    const idToDel = classToDelete.id;
    if (onDeleteClassDB) onDeleteClassDB(idToDel);
    setClasses(prev => prev.filter(c => c.id !== idToDel));
    setClassToDelete(null);
    onSuccess("ŞUBE_SİLİNDİ");
  };

  useEffect(() => {
    if (initialClassName) {
      const cls = classes.find(c => c.name === initialClassName);
      if (cls) setSelectedClassId(cls.id);
    }
  }, [initialClassName, classes]);

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (editMode) {
      e.target.value = '';
    }
    setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  };

  const handleToggleShift = () => {
    if (!editMode || !selectedClass) return onWatchModeAttempt();
    const newShift = selectedClass.shift === ShiftType.SABAH ? ShiftType.OGLE : ShiftType.SABAH;
    setClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, shift: newShift } : c));
    onSuccess(`VARDİYA_DEĞİŞTİRİLDİ: ${newShift}`);
  };

  const handleSaveStudent = () => {
    if (!selectedClass || !newStudentData.name || !newStudentData.number) return;
    const isEdit = !!selectedStudentId;
    setClasses(prev => prev.map(c => {
      if (c.id === selectedClass.id) {
        let updatedStudents;
        if (isEdit) {
          updatedStudents = (c.students || []).map(s => s.id === selectedStudentId ? { 
            ...s, 
            name: newStudentData.name.toUpperCase(), 
            number: newStudentData.number, 
            gender: newStudentData.gender, 
            parentName: newStudentData.parentName.toUpperCase(), 
            parentPhone: newStudentData.parentPhone,
            username: newStudentData.username,
            password: newStudentData.password
          } : s);
        } else {
          const newStudent: Student = { 
            id: `S${Date.now()}`, 
            name: newStudentData.name.toUpperCase(), 
            number: newStudentData.number, 
            gender: Gender.MALE, 
            grades: [], 
            attendanceCount: 0, 
            attendanceHistory: [], 
            observations: [], 
            gpa: 0, 
            parentName: newStudentData.parentName.toUpperCase(), 
            parentPhone: newStudentData.parentPhone,
            username: newStudentData.username,
            password: newStudentData.password
          };
          updatedStudents = [...(c.students || []), newStudent];
        }
        return { ...c, students: updatedStudents };
      }
      return c;
    }));
    setIsAddStudentOpen(false);
    setSelectedStudentId(null); 
    onSuccess(isEdit ? "ÖĞRENCİ_DNA_GÜNCELLE" : "ÖĞRENCİ_DNA_KAYDEDİLDİ");
    setNewStudentData({ name: '', number: '', gender: Gender.MALE, parentName: '', parentPhone: '', username: '', password: '' });
  };

  const filteredStudents = useMemo(() => {
    if (!selectedClass || !selectedClass.students) return [];
    const term = studentSearchTerm.toLowerCase();
    return selectedClass.students.filter(s => s.name.toLowerCase().includes(term) || s.number.includes(term));
  }, [selectedClass, studentSearchTerm]);

  const studentStats = useMemo(() => {
    if (!selectedClass || !selectedClass.students) return { male: 0, female: 0 };
    const male = selectedClass.students.filter(s => s.gender === Gender.MALE).length;
    const female = selectedClass.students.filter(s => s.gender === Gender.FEMALE).length;
    return { male, female };
  }, [selectedClass]);

  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      // ÖĞRENCİ FİLTRESİ: Eğer öğrenci ise sadece kayıtlı olduğu şubeyi görsün
      if (userRole === UserRole.STUDENT && userId) {
          const belongsToClass = cls.students?.some(s => s.number === userId || s.id === userId);
          if (!belongsToClass) return false;
      }

      const matchesShift = shiftFilter === 'TÜMÜ' || cls.shift === shiftFilter;
      const matchesSearch = cls.name.toLowerCase().includes(classSearchTerm.toLowerCase()) || cls.type.toLowerCase().includes(classSearchTerm.toLowerCase());
      return matchesShift && matchesSearch;
    });
  }, [classes, shiftFilter, classSearchTerm, userRole, userId]);

  const renderContent = () => {
    if (selectedClass) {
      const classColor = getSectionColor(selectedClass.name);
      return (
        <div className="bg-[#0f172a] flex flex-col h-full animate-in fade-in duration-200 overflow-hidden relative">
          <div className="p-3 border-b border-[#64748b]/60 bg-[#0f172a] shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button onClick={() => { if(selectedStudentId) { setSelectedStudentId(null); setIsStudentMenuOpen(false); } else { setSelectedClassId(null); } }} className="w-9 h-9 flex items-center justify-center border border-[#64748b] text-white hover:bg-white/10 transition-all shadow-lg active:scale-95 shrink-0"><i className="fa-solid fa-arrow-left text-[12px]"></i></button>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-12 h-12 flex items-center justify-center border-2 rounded-full shadow-lg shrink-0" style={{ borderColor: classColor }}><span className="text-[16px] font-black text-white uppercase tracking-tighter leading-none">{selectedClass.name}</span></div>
                  <button onClick={handleToggleShift} className={`text-[8px] font-black px-2 py-1 uppercase tracking-widest border border-white/10 transition-all ${selectedClass.shift === ShiftType.SABAH ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-[#3b82f6]/20' : 'text-[#fcd34d] bg-[#fcd34d]/10 border-[#fcd34d]/20'} ${editMode ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'}`}>{selectedClass.shift}</button>
                </div>
              </div>
              {!selectedStudentId && (
                <div className={`flex items-center gap-2 px-3 py-1.5 border shadow-inner transition-all duration-500 ${isOverCapacity ? 'bg-orange-600/20 border-orange-500 animate-pulse' : 'bg-black/40 border-white/5'}`}>
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[16px] font-black ${isOverCapacity ? 'text-orange-500' : 'text-[#fbbf24]'}`}>{currentTotalHours} s</span>
                      <span className="text-[12px] font-black text-white/20">/</span>
                      <span className="text-[14px] font-black text-white/60">{currentCapacity} s</span>
                    </div>
                    <span className={`text-[6px] font-black uppercase tracking-widest opacity-60 ${isOverCapacity ? 'text-orange-500' : 'text-[#94a3b8]'}`}>KAPER_YÜKÜ</span>
                  </div>
                </div>
              )}
            </div>
            {isOverCapacity && !selectedStudentId && (
                <div className="bg-orange-600 p-2 text-center animate-in slide-in-from-top-2 border-b-2 border-black/20">
                    <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase shadow-sm">KOTAYI AŞTINIZ! Lütfen ders saatlerini kapasiteye göre düzenleyin.</span>
                </div>
            )}
            <div className="px-1 py-1 flex gap-1 bg-black/20 border-t border-white/5">
              {['PLAN', 'KADRO', 'SINAV', 'ÖĞRENCİ'].map(tab => (
                <button key={tab} onClick={() => { setActiveTab(tab as any); setSelectedStudentId(null); setIsStudentMenuOpen(false); }} className={`flex-1 h-9 text-[8px] font-black tracking-widest transition-all ${activeTab === tab ? 'bg-[#334155] text-white' : 'text-slate-500 hover:text-white'}`}>{activeTab === tab && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3b82f6] shadow-[0_0_100px_rgba(59,130,246,0.3)] z-10"></div>}{tab} {tab === 'KADRO' ? `(${selectedClass?.assignments?.length || 0})` : tab === 'ÖĞRENCİ' ? `(${selectedClass?.students?.length || 0})` : ''}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative bg-grid-hatched flex flex-col">
            {activeTab === 'PLAN' && (
              <div className="bg-[#0d141b] flex flex-col h-full animate-in fade-in duration-300"><div className="flex-1 overflow-hidden bg-grid-hatched"><table className="w-full h-full border-collapse table-fixed"><thead><tr className="bg-[#1a242e]/98 sticky top-0 z-50 border-b border-[#354a5f]"><th className="w-10 border-r border-[#354a5f] text-[8px] font-black text-[#5a6d7f] py-2 uppercase">H</th>{DAYS_SHORT.map(day => (<th key={day} className="border-r border-[#354a5f] text-[9px] font-black tracking-widest text-white py-2 bg-black/20">{day}</th>))}</tr></thead><tbody>{HOURS.map(hour => { const times = getTimeString(hour); const isLunchBreak = !schoolConfig.isDualShift && hour === schoolConfig.lunchBreakAfter; return (<React.Fragment key={hour}><tr className="border-b border-[#354a5f]/10" style={{ height: `${85 / (HOURS.length + (isLunchBreak ? 1 : 0))}%` }}><td className="bg-[#111a24]/90 border-r border-[#354a5f] text-center font-black flex flex-col justify-center items-center h-full gap-0.5"><span className="text-[10px] text-[#5a6d7f]">{hour}</span><div className="flex flex-col text-[5px] font-bold text-[#007BFF]/50 uppercase tracking-tighter"><span>{times.start}</span><span>{times.end}</span></div></td>{DAYS_SHORT.map(day => { const entry = getEntry(day, hour); const bColor = entry ? getBranchColor(entry.ders) : 'transparent'; return (<td key={`${day}-${hour}`} className="p-0.5 relative align-middle">{entry ? (<div className="h-full w-full flex flex-col items-center justify-center transition-all border-l-[3px] border-white/5 bg-slate-900/40" style={{ borderLeftColor: bColor }}><span className="text-[12px] font-black text-white leading-none uppercase mb-0.5">{standardizeBranchCode(entry.ders)}</span><span className="text-[6px] font-black uppercase text-slate-500 truncate w-full text-center px-1">{entry.ogretmen.split(' ').pop()}</span></div>) : <div className="h-full w-full opacity-5"></div>}</td>); })}</tr>{isLunchBreak && (<tr className="bg-[#fbbf24]/5 border-y border-[#fbbf24]/20"><td className="border-r border-[#fbbf24]/20 text-center"><i className="fa-solid fa-utensils text-[#fbbf24] text-[8px]"></i></td><td colSpan={5} className="text-center py-1"><span className="text-[8px] font-black text-[#fbbf24] uppercase tracking-[0.5em]">ÖĞLE ARASI ({schoolConfig.lunchBreakStart || '--:--'} - {schoolConfig.lunchBreakEnd || '--:--'})</span></td></tr>)}</React.Fragment>); })}</tbody></table></div></div>
            )}
            {activeTab === 'KADRO' && (
              <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 relative">
                {isOverCapacity && (
                    <div className="m-4 bg-orange-950/20 border-2 border-orange-500/40 p-4 shadow-xl animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-2">
                            <i className="fa-solid fa-triangle-exclamation text-orange-500 text-xl"></i>
                            <h4 className="text-[12px] font-black text-orange-500 uppercase tracking-widest">YÜK ANALİZ RAPORU</h4>
                        </div>
                        <div className="mt-3 pt-2 border-t border-white/10 flex justify-between items-center">
                            <span className="text-[8px] font-black text-slate-500 uppercase">AŞIM MİKTARI:</span>
                            <span className="text-[14px] font-black text-red-500">+{currentTotalHours - currentCapacity} SAAT</span>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-32 space-y-1">{(selectedClass.assignments || []).length > 0 ? (selectedClass.assignments || []).map(assign => { const lesson = allLessons.find(l => l.id === assign.lessonId); const teacher = allTeachers.find(t => t.id === assign.teacherId); const examBadge = getExamBadge(assign.lessonId); const branchColor = getBranchColor(lesson?.branch || ''); const isMenuOpen = activeActionId === assign.lessonId; const isShiftMismatch = teacher && teacher.preferredShift && teacher.preferredShift !== selectedClass.shift; return (<div key={assign.lessonId} className="relative overflow-hidden group h-[52px] shrink-0 animate-in fade-in duration-300"><div className={`border transition-all duration-300 relative overflow-hidden h-full flex items-center justify-between bg-[#1e293b] ${isShiftMismatch ? 'border-red-600/60 shadow-[inset_0_0_15px_rgba(220,38,38,0.1)] bg-red-950/10' : 'border-white/5 hover:border-white/10 shadow-sm'} ${isMenuOpen ? '-translate-x-32' : ''}`}><div className="absolute left-0 top-1 bottom-1 w-[3px]" style={{ backgroundColor: branchColor }}></div><div className="flex-1 flex items-center min-w-0 ml-4 pr-2"><div className="flex flex-col min-w-0 flex-1 justify-center"><div className="flex items-center gap-2"><span className={`font-black uppercase tracking-tighter leading-none text-[13px] truncate block text-high-contrast ${isShiftMismatch ? 'text-red-400' : 'text-white'}`}>{lesson?.name || 'BELİRSİZ_DERS'}</span>{examBadge && (<div className={`text-[6px] font-black px-1 py-0.5 border uppercase tracking-widest ${examBadge.isUrgent ? 'bg-red-600/20 border-red-500 text-red-500 shadow-[0_0_100px_rgba(239,68,68,0.3)] animate-pulse' : 'bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]'}`}>{examBadge.text}</div>)}</div><div className="flex items-center gap-2 mt-0.5"><span className={`text-[9px] font-black uppercase truncate ${isShiftMismatch ? 'text-red-500' : 'text-[#93c5fd] opacity-70'}`}>{teacher?.name || 'PERSONEL_ATANMADI'}</span>{isShiftMismatch && <span className="text-[5px] font-black text-red-500 uppercase tracking-tighter">! VARDİYA_UYUMSUZ</span>}</div></div><div className="flex items-center gap-2 shrink-0 pr-2"><div className="flex items-center gap-1.5 px-2 py-1 bg-black/20 border border-white/5 rounded-sm"><span className={`text-[14px] font-black text-[#fbbf24]`}>{assign.hours}</span><span className="text-[5px] font-black text-slate-500 uppercase tracking-tighter">SAAT</span></div>{editMode && <button onClick={(e) => { e.stopPropagation(); setActiveActionId(isMenuOpen ? null : assign.lessonId); }} className={`w-8 h-8 flex items-center justify-center transition-all bg-black/20 hover:bg-black/40 ${isMenuOpen ? 'text-[#3b82f6]' : 'text-slate-500'}`}><i className="fa-solid fa-ellipsis-vertical text-base"></i></button>}</div></div></div><div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}><button onClick={(e) => { e.stopPropagation(); handleEditAssignment(assign); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-pen text-xs"></i><span className="text-[6px] font-black uppercase tracking-widest mt-1">DÜZENLE</span></button><button onClick={(e) => { e.stopPropagation(); setAssignmentToDelete({ lessonId: assign.lessonId, lessonName: lesson?.name || '' }); setActiveActionId(null); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-trash-can text-xs mb-1"></i><span className="text-[6px] font-black uppercase whitespace-nowrap tracking-widest">SİL</span></button></div></div>); }) : (<div className="py-24 flex flex-col items-center justify-center border border-dashed border-white/20 opacity-60 animate-in fade-in"><i className="fa-solid fa-user-plus text-6xl mb-6 text-[#3b82f6]"></i><p className="text-[13px] font-black uppercase tracking-[0.4em] text-white">KADRO_HAZIR_DEĞİL</p></div>)}</div><div className="absolute bottom-4 left-0 right-0 px-6 py-4 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/95 to-transparent z-[100] flex gap-2">{editMode && (<><input type="file" ref={kadroFileRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleKadroFileChange} /><button onClick={handleImportKadro} disabled={isImporting || isOverCapacity} className="flex-1 h-14 bg-green-600 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-lg border border-white/20 flex items-center justify-center gap-3 transition-all active:scale-95 hover:brightness-110 disabled:opacity-30 disabled:grayscale">{isImporting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-excel"></i>} KADRO IMPORT</button></>)}{userRole === UserRole.ADMIN && (<button onClick={() => { if (!editMode) onWatchModeAttempt(); else setIsAssigningTask(true); }} disabled={isOverCapacity && editMode} className={`flex-[2] h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-[0_10px_40px_rgba(59,130,246,0.4)] border border-white/20 flex items-center justify-center gap-3 transition-all active:scale-95 hover:brightness-110 ${!editMode ? 'opacity-80' : ''} disabled:opacity-30 disabled:grayscale`}><i className="fa-solid fa-bolt-lightning text-sm animate-pulse"></i> GÖREV ATAMA</button>)}</div></div>
            )}
            {activeTab === 'SINAV' && (
              <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 relative"><div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-32 space-y-4"><div className="bg-[#1e293b]/60 border border-white/5 p-4 relative overflow-hidden shadow-xl"><div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24]"></div><span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em] block mb-4">SINAV_TAKİP_MATRİSİ</span><div className="space-y-1">{(selectedClass.exams || []).length > 0 ? (selectedClass.exams || []).sort((a,b) => { 
                const parseDate = (d: string) => { 
                    if(d.includes('-')) { const p = d.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime(); }
                    const p = d.split('.'); return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime(); 
                }; 
                return parseDate(a.date) - parseDate(b.date); 
            }).map(exam => { 
                const lesson = allLessons.find(l => l.id === exam.lessonId); 
                
                let examDate: Date;
                let dayDisplay = '';
                let monthIndex = 0;

                if (exam.date.includes('-')) {
                    const parts = exam.date.split('-');
                    // new Date(year, monthIndex, day) creates date in local time
                    examDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    dayDisplay = parts[2];
                    monthIndex = parseInt(parts[1]) - 1;
                } else {
                    const parts = exam.date.split('.');
                    examDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                    dayDisplay = parts[0];
                    monthIndex = parseInt(parts[1]) - 1;
                }

                const today = new Date(); 
                
                // UTC tabanlı karşılaştırma
                const utcExam = Date.UTC(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
                const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                
                const diffTime = utcExam - utcToday;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const isDone = diffDays < 0;
                
                const monthNames = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA']; 
                
                return (<div key={exam.id} className="slim-row bg-[#0f172a] px-3 justify-between border border-white/5 hover:bg-slate-800 transition-all group h-[52px]"><div className="flex items-center gap-3"><div className={`w-9 h-9 flex flex-col items-center justify-center border rounded-sm ${isDone ? 'bg-green-600/10 border-green-500/30' : diffDays <= 3 ? 'bg-red-600/10 border-red-500/30 animate-pulse' : 'bg-white/5 border-white/10'}`}><span className={`text-[12px] font-black leading-none ${isDone ? 'text-green-500' : diffDays <= 3 ? 'text-red-500' : 'text-white'}`}>{dayDisplay}</span><span className="text-[6px] font-bold text-slate-500 uppercase">{monthNames[monthIndex] || 'TAR'}</span></div><div className="flex flex-col min-w-0"><span className="text-[12px] font-black text-white uppercase truncate">{lesson?.name || 'DERS'}</span><div className="flex items-center gap-2"><span className="text-[7px] font-black text-[#fbbf24] uppercase">{exam.slot.toUpperCase().replace('EXAM', '')}. YAZILI</span><span className={`text-[6px] font-black uppercase tracking-widest ${isDone ? 'text-green-500' : diffDays === 0 ? 'BUGÜN' : `${diffDays} GÜN KALDI`} `}>{isDone ? 'TAMAMLANDI' : diffDays === 0 ? 'BUGÜN' : `${diffDays} GÜN KALDI`}</span></div></div></div>
                {canManageExam(exam.lessonId) && (<button onClick={() => handleDeleteExam(exam.id, exam.lessonId)} className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i className="fa-solid fa-trash-can text-xs"></i></button>)}
                </div>); }) : (<div className="py-12 text-center opacity-20 border-2 border-dashed border-white/5"><i className="fa-solid fa-calendar-xmark text-4xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">SINAV TAKVİMİ BOŞ</p></div>)}</div></div></div><div className="absolute bottom-4 left-0 right-0 px-6 py-4 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/95 to-transparent z-[100]"><button onClick={() => { if (!canManageExam()) onWatchModeAttempt(); else setIsExamModalOpen(true); }} className="w-full h-14 bg-[#fbbf24] text-black font-black text-[11px] uppercase tracking-widest shadow-[0_10px_40px_rgba(251,191,36,0.3)] border border-white/20 flex items-center justify-center gap-3 transition-all active:scale-95 hover:brightness-110"><i className="fa-solid fa-calendar-plus text-sm"></i> SINAV TANIMLA</button></div></div>
            )}
            {activeTab === 'ÖĞRENCİ' && (
              selectedStudentId && selectedStudent ? (
                <div className="h-full flex flex-col animate-in slide-in-from-right duration-300 bg-[#0d141b] relative"><div className="bg-[#162431] p-4 border-b border-white/5 flex items-center justify-between relative"><div className="flex items-center gap-4"><div className="w-14 h-14 bg-black border-2 border-white/10 rounded-full flex items-center justify-center relative shadow-2xl overflow-hidden group"><i className="fa-solid fa-user text-2xl text-slate-700"></i><div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-black shadow-[0_0_8px_currentColor] ${selectedStudent.gender === Gender.FEMALE ? 'bg-pink-500 text-pink-500' : 'bg-slate-500 text-slate-500'}`}></div></div><div><h2 className="text-[18px] font-black text-white uppercase tracking-tighter leading-none">{selectedStudent.name}</h2><div className="flex items-center gap-2 mt-2"><span className="text-[9px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-0.5 border border-[#fbbf24]/20 uppercase">NO: {selectedStudent.number}</span><span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-widest">{selectedClass.name} ŞUBESİ</span></div></div></div><div className="relative"><button onClick={() => setIsStudentMenuOpen(!isStudentMenuOpen)} className="w-10 h-10 flex items-center justify-center border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-ellipsis-vertical text-xl"></i></button>{isStudentMenuOpen && (<div className="absolute right-0 top-12 w-56 bg-[#162431] border border-white/10 shadow-2xl z-[500] animate-in fade-in zoom-in-95 duration-200"><div className="p-2 border-b border-white/5 bg-black/20"><span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] px-2">YÖNETİM_PANELİ</span></div><button onClick={() => { setIsStudentMenuOpen(false); if (!editMode) onWatchModeAttempt(); else { setNewStudentData({ name: selectedStudent.name, number: selectedStudent.number, gender: selectedStudent.gender, parentName: selectedStudent.parentName || '', parentPhone: selectedStudent.parentPhone || '', username: selectedStudent.username || '', password: selectedStudent.password || '' }); setIsAddStudentOpen(true); } }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#3b82f6]/10 group transition-all"><i className="fa-solid fa-user-pen text-[#3b82f6] text-[12px]"></i><span className="text-[10px] font-black text-white uppercase tracking-tighter group-hover:text-[#3b82f6]">BİLGİLERİ GÜNCELLE</span></button><button onClick={() => { setIsStudentMenuOpen(false); if (!editMode) onWatchModeAttempt(); else setIsTransferModalOpen(true); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-600/10 group transition-all"><i className="fa-solid fa-shuffle text-amber-500 text-[12px]"></i><span className="text-[10px] font-black text-white uppercase tracking-tighter group-hover:text-amber-500">ŞUBE_NAKİL_TAMAMLANDI</span></button><button onClick={() => { setIsStudentMenuOpen(false); if (!editMode) onWatchModeAttempt(); else setIsObservationModalOpen(true); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#a855f7]/10 group transition-all border-b border-white/5"><i className="fa-solid fa-notes-medical text-[#a855f7] text-[12px]"></i><span className="text-[10px] font-black text-white uppercase tracking-tighter group-hover:text-[#a855f7]">REHBERLİK NOTU EKLE</span></button><button onClick={handleDownloadPDF} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-green-600/10 group transition-all border-b border-white/5"><i className="fa-solid fa-file-pdf text-green-500 text-[12px]"></i><span className="text-[10px] font-black text-white uppercase tracking-tighter group-hover:text-green-500">GELİŞİM GRAFİĞİ (PDF)</span></button><button onClick={() => { if (!editMode) { setIsStudentMenuOpen(false); onWatchModeAttempt(); } else setStudentToDelete(selectedStudent); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-600/10 group transition-all"><i className="fa-solid fa-user-slash text-red-500 text-[12px]"></i><span className="text-[10px] font-black text-white uppercase tracking-tighter group-hover:text-red-500">ÖĞRENCİ KAYDINI SİL</span></button></div>)}</div></div><div className="flex bg-black/40 border-b border-white/5 p-1 gap-1">{['GENEL', 'DEVAMSIZLIK', 'DERSLER', 'NOTLARIM', 'KURSLAR'].map(st => (<button key={st} onClick={() => { setActiveStudentTab(st as any); setActiveAttendanceActionId(null); }} className={`flex-1 h-9 text-[8px] font-black tracking-widest transition-all ${activeStudentTab === st ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-400'}`}>{st}</button>))}</div><div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-20 bg-grid-hatched">
                      {/* ... Student tabs content same as before ... */}
                      {activeStudentTab === 'DEVAMSIZLIK' && (<div className="space-y-3 animate-in slide-in-from-bottom-2"><div className="bg-black/60 border border-white/5 p-5 shadow-xl relative overflow-hidden"><div className="flex justify-between items-center mb-6"><div className="pr-4 flex-1 min-w-0"><span className="text-[10px] font-black text-[#fcd34d] uppercase tracking-[0.4em] block">YOKLAMA</span><span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-1">GÜNCEL DNA KAYITLARI</span></div><div className="text-right flex flex-col items-end shrink-0 pr-8"><div className="flex items-center gap-4 mb-1"><button onClick={() => setIsCalendarOpen(true)} className="h-9 px-5 bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] font-black text-[9px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all flex items-center gap-2 shadow-lg shadow-[#3b82f6]/10 shrink-0"><i className="fa-solid fa-calendar-days text-[10px]"></i> TAKVİM</button><div className="flex flex-col items-center min-w-[36px]"><span className="text-[26px] font-black text-red-500 leading-none">{selectedStudent.attendanceCount}</span><span className="text-[6px] font-black text-slate-500 uppercase block tracking-tighter mt-1 opacity-60">TOPLAM</span></div></div></div></div><div className="space-y-1">{(selectedStudent.attendanceHistory || []).length > 0 ? (selectedStudent.attendanceHistory || []).slice().reverse().map(rec => { const isMenuOpen = activeAttendanceActionId === rec.id; return (<div key={rec.id} className="relative overflow-hidden group h-[52px] shrink-0 animate-in fade-in duration-300"><div className={`bg-[#1e293b] border border-white/5 p-2 flex items-center justify-between group transition-all duration-300 h-full relative ${isMenuOpen ? '-translate-x-32' : 'hover:bg-slate-800'}`}><div className="flex items-center gap-3 flex-1 min-w-0"><div className={`w-8 h-8 rounded-sm flex items-center justify-center border shrink-0 ${rec.status === 'ABSENT' ? 'bg-red-600/20 border-red-500/40 text-red-500' : 'bg-green-600/20 border-green-500/40 text-green-500'}`}><i className={`fa-solid ${rec.status === 'ABSENT' ? 'fa-xmark' : 'fa-check'} text-[10px]`}></i></div><div className="flex-1 min-w-0"><div className="text-[11px] font-black text-white uppercase tracking-tight truncate leading-none">{rec.lessonName}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-[7px] font-bold text-slate-500 uppercase">{rec.date} | {rec.period}. DERS</span>{rec.method === 'OPTICAL' && <span className="text-[6px] font-black text-[#3b82f6] uppercase bg-[#3b82f6]/10 px-1">AI_OPTICAL</span>}</div></div></div><div className="flex items-center gap-2 shrink-0">{rec.proofImageUrl && (<button onClick={(e) => { e.stopPropagation(); setViewingProofImg(rec.proofImageUrl!); }} className="w-7 h-7 bg-black/40 border border-white/5 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white transition-all flex items-center justify-center shadow-lg"><i className="fa-solid fa-eye text-[10px]"></i></button>)}{editMode && (<button onClick={(e) => { e.stopPropagation(); setActiveAttendanceActionId(isMenuOpen ? null : rec.id); }} className={`w-7 h-7 flex items-center justify-center transition-all bg-black/20 hover:bg-black/40 ${isMenuOpen ? 'text-[#3b82f6]' : 'text-slate-500'}`}><i className="fa-solid fa-ellipsis-vertical text-base"></i></button>)}</div></div><div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}><button onClick={(e) => { e.stopPropagation(); onSuccess("DÜZENLEME_MODULU_DNA_YUKLENIYOR"); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-pen text-xs mb-1"></i><span className="text-[6px] font-black uppercase whitespace-nowrap tracking-widest">DÜZENLE</span></button><button onClick={(e) => { e.stopPropagation(); setAttendanceToDelete(rec); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-trash-can text-xs :"></i><span className="text-[6px] font-black uppercase whitespace-nowrap tracking-widest">SİL</span></button></div></div>); }) : <div className="py-12 text-center opacity-20"><i className="fa-solid fa-calendar-check text-4xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">TEMİZ DNA: DEVAMSIZLIK YOK</p></div>}</div></div></div>)}
                      {activeStudentTab === 'DERSLER' && (<div className="space-y-3 animate-in slide-in-from-bottom-2"><div className="bg-black/60 border border-white/5 p-5 shadow-xl relative overflow-hidden"><span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em] block mb-6">DERS_BAZLI_DEVAMSIZLIK_ANALİZİ</span><div className="space-y-1">{studentMissedLessonsSummary.length > 0 ? studentMissedLessonsSummary.map(([lesson, count]) => (<div key={lesson} className="bg-[#1e293b] border border-white/5 px-4 h-11 flex items-center justify-between group transition-all hover:bg-slate-800"><div className="flex items-center gap-3"><div className="w-1 h-5 rounded-full" style={{ backgroundColor: getBranchColor(lesson) }}></div><span className="text-[12px] font-black text-white uppercase tracking-tighter">{lesson}</span></div><div className="flex items-center gap-2"><span className="text-[16px] font-black text-red-500 leading-none">{count}</span><span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest mt-1">DERS</span></div></div>)) : <div className="py-12 text-center opacity-20"><i className="fa-solid fa-check-double text-4xl mb-4 text-green-500"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">TÜM DERSLERDE %100 KATILIM</p></div>}</div></div></div>)}
                      {activeStudentTab === 'NOTLARIM' && (
                        <div className="space-y-1 animate-in slide-in-from-bottom-2">
                           {(selectedClass.assignments || []).map(assign => {
                              const lesson = allLessons.find(l => l.id === assign.lessonId);
                              const grade = selectedStudent.grades?.find(g => g.lessonId === assign.lessonId) || { lessonId: assign.lessonId };
                              const avgColor = (grade.average || 0) < 50 ? 'text-red-500' : 'text-[#fbbf24]';
                              const bColor = getBranchColor(lesson?.branch || '');
                              return (
                                <div key={assign.lessonId} className="bg-[#1e293b] border border-white/5 p-3 flex flex-col gap-2 relative overflow-hidden rounded-sm group hover:bg-[#253447] transition-all">
                                   <div className="absolute left-0 top-1 bottom-1 w-1" style={{ backgroundColor: bColor }}></div>
                                   <div className="flex justify-between items-center pl-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[13px] font-black text-high-contrast uppercase truncate tracking-tighter">{lesson?.name}</span>
                                        <span className="text-[10px] font-black text-[#3b82f6] uppercase tracking-tighter bg-[#3b82f6]/5 px-1.5 border border-[#3b82f6]/10">{assign.hours} s</span>
                                      </div>
                                      <div className="flex items-center gap-2 px-3 py-1 bg-black/40 border border-white/10">
                                         <span className={`text-[14px] font-black leading-none ${avgColor}`}>{grade.average || '--'}</span>
                                         <span className="text-[5px] font-black text-slate-500 uppercase tracking-tighter">YILSONU</span>
                                      </div>
                                   </div>
                                   <div className="grid grid-cols-2 gap-2 pl-1.5">
                                      <div className="flex flex-col gap-1">
                                         <span className="text-[6px] font-black text-[#3b82f6] uppercase tracking-widest opacity-60">I. DÖNEM_DNA</span>
                                         <div className="flex gap-1">
                                            {[grade.exam1, grade.exam2, grade.exam3, grade.exam4, grade.oral1].map((val, i) => (
                                              <div key={i} className={`flex-1 h-7 border flex flex-col items-center justify-center ${val === undefined ? 'bg-black/20 border-white/5' : 'bg-black/60 border-white/10 shadow-inner'}`}>
                                                 <span className="text-[9px] font-black text-white">{val || '-'}</span>
                                                 <span className="text-[4px] font-bold text-slate-700 uppercase">{i === 4 ? 'SZ' : (i+1) + ' s'}</span>
                                              </div>
                                            ))}
                                         </div>
                                      </div>
                                      <div className="flex flex-col gap-1 border-l border-white/5 pl-2">
                                         <span className="text-[6px] font-black text-[#fbbf24] uppercase tracking-widest opacity-60">II. DÖNEM_DNA</span>
                                         <div className="flex gap-1">
                                            {[grade.exam5, grade.exam6, grade.exam7, grade.exam8, grade.oral2].map((val, i) => (
                                              <div key={i} className={`flex-1 h-7 border flex flex-col items-center justify-center ${val === undefined ? 'bg-black/20 border-white/5' : 'bg-black/60 border-white/10 shadow-inner'}`}>
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
                      {activeStudentTab === 'KURSLAR' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-2 pb-12">
                          <div className="space-y-2"><span className="text-[9px] font-black text-[#fbbf24] uppercase tracking-[0.4em] ml-1">AKTİF_KURS_DNA</span><div className="space-y-1">{selectedStudent.courseIds && selectedStudent.courseIds.length > 0 ? (courses.filter(k => selectedStudent.courseIds?.includes(k.id)).map(k => (<div key={k.id} className="bg-[#1e293b] border border-white/10 px-4 h-14 flex items-center justify-between shadow-xl relative overflow-hidden group"><div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-[0_0_10px_#22c55e]"></div><div className="ml-2 flex-1 min-w-0 pr-4"><div className="text-[13px] font-black text-white uppercase leading-none truncate">{k.name}</div><div className="flex items-center gap-2 mt-1.5"><span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">{k.teacherName}</span><span className="text-[7px] font-black text-[#fbbf24] uppercase">{k.schedule}</span></div></div><div className="flex items-center gap-4"><div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 border border-white/5"><span className="text-[10px] font-black text-white">95%</span><span className="text-[6px] font-black text-slate-500 uppercase">KATILIM</span></div><button onClick={() => handleToggleCourse(k.id)} className="w-10 h-10 border border-white/10 text-red-500 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-lg"><i className="fa-solid fa-user-minus"></i></button></div></div>))) : (<div className="py-20 text-center opacity-30 border border-dashed border-white/10"><p className="text-[10px] font-black uppercase tracking-[0.4em]">KURS_KAYDI_YOK</p></div>)}</div></div>
                          <div className="space-y-2"><span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-[0.4em] ml-1">KATALOG_DNA</span><div className="grid grid-cols-1 gap-1">{courses.filter(k => !selectedStudent.courseIds?.includes(k.id)).map(k => {
                            const isFull = k.enrolledCount >= k.capacity;
                            return (
                            <div key={k.id} className={`bg-[#1e293b]/40 border border-white/5 px-4 h-14 flex items-center justify-between group hover:bg-[#253447] transition-all ${isFull ? 'opacity-50 grayscale' : ''}`}>
                               <div className="flex flex-col flex-1 min-w-0 pr-4">
                                  <span className="text-[12px] font-black text-white uppercase truncate">{k.name}</span>
                                  <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest">{k.enrolledCount} / {k.capacity} DOLULUK</span>
                               </div>
                               <button 
                                 onClick={() => handleToggleCourse(k.id)} 
                                 disabled={isFull}
                                 className={`px-4 h-9 text-white font-black text-[9px] uppercase tracking-widest active:scale-95 shadow-lg transition-all ${isFull ? 'bg-slate-700 cursor-not-allowed border border-white/10' : 'bg-[#3b82f6] border border-white/10 shadow-blue-500/10 hover:brightness-110'}`}
                               >
                                  {isFull ? 'DOLU' : '+ KAYIT'}
                               </button>
                            </div>
                          ); })}</div></div>
                        </div>
                      )}
                      {activeStudentTab === 'GENEL' && (<div className="space-y-4 animate-in slide-in-from-bottom-2 pb-12"><div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="bg-slate-900/60 border border-white/5 p-4 shadow-xl relative overflow-hidden rounded-sm"><span className="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.4em] block mb-3">VELİ_DNA_VE_İLETİŞİM</span><div className="space-y-3"><div><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">VELİ ADI SOYADI</label><span className="text-[12px] font-black text-white uppercase">{selectedStudent.parentName || 'BELİRTİLMEDİ'}</span></div><div className="flex justify-between items-center bg-black/40 p-2.5 border border-white/5 group"><div className="flex-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">TELEFON_HABERLEŞME</label><span className="text-[13px] font-black text-[#fbbf24] tracking-widest">{selectedStudent.parentPhone || 'KAYITSIZ'}</span></div>{selectedStudent.parentPhone && <a href={`tel:${selectedStudent.parentPhone}`} className="w-8 h-8 bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all rounded-sm"><i className="fa-solid fa-phone text-xs"></i></a>}</div></div></div><div className="bg-slate-900/60 border border-white/5 p-4 shadow-xl relative overflow-hidden rounded-sm flex flex-col"><div className="flex justify-between items-center mb-3"><span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block">İDARİ_NOT_DNA</span>{editMode && <button onClick={() => setIsObservationModalOpen(true)} className="h-6 px-3 bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] text-[8px] font-black uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all">NOT EKLE</button>}</div><div className="space-y-2 h-[84px] overflow-y-auto no-scrollbar">{(selectedStudent.observations && selectedStudent.observations.length > 0) ? selectedStudent.observations.map(obs => (<div key={obs.id} className="bg-black/20 p-2 border-l-2 border-[#3b82f6] animate-in slide-in-from-right-1"><p className="text-[10px] font-black text-white italic">"{obs.content}"</p><div className="flex justify-between mt-1"><span className="text-[7px] font-black text-[#3b82f6] uppercase tracking-tighter">{obs.teacherName}</span><span className="text-[6px] font-black text-slate-600 uppercase">{obs.date}</span></div></div>)) : (<div className="bg-black/20 p-2 border-l-2 border-slate-700 h-full flex items-center justify-center"><p className="text-[9px] font-bold text-slate-500 italic">Gözlem notu bulunmuyor...</p></div>)}</div></div></div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm"><span className="text-[28px] font-black text-[#fbbf24] leading-none drop-shadow-[0_0_8px_#fbbf2440]">{computedGPA}</span><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">GENEL_ORTALAMA</span></div><div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm relative overflow-hidden"><span className={`text-[28px] font-black leading-none ${selectedStudent.attendanceCount >= 8 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{selectedStudent.attendanceCount || '0'}</span><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">DEVAMSIZLIK</span>{selectedStudent.attendanceCount >= 8 && <div className="absolute top-1 right-1"><i className="fa-solid fa-triangle-exclamation text-red-500 text-[10px]"></i></div>}</div><div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm"><span className="text-[28px] font-black text-[#3b82f6] leading-none">{socialHours} s</span><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">SOSYAL_GÖREV (S)</span><div className="w-full h-1 bg-white/5 mt-2 rounded-full overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{ width: `${(socialHours/40)*100}%` }}></div></div></div><div className="bg-black/60 border border-white/10 p-5 flex flex-col items-center justify-center group hover:bg-slate-800/40 transition-all shadow-xl rounded-sm"><span className="text-[24px] font-black text-green-500 leading-none">%{Math.round((parseInt(computedGPA) / 100) * 85 + 15)}</span><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-2">AKADEMİK_TREND</span></div></div>
                      
                      <div className="bg-[#1e293b]/80 border border-white/5 p-4 shadow-xl relative overflow-hidden rounded-sm group hover:border-[#3b82f6]/40 transition-all mt-4">
                        <div className="flex items-center gap-2 mb-3"><i className="fa-solid fa-key text-[#3b82f6] text-xs"></i><span className="text-[9px] font-black text-white/90 uppercase tracking-widest">HESAP_KİMLİK_BİLGİLERİ</span></div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center bg-black/30 p-2 border border-white/5">
                            <span className="text-[8px] font-bold text-slate-500 uppercase">KULLANICI ADI</span>
                            <span className="text-[9px] font-black text-white">{selectedStudent.username || selectedStudent.number}</span>
                          </div>
                          <div className="flex justify-between items-center bg-black/30 p-2 border border-white/5">
                            <span className="text-[8px] font-bold text-slate-500 uppercase">ŞİFRE</span>
                            <span className="text-[9px] font-black text-[#fbbf24] font-mono tracking-wider">{selectedStudent.password ? '******' : 'BELİRLENMEMİŞ'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#0d141b] border border-white/5 p-4 rounded-sm shadow-2xl mt-4"><span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.4em] block mb-4">AKADEMİK_PERFORMANS_DNA_SKALASI</span><div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="space-y-1.5"><span className="text-[7px] font-black text-green-500 uppercase tracking-widest ml-1">EN BAŞARILI BİRİMLER</span>{studentPerformance.top.length > 0 ? studentPerformance.top.map((p, i) => (<div key={i} className="bg-green-500/5 border border-green-500/20 px-3 h-10 flex items-center justify-between"><span className="text-[11px] font-black text-white uppercase">{p.name}</span><span className="text-[12px] font-black text-green-500">{p.avg}</span></div>)) : <div className="text-[8px] font-bold text-slate-600 uppercase italic p-3 border border-dashed border-white/5 text-center">Veri hesaplanıyor...</div>}</div><div className="space-y-1.5"><span className="text-[7px] font-black text-red-500 uppercase tracking-widest ml-1">GELİŞTİRİLMESİ GEREKENLER</span>{studentPerformance.bottom.length > 0 ? studentPerformance.bottom.map((p, i) => (<div key={i} className="bg-red-500/5 border border-red-500/20 px-3 h-10 flex items-center justify-between"><span className="text-[11px] font-black text-white uppercase">{p.name}</span><span className="text-[12px] font-black text-red-500">{p.avg}</span></div>)) : <div className="text-[8px] font-bold text-slate-600 uppercase italic p-3 border border-dashed border-white/5 text-center">Tüm birimler stabil.</div>}</div></div></div></div>)}
                    </div>
                </div>
              ) : (
                <div className="h-full flex flex-col animate-in slide-in-from-bottom-4 relative"><div className="p-4 space-y-3 bg-[#0f172a]/80 backdrop-blur-sm sticky top-0 z-20 border-b border-white/5"><div className="flex gap-2 items-center"><div className="flex-1 relative"><i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#3b82f6] text-[10px]"></i><input type="text" placeholder="ÖĞRENCİ ARA..." className="w-full h-11 bg-black border border-white/10 pl-11 pr-24 text-[11px] font-black text-white uppercase outline-none focus:border-[#3b82f6] rounded-sm" value={studentSearchTerm} onChange={e => setStudentSearchTerm(e.target.value)} />{editMode && (<div className="absolute right-1 top-1 bottom-1 flex gap-1"><input type="file" ref={studentFileRef} className="hidden" accept=".xlsx" onChange={handleFileChange} /><button onClick={handleImportStudents} disabled={isImporting} className="px-3 bg-green-600 text-white font-black text-[8px] uppercase tracking-tighter hover:brightness-110 transition-all flex items-center gap-1.5 rounded-sm disabled:opacity-50">{isImporting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-excel"></i>} IMPORT</button></div>)}</div><div className="flex gap-1 bg-black/40 border border-white/10 h-11 px-3 items-center rounded-sm shrink-0"><div className="flex items-center gap-1.5 mr-2"><i className="fa-solid fa-mars text-[#3b82f6] text-[10px]"></i><span className="text-[10px] font-black text-white">{studentStats.male}</span></div><div className="w-px h-4 bg-white/10"></div><div className="flex items-center gap-1.5 ml-2"><i className="fa-solid fa-venus text-pink-500 text-[10px]"></i><span className="text-[10px] font-black text-white">{studentStats.female}</span></div></div></div></div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-32">
                  {filteredStudents.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredStudents.map(s => {
                        const isRestricted = userRole === UserRole.STUDENT && userId !== s.number && userId !== s.id;
                        return (
                          <div key={s.id} onClick={() => { if(!isRestricted) { setSelectedStudentId(s.id); setActiveStudentTab('GENEL'); } }} className={`h-[40px] bg-[#1e293b]/60 border border-white/5 px-3 flex items-center transition-all shadow-md relative overflow-hidden rounded-sm group ${isRestricted ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:bg-slate-800 cursor-pointer active:scale-[0.98]'}`}>
                            <div className="flex flex-col min-w-0 flex-1 justify-center">
                              <span className={`text-[12px] font-black uppercase truncate leading-tight ${isRestricted ? 'text-slate-500' : 'text-white group-hover:text-[#3b82f6]'}`}>{s.name}</span>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.gender === Gender.FEMALE ? 'bg-pink-500' : 'bg-slate-500'}`}></div>
                                <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest leading-none">NO: {s.number}</span>
                              </div>
                            </div>
                            {!isRestricted && <i className="fa-solid fa-chevron-right text-[8px] text-slate-700 group-hover:text-[#3b82f6] shrink-0 ml-1"></i>}
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="py-24 flex flex-col items-center justify-center opacity-30"><i className="fa-solid fa-graduation-cap text-5xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">VERİ_BULUNAMADI</p></div>}
                </div>
                {editMode && <button onClick={() => { setSelectedStudentId(null); setNewStudentData({ name: '', number: '', gender: Gender.MALE, parentName: '', parentPhone: '', username: '', password: '' }); setIsAddStudentOpen(true); }} className="absolute bottom-10 right-10 w-14 h-14 bg-[#3b82f6] text-white rounded-full shadow-[0_10px_30px_rgba(59,130,246,0.6)] flex items-center justify-center active:scale-90 transition-all z-[100] border-2 border-white/20 hover:scale-110"><i className="fa-solid fa-plus text-xl"></i></button>}</div>
              )
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4 h-full flex flex-col overflow-hidden animate-slide-up relative px-1">
        <div className="flex flex-col gap-3 shrink-0 px-1"><div className="flex gap-2 relative z-10"><div className="flex-1 relative h-11 group"><i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#3b82f6] text-[10px]"></i><input type="text" placeholder="ŞUBE_BİRİMİ ARA..." className="w-full h-full bg-black border border-[#64748b]/40 pl-11 pr-4 text-[11px] font-black uppercase text-white outline-none focus:border-[#3b82f6]" value={classSearchTerm} onChange={(e) => setClassSearchTerm(e.target.value)} /></div><button onClick={() => { if(!editMode) onWatchModeAttempt(); else setIsAddClassOpen(true); }} className="px-6 h-11 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 flex items-center gap-2 border border-white/10"><i className="fa-solid fa-plus text-[12px]"></i> EKLE</button></div><div className="flex gap-1.5">{['TÜMÜ', ShiftType.SABAH, ShiftType.OGLE].map(f => (<button key={f} onClick={() => setShiftFilter(f as any)} className={`flex-1 h-9 text-[9px] font-black uppercase tracking-widest border transition-all ${shiftFilter === f ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg' : 'bg-black/40 border-[#354a5f] text-slate-500 hover:bg-[#1e2e3d]'}`}>{f === 'TÜMÜ' ? 'TÜM' : f}</button>))}</div></div>
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 px-1 pb-24"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{filteredClasses.length > 0 ? filteredClasses.map(cls => { const isMenuOpen = activeClassListActionId === cls.id; const clsCap = getClassCapacity(cls); const clsLoad = (cls.assignments || []).reduce((s,a) => s + a.hours, 0); const isClsOver = clsLoad > clsCap; return (<div key={cls.id} className="relative overflow-hidden group h-16 shrink-0"><div onClick={() => setSelectedClassId(cls.id)} className={`bg-slate-900/80 border px-4 h-full flex items-center justify-between hover:bg-slate-800 transition-all cursor-pointer relative shadow-xl active:scale-[0.98] ${isClsOver ? 'border-orange-500/60 ring-1 ring-orange-500/30' : 'border-white/5'} ${isMenuOpen ? '-translate-x-32' : ''}`}><div className="absolute left-0 top-1 bottom-1 w-1 shadow-[0_0_15px_currentColor]" style={{ backgroundColor: getSectionColor(cls.name), color: getSectionColor(cls.name) }}></div><div className="flex flex-col ml-1 justify-center"><span className="text-xl font-black text-white uppercase tracking-tighter leading-none">{cls.name}</span><div className="flex items-center gap-2 mt-1.5 opacity-60"><span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">{cls.shift} | {cls.type}</span><div className="w-1 h-1 rounded-full bg-slate-700"></div><span className="text-[7px] font-black text-[#3b82f6] uppercase tracking-widest">{(cls.students || []).length} ÖĞR</span></div></div><div className="text-right flex items-center gap-3 shrink-0"><div className="flex flex-col items-end"><span className={`text-[18px] font-black leading-none ${isClsOver ? 'text-orange-500 animate-pulse' : 'text-[#fbbf24]'}`}>{clsLoad}/{clsCap}</span><span className={`text-[6px] font-black uppercase ${isClsOver ? 'text-orange-500' : 'text-slate-600'}`}>{isClsOver ? 'DNA_AŞIMI' : 'GÖREV'}</span></div>{editMode && <button onClick={(e) => { e.stopPropagation(); setActiveClassListActionId(isMenuOpen ? null : cls.id); }} className={`w-7 h-7 flex items-center justify-center transition-all bg-black/20 hover:bg-black/40 ${isMenuOpen ? 'text-[#3b82f6]' : 'text-slate-500'}`}><i className="fa-solid fa-ellipsis-vertical text-base"></i></button>}</div></div><div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}><button onClick={(e) => { e.stopPropagation(); handleEditClass(cls); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-pen text-xs"></i><span className="text-[6px] font-black uppercase tracking-widest mt-1">DÜZENLE</span></button><button onClick={(e) => { e.stopPropagation(); setClassToDelete(cls); setActiveClassListActionId(null); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"><i className="fa-solid fa-trash-can text-xs mb-1"></i><span className="text-[6px] font-black uppercase tracking-widest mt-1">SİL</span></button></div></div>); }) : <div className="col-span-full py-28 flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-white/5 rounded-lg"><p className="text-[12px] font-black uppercase tracking-[0.5em]">ŞUBE_BULUNAMADI</p></div>}</div></div>
      </div>
    );
  };

  return (
    <div className="h-full relative overflow-hidden">
      {renderContent()}

      {isObservationModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-t-4 border-[#a855f7] p-6 max-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm bg-grid-hatched">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-[14px] font-black text-white uppercase tracking-widest">GÖZLEM_DNA_NAKIŞI</h3>
                    <span className="text-[10px] font-black text-[#a855f7] uppercase tracking-[0.4em] mt-2 block">{selectedStudent.name}</span>
                 </div>
                 <button onClick={() => setIsObservationModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">YETKİLİ_PERSONEL (DERSİNE GİRENLER)</label>
                    <select 
                      value={observationForm.teacherId} 
                      onChange={e => setObservationForm({...observationForm, teacherId: e.target.value})}
                      className="w-full bg-black border border-white/10 p-3 text-[12px] font-black text-[#fbbf24] outline-none focus:border-[#a855f7] appearance-none"
                    >
                       <option value="">PERSONEL SEÇİNİZ...</option>
                       {classTeachers.length > 0 ? classTeachers.map(t => (
                         <option key={t.id} value={t.id}>{t.name}</option>
                       )) : allTeachers.map(t => (
                         <option key={t.id} value={t.id}>{t.name}</option>
                       ))}
                    </select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">HIZLI_GÖZLEM_ŞABLONLARI</label>
                    <div className="flex gap-2">
                       {["POTANSİYEL VAR", "KONU EKSİKLİĞİ", "MOTİVASYON GEREKİYOR"].map(tpl => (
                         <button 
                            key={tpl} 
                            onClick={() => setObservationForm({ ...observationForm, content: tpl })}
                            className="flex-1 py-3 bg-black border border-white/5 text-[9px] font-black text-slate-400 uppercase tracking-tighter hover:border-[#a855f7] hover:text-[#a855f7] transition-all active:scale-95"
                         >{tpl}</button>
                       ))}
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">GÖZLEM_METNİ</label>
                    <textarea 
                       rows={4} 
                       className="w-full bg-black border border-white/10 p-4 text-[13px] font-bold text-white outline-none focus:border-[#a855f7] resize-none shadow-inner leading-relaxed"
                       placeholder="ÖĞRENCİ HAKKINDAKİ GÖZLEMİNİZİ BURAYA YAZIN..."
                       value={observationForm.content}
                       onFocus={handleInputFocus}
                       onChange={e => setObservationForm({...observationForm, content: e.target.value})}
                    />
                 </div>
                 <button onClick={handleSaveObservation} disabled={!observationForm.teacherId || !observationForm.content} className="w-full h-16 bg-[#a855f7]/80 hover:bg-[#a855f7] text-white font-black text-[13px] uppercase tracking-[0.4em] shadow-[0_0_40px_rgba(168,85,247,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-20 border border-white/10">NOTU_MÜHÜRLLE</button>
              </div>
           </div>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/98 backdrop-blur-xl px-2 py-4">
           <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-lg shadow-[0_0_150px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 duration-300 rounded-sm overflow-hidden h-[80vh]">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                 <div>
                    <h3 className="text-[14px] font-black text-white uppercase tracking-[0.2em] leading-none">DNA_DOĞRULAMA_MATRİSİ</h3>
                    <span className="text-[8px] font-black text-[#3b82f6] uppercase mt-2 block tracking-widest">EXCEL AKTARIMI ÖNİZLEME</span>
                 </div>
                 <button onClick={() => setImportPreview(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar bg-grid-hatched p-2">
                 <div className="space-y-1">
                    {importPreview.map((item, idx) => (
                       <div key={idx} className="bg-black/60 border border-white/5 flex items-center h-14 relative group hover:bg-[#1e2e3d] transition-all">
                          <div className="w-12 h-full border-r border-white/5 flex items-center justify-center shrink-0">
                             <span className={`text-[12px] font-black ${item.gender === Gender.FEMALE ? 'text-pink-500 shadow-[0_0_100px_rgba(236,72,153,0.4)]' : 'text-[#3b82f6] shadow-[0_0_100px_rgba(59,130,246,0.4)]'}`}>
                                {item.gender === Gender.FEMALE ? 'K' : 'E'}
                             </span>
                          </div>
                          <div className="flex-1 px-4 flex flex-col justify-center min-w-0">
                             <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black text-[#fbbf24] uppercase whitespace-nowrap">NO: {item.number}</span>
                             </div>
                             <span className="text-[13px] font-black text-white uppercase truncate drop-shadow-md">{item.name}</span>
                          </div>
                          <div className="w-24 h-full border-l border-white/5 flex flex-col items-center justify-center shrink-0 bg-black/20">
                             <span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-widest truncate px-2">{item.targetClass}</span>
                             <span className="text-[5px] font-bold text-slate-700 uppercase mt-0.5 tracking-tighter text-center leading-none">SIRA <br/>HEDEF_ŞUBE</span>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
              <div className="p-4 bg-black/80 border-t border-white/10 flex gap-3 shrink-0">
                 <button onClick={() => setImportPreview(null)} className="flex-1 h-14 border border-[#354a5f] text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all active:scale-95">İPTAL</button>
                 <button onClick={finalizeStudentImport} className="flex-[2] h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-[0_10px_50px_rgba(59,130,246,0.3)] border border-white/20 active:scale-[0.98] transition-all hover:brightness-110">DNAYI_MÜHÜRLLE</button>
              </div>
           </div>
        </div>
      )}

      {isExamModalOpen && selectedClass && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
          <div className="bg-[#0d141b] border-t-4 border-[#fcd34d] p-6 max-md w-full shadow-2xl animate-in zoom-in-95 rounded-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[12px] font-black text-white uppercase tracking-widest">SINAV_PLANLA_DNA</h3>
              <button onClick={() => setIsExamModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">DERS_BİRİMİ</label>
                <select value={examForm.lessonId} onChange={e => setExamForm({...examForm, lessonId: e.target.value})} className="w-full bg-black border border-white/10 p-2.5 text-[11px] font-black text-white outline-none focus:border-[#fcd34d]">
                  <option value="">DERS SEÇİNİZ...</option>
                  {(selectedClass.assignments || []).filter(a => {
                      if (userRole === UserRole.TEACHER && userId) return a.teacherId === userId;
                      return true;
                  }).map(a => { const l = allLessons.find(less => less.id === a.lessonId); return <option key={a.lessonId} value={a.lessonId}>{l?.name}</option> })}
                </select>
              </div>
              <div className="space-y-2"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-2">I. DÖNEM SLOTS</label><div className="grid grid-cols-4 gap-1">{['exam1', 'exam2', 'exam3', 'exam4'].map((slot, idx) => (<button key={slot} onClick={() => setExamForm({...examForm, slot})} className={`h-10 border text-[9px] font-black uppercase transition-all ${examForm.slot === slot ? 'bg-[#fcd34d] text-black border-[#fcd34d]' : 'bg-black border-white/10 text-slate-500'}`}>S{idx+1}</button>))}</div></div>
              <div className="space-y-2"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block mb-2">II. DÖNEM SLOTS</label><div className="grid grid-cols-4 gap-1">{['exam5', 'exam6', 'exam7', 'exam8'].map((slot, idx) => (<button key={slot} onClick={() => setExamForm({...examForm, slot})} className={`h-10 border text-[9px] font-black uppercase transition-all ${examForm.slot === slot ? 'bg-[#fcd34d] text-black border-[#fcd34d]' : 'bg-black border-white/10 text-slate-500'}`}>S{idx+1}</button>))}</div></div>
              <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">TARİH_DAMGASI</label><input type="text" placeholder="Örn: 15.02.2024" className="w-full bg-black border border-white/10 p-2.5 text-[12px] font-black text-white outline-none focus:border-[#fcd34d]" value={examForm.date} onChange={e => setExamForm({...examForm, date: e.target.value})} /></div>
              <button onClick={handleSaveExam} className="w-full h-14 bg-[#fcd34d] text-black font-black text-[10px] uppercase tracking-widest mt-4 shadow-xl active:scale-95 transition-all">TAKVİME_MÜHÜRLLE</button>
            </div>
          </div>
        </div>
      )}
      {isCalendarOpen && selectedClass && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4"><div className="bg-[#0d141b] border-white/10 p-6 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"><div className="flex justify-between items-center mb-6"><h3 className="text-[12px] font-black text-white uppercase tracking-widest">DNA_TAKVİM_MATRİSİ</h3><button onClick={() => setIsCalendarOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-xl"></i></button></div><div className="flex items-center justify-between mb-4 bg-black/40 p-3 border border-white/5"><button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() - 1)))} className="text-white/60 hover:text-[#3b82f6]"><i className="fa-solid fa-chevron-left"></i></button><span className="text-[11px] font-black text-[#fbbf24] uppercase tracking-widest">{calendarMonth.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span><button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() + 1)))} className="text-white/60 hover:text-[#3b82f6]"><i className="fa-solid fa-chevron-right"></i></button></div>{renderCalendar()}</div></div>)}
      {viewingProofImg && (<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4" onClick={() => setViewingProofImg(null)}><img src={viewingProofImg} className="max-w-full max-h-full border border-white/20 shadow-2xl" /><div className="absolute top-4 right-4 bg-white/10 px-4 py-2 text-white font-black text-[10px] uppercase">DİJİTAL_KANIT_DNA</div></div>)}
      {attendanceToDelete && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 px-4"><div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95"><h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">KAYIT_SİLME_ONAYI</h3><p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">BU YOKLAMA KAYDI SİSTEMDEN KALICI OLARAK SİLİNECEKTİR: <br/><span className="text-red-500 text-lg block mt-2 font-black">{attendanceToDelete.lessonName} - {attendanceToDelete.date}</span></p><div className="flex gap-4"><button onClick={() => setAttendanceToDelete(null)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase">İPTAL</button><button onClick={executeDeleteAttendance} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase">EVET_SİL</button></div></div></div>)}
      {isAddStudentOpen && (<div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4 py-4 overflow-y-auto"><div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-sm w-full shadow-2xl animate-in zoom-in-95 rounded-sm my-auto"><div className="flex justify-between items-center mb-6"><h3 className="text-[12px] font-black text-white uppercase tracking-widest">{selectedStudentId ? 'ÖĞRENCİ_DNA_GÜNCELLE' : 'YENİ_ÖĞRENCİ_KAYDI'}</h3><button onClick={() => { setIsAddStudentOpen(false); setSelectedStudentId(null); }} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button></div><div className="space-y-4"><div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">AD SOYAD VE OKUL NO</label><div className="flex gap-2"><input name="studentName" autoFocus onFocus={handleInputFocus} placeholder="ÖĞRENCİ AD SOYAD" className="flex-[3] bg-black border border-white/10 p-2.5 text-[12px] font-black text-white uppercase outline-none focus:border-[#3b82f6]" value={newStudentData.name} onChange={e => setNewStudentData({...newStudentData, name: e.target.value.toUpperCase()})} /><input name="studentNumber" onFocus={handleInputFocus} placeholder="NO" className="flex-1 bg-black border border-white/10 p-2.5 text-[12px] font-black text-[#fbbf24] text-center outline-none focus:border-[#3b82f6] shadow-inner" value={newStudentData.number} onChange={e => setNewStudentData({...newStudentData, number: e.target.value})} /></div></div><div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">VELİ_HABERLEŞME_DNA (AD / TELEFON)</label><div className="flex gap-2"><input name="parentName" onFocus={handleInputFocus} placeholder="VELİ AD SOYAD" className="flex-[2] bg-black border border-white/10 p-2.5 text-[12px] font-black text-white uppercase outline-none focus:border-[#3b82f6]" value={newStudentData.parentName} onChange={e => setNewStudentData({...newStudentData, parentName: e.target.value.toUpperCase()})} /><input name="studentPhone" onFocus={handleInputFocus} placeholder="5XX XXX XX XX" className="flex-[1] bg-black border border-white/10 p-2.5 text-[12px] font-black text-[#fbbf24] outline-none focus:border-[#3b82f6] tracking-tight" value={newStudentData.parentPhone} onChange={e => setNewStudentData({...newStudentData, parentPhone: e.target.value})} /></div></div>
      
      <div className="bg-black/20 border border-white/5 p-3 space-y-2">
         <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-widest block border-b border-white/5 pb-1">GİRİŞ KİMLİK BİLGİLERİ</span>
         <div className="flex gap-2">
            <div className="flex-1 space-y-1">
               <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">KULLANICI ADI</label>
               <input 
                  className="w-full bg-black border border-white/10 p-2 text-[11px] font-black text-white outline-none focus:border-[#3b82f6]" 
                  value={newStudentData.username} 
                  onChange={e => setNewStudentData({...newStudentData, username: e.target.value})} 
                  placeholder={newStudentData.number || "KULLANICI ADI"}
               />
            </div>
            <div className="flex-1 space-y-1">
               <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE</label>
               <input 
                  type="text"
                  className="w-full bg-black border border-white/10 p-2 text-[11px] font-black text-[#fbbf24] outline-none focus:border-[#3b82f6]" 
                  value={newStudentData.password} 
                  onChange={e => setNewStudentData({...newStudentData, password: e.target.value})} 
                  placeholder="ŞİFRE BELİRLE"
               />
            </div>
         </div>
      </div>

      <div className="space-y-2"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">CİNSİYET VE KAYIT</label><div className="flex gap-2"><button onClick={() => setNewStudentData({...newStudentData, gender: Gender.MALE})} className={`w-12 h-12 border flex items-center justify-center transition-all ${newStudentData.gender === Gender.MALE ? 'bg-slate-700/40 border-slate-400 text-slate-300 shadow-[0_0_12px_rgba(148,163,184,0.3)]' : 'bg-black border-white/5 text-slate-700'}`} title="ERKEK"><span className="text-sm font-black">E</span></button><button onClick={() => setNewStudentData({...newStudentData, gender: Gender.FEMALE})} className={`w-12 h-12 border flex items-center justify-center transition-all ${newStudentData.gender === Gender.FEMALE ? 'bg-pink-600 border-pink-600 text-white shadow-[0_0_20px_rgba(236,72,153,0.5)] z-10' : 'bg-black border-white/5 text-pink-900/40'}`} title="KIZ"><span className="text-sm font-black">K</span></button><div className="flex-1"></div><button onClick={handleSaveStudent} className="w-12 h-12 bg-[#3b82f6] text-white border border-white/10 flex items-center justify-center shadow-xl active:scale-90 transition-all hover:brightness-110" title="KAYDET"><i className="fa-solid fa-floppy-disk text-lg"></i></button></div></div></div></div></div>)}
      {isTransferModalOpen && selectedStudent && (<div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4"><div className="bg-[#0d141b] border-t-4 border-amber-600 p-6 max-sm w-full shadow-2xl animate-in zoom-in-95 rounded-sm"><div className="flex justify-between items-center mb-6"><div><h3 className="text-[12px] font-black text-white uppercase tracking-widest">ŞUBE_NAKİL_MATRİSİ</h3><span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest mt-1 block">HEDEF ŞUBE SEÇİNİZ</span></div><button onClick={() => setIsTransferModalOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white"><i className="fa-solid fa-xmark"></i></button></div><div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar pr-1">{classes.filter(c => c.id !== selectedClassId).map(c => (<button key={c.id} onClick={() => handleTransferStudent(c.id)} className="w-full p-4 bg-black/40 border border-white/5 flex items-center justify-between hover:bg-white/5 transition-all group"><div className="flex items-center gap-3"><div className="w-1 h-6" style={{ backgroundColor: getSectionColor(c.name) }}></div><span className="text-[14px] font-black text-white uppercase">{c.name}</span></div><span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-amber-500 transition-colors">NAKİL ET</span></button>))}</div></div></div>)}
      {studentToDelete && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 px-4"><div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95"><h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">ÖĞRENCİ_DNA_SİLME</h3><p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">BU ÖĞRENCİ VE TÜM VERİLERİ (NOT, DEVAMSIZLIK) KALICI OLARAK SİLİNECEKTİR: <br/><span className="text-red-500 text-lg block mt-2 font-black">{studentToDelete.name}</span></p><div className="flex gap-4"><button onClick={() => setStudentToDelete(null)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase">İPTAL</button><button onClick={executeDeleteStudent} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl">EVET_SİL</button></div></div></div>)}
      {isAssigningTask && selectedClass && (
        <div className="fixed inset-0 z-[8000] flex items-start sm:items-center justify-center bg-black/95 backdrop-blur-md px-2 sm:px-4 py-4 sm:py-0 overflow-y-auto"><div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-4 sm:p-6 max-w-lg w-full shadow-[0_0_100px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 flex flex-col bg-grid-hatched rounded-sm shrink-0 my-auto"><div className="flex justify-between items-center mb-6 shrink-0"><div><h3 className="text-[14px] font-black text-white uppercase tracking-widest leading-none">GÖREV_MÜHÜRLLE_DNA</h3><span className="text-[9px] font-black text-[#3b82f6] uppercase tracking-0.4em mt-2 block">{selectedClass.name} ŞUBESİ ({selectedClass.shift})</span></div><button onClick={() => { setIsAssigningTask(false); setSelectedLessonId(''); setSelectedTeacherId(''); setShowQuickAddLesson(false); setShowQuickAddTeacher(false); setQuickInput(''); setIsBranchFilterActive(true); }} className="w-10 h-10 border border-white/10 text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-xmark text-lg"></i></button></div><div className="space-y-10 pb-8"><div className="space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><label className="text-[8px] font-black text-[#94a3b8] uppercase tracking-[0.4em]">1. DERS_BİRİMİ_SEÇİMİ</label><button onClick={() => {setShowQuickAddLesson(!showQuickAddLesson); setQuickInput('');}} className="w-6 h-6 flex items-center justify-center bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40 hover:bg-[#3b82f6] hover:text-white transition-all"><i className="fa-solid fa-plus text-[10px]"></i></button></div>{selectedLessonId && <button onClick={() => {setSelectedLessonId(''); setSelectedTeacherId('');}} className="text-[7px] font-bold text-red-500 uppercase tracking-widest">TEMİZLE</button>}</div><div className="bg-[#3b82f6]/5 border border-dashed border-[#3b82f6]/30 px-3 py-2 flex items-center justify-between"><div className="flex items-center gap-2"><i className="fa-solid fa-filter text-[#3b82f6] text-[8px]"></i><span className="text-[8px] font-black text-white uppercase tracking-widest">{effectiveGrade}. SINIF MÜFREDATI LİSTELENİYOR</span></div><span className="text-[6px] font-bold text-[#3b82f6] uppercase">DNA_FILTER_v2</span></div>{showQuickAddLesson && (<div className="flex flex-col gap-2 animate-in slide-in-from-top-2 bg-black/40 p-3 border border-dashed border-[#354a5f]"><div className="flex gap-2 h-12"><input name="quickAdd" autoFocus className="flex-[3] bg-black border border-[#354a5f] px-3 text-[11px] font-black text-white uppercase outline-none focus:border-[#3b82f6]" placeholder="DERS ADI..." value={quickInput} onChange={e => handleLessonNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuickAddLesson()} /><input className="w-20 bg-black border border-[#354a5f] px-2 text-[10px] font-black text-[#fcd34d] text-center uppercase outline-none focus:border-[#fcd34d]" placeholder="KOD" value={quickBranchInput} onChange={e => { setQuickBranchInput(e.target.value.toUpperCase()); setIsQuickBranchManual(true); }} /><button onClick={handleQuickAddLesson} className="min-w-[80px] bg-[#3b82f6] text-white font-black text-[10px] uppercase hover:brightness-110 active:scale-95 transition-all shadow-lg border border-white/10">EKLE</button></div></div>)}<div className="grid grid-cols-3 gap-2">{gradeFilteredLessons.length > 0 ? gradeFilteredLessons.map(l => { const isSelected = selectedLessonId === l.id; const isAlreadyAssigned = (selectedClass.assignments || []).some(a => a.lessonId === l.id); return (<button key={l.id} onClick={() => { setSelectedLessonId(l.id); setSelectedTeacherId(''); setAssignHours(l.hours); }} className={`h-16 border flex flex-col items-center justify-center p-2 transition-all relative ${isSelected ? 'border-[#3b82f6] bg-[#3b82f6]/10 shadow-[inset_0_0_15px_rgba(59,130,246,0.1)]' : isAlreadyAssigned ? 'border-white/5 bg-slate-800/40 grayscale opacity-40' : 'border-white/5 bg-white/5 hover:border-white/20'}`}>{isSelected && <div className="absolute top-1 right-1 w-4 h-4 bg-[#3b82f6] flex items-center justify-center shadow-[0_0_100px_rgba(59,130,246,0.5)] animate-in zoom-in duration-200"><i className="fa-solid fa-check text-[10px] text-white"></i></div>}<span className={`text-[10px] font-black leading-none uppercase truncate w-full text-center ${isSelected ? 'text-white' : 'text-white/70'}`}>{l.name}</span><span className="text-[12px] font-black text-[#3b82f6] uppercase mt-2 tracking-widest drop-shadow-md brightness-125">{standardizeBranchCode(l.branch)}</span></button>); }) : (<div className="col-span-3 py-6 border border-dashed border-red-500/20 bg-red-500/5 text-center"><p className="text-[8px] font-black text-red-500 uppercase tracking-widest">BU SINIF SEVİYESİNE UYGUN DERS BULUNAMADI</p><p className="text-[6px] font-bold text-slate-500 uppercase mt-1">Lütfen envantere {effectiveGrade}. sınıf dersleri tanımlayın</p></div>)}</div></div><div className={`space-y-4 transition-all duration-500 ${!selectedLessonId ? 'opacity-10 pointer-events-none grayscale' : 'opacity-100'}`}><div className="flex items-center gap-2">
  <label className="text-[8px] font-black text-[#94a3b8] uppercase tracking-[0.4em]">2. YETKİLİ_PERSONEL_BAĞLANTISI</label>
  <button onClick={() => {setShowQuickAddTeacher(!showQuickAddTeacher); setQuickInput('');}} className="w-6 h-6 flex items-center justify-center bg-[#fcd34d]/20 text-[#fcd34d] border border-[#fcd34d]/40 hover:bg-[#fcd34d] hover:text-black transition-all" title="Yeni Personel"><i className="fa-solid fa-user-plus text-[10px]"></i></button>
  <button onClick={() => setIsBranchFilterActive(!isBranchFilterActive)} className={`w-6 h-6 flex items-center justify-center transition-all border ${isBranchFilterActive ? 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/40' : 'bg-red-600/20 text-red-500 border-red-600/40 animate-pulse'}`} title={isBranchFilterActive ? "Tayin: Branş Odaklı" : "Tayin: Tüm Kadro (Eşleştirme Modu)"}>
    <i className={`fa-solid ${isBranchFilterActive ? 'fa-link' : 'fa-link-slash'} text-[10px]`}></i>
  </button>
</div>{showQuickAddTeacher && (<div className="flex gap-2 h-12 animate-in slide-in-from-top-2 bg-black/40 p-1 border border-dashed border-[#fcd34d]/30"><input name="quickTeacher" autoFocus onFocus={handleInputFocus} className="flex-1 bg-black border border-[#354a5f] px-3 text-[11px] font-black text-white uppercase outline-none focus:border-[#fcd34d]" placeholder="HOCA ADI..." value={quickInput} onChange={e => setQuickInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuickAddTeacher()} /><button onClick={handleQuickAddTeacher} className="min-w-[80px] bg-[#fcd34d] text-black font-black text-[10px] uppercase shadow-lg border border-white/10 hover:brightness-110 active:scale-95 transition-all">EKLE</button></div>)}<div className="space-y-1.5 max-h-[220px] overflow-y-auto no-scrollbar pr-1">{allTeachers.filter(t => { 
                  if (!isBranchFilterActive) return true;
                  const lesson = allLessons.find(l => l.id === selectedLessonId); 
                  if(!lesson) return false; 
                  return (t.branchShorts || [t.branchShort]).some(b => standardizeBranchCode(b) === standardizeBranchCode(lesson.branch)); 
                }).map(t => { 
                  const isSelected = selectedTeacherId === t.id; 
                  const isShiftMismatch = t.preferredShift && t.preferredShift !== selectedClass.shift;
                  const currentLoad = classes.reduce((sum, c) => sum + (c.assignments || []).filter(a => a.teacherId === t.id).reduce((s, a) => s + a.hours, 0), 0);
                  const loadPerc = t.lessonCount > 0 ? (currentLoad / t.lessonCount) * 100 : 0;
                  const isTargetReached = currentLoad === t.lessonCount && currentLoad > 0;
                  const isApproachingLimit = loadPerc >= 85 && currentLoad < t.lessonCount;
                  const statusColor = isTargetReached ? 'text-green-500' : isApproachingLimit || currentLoad > t.lessonCount ? 'text-red-500' : 'text-[#fbbf24]';
                  const barColor = isTargetReached ? 'bg-green-500' : isApproachingLimit || currentLoad > t.lessonCount ? 'bg-red-500' : 'bg-[#3b82f6]';
                  return (<button key={t.id} disabled={isShiftMismatch} onClick={() => {
                        setSelectedTeacherId(t.id);
                        setTimeout(() => {
                            assignSaveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 200);
                    }} className={`flex items-center px-3 h-14 border transition-all relative w-full ${isSelected ? 'border-[#fcd34d] bg-[#fcd34d]/10' : 'border-white/5 bg-black/40'} ${isShiftMismatch ? 'opacity-20 grayscale cursor-not-allowed' : 'active:scale-[0.98]'}`}><div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center mr-3 ${isSelected ? 'border-[#fcd34d]' : 'border-slate-700'}`}>{isSelected && <div className="w-1.5 h-1.5 bg-[#fcd34d] rounded-full"></div>}</div><div className="flex-1 text-left flex flex-col min-w-0"><div className="flex items-center gap-2"><span className={`text-[12px] font-black uppercase tracking-tight truncate ${isSelected ? 'text-[#fcd34d]' : 'text-white'}`}>{t.name}</span>{isTargetReached && <span className="text-[5px] font-black bg-green-600 text-white px-1 py-0.5 rounded-sm animate-pulse">HEDEF_OK</span>}</div><div className="flex items-center gap-2">{isShiftMismatch ? <span className="text-[6px] font-black text-red-500 uppercase tracking-tighter">! VARDİYA_UYUMSUZ ({t.preferredShift})</span> : <span className="text-[9px] font-bold text-[#3b82f6] uppercase opacity-70 tracking-widest">{standardizeBranchCode(t.branchShort)}</span>}</div><div className="w-full h-[2px] bg-white/5 mt-1.5 relative overflow-hidden rounded-full"><div className={`h-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, loadPerc)}%` }}></div></div></div><div className="flex flex-col items-end shrink-0 ml-4"><div className="flex items-baseline gap-1"><span className={`text-[13px] font-black leading-none ${statusColor}`}>{currentLoad}</span><span className="text-[7px] font-bold text-slate-700">/</span><span className="text-[10px] font-black text-slate-500">{t.lessonCount}</span></div><span className={`text-[6px] font-bold uppercase tracking-widest mt-0.5 ${statusColor} opacity-70`}>{Math.round(loadPerc)}% YÜK</span></div></button>);})}</div></div><div ref={assignSaveRef} className={`space-y-4 transition-all duration-500 ${!selectedTeacherId ? 'opacity-10 pointer-events-none' : 'opacity-100'}`}><label className="text-[8px] font-black text-[#94a3b8] uppercase tracking-[0.4em]">3. HAFTALIK_SAAT_YÜKÜ</label><div className="flex items-center gap-3 bg-black border border-white/5 p-4 relative overflow-hidden group"><div className="flex items-center gap-4 flex-1"><button onClick={() => setAssignHours(prev => Math.max(1, prev - 1))} className="w-12 h-12 bg-red-600/10 border border-red-600/40 text-red-500 hover:bg-red-600 hover:text-white transition-all active:scale-90 flex items-center justify-center text-xl shadow-lg"><i className="fa-solid fa-minus"></i></button><div className="flex-1 flex flex-col items-center justify-center"><span className="text-[32px] font-black text-[#fbbf24] leading-none drop-shadow-[0_0_15px_rgba(251,191,36,0.4)]">{assignHours}</span><span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">PERİYOT</span></div><button onClick={() => setAssignHours(prev => Math.min(40, prev + 1))} className="w-12 h-12 bg-green-600/10 border border-green-600/40 text-red-500 hover:bg-green-600 hover:text-white transition-all active:scale-90 flex items-center justify-center text-xl shadow-lg"><i className="fa-solid fa-plus"></i></button></div><button onClick={handleApplyAssignment} disabled={!selectedLessonId || !selectedTeacherId} className="ml-2 h-12 px-6 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:brightness-110 active:scale-[0.95] transition-all border border-white/10 disabled:opacity-20">KAYDET</button><div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#3b82f6] shadow-[0_0_15px_#3b82f6]"></div></div></div></div></div></div>
      )}
      {assignmentToDelete && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4"><div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95"><h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">GÖREV_SİLME_ONAYI</h3><p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">BU GÖREV ŞUBEDEN KALICI OLARAK SİLİNECEKTİR: <br/><span className="text-red-500 text-lg block mt-2 font-black">{assignmentToDelete.lessonName}</span></p><div className="flex gap-4"><button onClick={() => setAssignmentToDelete(null)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase">İPTAL</button><button onClick={executeDeleteAssignment} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl">EVET_SİL</button></div></div></div>)}
      {(isAddClassOpen || isEditClassOpen) && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
          <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-md w-full shadow-2xl animate-in zoom-in-95 rounded-sm bg-grid-hatched">
            <div className="flex justify-between items-center mb-8">
              <div className="flex flex-col">
                <h3 className="text-[14px] font-black text-white uppercase tracking-widest leading-none">{isEditClassOpen ? 'ŞUBE_DNA_GÜNCELLE' : 'YENİ_ŞUBE_KAYDI'}</h3>
                <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.4em] mt-2 block">SINIF_VE_VARDİYA_MÜHÜRLME</span>
              </div>
              <button onClick={() => { setIsAddClassOpen(false); setIsEditClassOpen(false); setNewClassData({ name: '', grade: 9, type: 'ANADOLU', shift: ShiftType.SABAH }); setEditingClassId(null); }} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <div className="space-y-6">
              <div className="flex gap-4 items-end">
                <div className="flex-[1] min-w-[110px] space-y-1.5">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">ŞUBE ADI</label>
                  <input name="className" autoFocus onFocus={handleInputFocus} placeholder="Örn: 9-B" className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6] shadow-inner" value={newClassData.name} onChange={e => setNewClassData({...newClassData, name: e.target.value.toUpperCase()})} />
                </div>
                <div className="flex-[2] space-y-1.5">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">TÜRÜ</label>
                  <input name="classType" onFocus={handleInputFocus} placeholder="Örn: ANADOLU" className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6] shadow-inner" value={newClassData.type} onChange={e => setNewClassData({...newClassData, type: e.target.value.toUpperCase()})} />
                </div>
              </div>
              <div className="space-y-2.5">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1 block">SINIF SEVİYESİ_DNA</label>
                <div className="grid grid-cols-6 gap-1 bg-black/40 p-1.5 border border-white/5">
                  {GRADE_LEVELS.map(g => (
                    <button key={g} onClick={() => setNewClassData({...newClassData, grade: g})} className={`h-9 text-[11px] font-black transition-all border ${newClassData.grade === g ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg z-10' : 'bg-black border-white/5 text-slate-600 hover:text-white hover:border-white/20'}`}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">VARDİYA_DNA</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewClassData({...newClassData, shift: ShiftType.SABAH})} className={`flex-1 h-12 border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${newClassData.shift === ShiftType.SABAH ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}><i className="fa-solid fa-sun text-[10px]"></i> SABAH</button>
                  <button onClick={() => setNewClassData({...newClassData, shift: ShiftType.OGLE})} className={`flex-1 h-12 border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${newClassData.shift === ShiftType.OGLE ? 'bg-amber-600 border-amber-600 text-white shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}><i className="fa-solid fa-moon text-[10px]"></i> ÖĞLE</button>
                </div>
              </div>
              <button onClick={handleSaveClass} disabled={!newClassData.name} className="w-full h-14 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.4em] mt-4 shadow-xl hover:brightness-110 active:scale-95 transition-all border border-white/10 disabled:opacity-20 disabled:grayscale">DNA KAYDINI MÜHÜRLLE</button>
            </div>
          </div>
        </div>
      )}
      {classToDelete && (<div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4"><div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95"><h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">ŞUBE_SİLME_ONAYI</h3><p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">BU ŞUBE VE TÜM ÖĞRENCİ KAYITLARI KALICI OLARAK SİLİNECEKTİR: <br/><span className="text-red-500 text-lg block mt-2 font-black">{classToDelete.name}</span></p><div className="flex gap-4"><button onClick={() => setClassToDelete(null)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase">İPTAL</button><button onClick={executeDeleteClass} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl">EVET_SİL</button></div></div></div>)}
    </div>
  );
};

export default ClassesModule;
