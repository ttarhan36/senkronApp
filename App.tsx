
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Teacher, ScheduleEntry, ClassSection, Lesson, ModuleType, ShiftType, SchoolConfig, Student, GradeRecord, Gender, AttendanceRecord, UserRole, LessonLog, Exam, GradeMetadata, SubscriptionStatus, UserSession, Course, Announcement, ThemeConfig, ThemeMode } from './types';
import { SCHOOL_DNA as DEFAULT_DNA } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TeachersModule from './components/TeachersModule';
import ClassesModule from './components/ClassesModule';
import LessonsModule from './components/LessonsModule';
import SchedulingModule from './components/SchedulingModule';
import ClassSchedulesModule from './components/ClassSchedulesModule';
import ChatPanel from './components/ChatPanel';
import SettingsModule from './components/SettingsModule';
import GuardDutyModule from './components/GuardDutyModule';
import CommunicationModule from './components/CommunicationModule';
import CoursesModule from './components/CoursesModule';
import AuthTerminal from './components/Auth/AuthTerminal';
import CredentialsModule from './components/CredentialsModule';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import AbsenceReportModule from './components/AbsenceReportModule';
import LandingPage from './components/LandingPage';
import ExamModule from './components/ExamModule';
import StudentExamView from './components/StudentExamView';
import { supabase } from './services/supabaseClient';
import { standardizeBranchCode, standardizeDayCode } from './utils';

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() => {
    // QR kod ile giriş yapılıyorsa mevcut oturumu temizle
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'qrlimit') {
      localStorage.removeItem('senkron_session');
      return null;
    }
    const saved = localStorage.getItem('senkron_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [showAuth, setShowAuth] = useState(false);

  const authProcessingRef = useRef(false);
  const sessionRef = useRef(session);

  // sessionRef'i güncel tut
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      // SIGNED_OUT: Çıkış
      if (event === 'SIGNED_OUT') {
        setSession(null);
        localStorage.removeItem('senkron_session');
        setShowAuth(true); // Redirect to login page on sign out
        authProcessingRef.current = false;
        return;
      }

      // SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && authSession?.user) {
        // Zaten bir session varsa veya işlem devam ediyorsa, tekrar çalıştırma
        const existingSession = localStorage.getItem('senkron_session');
        if (existingSession && sessionRef.current) return;
        if (authProcessingRef.current) return;
        authProcessingRef.current = true;

        const user = authSession.user;
        let userRole = UserRole.ADMIN;
        let schoolId = '';
        let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'KULLANICI';
        let subscriptionStatus = SubscriptionStatus.TRIALING;
        let trialEndsAtMs = 0;

        try {
          // 1. Profil tablosunu kontrol et (en güvenilir kaynak)
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('*, schools!inner(subscription_status, trial_ends_at)')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profile) {
            // Mevcut kullanıcı — profili kullan
            userRole = (profile.role as UserRole) || UserRole.ADMIN;
            schoolId = profile.school_id;
            fullName = profile.full_name;
            const schoolData = (profile as any).schools;
            if (schoolData) {
              let currentStatus = schoolData.subscription_status;
              let currentTrialEnds = schoolData.trial_ends_at;

              // EĞER MEVCUT OKULDA VERİ YOKSA (Eski kayıtlar) -> OTO-AKTİVASYON
              if (!currentStatus || !currentTrialEnds) {
                const trialDays = 14;
                const trialEnds = new Date();
                trialEnds.setDate(trialEnds.getDate() + trialDays);
                currentStatus = SubscriptionStatus.TRIALING;
                currentTrialEnds = trialEnds.toISOString();

                // Veritabanını sessizce güncelle (background repair)
                supabase.from('schools').update({
                  subscription_status: currentStatus,
                  trial_ends_at: currentTrialEnds
                }).eq('id', schoolId).then(({ error }) => {
                  if (error) console.error("School metadata auto-repair failed:", error);
                });
              }

              const trialEndsAt = new Date(currentTrialEnds).getTime();
              const now = Date.now();
              const status = (trialEndsAt < now && currentStatus === SubscriptionStatus.TRIALING)
                ? SubscriptionStatus.EXPIRED
                : currentStatus;

              subscriptionStatus = status as SubscriptionStatus;
              trialEndsAtMs = trialEndsAt;
            }
          }
          // 2. Metadata'da var mı? (profil oluşturulmuş ama tablo sorgusu başarısız olmuş olabilir)
          else if (user.user_metadata?.school_id) {
            schoolId = user.user_metadata.school_id;
            userRole = (user.user_metadata.role as UserRole) || UserRole.ADMIN;
            fullName = user.user_metadata.full_name || fullName;

            // Metadata var ama profil yok — abonelik bilgilerini okul tablosundan al
            const { data: sData } = await supabase.from('schools').select('*').eq('id', schoolId).maybeSingle();
            if (sData) {
              let currentStatus = sData.subscription_status;
              let currentTrialEnds = sData.trial_ends_at;

              if (!currentStatus || !currentTrialEnds) {
                const trialEnds = new Date();
                trialEnds.setDate(trialEnds.getDate() + 14);
                currentStatus = SubscriptionStatus.TRIALING;
                currentTrialEnds = trialEnds.toISOString();
                await supabase.from('schools').update({ subscription_status: currentStatus, trial_ends_at: currentTrialEnds }).eq('id', schoolId);
              }

              const trialEndsAt = new Date(currentTrialEnds).getTime();
              const now = Date.now();
              subscriptionStatus = (trialEndsAt < now && currentStatus === SubscriptionStatus.TRIALING) ? SubscriptionStatus.EXPIRED : currentStatus as SubscriptionStatus;
              trialEndsAtMs = trialEndsAt;
            }

            // Profili yeniden oluştur (eksik kalmış olabilir)
            await supabase.from('user_profiles').upsert({
              user_id: user.id,
              school_id: schoolId,
              full_name: fullName.toUpperCase(),
              role: userRole
            }, { onConflict: 'user_id' });
          }
          // 3. HİÇBİR KAYIT YOKSA -> OTOMATİK ADMİN KAYDI YAP (Google ile ilk giriş)
          else {
            console.log("Yeni Google kullanıcısı tespit edildi, otomatik okul kaydı oluşturuluyor...");
            schoolId = `SCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
            const newSchoolName = (fullName + " OKULU").toUpperCase();

            const trialDays = 14;
            const trialEnds = new Date();
            trialEnds.setDate(trialEnds.getDate() + trialDays);

            // Sırayla kayıt oluştur (race condition önlemi)
            // Önce okul
            const { error: schoolErr } = await supabase.from('schools').upsert(
              {
                id: schoolId,
                name: newSchoolName,
                subscription_status: SubscriptionStatus.TRIALING,
                trial_ends_at: trialEnds.toISOString()
              },
              { onConflict: 'id' }
            );
            if (schoolErr) console.error("School insert error:", schoolErr);

            subscriptionStatus = SubscriptionStatus.TRIALING;
            trialEndsAtMs = trialEnds.getTime();

            // Sonra config
            const { error: configErr } = await supabase.from('school_config').upsert(
              { school_id: schoolId, config_json: DEFAULT_DNA },
              { onConflict: 'school_id' }
            );
            if (configErr) console.error("Config insert error:", configErr);

            // Son olarak profil (upsert ile mükerrer önlenir)
            const { error: profileErr } = await supabase.from('user_profiles').upsert({
              user_id: user.id,
              school_id: schoolId,
              full_name: fullName.toUpperCase(),
              role: UserRole.ADMIN
            }, { onConflict: 'user_id' });
            if (profileErr) console.error("Profile insert error:", profileErr);

            // Kullanıcı metadatasını güncelle ki sonraki girişlerde db araması gerekmesin
            await supabase.auth.updateUser({
              data: { school_id: schoolId, role: UserRole.ADMIN, full_name: fullName.toUpperCase() }
            });
          }

          if (schoolId) {
            const newSession: UserSession = {
              role: userRole,
              id: user.id,
              name: fullName.toUpperCase(),
              schoolId: schoolId,
              email: user.email,
              subscriptionStatus: subscriptionStatus,
              trialEndsAt: trialEndsAtMs
            };
            setSession(newSession);
            localStorage.setItem('senkron_session', JSON.stringify(newSession));
          }
        } catch (err) {
          console.error("Google Login Auto-Register Error:", err);
        } finally {
          authProcessingRef.current = false;
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []); // Artık session'a bağımlı değil — stale closure sorunu çözüldü


  const [activeModule, setActiveModule] = useState<ModuleType>(
    session?.role === UserRole.STUDENT ? ModuleType.STUDENT_OVERVIEW :
      session?.role === UserRole.TEACHER ? ModuleType.TEACHER_OVERVIEW :
        ModuleType.DASHBOARD
  );

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>(DEFAULT_DNA);
  const [finalSchedule, setFinalSchedule] = useState<ScheduleEntry[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(!!session);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false); // Yeni durum: Arka plan yüklemesi
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [successStamp, setSuccessStamp] = useState<string | null>(null);

  const isDataInitialized = useRef(false);
  const syncTimeoutRef = useRef<number | null>(null);

  const syncNow = async () => {
    if (!isDataInitialized.current || !session) return;
    setIsSyncing(true);
    try {
      // Classes tablosu lesson_logs ile birlikte kaydedilir
      await saveToSupabase('classes', classes.map(({ students, ...c }) => ({
        ...c,
        lessonLogs: c.lessonLogs || [] // Ensure valid array
      })));

      const allStudents = classes.flatMap(cls =>
        (cls.students || []).map(s => {
          const stName = (s.name || '').toUpperCase().trim();
          // GÜVENLİK: Eğer öğrencinin mevcut school_id'si farklı bir okula aitse, bu öğrenciyi SENKRONLAMA
          const existingSchoolId = (s as any).school_id;
          if (existingSchoolId && existingSchoolId !== session.schoolId) {
            console.warn(`[SCHOOL_ID_MISMATCH] Öğrenci ${s.name} (${s.number}) farklı okula ait: ${existingSchoolId} vs ${session.schoolId}. Atlama yapılıyor.`);
            return null; // Bu öğrenciyi atla
          }
          return { ...s, class_id: cls.id, school_id: session.schoolId, name: stName, full_name: stName };
        }).filter(Boolean)
      );

      await Promise.all([
        saveToSupabase('teachers', teachers),
        saveToSupabase('lessons', lessons),
        saveToSupabase('courses', courses),
        saveToSupabase('announcements', announcements),
        saveToSupabase('schedule', finalSchedule),
        saveToSupabase('school_config', { config_json: schoolConfig }),
        allStudents.length > 0 ? saveToSupabase('students', allStudents) : Promise.resolve()
      ]);
      setDbError(null);
    } catch (e) {
      console.error("SYNC_FATAL:", e);
      setDbError("SENK_HATASI");
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerSuccess = (msg: string = "MÜHÜRLENDİ") => {
    setSuccessStamp(msg);
    setTimeout(() => setSuccessStamp(null), 1200);
  };

  const deleteFromSupabase = async (table: string, id: string) => {
    if (!session) return;
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      triggerSuccess("VERİ_SİLİNDİ");
    } catch (err) {
      console.error(`Delete Error [${table}]:`, err);
      setDbError(`ERR_DELETE_${table.toUpperCase()}`);
    }
  };

  const deleteScheduleFromSupabase = async (className: string, day: string, hour: number) => {
    if (!session) return;
    try {
      const stdDay = standardizeDayCode(day);
      const { error } = await supabase.from('schedule').delete().match({
        school_id: session.schoolId,
        sinif: className,
        gun: stdDay,
        ders_saati: hour
      });
      if (error) throw error;
    } catch (err) {
      console.error("Delete Schedule Error:", err);
      setDbError("ERR_DELETE_SCHEDULE");
    }
  };

  const mapFromDB = (table: string, data: any[]) => {
    if (!data) return [];
    return data.map(item => {
      const newItem: any = { ...item };
      if (table === 'teachers') {
        newItem.name = item.name || item.full_name || 'İSİMSİZ';
        newItem.branchShorts = Array.isArray(item.branch_shorts) ? item.branch_shorts : [item.branch_short || 'GENEL'];
        newItem.preferredShift = item.preferred_shift || ShiftType.SABAH;
        newItem.blockedSlots = item.blocked_slots || [];
        newItem.guardDuties = item.guard_duties || [];
        newItem.isExemptFromDuty = !!item.is_exempt_from_duty;
        newItem.lessonCount = Number(item.lesson_count || 0);
        newItem.username = item.username || '';
        newItem.password = item.password || '';
      }
      if (table === 'classes') {
        // DB'den gelen lesson_logs'u state'e aktar
        newItem.lessonLogs = item.lesson_logs || [];
      }
      if (table === 'students') {
        newItem.name = item.name || item.full_name || 'İSİMSİZ';
        newItem.parentName = item.parent_name || '';
        newItem.parentPhone = item.parent_phone || '';
        newItem.attendanceCount = Number(item.attendance_count || 0);
        // Ensure defaults if heavy data hasn't loaded yet
        newItem.attendanceHistory = item.attendance_history || [];
        newItem.grades = Array.isArray(item.grades) ? item.grades : [];
        newItem.observations = item.observations || [];
        newItem.courseIds = item.course_ids || [];
        newItem.username = item.username || '';
        newItem.password = item.password || '';
      }
      if (table === 'schedule') {
        newItem.ders_saati = Number(item.ders_saati || 0);
        newItem.isManual = !!item.is_manual;
        newItem.gun = standardizeDayCode(item.gun);
      }
      if (table === 'announcements') {
        newItem.isPinned = !!item.is_pinned;
        newItem.readCount = Number(item.read_count || 0);

        // Veritabanı "bigint" (sayı) döner, ancak eski kayıtlar string olabilir.
        if (item.timestamp) {
          if (typeof item.timestamp === 'string') {
            // Eski ISO string kayıtlarını kurtarmak için
            const date = new Date(item.timestamp);
            if (!isNaN(date.getTime())) {
              newItem.timestamp = date.getTime();
            } else {
              // String içinde sayı varsa parse et
              newItem.timestamp = parseInt(item.timestamp) || Date.now();
            }
          } else {
            // Doğrudan sayı gelirse
            newItem.timestamp = Number(item.timestamp);
          }
        } else {
          newItem.timestamp = Date.now();
        }
      }
      return newItem;
    });
  };

  const mapToDB = (table: string, item: any) => {
    const sid = session?.schoolId;
    if (!sid) return null;

    // GÜVENLİK: Eğer kaydın mevcut school_id'si farklı bir okula aitse, bu kaydı KAYDETME
    if (item.school_id && item.school_id !== sid) {
      console.warn(`[CROSS_SCHOOL_BLOCK] ${table} kaydı farklı okula ait: ${item.school_id} vs ${sid}. Kayıt engellendi.`);
      return null;
    }

    let dbItem: any = { school_id: sid };
    if (table === 'teachers') {
      dbItem.id = item.id;
      const tName = (item.name || 'İSİMSİZ').toUpperCase().trim();
      dbItem.name = tName;
      dbItem.full_name = tName;
      dbItem.branch = String(item.branch || item.branchShort || 'GENEL');
      dbItem.branch_short = String(item.branchShort || item.branch || 'GENEL');
      dbItem.branch_shorts = Array.isArray(item.branchShorts) ? item.branchShorts : [dbItem.branch_short];
      dbItem.preferred_shift = item.preferred_shift || 'SABAH';
      dbItem.lesson_count = Number(item.lessonCount || 22);
      dbItem.is_exempt_from_duty = !!item.isExemptFromDuty;
      dbItem.guard_duties = item.guardDuties || [];
      dbItem.blocked_slots = item.blockedSlots || [];
      dbItem.gender = item.gender || 'MALE';
      // CREDENTIALS MAPPING
      dbItem.username = item.username || null;
      dbItem.password = item.password || null;
    } else if (table === 'classes') {
      dbItem.id = item.id;
      dbItem.name = item.name.toUpperCase();
      dbItem.grade = Number(item.grade || 9);
      dbItem.type = String(item.type || 'ANADOLU').toUpperCase();
      dbItem.shift = item.shift || 'SABAH';
      dbItem.assignments = item.assignments || [];
      dbItem.exams = item.exams || [];
      // LESSON LOGS MAPPING
      dbItem.lesson_logs = item.lessonLogs || [];
    } else if (table === 'students') {
      dbItem.id = item.id;
      dbItem.number = String(item.number);
      const studentName = String(item.name || item.full_name || 'İSİMSİZ').toUpperCase().trim();
      dbItem.name = studentName;
      dbItem.full_name = studentName;
      dbItem.gender = item.gender || 'MALE';
      dbItem.class_id = item.class_id || item.classId;
      dbItem.parent_name = (item.parentName || '').toUpperCase();
      dbItem.parent_phone = String(item.parentPhone || '');
      dbItem.grades = item.grades || [];
      dbItem.attendance_count = Number(item.attendanceCount || 0);
      dbItem.attendance_history = item.attendanceHistory || [];
      dbItem.observations = item.observations || [];
      dbItem.course_ids = item.courseIds || [];
      // CREDENTIALS MAPPING
      dbItem.username = item.username || item.number;
      dbItem.password = item.password || item.number;
    } else if (table === 'lessons') {
      dbItem.id = item.id;
      dbItem.name = item.name.toUpperCase();
      dbItem.branch = String(item.branch || 'GENEL');
      dbItem.hours = Number(item.hours || 2);
    } else if (table === 'schedule') {
      dbItem.sinif = item.sinif;
      dbItem.gun = standardizeDayCode(item.gun);
      dbItem.ders_saati = Number(item.ders_saati);
      dbItem.ders = item.ders;
      dbItem.ogretmen = item.ogretmen;
      dbItem.shift = item.shift || 'SABAH';
      dbItem.is_manual = !!item.isManual;
    } else if (table === 'announcements') {
      dbItem.id = item.id;
      dbItem.title = item.title.toUpperCase();
      dbItem.content = item.content;
      dbItem.type = item.type;
      dbItem.category = item.category;
      // DÜZELTME: Veritabanı 'bigint' bekliyor, artık sayı (milisaniye) olarak gönderiyoruz.
      dbItem.timestamp = item.timestamp || Date.now();
      dbItem.audience = item.audience || 'ALL';
      dbItem.is_pinned = !!item.isPinned;
      dbItem.read_count = Number(item.readCount || 0);

      // location sütunu veritabanında yoksa hata verir, geçici olarak kapatıyoruz.
      // SQL ile sütunu eklerseniz bu satırı açabilirsiniz: 
      // dbItem.location = item.location || ''; 
    } else if (table === 'courses') {
      dbItem.id = item.id;
      dbItem.name = item.name.toUpperCase();
      dbItem.teacher_name = item.teacherName;
      dbItem.capacity = Number(item.capacity || 20);
      dbItem.enrolled_count = Number(item.enrolledCount || 0);
      dbItem.schedule = item.schedule || '';
      dbItem.category = item.category || 'AKADEMİK';
      dbItem.location = item.location || '';
    } else if (table === 'school_config') {
      dbItem.config_json = item.config_json || item;
    }
    return dbItem;
  };

  const saveToSupabase = async (table: string, data: any) => {
    if (!session || !isDataInitialized.current) return;
    try {
      const dbData = Array.isArray(data) ? data.map(i => mapToDB(table, i)).filter(Boolean) : [mapToDB(table, data)].filter(Boolean);
      if (dbData.length === 0 && table !== 'schedule') return;

      const { error } = await supabase.from(table).upsert(dbData, { onConflict: table === 'schedule' ? 'school_id,sinif,gun,ders_saati' : table === 'school_config' ? 'school_id' : 'id' });

      if (error) {
        console.error(`DB Write Fail [${table}]:`, error.message);
        // Hata detayını yakala
        if (error.code === '42703') { // Undefined column
          setDbError(`DB_ŞEMA_HATASI: ${table.toUpperCase()} tablosunda sütun eksik.`);
        } else {
          setDbError(`ERR_${table.toUpperCase()}`);
        }
        throw error;
      }
    } catch (err: any) { console.error(`Supabase Fatal:`, err); throw err; }
  };

  const distributeStudentsToClasses = (students: Student[], classesData: ClassSection[]) => {
    const studentsByClass: Record<string, Student[]> = {};

    for (const s of students) {
      const cId = s.class_id || s.classId;
      if (cId) {
        if (!studentsByClass[cId]) studentsByClass[cId] = [];
        studentsByClass[cId].push(s);
      }
    }

    return classesData.map(cls => ({
      ...cls,
      students: studentsByClass[cls.id] || cls.students || [],
      assignments: cls.assignments || [],
      exams: cls.exams || [],
      lessonLogs: cls.lessonLogs || []
    }));
  };

  const fetchData = async (schoolId: string) => {
    setIsLoading(true);
    setDbError(null);
    try {
      // 1. AŞAMA: HAFİF VERİ YÜKLEMESİ
      const [tRes, cRes, lRes, sResLite, crsRes, annRes, schRes, cfgRes] = await Promise.all([
        supabase.from('teachers').select('*').eq('school_id', schoolId),
        supabase.from('classes').select('*').eq('school_id', schoolId),
        supabase.from('lessons').select('*').eq('school_id', schoolId),
        supabase.from('students').select('id, number, name, full_name, gender, class_id, parent_name, parent_phone, attendance_count, course_ids, username, password').eq('school_id', schoolId),
        supabase.from('courses').select('*').eq('school_id', schoolId),
        supabase.from('announcements').select('*').eq('school_id', schoolId).order('timestamp', { ascending: false }),
        supabase.from('schedule').select('*').eq('school_id', schoolId),
        supabase.from('school_config').select('*').eq('school_id', schoolId).maybeSingle()
      ]);

      setTeachers(mapFromDB('teachers', tRes.data || []));
      setLessons(mapFromDB('lessons', lRes.data || []));
      setCourses(mapFromDB('courses', crsRes.data || []));
      setAnnouncements(mapFromDB('announcements', annRes.data || []));
      setFinalSchedule(mapFromDB('schedule', schRes.data || []));
      setSchoolConfig(cfgRes.data?.config_json || DEFAULT_DNA);

      const mappedClasses = mapFromDB('classes', cRes.data || []);
      const liteStudents = mapFromDB('students', sResLite.data || []);
      const initialClasses = distributeStudentsToClasses(liteStudents, mappedClasses);

      setClasses(initialClasses);
      isDataInitialized.current = true;
      triggerSuccess("DNA_BAĞLANDI");
      setIsLoading(false);

      // 2. AŞAMA: ARKA PLAN DETAY YÜKLEMESİ (Heavy Fetch)
      setIsBackgroundLoading(true);
      let heavyQuery = supabase.from('students')
        .select('id, class_id, grades, attendance_history, observations')
        .eq('school_id', schoolId);

      // OPTIMIZASYON: Eğer öğrenci ise sadece kendi verisini çeksin
      if (session?.role === UserRole.STUDENT) {
        heavyQuery = heavyQuery.eq('id', session.id);
      }

      const sResHeavy = await heavyQuery;

      if (sResHeavy.data && sResHeavy.data.length > 0) {
        const heavyDataMap: Record<string, any> = {};
        sResHeavy.data.forEach((item: any) => {
          heavyDataMap[item.id] = item;
        });

        setClasses(prevClasses => {
          return prevClasses.map(cls => ({
            ...cls,
            students: (cls.students || []).map(st => {
              const heavyDetails = heavyDataMap[st.id];
              if (heavyDetails) {
                // Merge Helper: Combines local changes (st) with DB data (heavyDetails), preventing overwrite of new entries
                const mergeById = (local: any[], remote: any[]) => {
                  const localMap = new Map(local.map(i => [i.id, i]));
                  remote.forEach(r => {
                    if (!localMap.has(r.id)) localMap.set(r.id, r);
                  });
                  return Array.from(localMap.values());
                };

                const mergeGrades = (local: any[], remote: any[]) => {
                  const localMap = new Map(local.map(g => [g.lessonId, g]));
                  remote.forEach(r => {
                    if (!localMap.has(r.lessonId)) localMap.set(r.lessonId, r);
                  });
                  return Array.from(localMap.values());
                };

                return {
                  ...st,
                  grades: mergeGrades(st.grades || [], heavyDetails.grades || []),
                  attendanceHistory: mergeById(st.attendanceHistory || [], heavyDetails.attendance_history || []),
                  observations: mergeById(st.observations || [], heavyDetails.observations || [])
                };
              }
              return st;
            })
          }));
        });
        setIsBackgroundLoading(false);
      }

    } catch (e: any) { console.error("Master Fetch Error:", e); setDbError("BAĞLANTI_HATASI"); setIsLoading(false); isDataInitialized.current = true; }
  };

  // ... (handleImportStudents, handleHardReset unchanged)

  const handleImportStudents = (
    newStudents: Student[],
    subeMap: Record<string, string>,
    shiftMap: Record<string, ShiftType>
  ) => {
    setClasses(prevClasses => {
      const updatedClasses = prevClasses.map(c => ({ ...c, students: [...(c.students || [])] }));

      newStudents.forEach(student => {
        const targetClassName = subeMap[student.id] || '9-A';
        const targetShift = shiftMap[student.id] || ShiftType.SABAH;

        let targetClass = updatedClasses.find(c => c.name === targetClassName);

        if (!targetClass) {
          const grade = parseInt(targetClassName.match(/\d+/)?.[0] || '9');
          targetClass = {
            id: `C-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: targetClassName,
            grade: grade,
            type: 'ANADOLU',
            shift: targetShift,
            students: [],
            assignments: [],
            exams: [],
            lessonLogs: []
          };
          updatedClasses.push(targetClass);
        }

        const studentWithClass = { ...student, classId: targetClass.id, class_id: targetClass.id };
        if (!targetClass.students) targetClass.students = [];
        targetClass.students.push(studentWithClass);
      });

      return updatedClasses.sort((a, b) => a.name.localeCompare(b.name));
    });
    triggerSuccess(`${newStudents.length} ÖĞRENCİ İÇERİ AKTARILDI`);
  };

  const handleHardReset = async () => {
    if (!session) return;
    setIsSyncing(true);
    try {
      const sid = session.schoolId;
      await Promise.all([
        supabase.from('schedule').delete().eq('school_id', sid),
        supabase.from('announcements').delete().eq('school_id', sid),
        supabase.from('students').delete().eq('school_id', sid),
      ]);
      await Promise.all([
        supabase.from('classes').delete().eq('school_id', sid),
        supabase.from('teachers').delete().eq('school_id', sid),
        supabase.from('lessons').delete().eq('school_id', sid),
        supabase.from('courses').delete().eq('school_id', sid),
      ]);
      await supabase.from('school_config').upsert({ school_id: sid, config_json: DEFAULT_DNA });

      setTeachers([]);
      setClasses([]);
      setLessons([]);
      setCourses([]);
      setAnnouncements([]);
      setFinalSchedule([]);
      setSchoolConfig(DEFAULT_DNA);
      triggerSuccess("SİSTEM FABRİKA AYARLARINA DÖNDÜRÜLDÜ");
    } catch (error) {
      console.error("Hard Reset Error:", error);
      setDbError("SIFIRLAMA_BAŞARISIZ");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreDNA = async (payload: any) => {
    if (!session) return;
    setIsSyncing(true);
    try {
      const sid = session.schoolId;
      // 1. Önce eski tüm verileri sil
      await Promise.all([
        supabase.from('schedule').delete().eq('school_id', sid),
        supabase.from('announcements').delete().eq('school_id', sid),
        supabase.from('students').delete().eq('school_id', sid),
      ]);
      await Promise.all([
        supabase.from('classes').delete().eq('school_id', sid),
        supabase.from('teachers').delete().eq('school_id', sid),
        supabase.from('lessons').delete().eq('school_id', sid),
        supabase.from('courses').delete().eq('school_id', sid),
      ]);

      // 2. Yedek verileri state'e yükle
      const restoredTeachers = payload.teachers || [];
      const restoredClasses = payload.classes || [];
      const restoredLessons = payload.lessons || [];
      const restoredCourses = payload.courses || [];
      const restoredAnnouncements = payload.announcements || [];
      const restoredSchedule = payload.schedule || [];
      const restoredConfig = payload.config || DEFAULT_DNA;

      setTeachers(restoredTeachers);
      setClasses(restoredClasses);
      setLessons(restoredLessons);
      setCourses(restoredCourses);
      setAnnouncements(restoredAnnouncements);
      setFinalSchedule(restoredSchedule);
      setSchoolConfig(restoredConfig);

      // 3. Yeni verileri veritabanına yaz
      // Config
      await supabase.from('school_config').upsert({ school_id: sid, config_json: restoredConfig });

      // Teachers
      if (restoredTeachers.length > 0) {
        await saveToSupabase('teachers', restoredTeachers);
      }

      // Lessons
      if (restoredLessons.length > 0) {
        await saveToSupabase('lessons', restoredLessons);
      }

      // Classes (öğrenciler hariç)
      if (restoredClasses.length > 0) {
        await saveToSupabase('classes', restoredClasses.map(({ students, ...c }: any) => ({
          ...c,
          lessonLogs: c.lessonLogs || []
        })));

        // Students
        const allStudents = restoredClasses.flatMap((cls: any) =>
          (cls.students || []).map((s: any) => ({
            ...s,
            class_id: cls.id,
            school_id: sid,
            name: (s.name || s.full_name || 'İSİMSİZ').toUpperCase(),
            full_name: (s.name || s.full_name || 'İSİMSİZ').toUpperCase()
          }))
        );
        if (allStudents.length > 0) {
          await saveToSupabase('students', allStudents);
        }
      }

      // Courses
      if (restoredCourses.length > 0) {
        await saveToSupabase('courses', restoredCourses);
      }

      // Announcements
      if (restoredAnnouncements.length > 0) {
        await saveToSupabase('announcements', restoredAnnouncements);
      }

      // Schedule
      if (restoredSchedule.length > 0) {
        await saveToSupabase('schedule', restoredSchedule);
      }

      triggerSuccess("DNA_RESTORASYONU_BAŞARILI");
    } catch (error) {
      console.error("Restorasyon Hatası:", error);
      setDbError("RESTORASYON_BAŞARISIZ");
      // Hata durumunda verileri tekrar çek
      await fetchData(session.schoolId);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => { if (session) fetchData(session.schoolId); }, [session?.schoolId]);

  useEffect(() => {
    if (!isDataInitialized.current || !session) return;
    if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
    // Reduced timeout to 1000ms to prevent data loss on quick navigation
    syncTimeoutRef.current = window.setTimeout(() => { syncNow(); }, 1000);
    return () => { if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current); };
  }, [teachers, classes, lessons, courses, announcements, finalSchedule, schoolConfig, session]);

  const [theme, setTheme] = useState<ThemeConfig>({ mode: ThemeMode.DARK, fontFamily: 'JetBrains Mono', fontScale: 1.0, accentColor: '#3b82f6', gridOpacity: 0.1, isGlowEnabled: true, borderThickness: 1 });

  const isAdmin = useMemo(() => {
    if (!session?.role) return false;
    const r = String(session.role).toUpperCase();
    return r === 'ADMIN' || r === 'İDARECİ' || r === 'IDARECI' || r === 'YÖNETİCİ' || session.role === UserRole.ADMIN;
  }, [session]);


  if (!session) {
    if (showAuth) {
      return (
        <AuthTerminal
          onAuthSuccess={(s) => {
            setSession(s);
            localStorage.setItem('senkron_session', JSON.stringify(s));
            fetchData(s.schoolId);
            setActiveModule(s.role === UserRole.STUDENT ? ModuleType.STUDENT_OVERVIEW : s.role === UserRole.TEACHER ? ModuleType.TEACHER_OVERVIEW : ModuleType.DASHBOARD);
          }}
          triggerSuccess={triggerSuccess}
          onBackToLanding={() => setShowAuth(false)}
        />
      );
    }
    return <LandingPage onLoginClick={() => setShowAuth(true)} />;
  }


  if (isLoading) return (
    <div className="h-screen w-screen bg-[#080c10] flex flex-col items-center justify-center p-4 bg-grid-hatched">
      <div className="w-16 h-16 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_#3b82f6]"></div>
      <span className="text-[10px] font-black text-white uppercase tracking-[0.4em] animate-pulse">DNA_BULUTTAN_İNDİRİLİYOR...</span>
    </div>
  );

  const renderModule = () => {
    if (!session) return null;

    // SaaS Expiry Block
    const isExpired = session.subscriptionStatus === SubscriptionStatus.EXPIRED;

    // Yalnızca ADMIN abonelik uyarısını görsün, diğer roller (öğrenci/öğretmen) giriş yapamasın veya bloklansın
    if (isExpired && activeModule !== ModuleType.SUBSCRIPTION_REQUIRED) {
      setActiveModule(ModuleType.SUBSCRIPTION_REQUIRED);
    }

    const commonProps = { editMode: isAdmin ? editMode : false, onWatchModeAttempt: () => triggerSuccess("YETKİ_SINIRI"), onSuccess: triggerSuccess };

    if (session.role === UserRole.STUDENT) {
      let studentTab: 'GENEL' | 'DEVAMSIZLIK' | 'KONULAR' | 'SINAVLAR' | 'NOTLARIM' | 'KURSLAR' | 'ANALIZ' = 'GENEL';
      if (activeModule === ModuleType.STUDENT_ATTENDANCE) studentTab = 'DEVAMSIZLIK';
      if (activeModule === ModuleType.STUDENT_TOPICS) studentTab = 'KONULAR';
      if (activeModule === ModuleType.STUDENT_EXAMS) studentTab = 'SINAVLAR';
      if (activeModule === ModuleType.STUDENT_GRADES) studentTab = 'NOTLARIM';
      if (activeModule === ModuleType.STUDENT_COURSES) studentTab = 'KURSLAR';
      if (activeModule === ModuleType.STUDENT_ANALYSIS) studentTab = 'ANALIZ';

      if (activeModule === ModuleType.COMMUNICATION) {
        return <CommunicationModule announcements={announcements} setAnnouncements={setAnnouncements} classes={classes} userRole={session.role} currentUserId={session.id} {...commonProps} />;
      }
      if (activeModule === ModuleType.CLASS_SCHEDULES) {
        return <ClassSchedulesModule schedule={finalSchedule} setSchedule={setFinalSchedule} onDeleteScheduleEntry={deleteScheduleFromSupabase} classes={classes} lessons={lessons} teachers={teachers} schoolConfig={schoolConfig} editMode={false} onSuccess={triggerSuccess} userRole={session.role} initialClass={classes.find(c => c.students?.some(s => s.number === session.id))?.name} />;
      }
      if (activeModule === ModuleType.STUDENT_EXAMS) {
        return <StudentExamView session={session} />;
      }

      return <Dashboard teachers={teachers} classes={classes} setClasses={setClasses} lessons={lessons} schedule={finalSchedule} setActiveModule={setActiveModule} announcements={announcements} userRole={session.role} userName={session.name} userId={session.id} courses={courses} setCourses={setCourses} onSuccess={triggerSuccess} studentTab={studentTab} subscriptionStatus={session.subscriptionStatus} trialEndsAt={session.trialEndsAt} />;
    }

    if (session.role === UserRole.TEACHER) {
      if (activeModule === ModuleType.TEACHER_OVERVIEW ||
        activeModule === ModuleType.TEACHER_AGENDA ||
        activeModule === ModuleType.TEACHER_CLASSES ||
        activeModule === ModuleType.TEACHER_EXAMS ||
        activeModule === ModuleType.TEACHER_SCHEDULE ||
        activeModule === ModuleType.TEACHER_CONSTRAINTS ||
        activeModule === ModuleType.TEACHER_PERFORMANCE ||
        activeModule === ModuleType.TEACHER_STUDENTS) {

        let teacherTab = 'GENEL';
        if (activeModule === ModuleType.TEACHER_AGENDA) teacherTab = 'AJANDA';
        if (activeModule === ModuleType.TEACHER_CLASSES) teacherTab = 'ŞUBE';
        if (activeModule === ModuleType.TEACHER_EXAMS) teacherTab = 'SINAV';
        if (activeModule === ModuleType.TEACHER_SCHEDULE) teacherTab = 'PLAN';
        if (activeModule === ModuleType.TEACHER_CONSTRAINTS) teacherTab = 'KISIT';
        if (activeModule === ModuleType.TEACHER_PERFORMANCE) teacherTab = 'PERF';
        if (activeModule === ModuleType.TEACHER_STUDENTS) teacherTab = 'ÖĞRENCİ';

        return <TeachersModule teachers={teachers} setTeachers={setTeachers} classes={classes} setClasses={setClasses} schedule={finalSchedule} allClasses={classes} allLessons={lessons} schoolConfig={schoolConfig} onDeleteTeacherDB={(id) => deleteFromSupabase('teachers', id)} userRole={session?.role} currentUserId={session?.id} activeTab={teacherTab} {...commonProps} />;
      }
    }

    switch (activeModule) {
      case ModuleType.DASHBOARD: return <Dashboard teachers={teachers} classes={classes} setClasses={setClasses} lessons={lessons} schedule={finalSchedule} setActiveModule={setActiveModule} announcements={announcements} userRole={session?.role} userName={session?.name} userId={session?.id} courses={courses} setCourses={setCourses} onSuccess={triggerSuccess} subscriptionStatus={session?.subscriptionStatus} trialEndsAt={session?.trialEndsAt} />;
      case ModuleType.TEACHERS: return <TeachersModule teachers={teachers} setTeachers={setTeachers} classes={classes} setClasses={setClasses} schedule={finalSchedule} allClasses={classes} allLessons={lessons} schoolConfig={schoolConfig} onDeleteTeacherDB={(id) => deleteFromSupabase('teachers', id)} userRole={session?.role} currentUserId={session?.id} {...commonProps} />;
      case ModuleType.CLASSES: return <ClassesModule classes={classes} setClasses={setClasses} allLessons={lessons} setLessons={setLessons} allTeachers={teachers} setTeachers={setTeachers} schedule={finalSchedule} setSchedule={setFinalSchedule} schoolConfig={schoolConfig} courses={courses} setCourses={setCourses} userRole={session?.role} userId={session?.id} onDeleteStudentDB={(id) => deleteFromSupabase('students', id)} onDeleteClassDB={(id) => deleteFromSupabase('classes', id)} {...commonProps} />;
      case ModuleType.COURSES: return <CoursesModule courses={courses} setCourses={setCourses} teachers={teachers} announcements={announcements} setAnnouncements={setAnnouncements} classes={classes} {...commonProps} />;
      case ModuleType.LESSONS: return <LessonsModule lessons={lessons} setLessons={setLessons} allTeachers={teachers} setTeachers={setTeachers} allClasses={classes} setClasses={setClasses} schedule={finalSchedule} courses={courses} setCourses={setCourses} {...commonProps} />;
      case ModuleType.CREDENTIALS: return <CredentialsModule onSuccess={triggerSuccess} schoolId={session.schoolId} />;
      case ModuleType.SCHEDULING: return <SchedulingModule teachers={teachers} classes={classes} lessons={lessons} onApprove={async (s) => { setFinalSchedule(s); triggerSuccess("MÜHÜRLENDİ"); setActiveModule(ModuleType.CLASS_SCHEDULES); }} schoolConfig={schoolConfig} />;
      case ModuleType.GUARD_DUTY: return <GuardDutyModule teachers={teachers} setTeachers={setTeachers} schedule={finalSchedule} schoolConfig={schoolConfig} currentUserId={session?.id} {...commonProps} />;
      case ModuleType.CLASS_SCHEDULES: return <ClassSchedulesModule schedule={finalSchedule} setSchedule={setFinalSchedule} onDeleteScheduleEntry={deleteScheduleFromSupabase} classes={classes} lessons={lessons} teachers={teachers} schoolConfig={schoolConfig} editMode={isAdmin && editMode} onSuccess={triggerSuccess} userRole={session?.role} />;
      case ModuleType.ABSENCE_REPORT: return <AbsenceReportModule classes={classes} allLessons={lessons} />;
      case ModuleType.STUDENT_EXAMS: return session ? <StudentExamView session={session} /> : null;
      case ModuleType.EXAMS: return session ? <ExamModule session={session} classes={classes} /> : null;
      case ModuleType.COMMUNICATION: return <CommunicationModule announcements={announcements} setAnnouncements={setAnnouncements} classes={classes} userRole={session.role} currentUserId={session.id} onDeleteAnnouncementDB={(id) => deleteFromSupabase('announcements', id)} {...commonProps} />;
      case ModuleType.SETTINGS: return <SettingsModule config={schoolConfig} setConfig={setSchoolConfig} theme={theme} setTheme={setTheme} teachers={teachers} setTeachers={setTeachers} lessons={lessons} setLessons={setLessons} classes={classes} setClasses={setClasses} announcements={announcements} setAnnouncements={setAnnouncements} courses={courses} setCourses={setCourses} schedule={finalSchedule} setSchedule={setFinalSchedule} onRestoreDNA={handleRestoreDNA} onImportData={handleImportStudents} onClearAll={handleHardReset} onSuccess={triggerSuccess} schoolId={session.schoolId} />;
      case ModuleType.SUBSCRIPTION_REQUIRED: {
        const studentCount = classes.reduce((acc, c) => acc + (c.students?.length || 0), 0);
        const [isCalculating, setIsCalculating] = useState(false);
        const [showFinalPay, setShowFinalPay] = useState(false);
        const [totalAmount, setTotalAmount] = useState((studentCount * 1.80).toFixed(2));

        const handleCalculate = () => {
          setIsCalculating(true);
          setTimeout(() => {
            setIsCalculating(false);
            setShowFinalPay(true);
          }, 1500);
        };

        const handleProceedToPayment = () => {
          // Bu kısım gerçek bir ödeme sistemine (Stripe/PayPal vb.) yönlendirme yapabilir
          const paymentUrl = `https://checkout.senkron.ai/pay?amount=${totalAmount}&schoolId=${session.schoolId}`;
          window.open(paymentUrl, '_blank');
        };

        return (
          <div className="flex flex-col items-center justify-center h-full bg-[#0d141b] text-white p-8 text-center animate-in fade-in duration-500 font-mono">
            <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
              <i className="fa-solid fa-clock-rotate-left text-4xl text-red-500 animate-pulse"></i>
            </div>
            <h2 className="text-3xl font-black tracking-tighter mb-4 uppercase">DENEME SÜRESİ DOLDU</h2>
            <p className="text-slate-400 max-w-md mb-8 font-medium leading-relaxed">
              14 günlük ücretsiz kullanım hakkınız sona ermiştir. <br />
              Sistemin tüm özelliklerine erişmeye devam etmek için yıllık aboneliğinizi başlatmanız gerekmektedir.
            </p>

            <div className="bg-[#1a242e] border border-white/5 p-8 rounded-xl mb-8 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">YILLIK ÜCRET (ÖĞRENCİ BAŞI)</span>
                <span className="text-xl font-black text-[#fbbf24]">$1.80</span>
              </div>
              <div className="flex justify-between items-center pb-6 border-b border-white/5">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">AKTİF ÖĞRENCİ SAYISI</span>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xl font-black text-white">{studentCount}</span>
                </div>
              </div>

              {!showFinalPay ? (
                <button
                  onClick={handleCalculate}
                  disabled={isCalculating}
                  className="w-full mt-6 py-4 bg-slate-800 border border-white/10 text-white font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  {isCalculating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      HESAPLANIYOR...
                    </>
                  ) : (
                    "ÖDEME TUTARINI HESAPLA"
                  )}
                </button>
              ) : (
                <div className="mt-6 animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center p-4 bg-green-500/5 border border-green-500/20 rounded-lg mb-6">
                    <span className="text-[12px] font-black text-green-500 uppercase tracking-widest">TOPLAM TAHSİLAT</span>
                    <span className="text-2xl font-black text-green-500 animate-pulse">${totalAmount} <span className="text-xs">/ YIL</span></span>
                  </div>
                  <button
                    onClick={handleProceedToPayment}
                    className="w-full py-5 bg-green-600 text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(22,163,74,0.3)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <i className="fa-solid fa-credit-card"></i> ÖDEME SAYFASINA GİT
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => { localStorage.removeItem('senkron_session'); window.location.reload(); }}
                className="text-[10px] font-bold text-slate-600 hover:text-white uppercase tracking-widest border-b border-transparent hover:border-white/20 transition-all"
              >
                FARKLI HESAPLA GİRİŞ YAP
              </button>
            </div>
          </div>
        );
      }
      default: return <Dashboard teachers={teachers} classes={classes} setClasses={setClasses} lessons={lessons} schedule={finalSchedule} setActiveModule={setActiveModule} announcements={announcements} userRole={session?.role} userName={session?.name} userId={session?.id} courses={courses} setCourses={setCourses} onSuccess={triggerSuccess} subscriptionStatus={session?.subscriptionStatus} trialEndsAt={session?.trialEndsAt} />;
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${theme.mode === ThemeMode.DARK ? 'bg-[#080c10] text-[#e4e4e7]' : 'bg-[#f3f4f6] text-[#000000]'}`} style={{ fontFamily: `'${theme.fontFamily}', monospace` }}>
      {session.isFirstLogin && (
        <ForcePasswordChangeModal
          userId={session.id}
          userType={session.role === UserRole.TEACHER ? 'teacher' : 'student'}
          currentUsername={teachers.find(t => t.id === session.id)?.username || ''}
          currentPassword={teachers.find(t => t.id === session.id)?.password || ''}
          onSuccess={(newUsername: string, newPassword: string) => {
            // Session'ı güncelle
            setSession(prev => prev ? ({ ...prev, isFirstLogin: false }) : null);
            localStorage.setItem('senkron_session', JSON.stringify({ ...session, isFirstLogin: false }));

            // Öğretmenin kimlik bilgilerini local state'te güncelle
            setTeachers(prev => prev.map(t =>
              t.id === session.id
                ? { ...t, username: newUsername, password: newPassword }
                : t
            ));

            triggerSuccess("KİMLİK BİLGİLERİ GÜNCELLENDİ");
          }}
        />
      )}
      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} editMode={isAdmin ? editMode : false} setEditMode={setEditMode} userRole={session.role} dbError={dbError} />
      <main className="flex-1 flex flex-col overflow-hidden relative bg-grid-hatched">
        <header className="h-10 md:h-10 border-b border-[#354a5f]/40 bg-[#0d141b]/95 backdrop-blur-md z-[60] flex items-center justify-between px-2 md:px-4">
          <div className="flex items-center gap-2 md:gap-3">{isAdmin && (<button onClick={() => setEditMode(!editMode)} className={`px-2 md:px-3 h-6 text-[7px] md:text-[8px] font-black uppercase tracking-widest border ${editMode ? 'bg-[#3b82f6] text-white' : 'bg-[#fcd34d] text-black'}`}>{editMode ? 'EDİTÖR' : 'İZLEME'}</button>)}
            <h2 className="text-[8px] md:text-[9px] font-black tracking-widest md:tracking-[0.4em] uppercase text-white truncate max-w-[80px] md:max-w-none">{activeModule.replace('STUDENT_', '').replace('TEACHER_', '').replace('_', ' ')}</h2></div>
          <div className="flex items-center gap-2 md:gap-4">
            {isSyncing && <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></div><span className="hidden md:inline text-[6px] font-black text-green-500 uppercase tracking-widest">DNA_YAZILIYOR...</span></div>}
            {isBackgroundLoading && <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2"><i className="fa-solid fa-cloud-arrow-down text-[#3b82f6] text-[10px] animate-bounce"></i><span className="hidden md:inline text-[6px] font-black text-[#3b82f6] uppercase tracking-widest">DETAYLAR_İNDİRİLİYOR...</span></div>}
            <div className="text-right flex flex-col justify-center truncate max-w-[100px] md:max-w-[200px]"><span className="text-[8px] md:text-[9px] font-black text-white uppercase block truncate" title={`Role: ${session.role}`}>{session.name}</span><span className="text-[6px] text-[#3b82f6] font-bold uppercase hidden md:block truncate">{session.schoolId}</span></div>
            <button onClick={async () => { await supabase.auth.signOut(); localStorage.clear(); setSession(null); }} className="text-red-500/50 hover:text-red-500 transition-colors shrink-0"><i className="fa-solid fa-power-off"></i></button></div>
        </header>
        {successStamp && (<div className="fixed inset-0 pointer-events-none z-[2000] flex items-center justify-center bg-black/10 backdrop-blur-[2px]"><div className="bg-[#3b82f6]/10 border-4 border-[#3b82f6] p-12 shadow-[0_0_100px_rgba(59,130,246,0.4)] animate-in zoom-in duration-300"><span className="text-4xl font-black text-white uppercase tracking-widest leading-none">{successStamp}</span></div></div>)}
        <div className="flex-1 overflow-auto custom-scrollbar p-2">{renderModule()}</div>
        <ChatPanel teachers={teachers} classes={classes} lessons={lessons} userRole={session.role} />
      </main>
    </div>
  );
};

export default App;
