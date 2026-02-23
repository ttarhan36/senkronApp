
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { UserRole, UserSession } from '../../types';

interface AuthTerminalProps {
  onAuthSuccess: (session: UserSession) => void;
  triggerSuccess: (msg?: string) => void;
  onBackToLanding: () => void;
}

type LoginRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

const AuthTerminal: React.FC<AuthTerminalProps> = ({ onAuthSuccess, triggerSuccess, onBackToLanding }) => {
  const [activeTab, setActiveTab] = useState<LoginRole>('ADMIN');
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RESET'>('LOGIN'); // Sadece Admin için
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false); // New state for toggling password visibility

  // Admin Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [fullName, setFullName] = useState('');

  // Common Inputs (Teacher/Student)
  const [schoolIdInput, setSchoolIdInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [userPasswordInput, setUserPasswordInput] = useState('');

  // QR Code Login Effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action === 'qrlimit') {
      const u = params.get('u');
      const p = params.get('p');
      const s = params.get('s');

      if (u && p && s) {
        setLoading(true);
        // Otomatik Giriş Denemesi
        (async () => {
          try {
            const { data: teacher, error } = await supabase
              .from('teachers')
              .select('*')
              .eq('school_id', s)
              .eq('username', u)
              .eq('password', p)
              .maybeSingle();

            if (error || !teacher) {
              throw new Error("QR KOD GEÇERSİZ VEYA SÜRESİ DOLMUŞ");
            }

            if (teacher.is_blocked) {
              throw new Error("MOTORDAN UYARI: BU HESAP ASKIYA ALINMIŞTIR. YÖNETİCİNİZLE GÖRÜŞÜNÜZ.");
            }

            onAuthSuccess({
              role: UserRole.TEACHER,
              id: teacher.id,
              name: teacher.name,
              schoolId: teacher.school_id,
              isFirstLogin: teacher.is_first_login
            });
            triggerSuccess(`QR İLE GİRİŞ BAŞARILI: ${teacher.name}`);

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (err: any) {
            setError(err.message);
            setLoading(false);
          }
        })();
      }
    }
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          redirectTo: window.location.origin
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message.toUpperCase());
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const input = email.trim().toUpperCase();

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password
      });

      if (authError) throw new Error("GİRİŞ BİLGİLERİ GEÇERSİZ");

      const user = data.user;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        onAuthSuccess({
          role: (profile.role as UserRole) || UserRole.ADMIN,
          id: user.id,
          name: profile.full_name,
          schoolId: profile.school_id,
          email: user.email
        });
      } else if (user.user_metadata && user.user_metadata.school_id) {
        onAuthSuccess({
          role: (user.user_metadata.role as UserRole) || UserRole.ADMIN,
          id: user.id,
          name: user.user_metadata.full_name || "KULLANICI",
          schoolId: user.user_metadata.school_id,
          email: user.email
        });
      } else {
        throw new Error("PROFİL BULUNAMADI");
      }
      triggerSuccess("YÖNETİCİ_GİRİŞİ_BAŞARILI");
    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  const handleAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("ŞİFRE EN AZ 6 KARAKTER OLMALI"); return; }
    setLoading(true);
    setError(null);

    try {
      const schoolId = `SCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: { data: { full_name: fullName.toUpperCase(), school_id: schoolId, role: UserRole.ADMIN } }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("KAYIT OLUŞTURULAMADI");

      await supabase.from('schools').insert({ id: schoolId, name: schoolName.toUpperCase() });
      await supabase.from('school_config').insert({ school_id: schoolId });
      await supabase.from('user_profiles').insert({ user_id: authData.user.id, school_id: schoolId, full_name: fullName.toUpperCase(), role: UserRole.ADMIN });

      setMode('LOGIN');
      triggerSuccess("OKUL_KAYDI_TAMAM");
      setError("KAYIT BAŞARILI. LÜTFEN E-POSTA ONAYI YAPIN.");
    } catch (err: any) {
      setError(err.message.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const sid = schoolIdInput.trim().toUpperCase();
      const uName = usernameInput.trim();
      const uPass = userPasswordInput.trim();

      let student = null;
      let targetSchoolId = sid;

      if (sid) {
        // Okul kodu verildiyse klasik kontrol
        const { data: school, error: schoolError } = await supabase.from('schools').select('id, name').eq('id', sid).maybeSingle();
        if (schoolError || !school) throw new Error("GİRİLEN OKUL KODU GEÇERSİZ");

        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('school_id', sid)
          .eq('password', uPass)
          .or(`username.eq.${uName},number.eq.${uName}`)
          .maybeSingle();

        if (error || !data) throw new Error("KULLANICI ADI/NO VEYA ŞİFRE HATALI");
        student = data;
      } else {
        // Okul kodu yoksa GLOBAL arama (Smart Login)
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('password', uPass)
          .or(`username.eq.${uName},number.eq.${uName}`);

        if (error) throw error;

        if (data && data.length === 1) {
          // Tekil eşleşme, okul kodunu otomatik al
          student = data[0];
          targetSchoolId = student.school_id;
        } else if (data && data.length > 1) {
          throw new Error("BİRDEN FAZLA KAYIT BULUNDU. LÜTFEN OKUL KODUNU GİRİNİZ.");
        } else {
          throw new Error("KULLANICI BULUNAMADI VEYA ŞİFRE HATALI");
        }

        if (student && student.is_blocked) {
          throw new Error("MOTORDAN UYARI: BU HESAP ASKIYA ALINMIŞTIR. YÖNETİCİNİZLE GÖRÜŞÜNÜZ.");
        }
      }

      onAuthSuccess({
        role: UserRole.STUDENT,
        id: student.number,
        name: student.name,
        schoolId: targetSchoolId,
        isFirstLogin: student.is_first_login
      });
      triggerSuccess(`HOŞ GELDİN ${student.name.split(' ')[0]}`);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const sid = schoolIdInput.trim().toUpperCase();
      const uName = usernameInput.trim();
      const uPass = userPasswordInput.trim();

      let teacher = null;
      let targetSchoolId = sid;

      if (sid) {
        // Okul Kodu varsa direkt kontrol
        const { data: school, error: schoolError } = await supabase.from('schools').select('id, name').eq('id', sid).maybeSingle();
        if (schoolError || !school) throw new Error("GİRİLEN OKUL KODU GEÇERSİZ");

        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('school_id', sid)
          .eq('username', uName)
          .eq('password', uPass)
          .maybeSingle();

        if (error || !data) throw new Error("KULLANICI ADI VEYA ŞİFRE HATALI");
        teacher = data;
      } else {
        // Okul kodu yoksa Global Arama
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('username', uName)
          .eq('password', uPass);

        if (error) throw error;

        if (data && data.length === 1) {
          teacher = data[0];
          targetSchoolId = teacher.school_id;
        } else if (data && data.length > 1) {
          throw new Error("AYNI KULLANICI ADI BAŞKA OKULDA DA VAR. LÜTFEN OKUL KODU GİRİNİZ.");
        } else {
          throw new Error("KULLANICI ADI VEYA ŞİFRE HATALI");
        }

        if (teacher && teacher.is_blocked) {
          throw new Error("MOTORDAN UYARI: BU HESAP ASKIYA ALINMIŞTIR. YÖNETİCİNİZLE GÖRÜŞÜNÜZ.");
        }
      }

      onAuthSuccess({
        role: UserRole.TEACHER,
        id: teacher.id,
        name: teacher.name,
        schoolId: targetSchoolId,
        isFirstLogin: teacher.is_first_login
      });
      triggerSuccess(`HOŞ GELDİNİZ HOCAM`);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setError(null);
    setUsernameInput('');
    setUserPasswordInput('');
    setShowPassword(false);
  };

  return (
    <div className="h-screen w-screen bg-[#080c10] flex items-center justify-center p-4 bg-grid-hatched overflow-hidden">
      <div className="bg-[#0f172a] border border-[#354a5f] max-w-md w-full shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-500 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#3b82f6] shadow-[0_0_20px_#3b82f6]"></div>

        {/* HEADER */}
        <div className="p-8 pb-4 text-center">
          <h1 className="text-3xl font-black text-white uppercase tracking-[0.4em] mb-2">SENKRON</h1>
          <p className="text-[9px] font-bold text-[#3b82f6] uppercase tracking-[0.3em]">BULUT TERMİNALİ v2.5.0</p>
        </div>

        {/* TABS */}
        <div className="flex px-8 gap-2 mb-6">
          <button onClick={() => { setActiveTab('ADMIN'); resetForms(); }} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'ADMIN' ? 'text-white border-[#3b82f6]' : 'text-slate-600 border-transparent hover:text-slate-400'}`}>İDARECİ</button>
          <button onClick={() => { setActiveTab('TEACHER'); resetForms(); }} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'TEACHER' ? 'text-white border-[#3b82f6]' : 'text-slate-600 border-transparent hover:text-slate-400'}`}>ÖĞRETMEN</button>
          <button onClick={() => { setActiveTab('STUDENT'); resetForms(); }} className={`flex-1 h-10 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'STUDENT' ? 'text-white border-[#3b82f6]' : 'text-slate-600 border-transparent hover:text-slate-400'}`}>ÖĞRENCİ</button>
        </div>

        {/* Back to Home Button */}
        <div className="absolute top-4 right-4">
          <button
            onClick={onBackToLanding}
            className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-all group"
            title="Ana Sayfaya Dön"
          >
            <i className="fa-solid fa-house text-sm group-hover:scale-110 transition-transform"></i>
          </button>
        </div>

        {/* FORMS */}
        <div className="px-8 pb-10">
          {/* ADMIN FORM */}
          {activeTab === 'ADMIN' && (
            mode === 'LOGIN' ? (
              <form onSubmit={handleAdminLogin} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">E-POSTA</label>
                  <input autoFocus required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[12px] outline-none focus:border-[#3b82f6] uppercase placeholder:text-slate-700" placeholder="YÖNETİCİ E-POSTASI..." value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE</label><button type="button" onClick={() => setMode('RESET')} className="text-[7px] text-[#3b82f6]">UNUTTUM</button></div>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[12px] outline-none focus:border-[#3b82f6]" placeholder="******" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                  </div>
                </div>
                {error && <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-500 text-[9px] font-black uppercase text-center">{error}</div>}
                <button disabled={loading} className="w-full h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] hover:brightness-110 shadow-xl transition-all">{loading ? 'DOĞRULANIYOR...' : 'YÖNETİM_PANELİNE_GİR'}</button>

                <div className="relative flex items-center gap-2 py-2">
                  <div className="h-[1px] bg-[#354a5f] flex-1"></div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">VEYA</span>
                  <div className="h-[1px] bg-[#354a5f] flex-1"></div>
                </div>

                <button type="button" onClick={handleGoogleLogin} disabled={loading} className="w-full h-14 bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] hover:bg-slate-200 shadow-xl transition-all flex items-center justify-center gap-3">
                  <i className="fa-brands fa-google text-lg"></i>
                  <span>GOOGLE İLE GİRİŞ</span>
                </button>

                <div className="text-center pt-2"><button type="button" onClick={() => setMode('REGISTER')} className="text-[8px] font-black text-slate-500 hover:text-white uppercase tracking-widest">YENİ OKUL KAYDI OLUŞTUR</button></div>
              </form>
            ) : mode === 'REGISTER' ? (
              <form onSubmit={handleAdminRegister} className="space-y-4 animate-in fade-in slide-in-from-left-4">
                <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">OKUL ADI</label><input required className="w-full h-11 bg-black border border-[#354a5f] px-4 text-white font-black text-[11px] uppercase outline-none focus:border-[#fbbf24]" placeholder="KURUM ADI..." value={schoolName} onChange={e => setSchoolName(e.target.value)} /></div>
                <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">YÖNETİCİ AD SOYAD</label><input required className="w-full h-11 bg-black border border-[#354a5f] px-4 text-white font-black text-[11px] uppercase outline-none focus:border-[#fbbf24]" placeholder="TAM AD..." value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">E-POSTA</label><input type="email" required className="w-full h-11 bg-black border border-[#354a5f] px-4 text-white font-black text-[11px] uppercase outline-none focus:border-[#fbbf24]" placeholder="E-POSTA..." value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} required className="w-full h-11 bg-black border border-[#354a5f] px-4 text-white font-black text-[11px] outline-none focus:border-[#fbbf24]" placeholder="******" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                  </div>
                </div>
                {error && <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-500 text-[9px] font-black uppercase text-center">{error}</div>}
                <button disabled={loading} className="w-full h-14 bg-[#fbbf24] text-black font-black text-[11px] uppercase tracking-[0.3em] hover:brightness-110 shadow-xl transition-all">{loading ? 'KAYDEDİLİYOR...' : 'OKULU_KAYDET'}</button>
                <div className="text-center pt-2"><button type="button" onClick={() => setMode('LOGIN')} className="text-[8px] font-black text-slate-500 hover:text-white uppercase tracking-widest">GİRİŞ EKRANINA DÖN</button></div>
              </form>
            ) : (
              <form onSubmit={async (e) => { e.preventDefault(); setLoading(true); try { await supabase.auth.resetPasswordForEmail(email); triggerSuccess("LİNK GÖNDERİLDİ"); setMode('LOGIN'); } catch (err: any) { setError(err.message); } finally { setLoading(false); } }} className="space-y-5 animate-in fade-in">
                <div className="space-y-1"><label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">E-POSTA</label><input type="email" required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[12px] outline-none focus:border-[#3b82f6]" placeholder="E-POSTA..." value={email} onChange={e => setEmail(e.target.value)} /></div>
                <button disabled={loading} className="w-full h-14 bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] hover:brightness-110 shadow-xl transition-all">SIFIRLAMA LİNKİ GÖNDER</button>
                <div className="text-center pt-2"><button type="button" onClick={() => setMode('LOGIN')} className="text-[8px] font-black text-slate-500 hover:text-white uppercase tracking-widest">VAZGEÇ</button></div>
              </form>
            )
          )}

          {/* TEACHER FORM */}
          {activeTab === 'TEACHER' && (
            <form onSubmit={handleTeacherLogin} className="space-y-5 animate-in fade-in slide-in-from-right-4">
              <div className="p-4 bg-[#3b82f6]/5 border border-[#3b82f6]/20 mb-2">
                <p className="text-[9px] text-slate-400 font-bold text-center leading-relaxed">
                  ÖĞRETMEN GİRİŞİ İÇİN OKUL KODU ALANI <span className="text-[#3b82f6]">OPSİYONELDİR.</span> SİSTEM HESABINIZI OTOMATİK ALGILAR.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">OKUL KODU (OPSİYONEL)</label>
                <input className="w-full h-12 bg-black border border-[#354a5f] px-4 text-[#fbbf24] font-black text-[14px] outline-none focus:border-[#3b82f6] uppercase placeholder:text-slate-800 tracking-widest" placeholder="OTOMATİK ALGILA (BOŞ BIRAKILABİLİR)" value={schoolIdInput} onChange={e => setSchoolIdInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">KULLANICI ADI</label>
                <input required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[12px] outline-none focus:border-[#3b82f6] placeholder:text-slate-700" placeholder="KULLANICI ADINIZ" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[12px] outline-none focus:border-[#3b82f6] placeholder:text-slate-700" placeholder="******" value={userPasswordInput} onChange={e => setUserPasswordInput(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              {error && <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-500 text-[9px] font-black uppercase text-center">{error}</div>}
              <button disabled={loading} className="w-full h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] hover:brightness-110 shadow-xl transition-all">
                {loading ? 'DOĞRULANIYOR...' : 'KADRO_GİRİŞİ'}
              </button>
            </form>
          )}

          {/* STUDENT FORM */}
          {activeTab === 'STUDENT' && (
            <form onSubmit={handleStudentLogin} className="space-y-5 animate-in fade-in slide-in-from-right-4">
              <div className="p-4 bg-[#3b82f6]/5 border border-[#3b82f6]/20 mb-2">
                <p className="text-[9px] text-slate-400 font-bold text-center leading-relaxed">
                  ÖĞRENCİ PANELİ İÇİN OKUL KODU ALANI <span className="text-[#3b82f6]">OPSİYONELDİR.</span> SİSTEM HESABINIZI OTOMATİK ALGILAR.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">OKUL KODU (OPSİYONEL)</label>
                <input className="w-full h-12 bg-black border border-[#354a5f] px-4 text-[#fbbf24] font-black text-[14px] outline-none focus:border-[#3b82f6] uppercase placeholder:text-slate-800 tracking-widest" placeholder="OTOMATİK ALGILA (BOŞ BIRAKILABİLİR)" value={schoolIdInput} onChange={e => setSchoolIdInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">KULLANICI ADI</label>
                <input required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[14px] outline-none focus:border-[#3b82f6] placeholder:text-slate-700 tracking-widest" placeholder="NUMARANIZ VEYA KULLANICI ADI" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} required className="w-full h-12 bg-black border border-[#354a5f] px-4 text-white font-black text-[14px] outline-none focus:border-[#3b82f6] placeholder:text-slate-700 tracking-widest" placeholder="******" value={userPasswordInput} onChange={e => setUserPasswordInput(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              {error && <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-500 text-[9px] font-black uppercase text-center">{error}</div>}
              <button disabled={loading} className="w-full h-14 bg-[#3b82f6] text-white font-black text-[11px] uppercase tracking-[0.3em] hover:brightness-110 shadow-xl transition-all">
                {loading ? 'KİMLİK DOĞRULANIYOR...' : 'ÖĞRENCİ_GİRİŞİ'}
              </button>
            </form>
          )}
        </div>
      </div>

    </div>
  );
};

export default AuthTerminal;
