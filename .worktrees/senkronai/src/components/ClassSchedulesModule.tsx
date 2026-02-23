
import React, { useState, useMemo, useEffect } from 'react';
import { ScheduleEntry, ClassSection, SchoolConfig, ShiftType, Lesson, Teacher, UserRole } from '../types';
import { getSectionColor, getBranchColor, standardizeForMatch, standardizeDayCode } from '../utils';

interface ClassSchedulesModuleProps {
  schedule: ScheduleEntry[];
  setSchedule?: (s: ScheduleEntry[]) => void;
  onDeleteScheduleEntry?: (sinif: string, gun: string, ders_saati: number) => void;
  classes: ClassSection[];
  lessons: Lesson[];
  teachers: Teacher[];
  initialClass?: string | null;
  onClearInitial?: () => void;
  schoolConfig: SchoolConfig;
  editMode: boolean;
  onSuccess: (msg?: string) => void;
  userRole?: UserRole;
}

const DAYS_SHORT = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM'];

const ClassSchedulesModule: React.FC<ClassSchedulesModuleProps> = ({ 
  schedule, setSchedule, onDeleteScheduleEntry, classes, lessons, teachers, initialClass, onClearInitial, schoolConfig, editMode, onSuccess, userRole 
}) => {
  const [viewType, setViewType] = useState<'CLASS' | 'TEACHER'>('CLASS');
  
  // FILTER LOGIC: If Student, only show their own class. Otherwise show all.
  const systemClasses = useMemo(() => {
    if (userRole === UserRole.STUDENT) {
        if (initialClass) {
            return classes.filter(c => c.name === initialClass);
        }
        return []; // Student has no class assigned
    }
    return classes || [];
  }, [classes, userRole, initialClass]);

  const validClassNames = useMemo(() => systemClasses.map(c => c.name), [systemClasses]);
  
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [manualPanel, setManualPanel] = useState<{ day: string, hour: number } | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<{ day: string, hour: number, teacherName: string, classShift: ShiftType } | null>(null);

  useEffect(() => {
    if (viewType === 'CLASS') {
      if (initialClass && validClassNames.includes(initialClass)) {
        setViewingId(initialClass);
      } else if (validClassNames.length > 0 && !viewingId) {
        setViewingId(validClassNames[0]);
      }
    }
  }, [initialClass, validClassNames, viewType]);

  const extendedTeachers = useMemo(() => {
    const list = [...teachers];
    const scheduleNames = Array.from(new Set(schedule.map(s => s.ogretmen.trim().toUpperCase())));
    
    scheduleNames.forEach(name => {
      const exists = list.some(t => t.name.toUpperCase() === name);
      if (!exists && name !== 'BELİRSİZ' && name !== 'ATANMADI' && name !== '') {
        list.push({
          id: `EXT-${name}`,
          name: name,
          branch: 'BİLİNMİYOR',
          branchShort: '???',
          lessonCount: 0,
          availableDays: DAYS_SHORT,
          guardDutyDays: []
        });
      }
    });
    return list;
  }, [teachers, schedule]);

  const handleToggleView = (type: 'CLASS' | 'TEACHER') => {
    setViewType(type);
    if (type === 'CLASS') {
      setViewingId(validClassNames.length > 0 ? validClassNames[0] : null);
    } else {
      setViewingId(extendedTeachers.length > 0 ? extendedTeachers[0].id : null);
    }
  };

  const currentSelectionObj = useMemo(() => {
    if (viewType === 'CLASS') return systemClasses.find(c => c.name === viewingId);
    return extendedTeachers.find(t => t.id === viewingId || t.name === viewingId);
  }, [systemClasses, extendedTeachers, viewingId, viewType]);

  const HOURS = useMemo(() => {
    const shift = (currentSelectionObj as any)?.shift || (currentSelectionObj as any)?.preferredShift || ShiftType.SABAH;
    const count = shift === ShiftType.SABAH ? schoolConfig.morningPeriodCount : schoolConfig.afternoonPeriodCount;
    const arr = [];
    for(let i = 1; i <= count; i++) arr.push(i);
    return arr;
  }, [currentSelectionObj, schoolConfig]);

  const getEntry = (day: string, hour: number) => {
    const targetDay = standardizeDayCode(day);
    const targetHour = Number(hour);

    if (viewType === 'CLASS') {
      return schedule.find(s => 
        s.sinif === viewingId && 
        standardizeDayCode(s.gun) === targetDay && 
        Number(s.ders_saati) === targetHour
      );
    } else {
      const teacherObj = extendedTeachers.find(t => t.id === viewingId || t.name === viewingId);
      if (!teacherObj) return undefined;
      return schedule.find(s => 
        s.ogretmen.toUpperCase() === teacherObj.name.toUpperCase() && 
        standardizeDayCode(s.gun) === targetDay && 
        Number(s.ders_saati) === targetHour
      );
    }
  };

  const checkConflict = (teacherName: string, day: string, hour: number, currentClass?: string) => {
    if (!teacherName) return null;
    const targetDay = standardizeDayCode(day);
    const targetHour = Number(hour);
    return schedule.find(s => 
      s.ogretmen.toUpperCase() === teacherName.toUpperCase() && 
      standardizeDayCode(s.gun) === targetDay && 
      Number(s.ders_saati) === targetHour &&
      s.sinif !== currentClass
    );
  };

  const checkTeacherBlockage = (teacherName: string, day: string, hour: number) => {
    const teacher = extendedTeachers.find(t => t.name.toUpperCase() === teacherName.toUpperCase());
    if (!teacher || !teacher.blockedSlots) return false;
    const targetSlot = `${standardizeDayCode(day)}-${hour}`;
    return (teacher.blockedSlots || []).map(s => {
       const [d, h] = s.split("-");
       return `${standardizeDayCode(d)}-${h}`;
    }).includes(targetSlot);
  };

  const formatTeacherName = (name: string) => {
    if (!name || name === 'BELİRSİZ' || name.trim() === '') return 'ATANMADI';
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) {
      return `${parts[0][0]}. ${parts[parts.length - 1]}`.toUpperCase();
    }
    return parts[0].toUpperCase();
  };

  const handleManualAssign = (lessonId: string, teacherId: string) => {
    if (!manualPanel || !setSchedule || !viewingId || !currentSelectionObj) return;
    const lesson = lessons.find(l => l.id === lessonId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (!lesson || !teacher) return;

    const entryId = `S-MAN-${Date.now()}`;
    const stdDay = standardizeDayCode(manualPanel.day);
    const targetShift = (currentSelectionObj as any).shift || ShiftType.SABAH;

    const newEntry: ScheduleEntry = {
      id: entryId,
      sinif: viewingId,
      gun: stdDay,
      ders_saati: manualPanel.hour,
      ders: lesson.name,
      ogretmen: teacher.name,
      shift: targetShift,
      isManual: true
    };

    const updated = schedule.filter(s => 
      !(s.sinif === viewingId && standardizeDayCode(s.gun) === stdDay && Number(s.ders_saati) === Number(manualPanel.hour))
    );

    setSchedule([...updated, newEntry]);
    setManualPanel(null);
    onSuccess("MANUEL_YERLEŞTİRME_MÜHÜRLENDİ");
  };

  const removeEntry = (day: string, hour: number, specificClass?: string) => {
    if (!editMode || !setSchedule || !viewingId) return;
    
    // Eğer öğretmen görünümündeysek, silinecek dersin hangi sınıfta olduğunu bilmemiz gerekir.
    // 'specificClass' parametresi bu bilgiyi sağlar. Sınıf görünümündeysek 'viewingId' kullanılır.
    const targetClass = specificClass || viewingId;
    const stdDay = standardizeDayCode(day);

    // 1. Önce veritabanından silmeyi tetikle
    if (onDeleteScheduleEntry) {
      onDeleteScheduleEntry(targetClass, day, hour);
    }

    // 2. State'ten kaldır
    const updated = schedule.filter(s => 
      !(s.sinif === targetClass && standardizeDayCode(s.gun) === stdDay && Number(s.ders_saati) === Number(hour))
    );
    setSchedule(updated);
    onSuccess("DERS_PLANDAN_SİLİNDİ");
  };

  const onDragStart = (day: string, hour: number) => {
    if (!editMode) return;
    const entry = getEntry(day, hour);
    if (entry) {
      setDraggedEntry({ 
        day, 
        hour, 
        teacherName: entry.ogretmen,
        classShift: entry.shift || ShiftType.SABAH 
      });
    }
  };

  const onDrop = (targetDay: string, targetHour: number) => {
    if (!draggedEntry || !setSchedule || !viewingId) return;
    const source = getEntry(draggedEntry.day, draggedEntry.hour);
    if (!source) return;
    
    const entryId = `S-MOVE-${Date.now()}`;
    const stdSourceDay = standardizeDayCode(draggedEntry.day);
    const stdTargetDay = standardizeDayCode(targetDay);
    
    // Hareket ettirilen hücreyi eski yerinden DB'den siliyoruz
    if (onDeleteScheduleEntry) {
        onDeleteScheduleEntry(viewingId, draggedEntry.day, draggedEntry.hour);
    }

    const updated = schedule.filter(s => 
      !(s.sinif === viewingId && standardizeDayCode(s.gun) === stdSourceDay && Number(s.ders_saati) === Number(draggedEntry.hour)) &&
      !(s.sinif === viewingId && standardizeDayCode(s.gun) === stdTargetDay && Number(s.ders_saati) === Number(targetHour))
    );
    
    const movedEntry = { ...source, id: entryId, gun: stdTargetDay, ders_saati: Number(targetHour), isManual: true };
    setSchedule([...updated, movedEntry]);
    setDraggedEntry(null);
    onSuccess("AKILLI_RÖTUŞ_MÜHÜRLENDİ");
  };

  return (
    <div className="h-full flex flex-col space-y-3 animate-slide-up px-1 overflow-hidden">
      <div className="flex flex-col gap-2 shrink-0 bg-[#0d141b] border border-white/5 p-2 rounded-sm shadow-2xl">
         <div className="flex items-center justify-between">
            <div className="flex bg-black/40 p-1 gap-1">
               <button onClick={() => handleToggleView('CLASS')} className={`px-4 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${viewType === 'CLASS' ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                  {userRole === UserRole.STUDENT ? 'DERS PROGRAMI' : 'ŞUBE_ODAKLI'}
               </button>
               {userRole !== UserRole.STUDENT && (
                 <button onClick={() => handleToggleView('TEACHER')} className={`px-4 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${viewType === 'TEACHER' ? 'bg-[#a855f7] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>KADRO_ODAKLI</button>
               )}
            </div>
            {/* Show class name if single class mode (Student) */}
            {userRole === UserRole.STUDENT && viewingId && (
                <div className="px-3 py-1 bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-[#3b82f6] text-[10px] font-black uppercase tracking-widest">
                    {viewingId} ŞUBESİ
                </div>
            )}
         </div>
         
         {/* Only show selector list if there's more than 1 option (i.e. not Student mode) */}
         {systemClasses.length > 1 && (
             <div className="flex gap-1 overflow-x-auto no-scrollbar py-1">
                {(viewType === 'CLASS' ? systemClasses : extendedTeachers).map(item => {
                   const isSelected = viewingId === (viewType === 'CLASS' ? (item as any).name : (item as any).id);
                   const color = viewType === 'CLASS' ? getSectionColor((item as any).name) : '#a855f7';
                   const label = viewType === 'CLASS' ? (item as any).name : (item as any).name.split(' ').pop();
                   return (
                      <button 
                        key={item.id} 
                        onClick={() => setViewingId(viewType === 'CLASS' ? (item as any).name : (item as any).id)}
                        className={`px-4 py-2 text-[9px] font-black uppercase tracking-tighter border transition-all whitespace-nowrap active:scale-[0.95] ${isSelected ? 'text-white shadow-lg ring-1 ring-white/10' : 'bg-black/20 border-white/5 text-slate-500 hover:bg-white/5'}`}
                        style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
                      >
                        {label}
                      </button>
                   );
                })}
             </div>
         )}
      </div>

      <div className="flex-1 overflow-auto bg-[#080c10] border border-white/5 relative bg-grid-hatched rounded-sm shadow-inner">
         {!viewingId || !currentSelectionObj ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
               <i className="fa-solid fa-table-cells text-6xl mb-4 text-[#354a5f]"></i>
               <span className="text-[12px] font-black uppercase tracking-[0.5em]">GÖRÜNÜM_SEÇİNİZ</span>
            </div>
         ) : (
            <div className="min-w-max">
            <table className="w-full h-full border-collapse table-fixed min-w-[600px]">
               <thead>
                  <tr className="bg-[#1a242e]/98 sticky top-0 z-50 border-b border-[#354a5f]">
                     <th className="w-12 py-2 text-[8px] font-black text-slate-500 uppercase">H</th>
                     {DAYS_SHORT.map(d => <th key={d} className="text-[9px] font-black text-white tracking-[0.2em]">{d}</th>)}
                  </tr>
               </thead>
               <tbody>
                  {HOURS.map(h => (
                     <tr key={h} className="border-b border-white/[0.03]" style={{ height: `${100 / HOURS.length}%` }}>
                        <td className="bg-black/40 border-r border-white/5 text-center text-[11px] font-black text-slate-600 shadow-inner">{h}</td>
                        {DAYS_SHORT.map(day => {
                           const entry = getEntry(day, h);
                           const bColor = entry ? getBranchColor(entry.ders) : 'transparent';
                           const conflict = entry ? checkConflict(entry.ogretmen, day, h, viewType === 'CLASS' ? viewingId : entry.sinif) : null;
                           const isBlockageInSlot = entry ? checkTeacherBlockage(entry.ogretmen, day, h) : false;

                           return (
                              <td 
                                 key={`${day}-${h}`}
                                 className={`p-0.5 relative cursor-pointer group transition-all ${conflict || isBlockageInSlot ? 'bg-red-950/20' : ''}`}
                                 onClick={() => {
                                    if (editMode && viewType === 'CLASS' && !entry) {
                                       setManualPanel({ day, hour: h });
                                    }
                                 }}
                                 onDragOver={(e) => { if(editMode) e.preventDefault(); }}
                                 onDrop={() => { if(editMode) onDrop(day, h); }}
                              >
                                 {entry ? (
                                    <div 
                                       draggable={editMode && !entry.isLocked}
                                       onDragStart={() => onDragStart(day, h)}
                                       className={`h-full w-full flex flex-col items-center justify-center border-l-[3px] shadow-lg relative transition-transform active:scale-[0.95] ${entry.isLocked ? 'bg-slate-800' : 'bg-slate-900/60 hover:bg-slate-800'}`}
                                       style={{ borderLeftColor: (conflict || isBlockageInSlot) ? '#ef4444' : (viewType === 'TEACHER' ? getSectionColor(entry.sinif) : bColor) }}
                                    >
                                       <span className="text-[10px] font-black text-white leading-none uppercase truncate w-full text-center px-1">
                                          {viewType === 'CLASS' ? entry.ders.substring(0, 5) : entry.sinif}
                                       </span>
                                       <span className="text-[6px] font-black text-slate-500 uppercase mt-1 truncate w-full text-center px-1">
                                          {viewType === 'CLASS' ? formatTeacherName(entry.ogretmen) : entry.ders.substring(0, 6)}
                                       </span>

                                       {(conflict || isBlockageInSlot) && (
                                          <div className="absolute -bottom-1 -right-1 bg-red-600 w-3 h-3 rounded-full flex items-center justify-center shadow-lg animate-pulse z-30">
                                             <i className="fa-solid fa-bolt text-[6px] text-white"></i>
                                          </div>
                                       )}

                                       {editMode && (
                                          <button 
                                             onClick={(e) => { e.stopPropagation(); removeEntry(day, h, entry.sinif); }}
                                             className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-40"
                                          >
                                             <i className="fa-solid fa-xmark text-[8px]"></i>
                                          </button>
                                       )}
                                    </div>
                                 ) : (
                                    <div className="h-full w-full opacity-[0.02] border border-dashed border-white/20 group-hover:opacity-20 transition-opacity flex items-center justify-center">
                                       {editMode && viewType === 'CLASS' && <i className="fa-solid fa-plus text-[#3b82f6]"></i>}
                                    </div>
                                 )}
                              </td>
                           );
                        })}
                     </tr>
                  ))}
               </tbody>
            </table>
            </div>
         )}
      </div>

      <div className="h-10 bg-black/80 border-t border-white/5 flex items-center justify-between px-4 shrink-0 rounded-b-sm">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full shadow-[0_0_8px_#3b82f6]"></div>
               <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">DNA_MUHURLEME_AKTIF</span>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SYSTEM_STABILITY_v2.5</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_100px_rgba(34,197,94,0.1)]"></div>
         </div>
      </div>

      {manualPanel && currentSelectionObj && viewType === 'CLASS' && (
         <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/90 backdrop-blur-sm px-4">
            <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm overflow-hidden bg-grid-hatched">
               <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#162431]">
                  <div>
                     <h3 className="text-[13px] font-black text-white uppercase tracking-widest">MANUEL_DERS_YERLEŞTİRME</h3>
                     <span className="text-[8px] font-black text-[#3b82f6] uppercase mt-2 block tracking-widest">{standardizeDayCode(manualPanel.day)} - {manualPanel.hour}. DERS</span>
                  </div>
                  <button onClick={() => setManualPanel(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-xl"></i></button>
               </div>
               
               <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">ŞUBE_GÖREVLERİ</span>
                  {(currentSelectionObj as ClassSection).assignments && (currentSelectionObj as ClassSection).assignments!.length > 0 ? (
                     (currentSelectionObj as ClassSection).assignments!.map((assign) => {
                        const lesson = lessons.find(l => l.id === assign.lessonId);
                        const teacher = teachers.find(t => t.id === assign.teacherId);
                        const bColor = getBranchColor(lesson?.branch || '');
                        
                        const usedHours = schedule.filter(s => s.sinif === viewingId && s.ders === lesson?.name).length;
                        const plannedHours = assign.hours;
                        const isQuotaFull = usedHours >= plannedHours;

                        const conflict = checkConflict(teacher?.name || '', manualPanel.day, manualPanel.hour, viewingId!);
                        const blocked = checkTeacherBlockage(teacher?.name || '', manualPanel.day, manualPanel.hour);

                        const isActionDisabled = !!conflict || blocked || isQuotaFull;

                        return (
                           <button 
                              key={assign.lessonId}
                              disabled={isActionDisabled}
                              onClick={() => handleManualAssign(assign.lessonId, assign.teacherId!)}
                              className={`w-full p-4 border flex items-center justify-between transition-all relative overflow-hidden group ${isActionDisabled ? 'opacity-30 grayscale cursor-not-allowed border-red-600/20' : 'bg-black/40 border-white/5 hover:border-[#3b82f6] hover:bg-slate-900/60'}`}
                           >
                              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: bColor }}></div>
                              <div className="flex flex-col items-start min-w-0 flex-1">
                                 <span className={`text-[12px] font-black uppercase truncate pr-4 ${isQuotaFull ? 'text-red-500' : 'text-white'}`}>{lesson?.name}</span>
                                 <span className="text-[8px] font-bold text-slate-500 uppercase mt-1">{teacher?.name || 'ATANMADI'}</span>
                              </div>
                              
                              <div className="flex flex-col items-end shrink-0 gap-1">
                                 {conflict ? (
                                    <div className="flex flex-col items-end">
                                       <span className="text-[7px] font-black text-red-500 uppercase">ÇAKIŞMA</span>
                                       <span className="text-[6px] text-slate-600 uppercase">{conflict.sinif} ŞUBESİNDE</span>
                                    </div>
                                 ) : blocked ? (
                                    <span className="text-[7px] font-black text-red-500 uppercase">HOCA_KAPALI</span>
                                 ) : isQuotaFull ? (
                                    <div className="flex flex-col items-end">
                                       <span className="text-[12px] font-black text-red-500">{usedHours}/{plannedHours}</span>
                                       <span className="text-[6px] font-black text-red-700 uppercase">KOTA DOLDU</span>
                                    </div>
                                 ) : (
                                    <div className="flex items-center gap-2">
                                       <span className="text-[12px] font-black text-[#fbbf24]">{usedHours}/{plannedHours}</span>
                                       <i className="fa-solid fa-plus text-[#3b82f6] opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                    </div>
                                 )}
                              </div>
                           </button>
                        );
                     })
                  ) : (
                     <div className="py-10 text-center opacity-30 border border-dashed border-white/10">
                        <p className="text-[10px] font-black uppercase">BU ŞUBEYE DERS ATANMAMIŞ</p>
                     </div>
                  )}
               </div>
               
               <div className="p-4 bg-black/60 border-t border-white/10">
                  <p className="text-[7px] font-bold text-slate-600 uppercase leading-relaxed italic">
                     * Sadece bu şubeye tanımlanmış olan dersler ve o dersin hocaları listelenir. 
                  </p>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default ClassSchedulesModule;
