
import React, { useState, useCallback, useEffect } from 'react';
import mammoth from 'mammoth';
import {
  ExamPackage, ExamType, ExamSession, SessionType, ExamQuestion,
  StudentResponse, SubjectSummary, CompensationAlert, StudentField,
  TrafficLightStatus, ClassSection
} from '../types';
import { UserSession } from '../types';
import { buildSubjectSummaries, generateCompensationAlerts, getPercentileProjection } from '../utils';
import { extractQuestionsFromImage } from '../services/geminiService';
import { LGS_SESSION_CONFIG, YKS_SESSION_CONFIG } from '../constants';
import { supabase } from '../services/supabaseClient';

interface Props {
  session: UserSession;
  classes?: ClassSection[];
}

type View = 'LIST' | 'CREATE' | 'DETAIL';

interface ParsedQuestion {
  questionNumber: number;
  questionText: string;
  subject: string;
}

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  LGS: 'LGS (8. Sınıf)',
  TYT: 'YKS - TYT',
  AYT: 'YKS - AYT',
  YDT: 'YKS - YDT',
  TARAMA_11: '11. Sınıf Tarama'
};

const TRAFFIC_COLORS: Record<TrafficLightStatus, { bg: string; text: string; label: string }> = {
  RED: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', label: 'ACİL' },
  YELLOW: { bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400', label: 'DİKKAT' },
  GREEN: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', label: 'TAMAM' }
};

const FIELD_OPTIONS: { value: StudentField; label: string }[] = [
  { value: 'SAY', label: 'SAY' },
  { value: 'EA', label: 'EA' },
  { value: 'SÖZ', label: 'SÖZ' },
  { value: 'DİL', label: 'DİL' }
];

function detectSubject(qNum: number, sessionName: SessionType, examType: ExamType): string {
  if (examType === 'LGS') {
    if (sessionName === 'SÖZEL') {
      if (qNum <= 20) return 'Türkçe';
      if (qNum <= 25) return 'T.C. İnkılap';
      if (qNum <= 30) return 'Din Kültürü';
      return 'Yabancı Dil';
    }
    if (sessionName === 'SAYISAL') {
      if (qNum <= 20) return 'Matematik';
      return 'Fen Bilimleri';
    }
  }
  if (examType === 'TYT' || sessionName === 'TYT') {
    if (qNum <= 40) return 'Türkçe';
    if (qNum <= 60) return 'Sosyal Bilimler';
    if (qNum <= 100) return 'Temel Matematik';
    return 'Fen Bilimleri';
  }
  return 'Genel';
}

function parseAnswerKey(text: string): Record<number, string> {
  const map: Record<number, string> = {};
  const regex = /(\d+)[.\-\),]\s*([A-Ea-e])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    map[parseInt(match[1])] = match[2].toUpperCase();
  }
  return map;
}

function parseQuestionsFromText(text: string, sessionName: SessionType, examType: ExamType): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentQ: ParsedQuestion | null = null;
  const qStartRegex = /^(\d+)[.\)]\s+(.+)/;

  for (const line of lines) {
    const match = line.match(qStartRegex);
    if (match) {
      if (currentQ) questions.push(currentQ);
      const num = parseInt(match[1]);
      currentQ = {
        questionNumber: num,
        questionText: match[2],
        subject: detectSubject(num, sessionName, examType)
      };
    } else if (currentQ && line.match(/^[A-E]\)|^[A-E]\)/i)) {
      currentQ.questionText += '\n' + line;
    }
  }
  if (currentQ) questions.push(currentQ);
  return questions.length > 0 ? questions : [];
}

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 mb-4 px-3 py-1.5 bg-[#1a2535] border border-[#354a5f]/60 hover:bg-[#243040] hover:border-[#4a6a8a] transition-all"
  >
    <span className="text-slate-200 text-[11px]">←</span>
    <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest">GERİ</span>
  </button>
);

