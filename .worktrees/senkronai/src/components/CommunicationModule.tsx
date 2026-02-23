
import React, { useState, useMemo, useEffect } from 'react';
import { Announcement, CommsCategory, CommsType, ClassSection, ModuleType, UserRole } from '../types';

interface CommunicationModuleProps {
  announcements: Announcement[];
  setAnnouncements: (a: Announcement[]) => void;
  classes: ClassSection[];
  editMode: boolean;
  onWatchModeAttempt: () => void;
  onSuccess: (msg?: string) => void;
  userRole?: UserRole;
  currentUserId?: string;
}

const CommunicationModule: React.FC<CommunicationModuleProps> = ({
  announcements, setAnnouncements, classes, editMode, onWatchModeAttempt, onSuccess, userRole, currentUserId
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [filterType, setFilterType] = useState<CommsType | 'ALL'>('ALL');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Announcement>>({
    title: '',
    content: '',
    type: CommsType.ANNOUNCEMENT,
    category: CommsCategory.ACADEMIC,
    audience: 'ALL',
    location: '',
    isPinned: false
  });

  const [socialSync, setSocialSync] = useState(true);

  // Öğretmen ise sadece dersine girdiği sınıfları listele
  const allowedClasses = useMemo(() => {
    if (userRole === UserRole.ADMIN) return classes;
    if (userRole === UserRole.TEACHER && currentUserId) {
        // Öğretmenin assignment'ı olan sınıflar
        return classes.filter(c => (c.assignments || []).some(a => a.teacherId === currentUserId)).sort((a,b) => a.name.localeCompare(b.name));
    }
    return [];
  }, [classes, userRole, currentUserId]);

  // Öğrenci ise kendi sınıfını bul
  const currentUserClass = useMemo(() => {
    if (userRole !== UserRole.STUDENT || !currentUserId) return null;
    const foundClass = classes.find(c => (c.students || []).some(s => s.number === currentUserId || s.id === currentUserId));
    return foundClass ? foundClass.name : null;
  }, [classes, userRole, currentUserId]);

  // Form açıldığında varsayılan hedef kitleyi ayarla
  useEffect(() => {
    if (isEditorOpen && userRole === UserRole.TEACHER) {
        // Varsayılan olarak "TÜM ŞUBELERİM" seçilsin
        setFormData(prev => ({ ...prev, audience: 'MY_CLASSES' }));
    }
  }, [isEditorOpen, userRole]);

  const filteredItems = useMemo(() => {
    let items = [...announcements];

    // 1. TİP FİLTRESİ (Duyuru, Etkinlik vb.)
    if (filterType !== 'ALL') {
       items = items.filter(a => a.type === filterType);
    }

    // 2. HEDEF KİTLE FİLTRESİ (GÜVENLİK)
    if (userRole === UserRole.STUDENT) {
        items = items.filter(a => {
            // Genel duyurular her zaman görünür
            if (a.audience === 'ALL' || a.audience === 'ALL_CLASSES') return true;
            
            // Sadece öğretmenlere özel olanlar gizlenir
            if (a.audience === 'TEACHERS') return false;
            
            // Eğer hedef kitle spesifik bir sınıf ise (Örn: "12-A")
            // Sistemdeki sınıf isimleriyle eşleşiyorsa kontrol et
            const isClassTarget = classes.some(c => c.name === a.audience);
            
            if (isClassTarget) {
                // Sadece öğrencinin kendi sınıfıysa göster
                return a.audience === currentUserClass;
            }

            // "MY_CLASSES" veya diğer durumlar için şimdilik gizle (Veri bütünlüğü için)
            // Eğer "MY_CLASSES" seçildiyse, gönderen hocanın ID'si olmadan öğrenci ile eşleştiremeyiz.
            // Bu yüzden şimdilik sadece kesin eşleşmeleri gösteriyoruz.
            if (a.audience === 'MY_CLASSES') return false; 

            return true;
        });
    }

    return items.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || b.timestamp - a.timestamp);
  }, [announcements, filterType, userRole, currentUserClass, classes]);

  // YETKİ KONTROLÜ: Admin için editMode, Öğretmen için her zaman açık
  const hasPermission = useMemo(() => {
      return editMode || userRole === UserRole.TEACHER;
  }, [editMode, userRole]);

  const handleEdit = (ann: Announcement) => {
    if (!hasPermission) return onWatchModeAttempt();
    setEditingId(ann.id);
    setFormData({
      title: ann.title,
      content: ann.content,
      type: ann.type,
      category: ann.category,
      audience: ann.audience,
      location: ann.location || '',
      isPinned: ann.isPinned || false
    });
    setIsEditorOpen(true);
    setActiveMenuId(null);
  };

  const handleSave = () => {
    if (!hasPermission) return onWatchModeAttempt();
    if (!formData.title || !formData.content) return;

    if (editingId) {
      // GÜNCELLEME MODU
      const updated = announcements.map(a => 
        a.id === editingId 
          ? { 
              ...a, 
              title: formData.title!.toUpperCase(), 
              content: formData.content!, 
              type: formData.type!,
              category: formData.category!,
              audience: formData.audience!,
              location: formData.location,
              isPinned: formData.isPinned,
              timestamp: Date.now() // Opsiyonel: Güncelleme tarihini yansıtmak için
            } 
          : a
      );
      setAnnouncements(updated);
      onSuccess("YAYIN_GÜNCELLENDİ");
    } else {
      // YENİ KAYIT MODU
      const newEntry: Announcement = {
        id: `COM-${Date.now()}`,
        title: formData.title.toUpperCase(),
        content: formData.content,
        type: formData.type || CommsType.ANNOUNCEMENT,
        category: formData.category || CommsCategory.ACADEMIC,
        timestamp: Date.now(),
        audience: formData.audience || 'ALL',
        readCount: 0,
        isPinned: formData.isPinned || false,
        location: formData.location
      };
      setAnnouncements([newEntry, ...announcements]);
      onSuccess(socialSync ? "YAYIN_VE_SOSYAL_MEDYA_MÜHÜRLENDİ" : "YAYIN_DNAYA_İŞLENDİ");
    }

    setIsEditorOpen(false);
    setEditingId(null);
    setFormData({ title: '', content: '', type: CommsType.ANNOUNCEMENT, category: CommsCategory.ACADEMIC, audience: 'ALL', location: '', isPinned: false });
  };

  const deleteAnnouncement = (id: string) => {
    if (!hasPermission) return onWatchModeAttempt();
    setAnnouncements(announcements.filter(a => a.id !== id));
    onSuccess("YAYIN_SİLİNDİ");
  };

  const getAudienceLabel = (audience: string) => {
    if (audience === 'ALL') return 'TÜM OKUL';
    if (audience === 'TEACHERS') return 'TÜM ÖĞRETMENLER';
    if (audience === 'ALL_CLASSES') return 'TÜM SINIFLAR';
    if (audience === 'MY_CLASSES') return 'TÜM ŞUBELERİM';
    return `${audience} ŞUBESİ`;
  };

  const getAudienceColor = (audience: string) => {
    if (audience === 'ALL') return '#3b82f6'; // Mavi
    if (audience === 'TEACHERS') return '#a855f7'; // Mor
    if (audience === 'ALL_CLASSES') return '#fbbf24'; // Sarı
    if (audience === 'MY_CLASSES') return '#f97316'; // Turuncu
    return '#22c55e'; // Yeşil (Tekil Sınıf)
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-slide-up px-1 overflow-hidden" onClick={() => setActiveMenuId(null)}>
      {/* HEADER ACTIONS */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-[#0d141b] border border-white/5 p-2 sm:p-3 shrink-0 rounded-sm shadow-xl gap-3">
         <div className="flex bg-black/40 p-1 gap-1 overflow-x-auto no-scrollbar mask-fade-right">
            {['ALL', ...Object.values(CommsType)].map(t => (
               <button 
                 key={t} 
                 onClick={(e) => { e.stopPropagation(); setFilterType(t as any); }} 
                 className={`px-3 sm:px-4 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterType === t ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
               >
                 {t === 'ALL' ? 'TÜMÜ' : t}
               </button>
            ))}
         </div>
         <button 
           onClick={(e) => { 
             e.stopPropagation(); 
             if(!hasPermission) onWatchModeAttempt(); 
             else {
               setEditingId(null);
               // Reset form properly
               setFormData({ 
                   title: '', 
                   content: '', 
                   type: CommsType.ANNOUNCEMENT, 
                   category: CommsCategory.ACADEMIC, 
                   audience: userRole === UserRole.TEACHER ? 'MY_CLASSES' : 'ALL', 
                   location: '', 
                   isPinned: false 
               });
               setIsEditorOpen(true); 
             }
           }} 
           className="h-10 sm:h-11 px-5 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all border border-white/10 shrink-0"
         >
            <i className="fa-solid fa-tower-broadcast animate-pulse"></i> 
            <span className="inline">+ YENİ_YAYIN</span>
         </button>
      </div>

      {/* FEED LIST */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-24 pr-1">
         {filteredItems.map(item => {
            const isMenuOpen = activeMenuId === item.id;
            const audienceColor = getAudienceColor(item.audience);
            
            return (
              <div key={item.id} className="relative overflow-hidden group">
                <div className={`bg-[#1e293b]/80 border border-white/5 p-4 sm:p-5 relative overflow-hidden transition-all shadow-xl rounded-sm hover:bg-[#253447] ${isMenuOpen ? '-translate-x-32' : ''}`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1 shadow-[0_0_15px_currentColor]" style={{ backgroundColor: audienceColor, color: audienceColor }}></div>
                  
                  {item.isPinned && (
                    <div className="absolute top-2 right-12 text-[#fbbf24] text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-60">
                      <i className="fa-solid fa-thumbtack"></i> SABİTLENDİ
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-4">
                      <div className="flex flex-col min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-3">
                            <i className="fa-solid fa-users text-[12px]" style={{ color: audienceColor }}></i>
                            <span className="text-[14px] font-black text-white uppercase tracking-tighter group-hover:text-[#3b82f6] truncate">{item.title}</span>
                            <span className="text-[6px] font-black px-1.5 py-0.5 rounded-sm border uppercase" style={{ borderColor: `${audienceColor}40`, color: audienceColor, backgroundColor: `${audienceColor}10` }}>
                               {getAudienceLabel(item.audience)}
                            </span>
                        </div>
                        <div className="flex wrap items-center gap-x-4 gap-y-2 mt-2">
                            <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">{new Date(item.timestamp).toLocaleString('tr-TR')}</span>
                            <div className="flex items-center gap-1.5 bg-black/40 px-2 py-0.5 border border-white/5 rounded-sm">
                              <span className="text-[6px] font-black text-slate-500 uppercase tracking-tighter">SLOT:</span>
                              <span className="text-[7px] font-black text-[#fbbf24] uppercase tracking-widest">{item.type}</span>
                            </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 border-l border-white/5 pl-4">
                        <div className="flex flex-col items-end opacity-40">
                            <span className="text-[14px] font-black text-white">{item.readCount}</span>
                            <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">OKUNDU_DNA</span>
                        </div>
                        {hasPermission && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : item.id); }} 
                              className={`w-8 h-8 flex items-center justify-center transition-all ${isMenuOpen ? 'text-[#3b82f6]' : 'text-slate-700 hover:text-white'}`}
                            >
                              <i className="fa-solid fa-ellipsis-vertical text-lg"></i>
                            </button>
                        )}
                      </div>
                  </div>
                  
                  <p className="text-[11px] font-bold text-slate-300 leading-relaxed italic border-l-2 border-white/5 pl-4 py-1">{item.content}</p>
                  
                  {item.location && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                        <div className="flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase italic">
                          <i className="fa-solid fa-location-dot text-[#3b82f6]"></i>
                          KONUM: {item.location}
                        </div>
                    </div>
                  )}
                </div>

                <div className={`absolute right-0 top-0 bottom-0 flex transition-all duration-300 w-32 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                   <button 
                      onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                      className="w-16 h-full bg-[#3b82f6] text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all"
                   >
                      <i className="fa-solid fa-pen text-xs mb-1"></i>
                      <span className="text-[6px] font-black uppercase">DÜZENLE</span>
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); deleteAnnouncement(item.id); }} className="w-16 h-full bg-red-600 text-white flex flex-col items-center justify-center border-l border-white/10 active:brightness-90 transition-all">
                      <i className="fa-solid fa-trash-can text-xs mb-1"></i>
                      <span className="text-[6px] font-black uppercase">SİL</span>
                   </button>
                </div>
              </div>
            );
         })}
      </div>

      {/* PUBLISHING WIZARD MODAL */}
      {isEditorOpen && (
         <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-2 py-4">
            <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] w-full max-w-xl max-h-[95vh] shadow-[0_0_100px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 flex flex-col bg-grid-hatched rounded-sm overflow-hidden">
               <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-[#0d141b] shrink-0">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 sm:w-11 h-11 bg-[#3b82f6]/20 border border-[#3b82f6]/40 flex items-center justify-center shadow-lg">
                        <i className={`fa-solid ${editingId ? 'fa-pen-to-square' : 'fa-tower-broadcast'} text-[#3b82f6] text-lg`}></i>
                     </div>
                     <div>
                        <h3 className="text-[13px] sm:text-[14px] font-black text-white uppercase tracking-widest leading-none">
                           {editingId ? 'YAYIN_DÜZENLEME' : 'YAYIN_SİHİRBAZI'}
                        </h3>
                        <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.3em] mt-1.5 block">HABERLEŞME_DNA_GİRİŞİ</span>
                     </div>
                  </div>
                  <button onClick={() => { setIsEditorOpen(false); setEditingId(null); }} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6">
                  <div className="space-y-1.5">
                     <label className="text-[8px] font-black text-[#fbbf24] uppercase tracking-widest ml-1">HEDEF_KİTLE_DNA (GÖNDERİLECEK BİRİMLER)</label>
                     <select 
                       value={formData.audience} 
                       onChange={e => setFormData({...formData, audience: e.target.value})} 
                       className="w-full bg-black border border-white/10 p-4 text-[12px] font-black text-white outline-none focus:border-[#3b82f6] shadow-inner appearance-none"
                     >
                        {userRole === UserRole.ADMIN && (
                            <>
                                <option value="ALL">TÜM OKUL (HERKES)</option>
                                <option value="TEACHERS">SADECE TÜM ÖĞRETMENLER</option>
                                <option value="ALL_CLASSES">SADECE TÜM SINIFLAR / ÖĞRENCİLER</option>
                            </>
                        )}
                        
                        {userRole === UserRole.TEACHER && (
                            <option value="MY_CLASSES">TÜM ŞUBELERİM (HEPSİ)</option>
                        )}

                        <optgroup label="ŞUBELERİM (TEKİL SEÇİM)">
                           {allowedClasses.length > 0 ? (
                               allowedClasses.map(c => <option key={c.id} value={c.name}>{c.name} ŞUBESİ ÖZEL</option>)
                           ) : (
                               <option disabled>ATANMIŞ ŞUBE BULUNAMADI</option>
                           )}
                        </optgroup>
                     </select>
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">YAYIN_BAŞLIĞI</label>
                     <input 
                       placeholder="DUYURU_METNİ_BAŞLIĞI..." 
                       className="w-full bg-black border border-white/10 p-3.5 text-[12px] sm:text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6] shadow-inner" 
                       value={formData.title} 
                       onChange={e => setFormData({...formData, title: e.target.value})} 
                     />
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">İÇERİK_DNA_NAKIŞI</label>
                     <textarea 
                       rows={5} 
                       placeholder="YAYINLANACAK MESAJI BURAYA NAKŞEDİN..." 
                       className="w-full bg-black border border-white/10 p-3.5 text-[11px] sm:text-[12px] font-bold text-slate-300 outline-none focus:border-[#3b82f6] resize-none shadow-inner leading-relaxed" 
                       value={formData.content} 
                       onChange={e => setFormData({...formData, content: e.target.value})} 
                     />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">MEVKİ_ETİKETİ (OPSİYONEL)</label>
                        <input 
                          placeholder="Örn: Konferans Salonu" 
                          className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-slate-300 outline-none focus:border-[#3b82f6] shadow-inner" 
                          value={formData.location} 
                          onChange={e => setFormData({...formData, location: e.target.value})} 
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">İLAN_TÜRÜ</label>
                        <select 
                          value={formData.type} 
                          onChange={e => setFormData({...formData, type: e.target.value as CommsType})} 
                          className="w-full bg-black border border-white/10 p-3 text-[11px] font-black text-white outline-none focus:border-[#3b82f6] shadow-inner"
                        >
                           {Object.values(CommsType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <button 
                        onClick={() => setFormData({...formData, isPinned: !formData.isPinned})}
                        className={`h-12 sm:h-14 border transition-all flex items-center justify-between px-3 sm:px-4 group ${formData.isPinned ? 'bg-[#fbbf24] border-[#fbbf24] text-black shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}
                     >
                        <div className="flex flex-col items-start">
                           <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">SABİTLE</span>
                           <span className="text-[5px] font-bold uppercase opacity-60">ÜST_DNA</span>
                        </div>
                        <i className={`fa-solid fa-thumbtack ${formData.isPinned ? 'animate-bounce' : ''}`}></i>
                     </button>

                     {!editingId && (
                       <button 
                          onClick={() => setSocialSync(!socialSync)}
                          className={`h-12 sm:h-14 border transition-all flex items-center justify-between px-3 sm:px-4 group ${socialSync ? 'bg-[#22c55e] border-[#22c55e] text-white shadow-lg' : 'bg-black border-white/10 text-slate-600'}`}
                       >
                          <div className="flex flex-col items-start">
                             <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">SOSYAL_SYNC</span>
                             <span className="text-[5px] font-bold uppercase opacity-60">DNA_DAĞITIM</span>
                          </div>
                          <i className="fa-solid fa-share-nodes"></i>
                       </button>
                     )}
                  </div>
               </div>

               <div className="p-4 sm:p-6 bg-black/60 border-t border-white/5 shrink-0">
                  <button 
                    onClick={handleSave} 
                    disabled={!formData.title || !formData.content}
                    className="w-full h-14 sm:h-16 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.4em] shadow-[0_10px_40px_rgba(59,130,246,0.4)] hover:brightness-110 active:scale-[0.98] transition-all border border-white/10 disabled:opacity-20 disabled:grayscale"
                  >
                    {editingId ? 'DEĞİŞİKLİKLERİ_MÜHÜRLLE' : 'YAYINI_BAŞLAT'}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CommunicationModule;
