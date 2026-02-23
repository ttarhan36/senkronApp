
import React, { useState, useRef, useEffect } from 'react';
import { SchoolConfig, Teacher, ShiftType, ThemeConfig, Student, Gender, ClassSection, ImportLog, Lesson, Announcement, Course, ScheduleEntry } from '../types';
import * as XLSX from 'xlsx';
import { guessGenderFromName, standardizeBranchCode, parseGradeFromName, standardizeForMatch } from '../utils';
import { supabase } from '../services/supabaseClient';

interface SettingsModuleProps {
  config: SchoolConfig;
  setConfig: (c: SchoolConfig) => void;
  theme: ThemeConfig;
  setTheme: (t: ThemeConfig) => void;
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  lessons: Lesson[];
  setLessons: (l: Lesson[]) => void;
  classes: ClassSection[];
  setClasses: (c: ClassSection[]) => void;
  announcements: Announcement[];
  setAnnouncements: (a: Announcement[]) => void;
  courses: Course[];
  setCourses: (c: Course[]) => void;
  schedule: ScheduleEntry[];
  setSchedule: (s: ScheduleEntry[]) => void;
  onImportData?: (students: Student[], subeMap: Record<string, string>, shiftMap: Record<string, ShiftType>) => void;
  onRestoreDNA: (payload: any) => Promise<void>;
  onClearAll: () => void;
  onSuccess: (msg?: string) => void;
}

