
import React, { useState, useCallback, useEffect } from 'react';
import {
  ExamPackage, ExamType, ExamSession, SessionType, ExamQuestion,
  StudentResponse, SubjectSummary, CompensationAlert, StudentField,
  TrafficLightStatus, ExamResult, SessionResult
} from '../types';
import { UserSession } from '../types';
import { buildSubjectSummaries, generateCompensationAlerts, getPercentileProjection } from '../utils';
import { autoTagQuestion, extractQuestionsFromImage } from '../services/geminiService';
import { LGS_SESSION_CONFIG, YKS_SESSION_CONFIG } from '../constants';
import { supabase } from '../services/supabaseClient';

interface Props {
  session: UserSession;
}

type View = 'LIST' | 'CREATE' | 'DETAIL';

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  LGS: 'LGS (8. Sınıf)',
  TYT: 'YKS - TYT',
  AYT: 'YKS - AYT',
  YDT: 'YKS - YDT',
  TARAMA_11: '11. Sınıf Tarama'
};

const TRAFFIC_COLORS: Record<TrafficLightStatus, { bg: string; text: string; label: string }> = {
  RED: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Acil' },
  YELLOW: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Dikkat' },
  GREEN: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Tamam' }
};

const TrafficDot: React.FC<{ status: TrafficLightStatus }> = ({ status }) => {
  const colors = { RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-green-500' };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
};

const FIELD_OPTIONS: { value: StudentField; label: string }[] = [
  { value: 'SAY', label: 'Sayısal' },
  { value: 'EA', label: 'Eşit Ağırlık' },
  { value: 'SÖZ', label: 'Sözel' },
  { value: 'DİL', label: 'Dil' }
];

const ExamModule: React.FC<Props> = ({ session }) => {
  const [view, setView] = useState<View>('LIST');
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ExamType>('LGS');
  const [formGrade, setFormGrade] = useState<number>(8);
  const [formDate, setFormDate] = useState('');

  const [demoResponses] = useState<StudentResponse[]>([]);
  const [studentField, setStudentField] = useState<StudentField | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);

  const [textInput, setTextInput] = useState('');
  const [textInputMode, setTextInputMode] = useState<'QUESTIONS' | 'ANSWERS' | null>(null);
  const [textSaved, setTextSaved] = useState(false);

  const handleTextSave = () => {
    if (!textInput.trim()) return;
    setTextSaved(true);
    setTimeout(() => setTextSaved(false), 2000);
  };

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Supabase'den sınavları yükle
  useEffect(() => {
    const fetchExams = async () => {
      setListLoading(true);
      const { data, error: fetchError } = await supabase
        .from('exams')
        .select(`*, exam_sessions(*)`)
        .eq('school_id', session.schoolId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError('Sınavlar yüklenirken hata oluştu: ' + fetchError.message);
      } else if (data) {
        const mapped: ExamPackage[] = data.map((row: any) => ({
          id: row.id,
          schoolId: row.school_id,
          name: row.name,
          examType: row.exam_type as ExamType,
          targetGrade: row.target_grade,
          appliedDate: row.applied_date,
          wrongPenaltyRatio: parseFloat(row.wrong_penalty_ratio),
          status: row.status,
          createdAt: new Date(row.created_at).getTime(),
          sessions: (row.exam_sessions ?? []).map((s: any) => ({
            id: s.id,
            examId: s.exam_id,
            sessionName: s.session_name as SessionType,
            durationMinutes: s.duration_minutes,
            questionCount: s.question_count,
            sessionOrder: s.session_order,
            questions: []
          }))
        }));
        setExams(mapped);
      }
      setListLoading(false);
    };
    fetchExams();
  }, [session.schoolId]);

  const getDefaultSessions = (examType: ExamType): Omit<ExamSession, 'id' | 'examId' | 'questions'>[] => {
    if (examType === 'LGS') {
      return [
        { sessionName: 'SÖZEL', durationMinutes: LGS_SESSION_CONFIG.SÖZEL.durationMinutes, questionCount: LGS_SESSION_CONFIG.SÖZEL.questionCount, sessionOrder: 1 },
        { sessionName: 'SAYISAL', durationMinutes: LGS_SESSION_CONFIG.SAYISAL.durationMinutes, questionCount: LGS_SESSION_CONFIG.SAYISAL.questionCount, sessionOrder: 2 }
      ];
    }
    if (examType === 'TYT') {
      return [{ sessionName: 'TYT', durationMinutes: YKS_SESSION_CONFIG.TYT.durationMinutes, questionCount: YKS_SESSION_CONFIG.TYT.questionCount, sessionOrder: 1 }];
    }
    if (examType === 'AYT') {
      return [
        { sessionName: 'TYT', durationMinutes: YKS_SESSION_CONFIG.TYT.durationMinutes, questionCount: YKS_SESSION_CONFIG.TYT.questionCount, sessionOrder: 1 },
        { sessionName: 'AYT', durationMinutes: YKS_SESSION_CONFIG.AYT.durationMinutes, questionCount: YKS_SESSION_CONFIG.AYT.questionCount, sessionOrder: 2 }
      ];
    }
    if (examType === 'YDT') {
      return [{ sessionName: 'YDT', durationMinutes: YKS_SESSION_CONFIG.YDT.durationMinutes, questionCount: YKS_SESSION_CONFIG.YDT.questionCount, sessionOrder: 1 }];
    }
    return [{ sessionName: 'TARAMA', durationMinutes: 90, questionCount: 40, sessionOrder: 1 }];
  };

  const handleCreate = async () => {
    if (!formName.trim()) { setError('Sınav adı zorunludur.'); return; }
    setLoading(true);
    setError(null);

    // 1. exams tablosuna ekle
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .insert({
        school_id: session.schoolId,
        name: formName.trim(),
        exam_type: formType,
        target_grade: formGrade,
        applied_date: formDate || null,
        wrong_penalty_ratio: formType === 'LGS' ? (1 / 3).toFixed(4) : (1 / 4).toFixed(4),
        status: 'PLANNED'
      })
      .select()
      .single();

    if (examError || !examData) {
      setError('Sınav kaydedilemedi: ' + (examError?.message ?? 'Bilinmeyen hata'));
      setLoading(false);
      return;
    }

    // 2. exam_sessions tablosuna oturumları ekle
    const defaultSessions = getDefaultSessions(formType);
    const sessionsToInsert = defaultSessions.map(s => ({
      exam_id: examData.id,
      session_name: s.sessionName,
      duration_minutes: s.durationMinutes,
      question_count: s.questionCount,
      session_order: s.sessionOrder
    }));

    const { data: sessionsData, error: sessionsError } = await supabase
      .from('exam_sessions')
      .insert(sessionsToInsert)
      .select();

    if (sessionsError) {
      setError('Oturumlar kaydedilemedi: ' + sessionsError.message);
      setLoading(false);
      return;
    }

    // 3. Local state'e ekle (Supabase'den tekrar fetch etmeye gerek kalmadan)
    const sessions: ExamSession[] = (sessionsData ?? []).map((s: any) => ({
      id: s.id,
      examId: s.exam_id,
      sessionName: s.session_name as SessionType,
      durationMinutes: s.duration_minutes,
      questionCount: s.question_count,
      sessionOrder: s.session_order,
      questions: []
    }));

    const newExam: ExamPackage = {
      id: examData.id,
      schoolId: examData.school_id,
      name: examData.name,
      examType: examData.exam_type as ExamType,
      targetGrade: examData.target_grade,
      appliedDate: examData.applied_date,
      wrongPenaltyRatio: parseFloat(examData.wrong_penalty_ratio),
      status: 'PLANNED',
      sessions,
      createdAt: new Date(examData.created_at).getTime()
    };

    setExams(prev => [newExam, ...prev]);
    setFormName('');
    setFormDate('');
    setView('LIST');
    setLoading(false);
  };

  const handleOcrUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedExam) return;
    setOcrLoading(true);
    setOcrError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const img = ev.target?.result as string;
        await extractQuestionsFromImage(img);
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'Görüntü işlenirken hata oluştu.');
      setOcrLoading(false);
    }
  }, [selectedExam]);

  const renderSubjectBar = (summary: SubjectSummary) => {
    const pct = Math.min(100, summary.successRate);
    let barColor = 'bg-green-500';
    if (pct < 40) barColor = 'bg-red-500';
    else if (pct < 70) barColor = 'bg-yellow-400';

    return (
      <div key={summary.subject} className="mb-2">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{summary.subject}</span>
          <span className="text-[9px] text-slate-500 font-mono">
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

  const renderCompensationAlerts = (alerts: CompensationAlert[]) => {
    if (alerts.length === 0) return null;
    return (
      <div className="mt-4">
        <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">TRAFİK IŞIĞI · RİSK HARİTASI</p>
        <div className="space-y-1">
          {alerts.map((alert, idx) => {
            const colors = TRAFFIC_COLORS[alert.status];
            return (
              <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 border ${colors.bg}`}>
                <TrafficDot status={alert.status} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[9px] font-black ${colors.text} uppercase`}>{alert.subject}</p>
                  <p className="text-[8px] text-slate-500 font-mono">
                    %{alert.successRate.toFixed(0)} · -{alert.lostPoints.toFixed(2)} puan
                  </p>
                </div>
                <span className={`text-[8px] font-black ${colors.text} shrink-0 uppercase`}>
                  {TRAFFIC_COLORS[alert.status].label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (view === 'DETAIL' && selectedExam) {
    const sessions = selectedExam.sessions ?? [];
    const allSummaries: SubjectSummary[] = sessions.flatMap(s =>
      buildSubjectSummaries(demoResponses, s.questions ?? [], selectedExam.examType, s.sessionName)
    );
    const alerts = generateCompensationAlerts(allSummaries, studentField, selectedExam.examType);
    const totalLost = allSummaries.reduce((acc, s) => acc + s.lostPoints, 0);
    const totalNet = allSummaries.reduce((acc, s) => acc + s.net, 0);
    const percentile = getPercentileProjection(totalNet, selectedExam.examType);

    return (
      <div className="p-3 md:p-5 max-w-2xl mx-auto">

        {/* Geri Butonu - Belirgin */}
        <button
          onClick={() => setView('LIST')}
          className="flex items-center gap-2 mb-4 px-3 py-1.5 bg-[#1a2535] border border-[#354a5f]/60 hover:bg-[#243040] hover:border-[#4a6a8a] transition-all"
        >
          <span className="text-slate-200 text-[10px]">←</span>
          <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest">GERİ</span>
        </button>

        <div className="flex flex-wrap items-start justify-between gap-2 mb-4 border-b border-[#354a5f]/40 pb-3">
          <div>
            <h1 className="text-[13px] font-black text-white uppercase tracking-[0.2em]">{selectedExam.name}</h1>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">{EXAM_TYPE_LABELS[selectedExam.examType]} · {selectedExam.appliedDate ?? '—'}</p>
          </div>
          {['TYT', 'AYT', 'YDT'].includes(selectedExam.examType) && (
            <div className="flex gap-1 flex-wrap">
              {FIELD_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setStudentField(f.value === studentField ? null : f.value)}
                  className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors border ${studentField === f.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/60 text-slate-300 hover:text-white hover:border-[#4a6a8a]'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {sessions.map(s => (
          <div key={s.id} className="mb-4 bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-3">
              {s.sessionName} OTURUMU <span className="text-slate-500 font-normal">{s.durationMinutes} dk · {s.questionCount} soru</span>
            </p>
            {buildSubjectSummaries(demoResponses, s.questions ?? [], selectedExam.examType, s.sessionName).map(renderSubjectBar)}
          </div>
        ))}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">TOPLAM NET</p>
            <p className="text-[18px] font-black text-white font-mono">{totalNet.toFixed(2)}</p>
          </div>
          <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">KAYIP PUAN</p>
            <p className="text-[18px] font-black text-red-400 font-mono">-{totalLost.toFixed(2)}</p>
          </div>
          {percentile && (
            <div className="bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">{percentile.year} PROJEKSİYON</p>
              <p className="text-[18px] font-black text-blue-400 font-mono">%{percentile.percentile.toFixed(1)}</p>
            </div>
          )}
        </div>

        {renderCompensationAlerts(alerts)}

        {/* SINAV KİTAPÇIĞI YÜKLE */}
        <div className="mt-4 bg-[#0d141b]/60 border border-[#354a5f]/30 p-3">
          <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.3em] mb-3">SINAV KİTAPÇIĞI YÜKLE</p>

          {/* Dosya Yükleme */}
          <div className="mb-3">
            <p className="text-[7px] text-slate-500 uppercase tracking-wider mb-1.5">DOSYA (JPG · PNG · PDF · DOC · DOCX)</p>
            {ocrError && <p className="text-red-400 text-[9px] mb-2">{ocrError}</p>}
            <label className="flex items-center justify-center h-8 px-4 bg-[#1a2535] hover:bg-[#243040] border border-[#354a5f]/50 cursor-pointer transition-colors text-[9px] text-slate-300 uppercase tracking-widest">
              {ocrLoading ? 'İŞLENİYOR...' : '+ DOSYA SEÇ'}
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleOcrUpload}
                disabled={ocrLoading}
              />
            </label>
          </div>

          {/* Düz Metin Girişi */}
          <div>
            <div className="flex gap-1 mb-1.5">
              <button
                onClick={() => setTextInputMode(textInputMode === 'QUESTIONS' ? null : 'QUESTIONS')}
                className={`px-2 py-1 text-[8px] font-black uppercase tracking-wider border transition-colors ${textInputMode === 'QUESTIONS' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/50 text-slate-400 hover:text-white'}`}
              >
                SORU METNİ YAPIŞTIRIL
              </button>
              <button
                onClick={() => setTextInputMode(textInputMode === 'ANSWERS' ? null : 'ANSWERS')}
                className={`px-2 py-1 text-[8px] font-black uppercase tracking-wider border transition-colors ${textInputMode === 'ANSWERS' ? 'bg-green-600 border-green-600 text-white' : 'bg-transparent border-[#354a5f]/50 text-slate-400 hover:text-white'}`}
              >
                CEVAP ANAHTARI YAPIŞTIRIL
              </button>
            </div>

            {textInputMode && (
              <div>
                <p className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">
                  {textInputMode === 'QUESTIONS'
                    ? 'Soru metinlerini buraya yapıştırın. Her soru yeni satırda olabilir.'
                    : 'Cevap anahtarını yapıştırın. Örnek: 1-A, 2-B, 3-C veya 1.A 2.B 3.C formatında.'}
                </p>
                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  rows={6}
                  placeholder={textInputMode === 'QUESTIONS'
                    ? '1. 120 ve 150 sayılarının EBOB\'u kaçtır?\nA) 10  B) 15  C) 30  D) 60\n\n2. ...'
                    : '1-C, 2-B, 3-B, 4-A, 5-A, 6-B...\nveya\nMAT: 1-C, 2-B, 3-B\nFEN: 1-D, 2-C, 3-B'}
                  className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-[10px] text-slate-200 font-mono focus:outline-none focus:border-blue-500/60 placeholder-slate-700 resize-none"
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[7px] text-slate-600 font-mono">{textInput.length} karakter</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setTextInput(''); setTextInputMode(null); }}
                      className="px-2 py-1 text-[8px] font-black text-slate-500 hover:text-white uppercase border border-[#354a5f]/40 hover:border-[#354a5f] transition-colors"
                    >
                      TEMİZLE
                    </button>
                    <button
                      onClick={handleTextSave}
                      disabled={!textInput.trim()}
                      className="px-3 py-1 text-[8px] font-black uppercase tracking-wider bg-blue-600/20 border border-blue-600/40 text-blue-300 hover:bg-blue-600 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {textSaved ? 'KAYDEDİLDİ ✓' : 'KAYDET VE İŞLE'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'CREATE') {
    return (
      <div className="p-3 md:p-5 max-w-lg mx-auto">
        <button
          onClick={() => setView('LIST')}
          className="flex items-center gap-2 mb-3 px-3 py-1.5 bg-[#1a2535] border border-[#354a5f]/60 hover:bg-[#243040] hover:border-[#4a6a8a] transition-all"
        >
          <span className="text-slate-200 text-[10px]">←</span>
          <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest">GERİ</span>
        </button>
        <p className="text-[11px] font-black text-white uppercase tracking-[0.3em] mb-4">YENİ SINAV OLUŞTUR</p>
        {error && <p className="text-red-400 text-[9px] mb-3 uppercase">{error}</p>}
        <div className="space-y-3">
          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">SINAV ADI *</p>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="LGS Deneme 1"
              className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-white text-[11px] focus:outline-none focus:border-blue-500/70 placeholder-slate-600"
            />
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">SINAV TİPİ</p>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
              {(Object.entries(EXAM_TYPE_LABELS) as [ExamType, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setFormType(val); setFormGrade(val === 'LGS' ? 8 : val === 'TARAMA_11' ? 11 : 12); }}
                  className={`px-2 py-2 text-[9px] font-black uppercase tracking-wider text-left transition-colors border ${formType === val ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-[#354a5f]/40 text-slate-400 hover:text-white hover:border-[#354a5f]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">UYGULAMA TARİHİ</p>
            <input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              className="w-full bg-[#0d141b] border border-[#354a5f]/50 px-3 py-2 text-white text-[11px] focus:outline-none focus:border-blue-500/70"
            />
          </div>

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

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full h-9 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-[9px] uppercase tracking-[0.3em] transition-colors"
          >
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
          <p className="text-[7px] text-slate-600 uppercase tracking-widest mt-0.5">LGS · YKS · TARAMA · DENEME ANALİZİ</p>
        </div>
        <button
          onClick={() => setView('CREATE')}
          className="h-8 px-4 bg-blue-600/10 border border-blue-600/30 hover:bg-blue-600 text-blue-400 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all"
        >
          + YENİ SINAV
        </button>
      </div>

      {error && <p className="text-red-400 text-[9px] mb-3 uppercase">{error}</p>}

      {exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          {listLoading ? (
            <p className="text-[9px] uppercase tracking-widest animate-pulse">YÜKLENIYOR...</p>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">SINAV YOK</p>
              <p className="text-[8px] uppercase tracking-wider">LGS ve YKS denemelerinizi buradan yönetin.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {exams.map(exam => (
            <button
              key={exam.id}
              onClick={() => { setSelectedExam(exam); setView('DETAIL'); }}
              className="w-full bg-[#0d141b]/60 hover:bg-[#0d141b] border border-[#354a5f]/30 hover:border-[#354a5f]/60 p-3 text-left transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black text-white uppercase tracking-wider">{exam.name}</p>
                  <p className="text-[8px] text-slate-500 mt-0.5 font-mono">{EXAM_TYPE_LABELS[exam.examType]} · {exam.sessions?.length ?? 0} OTURUM</p>
                </div>
                <span className={`shrink-0 text-[7px] font-black uppercase px-2 py-0.5 border ${exam.status === 'DONE' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-[#354a5f]/40 text-slate-500 bg-transparent'}`}>
                  {exam.status === 'DONE' ? 'TAMAMLANDI' : 'PLANLI'}
                </span>
              </div>
              {exam.appliedDate && (
                <p className="text-[7px] text-slate-600 mt-1.5 font-mono">{exam.appliedDate}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExamModule;
