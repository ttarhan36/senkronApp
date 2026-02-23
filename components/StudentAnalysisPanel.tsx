import React, { useMemo } from 'react';
import { Student, ClassSection, Lesson, ExamQuestion, StudentResponse, Objective } from '../types';
import { calculateNetScore, getBranchColor } from '../utils';

interface StudentAnalysisPanelProps {
    student: Student;
    studentClass: ClassSection;
    lessons: Lesson[];
    responses: StudentResponse[]; // New relational data
    objectives: Objective[];
}

const StudentAnalysisPanel: React.FC<StudentAnalysisPanelProps> = ({
    student,
    studentClass,
    lessons,
    responses,
    objectives
}) => {
    // Mock analysis data for demonstration if responses are empty
    const analysisData = useMemo(() => {
        // If we had real relational data, we would use it here.
        // For now, let's simulate the "Lost Point Cost" based on the student's grades.
        const lgsConstant = studentClass.grade === 8 ? 3.45 : 2.12; // Simulated point value per question

        const statsByLesson: Record<string, { correct: number, wrong: number, lostPoints: number, objectives: string[] }> = {};

        // Simulate some logic based on existing grade averages if no responses exist
        student.grades?.forEach(g => {
            const lesson = lessons.find(l => l.id === g.lessonId);
            if (!lesson) return;

            const avg = g.average || 70;
            const simulatedWrongs = Math.floor((100 - avg) / 5);
            const simulatedCorrects = 20 - simulatedWrongs;

            statsByLesson[lesson.name] = {
                correct: simulatedCorrects,
                wrong: simulatedWrongs,
                lostPoints: simulatedWrongs * lgsConstant,
                objectives: ['Kazanım A', 'Kazanım B']
            };
        });

        return statsByLesson;
    }, [student, studentClass, lessons]);

    const totalLostPoints = useMemo(() => {
        return Object.values(analysisData).reduce((acc, curr) => acc + curr.lostPoints, 0);
    }, [analysisData]);

    return (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 pb-12">
            {/* HEADER: TOTAL LOST POINTS */}
            <div className="bg-[#1e293b] border border-red-500/30 p-6 rounded-sm shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-grid-hatched opacity-10"></div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 relative">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-sm bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <i className="fa-solid fa-chart-line-down text-red-500 text-2xl"></i>
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black text-white uppercase tracking-[0.2em]">{studentClass.grade === 8 ? 'LGS' : 'YKS'} KAYIP PUAN MALİYETİ</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">HATALARINIZIN SİZE MALİYETİ VE KURTARMA POTANSİYELİ</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[42px] font-black text-red-500 leading-none">-{totalLostPoints.toFixed(1)}</span>
                        <span className="text-[9px] font-bold text-red-400/60 uppercase tracking-widest mt-1">TOPLAM KAYIP PUAN</span>
                    </div>
                </div>

                {/* SIMULATION MESSAGE */}
                <div className="mt-6 p-4 bg-black/40 border border-white/5 rounded-sm">
                    <div className="flex items-start gap-3">
                        <i className="fa-solid fa-robot text-blue-400 mt-1"></i>
                        <p className="text-[11px] font-medium text-slate-300 leading-relaxed italic">
                            "Merhaba {student.name.split(' ')[0]}, yaptığın son analizlere göre sadece <span className="text-blue-400 font-bold">Matematik</span> ve <span className="text-blue-400 font-bold">Fen</span> branşlarındaki 4 yanlışını düzeltseydin, puanın <span className="text-green-500 font-medium">{student.scoreGoal || '420'}</span> seviyesine çıkabilirdi. Senin için <span className="text-[#fbbf24]">Kazanım Odaklı Telafi Ödevleri</span> hazırladım."
                        </p>
                    </div>
                </div>
            </div>

            {/* LESSON BREAKDOWN */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(analysisData).map(([name, data]) => (
                    <div key={name} className="bg-slate-900/60 border border-white/5 p-4 rounded-sm hover:border-[#3b82f6]/40 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: getBranchColor(name) }}></div>
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[12px] font-black text-white uppercase tracking-tight">{name}</span>
                            <span className="text-[14px] font-black text-red-500">-{data.lostPoints.toFixed(1)} P</span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between text-[9px] font-bold">
                                <span className="text-slate-500 uppercase">NET DURUMU</span>
                                <span className="text-white">{calculateNetScore(data.correct, data.wrong, studentClass.grade)} NET</span>
                            </div>
                            <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500"
                                    style={{ width: `${(data.correct / (data.correct + data.wrong)) * 100}%` }}
                                ></div>
                            </div>

                            <div className="pt-2">
                                <span className="text-[7px] font-black text-[#3b82f6] uppercase tracking-widest block mb-1">EKSİK KAZANIMLAR</span>
                                <div className="flex flex-wrap gap-1">
                                    {data.objectives.map(obj => (
                                        <span key={obj} className="px-1.5 py-0.5 bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[#3b82f6] text-[7px] font-bold rounded-sm">{obj}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* RANKING POOL (MOCK) */}
            <div className="bg-[#0f172a] border border-indigo-500/30 p-6 rounded-sm relative overflow-hidden">
                <div className="flex items-center gap-3 mb-6">
                    <i className="fa-solid fa-trophy text-[#fbbf24]"></i>
                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.4em]">SENKRON EKOSİSTEM SIRALAMA HAVUZU</h3>
                    <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-500 text-[7px] font-black uppercase tracking-widest animate-pulse ml-auto">TÜRKİYE GENELİ CANLI</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-black/40 p-4 border border-white/5 flex flex-col items-center justify-center">
                        <span className="text-[32px] font-black text-white">412.5</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">GENEL PUAN ORTALAMASI</span>
                    </div>
                    <div className="bg-black/40 p-4 border border-white/5 flex flex-col items-center justify-center">
                        <span className="text-[32px] font-black text-[#fbbf24]">1,240</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">SİSTEM GENELİ SIRALAMA</span>
                    </div>
                    <div className="bg-black/40 p-4 border border-white/5 flex flex-col items-center justify-center">
                        <span className="text-[32px] font-black text-green-500">%8.4</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">YÜZDELİK DİLİM (TAHMİNİ)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentAnalysisPanel;
