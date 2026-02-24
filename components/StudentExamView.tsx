import React, { useState, useEffect } from 'react';
import {
  ExamPackage, ExamType, ExamSession, ExamQuestion,
  StudentResponse, SubjectSummary, CompensationAlert,
  TrafficLightStatus, SessionType
} from '../types';
import { UserSession } from '../types';
import { buildSubjectSummaries, generateCompensationAlerts, getPercentileProjection } from '../utils';
import { supabase } from '../services/supabaseClient';
import { generateStudentCoachAdvice } from '../services/geminiService';

interface Props {
  session: UserSession;
}

type View = 'LIST' | 'RESULT_DASHBOARD';
type ResultTab = 'PUANLAR' | 'DERSLER';
type LessonSubTab = 'SORU_ANALIZI' | 'KONU_ANALIZI';

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  LGS: 'LGS', TYT: 'TYT', AYT: 'AYT', YDT: 'YDT', TARAMA_11: 'TARAMA'
};

const TRAFFIC_COLORS: Record<TrafficLightStatus, { bg: string; text: string; label: string }> = {
  RED: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'ACİL' },
  YELLOW: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'DİKKAT' },
  GREEN: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TAMAM' }
};

const StudentExamView: React.FC<Props> = ({ session }) => {
  const [view, setView] = useState<View>('LIST');
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamPackage | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>('PUANLAR');
  const [lessonSubTab, setLessonSubTab] = useState<LessonSubTab>('SORU_ANALIZI');

  const [result, setResult] = useState<{
    summaries: SubjectSummary[];
    alerts: CompensationAlert[];
    percentile: { year: number; percentile: number } | null;
    responses: StudentResponse[];
    questionsMap: Record<string, ExamQuestion>;
    bookletType: string | null;
  } | null>(null);

  const [aiMessage, setAiMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchExams();
  }, [session.id]);

  const fetchExams = async () => {
    setLoading(true);
    // Find exams where the student has responses
    const { data: responsesData, error: respError } = await supabase
      .from('student_responses')
      .select('question_id, booklet_type, exam_questions!inner(session_id, exam_sessions!inner(exam_id))')
      .eq('student_id', session.id);

    if (respError || !responsesData) {
      setLoading(false);
      return;
    }

    const uniqueExamIds = Array.from(new Set(responsesData.map((r: any) => r.exam_questions.exam_sessions.exam_id)));

    if (uniqueExamIds.length === 0) {
      setExams([]);
      setLoading(false);
      return;
    }

    const { data: examsData } = await supabase
      .from('exams')
      .select('*, exam_sessions(*)')
      .in('id', uniqueExamIds)
      .eq('status', 'DONE')
      .order('applied_date', { ascending: false });

    if (examsData) {
      setExams(examsData.map((row: any) => ({
        id: row.id, schoolId: row.school_id, name: row.name, publisher: row.publisher,
        examType: row.exam_type as ExamType, targetGrade: row.target_grade,
        appliedDate: row.applied_date, wrongPenaltyRatio: parseFloat(row.wrong_penalty_ratio),
        status: row.status, classIds: row.class_ids ?? [],
        sessions: (row.exam_sessions ?? [])
          .sort((a: any, b: any) => a.session_order - b.session_order)
          .map((s: any) => ({
            id: s.id, examId: s.exam_id, sessionName: s.session_name as SessionType,
            durationMinutes: s.duration_minutes, questionCount: s.question_count,
            sessionOrder: s.session_order, questions: []
          }))
      })));
    }
    setLoading(false);
  };

  const handleOpenExam = async (exam: ExamPackage) => {
    setLoading(true);

    // 1. Get all questions for this exam
    const sessionIds = (exam.sessions ?? []).map(s => s.id);
    const { data: qData } = await supabase
      .from('exam_questions')
      .select('*, objectives(*)')
      .in('session_id', sessionIds);

    const questionsList: ExamQuestion[] = (qData ?? []).map((q: any) => ({
      id: q.id, sessionId: q.session_id, questionNumber: q.question_number,
      subject: q.subject, correctAnswer: q.correct_answer, correctAnswers: q.correct_answers,
      pointWeight: parseFloat(q.point_weight ?? 1), objectiveId: q.objective_id,
      objective: q.objectives ? {
        id: q.objectives.id, schoolId: q.objectives.school_id, description: q.objectives.description,
        subject: q.objectives.subject, code: q.objectives.code
      } : undefined,
      aiAnalysisStatus: q.ai_analysis_status, questionText: q.question_text
    }));

    const qMap: Record<string, ExamQuestion> = {};
    const qListBySession: Record<string, ExamQuestion[]> = {};
    questionsList.forEach(q => {
      qMap[q.id] = q;
      if (!qListBySession[q.sessionId]) qListBySession[q.sessionId] = [];
      qListBySession[q.sessionId].push(q);
    });

    // 2. Get student responses
    const { data: rData } = await supabase
      .from('student_responses')
      .select('*')
      .eq('student_id', session.id)
      .in('question_id', questionsList.map(q => q.id));

    const responseList: StudentResponse[] = (rData ?? []).map((r: any) => ({
      id: r.id, studentId: r.student_id, questionId: r.question_id,
      givenAnswer: r.given_answer, isCorrect: r.is_correct, bookletType: r.booklet_type,
      isEmpty: r.is_empty, rawScore: parseFloat(r.raw_score ?? 0), lostPoints: parseFloat(r.lost_points ?? 0)
    }));

    // Add question reference to responses for easier mapping
    responseList.forEach(r => {
      r.question = qMap[r.questionId];
    });

    const bookletType = responseList.length > 0 ? responseList[0].bookletType : null;

    // 3. Calculate Summaries
    const allSessions = exam.sessions ?? [];
    const allSummaries = allSessions.flatMap(s =>
      buildSubjectSummaries(responseList, qListBySession[s.id] ?? [], exam.examType, s.sessionName)
    );

    const alerts = generateCompensationAlerts(allSummaries, null, exam.examType);
    const totalNet = allSummaries.reduce((a, s) => a + s.net, 0);
    const percentile = getPercentileProjection(totalNet, exam.examType);

    setSelectedExam(exam);
    setResult({ summaries: allSummaries, alerts, percentile, responses: responseList, questionsMap: qMap, bookletType: bookletType || undefined });
    setView('RESULT_DASHBOARD');
    setActiveTab('PUANLAR');
    setLoading(false);

    // AI Koçluk Metni Üret
    if (alerts.length > 0) {
      setAiMessage("Koçunuz sınav sonucunuzu inceliyor...");
      const redAlerts = alerts.filter(a => a.status === 'RED').slice(0, 3).map(a => ({
        subject: a.subject, objectiveDesc: a.objectiveDescription, lostPoints: a.lostPoints
      }));
      if (redAlerts.length > 0) {
        generateStudentCoachAdvice(session.name, exam.name, redAlerts)
          .then(msg => setAiMessage(msg))
          .catch(() => setAiMessage("Bağlantı sorunu yaşandı, ancak sonuç özetini inceleyebilirsin."));
      } else {
        setAiMessage(`Tebrikler ${session.name}, ${exam.name} sınavında kritik bir eksiğin görünmüyor!`);
      }
    }
  };

  const renderSubjectSummaryCard = (summary: SubjectSummary) => {
    return (
      <div key={summary.subject} className="bg-[#121a23] border border-[#354a5f]/30 p-4 rounded-md mb-3">
        <div className="flex justify-between items-center mb-3 border-b border-[#354a5f]/20 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#1a2535] flex items-center justify-center">
              <span className="text-blue-400 text-[10px]">📖</span>
            </div>
            <span className="text-[12px] font-bold text-white uppercase">{summary.subject}</span>
          </div>
          <span className="text-[18px] font-black font-mono text-white">{summary.net.toFixed(2)}<span className="text-[9px] text-slate-500 ml-1">NET</span></span>
        </div>

        <div className="flex justify-between mt-2">
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase">Soru</span>
            <span className="text-[11px] font-mono font-bold text-slate-300">{summary.correct + summary.wrong + summary.empty}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase">Doğru</span>
            <span className="text-[11px] font-mono font-bold text-green-400">{summary.correct}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase">Yanlış</span>
            <span className="text-[11px] font-mono font-bold text-red-400">{summary.wrong}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase">Boş</span>
            <span className="text-[11px] font-mono font-bold text-slate-400">{summary.empty}</span>
          </div>
          <div className="flex flex-col border-l border-[#354a5f]/20 pl-3">
            <span className="text-[9px] text-red-500/80 uppercase">Kayıp P.</span>
            <span className="text-[11px] font-mono font-black text-red-400">-{summary.lostPoints.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderQuestionAnalysis = () => {
    // Group responses by subject
    if (!result) return null;

    const subjects = Array.from(new Set(result.responses.map(r => r.question?.subject).filter(Boolean))) as string[];

    return (
      <div className="space-y-6">
        {subjects.map(subject => {
          const subjectResponses = result.responses.filter(r => r.question?.subject === subject)
            .sort((a, b) => (a.question?.questionNumber || 0) - (b.question?.questionNumber || 0));

          return (
            <div key={subject}>
              <h3 className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-3 border-b border-blue-500/20 pb-1">{subject}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {subjectResponses.map(resp => {
                  const isCorrect = resp.isCorrect;
                  const isEmpty = resp.isEmpty;
                  let borderColor = 'border-[#354a5f]/40';
                  let textColor = 'text-slate-400';

                  if (isCorrect) {
                    borderColor = 'border-green-500/30 bg-green-500/5';
                    textColor = 'text-green-400';
                  } else if (isCorrect === false && !isEmpty) {
                    borderColor = 'border-red-500/30 bg-red-500/5';
                    textColor = 'text-red-400';
                  }

                  // Determine correct answer to show based on booklet type if available
                  let finalCorrectAnswer = resp.question?.correctAnswer || '-';
                  if (result.bookletType && resp.question?.correctAnswers && resp.question.correctAnswers[result.bookletType]) {
                    finalCorrectAnswer = resp.question.correctAnswers[result.bookletType];
                  }

                  return (
                    <div key={resp.id} className={`p-3 border rounded ${borderColor} flex flex-col`}>
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] font-bold text-white">Soru No: {resp.question?.questionNumber}</span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-[#354a5f]/10 mb-1">
                        <span className="text-[9px] text-slate-500">Konu Adı</span>
                        <span className={`text-[9px] text-right font-medium max-w-[200px] truncate ${textColor}`}>
                          {resp.question?.objective?.description || 'Konu Tanımsız'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[#354a5f]/10 mb-1">
                        <span className="text-[9px] text-slate-500">Doğru Cevap</span>
                        <span className="text-[10px] font-black text-green-400">{finalCorrectAnswer}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-[9px] text-slate-500">Öğrenci Cevabı</span>
                        <span className={`text-[10px] font-black ${textColor}`}>
                          {isEmpty ? 'BOŞ' : resp.givenAnswer}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  };

  const renderTopicAnalysis = () => {
    if (!result) return null;

    // Group by objective
    const topicStats: Record<string, { desc: string; subject: string; correct: number; wrong: number; empty: number; total: number; lostPoints: number }> = {};

    result.responses.forEach(resp => {
      const objId = resp.question?.objectiveId;
      if (!objId) return; // Skip questions without topics

      if (!topicStats[objId]) {
        topicStats[objId] = {
          desc: resp.question?.objective?.description || 'Bilinmiyor',
          subject: resp.question?.subject || '',
          correct: 0, wrong: 0, empty: 0, total: 0, lostPoints: 0
        };
      }

      topicStats[objId].total++;
      if (resp.isCorrect) topicStats[objId].correct++;
      else if (resp.isEmpty) topicStats[objId].empty++;
      else topicStats[objId].wrong++;

      topicStats[objId].lostPoints += (resp.lostPoints || 0);
    });

    const topics = Object.values(topicStats).sort((a, b) => b.lostPoints - a.lostPoints);

    if (topics.length === 0) {
      return (
        <div className="text-center py-10">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Bu sınav için konu kazanım eşleşmesi bulunmuyor.</p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {topics.map((t, i) => {
          const successRate = (t.correct / t.total) * 100;

          return (
            <div key={i} className="bg-[#121a23] border border-[#354a5f]/40 p-4 rounded">
              <div className="flex gap-2 items-start mb-3">
                <span className="text-[#354a5f] mt-1 text-[8px]">●</span>
                <span className="text-[11px] text-slate-200 font-medium leading-tight">{t.desc}</span>
              </div>

              <div className="flex justify-between mb-3 bg-[#0d141b] py-2 px-3 rounded border border-[#354a5f]/20">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-blue-400 uppercase">Soru</span>
                  <span className="text-[11px] font-mono text-white">{t.total}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-blue-400 uppercase">Doğru</span>
                  <span className="text-[11px] font-mono text-white">{t.correct}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-blue-400 uppercase">Yanlış</span>
                  <span className="text-[11px] font-mono text-white">{t.wrong}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-blue-400 uppercase">Boş</span>
                  <span className="text-[11px] font-mono text-white">{t.empty}</span>
                </div>
                <div className="flex flex-col items-center pl-3 border-l border-[#354a5f]/20">
                  <span className="text-[8px] text-blue-400 uppercase">LGS Kayıp P.</span>
                  <span className="text-[11px] font-mono text-red-400 font-bold">{t.lostPoints.toFixed(3)}</span>
                </div>
              </div>

              <div className="w-full h-4 bg-red-500/30 rounded overflow-hidden relative border border-[#354a5f]/40">
                <div className="h-full bg-[#10b981] transition-all absolute left-0" style={{ width: `${successRate}%` }}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-black text-white mix-blend-difference">%{(successRate).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  };

  // RESULT VIEW (DASHBOARD)
  if (view === 'RESULT_DASHBOARD' && selectedExam && result) {
    const totalNet = result.summaries.reduce((a, s) => a + s.net, 0);
    const totalLost = result.summaries.reduce((a, s) => a + s.lostPoints, 0);
    const totalCorrect = result.summaries.reduce((a, s) => a + s.correct, 0);
    const totalWrong = result.summaries.reduce((a, s) => a + s.wrong, 0);
    const totalEmpty = result.summaries.reduce((a, s) => a + s.empty, 0);
    const totalQuestions = totalCorrect + totalWrong + totalEmpty;

    return (
      <div className="w-full bg-[#0d141b] text-white overflow-y-auto">
        {/* Top Header */}
        <div className="sticky top-0 z-10 bg-[#0d141b] border-b border-[#354a5f]/40 px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setView('LIST')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#354a5f]/30 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h2 className="text-[14px] font-bold tracking-wider">{selectedExam.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">{selectedExam.publisher || 'Kurum Yok'} · {EXAM_TYPE_LABELS[selectedExam.examType]}</p>
              {result.bookletType && (
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded uppercase font-black">
                  {result.bookletType} KİTAPÇIĞI
                </span>
              )}
            </div>
          </div>
          <button className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500/30 transition">
            ⎙
          </button>
        </div>

        {/* Double Tabs */}
        <div className="flex border-b border-[#354a5f]/40">
          <button
            className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-widest ${activeTab === 'PUANLAR' ? 'text-white border-b-2 border-white' : 'text-slate-500 hover:text-slate-300'}`}
            onClick={() => setActiveTab('PUANLAR')}
          >
            📈 Puanlar
          </button>
          <button
            className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-widest ${activeTab === 'DERSLER' ? 'text-white border-b-2 border-red-500' : 'text-slate-500 hover:text-slate-300'}`}
            onClick={() => setActiveTab('DERSLER')}
          >
            ≡ Dersler
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 max-w-lg mx-auto pb-24">
          {activeTab === 'PUANLAR' ? (
            <div className="space-y-4 shadow-xl">
              {/* Top Stats */}
              <div className="bg-[#121a23] border border-[#354a5f]/30 p-4 rounded-md">
                <div className="grid grid-cols-2 gap-y-3">
                  <div className="flex justify-between col-span-2 border-b border-[#354a5f]/20 pb-2">
                    <span className="text-[11px] text-slate-400">Soru Sayısı</span>
                    <span className="text-[11px] font-mono text-white">{totalQuestions}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#354a5f]/20 pb-2 pr-2">
                    <span className="text-[11px] text-slate-400">Doğru Cevap</span>
                    <span className="text-[11px] font-mono text-green-400">{totalCorrect}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#354a5f]/20 pb-2 pl-2">
                    <span className="text-[11px] text-slate-400">Yanlış Cevap</span>
                    <span className="text-[11px] font-mono text-red-400">{totalWrong}</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-b border-[#354a5f]/20 pb-2">
                    <span className="text-[12px] font-bold text-slate-300">Net</span>
                    <span className="text-[14px] font-black font-mono text-white">{totalNet.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-b border-[#354a5f]/20 pb-2">
                    <span className="text-[11px] text-slate-400">Puan Türü Kayıp Puan</span>
                    <span className="text-[13px] font-black font-mono text-red-400">-{totalLost.toFixed(3)}</span>
                  </div>
                </div>
              </div>

              {/* LGS Block */}
              {result.percentile && (
                <div className="bg-[#121a23] border border-[#354a5f]/30 p-4 rounded-md">
                  <div className="flex items-center gap-2 mb-4 border-b border-yellow-500/20 pb-2">
                    <span className="bg-yellow-500/20 text-yellow-500 p-1 rounded">2K</span>
                    <span className="text-[14px] font-bold text-yellow-500">{EXAM_TYPE_LABELS[selectedExam.examType]} BAREMİ</span>
                    <span className="ml-auto text-[18px] font-black text-yellow-500">
                      Simülasyon
                    </span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-[11px] text-slate-400">Yüzdelik Dilim</span>
                    <span className="text-[12px] font-mono text-white">%{result.percentile.percentile.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 pt-2 border-t border-[#354a5f]/20">
                    <span className="text-[9px]">LGS {result.percentile.year} Referanslı</span>
                  </div>
                </div>
              )}

              {/* Subject Summaries */}
              <div className="space-y-1">
                {result.summaries.map(s => renderSubjectSummaryCard(s))}
              </div>

            </div>
          ) : (
            <div className="space-y-4">
              {/* Sub Tabs */}
              <div className="flex bg-[#121a23] border border-[#354a5f]/30 rounded-md overflow-hidden mb-4">
                <button
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${lessonSubTab === 'SORU_ANALIZI' ? 'bg-[#354a5f]/20 text-white border-b-2 border-red-500' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setLessonSubTab('SORU_ANALIZI')}
                >
                  <span className="text-[14px]">☍</span> Soru Analizi
                </button>
                <button
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${lessonSubTab === 'KONU_ANALIZI' ? 'bg-[#354a5f]/20 text-white border-b-2 border-red-500' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setLessonSubTab('KONU_ANALIZI')}
                >
                  <span className="text-[14px]">⧉</span> Konu Analizi
                </button>
              </div>

              {lessonSubTab === 'SORU_ANALIZI' ? renderQuestionAnalysis() : renderTopicAnalysis()}

              {/* AI Coach Alert Area */}
              {lessonSubTab === 'KONU_ANALIZI' && result.alerts.length > 0 && aiMessage && (
                <div className="mt-8 bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>
                  <div className="flex gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
                      <span className="text-xl">✨</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-1">Senkron AI Koçu</h4>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                        {aiMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="p-3 md:p-5">
      <div className="mb-4">
        <p className="text-[13px] font-black text-white uppercase tracking-[0.3em]">SINAV RAPORLARI</p>
        <p className="text-[7px] text-slate-500 uppercase tracking-widest mt-0.5">YÜKLENEN SINAVLAR · OPTİK SONUÇLARI</p>
      </div>

      {loading ? (
        <p className="text-[9px] uppercase tracking-widest text-slate-600 animate-pulse py-16 text-center">YÜKLENIYOR...</p>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <p className="text-[10px] font-black uppercase tracking-widest mb-1">SONUÇ BULUNAMADI</p>
          <p className="text-[8px] uppercase tracking-wider text-center max-w-[200px]">Optik formunuz henüz okunmamış veya adınıza kayıtlı sonuç yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map(exam => (
            <button
              key={exam.id}
              onClick={() => handleOpenExam(exam)}
              disabled={loading}
              className="w-full bg-[#121a23] hover:bg-[#1a2535] border border-[#354a5f]/40 p-4 text-left transition-all rounded"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider">{exam.name}</p>
                  <p className="text-[9px] text-slate-500 mt-1 font-mono">
                    {exam.publisher || 'Kurum Yok'} · {EXAM_TYPE_LABELS[exam.examType]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {exam.appliedDate && (
                    <span className="text-[8px] text-slate-500 font-mono tracking-widest">{exam.appliedDate}</span>
                  )}
                  <span className="shrink-0 text-[14px] text-slate-400 transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentExamView;
