
import React, { useState, useMemo, useRef } from 'react';
import { Teacher, ScheduleEntry, SchoolConfig, ShiftType, GuardDutyAssignment } from '../types';
import { getBranchColor, hexToRgba } from '../utils';
import * as XLSX from 'xlsx';

interface DutyLocation {
  name: string;
  isActive: boolean;
}

interface GuardDutyModuleProps {
  teachers: Teacher[];
  setTeachers: (t: Teacher[] | ((prev: Teacher[]) => Teacher[])) => void;
  schedule: ScheduleEntry[];
  schoolConfig: SchoolConfig;
  editMode: boolean;
  onWatchModeAttempt: () => void;
  onSuccess: (msg?: string) => void;
  currentUserId?: string;
}

const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const DAYS_SHORT = ['PZT', 'SAL', 'ÇRŞ', 'PER', 'CUM'];
const DEFAULT_LOCATIONS = ['BAHÇE', 'KANTİN', 'ZEMİN KAT', '1. KAT', '2. KAT', 'SPOR SALONU'];

const GuardDutyModule: React.FC<GuardDutyModuleProps> = ({
  teachers, setTeachers, schedule, schoolConfig, editMode, onWatchModeAttempt, onSuccess, currentUserId
}) => {
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const activeDay = DAYS_FULL[activeDayIdx];
  
  const [locations, setLocations] = useState<DutyLocation[]>(
    DEFAULT_LOCATIONS.map(loc => ({ name: loc, isActive: true }))
  );
  const [isLocationEditorOpen, setIsLocationEditorOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationIdx, setEditingLocationIdx] = useState<number | null>(null);
  const [editLocationValue, setEditLocationValue] = useState('');

  const [dutyToDelete, setDutyToDelete] = useState<{ teacherId: string, teacherName: string, day: string } | null>(null);
  const [isClearWeekModalOpen, setIsClearWeekModalOpen] = useState(false);

  const activeLocations = useMemo(() => locations.filter(l => l.isActive), [locations]);

  const getTeacherLoadForDay = (teacherName: string, day: string) => {
    return schedule.filter(s => 
      s.ogretmen.toUpperCase() === teacherName.toUpperCase() && 
      (s.gun.toLowerCase() === day.toLowerCase() || s.gun.toLowerCase().startsWith(day.toLowerCase().substring(0,3)))
    ).length;
  };

  const handleAddLocation = () => {
    if (!editMode) return onWatchModeAttempt();
    if (!newLocationName.trim()) return;
    if (locations.some(l => l.name.toUpperCase() === newLocationName.trim().toUpperCase())) {
        onSuccess("HATA: BU MEVKİ ZATEN MEVCUT");
        return;
    }
    setLocations([...locations, { name: newLocationName.trim().toUpperCase(), isActive: true }]);
    setNewLocationName('');
    onSuccess("MEVKİ EKLENDİ");
  };

  const handleDeleteLocation = (idx: number) => {
    if (!editMode) return onWatchModeAttempt();
    setLocations(locations.filter((_, i) => i !== idx));
    onSuccess("MEVKİ SİLİNDİ");
  };

  const startEditingLocation = (idx: number) => {
    if (!editMode) return onWatchModeAttempt();
    setEditingLocationIdx(idx);
    setEditLocationValue(locations[idx].name);
  };

  const saveEditedLocation = () => {
    if (editingLocationIdx === null) return;
    const newName = editLocationValue.trim().toUpperCase();
    if (!newName) return;
    
    const newLocs = [...locations];
    newLocs[editingLocationIdx].name = newName;
    setLocations(newLocs);
    setEditingLocationIdx(null);
    onSuccess("MEVKİ GÜNCELLENDİ");
  };

  // ADALETLİ DAĞITIM MOTORU v2.5
  const autoAssignDuties = () => {
    if (!editMode) return onWatchModeAttempt();
    if (activeLocations.length === 0) {
      onSuccess("HATA: AKTİF MEVKİ BULUNAMADI");
      return;
    }
    
    // 1. Nöbetten muaf olmayan tüm hocaları al ve karıştır (Shuffle)
    const eligibleTeachers = teachers
      .filter(t => !t.isExemptFromDuty)
      .sort(() => Math.random() - 0.5);

    if (eligibleTeachers.length === 0) {
      onSuccess("HATA: GÖREV ALABİLECEK HOCA YOK");
      return;
    }

    // 2. Haftalık toplam nöbet slotu sayısını hesapla
    const totalSlotsPerWeek = DAYS_FULL.length * activeLocations.length;
    
    // 3. Dağıtım algoritması (Hepsine eşit hak)
    setTeachers(prevTeachers => {
      // Önce mevcut tüm nöbetleri sıfırla (muaf olanlar hariç)
      const freshTeachers = prevTeachers.map(t => ({
        ...t,
        guardDuties: t.isExemptFromDuty ? (t.guardDuties || []) : []
      }));

      let teacherPointer = 0;
      let assignedCount = 0;

      // Günleri ve mevkileri gezerek atama yap
      DAYS_FULL.forEach(day => {
        activeLocations.forEach((loc, locIdx) => {
          // Havuz bitmişse ve hala slot varsa havuzu başa sar (Nadir durum: Slot > Hoca)
          if (teacherPointer >= eligibleTeachers.length) {
            teacherPointer = 0; 
          }

          const targetTeacherId = eligibleTeachers[teacherPointer].id;
          const tIdx = freshTeachers.findIndex(ft => ft.id === targetTeacherId);

          if (tIdx !== -1) {
            const t = freshTeachers[tIdx];
            if (!t.guardDuties) t.guardDuties = [];
            
            t.guardDuties.push({
              day,
              morningLocation: loc.name,
              afternoonLocation: activeLocations[(locIdx + 1) % activeLocations.length]?.name || loc.name
            });
            
            assignedCount++;
            teacherPointer++;
          }
        });
      });

      const unassignedCount = Math.max(0, eligibleTeachers.length - assignedCount);
      onSuccess(`${assignedCount} HOCA GÖREVLENDİRİLDİ, ${unassignedCount} HOCA SIRADA`);
      return [...freshTeachers];
    });
  };

  const executeClearAll = () => {
    setTeachers(prev => prev.map(t => ({ ...t, guardDuties: [] })));
    setIsClearWeekModalOpen(false);
    onSuccess("HAFTALIK PLAN TEMİZLENDİ");
  };

  const downloadDutySchedule = () => {
    onSuccess("YAZDIRMA PANELİ HAZIRLANIYOR...");
    setTimeout(() => {
      window.print();
    }, 400);
  };

  const downloadExcelSchedule = () => {
    onSuccess("EXCEL DOSYASI HAZIRLANIYOR...");
    const excelData: any[] = [];
    excelData.push({ "GÜN": schoolConfig.schoolName, "AD SOYAD": "HAFTALIK NÖBET ÇİZELGESİ", "SABAH MEVKİİ": "", "ÖĞLE MEVKİİ": "" });
    excelData.push({}); 
    DAYS_FULL.forEach(day => {
      const dayGuardians = teachers.filter(t => (t.guardDuties || []).some(d => d.day === day));
      if (dayGuardians.length > 0) {
        dayGuardians.forEach((t, idx) => {
          const duty = t.guardDuties!.find(d => d.day === day)!;
          excelData.push({
            "GÜN": idx === 0 ? day.toUpperCase() : "",
            "AD SOYAD": t.name,
            "SABAH MEVKİİ": duty.morningLocation,
            "ÖĞLE MEVKİİ": duty.afternoonLocation
          });
        });
        excelData.push({}); 
      }
    });
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Nöbet Planı");
    worksheet['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
    XLSX.writeFile(workbook, `Nobet_Plani_${schoolConfig.schoolName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('tr-TR')}.xlsx`);
  };

  const executeRemoveDuty = () => {
    if (!dutyToDelete) return;
    const { teacherId, day } = dutyToDelete;
    setTeachers(prev => prev.map(t => t.id === teacherId ? {
      ...t,
      guardDuties: (t.guardDuties || []).filter(d => d.day !== day)
    } : t));
    setDutyToDelete(null);
    onSuccess("GÖREV SİLİNDİ");
  };

  const currentGuardians = useMemo(() => {
    return teachers.filter(t => (t.guardDuties || []).some(d => d.day === activeDay));
  }, [teachers, activeDay]);

  const toggleLocationActive = (idx: number) => {
    if (!editMode) return onWatchModeAttempt();
    const newLocs = [...locations];
    newLocs[idx].isActive = !newLocs[idx].isActive;
    setLocations(newLocs);
  };

  return (
    <div className="flex flex-col h-full space-y-4 animate-slide-up relative px-1">
      
      {/* YAZDIRMA ŞABLONU */}
      <div className="print-layout">
        <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid black', paddingBottom: '10px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>{schoolConfig.schoolName}</h1>
          <h2 style={{ fontSize: '18px', marginTop: '5px' }}>HAFTALIK ÖĞRETMEN NÖBET ÇİZELGESİ</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>GÜN</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>AD SOYAD</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>SABAH MEVKİİ</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>ÖĞLE MEVKİİ</th>
            </tr>
          </thead>
          <tbody>
            {DAYS_FULL.map(day => {
              const dayGuardians = teachers.filter(t => (t.guardDuties || []).some(d => d.day === day));
              if (dayGuardians.length === 0) return null;
              return dayGuardians.map((t, idx) => {
                const duty = t.guardDuties!.find(d => d.day === day)!;
                return (
                  <tr key={`${day}-${t.id}`}>
                    {idx === 0 && <td rowSpan={dayGuardians.length} style={{ border: '1px solid black', padding: '8px', fontWeight: 'bold' }}>{day.toUpperCase()}</td>}
                    <td style={{ border: '1px solid black', padding: '8px' }}>{t.name}</td>
                    <td style={{ border: '1px solid black', padding: '8px' }}>{duty.morningLocation}</td>
                    <td style={{ border: '1px solid black', padding: '8px' }}>{duty.afternoonLocation}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* MEVKİ EDİTÖRÜ MODAL */}
      {isLocationEditorOpen && (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/95 backdrop-blur-md px-4 py-6 overflow-y-auto">
          <div className="bg-[#0d141b] border-t-4 border-[#3b82f6] p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-sm my-auto bg-grid-hatched">
             <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="text-[13px] font-black text-white uppercase tracking-widest">NÖBET MEVKİ EDİTÖRÜ</h3>
                   <span className="text-[8px] font-black text-[#3b82f6] uppercase tracking-[0.2em] mt-1.5 block">MEVKİ YÖNETİM PANELİ</span>
                </div>
                <button onClick={() => { setIsLocationEditorOpen(false); setEditingLocationIdx(null); }} className="w-9 h-9 border border-white/10 text-slate-500 hover:text-white transition-all flex items-center justify-center"><i className="fa-solid fa-xmark text-xl"></i></button>
             </div>

             {/* Yeni Mevki Ekleme */}
             <div className="mb-6 bg-black/40 border border-white/5 p-3 flex gap-2">
                <input 
                    className="flex-1 bg-black border border-white/10 px-3 py-2 text-[11px] font-black text-white uppercase outline-none focus:border-[#3b82f6]"
                    placeholder="YENİ MEVKİ ADI..."
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
                />
                <button 
                    onClick={handleAddLocation}
                    className="px-4 bg-[#3b82f6] text-white font-black text-[10px] uppercase shadow-lg active:scale-95"
                >EKLE</button>
             </div>

             <div className="space-y-1 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                {locations.map((loc, idx) => (
                   <div key={idx} className="bg-black/40 border border-white/5 p-3 flex items-center justify-between group hover:border-[#3b82f6]/40 transition-all">
                      <div className="flex-1 flex flex-col min-w-0 mr-3">
                         {editingLocationIdx === idx ? (
                             <div className="flex gap-1">
                                <input 
                                    autoFocus
                                    className="flex-1 bg-black border border-[#3b82f6] px-2 py-1 text-[11px] font-black text-white uppercase outline-none"
                                    value={editLocationValue}
                                    onChange={(e) => setEditLocationValue(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && saveEditedLocation()}
                                />
                                <button onClick={saveEditedLocation} className="text-green-500 p-1"><i className="fa-solid fa-check"></i></button>
                                <button onClick={() => setEditingLocationIdx(null)} className="text-red-500 p-1"><i className="fa-solid fa-xmark"></i></button>
                             </div>
                         ) : (
                             <>
                                <span className={`text-[11px] font-black uppercase tracking-tight truncate ${loc.isActive ? 'text-white' : 'text-slate-600'}`}>{loc.name}</span>
                                <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{loc.isActive ? 'AKTİF' : 'PASİF'}</span>
                             </>
                         )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {editingLocationIdx !== idx && (
                            <button onClick={() => startEditingLocation(idx)} className="text-slate-600 hover:text-[#3b82f6] p-2 transition-colors"><i className="fa-solid fa-pen text-[10px]"></i></button>
                        )}
                        <button onClick={() => handleDeleteLocation(idx)} className="text-slate-600 hover:text-red-500 p-2 transition-colors"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                        <button 
                            onClick={() => toggleLocationActive(idx)}
                            className={`w-10 h-5 rounded-full border transition-all relative ${loc.isActive ? 'bg-green-600 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-black border-white/10'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-md ${loc.isActive ? 'right-0.5' : 'left-0.5'}`}></div>
                        </button>
                      </div>
                   </div>
                ))}
             </div>
             
             <button onClick={() => setIsLocationEditorOpen(false)} className="mt-8 h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.4em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all border border-white/10">KAYDET VE KAPAT</button>
          </div>
        </div>
      )}

      {/* GÜN SEÇİCİ */}
      <div className="flex gap-1 bg-black/40 border border-white/10 p-1 shrink-0 overflow-x-auto no-scrollbar">
        {DAYS_SHORT.map((day, idx) => (
          <button
            key={day}
            onClick={() => setActiveDayIdx(idx)}
            className={`flex-1 min-w-[50px] h-11 text-[10px] font-black uppercase tracking-[0.1em] transition-all relative ${
              activeDayIdx === idx ? 'bg-[#3b82f6] text-white z-10 shadow-lg' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {day}
            {activeDayIdx === idx && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/60"></div>}
          </button>
        ))}
      </div>

      {/* AKSİYONLAR PANELİ */}
      <div className="flex justify-between items-center px-1 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col min-w-0">
            <h3 className="text-[12px] font-medium text-slate-400 uppercase tracking-tight truncate">{activeDay.toUpperCase()} NÖBETİ</h3>
            <span className="text-[6px] font-medium text-[#3b82f6] uppercase tracking-[0.1em] block mt-0.5 opacity-80">ADALETLİ_PLANLAMA</span>
          </div>
          <button 
             onClick={() => setIsLocationEditorOpen(true)} 
             className="w-9 h-9 bg-[#1e2e3d] border border-white/10 text-white/40 hover:text-[#3b82f6] hover:border-[#3b82f6] transition-all flex items-center justify-center shrink-0 rounded-sm"
             title="Mevki Ayarları"
          >
              <i className="fa-solid fa-gear text-[11px]"></i>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={autoAssignDuties}
            className="h-10 px-4 bg-[#fbbf24] text-black font-black text-[9px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all border border-white/10 shrink-0"
          >
            ADİL DAĞIT
          </button>
          <button 
            onClick={downloadExcelSchedule}
            className="w-10 h-10 bg-green-600 border border-white/10 text-white hover:brightness-110 transition-all flex items-center justify-center shrink-0 rounded-sm"
            title="Excel Olarak İndir"
          >
            <i className="fa-solid fa-file-excel text-[11px]"></i>
          </button>
          <button 
            onClick={downloadDutySchedule}
            className="w-10 h-10 bg-[#1e2e3d] border border-white/10 text-white/40 hover:text-[#fbbf24] hover:border-[#fbbf24] transition-all flex items-center justify-center shrink-0 rounded-sm"
            title="PDF Olarak Kaydet"
          >
            <i className="fa-solid fa-file-pdf text-[11px]"></i>
          </button>
          <button 
            onClick={() => { if(!editMode) onWatchModeAttempt(); else setIsClearWeekModalOpen(true); }}
            className="w-10 h-10 bg-[#1e2e3d] border border-white/10 text-white/40 hover:text-red-500 hover:border-red-500 transition-all flex items-center justify-center shrink-0 rounded-sm"
            title="Tüm Haftalık Planı Sil"
          >
            <i className="fa-solid fa-trash-can text-[11px]"></i>
          </button>
        </div>
      </div>

      {/* LİSTE */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pb-28 pr-1">
        {currentGuardians.length > 0 ? (
          currentGuardians.map(t => {
            const duty = (t.guardDuties || []).find(d => d.day === activeDay)!;
            const load = getTeacherLoadForDay(t.name, activeDay);
            const isHeavy = load / schoolConfig.dailyPeriodCount > 0.8;
            const isCurrentUser = currentUserId && t.id === currentUserId;

            return (
              <div key={t.id} className={`p-3 flex items-center justify-between group relative overflow-hidden h-20 transition-all shadow-xl rounded-sm ${isCurrentUser ? 'bg-[#fbbf24]/5 border-2 border-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.15)] z-10' : 'bg-[#1e293b] border border-white/5 hover:bg-slate-800'}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCurrentUser ? 'bg-[#fbbf24]' : 'bg-[#3b82f6]'}`}></div>
                <div className="flex flex-col flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[11px] font-black uppercase tracking-tighter truncate ${isCurrentUser ? 'text-[#fbbf24]' : 'text-slate-400'}`}>{t.name}</span>
                      <span className={`text-[6px] font-medium uppercase px-1.5 py-0.5 border shrink-0 ${isCurrentUser ? 'text-[#fbbf24] border-[#fbbf24]/20 bg-[#fbbf24]/10' : 'text-[#3b82f6] border-[#3b82f6]/20 bg-[#3b82f6]/10'}`}>{t.branchShort}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex flex-col min-w-0">
                          <span className="text-[5px] font-medium text-slate-600 uppercase tracking-widest mb-0.5 opacity-50">SABAH MEVKİİ</span>
                          <span className={`text-[8px] font-medium px-2 py-0.5 border truncate ${isCurrentUser ? 'text-[#fbbf24] border-[#fbbf24]/20 bg-[#fbbf24]/10' : 'text-slate-500 border-white/5 bg-black/20'}`}>{duty.morningLocation}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                          <span className="text-[5px] font-medium text-slate-600 uppercase tracking-widest mb-0.5 opacity-50">ÖĞLE MEVKİİ</span>
                          <span className={`text-[8px] font-medium px-2 py-0.5 border truncate ${isCurrentUser ? 'text-[#fbbf24] border-[#fbbf24]/20 bg-[#fbbf24]/10' : 'text-slate-500 border-white/5 bg-black/20'}`}>{duty.afternoonLocation}</span>
                      </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 border-l border-white/5 pl-3">
                    <div className="text-right flex flex-col items-end whitespace-nowrap">
                      <span className={`text-[11px] font-black leading-none ${isHeavy ? 'text-red-500' : 'text-slate-500'}`}>{load}s</span>
                      <span className="text-[5px] font-medium text-slate-600 uppercase block tracking-tighter mt-1 opacity-40">YÜK</span>
                    </div>
                    {editMode && (
                      <button onClick={() => setDutyToDelete({ teacherId: t.id, teacherName: t.name, day: activeDay })} className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-red-500 transition-all">
                        <i className="fa-solid fa-xmark text-xs"></i>
                      </button>
                    )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-20 border-2 border-dashed border-[#354a5f] bg-black/20 flex flex-col items-center justify-center group opacity-30">
             <i className="fa-solid fa-shield-halved text-2xl text-slate-700 mb-6"></i>
             <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-600 mb-2">GÖREVLENDİRME YOK</p>
          </div>
        )}
      </div>

      {/* ALT BİLGİ BARI */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] z-[100] flex items-center gap-2">
         <div className="flex-1 h-14 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-[#3b82f6]/30 px-5 flex items-center justify-between shadow-2xl relative overflow-hidden rounded-sm">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3b82f6]"></div>
            <div className="flex items-center gap-4 min-w-0">
               <i className="fa-solid fa-scale-balanced text-[#3b82f6] text-sm shrink-0"></i>
               <div className="flex flex-col min-w-0">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.1em] leading-none truncate">NÖBET_ADALET_DNA</p>
                  <p className="text-[6px] font-medium text-slate-700 uppercase tracking-tighter mt-1.5 truncate">TEKİL GÖREVLENDİRME AKTİF</p>
               </div>
            </div>
         </div>
      </div>

      {/* HAFTAYI TEMİZLE ONAY MODAL */}
      {isClearWeekModalOpen && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 bg-red-600/20 border border-red-600 flex items-center justify-center">
                    <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
                 </div>
                 <h3 className="text-[13px] font-black text-white uppercase tracking-widest">DNA SIFIRLA</h3>
              </div>
              <p className="text-[11px] font-medium text-slate-300 uppercase leading-relaxed mb-8">
                 DİKKAT: TÜM HAFTANIN NÖBET PLANI <span className="text-red-500 font-black">TAMAMEN</span> SİLİNECEKTİR.
              </p>
              <div className="flex gap-4">
                 <button onClick={() => setIsClearWeekModalOpen(false)} className="flex-1 h-12 border border-[#64748b] text-white font-black text-[10px] uppercase">VAZGEÇ</button>
                 <button onClick={executeClearAll} className="flex-1 bg-red-600 text-white font-black text-[10px] uppercase shadow-xl">PLANI SİL</button>
              </div>
           </div>
        </div>
      )}

      {/* TEKLİ GÖREV SİLME ONAY MODAL */}
      {dutyToDelete && (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/95 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-[14px] font-black text-white uppercase tracking-widest mb-4">GÖREV SİL</h3>
              <p className="text-[11px] font-medium text-slate-300 uppercase leading-relaxed mb-8">
                 BU PERSONELİN NÖBET KAYDI SİLİNECEKTİR: <br/>
                 <span className="text-red-500 text-lg block mt-2 font-black">{dutyToDelete.teacherName}</span>
              </p>
              <div className="flex gap-4">
                 <button onClick={() => setDutyToDelete(null)} className="flex-1 h-12 border border-[#64748b] text-white font-black text-[10px] uppercase">İPTAL</button>
                 <button onClick={executeRemoveDuty} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase">SİL</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GuardDutyModule;
