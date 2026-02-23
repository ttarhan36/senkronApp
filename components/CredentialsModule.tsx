import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Teacher, Student } from '../types';

interface CredentialsModuleProps {
    onSuccess: (msg: string) => void;
    schoolId: string;
}

const CredentialsModule: React.FC<CredentialsModuleProps> = ({ onSuccess, schoolId }) => {
    const [activeTab, setActiveTab] = useState<'TEACHERS' | 'STUDENTS'>('TEACHERS');
    const [searchQuery, setSearchQuery] = useState('');

    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingUser, setEditingUser] = useState<any>(null);
    const [editForm, setEditForm] = useState({ username: '', password: '', is_blocked: false });
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (schoolId) fetchData();
    }, [schoolId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: tData } = await supabase.from('teachers').select('*').eq('school_id', schoolId).order('name');
            const { data: sData } = await supabase.from('students').select('*').eq('school_id', schoolId).order('name');
            if (tData) setTeachers(tData);
            if (sData) setStudents(sData);
        } catch (error) {
            console.error("Error fetching credentials:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEdit = (user: any) => {
        setEditingUser(user);
        setEditForm({
            username: user.username || '',
            password: user.password || '',
            is_blocked: user.is_blocked || false
        });
        setIsEditModalOpen(true);
    };

    const handleShareWhatsapp = (user: any) => {
        if (!user.username || !user.password) {
            alert("PAYLAŞIM İÇİN KULLANICI ADI VE ŞİFRE GEREKLİ");
            return;
        }
        if (user.is_blocked) {
            alert("BU KULLANICI BLOKLANMIŞTIR. PAYLAŞILAMAZ.");
            return;
        }
        const url = `${window.location.origin}/?action=qrlimit&u=${user.username}&p=${user.password}&s=${schoolId}`;
        const msg = `*GİRİŞ BİLGİLERİNİZ*\n\nMerhaba ${user.name},\nSenkron sistemine giriş bilgileriniz aşağıdadır:\n\n👤 Kullanıcı Adı: *${user.username}*\n🔑 Şifre: *${user.password}*\n\n🚀 Hızlı giriş için tıklayın:\n${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            const trimmedUsername = editForm.username.trim();
            const newPassword = editForm.password;

            if (trimmedUsername.length < 3) throw new Error("KULLANICI ADI EN AZ 3 KARAKTER OLMALI");
            if (newPassword.length < 6) throw new Error("ŞİFRE EN AZ 6 KARAKTER OLMALI");

            const isTeacher = activeTab === 'TEACHERS';
            const currentTable = isTeacher ? 'teachers' : 'students';
            const otherTable = isTeacher ? 'students' : 'teachers';

            // Check self duplicate
            const { data: duplicateSelf } = await supabase
                .from(currentTable)
                .select('id')
                .eq('username', trimmedUsername)
                .neq('id', isTeacher ? editingUser.id : editingUser.number)
                .maybeSingle();
            if (duplicateSelf) throw new Error("BU KULLANICI ADI ZATEN KULLANIMDA");

            // Check other table duplicate
            const { data: duplicateOther } = await supabase
                .from(otherTable)
                .select('id')
                .eq('username', trimmedUsername)
                .maybeSingle();
            if (duplicateOther) throw new Error(`BU KULLANICI ADI BİR ${isTeacher ? 'ÖĞRENCİ' : 'ÖĞRETMEN'} TARAFINDAN KULLANIMDA`);

            const { error } = await supabase
                .from(currentTable)
                .update({
                    username: trimmedUsername,
                    password: newPassword,
                    is_first_login: false,
                    is_blocked: editForm.is_blocked
                })
                .eq(isTeacher ? 'id' : 'number', isTeacher ? editingUser.id : editingUser.number);

            if (error) throw error;
            onSuccess("BİLGİLER GÜNCELLENDİ");
            setIsEditModalOpen(false);
            fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredList = (activeTab === 'TEACHERS' ? teachers : students).filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-[#0d141b] text-white overflow-hidden relative font-mono">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-grid-hatched opacity-20 pointer-events-none"></div>

            {/* Header Area */}
            <div className="flex-shrink-0 p-4 pb-2 z-10 bg-[#0d141b] border-b border-white/5">
                <div className="flex flex-col gap-6 mb-4">
                    {/* Title */}
                    <div className="flex items-center gap-4">
                        <div className="w-1 h-8 bg-[#3b82f6]"></div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-[0.2em] text-white uppercase leading-none">
                            ŞİFRELER
                        </h1>
                    </div>

                    {/* Tabs - Full Width Grid - NO RADIUS */}
                    <div className="grid grid-cols-2 gap-1 bg-transparent">
                        <button
                            onClick={() => setActiveTab('TEACHERS')}
                            className={`h-12 flex items-center justify-center text-[10px] md:text-xs font-black tracking-widest transition-all uppercase border border-white/10 ${activeTab === 'TEACHERS' ? 'bg-[#3b82f6] text-white border-[#3b82f6]' : 'bg-[#1e293b]/50 text-slate-500 hover:text-white hover:bg-[#1e293b]'}`}
                        >
                            ÖĞRETMENLER
                        </button>
                        <button
                            onClick={() => setActiveTab('STUDENTS')}
                            className={`h-12 flex items-center justify-center text-[10px] md:text-xs font-black tracking-widest transition-all uppercase border border-white/10 ${activeTab === 'STUDENTS' ? 'bg-[#3b82f6] text-white border-[#3b82f6]' : 'bg-[#1e293b]/50 text-slate-500 hover:text-white hover:bg-[#1e293b]'}`}
                        >
                            ÖĞRENCİLER
                        </button>
                    </div>
                </div>

                {/* Search - Sharp Corners */}
                <div className="relative mb-2">
                    <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                    <input
                        type="text"
                        placeholder={`${activeTab === 'TEACHERS' ? 'ÖĞRETMEN' : 'ÖĞRENCİ'} KADROSUNDA ARA...`}
                        className="w-full h-12 bg-black border border-white/10 pl-10 text-xs font-bold text-white outline-none focus:border-[#3b82f6] transition-all placeholder:text-slate-600 uppercase tracking-wider"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 md:p-4 z-0 space-y-2 pb-20">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-slate-600 animate-pulse">
                        <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent animate-spin mb-4"></div>
                        <span className="text-[10px] font-black tracking-widest uppercase">VERİLER_YÜKLENİYOR</span>
                    </div>
                ) : filteredList.length === 0 ? (
                    <div className="text-center p-12 border border-dashed border-white/10 bg-[#1e293b]/20">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">EŞLEŞEN KAYIT YOK</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {filteredList.map((user: any, index) => (
                            <div key={user.id || user.number} className={`group relative bg-[#1e293b]/60 hover:bg-[#1e293b] border border-white/5 hover:border-[#3b82f6]/50 p-4 transition-all duration-200 ${user.is_blocked ? 'opacity-50 grayscale hover:grayscale-0' : ''}`}>

                                {user.is_blocked && (
                                    <div className="absolute top-2 right-2 z-10">
                                        <i className="fa-solid fa-lock text-red-500 text-xs"></i>
                                    </div>
                                )}

                                <div className="flex items-center gap-4">
                                    {/* Status Dot (No Avatar) */}
                                    <div className={`w-2 h-2 shrink-0 ${user.is_blocked ? 'bg-red-500' : (user.username ? 'bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]' : 'bg-red-500 animate-pulse')}`}></div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-xs font-black truncate leading-tight mb-1 transition-colors uppercase tracking-wide ${user.is_blocked ? 'text-red-400 line-through' : 'text-white group-hover:text-[#3b82f6]'}`}>
                                            {user.name}
                                        </h3>

                                        <div className="flex items-center gap-3 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[9px] font-mono tracking-wider text-blue-400 truncate">
                                                {user.username || 'NO_USER'}
                                            </span>
                                            <span className="text-[9px] text-slate-600">|</span>
                                            <span className="text-[9px] font-mono tracking-wider text-amber-400 truncate">
                                                {user.is_blocked ? 'ENGEL' : (user.password || 'NO_PASS')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex justify-end gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                        {!user.is_blocked && (
                                            <button
                                                onClick={() => handleShareWhatsapp(user)}
                                                className="w-8 h-8 flex items-center justify-center bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white transition-all"
                                                title="WhatsApp"
                                            >
                                                <i className="fa-brands fa-whatsapp text-xs"></i>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleOpenEdit(user)}
                                            className="w-8 h-8 flex items-center justify-center bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 hover:bg-[#3b82f6] hover:text-white transition-all"
                                            title="Düzenle"
                                        >
                                            <i className="fa-solid fa-pen text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* EDIT MODAL - Sharp Corners */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#0d141b] border border-white/10 w-full max-w-sm p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
                        <div className="mb-8 border-b border-white/5 pb-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-1">HESAP DÜZENLE</h3>
                            <p className="text-[10px] text-[#3b82f6] font-bold uppercase truncate">{editingUser.name}</p>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">KULLANICI ADI</label>
                                <input
                                    className="w-full h-10 bg-black border border-white/10 px-3 text-xs font-bold text-white outline-none focus:border-[#3b82f6] transition-all uppercase disabled:opacity-50"
                                    value={editForm.username}
                                    onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                                    disabled={editForm.is_blocked}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">ŞİFRE</label>
                                <input
                                    className="w-full h-10 bg-black border border-white/10 px-3 text-xs font-bold text-[#fbbf24] font-mono outline-none focus:border-[#fbbf24] transition-all disabled:opacity-50"
                                    value={editForm.password}
                                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                    disabled={editForm.is_blocked}
                                />
                            </div>

                            {/* Blocking Toggle */}
                            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 p-3">
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">HESABI ENGELLE (BLOKLA)</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={editForm.is_blocked}
                                        onChange={e => setEditForm({ ...editForm, is_blocked: e.target.checked })}
                                    />
                                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                                </label>
                            </div>
                            <p className="text-[8px] text-slate-500 italic mt-1">
                                * Bloklanan kullanıcılar doğru şifre girseler bile sisteme erişemezler.
                            </p>
                        </div>

                        <div className="flex gap-2 mt-8 pt-4 border-t border-white/5">
                            <button onClick={() => setIsEditModalOpen(false)} className="flex-1 h-10 border border-white/10 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-white/5 hover:text-white transition-colors">İPTAL</button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 h-10 bg-[#3b82f6] text-white font-black text-[9px] uppercase tracking-widest hover:bg-blue-600 shadow-lg disabled:opacity-50 transition-colors">
                                {saving ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CredentialsModule;
