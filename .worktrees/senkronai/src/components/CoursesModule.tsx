import React, { useState, useMemo } from 'react';
import { Course, Teacher, Announcement, CommsType, CommsCategory, UserRole, ClassSection, Student, Gender } from '../types';

interface CoursesModuleProps {
  courses: Course[];
  setCourses: (c: Course[]) => void;
  teachers: Teacher[];
  announcements: Announcement[];
  setAnnouncements: (a: Announcement[]) => void;
  classes: ClassSection[];
  editMode: boolean;
  onWatchModeAttempt: () => void;
  onSuccess: (msg?: string) => void;
}

const CATEGORIES = ['AKADEMİK', 'SANAT', 'SPOR', 'TEKNOLOJİ'] as const;

const CoursesModule: React.FC<CoursesModuleProps> = ({
  courses, setCourses, teachers, announcements, setAnnouncements, classes, editMode, onWatchModeAttempt, onSuccess
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewingStudentsId, setViewingStudentsId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Course>>({
    name: '', teacherName: '', capacity: 20, schedule: '', category: 'AKADEMİK', targetGrades: []
  });

  const filtered = useMemo(() => {
    return courses.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [courses, searchTerm]);

  const enrolledStudents = useMemo(() => {
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

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (editMode && !editingId) e.target.value = '';
  };

  const startEditing = (course: Course) => {
    if (!editMode) return onWatchModeAttempt();
    setFormData({ ...course });
    setEditingId(course.id);
    setIsDrawerOpen(true);
  };

  const handleSave = () => {
    if (!editMode) return onWatchModeAttempt();
    if (!formData.name || !formData.teacherName) return;

    if (editingId) {
      setCourses(courses.map(c => c.id === editingId ? { ...c, ...formData as Course } : c));
      onSuccess("KURS_DNA_GÜNCELLENDİ");
    } else {
      const newCourse: Course = {
        ...formData as Course,
        id: `KURS-${Date.now()}`,
        enrolledCount: 0
      };
      setCourses([...courses, newCourse]);
      onSuccess("YENİ_KURS_MÜHÜRLENDİ");
    }
    setIsDrawerOpen(false);
    setEditingId(null);
  };

  const sendInvitation = (course: Course) => {
    if (!editMode) return onWatchModeAttempt();
    
    const newAnnouncement: Announcement = {
      id: `DAVET-${Date.now()}`,
      title: `${course.name} - MÜHÜRLÜ DAVET`,
      content: `${course.teacherName} rehberliğinde gerçekleşecek olan kursumuza başvurular başlamıştır. Program: ${course.schedule}. Kontenjan kısıtlıdır (${course.capacity} Kişi).`,
      type: CommsType.ANNOUNCEMENT,
      category: CommsCategory.SOCIAL,
      timestamp: Date.now(),
      audience: course.targetGrades?.length ? `${course.targetGrades.join(', ')} SEVİYELERİ` : 'ALL',
      readCount: 0,
      isPinned: true,
      location: course.location || 'BİLİNMİYOR'
    };

    setAnnouncements([newAnnouncement, ...announcements]);
    onSuccess("DAVET_TÜM_DNAYA_YAYINLANDI");
  };

  const deleteCourse = (id: string) => {
    if (!editMode) return onWatchModeAttempt();
    setCourses(courses.filter(c => c.id !== id));
    onSuccess("KURS_KALDIRILDI");
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-slide-up px-1 overflow-hidden">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-[#0d141b] border border-white/5 p-3 shrink-0 rounded-sm shadow-xl gap-4">
         <div className="flex-1 relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[#3b82f6] text-[10px]"></i>
            <input 
              placeholder="KURS ARA..." 
              className="w-full h-11 bg-black border border-white/10 pl-9 pr-4 text-[11px] font-black text-white uppercase outline-none focus:border-[#3b82f6]"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
         <button 
           onClick={() => { if(!editMode) onWatchModeAttempt(); else { setEditingId(null); setFormData({ name: '', teacherName: '', capacity: 20, schedule: '', category: 'AKADEMİK', targetGrades: [] }); setIsDrawerOpen(true); } }}
           className="h-11 px-6 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 flex items-center gap-2"
         >
            <i className="fa-solid fa-plus"></i> EKLE
         </button>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-24 pr-1">
         {filtered.length > 0 ? filtered.map(c => {
            const fillPerc = Math.round((c.enrolledCount / c.capacity) * 100);
            const isFull = fillPerc >= 100;
            const isCritical = fillPerc >= 85 && !isFull;
            
            return (
              <div 
                key={c.id} 
                onClick={() => setViewingStudentsId(c.id)}
                className="bg-[#1e293b]/80 border border-white/5 p-4 relative overflow-hidden transition-all shadow-xl rounded-sm hover:bg-[#253447] group cursor-pointer"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24]"></div>
                
                <div className="flex justify-between items-start mb-4">
                   <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-3">
                         <span className="text-[14px] font-black text-white uppercase tracking-tighter truncate">{c.name}</span>
                         <span className="text-[6px] font-black px-1.5 py-0.5 border border-[#3b82f6]/30 text-[#3b82f6] bg-[#3b82f6]/5 uppercase">{c.category}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">{c.teacherName}</span>
                         <div className="flex items-center gap-1.5 opacity-60">
                            <i className="fa-solid fa-clock text-[8px] text-[#fbbf24]"></i>
                            <span className="text-[8px] font-black text-white uppercase">{c.schedule}</span>
                         </div>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 shrink-0 border-l border-white/5 pl-4">
                      <div className="text-right">
                         <div className="flex items-baseline gap-1">
                            <span className={`text-[16px] font-black ${isFull ? 'text-red-500' : isCritical ? 'text-orange-500' : 'text-green-500'}`}>{c.enrolledCount}</span>
                            <span className="text-slate-600 text-[10px]">/ {c.capacity}</span>
                         </div>
                         <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest block">DOLULUK_DNA</span>
                      </div>
                      <div className="flex flex-col gap-1">
                         <button onClick={(e) => { e.stopPropagation(); sendInvitation(c); }} className="w-8 h-8 bg-[#3b82f6]/10 border border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white transition-all flex items-center justify-center shadow-lg" title="Davet Gönder"><i className="fa-solid fa-paper-plane text-[10px]"></i></button>
                         {editMode && (
                           <>
                             <button onClick={(e) => { e.stopPropagation(); startEditing(c); }} className="w-8 h-8 bg-[#fbbf24]/10 border border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black transition-all flex items-center justify-center shadow-lg" title="Düzenle"><i className="fa-solid fa-pen text-[10px]"></i></button>
                             <button onClick={(e) => { e.stopPropagation(); deleteCourse(c.id); }} className="w-8 h-8 bg-red-600/10 border border-red-600/40 text-red-500 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-lg" title="Sil"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                           </>
                         )}
                      </div>
                   </div>
                </div>

                <div className="h-1 bg-black/40 w-full overflow-hidden rounded-full">
                   <div 
                     className={`h-full transition-all duration-1000 ${isFull ? 'bg-red-600' : isCritical ? 'bg-orange-500' : 'bg-green-500'}`} 
                     style={{ width: `${Math.min(100, fillPerc)}%` }}
                   ></div>
                </div>
              </div>
            );
         }) : (
            <div className="py-32 flex flex-col items-center justify-center opacity-10 border-2 border-dashed border-white/10 rounded-sm">
               <i className="fa-solid fa-graduation-cap text-6xl mb-6"></i>
               <span className="text-[12px] font-black uppercase tracking-[0.5em]">KURS_DNA_BOŞ</span>
            </div>
         )}
      </div>

      {/* STUDENT LIST MODAL */}
      {viewingStudentsId && viewingCourse && (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-lg shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 duration-300 rounded-sm overflow-hidden h-[80vh] bg-grid-hatched">
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                 <div>
                    <h3 className="text-[15px] font-black text-white uppercase tracking-[0.1em] leading-tight">{viewingCourse.name}</h3>
                    <span className="text-[8px] font-black text-[#3b82f6] uppercase mt-2 block tracking-widest">KATILIMCI DNA LİSTESİ ({enrolledStudents.length} KİŞİ)</span>
                 </div>
                 <button onClick={() => setViewingStudentsId(null)} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
                 {enrolledStudents.length > 0 ? enrolledStudents.map(({ student, className }, idx) => (
                    <div key={student.id} className="bg-black/60 border border-white/5 p-3 flex items-center justify-between group hover:bg-[#1e2e3d] transition-all">
                       <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center shadow-inner ${student.gender === Gender.FEMALE ? 'text-pink-500 bg-pink-500/5' : 'text-[#3b82f6] bg-[#3b82f6]/5'}`}>
                             <i className={`fa-solid ${student.gender === Gender.FEMALE ? 'fa-venus' : 'fa-mars'} text-[10px]`}></i>
                          </div>
                          <div className="flex flex-col">
                             <span className="text-[12px] font-black text-white uppercase leading-tight">{student.name}</span>
                             <span className="text-[7px] font-bold text-slate-500 uppercase mt-0.5">NO: {student.number}</span>
                          </div>
                       </div>
                       <div className="text-right">
                          <span className="text-[9px] font-black text-[#fbbf24] bg-[#fbbf24]/5 px-2 py-0.5 border border-[#fbbf24]/20 uppercase">{className}</span>
                       </div>
                    </div>
                 )) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                       <i className="fa-solid fa-users-slash text-5xl mb-4"></i>
                       <p className="text-[10px] font-black uppercase tracking-[0.4em]">KAYITLI ÖĞRENCİ BULUNAMADI</p>
                    </div>
                 )}
              </div>
              
              <div className="p-4 bg-[#162431] border-t border-white/10 flex flex-col gap-3 shrink-0">
                 <div className="flex justify-between items-center px-2">
                    <span className="text-[8px] font-black text-slate-500 uppercase">GÜNCEL_DOLULUK:</span>
                    <span className="text-[12px] font-black text-white">%{Math.round((enrolledStudents.length / viewingCourse.capacity) * 100)}</span>
                 </div>
                 <button onClick={() => setViewingStudentsId(null)} className="w-full h-12 bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] active:scale-95 transition-all">PENCEREYİ_KAPAT</button>
              </div>
           </div>
        </div>
      )}

      {/* EDITOR DRAWER */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-lg w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col bg-grid-hatched rounded-sm">
              <div className="flex justify-between items-center mb-8 shrink-0">
                 <div>
                    <h3 className="text-[14px] font-black text-white uppercase tracking-widest">{editingId ? 'KURS_DNA_GÜNCELLEME' : 'YENİ_KURS_DNA_GİRİŞİ'}</h3>
                    <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.3em] mt-2 block">DERS DIŞI ETKİNLİK SİSTEMİ</span>
                 </div>
                 <button onClick={() => { setIsDrawerOpen(false); setEditingId(null); }} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>

              <div className="space-y-5">
                 <div className="space-y-1.5">
                    <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">KURS ADI</label>
                    <input 
                      placeholder="Örn: ROBOTİK KODLAMA"
                      className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6] shadow-inner"
                      value={formData.name}
                      onFocus={handleInputFocus}
                      onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">KATEGORİ</label>
                       <select 
                         className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-[#fbbf24] outline-none focus:border-[#3b82f6]"
                         value={formData.category}
                         onChange={e => setFormData({...formData, category: e.target.value as any})}
                       >
                          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">KONTENJAN (KAPASİTE)</label>
                       <input 
                         type="number"
                         className="w-full bg-black border border-white/10 p-3 text-[13px] font-black text-white text-center outline-none focus:border-[#3b82f6] shadow-inner"
                         value={formData.capacity}
                         onChange={e => setFormData({...formData, capacity: parseInt(e.target.value) || 0})}
                       />
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">SORUMLU_PERSONEL (ÖĞRETMEN DEĞİŞTİR)</label>
                    <select 
                      className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-white outline-none focus:border-[#3b82f6]"
                      value={formData.teacherName}
                      onChange={e => setFormData({...formData, teacherName: e.target.value})}
                    >
                       <option value="">HOCA SEÇİNİZ...</option>
                       {teachers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">ZAMAN_SLOTU</label>
                       <input 
                         placeholder="Örn: Cts 09:00"
                         className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-slate-300 outline-none focus:border-[#3b82f6] shadow-inner"
                         value={formData.schedule}
                         onChange={e => setFormData({...formData, schedule: e.target.value})}
                       />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">KONUM_ETİKETİ</label>
                       <input 
                         placeholder="Örn: Lab 1"
                         className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-slate-300 outline-none focus:border-[#3b82f6] shadow-inner"
                         value={formData.location}
                         onChange={e => setFormData({...formData, location: e.target.value})}
                       />
                    </div>
                 </div>

                 <button 
                   onClick={handleSave}
                   className="w-full h-14 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.4em] shadow-xl hover:brightness-110 active:scale-95 transition-all mt-4 border border-white/10"
                 >{editingId ? 'DEĞİŞİKLİKLERİ_MÜHÜRLLE' : 'DNAYI_MÜHÜRLLE'}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CoursesModule;