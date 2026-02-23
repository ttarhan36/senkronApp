
import React, { useState, useMemo, useRef } from 'react';
import { Lesson, Teacher, ClassSection, ModuleType, ShiftType, Student, Course, Gender } from '../types';
import { getBranchColor, getSectionColor, hexToRgba, getGradeFromLesson, standardizeForMatch, standardizeBranchCode, parseGradeFromName } from '../utils';
import * as XLSX from 'xlsx';

interface LessonsModuleProps {
  lessons: Lesson[];
  setLessons: (l: Lesson[]) => void;
  editMode: boolean;
  onWatchModeAttempt: () => void;
  onSuccess: (msg?: string) => void;
  allTeachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  allClasses: ClassSection[];
  setClasses: (c: ClassSection[] | ((prev: ClassSection[]) => ClassSection[])) => void;
  setActiveModule?: (m: ModuleType) => void;
  onNavigateToTeacher?: (teacherId: string, tab?: string) => void;
  schedule: any[];
  courses: Course[];
  setCourses: (c: Course[]) => void;
}

const LessonsModule: React.FC<LessonsModuleProps> = ({ 
  lessons = [], setLessons, editMode, onWatchModeAttempt, onSuccess, 
  allTeachers = [], setTeachers, allClasses = [], setClasses, setActiveModule,
  onNavigateToTeacher, schedule = [], courses = [], setCourses
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TÜMÜ');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'ŞUBE_MATRİSİ' | 'KADRO' | 'ANALİZ'>('ŞUBE_MATRİSİ');
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [staffPicker, setStaffPicker] = useState<{ lessonId: string, classId: string, currentId?: string } | null>(null);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffBranchFilterActive, setIsStaffBranchFilterActive] = useState(true);
  const [showQuickAddTeacherInPicker, setShowQuickAddTeacherInPicker] = useState(false);
  const [quickTeacherInput, setQuickTeacherInput] = useState('');

  const [activeListActionId, setActiveListActionId] = useState<string | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);

  const [newLessonData, setNewLessonData] = useState({ 
    name: '', 
    branch: '', 
    hours: 2, 
    selectedGrades: [] as number[],
    id: null as string | null
  });
  const [isBranchManual, setIsBranchManual] = useState(false);

  const availableGrades = useMemo(() => {
    const grades = Array.from(new Set(allClasses.map(c => parseGradeFromName(c.name))));
    return grades.sort((a, b) => a - b);
  }, [allClasses]);

  const currentLesson = useMemo(() => lessons.find(l => l.id === selectedLessonId), [lessons, selectedLessonId]);

  const lessonGradeAuthority = useMemo(() => {
    if (!currentLesson) return null;
    return getGradeFromLesson(currentLesson.name, currentLesson.branch);
  }, [currentLesson]);

  const matrixClasses = useMemo(() => {
    if (!currentLesson) return [];
    if (lessonGradeAuthority === null) return allClasses;
    return allClasses.filter(c => parseGradeFromName(c.name) === lessonGradeAuthority);
  }, [allClasses, currentLesson, lessonGradeAuthority]);

  const lessonAnalysis = useMemo(() => {
    if (!currentLesson || matrixClasses.length === 0) return null;
    let totalScoreSum = 0;
    let studentWithGradesCount = 0;
    let rangeBelow50 = 0;
    let range50to85 = 0;
    let rangeAbove85 = 0;
    const performanceByClass: { name: string, avg: number, successRate: number }[] = [];
    matrixClasses.forEach(cls => {
      let classTotal = 0;
      let classValidCount = 0;
      let classPassingCount = 0;
      (cls.students || []).forEach(st => {
        const gradeRecord = st.grades?.find(g => g.lessonId === currentLesson.id);
        if (gradeRecord && gradeRecord.average !== undefined) {
          const avg = gradeRecord.average;
          totalScoreSum += avg;
          classTotal += avg;
          studentWithGradesCount++;
          classValidCount++;
          if (avg < 50) rangeBelow50++;
          else if (avg < 85) { range50to85++; classPassingCount++; }
          else { rangeAbove85++; classPassingCount++; }
        }
      });
      performanceByClass.push({
        name: cls.name,
        avg: classValidCount > 0 ? Math.round(classTotal / classValidCount) : 0,
        successRate: classValidCount > 0 ? Math.round((classPassingCount / classValidCount) * 100) : 0
      });
    });
    return {
      overallAvg: studentWithGradesCount > 0 ? (totalScoreSum / studentWithGradesCount).toFixed(1) : '0.0',
      totalGraded: studentWithGradesCount,
      distribution: { rangeBelow50, range50to85, rangeAbove85 },
      rankings: performanceByClass.sort((a, b) => b.avg - a.avg)
    };
  }, [currentLesson, matrixClasses]);

  const updateMatrixTeacher = (lessonId: string, classId: string, teacherId: string) => {
    if (!editMode) return onWatchModeAttempt();
    setClasses(prev => (prev as ClassSection[]).map(c => {
      if (c.id === classId) {
        const assignments = (c.assignments || []).map(a => a.lessonId === lessonId ? { ...a, teacherId: teacherId || undefined } : a);
        return { ...c, assignments };
      }
      return c;
    }));
    setStaffPicker(null);
    onSuccess("PERSONEL_BAĞLANDI");
  };

  const updateMatrixHour = (lessonId: string, classId: string, h: number) => {
    if (!editMode) return onWatchModeAttempt();
    setClasses(prev => (prev as ClassSection[]).map(c => {
      if (c.id === classId) {
        const assignments = (c.assignments || []).map(a => a.lessonId === lessonId ? { ...a, hours: Math.max(1, h) } : a);
        return { ...c, assignments };
      }
      return c;
    }));
  };

  const toggleSectionAssignment = (lessonId: string, classSection: ClassSection) => {
    if (!editMode) return onWatchModeAttempt();
    const isAssigned = (classSection.assignments || []).some(a => a.lessonId === lessonId);
    setClasses(prev => (prev as ClassSection[]).map(c => {
      if (c.id === classSection.id) {
        let newAssignments = [...(c.assignments || [])];
        if (isAssigned) newAssignments = newAssignments.filter(a => a.lessonId !== lessonId);
        else newAssignments.push({ lessonId: lessonId, hours: currentLesson?.hours || 2 });
        return { ...c, assignments: newAssignments };
      }
      return c;
    }));
  };

  const handleQuickAddTeacherInPicker = () => {
    if (!quickTeacherInput.trim() || !staffPicker || !currentLesson) return;
    const branchCode = standardizeBranchCode(currentLesson.branch);
    const newId = `QT-Picker-${Date.now()}`;
    const newTeacher: Teacher = {
      id: newId,
      name: quickTeacherInput.toUpperCase(),
      branch: branchCode,
      branchShort: branchCode,
      branchShorts: [branchCode],
      lessonCount: 22,
      availableDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
      guardDutyDays: []
    };
    setTeachers([...allTeachers, newTeacher]);
    updateMatrixTeacher(staffPicker.lessonId, staffPicker.classId, newId);
    setShowQuickAddTeacherInPicker(false);
    setQuickTeacherInput('');
    onSuccess("YENİ PERSONEL EKLENDİ VE ATANDI");
  };

  const filteredLessons = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return lessons.filter(l => {
      const matchSearch = (l.name || '').toLowerCase().includes(term) || (l.branch || '').toLowerCase().includes(term);
      const nameGrade = getGradeFromLesson(l.name, l.branch);
      const matchGrade = categoryFilter === 'TÜMÜ' || nameGrade === parseInt(categoryFilter);
      return matchSearch && matchGrade;
    }).sort((a, b) => {
       const aGrade = getGradeFromLesson(a.name, a.branch) || 0;
       const bGrade = getGradeFromLesson(b.name, b.branch) || 0;
       if (aGrade !== bGrade) return aGrade - bGrade;
       return a.name.localeCompare(b.name);
    });
  }, [lessons, searchTerm, categoryFilter]);

  const filteredPickerStaff = useMemo(() => {
    if (!staffPicker || !currentLesson) return [];
    const term = staffSearchTerm.toLowerCase();
    return allTeachers.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(term);
      const matchesBranch = !isStaffBranchFilterActive || (t.branchShorts || [t.branchShort]).some(b => standardizeBranchCode(b) === standardizeBranchCode(currentLesson.branch));
      return matchesSearch && matchesBranch;
    });
  }, [staffPicker, allTeachers, currentLesson, staffSearchTerm, isStaffBranchFilterActive]);

  const handleEditLesson = (l: Lesson) => {
    setNewLessonData({
      name: l.name,
      branch: l.branch,
      hours: l.hours,
      selectedGrades: [getGradeFromLesson(l.name, l.branch) || 9],
      id: l.id
    });
    setIsDrawerOpen(true);
    setActiveListActionId(null);
  };

  const executeDeleteLesson = () => {
    if (!lessonToDelete) return;
    setLessons(lessons.filter(l => l.id !== lessonToDelete.id));
    setLessonToDelete(null);
    onSuccess("ENVANTER_KAYDI_SİLİNDİ");
  };

  if (selectedLessonId && currentLesson) {
    return (
      <div className="bg-[#0f172a] flex flex-col h-full animate-in fade-in duration-200 overflow-hidden relative">
        <div className="bg-[#0f172a] border-b border-[#64748b]/40 shrink-0">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <button onClick={() => setSelectedLessonId(null)} className="w-10 h-10 flex items-center justify-center border border-[#64748b] text-white hover:bg-white/10 active:scale-95 transition-all"><i className="fa-solid fa-arrow-left text-sm"></i></button>
               <div>
                  <h2 className="text-[18px] font-black text-white uppercase tracking-tight text-high-contrast">{currentLesson.name}</h2>
                  <span className="text-[10px] font-black text-[#3b82f6] uppercase tracking-widest mt-1 block">ORTAK_DERS_MATRİSİ</span>
               </div>
            </div>
          </div>
          <div className="px-4 py-2 flex gap-1 bg-black/40 border-t border-[#64748b]/20">
            {['ŞUBE_MATRİSİ', 'KADRO', 'ANALİZ'].map(tab => (
              <button key={tab} onClick={() => setActiveDetailTab(tab as any)} className={`flex-1 h-11 text-[9px] font-black tracking-[0.2em] transition-all flex items-center justify-center relative overflow-hidden ${activeDetailTab === tab ? 'bg-[#334155] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {activeDetailTab === tab && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3b82f6]"></div>}
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 bg-grid-hatched">
           {activeDetailTab === 'ŞUBE_MATRİSİ' && (
             <div className="space-y-1.5 pb-24">
                {matrixClasses.length > 0 ? matrixClasses.map(cls => {
                   const assignment = (cls.assignments || []).find(a => a.lessonId === currentLesson.id);
                   const isAssigned = !!assignment;
                   const teacherObj = isAssigned ? allTeachers.find(t => t.id === assignment.teacherId) : null;
                   return (
                     <div key={cls.id} className={`flex items-center bg-[#1e293b]/60 border p-2 transition-all relative overflow-hidden h-16 shadow-lg ${isAssigned ? 'border-[#3b82f6]/40' : 'border-white/5 opacity-50 grayscale'}`}>
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: getSectionColor(cls.name) }}></div>
                        <div className="flex flex-col min-w-[60px] mr-3 justify-center items-center">
                           <span className="text-[16px] font-black text-white uppercase tracking-tighter leading-none">{cls.name}</span>
                           <span className="text-[6px] font-bold text-slate-500 uppercase mt-1 tracking-widest">{cls.shift}</span>
                        </div>
                        <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">
                           {isAssigned ? (
                             <button onClick={() => { setStaffSearchTerm(''); setStaffPicker({ lessonId: currentLesson.id, classId: cls.id, currentId: assignment.teacherId }); }} className="flex-1 h-10 bg-black/40 border border-white/5 px-3 flex items-center justify-between hover:border-[#3b82f6] transition-all group overflow-hidden">
                                <span className="text-[10px] font-black text-white uppercase truncate pr-2 group-hover:text-[#3b82f6]">{teacherObj?.name || 'PERSONEL_ATA'}</span>
                                <i className="fa-solid fa-user-plus text-[10px] text-slate-700"></i>
                             </button>
                           ) : (
                             <div className="flex-1 h-10 border border-dashed border-white/5 flex items-center justify-center"><span className="text-[8px] font-black text-slate-700 uppercase">ATAMA_YOK</span></div>
                           )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           {isAssigned && (
                             <div className="flex items-center gap-1 bg-black/60 p-0.5 border border-white/5">
                                <button onClick={() => updateMatrixHour(currentLesson.id, cls.id, (assignment.hours || 0) - 1)} className="w-6 h-6 flex items-center justify-center text-red-500 hover:bg-red-600 hover:text-white"><i className="fa-solid fa-minus text-[8px]"></i></button>
                                <span className="w-6 text-center text-[14px] font-black text-[#fbbf24]">{assignment.hours}</span>
                                <button onClick={() => updateMatrixHour(currentLesson.id, cls.id, (assignment.hours || 0) + 1)} className="w-6 h-6 flex items-center justify-center text-green-500 hover:bg-green-600 hover:text-white"><i className="fa-solid fa-plus text-[8px]"></i></button>
                             </div>
                           )}
                           <button onClick={() => toggleSectionAssignment(currentLesson.id, cls)} className={`w-8 h-8 flex items-center justify-center transition-all ${isAssigned ? 'bg-[#3b82f6] text-white shadow-lg' : 'bg-black/40 border border-white/10 text-slate-700'}`}><i className={`fa-solid ${isAssigned ? 'fa-check' : 'fa-plus'} text-xs`}></i></button>
                        </div>
                     </div>
                   );
                }) : (<div className="py-24 text-center opacity-20"><p className="text-[12px] font-black uppercase tracking-[0.4em]">BU SEVİYEDE ŞUBE TANIMLI DEĞİL</p></div>)}
             </div>
           )}
           {activeDetailTab === 'KADRO' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pb-24">
                 {allTeachers.filter(t => (t.branchShorts || [t.branchShort]).some(b => standardizeBranchCode(b) === standardizeBranchCode(currentLesson.branch))).map(t => {
                    const assignedClasses = allClasses.filter(c => (c.assignments || []).some(a => a.lessonId === currentLesson.id && a.teacherId === t.id));
                    return (
                       <div key={t.id} onClick={() => onNavigateToTeacher?.(t.id, 'ŞUBE')} className="bg-[#1e293b]/80 border border-white/10 p-3 hover:border-[#3b82f6] transition-all cursor-pointer relative shadow-lg group">
                          <h4 className="text-[13px] font-black text-white uppercase truncate pr-4">{t.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest">{t.preferredShift || 'SABAH'}</span>
                             <span className="text-[6px] font-black text-[#fbbf24] uppercase">{t.lessonCount}s KOTA</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                             {assignedClasses.map(c => (<span key={c.id} className="text-[7px] font-black px-1.5 py-0.5 bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[#3b82f6] uppercase">{c.name}</span>))}
                          </div>
                       </div>
                    );
                 })}
              </div>
           )}
           {activeDetailTab === 'ANALİZ' && (
             <div className="space-y-2 animate-in slide-in-from-bottom-2 pb-24">
                {lessonAnalysis ? (
                   <>
                    <div className="grid grid-cols-3 gap-2">
                       <div className="bg-[#1e293b] border border-white/10 p-3 flex flex-col items-center justify-center shadow-lg rounded-sm h-24">
                          <span className="text-[28px] font-black text-[#fbbf24] leading-none">{lessonAnalysis.overallAvg}</span>
                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest mt-2">GENEL_ORTALAMA</span>
                       </div>
                       <div className="bg-[#1e293b] border border-white/10 p-3 flex flex-col items-center justify-center shadow-lg rounded-sm h-24">
                          <span className="text-[28px] font-black text-[#3b82f6] leading-none">{lessonAnalysis.totalGraded}</span>
                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest mt-2">NOTLU_ÖĞRENCİ</span>
                       </div>
                       <div className="bg-[#1e293b] border border-white/10 p-3 flex flex-col items-center justify-center shadow-lg rounded-sm h-24">
                          <span className="text-[28px] font-black text-green-500 leading-none">%{Math.round(((lessonAnalysis.distribution.range50to85 + lessonAnalysis.distribution.rangeAbove85) / Math.max(1, lessonAnalysis.totalGraded)) * 100)}</span>
                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest mt-2">BAŞARI_ORANI</span>
                       </div>
                    </div>
                    <div className="bg-[#1e293b]/60 border border-white/10 p-4 shadow-xl">
                       <span className="text-[8px] font-black text-white uppercase tracking-[0.4em] block mb-4">NOT_DAĞILIM_DNA_MATRİSİ</span>
                       <div className="grid grid-cols-3 gap-2">
                          <div className="bg-black/40 border border-white/5 p-2 flex flex-col items-center gap-1.5">
                             <span className="text-[14px] font-black text-red-500">{lessonAnalysis.distribution.rangeBelow50}</span>
                             <div className="h-1 bg-white/5 w-full rounded-full overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${(lessonAnalysis.distribution.rangeBelow50 / Math.max(1, lessonAnalysis.totalGraded)) * 100}%` }}></div></div>
                             <span className="text-[5px] font-bold text-slate-600 uppercase tracking-widest text-center">KRİTİK (0-50)</span>
                          </div>
                          <div className="bg-black/40 border border-white/5 p-2 flex flex-col items-center gap-1.5">
                             <span className="text-[14px] font-black text-[#3b82f6]">{lessonAnalysis.distribution.range50to85}</span>
                             <div className="h-1 bg-white/5 w-full rounded-full overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{ width: `${(lessonAnalysis.distribution.range50to85 / Math.max(1, lessonAnalysis.totalGraded)) * 100}%` }}></div></div>
                             <span className="text-[5px] font-bold text-slate-600 uppercase tracking-widest text-center">STANDART (50-85)</span>
                          </div>
                          <div className="bg-black/40 border border-white/5 p-2 flex flex-col items-center gap-1.5">
                             <span className="text-[14px] font-black text-green-500">{lessonAnalysis.distribution.rangeAbove85}</span>
                             <div className="h-1 bg-white/5 w-full rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${(lessonAnalysis.distribution.rangeAbove85 / Math.max(1, lessonAnalysis.totalGraded)) * 100}%` }}></div></div>
                             <span className="text-[5px] font-bold text-slate-600 uppercase tracking-widest text-center">İLERİ (85-100)</span>
                          </div>
                       </div>
                    </div>
                   </>
                ) : (<div className="py-24 text-center border-2 border-dashed border-white/5 opacity-20"><p className="text-[10px] font-black uppercase tracking-[0.4em]">ANALİZ İÇİN NOT VERİSİ GEREKLİ</p></div>)}
             </div>
           )}
        </div>

        {staffPicker && (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
             <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-md shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col animate-in zoom-in-95 duration-200 max-h-[85vh] rounded-sm overflow-hidden bg-grid-hatched">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                   <div className="flex-1 pr-4">
                      <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">PERSONEL_BAĞLANTISI</h3>
                      <span className="text-[8px] font-black text-[#3b82f6] uppercase mt-2 block tracking-[0.2em]">HEDEF: {allClasses.find(c => c.id === staffPicker.classId)?.name} ŞUBESİ</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <button 
                        onClick={() => { setShowQuickAddTeacherInPicker(!showQuickAddTeacherInPicker); setQuickTeacherInput(''); }} 
                        className={`w-10 h-10 border flex items-center justify-center transition-all rounded-full ${showQuickAddTeacherInPicker ? 'bg-[#fbbf24] text-black border-[#fbbf24] rotate-45' : 'bg-[#3b82f6]/20 border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white'}`}
                      >
                         <i className="fa-solid fa-plus text-lg"></i>
                      </button>
                      <button onClick={() => setStaffPicker(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90 shrink-0"><i className="fa-solid fa-xmark text-xl"></i></button>
                   </div>
                </div>

                <div className="p-4 bg-black/40 border-b border-white/5 space-y-3 shrink-0">
                   <div className="flex gap-2">
                      <div className="flex-1 relative">
                         <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-[10px]"></i>
                         <input 
                           placeholder="HOCA ARA..." 
                           className="w-full bg-black border border-white/10 pl-9 pr-4 py-2.5 text-[11px] font-black text-white uppercase outline-none focus:border-[#3b82f6]"
                           value={staffSearchTerm}
                           onChange={e => setStaffSearchTerm(e.target.value)}
                         />
                      </div>
                      <button 
                        onClick={() => setIsStaffBranchFilterActive(!isStaffBranchFilterActive)} 
                        className={`w-12 h-11 border flex items-center justify-center transition-all ${isStaffBranchFilterActive ? 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/40' : 'bg-red-600/20 text-red-500 border-red-600/40 animate-pulse'}`}
                        title={isStaffBranchFilterActive ? "Sadece Branş Hocaları" : "Tüm Kadro"}
                      >
                         <i className={`fa-solid ${isStaffBranchFilterActive ? 'fa-filter' : 'fa-filter-circle-xmark'} text-xs`}></i>
                      </button>
                   </div>

                   {showQuickAddTeacherInPicker && (
                      <div className="flex gap-2 animate-in slide-in-from-top-2">
                         <input 
                           autoFocus 
                           placeholder="YENİ HOCA ADI..." 
                           className="flex-1 bg-[#1e2e3d] border border-[#3b82f6]/40 px-3 py-2 text-[11px] font-black text-white uppercase outline-none focus:border-[#fbbf24]"
                           value={quickTeacherInput}
                           onChange={e => setQuickTeacherInput(e.target.value)}
                           onKeyDown={e => e.key === 'Enter' && handleQuickAddTeacherInPicker()}
                         />
                         <button onClick={handleQuickAddTeacherInPicker} className="bg-[#fbbf24] text-black px-4 font-black text-[10px] uppercase shadow-lg">EKLE</button>
                      </div>
                   )}
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 p-3">
                   {filteredPickerStaff.length > 0 ? filteredPickerStaff.map(t => {
                      const isSelected = staffPicker.currentId === t.id;
                      return (
                        <button key={t.id} onClick={() => updateMatrixTeacher(staffPicker.lessonId, staffPicker.classId, t.id)} className={`w-full p-4 border transition-all h-20 relative flex items-center justify-between shadow-lg group ${isSelected ? 'bg-[#3b82f6]/10 border-[#3b82f6]' : 'bg-[#162431] border-white/5 hover:border-white/20'}`}>
                           {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3b82f6] shadow-[0_0_10px_#3b82f6]"></div>}
                           <div className="text-left flex flex-col justify-center min-w-0 mr-4">
                              <span className={`text-[14px] font-black uppercase truncate whitespace-nowrap ${isSelected ? 'text-[#3b82f6]' : 'text-slate-300 group-hover:text-white'}`}>{t.name}</span>
                              <div className="flex items-center gap-2 mt-1.5">
                                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{t.branchShort}</span>
                                 <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                                 <span className="text-[7px] font-black text-[#fbbf24] uppercase">{t.preferredShift || 'SABAH'}</span>
                              </div>
                           </div>
                           <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-slate-800 text-slate-800 group-hover:border-slate-600'}`}>
                              <i className={`fa-solid ${isSelected ? 'fa-check' : 'fa-plus'} text-xs`}></i>
                           </div>
                        </button>
                      );
                   }) : (
                      <div className="py-12 text-center opacity-30 border border-dashed border-white/10 flex flex-col items-center">
                         <i className="fa-solid fa-user-slash text-3xl mb-4"></i>
                         <p className="text-[10px] font-black uppercase tracking-[0.3em]">HOCA BULUNAMADI</p>
                      </div>
                   )}
                </div>
                
                <div className="p-4 bg-black/60 border-t border-white/5 shrink-0">
                   <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed italic text-center">
                      * Branş filtresini kapatarak tüm öğretmen kadrosundan atama yapabilirsiniz.
                   </p>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col overflow-hidden animate-slide-up relative px-1">
      <div className="flex flex-col gap-3 shrink-0 px-1">
         <div className="flex gap-2">
            <div className="flex-1 relative h-11"><i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-[#3b82f6] text-[10px]"></i><input type="text" placeholder="ENVANTER ARA..." className="w-full h-full bg-black border border-[#64748b]/40 pl-11 pr-4 text-[11px] font-black uppercase text-white outline-none focus:border-[#3b82f6]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <button onClick={() => { if(!editMode) onWatchModeAttempt(); else { setNewLessonData({ name: '', branch: '', hours: 2, selectedGrades: [], id: null }); setIsDrawerOpen(true); } }} className="px-6 h-11 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 flex items-center gap-2 border border-white/10"><i className="fa-solid fa-plus text-[12px]"></i> EKLE</button>
         </div>
         <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {['TÜMÜ', ...availableGrades.map(String)].map(f => (
               <button key={f} onClick={() => setCategoryFilter(f)} className={`flex-1 min-w-[44px] h-9 text-[9px] font-black uppercase tracking-widest border transition-all ${categoryFilter === f ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg' : 'bg-black/40 border-[#354a5f] text-slate-500 hover:bg-[#1e2e3d]'}`}>{f === 'TÜMÜ' ? 'TÜMÜ' : `${f}.S`}</button>
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pb-24 px-1">
         {filteredLessons.length > 0 ? filteredLessons.map(l => {
            const isMenuOpen = activeListActionId === l.id;
            const branchColor = getBranchColor(l.branch);
            return (
              <div key={l.id} className="relative overflow-hidden group h-14 shrink-0">
                 <div onClick={() => setSelectedLessonId(l.id)} className={`bg-[#1e293b]/60 border border-white/5 h-full flex items-center justify-between px-4 transition-all cursor-pointer shadow-md active:scale-[0.98] relative overflow-hidden ${isMenuOpen ? '-translate-x-32' : 'hover:bg-slate-800'}`}>
                    <div className="absolute left-0 top-1 bottom-1 w-1 shadow-[0_0_10px_currentColor]" style={{ backgroundColor: branchColor, color: branchColor }}></div>
                    <div className="flex-1 flex items-center gap-4 min-w-0">
                       <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-medium text-slate-400 uppercase truncate transition-colors">{l.name}</span>
                          <div className="flex items-center gap-3 mt-0.5">
                             <span className="text-[5px] font-medium text-[#fbbf24] uppercase tracking-widest">{standardizeBranchCode(l.branch)}</span>
                             <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                             <span className="text-[5px] font-medium text-slate-500 uppercase tracking-widest">{allClasses.filter(c => (c.assignments || []).some(a => a.lessonId === l.id)).length} ŞUBEDE</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                       <div className="flex flex-col items-end mr-2">
                          <span className="text-[12px] font-medium text-slate-400 leading-none">{l.hours} s</span>
                          <span className="text-[5px] font-medium text-slate-500 uppercase mt-0.5 opacity-60">PLAN_SAATİ</span>
                       </div>
                       {editMode && (
                         <button onClick={(e) => { e.stopPropagation(); setActiveListActionId(isMenuOpen ? null : l.id); }} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-[#3b82f6] transition-all">
                            <i className="fa-solid fa-ellipsis-vertical text-lg"></i>
                         </button>
                       )}
                    </div>
                 </div>
                 <div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <button onClick={(e) => { e.stopPropagation(); handleEditLesson(l); }} className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all">
                       <i className="fa-solid fa-pen text-xs mb-1"></i>
                       <span className="text-[6px] font-black uppercase">DÜZENLE</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setLessonToDelete(l); setActiveListActionId(null); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all">
                       <i className="fa-solid fa-trash-can text-xs mb-1"></i>
                       <span className="text-[6px] font-black uppercase">SİL</span>
                    </button>
                 </div>
              </div>
            );
         }) : (<div className="py-32 flex flex-col items-center justify-center opacity-20"><p className="text-[12px] font-black uppercase tracking-[0.4em]">ENVANTER_BOŞ</p></div>)}
      </div>

      {lessonToDelete && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">ENVANTER_SİLME_ONAYI</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-8">
                 BU DERS TÜM ŞUBELERDEN VE PLANDAN KALICI OLARAK SİLİNECEKTİR: <br/>
                 <span className="text-red-500 text-lg block mt-2 font-black">{lessonToDelete.name}</span>
              </p>
              <div className="flex gap-4">
                 <button onClick={() => setLessonToDelete(null)} className="flex-1 h-12 border border-[#64748b] text-[#f1f5f9] font-black text-[10px] uppercase hover:bg-white/5 transition-all">İPTAL</button>
                 <button onClick={executeDeleteLesson} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl">EVET_SİL</button>
              </div>
           </div>
        </div>
      )}

      {isDrawerOpen && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col bg-grid-hatched">
              <div className="flex justify-between items-center mb-8 shrink-0">
                 <div>
                    <h3 className="text-[14px] font-black text-white uppercase tracking-widest leading-none">{newLessonData.id ? 'ENVANTER_GÜNCELLE' : 'YENİ_ENVANTER_KAYDI'}</h3>
                    <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.4em] mt-2 block">MÜFREDAT_DNA_GİRİŞİ</span>
                 </div>
                 <button onClick={() => setIsDrawerOpen(false)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
              <div className="space-y-6">
                 <div className="flex gap-4">
                    <div className="flex-[3] space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">DERS ADI</label>
                       <input autoFocus className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6]" value={newLessonData.name} onChange={e => { const upper = e.target.value.toUpperCase(); setNewLessonData({ ...newLessonData, name: upper, branch: isBranchManual ? newLessonData.branch : standardizeBranchCode(upper.split(/\s+/)[0].substring(0,4)) }); }} />
                    </div>
                    <div className="flex-[1] space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">BRANŞ KODU</label>
                       <input className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-[#fbbf24] text-center uppercase outline-none focus:border-[#fbbf24]" value={newLessonData.branch} onChange={e => { setNewLessonData({...newLessonData, branch: e.target.value.toUpperCase()}); setIsBranchManual(true); }} />
                    </div>
                 </div>
                 {!newLessonData.id && (
                   <div className="space-y-2.5">
                      <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1 block">SINIF_SEVİYESİ_DNA (ÇOKLU SEÇİM)</label>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                         {[5, 6, 7, 8, 9, 10, 11, 12].map(g => (<button key={g} onClick={() => setNewLessonData(p => ({...p, selectedGrades: p.selectedGrades.includes(g) ? p.selectedGrades.filter(x => x !== g) : [...p.selectedGrades, g]}))} className={`h-11 border transition-all text-[11px] font-black ${newLessonData.selectedGrades.includes(g) ? 'bg-[#3b82f6] border-[#3b82f6] text-white' : 'bg-black border-white/5 text-slate-600'}`}>{g}</button>))}
                      </div>
                   </div>
                 )}
                 <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">PLAN_SAATİ</label>
                       <div className="flex items-center gap-3 bg-black border border-white/5 p-1">
                          <button onClick={() => setNewLessonData({...newLessonData, hours: Math.max(1, newLessonData.hours - 1)})} className="w-10 h-10 flex items-center justify-center text-red-500"><i className="fa-solid fa-minus"></i></button>
                          <span className="flex-1 text-center text-xl font-black text-white">{newLessonData.hours}</span>
                          <button onClick={() => setNewLessonData({...newLessonData, hours: Math.min(12, newLessonData.hours + 1)})} className="w-10 h-10 flex items-center justify-center text-green-500"><i className="fa-solid fa-plus"></i></button>
                       </div>
                    </div>
                    <button onClick={() => { 
                      if (!newLessonData.name) return; 
                      const branchCode = standardizeBranchCode(newLessonData.branch);
                      if (newLessonData.id) {
                        setLessons(lessons.map(l => l.id === newLessonData.id ? { ...l, name: newLessonData.name, branch: branchCode, hours: newLessonData.hours } : l));
                        onSuccess("ENVANTER_GÜNCELLENDİ");
                      } else {
                        const timestamp = Date.now();
                        const newEntries = newLessonData.selectedGrades.length > 0 ? newLessonData.selectedGrades.map(g => ({ id: `L-${timestamp}-${g}`, name: `${newLessonData.name} ${g}`.toUpperCase(), branch: branchCode, hours: newLessonData.hours })) : [{ id: `L-${timestamp}`, name: newLessonData.name.toUpperCase(), branch: branchCode, hours: newLessonData.hours }];
                        setLessons([...lessons, ...newEntries]); 
                        onSuccess("DERS_ENVANTERE_MÜHÜRLENDİ");
                      }
                      setIsDrawerOpen(false); 
                    }} className="flex-1 h-12 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.3em] shadow-xl border border-white/10">{newLessonData.id ? 'GÜNCELLE' : 'MÜHÜRLLE_DNA'}</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default LessonsModule;