const ExamModule: React.FC<Props> = ({ session, classes = [] }) => {
  const [view, setView] = useState<View>('LIST');
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ExamType>('LGS');
  const [formGrade, setFormGrade] = useState<number>(8);
  const [formDate, setFormDate] = useState('');
  const [formClassIds, setFormClassIds] = useState<string[]>([]);

  // Detail state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [studentField, setStudentField] = useState<StudentField | null>(null);

  // Upload state
  const [uploadSection, setUploadSection] = useState<'BOOKLET' | 'ANSWERS' | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSeconds, setOcrSeconds] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);

  // Answer key
  const [answerText, setAnswerText] = useState('');
  const [answerPreview, setAnswerPreview] = useState<Record<number, string>>({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [answersSaved, setAnswersSaved] = useState(false);

  // Supabase: load exams
  useEffect(() => {
    const fetch = async () => {
      setListLoading(true);
      const { data, error: e } = await supabase
        .from('exams')
        .select('*, exam_sessions(*)')
        .eq('school_id', session.schoolId)
        .order('created_at', { ascending: false });

      if (!e && data) {
        setExams(data.map((row: any) => ({
          id: row.id,
          schoolId: row.school_id,
          name: row.name,
          examType: row.exam_type as ExamType,
          targetGrade: row.target_grade,
          appliedDate: row.applied_date,
          wrongPenaltyRatio: parseFloat(row.wrong_penalty_ratio),
          status: row.status,
          classIds: row.class_ids ?? [],
          createdAt: new Date(row.created_at).getTime(),
          sessions: (row.exam_sessions ?? [])
            .sort((a: any, b: any) => a.session_order - b.session_order)
            .map((s: any) => ({
              id: s.id,
              examId: s.exam_id,
              sessionName: s.session_name as SessionType,
              durationMinutes: s.duration_minutes,
              questionCount: s.question_count,
              sessionOrder: s.session_order,
              questions: []
            }))
        })));
      } else if (e) {
        setError('Sınavlar yüklenemedi: ' + e.message);
      }
      setListLoading(false);
    };
    fetch();
  }, [session.schoolId]);

  // Load questions when session selected
  useEffect(() => {
    if (!selectedSessionId) { setQuestions([]); return; }
    setQuestionsLoading(true);
    supabase
      .from('exam_questions')
      .select('*')
      .eq('session_id', selectedSessionId)
      .order('question_number')
      .then(({ data, error: e }) => {
        if (!e && data) {
          setQuestions(data.map((q: any) => ({
            id: q.id,
            sessionId: q.session_id,
            questionNumber: q.question_number,
            subject: q.subject,
            correctAnswer: q.correct_answer,
            pointWeight: parseFloat(q.point_weight ?? 1),
            aiAnalysisStatus: q.ai_analysis_status,
            aiConfidenceScore: q.ai_confidence_score,
            questionText: q.question_text
          })));
        }
        setQuestionsLoading(false);
      });
  }, [selectedSessionId]);

  const getDefaultSessions = (examType: ExamType) => {
    if (examType === 'LGS') return [
      { sessionName: 'SÖZEL' as SessionType, durationMinutes: LGS_SESSION_CONFIG.SÖZEL.durationMinutes, questionCount: LGS_SESSION_CONFIG.SÖZEL.questionCount, sessionOrder: 1 },
      { sessionName: 'SAYISAL' as SessionType, durationMinutes: LGS_SESSION_CONFIG.SAYISAL.durationMinutes, questionCount: LGS_SESSION_CONFIG.SAYISAL.questionCount, sessionOrder: 2 }
    ];
    if (examType === 'TYT') return [{ sessionName: 'TYT' as SessionType, durationMinutes: 165, questionCount: 120, sessionOrder: 1 }];
    if (examType === 'AYT') return [
      { sessionName: 'TYT' as SessionType, durationMinutes: 165, questionCount: 120, sessionOrder: 1 },
      { sessionName: 'AYT' as SessionType, durationMinutes: 180, questionCount: 80, sessionOrder: 2 }
    ];
    if (examType === 'YDT') return [{ sessionName: 'YDT' as SessionType, durationMinutes: 120, questionCount: 80, sessionOrder: 1 }];
    return [{ sessionName: 'TARAMA' as SessionType, durationMinutes: 90, questionCount: 40, sessionOrder: 1 }];
  };

  const handleCreate = async () => {
    if (!formName.trim()) { setError('Sınav adı zorunludur.'); return; }
    setLoading(true); setError(null);

    const { data: examData, error: examErr } = await supabase
      .from('exams')
      .insert({
        school_id: session.schoolId,
        name: formName.trim(),
        exam_type: formType,
        target_grade: formGrade,
        applied_date: formDate || null,
        wrong_penalty_ratio: formType === 'LGS' ? '0.3333' : '0.2500',
        status: 'PLANNED',
        class_ids: formClassIds.length > 0 ? formClassIds : null
      })
      .select().single();

    if (examErr || !examData) { setError('Kayıt hatası: ' + examErr?.message); setLoading(false); return; }

    const { data: sessData, error: sessErr } = await supabase
      .from('exam_sessions')
      .insert(getDefaultSessions(formType).map(s => ({
        exam_id: examData.id,
        session_name: s.sessionName,
        duration_minutes: s.durationMinutes,
        question_count: s.questionCount,
        session_order: s.sessionOrder
      })))
      .select();

    if (sessErr) { setError('Oturum hatası: ' + sessErr.message); setLoading(false); return; }

    const newExam: ExamPackage = {
      id: examData.id, schoolId: examData.school_id, name: examData.name,
      examType: examData.exam_type, targetGrade: examData.target_grade,
      appliedDate: examData.applied_date,
      wrongPenaltyRatio: parseFloat(examData.wrong_penalty_ratio),
      status: 'PLANNED', classIds: formClassIds,
      sessions: (sessData ?? []).map((s: any) => ({
        id: s.id, examId: s.exam_id, sessionName: s.session_name,
        durationMinutes: s.duration_minutes, questionCount: s.question_count,
        sessionOrder: s.session_order, questions: []
      })),
      createdAt: Date.now()
    };

    setExams(prev => [newExam, ...prev]);
    setFormName(''); setFormDate(''); setFormClassIds([]);
    setView('LIST'); setLoading(false);
  };

  // DOCX / Image upload → parse questions
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSessionId || !selectedExam) return;
    setOcrLoading(true); setOcrError(null); setParsedQuestions([]); setOcrSeconds(0);

    const timer = setInterval(() => setOcrSeconds(s => s + 1), 1000);

    const session_ = selectedExam.sessions?.find(s => s.id === selectedSessionId);
    const sessionName = session_?.sessionName ?? 'SÖZEL' as SessionType;

    try {
      let parsed: ParsedQuestion[] = [];

      if (file.name.toLowerCase().match(/\.(docx?|doc)$/)) {
        // DOCX → mammoth
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        parsed = parseQuestionsFromText(result.value, sessionName, selectedExam.examType);
        if (parsed.length === 0) {
          setOcrError('Belgeden soru tespit edilemedi. Soru formatı: "1. Soru metni" şeklinde olmalı.');
        }
      } else {
        // Image/PDF → Gemini OCR
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = async (ev) => {
            try {
              const img = ev.target?.result as string;
              const geminiResult = await extractQuestionsFromImage(img);
              parsed = geminiResult.map(q => ({
                ...q,
                subject: detectSubject(q.questionNumber, sessionName, selectedExam.examType)
              }));
              resolve();
            } catch (err) { reject(err); }
          };
          reader.onerror = () => reject(new Error('Dosya okunamadı.'));
          reader.readAsDataURL(file);
        });
      }

      setParsedQuestions(parsed);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'İşlem sırasında hata oluştu.');
    } finally {
      clearInterval(timer);
      setOcrLoading(false);
      e.target.value = '';
    }
  }, [selectedSessionId, selectedExam]);

  const handleSaveQuestions = async () => {
    if (!selectedSessionId || parsedQuestions.length === 0) return;
    setSavingQuestions(true);

    // Remove duplicates based on question_number
    const uniqueQuestions = Array.from(new Map(parsedQuestions.map(q => [q.questionNumber, q])).values());

    const toInsert = uniqueQuestions.map(q => ({
      session_id: selectedSessionId,
      question_number: q.questionNumber,
      subject: q.subject,
      question_text: q.questionText,
      point_weight: 1.0,
      ai_analysis_status: 'PENDING'
    }));

    const { data, error: insErr } = await supabase
      .from('exam_questions')
      .upsert(toInsert, { onConflict: 'session_id,question_number' })
      .select();

    if (insErr) {
      setOcrError('Sorular kaydedilemedi: ' + insErr.message);
    } else {
      setQuestions((data ?? []).map((q: any) => ({
        id: q.id, sessionId: q.session_id, questionNumber: q.question_number,
        subject: q.subject, correctAnswer: q.correct_answer,
        pointWeight: parseFloat(q.point_weight ?? 1),
        aiAnalysisStatus: q.ai_analysis_status,
        questionText: q.question_text
      })));
      setParsedQuestions([]);
      setUploadSection(null);
    }
    setSavingQuestions(false);
  };

  const handleParseAnswerKey = () => {
    const map = parseAnswerKey(answerText);
    setAnswerPreview(map);
  };

  const handleDeleteExam = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (showDeleteConfirm === id) {
      setLoading(true);
      const { error: delErr } = await supabase.from('exams').delete().eq('id', id);
      if (!delErr) {
        setExams(prev => prev.filter(ex => ex.id !== id));
      } else {
        setError('Silme işlemi başarısız: ' + delErr.message);
      }
      setShowDeleteConfirm(null);
      setLoading(false);
    } else {
      setShowDeleteConfirm(id);
    }
  };

  const handleSaveAnswers = async () => {
    if (Object.keys(answerPreview).length === 0 || !selectedSessionId) return;
    setSavingAnswers(true);

    const updates = Object.entries(answerPreview).map(([num, ans]) =>
      supabase.from('exam_questions')
        .update({ correct_answer: ans })
        .eq('session_id', selectedSessionId)
        .eq('question_number', parseInt(num))
    );

    await Promise.all(updates);

    setQuestions(prev => prev.map(q => ({
      ...q,
      correctAnswer: answerPreview[q.questionNumber] ?? q.correctAnswer
    })));
    setAnswersSaved(true);
    setAnswerText('');
    setAnswerPreview({});
    setTimeout(() => { setAnswersSaved(false); setUploadSection(null); }, 1500);
    setSavingAnswers(false);
  };

  const renderSubjectBar = (summary: SubjectSummary) => {
    const pct = Math.min(100, summary.successRate);
    const barColor = pct < 40 ? 'bg-red-500' : pct < 70 ? 'bg-yellow-400' : 'bg-green-500';
    return (
      <div key={summary.subject} className="mb-2">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{summary.subject}</span>
          <span className="text-[9px] text-slate-400 font-mono">
            {summary.correct}D·{summary.wrong}Y·{summary.empty}B &nbsp;NET: <span className="text-white">{summary.net.toFixed(2)}</span>
          </span>
        </div>
        <div className="w-full h-1 bg-[#1a2535] overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        {summary.lostPoints > 0 && (
          <p className="text-[8px] text-red-400 mt-0.5 font-mono">-{summary.lostPoints.toFixed(2)} puan kayıp</p>
        )}
      </div>
    );
  };

  if (view === 'DETAIL' && selectedExam) {
    const sessions = selectedExam.sessions ?? [];
    const activeSession = sessions.find(s => s.id === selectedSessionId) ?? sessions[0];
    const demoResponses: StudentResponse[] = [];
    const allSummaries: SubjectSummary[] = sessions.flatMap(s =>
      buildSubjectSummaries(demoResponses, s.questions ?? [], selectedExam.examType, s.sessionName)
    );
    const alerts = generateCompensationAlerts(allSummaries, studentField, selectedExam.examType);
    const totalLost = allSummaries.reduce((a, s) => a + s.lostPoints, 0);
    const totalNet = allSummaries.reduce((a, s) => a + s.net, 0);
    const percentile = getPercentileProjection(totalNet, selectedExam.examType);
    const answeredCount = questions.filter(q => q.correctAnswer).length;

    return (
      <div className="p-3 md:p-5 max-w-3xl mx-auto">
        <BackButton onClick={() => { setView('LIST'); setSelectedSessionId(null); setQuestions([]); setParsedQuestions([]); setUploadSection(null); }} />

        <div className="flex flex-wrap items-start justify-between gap-2 mb-4 border-b border-[#354a5f]/40 pb-3">
          <div>
            <p className="text-[13px] font-black text-white uppercase tracking-[0.2em]">{selectedExam.name}</p>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">{EXAM_TYPE_LABELS[selectedExam.examType]} · {selectedExam.appliedDate ?? '—'}</p>
          </div>
          {['TYT', 'AYT', 'YDT'].includes(selectedExam.examType) && (
            <div className="flex gap-1">
              {FIELD_OPTIONS.map(f => (
                <button key={f.value}
                  onClick={() => setStudentField(f.value === studentField ? null : f.value)}
                  className={`px-2 py-1 text-[8px] font-black uppercase border transition-colors ${studentField === f.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/50 text-slate-400 hover:text-white'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Oturum sekmeleri */}
        <div className="flex gap-1 mb-3">
          {sessions.map(s => (
            <button key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border transition-colors ${selectedSessionId === s.id || (!selectedSessionId && s === sessions[0]) ? 'bg-[#1a2535] border-[#354a5f] text-white' : 'bg-transparent border-[#354a5f]/30 text-slate-500 hover:text-slate-300'}`}>
              {s.sessionName} <span className="text-slate-600 ml-1 font-normal">{s.questionCount}S</span>
            </button>
          ))}
        </div>

        {/* Aktif oturum: Soru listesi */}
        <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">
              {activeSession?.sessionName} SORULARI
              <span className="text-slate-500 font-normal ml-2">{questions.length} soru yüklü · {answeredCount} cevap girildi</span>
            </p>
            {questions.length > 0 && answeredCount < questions.length && (
              <span className="text-[7px] text-yellow-400 uppercase">⚠ {questions.length - answeredCount} cevap eksik</span>
            )}
          </div>

          {questionsLoading ? (
            <p className="text-[8px] text-slate-600 animate-pulse uppercase tracking-widest py-3">YÜKLENIYOR...</p>
          ) : questions.length === 0 ? (
            <p className="text-[8px] text-slate-600 uppercase tracking-wider py-2">Henüz soru yüklenmedi. Aşağıdan kitapçık yükleyin.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {questions.map(q => (
                <div key={q.id} className="flex items-center gap-2 py-0.5 border-b border-[#1a2535]">
                  <span className="text-[8px] text-slate-600 font-mono w-6 shrink-0">{q.questionNumber}.</span>
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider w-20 shrink-0">{q.subject}</span>
                  <span className="text-[8px] text-slate-400 flex-1 truncate font-mono">{q.questionText?.slice(0, 60) ?? '—'}</span>
                  <span className={`text-[9px] font-black w-6 text-right shrink-0 ${q.correctAnswer ? 'text-green-400' : 'text-slate-700'}`}>
                    {q.correctAnswer ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kitapçık + Cevap Anahtarı */}
        <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3 mb-3">
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setUploadSection(uploadSection === 'BOOKLET' ? null : 'BOOKLET')}
              className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-wider border transition-colors ${uploadSection === 'BOOKLET' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/50 text-slate-300 hover:text-white'}`}>
              + KİTAPÇIK YÜKLE
            </button>
            <button
              onClick={() => setUploadSection(uploadSection === 'ANSWERS' ? null : 'ANSWERS')}
              className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-wider border transition-colors ${uploadSection === 'ANSWERS' ? 'bg-green-600 border-green-600 text-white' : 'bg-transparent border-[#354a5f]/50 text-slate-300 hover:text-white'}`}>
              + CEVAP ANAHTARI
            </button>
          </div>

          {/* Kitapçık yükleme paneli */}
          {uploadSection === 'BOOKLET' && (
            <div>
              <p className="text-[7px] text-slate-500 uppercase tracking-wider mb-2">
                DOSYA (DOCX · DOC · JPG · PNG · PDF) veya metin yapıştır
              </p>
              {ocrError && <p className="text-red-400 text-[9px] mb-2">{ocrError}</p>}

              <label className="flex items-center justify-center h-8 px-4 bg-[#1a2535] hover:bg-[#243040] border border-[#354a5f]/50 cursor-pointer transition-colors text-[9px] text-slate-300 uppercase tracking-widest mb-2">
                {ocrLoading ? `İŞLENİYOR... (${ocrSeconds} sn)` : '+ DOSYA SEÇ'}
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={ocrLoading}
                />
              </label>

              {parsedQuestions.length > 0 && (
                <div>
                  <p className="text-[8px] text-green-400 mb-1.5 uppercase">{parsedQuestions.length} soru tespit edildi</p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5 mb-2">
                    {parsedQuestions.slice(0, 10).map(q => (
                      <div key={q.questionNumber} className="flex gap-2 text-[8px]">
                        <span className="text-slate-600 font-mono w-5">{q.questionNumber}.</span>
                        <span className="text-slate-500 w-20 uppercase">{q.subject}</span>
                        <span className="text-slate-400 truncate flex-1">{q.questionText.slice(0, 50)}</span>
                      </div>
                    ))}
                    {parsedQuestions.length > 10 && <p className="text-[7px] text-slate-600">...ve {parsedQuestions.length - 10} soru daha</p>}
                  </div>
                  <button
                    onClick={handleSaveQuestions}
                    disabled={savingQuestions}
                    className="w-full h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[9px] font-black text-white uppercase tracking-wider transition-colors"
                  >
                    {savingQuestions ? 'KAYDEDİLİYOR...' : `${parsedQuestions.length} SORUYU KAYDET`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cevap anahtarı paneli */}
          {uploadSection === 'ANSWERS' && (
            <div>
              <p className="text-[7px] text-slate-500 uppercase tracking-wider mb-1.5">
                FORMAT: 1-A, 2-B, 3-C &nbsp;veya&nbsp; 1.A 2.B 3.C &nbsp;veya&nbsp; 1)A 2)B &nbsp;veya&nbsp; 1,A 2,B
              </p>
              <textarea
                value={answerText}
                onChange={e => { setAnswerText(e.target.value); setAnswerPreview({}); }}
                rows={4}
                placeholder="1-A, 2-B, 3-C, 4-D, 5-A, 6-B, 7-C, 8-D..."
                className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-[10px] text-slate-200 font-mono focus:outline-none focus:border-blue-500/60 placeholder-slate-700 resize-none mb-2"
              />
              <div className="flex gap-1 justify-between items-center">
                <span className="text-[7px] text-slate-600 font-mono">{Object.keys(answerPreview).length > 0 ? `${Object.keys(answerPreview).length} cevap okundu` : `${answerText.length} karakter`}</span>
                <div className="flex gap-1">
                  <button
                    onClick={handleParseAnswerKey}
                    disabled={!answerText.trim()}
                    className="px-3 py-1 text-[8px] font-black uppercase border border-[#354a5f]/50 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    ÖNZLE
                  </button>
                  <button
                    onClick={handleSaveAnswers}
                    disabled={Object.keys(answerPreview).length === 0 || savingAnswers}
                    className="px-3 py-1 text-[8px] font-black uppercase bg-green-600/20 border border-green-600/40 text-green-300 hover:bg-green-600 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    {answersSaved ? 'KAYDEDILDI ✓' : savingAnswers ? 'UYGULANYOR...' : `${Object.keys(answerPreview).length} CEVABI UYGULA`}
                  </button>
                </div>
              </div>
              {Object.keys(answerPreview).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(answerPreview).slice(0, 20).map(([num, ans]) => (
                    <span key={num} className="text-[8px] font-mono bg-[#1a2535] px-1.5 py-0.5 text-slate-300">
                      {num}<span className="text-green-400">:{ans}</span>
                    </span>
                  ))}
                  {Object.keys(answerPreview).length > 20 && (
                    <span className="text-[7px] text-slate-600">+{Object.keys(answerPreview).length - 20} daha</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Net Özet */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">TOPLAM NET</p>
            <p className="text-[18px] font-black text-white font-mono">{totalNet.toFixed(2)}</p>
          </div>
          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">KAYIP PUAN</p>
            <p className="text-[18px] font-black text-red-400 font-mono">-{totalLost.toFixed(2)}</p>
          </div>
          {percentile ? (
            <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">{percentile.year} DİLİM</p>
              <p className="text-[18px] font-black text-blue-400 font-mono">%{percentile.percentile.toFixed(1)}</p>
            </div>
          ) : (
            <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3 flex items-center justify-center">
              <p className="text-[7px] text-slate-600 uppercase text-center">Öğrenci yanıtı<br />bekleniyor</p>
            </div>
          )}
        </div>

        {/* Trafik Işığı */}
        {alerts.length > 0 && (
          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">TRAFİK IŞIĞI · RİSK HARİTASI</p>
            <div className="space-y-1">
              {alerts.map((a, i) => {
                const c = TRAFFIC_COLORS[a.status];
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 border ${c.bg}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.status === 'RED' ? 'bg-red-500' : a.status === 'YELLOW' ? 'bg-yellow-400' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[9px] font-black ${c.text} uppercase`}>{a.subject}</p>
                      <p className="text-[8px] text-slate-500 font-mono">%{a.successRate.toFixed(0)} · -{a.lostPoints.toFixed(2)} puan</p>
                    </div>
                    <span className={`text-[8px] font-black ${c.text} shrink-0`}>{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'CREATE') {
    return (
      <div className="p-3 md:p-5 max-w-lg mx-auto">
        <BackButton onClick={() => setView('LIST')} />
        <p className="text-[11px] font-black text-white uppercase tracking-[0.3em] mb-4">YENİ SINAV OLUŞTUR</p>
        {error && <p className="text-red-400 text-[9px] mb-3 uppercase">{error}</p>}

        <div className="space-y-3">
          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">SINAV ADI *</p>
            <input value={formName} onChange={e => setFormName(e.target.value)}
              placeholder="LGS Deneme 1"
              className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-white text-[11px] focus:outline-none focus:border-blue-500/70 placeholder-slate-600" />
          </div>

          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">SINAV TİPİ</p>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
              {(Object.entries(EXAM_TYPE_LABELS) as [ExamType, string][]).map(([val, label]) => (
                <button key={val}
                  onClick={() => { setFormType(val); setFormGrade(val === 'LGS' ? 8 : val === 'TARAMA_11' ? 11 : 12); }}
                  className={`px-2 py-2 text-[9px] font-black uppercase tracking-wider text-left border transition-colors ${formType === val ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/40 text-slate-400 hover:text-white hover:border-[#354a5f]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">UYGULAMA TARİHİ</p>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
              className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-white text-[11px] focus:outline-none focus:border-blue-500/70" />
          </div>

          {classes.length > 0 && (
            <div>
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">SINIF ATAMALARI (opsiyonel)</p>
              <div className="flex flex-wrap gap-1">
                {classes.map(cls => (
                  <button key={cls.id}
                    onClick={() => setFormClassIds(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id])}
                    className={`px-2 py-1 text-[8px] font-black uppercase border transition-colors ${formClassIds.includes(cls.id) ? 'bg-blue-600/30 border-blue-500/60 text-blue-300' : 'bg-transparent border-[#354a5f]/40 text-slate-500 hover:text-slate-300'}`}>
                    {cls.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">OTOMATİK OTURUM YAPISI</p>
            {getDefaultSessions(formType).map((s, i) => (
              <div key={i} className="flex justify-between text-[9px] py-1 border-b border-[#354a5f]/20 last:border-0">
                <span className="text-slate-300 font-black uppercase tracking-widest">{s.sessionName}</span>
                <span className="text-slate-400 font-mono">{s.durationMinutes} dk · {s.questionCount} soru</span>
              </div>
            ))}
            <p className="text-[7px] text-slate-400 mt-2 uppercase tracking-wider">
              Penaltı: {formType === 'LGS' ? '3 Yanlış = 1 Doğru' : '4 Yanlış = 1 Doğru'}
            </p>
          </div>

          <button onClick={handleCreate} disabled={loading}
            className="w-full h-9 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-[9px] uppercase tracking-[0.3em] transition-colors">
            {loading ? 'KAYDEDİLİYOR...' : 'SINAVI OLUŞTUR'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[13px] font-black text-white uppercase tracking-[0.3em]">SINAVLAR</p>
          <p className="text-[7px] text-slate-500 uppercase tracking-widest mt-0.5">LGS · YKS · TARAMA · DENEME ANALİZİ</p>
        </div>
        <button onClick={() => setView('CREATE')}
          className="h-8 px-4 bg-blue-600/10 border border-blue-600/30 hover:bg-blue-600 text-blue-400 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all">
          + YENİ SINAV
        </button>
      </div>

      {error && <p className="text-red-400 text-[9px] mb-3 uppercase">{error}</p>}

      {listLoading ? (
        <p className="text-[9px] uppercase tracking-widest text-slate-600 animate-pulse py-16 text-center">YÜKLENIYOR...</p>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <p className="text-[10px] font-black uppercase tracking-widest mb-1">SINAV YOK</p>
          <p className="text-[8px] uppercase tracking-wider">LGS ve YKS denemelerinizi buradan yönetin.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {exams.map(exam => {
            const totalQ = (exam.sessions ?? []).reduce((a, s) => a + (s.questionCount ?? 0), 0);
            return (
              <div key={exam.id} className="relative group">
                <button
                  onClick={() => {
                    setSelectedExam(exam);
                    const firstSession = exam.sessions?.[0];
                    if (firstSession) setSelectedSessionId(firstSession.id);
                    setView('DETAIL');
                  }}
                  className="w-full bg-[#0d141b]/60 hover:bg-[#0d141b] border border-[#354a5f]/30 hover:border-[#354a5f]/60 p-3 pr-10 text-left transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-wider">{exam.name}</p>
                      <p className="text-[8px] text-slate-500 mt-0.5 font-mono">{EXAM_TYPE_LABELS[exam.examType]} · {exam.sessions?.length ?? 0} OTURUM · {totalQ} SORU</p>
                    </div>
                    <span className={`shrink-0 text-[7px] font-black uppercase px-2 py-0.5 border ${exam.status === 'DONE' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-[#354a5f]/40 text-slate-500'}`}>
                      {exam.status === 'DONE' ? 'TAMAMLANDI' : 'PLANLI'}
                    </span>
                  </div>
                  {exam.appliedDate && <p className="text-[7px] text-slate-600 mt-1.5 font-mono">{exam.appliedDate}</p>}
                </button>
                <button
                  onClick={(e) => handleDeleteExam(e, exam.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 transition-all ${showDeleteConfirm === exam.id ? 'text-white bg-red-600' : 'text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100'}`}
                  title={showDeleteConfirm === exam.id ? 'EMİN MİSİNİZ?' : 'SİL'}
                >
                  <i className={`fa-solid ${showDeleteConfirm === exam.id ? 'fa-triangle-exclamation animate-pulse' : 'fa-trash'}`}></i>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExamModule;
