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
    }, [absenceData.data, activeTab]);

    const sortedClassIds = Object.keys(absenceData.data).sort((a, b) =>
        absenceData.data[a].className.localeCompare(absenceData.data[b].className)
    );

    return (
        <div className="min-h-screen bg-[#0f172a] text-white p-4 md:p-6 animate-in fade-in duration-300 pb-20">

            {/* HEADER COMPACT */}
            <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-500/10 flex items-center justify-center border border-red-500/20 rounded-sm shadow-sm">
                        <i className="fa-solid fa-clipboard-user text-red-500 text-sm"></i>
                    </div>
                    <div>
                        <h1 className="text-[14px] font-black uppercase tracking-[0.2em] leading-none text-slate-200">YOKLAMA RAPORU</h1>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">GÜNLÜK ANALİZ</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
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
                            className="bg-[#1e293b] border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer w-32"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors text-[10px]">
                            <i className="fa-solid fa-calendar-days"></i>
                        </div>
                    </div>
                    <button onClick={() => window.print()} className="px-3 py-1.5 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 rounded-sm border border-white/10">
                        <i className="fa-solid fa-print"></i> YAZDIR
                    </button>
                </div>
            </div>

            {/* SUMMARY CARDS - 3 COLUMNS COMPACT */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#1e293b] border border-white/5 p-2 flex flex-col items-center justify-center rounded-sm relative overflow-hidden group h-20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/50"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">TOPLAM ÖĞRENCİ</span>
                    <div className="text-xl font-black text-white leading-none">{absenceData.totalAbsentStudents}</div>
                </div>

                <div className="bg-[#1e293b] border border-white/5 p-2 flex flex-col items-center justify-center rounded-sm relative overflow-hidden group h-20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">ETKİLENEN ŞUBE</span>
                    <div className="text-xl font-black text-white leading-none">{absenceData.totalClassesWithAbsence}</div>
                </div>

                <div className="bg-[#1e293b] border border-white/5 p-2 flex flex-col items-center justify-center rounded-sm relative overflow-hidden h-20">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/50"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">RAPOR TARİHİ</span>
                    <div className="text-[11px] font-bold text-white uppercase">{selectedDate}</div>
                </div>
            </div>

            {/* CONTENT: CLASS SECTIONS */}
            {sortedClassIds.length > 0 ? (
                <div className="space-y-6">
                    {sortedClassIds.map(classId => {
                        const classData = absenceData.data[classId];
                        return (
                            <div key={classId} className="bg-[#1e293b] border border-white/5 rounded-sm overflow-hidden">
                                {/* CLASS HEADER */}
                                <div className="bg-[#0f172a] px-4 py-2 border-b border-white/10 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-[#3b82f6] text-white text-[10px] font-black px-2 py-0.5 rounded-sm">{classData.className}</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{classData.students.length} ÖĞRENCİ</span>
                                    </div>
                                </div>

                                {/* STUDENT LIST COMPACT GRID */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-2">
                                    {classData.students.map((item) => (
                                        <div key={item.student.id} className="bg-[#0f172a]/50 hover:bg-[#0f172a] border border-white/5 p-2 flex items-start gap-3 rounded-sm transition-all group">
                                            <div className="text-[10px] font-bold text-slate-500 font-mono bg-black/20 px-1.5 py-0.5 rounded border border-white/5 w-8 text-center shrink-0">
                                                {item.student.number}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[10px] font-black text-white uppercase truncate mb-1">{item.student.name}</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.records.map((rec, rIdx) => {
                                                        const lessonObj = allLessons.find(l => l.id === rec.lessonName || l.name === rec.lessonName);
                                                        const resolvedName = lessonObj ? (lessonObj.name || rec.lessonName) : rec.lessonName;
                                                        const branchCode = standardizeBranchCode(resolvedName);
                                                        return (
                                                            <div key={rIdx} className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-[2px]" title={`${resolvedName} - ${rec.period}. Ders`}>
                                                                <span className="text-[8px] font-black text-red-500">{rec.period}</span>
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase">{resolvedName}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-24 opacity-20 border border-dashed border-white/10 rounded-sm">
                    <i className="fa-solid fa-check-circle text-4xl mb-4 text-green-500"></i>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">BU TARİHTE DEVAMSIZLIK YOK</span>
                </div>
            )}
        </div>
    );
};

export default AbsenceReportModule;
