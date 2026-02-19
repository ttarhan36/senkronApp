import React, { useState, useMemo } from 'react';
import { ClassSection, Student, AttendanceRecord, Lesson } from '../types';
import { standardizeBranchCode } from '../utils';

interface AbsenceReportModuleProps {
    classes: ClassSection[];
    allLessons: Lesson[];
}

const AbsenceReportModule: React.FC<AbsenceReportModuleProps> = ({ classes, allLessons }) => {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('tr-TR'));
    const [activeTab, setActiveTab] = useState<string | null>(null);

    // 1. Calculate Aggregate Data for Selected Date
    const absenceData = useMemo(() => {
        const data: Record<string, { className: string; students: { student: Student; records: AttendanceRecord[] }[] }> = {};
        let totalAbsentStudents = 0;
        let totalClassesWithAbsence = 0;

        classes.forEach(cls => {
            const absentStudentsInClass: { student: Student; records: AttendanceRecord[] }[] = [];

            (cls.students || []).forEach(student => {
                const records = (student.attendanceHistory || []).filter(r => r.date === selectedDate && r.status === 'ABSENT');
                if (records.length > 0) {
                    absentStudentsInClass.push({ student, records });
                    totalAbsentStudents++;
                }
            });

            if (absentStudentsInClass.length > 0) {
                data[cls.id] = {
                    className: cls.name,
                    students: absentStudentsInClass
                };
                totalClassesWithAbsence++;
            }
        });

        return { data, totalAbsentStudents, totalClassesWithAbsence };
    }, [classes, selectedDate]);

    // Auto-select first class with absences if no tab selected
    useMemo(() => {
        if (!activeTab && Object.keys(absenceData.data).length > 0) {
            setActiveTab(Object.keys(absenceData.data)[0]);
        }
    }, [absenceData.data]);

    const sortedClassIds = Object.keys(absenceData.data).sort((a, b) =>
        absenceData.data[a].className.localeCompare(absenceData.data[b].className)
    );

    return (
        <div className="h-full flex flex-col bg-[#0f172a] text-white overflow-hidden p-6 gap-6 animate-in fade-in duration-300">

            {/* HEADER & DATE SELECTOR */}
            <div className="flex justify-between items-center border-b border-white/10 pb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-500/10 flex items-center justify-center border border-red-500/20 rounded-md shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                        <i className="fa-solid fa-clipboard-user text-red-500 text-2xl"></i>
                    </div>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-[0.2em] leading-none">YOKLAMA RAPORU</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">GÜNLÜK DEVAMSIZLIK ANALİZİ</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <input
                            type="date"
                            value={selectedDate.split('.').reverse().join('-')}
                            onChange={(e) => {
                                if (e.target.value) {
                                    const date = new Date(e.target.value);
                                    setSelectedDate(date.toLocaleDateString('tr-TR'));
                                }
                            }}
                            className="bg-[#1e293b] border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                            <i className="fa-solid fa-calendar-days"></i>
                        </div>
                    </div>
                    <button onClick={() => window.print()} className="px-4 py-2 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 rounded-sm border border-white/10">
                        <i className="fa-solid fa-print"></i> YAZDIR
                    </button>
                </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="bg-[#1e293b] border border-white/5 p-4 flex items-center gap-4 rounded-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500/50"></div>
                    <div className="w-10 h-10 bg-red-500/20 text-red-500 flex items-center justify-center rounded-full text-lg group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-user-slash"></i>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">TOPLAM DEVAMSIZ</p>
                        <div className="text-2xl font-black text-white leading-none mt-1">{absenceData.totalAbsentStudents} <span className="text-[10px] text-slate-500 font-bold">ÖĞRENCİ</span></div>
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-white/5 p-4 flex items-center gap-4 rounded-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-amber-500/50"></div>
                    <div className="w-10 h-10 bg-amber-500/20 text-amber-500 flex items-center justify-center rounded-full text-lg group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-school"></i>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ETKİLENEN SINIF</p>
                        <div className="text-2xl font-black text-white leading-none mt-1">{absenceData.totalClassesWithAbsence} <span className="text-[10px] text-slate-500 font-bold">ŞUBE</span></div>
                    </div>
                </div>

                <div className="bg-[#1e293b]/50 border border-white/5 p-4 flex items-center justify-between rounded-sm relative overflow-hidden">
                    <div className="text-[10px] text-slate-500 font-mono">
                        RAPOR TARİHİ: <br />
                        <span className="text-white font-bold text-lg">{selectedDate}</span>
                    </div>
                    <i className="fa-solid fa-chart-pie text-4xl text-white/5"></i>
                </div>
            </div>

            {/* CONTENT: TABS & LIST */}
            <div className="flex flex-col flex-1 min-h-0 bg-[#1e293b] border border-white/5 rounded-sm shadow-xl overflow-hidden">

                {/* CLASS TABS */}
                <div className="flex overflow-x-auto border-b border-white/10 bg-[#0f172a]/50 p-2 gap-2 no-scrollbar">
                    {sortedClassIds.length > 0 ? sortedClassIds.map(classId => (
                        <button
                            key={classId}
                            onClick={() => setActiveTab(classId)}
                            className={`px-4 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeTab === classId
                                    ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.4)]'
                                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {absenceData.data[classId].className}
                            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === classId ? 'bg-white/20 text-white' : 'bg-black/40 text-slate-500'}`}>
                                {absenceData.data[classId].students.length}
                            </span>
                        </button>
                    )) : (
                        <div className="w-full text-center py-2 text-[10px] font-bold text-slate-600 uppercase">
                            SEÇİLEN TARİHTE DEVAMSIZLIK KAYDI BULUNAMADI
                        </div>
                    )}
                </div>

                {/* STUDENT LIST TABLE */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    {activeTab && absenceData.data[activeTab] ? (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-[#0f172a] sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 w-20 text-center">NO</th>
                                    <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">AD SOYAD</th>
                                    <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">DEVAMSIZLIK YAPILAN DERSLER</th>
                                    <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 text-center">TOPLAM DERS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {absenceData.data[activeTab].students.map((item, idx) => (
                                    <tr key={item.student.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-3 text-center">
                                            <span className="text-[11px] font-bold text-slate-400 font-mono bg-black/20 px-2 py-1 rounded border border-white/5 group-hover:border-white/20 transition-colors">
                                                {item.student.number}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-bold text-white uppercase">{item.student.name}</span>
                                                <span className="text-[9px] font-bold text-slate-600 uppercase">{item.student.gender === 'FEMALE' ? 'KIZ' : 'ERKEK'}</span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-wrap gap-2">
                                                {item.records.map((rec, rIdx) => {
                                                    // Resolve Lesson Name
                                                    const lessonObj = allLessons.find(l => l.id === rec.lessonName || l.name === rec.lessonName);
                                                    const standardizedName = standardizeBranchCode(lessonObj ? (lessonObj.name || rec.lessonName) : rec.lessonName);

                                                    return (
                                                        <div key={rIdx} className="flex items-center bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-sm" title={`${rec.lessonName} - ${rec.teacherName}`}>
                                                            <span className="w-5 h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-sm mr-2 shadow-sm">
                                                                {rec.period}
                                                            </span>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-black text-red-400 uppercase leading-none">{standardizedName}</span>
                                                                <span className="text-[7px] font-bold text-slate-500 uppercase mt-0.5">{rec.teacherName}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="text-[14px] font-black text-white/50">{item.records.length}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 opacity-20">
                            <i className="fa-solid fa-list-check text-6xl mb-4 text-slate-500"></i>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">GÖSTERİLECEK VERİ YOK</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AbsenceReportModule;
