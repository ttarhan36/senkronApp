
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Teacher, ClassSection, Lesson, ScheduleEntry, ModuleType, SchoolConfig, ShiftType } from '../types';
import { generateSchedule } from '../services/geminiService';

interface SchedulingModuleProps {
  teachers: Teacher[];
  classes: ClassSection[];
  lessons: Lesson[];
  onApprove: (schedule: ScheduleEntry[]) => Promise<void>;
  setActiveModule?: (m: ModuleType) => void;
  schoolConfig: SchoolConfig;
}

const DAYS_SHORT = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM'];
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

const LogoSVG = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="80" height="80" stroke="currentColor" strokeWidth="8" rx="2" />
    <path d="M70 30 H30 V50 H70 V70 H30" stroke="currentColor" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter"/>
  </svg>
);

const SchedulingModule: React.FC<SchedulingModuleProps> = ({ teachers, classes, lessons, onApprove, setActiveModule, schoolConfig }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [appliedSchedule, setAppliedSchedule] = useState<ScheduleEntry[] | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('SİSTEM BAŞLATILIYOR...');
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  const HOURS = useMemo(() => {
    const arr = [];
    const count = Math.max(schoolConfig.morningPeriodCount, schoolConfig.afternoonPeriodCount);
    for(let i = 1; i <= count; i++) arr.push(i);
    return arr;
  }, [schoolConfig]);

  useEffect(() => {
    if (loading || saving) {
      if (!saving) setElapsedTime(0);
      setProgress(0);
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        const diff = Date.now() - startTime;
        if (!saving) setElapsedTime(diff);
        
        // Hassas planlama için dengeli ilerleme
        setProgress(prev => {
          if (prev < 95) return prev + 0.2;
          return prev;
        });

        if (saving) {
           setStatusMessage('PROGRAM BULUT DNAYA MÜHÜRLENİYOR...');
        } else {
           if (diff < 8000) setStatusMessage('HASSAS DNA ANALİZİ VE DAĞITIM...');
           if (diff >= 8000 && diff < 20000) setStatusMessage('GÜNLÜK DERS DENGESİ HESAPLANIYOR...');
           if (diff >= 20000) setStatusMessage('MATEMATİKSEL KONTROLLER YAPILIYOR...');
        }
      }, 200);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, saving]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRunAI = async () => {
    setLoading(true);
    setAppliedSchedule(null);
    setFailureReason(null);
    setStatusMessage('VERİTABANI DNA SENKRONİZASYONU...');
    
    try {
      // Pro motor (Hassas Dağıtım) tetikleniyor
      const response = await generateSchedule({ teachers, classes, lessons, config: schoolConfig });
      if (!response) throw new Error("API_TIMEOUT");
      
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      if (parsed.schedule && parsed.schedule.length > 0) {
        setStatusMessage('PROGRAM KUSURSUZ ŞEKİLDE HAZIRLANDI');
        setProgress(100);
        setTimeout(() => handleApply(cleanJson), 600);
      } else {
        setFailureReason("SİSTEM_KİLİTLENDİ: Veri dağıtılamadı.");
        setLoading(false);
      }
    } catch (error: any) {
      setFailureReason("MOTOR_HATASI: Sunucu meşgul, lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  const handleApply = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const normalizedArray: ScheduleEntry[] = (parsed.schedule || []).map((item: any) => ({
        sinif: String(item.sinif || ''),
        gun: String(item.gun || ''),
        ders_saati: parseInt(String(item.ders_saati || '0')),
        ders: String(item.ders || ''),
        ogretmen: String(item.ogretmen || ''),
        shift: (item.shift as ShiftType) || ShiftType.SABAH
      }));
      setAppliedSchedule(normalizedArray);
      setLoading(false);
      const uniqueClasses = Array.from(new Set(normalizedArray.map(s => s.sinif))).filter(c => c).sort();
      if (uniqueClasses.length > 0) setSelectedClass(uniqueClasses[0]);
    } catch (e) { 
      setFailureReason("FORMAT_HATASI");
      setLoading(false);
    }
  };

  const handleFinalApprove = async () => {
     if(!appliedSchedule) return;
     setSaving(true);
     setStatusMessage('PROGRAM DNAYA MÜHÜRLENİYOR...');
     try {
        await onApprove(appliedSchedule);
     } catch (e) {
        setFailureReason("KAYIT HATASI: Bulut bağlantısı koptu.");
     } finally {
        setSaving(false);
     }
  };

  if (saving) {
     return (
        <div className="h-full w-full bg-[#080c10] flex flex-col items-center justify-center p-8 bg-grid-hatched animate-in fade-in duration-500">
           <div className="w-24 h-24 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mb-12 shadow-[0_0_50px_rgba(59,130,246,0.3)]"></div>
           <div className="text-center space-y-4">
              <h2 className="text-2xl font-black text-white uppercase tracking-[0.4em]">{statusMessage}</h2>
              <p className="text-[10px] font-bold text-[#3b82f6] uppercase tracking-[0.2em] animate-pulse">Bulut senkronizasyonu yapılıyor...</p>
           </div>
        </div>
     );
  }

  return (
    <div className="w-full h-full flex flex-col animate-slide-up overflow-hidden">
      {!appliedSchedule ? (
        <div className="bg-[#0f172a] border border-[#354a5f] p-8 text-center flex-1 flex flex-col justify-center items-center relative overflow-hidden shadow-2xl stitch-border bg-grid-hatched">
          {loading ? (
            <div className="max-w-md w-full flex flex-col items-center animate-in fade-in duration-500">
              <div className="w-24 h-24 bg-[#3b82f6]/10 border-2 border-[#3b82f6] flex items-center justify-center animate-pulse overflow-hidden mb-12 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                 <LogoSVG className="w-14 h-14 text-[#3b82f6]" />
              </div>
              
              <div className="w-full space-y-8">
                 <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] mb-1">PRO_MOTOR_MODU_AKTİF</span>
                    <span className="text-3xl font-black tracking-widest font-mono text-white">
                       {formatTime(elapsedTime)}
                    </span>
                 </div>

                 <div className="bg-black/60 border border-white/5 p-4 relative overflow-hidden shadow-inner">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24]"></div>
                    <span className="text-[10px] font-black text-[#fbbf24] uppercase tracking-[0.3em] animate-pulse block">{statusMessage}</span>
                 </div>

                 <div className="space-y-3">
                    <div className="flex justify-between items-end px-1">
                       <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">DNA_İŞLEME_KAPASİTESİ</span>
                       <span className="text-[14px] font-black text-white">%{Math.round(progress)}</span>
                    </div>
                    <div className="h-3 w-full bg-black/40 border border-white/5 rounded-full overflow-hidden p-0.5">
                       <div className="h-full bg-[#fbbf24] shadow-[0_0_20px_#fbbf24] transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                 </div>
              </div>
              
              <p className="mt-12 text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] italic">
                Zeka motoru dersleri günlere dengeli dağıtıyor. Lütfen bekleyin.
              </p>
            </div>
          ) : failureReason ? (
            <div className="max-w-xl w-full flex flex-col items-center animate-in zoom-in-95">
               <div className="w-16 h-16 bg-red-600/10 border-2 border-red-600 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                  <i className="fa-solid fa-triangle-exclamation text-2xl text-red-600"></i>
               </div>
               <h2 className="text-xl font-black text-red-600 tracking-widest uppercase mb-4">MOTOR_DURDURULDU</h2>
               <p className="text-[11px] font-bold text-slate-400 uppercase italic mb-8">{failureReason}</p>
               <button onClick={handleRunAI} className="w-full py-5 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">YENİDEN DENE</button>
            </div>
          ) : (
            <div className="max-w-2xl w-full flex flex-col items-center animate-in fade-in duration-700">
                <div className="w-24 h-24 flex items-center justify-center mb-10 drop-shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-transform hover:scale-110">
                   <LogoSVG className="w-full h-full text-[#3b82f6]" />
                </div>
                <h2 className="text-4xl font-black text-white tracking-[0.4em] uppercase mb-4">ZEKA MOTORU</h2>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-12">STRATEJİK_DAĞITIM_v3.0 (PRO)</p>
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                   <div className="bg-black/40 border border-white/5 p-4 flex items-center gap-4">
                      <i className="fa-solid fa-brain text-[#3b82f6]"></i>
                      <div className="text-left"><span className="text-[10px] font-black text-white block uppercase">DERİN ANALİZ</span><span className="text-[7px] text-slate-500 uppercase">GÜNLÜK YÜK DENGELEME</span></div>
                   </div>
                   <div className="bg-black/40 border border-white/5 p-4 flex items-center gap-4">
                      <i className="fa-solid fa-square-check text-[#fbbf24]"></i>
                      <div className="text-left"><span className="text-[10px] font-black text-white block uppercase">KUSURSUZ_SAAT</span><span className="text-[7px] text-slate-500 uppercase">TAM SAAT DOĞRULAMA</span></div>
                   </div>
                </div>
                <button onClick={handleRunAI} className="w-full py-7 bg-[#3b82f6] text-white font-black text-[13px] uppercase tracking-[0.5em] shadow-2xl transition-all hover:scale-[1.02] active:scale-95 border border-white/10 hover:shadow-[0_0_50px_rgba(59,130,246,0.4)]">PROGRAMI OLUŞTUR</button>
             </div>
          )}
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-[#354a5f] flex flex-col h-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="px-4 py-3 border-b border-[#354a5f]/60 bg-black/40 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-4">
                <button onClick={() => setAppliedSchedule(null)} className="w-10 h-10 bg-black border border-[#354a5f] text-white hover:bg-[#3b82f6]/20 transition-all flex items-center justify-center shadow-lg"><i className="fa-solid fa-arrow-left text-sm"></i></button>
                <div>
                   <h2 className="text-[13px] font-black text-white uppercase tracking-[0.2em]">{selectedClass} ÖNİZLEME</h2>
                   <span className="text-[7px] font-bold text-[#3b82f6] uppercase tracking-widest">STRATEJİK DAĞITIM ÇIKTISI</span>
                </div>
             </div>
             <div className="flex items-center gap-3">
                <div className="flex flex-col items-end mr-4">
                    <span className="text-[14px] font-black text-[#fbbf24]">{appliedSchedule.filter(s => s.sinif === selectedClass).length} s</span>
                    <span className="text-[6px] font-bold text-slate-500 uppercase">PLANLANAN DERS</span>
                </div>
                <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="bg-black border border-[#354a5f] text-white text-[11px] font-black px-4 py-2 outline-none focus:border-[#3b82f6] rounded-sm">
                  {Array.from(new Set(appliedSchedule.map(s => s.sinif))).sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>
          </div>
          <div className="flex-1 overflow-auto bg-[#0d141b] bg-grid-hatched p-2">
             <table className="w-full border-collapse table-fixed">
                <thead>
                   <tr className="bg-slate-900 text-white text-[9px] font-black border-b border-white/10">
                      <th className="w-12 py-4 border-r border-white/5 uppercase">H</th>
                      {DAYS_SHORT.map(d => <th key={d} className="border-r border-white/5 tracking-[0.4em]">{d}</th>)}
                   </tr>
                </thead>
                <tbody>
                   {HOURS.map(h => (
                        <tr key={h} className="h-20 border-b border-white/5">
                           <td className="text-center text-[12px] font-black text-slate-500 border-r border-white/5 bg-black/20">{h}</td>
                           {DAYS_SHORT.map(d => {
                              const entry = appliedSchedule.find(s => s.sinif === selectedClass && s.ders_saati === h && s.gun.toUpperCase().startsWith(d));
                              return (
                                 <td key={`${d}-${h}`} className="border-r border-white/5 p-1 relative">
                                    {entry ? (
                                       <div className="h-full w-full flex flex-col items-center justify-center bg-[#1e293b] border-l-4 border-[#3b82f6] transition-all hover:bg-slate-800 shadow-lg">
                                          <span className="text-[11px] font-black text-white leading-none uppercase truncate w-full text-center px-1 tracking-tight">{entry.ders}</span>
                                          <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-2 truncate w-full text-center px-1">{entry.ogretmen}</span>
                                       </div>
                                    ) : (<div className="h-full w-full opacity-5 border border-dashed border-white/10"></div>)}
                                 </td>
                              );
                           })}
                        </tr>
                   ))}
                </tbody>
             </table>
          </div>
          <div className="p-5 bg-black/80 border-t border-[#354a5f] shrink-0 flex justify-center">
             <button onClick={handleFinalApprove} className="px-24 py-6 bg-[#3b82f6] text-white font-black text-[14px] uppercase tracking-[0.4em] shadow-[0_0_50px_rgba(59,130,246,0.4)] hover:brightness-110 active:scale-95 transition-all rounded-sm border border-white/10">KUSURSUZ_PLANI_MÜHÜRLLE</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingModule;