const SettingsModule: React.FC<SettingsModuleProps> = ({
  config, setConfig, theme, setTheme, teachers, setTeachers, lessons, setLessons, classes, setClasses,
  announcements, setAnnouncements, courses, setCourses, schedule, setSchedule,
  onImportData, onRestoreDNA, onClearAll, onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'GENEL' | 'KAYNAK' | 'YEDEK'>('GENEL');
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [importType, setImportType] = useState<'STUDENT' | 'TEACHER' | 'LESSON' | null>(null);
  const [detectedSubeMap, setDetectedSubeMap] = useState<Record<string, string>>({});
  const [detectedShiftMap, setDetectedShiftMap] = useState<Record<string, ShiftType>>({});

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isClearScheduleModalOpen, setIsClearScheduleModalOpen] = useState(false); // Sadece program silme
  const [resetStep, setResetStep] = useState<'IDLE' | 'WARNING' | 'PROCESSING' | 'FINAL'>('IDLE');
  const [resetProgress, setResetProgress] = useState(0);

  const studentFileRef = useRef<HTMLInputElement>(null);
  const teacherFileRef = useRef<HTMLInputElement>(null);
  const lessonFileRef = useRef<HTMLInputElement>(null);
  const dnaRestoreRef = useRef<HTMLInputElement>(null);

  // ... (Existing excel handlers remain unchanged) ...
  const handleProcessStudentsExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const subeMap: Record<string, string> = {};
        const shiftMap: Record<string, ShiftType> = {};
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length < 3) continue;
          const name = String(row[1] || row[0] || '').trim();
          const num = String(row[2] || '').trim();
          const sube = String(row[3] || '9-A').trim().toUpperCase();
          const genderStr = String(row[4] || '').trim().toUpperCase();
          if (!name || !num) continue;
          
          const id = `S-IMP-${num}-${Date.now()}`;
          let gender = (genderStr.includes('KIZ') || genderStr === 'K') ? Gender.FEMALE : (genderStr.includes('ERKEK') || genderStr === 'E') ? Gender.MALE : guessGenderFromName(name);
          
          const autoCreds = {
             username: num,
             password: num
          };

          imported.push({ 
              id, 
              number: num, 
              name: name.toUpperCase(), 
              gender, 
              grades: [], 
              attendanceCount: 0, 
              attendanceHistory: [], 
              observations: [], 
              gpa: 0, 
              targetClass: sube,
              ...autoCreds 
          });
          subeMap[id] = sube;
          shiftMap[id] = (sube.startsWith('9') || sube.startsWith('10')) ? ShiftType.OGLE : ShiftType.SABAH;
        }
        
        if (imported.length > 0) {
          setImportType('STUDENT'); 
          setPreviewData(imported); 
          setDetectedSubeMap(subeMap); 
          setDetectedShiftMap(shiftMap);
          onSuccess("ÖĞRENCİ_DNA_ÖNİZLEME (ŞİFRE=NO)");
        }
      } catch (err) { onSuccess("HATA: ÖĞRENCİ LİSTESİ OKUNAMADI"); }
      finally { if (studentFileRef.current) studentFileRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  const handleProcessTeachersExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const imported: Teacher[] = [];
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length < 2) continue;
          const name = String(row[1] || row[0] || '').trim();
          const branchRaw = String(row[2] || 'GENEL').trim();
          const shiftStr = String(row[3] || 'SABAH').trim().toLowerCase();
          const hours = parseInt(String(row[4] || '22'));
          if (!name) continue;
          
          const branchCode = standardizeBranchCode(branchRaw);
          
          const cleanName = standardizeForMatch(name).replace(/\s+/g, '');
          const username = cleanName.length > 8 ? cleanName.substring(0, 8) : cleanName;

          imported.push({ 
            id: `T-IMP-${i}-${Date.now()}`, 
            name: name.toUpperCase(), 
            gender: guessGenderFromName(name), 
            branch: branchCode, 
            branchShort: branchCode, 
            branchShorts: [branchCode], 
            lessonCount: isNaN(hours) ? 22 : hours, 
            preferredShift: shiftStr.includes('öğle') ? ShiftType.OGLE : ShiftType.SABAH, 
            availableDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'], 
            guardDutyDays: [],
            username: username,
            password: '123456' 
          });
        }
        setImportType('TEACHER'); 
        setPreviewData(imported); 
        onSuccess("KADRO_DNA_ÖNİZLEME (ŞİFRE=123456)");
      } catch (err) { onSuccess("HATA: HOCALAR OKUNAMADI"); }
      finally { if (teacherFileRef.current) teacherFileRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  const handleProcessLessonsExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const imported: Lesson[] = [];
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length < 2) continue;
          
          let rawName = '';
          let grade = 9;
          let code = '';
          let hours = 2;

          const isFirstColNumeric = !isNaN(Number(row[0])) && row[0] !== '' && String(row[0]).length < 4;
          
          if (isFirstColNumeric && row.length >= 4) {
             grade = parseInt(String(row[1] || '9'));
             rawName = String(row[2] || '').trim();
             code = String(row[3] || rawName).trim();
             hours = parseInt(String(row[4] || '2'));
          } else {
             rawName = String(row[0] || '').trim();
             grade = parseInt(String(row[1] || '9'));
             code = String(row[2] || rawName).trim();
             hours = parseInt(String(row[3] || '2'));
          }
          
          if (!rawName || rawName === '') continue;
          
          const fullName = !isNaN(grade) ? `${rawName.toUpperCase()} ${grade}` : rawName.toUpperCase();
          
          imported.push({ 
            id: `L-IMP-${i}-${Date.now()}`, 
            name: fullName,
            hours: isNaN(hours) ? 2 : hours, 
            branch: standardizeBranchCode(code) 
          });
        }
        
        if (imported.length > 0) {
          setImportType('LESSON'); 
          setPreviewData(imported); 
          onSuccess("MÜFREDAT_DNA_ÖNİZLEME_HAZIR");
        }
      } catch (err) { onSuccess("HATA: DERSLER OKUNAMADI"); }
      finally { if (lessonFileRef.current) lessonFileRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  const finalizeExcelImport = () => {
    if (!previewData || !importType) return;
    if (importType === 'STUDENT' && onImportData) {
      onImportData(previewData, detectedSubeMap, detectedShiftMap);
    } else if (importType === 'TEACHER') {
      setTeachers([...teachers, ...previewData]);
    } else if (importType === 'LESSON') {
      setLessons([...lessons, ...previewData]);
    }
    setPreviewData(null); 
    setImportType(null);
    onSuccess("VERİLER_DNAYA_NAKŞEDİLDİ");
  };

  const handleExportDNA = () => {
    const fullDNA = {
      version: "2.5.0",
      exportDate: new Date().toISOString(),
      schoolName: config.schoolName,
      payload: {
        config,
        teachers,
        lessons,
        classes,
        announcements,
        courses,
        schedule
      }
    };

    const blob = new Blob([JSON.stringify(fullDNA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DNA_YEDEK_${config.schoolName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('tr-TR')}.json`;
    link.click();
    onSuccess("OKUL_DNA_PAKETLENDİ_VE_İNDİRİLDİ");
  };

  const handleImportDNA = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      alert("Hata: Dosya okunamadı.");
      if (dnaRestoreRef.current) dnaRestoreRef.current.value = '';
    };
    
    reader.onload = async (evt) => {
      try {
        const rawContent = evt.target?.result as string;
        const sanitizedContent = rawContent.replace(/^\uFEFF/, "");
        const json = JSON.parse(sanitizedContent);
        
        if (!json.payload || !json.payload.config) {
           throw new Error("Yedek dosyası geçersiz veya bozuk.");
        }

        const confirmRestore = window.confirm("DİKKAT: Bu işlem bulut üzerindeki TÜM okul verilerini kalıcı olarak silip yedektekileri yükleyecektir. Bu işlem geri alınamaz. Onaylıyor musunuz?");
        if (!confirmRestore) {
           if (dnaRestoreRef.current) dnaRestoreRef.current.value = '';
           return;
        }

        await onRestoreDNA(json.payload);
        onSuccess("DNA RESTORASYONU TAMAMLANDI");
      } catch (err: any) {
        console.error("Restorasyon Hatası:", err);
        alert(`Restorasyon Hatası: ${err.message || 'Geçersiz JSON dosyası'}`);
      } finally {
        if (dnaRestoreRef.current) dnaRestoreRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfigChange = (key: keyof SchoolConfig, value: any) => {
    const updatedConfig = { ...config, [key]: value };
    if (key === 'morningPeriodCount' || key === 'afternoonPeriodCount') {
      updatedConfig.dailyPeriodCount = Math.max(
        parseInt(String(updatedConfig.morningPeriodCount)) || 0, 
        parseInt(String(updatedConfig.afternoonPeriodCount)) || 0
      );
    }
    setConfig(updatedConfig);
  };

  const startHardReset = () => {
    setResetStep('PROCESSING');
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          onClearAll();
          setResetStep('FINAL');
          setTimeout(() => {
            setIsResetModalOpen(false);
            setResetStep('IDLE');
            setResetProgress(0);
            setActiveTab('GENEL');
          }, 1000);
        }, 500);
      }
      setResetProgress(progress);
    }, 100);
  };

  const executeClearSchedule = async () => {
    try {
        const { data: user } = await supabase.auth.getUser();
        const sid = user.user?.user_metadata?.school_id;
        
        if (sid) {
            const { error } = await supabase.from('schedule').delete().eq('school_id', sid);
            if (error) throw error;
        }
        
        setSchedule([]);
        setIsClearScheduleModalOpen(false);
        onSuccess("TÜM DERS PROGRAMI SİLİNDİ");
    } catch (err) {
        console.error("Schedule Clear Error", err);
        onSuccess("PROGRAM SİLİNİRKEN HATA OLUŞTU");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden px-1">
      <div className="flex bg-[#0d141b] border border-white/5 p-1 shrink-0 rounded-sm mb-1 shadow-xl">
        <button onClick={() => setActiveTab('GENEL')} className={`flex-1 h-9 text-[9px] font-black tracking-[0.2em] transition-all ${activeTab === 'GENEL' ? 'bg-yellow-400 text-black' : 'text-slate-500 hover:text-white'}`}>İZLEME</button>
        <button onClick={() => setActiveTab('KAYNAK')} className={`flex-1 h-9 text-[9px] font-black tracking-[0.2em] transition-all ${activeTab === 'KAYNAK' ? 'bg-[#334155] text-white' : 'text-slate-500 hover:text-white'}`}>DATA_IMPORT</button>
        <button onClick={() => setActiveTab('YEDEK')} className={`flex-1 h-9 text-[9px] font-black tracking-[0.2em] transition-all ${activeTab === 'YEDEK' ? 'bg-[#3b82f6] text-white' : 'text-slate-500 hover:text-white'}`}>YEDEKLEME</button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'GENEL' && (
          <div className="h-full flex flex-col animate-in slide-in-from-bottom-2">
            <div className="flex-1 bg-[#0f172a] border border-white/5 p-4 flex flex-col relative overflow-hidden rounded-sm bg-grid-hatched overflow-y-auto no-scrollbar">
               <div className="flex bg-black/40 border border-white/5 p-1 h-12 mb-8 shrink-0">
                  <button onClick={() => handleConfigChange('isDualShift', false)} className={`flex-1 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${!config.isDualShift ? 'bg-white/10 text-white' : 'text-slate-700'}`}>TEKLİ</button>
                  <button onClick={() => handleConfigChange('isDualShift', true)} className={`flex-1 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${config.isDualShift ? 'bg-[#3b82f6] text-white' : 'text-slate-700'}`}>İKİLİ_EĞİTİM</button>
               </div>

               {/* ... (Time settings and lunch break config - same as before) ... */}
               <div className="grid grid-cols-2 gap-8 items-start mb-10">
                  <div className="flex flex-col items-center space-y-4">
                     <span className="text-[11px] font-black text-[#3b82f6] tracking-[0.4em] uppercase">SABAH</span>
                     <div className="flex items-center gap-3">
                        <button onClick={() => handleConfigChange('morningPeriodCount', Math.max(1, (parseInt(String(config.morningPeriodCount)) || 0) - 1))} className="w-10 h-10 border border-[#3b82f6]/20 bg-[#3b82f6]/5 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white flex items-center justify-center rounded-sm transition-all"><i className="fa-solid fa-minus"></i></button>
                        <div className="flex flex-col items-center">
                           <span className="text-[64px] font-black text-[#3b82f6] leading-none">{config.morningPeriodCount || 0}</span>
                           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">PERİYOT</span>
                        </div>
                        <button onClick={() => handleConfigChange('morningPeriodCount', (parseInt(String(config.morningPeriodCount)) || 0) + 1)} className="w-10 h-10 border border-[#3b82f6]/20 bg-[#3b82f6]/5 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white flex items-center justify-center rounded-sm transition-all"><i className="fa-solid fa-plus"></i></button>
                     </div>
                     <input type="text" className="w-24 bg-black border border-white/10 p-2 text-center text-[18px] font-black text-[#3b82f6] outline-none" value={config.morningStartTime} onChange={(e) => handleConfigChange('morningStartTime', e.target.value)} />
                  </div>

                  <div className={`flex flex-col items-center space-y-4 transition-all ${!config.isDualShift ? 'opacity-10 grayscale pointer-events-none' : ''}`}>
                     <span className="text-[11px] font-black text-[#fbbf24] tracking-[0.4em] uppercase">ÖĞLE</span>
                     <div className="flex items-center gap-3">
                        <button onClick={() => handleConfigChange('afternoonPeriodCount', Math.max(1, (parseInt(String(config.afternoonPeriodCount)) || 0) - 1))} className="w-10 h-10 border border-[#fbbf24]/20 bg-[#fbbf24]/5 text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black flex items-center justify-center rounded-sm transition-all"><i className="fa-solid fa-minus"></i></button>
                        <div className="flex flex-col items-center">
                           <span className="text-[64px] font-black text-[#fbbf24] leading-none">{config.afternoonPeriodCount || 0}</span>
                           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">PERİYOT</span>
                        </div>
                        <button onClick={() => handleConfigChange('afternoonPeriodCount', (parseInt(String(config.afternoonPeriodCount)) || 0) + 1)} className="w-10 h-10 border border-[#fbbf24]/20 bg-[#fbbf24]/5 text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black flex items-center justify-center rounded-sm transition-all"><i className="fa-solid fa-plus"></i></button>
                     </div>
                     <input type="text" className="w-24 bg-black border border-white/10 p-2 text-center text-[18px] font-black text-[#fbbf24] outline-none" value={config.afternoonStartTime} onChange={(e) => handleConfigChange('afternoonStartTime', e.target.value)} />
                  </div>
               </div>

               {!config.isDualShift && (
                 <div className="mb-10 bg-black/40 border border-[#fbbf24]/30 p-5 rounded-sm animate-in zoom-in-95">
                    <div className="flex items-center gap-3 mb-6">
                       <i className="fa-solid fa-utensils text-[#fbbf24] text-lg"></i>
                       <h3 className="text-[11px] font-black text-white uppercase tracking-widest">ÖĞLE ARASI YAPILANDIRMASI</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ARADAN ÖNCEKİ DERS SAYISI</label>
                          <div className="flex items-center gap-3 bg-black border border-white/10 p-1">
                             <button onClick={() => handleConfigChange('lunchBreakAfter', Math.max(1, (config.lunchBreakAfter || 4) - 1))} className="w-10 h-10 flex items-center justify-center text-[#fbbf24]"><i className="fa-solid fa-minus"></i></button>
                             <span className="flex-1 text-center text-xl font-black text-white">{config.lunchBreakAfter || 4}</span>
                             <button onClick={() => handleConfigChange('lunchBreakAfter', Math.min(config.morningPeriodCount - 1, (config.lunchBreakAfter || 4) + 1))} className="w-10 h-10 flex items-center justify-center text-[#fbbf24]"><i className="fa-solid fa-plus"></i></button>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                             <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">BAŞLANGIÇ</label>
                             <input 
                               type="text" 
                               placeholder="12:30"
                               className="w-full bg-black border border-white/10 p-3 text-[14px] font-black text-[#fbbf24] text-center outline-none focus:border-[#fbbf24]" 
                               value={config.lunchBreakStart || ''} 
                               onChange={(e) => handleConfigChange('lunchBreakStart', e.target.value)} 
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">BİTİŞ</label>
                             <input 
                               type="text" 
                               placeholder="13:30"
                               className="w-full bg-black border border-white/10 p-3 text-[14px] font-black text-[#fbbf24] text-center outline-none focus:border-[#fbbf24]" 
                               value={config.lunchBreakEnd || ''} 
                               onChange={(e) => handleConfigChange('lunchBreakEnd', e.target.value)} 
                             />
                          </div>
                       </div>
                    </div>
                 </div>
               )}

               <div className="mt-auto space-y-5 pt-6 border-t border-white/5">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">DERS DK.</label>
                        <input type="number" className="w-full bg-black border border-white/10 p-3 text-[14px] font-black text-white text-center outline-none focus:border-[#3b82f6]" value={config.lessonDuration} onChange={(e) => handleConfigChange('lessonDuration', parseInt(e.target.value) || 0)} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">TENEFÜS DK.</label>
                        <input type="number" className="w-full bg-black border border-white/10 p-3 text-[14px] font-black text-white text-center outline-none focus:border-[#3b82f6]" value={config.breakDuration} onChange={(e) => handleConfigChange('breakDuration', parseInt(e.target.value) || 0)} />
                     </div>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">OKUL ADI</label>
                     <input type="text" className="w-full h-12 bg-black border border-white/10 px-4 text-[13px] font-black text-white uppercase outline-none focus:border-[#3b82f6]" value={config.schoolName} onChange={(e) => handleConfigChange('schoolName', e.target.value.toUpperCase())} />
                  </div>
                  <div className="flex gap-2">
                     <button onClick={() => setIsResetModalOpen(true)} className="w-12 h-14 bg-red-600/20 border border-red-600/40 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-lg" title="Fabrika Ayarlarına Dön"><i className="fa-solid fa-trash-can text-xl"></i></button>
                     <button onClick={() => setIsClearScheduleModalOpen(true)} className="w-12 h-14 bg-orange-600/20 border border-orange-600/40 text-orange-500 flex items-center justify-center hover:bg-orange-600 hover:text-white transition-all shadow-lg" title="Sadece Ders Programını Sil"><i className="fa-solid fa-calendar-xmark text-xl"></i></button>
                     <button onClick={() => onSuccess("DNA_AYARLARI_MÜHÜRLENDİ")} className="flex-1 h-14 bg-[#3b82f6] text-white font-black text-[12px] uppercase tracking-[0.4em] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all">DNAYI_MÜHÜRLLE</button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* ... (Other tabs: KAYNAK, YEDEK remain same) ... */}
        {activeTab === 'KAYNAK' && (
           <div className="h-full flex flex-col space-y-3 animate-in slide-in-from-bottom-2">
              <div className="bg-[#1e293b]/60 border border-white/10 p-4 shadow-xl rounded-sm bg-grid-hatched">
                 <div className="flex items-center gap-3 mb-4"><i className="fa-solid fa-cloud-arrow-up text-[#fbbf24] text-lg"></i><h3 className="text-[12px] font-black text-white uppercase tracking-widest">AKILLI_AKTARIM_KONSOLU</h3></div>
                 <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => studentFileRef.current?.click()} className="h-12 bg-green-600/10 border border-green-600/40 text-green-500 font-black text-[9px] uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all flex items-center gap-4 px-4"><i className="fa-solid fa-graduation-cap"></i> ÖĞRENCİ_AKTAR</button>
                    <input ref={studentFileRef} type="file" className="hidden" accept=".xlsx" onChange={handleProcessStudentsExcel} />
                    
                    <button onClick={() => teacherFileRef.current?.click()} className="h-12 bg-[#3b82f6]/10 border border-[#3b82f6]/40 text-[#3b82f6] font-black text-[9px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all flex items-center gap-4 px-4"><i className="fa-solid fa-user-tie"></i> KADRO_AKTAR</button>
                    <input ref={teacherFileRef} type="file" className="hidden" accept=".xlsx" onChange={handleProcessTeachersExcel} />
                    
                    <button onClick={() => lessonFileRef.current?.click()} className="h-12 bg-[#fbbf24]/10 border border-[#fbbf24]/40 text-[#fbbf24] font-black text-[9px] uppercase tracking-widest hover:bg-[#fbbf24] hover:text-black transition-all flex items-center gap-4 px-4"><i className="fa-solid fa-book-open"></i> MÜFREDAT_AKTAR</button>
                    <input ref={lessonFileRef} type="file" className="hidden" accept=".xlsx" onChange={handleProcessLessonsExcel} />
                 </div>
              </div>
           </div>
        )}

        {activeTab === 'YEDEK' && (
           <div className="h-full flex flex-col space-y-4 animate-in slide-in-from-bottom-2">
              <div className="bg-[#1e293b]/60 border border-white/10 p-6 shadow-xl rounded-sm bg-grid-hatched">
                 <div className="flex items-center gap-3 mb-6">
                    <i className="fa-solid fa-database text-[#3b82f6] text-xl"></i>
                    <div>
                       <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">SİSTEM_YEDEK_MERKEZİ</h3>
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1.5 block">DNA_KORUMA_VE_RESTORASYON</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                    <div className="bg-black/40 border border-white/5 p-4 space-y-3">
                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">DIŞA_AKTIR_DNA</span>
                       <p className="text-[10px] font-medium text-slate-400 leading-relaxed">Mevcut tüm verileri tek bir JSON dosyası olarak bilgisayarınıza indirir. Bu dosya tam okul yedeğidir.</p>
                       <button 
                         onClick={handleExportDNA}
                         className="w-full h-12 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg"
                       >
                          <i className="fa-solid fa-file-export"></i> OKUL DNA YEDEK AL (.JSON)
                       </button>
                    </div>

                    <div className="bg-black/40 border border-white/5 p-4 space-y-3">
                       <span className="text-[8px] font-black text-[#fbbf24] uppercase tracking-widest">DNA_RESTORASYONU</span>
                       <p className="text-[10px] font-medium text-slate-400 leading-relaxed">Önceden alınmış bir DNA yedeğini sisteme yükler. Mevcut tüm veriler silinip yedektekiler yüklenir.</p>
                       <button 
                         onClick={() => dnaRestoreRef.current?.click()}
                         className="w-full h-12 bg-black border border-[#fbbf24]/40 text-[#fbbf24] font-black text-[10px] uppercase tracking-widest hover:bg-[#fbbf24] hover:text-black active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg"
                       >
                          <i className="fa-solid fa-file-import"></i> YEDEKTEN GERİ YÜKLE
                       </button>
                       <input ref={dnaRestoreRef} type="file" className="hidden" accept=".json" onChange={handleImportDNA} />
                    </div>
                 </div>
              </div>
           </div>
        )}
      </div>

      {previewData && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/98 backdrop-blur-xl px-2 py-4">
           <div className="bg-[#0d141b] border-2 border-[#3b82f6] w-full max-w-lg shadow-[0_0_150px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 duration-300 rounded-sm overflow-hidden h-[80vh]">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#162431] shrink-0">
                 <div><h3 className="text-[14px] font-black text-white uppercase tracking-[0.2em] leading-none">DNA_DOĞRULAMA_MATRİSİ</h3><span className="text-[8px] font-black text-[#3b82f6] uppercase mt-2 block tracking-widest">{importType} AKTARIMI ÖNİZLEME</span></div>
                 <button onClick={() => { setPreviewData(null); setImportType(null); }} className="w-10 h-10 border border-white/10 text-white/40 hover:text-white transition-all active:scale-90"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar bg-grid-hatched p-2">
                 <div className="space-y-1">
                    {previewData.map((item, idx) => (
                       <div key={idx} className="bg-black/60 border border-white/5 flex items-center h-14 relative group hover:bg-[#1e2e3d] transition-all">
                          <div className="w-12 h-full border-r border-white/5 flex items-center justify-center shrink-0">
                            {importType === 'LESSON' ? (
                               <span className="text-[10px] font-black text-[#fbbf24] uppercase drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">{item.branch}</span>
                            ) : (
                               <span className={`text-[12px] font-black ${item.gender === Gender.FEMALE ? 'text-pink-500' : 'text-[#3b82f6]'}`}>{item.gender === Gender.FEMALE ? 'K' : 'E'}</span>
                            )}
                          </div>
                          <div className="flex-1 px-4 flex flex-col justify-center min-w-0"><span className="text-[13px] font-black text-white uppercase truncate">{item.name}</span></div>
                          <div className="w-24 h-full border-l border-white/5 flex flex-col items-center justify-center shrink-0 bg-black/20">
                            <span className="text-[9px] font-black text-[#3b82f6] uppercase truncate px-2">
                              {importType === 'STUDENT' ? item.targetClass : importType === 'LESSON' ? `${item.hours} SAAT` : (item.branchShort || `${item.hours} s`)}
                            </span>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
              <div className="p-4 bg-black/80 border-t border-white/10 flex gap-3 shrink-0">
                 <button onClick={() => { setPreviewData(null); setImportType(null); }} className="flex-1 h-14 border border-[#354a5f] text-slate-400 font-black text-[10px] uppercase tracking-widest transition-all">İPTAL</button>
                 <button onClick={finalizeExcelImport} className="flex-[2] h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-xl transition-all">DNAYI_MÜHÜRLLE</button>
              </div>
           </div>
        </div>
      )}

      {/* HARD RESET MODAL */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/98 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-red-600 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 rounded-sm">
              {resetStep === 'IDLE' && (
                <div className="space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-red-600/20 border border-red-600 flex items-center justify-center shadow-lg"><i className="fa-solid fa-triangle-exclamation text-red-600 text-2xl"></i></div>
                      <h3 className="text-[16px] font-black text-white uppercase tracking-widest">SİSTEM SIFIRLAMA</h3>
                   </div>
                   <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed">ÖĞRETMEN, ÖĞRENCİ, DERS VE TÜM PLANLAR KALICI OLARAK SİLİNECEKTİR. YEDEK ALMADIYSANIZ VERİ KAYBI YAŞANIR.</p>
                   <div className="flex gap-4">
                      <button onClick={() => setIsResetModalOpen(false)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase">İPTAL</button>
                      <button onClick={startHardReset} className="flex-1 h-12 bg-red-600 text-white font-black text-[10px] uppercase shadow-2xl">EVET_SİL</button>
                   </div>
                </div>
              )}
              {resetStep === 'PROCESSING' && (
                <div className="flex flex-col items-center py-10 space-y-8">
                   <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                   <div className="w-full space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black text-white uppercase tracking-widest"><span>DNA_TEMİZLENİYOR...</span><span>%{Math.round(resetProgress)}</span></div>
                      <div className="h-1.5 w-full bg-black rounded-full overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${resetProgress}%` }}></div></div>
                   </div>
                </div>
              )}
              {resetStep === 'FINAL' && (
                <div className="flex flex-col items-center py-10 space-y-6">
                   <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg"><i className="fa-solid fa-check text-3xl"></i></div>
                   <h3 className="text-[18px] font-black text-white uppercase tracking-widest">DNA TEMİZLENDİ</h3>
                </div>
              )}
           </div>
        </div>
      )}

      {/* SCHEDULE CLEAR MODAL */}
      {isClearScheduleModalOpen && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/98 backdrop-blur-md px-4">
           <div className="bg-[#0d141b] border-2 border-orange-500 p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 rounded-sm">
              <div className="space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-500/20 border border-orange-500 flex items-center justify-center shadow-lg"><i className="fa-solid fa-calendar-xmark text-orange-500 text-2xl"></i></div>
                    <div>
                        <h3 className="text-[16px] font-black text-white uppercase tracking-widest">PLAN SIFIRLAMA</h3>
                        <span className="text-[8px] font-bold text-orange-500 uppercase tracking-widest">SADECE DERS PROGRAMI SİLİNİR</span>
                    </div>
                 </div>
                 <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed">
                    TÜM SINIFLARIN VE ÖĞRETMENLERİN DERS PROGRAMLARI SİLİNECEKTİR. 
                    <br/>ÖĞRETMEN, DERS VE ÖĞRENCİ KAYITLARI <span className="text-white">KORUNUR.</span>
                 </p>
                 <div className="flex gap-4">
                    <button onClick={() => setIsClearScheduleModalOpen(false)} className="flex-1 h-12 border border-slate-600 text-white font-black text-[10px] uppercase hover:bg-white/5 transition-all">VAZGEÇ</button>
                    <button onClick={executeClearSchedule} className="flex-1 h-12 bg-orange-600 text-white font-black text-[10px] uppercase shadow-xl hover:brightness-110 transition-all">PROGRAMI SİL</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SettingsModule;
