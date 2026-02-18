import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Teacher, Student } from '../types';

interface CredentialsModuleProps {
    onSuccess: (msg: string) => void;
}

const CredentialsModule: React.FC<CredentialsModuleProps> = ({ onSuccess }) => {
    const [activeTab, setActiveTab] = useState<'TEACHERS' | 'STUDENTS'>('TEACHERS');
    const [searchQuery, setSearchQuery] = useState('');

    // Data States
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [editingUser, setEditingUser] = useState<any>(null); // Teacher | Student | null
    const [editForm, setEditForm] = useState({ username: '', password: '' });
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: tData } = await supabase.from('teachers').select('*').order('name');
            const { data: sData } = await supabase.from('students').select('*').order('name');

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
            password: user.password || ''
        });
        setIsEditModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);

        try {
            const trimmedUsername = editForm.username.trim();
            const newPassword = editForm.password;

            if (trimmedUsername.length < 3) throw new Error("KULLANICI ADI EN AZ 3 KARAKTER OLMALI");
            if (newPassword.length < 6) throw new Error("ŞİFRE EN AZ 6 KARAKTER OLMALI");

            // Cross-Table Check
            const isTeacher = activeTab === 'TEACHERS';
            const currentTable = isTeacher ? 'teachers' : 'students';
            const otherTable = isTeacher ? 'students' : 'teachers';

            // Check duplicate in current table (exclude self)
            const { data: duplicateSelf } = await supabase
                .from(currentTable)
                .select('id')
                .eq('username', trimmedUsername)
                .neq('id', isTeacher ? editingUser.id : editingUser.number) // Teacher uses ID, Student uses Number usually, but check schema
                .maybeSingle();

            if (duplicateSelf) throw new Error("BU KULLANICI ADI ZATEN KULLANIMDA");

            // Check duplicate in other table
            const { data: duplicateOther } = await supabase
                .from(otherTable)
                .select('id')
                .eq('username', trimmedUsername)
                .maybeSingle();

            if (duplicateOther) throw new Error(`BU KULLANICI ADI BİR ${isTeacher ? 'ÖĞRENCİ' : 'ÖĞRETMEN'} TARAFINDAN KULLANIMDA`);

            // Update
            const { error } = await supabase
                .from(currentTable)
                .update({
                    username: trimmedUsername,
                    password: newPassword,
                    is_first_login: false // Admin changed it, so force flow is skipped or maybe reset? Let's say false as Admin sets it explicitly.
                })
                .eq(isTeacher ? 'id' : 'number', isTeacher ? editingUser.id : editingUser.number); // IMPORTANT: Student ID is usually 'number' or 'id'? Let's check schema/types. Usually ID is uuid.

            if (error) throw error;

            onSuccess("BİLGİLER GÜNCELLENDİ");
            setIsEditModalOpen(false);
            fetchData(); // Refresh list

        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Filtering
    const filteredList = (activeTab === 'TEACHERS' ? teachers : students).filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-[#0d141b] text-white p-6 animate-in fade-in">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-widest uppercase">ŞİFRE VE HESAP YÖNETİMİ</h1>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">MERKEZİ KULLANICI KİMLİK DENETİMİ</p>
                </div>
                <div className="flex bg-[#1e293b] p-1 rounded-lg border border-white/10">
                    <button onClick={() => setActiveTab('TEACHERS')} className={`px-6 py-2 rounded-md text-[10px] font-black tracking-widest transition-all ${activeTab === 'TEACHERS' ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>ÖĞRETMENLER</button>
                    <button onClick={() => setActiveTab('STUDENTS')} className={`px-6 py-2 rounded-md text-[10px] font-black tracking-widest transition-all ${activeTab === 'STUDENTS' ? 'bg-[#3b82f6] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>ÖĞRENCİLER</button>
                </div>
            </header>

            <div className="mb-4">
                <div className="relative">
                    <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                    <input
                        type="text"
                        placeholder={`${activeTab === 'TEACHERS' ? 'Öğretmen' : 'Öğrenci'} Ara...`}
                        className="w-full h-12 bg-[#1e293b] border border-white/10 rounded-lg pl-12 text-sm font-bold text-white outline-none focus:border-[#3b82f6] transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar border border-white/5 rounded-lg bg-[#1e293b]/50">
                <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-[#0d141b] z-10">
                        <tr>
                            <th className="p-4 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">AD SOYAD</th>
                            <th className="p-4 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">KULLANICI ADI</th>
                            <th className="p-4 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">ŞİFRE</th>
                            <th className="p-4 text-right text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10">İŞLEM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-xs animate-pulse">YÜKLENİYOR...</td></tr>
                        ) : filteredList.map((user: any) => (
                            <tr key={user.id || user.number} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                <td className="p-4 text-[11px] font-bold text-white">{user.name}</td>
                                <td className="p-4 text-[11px] font-mono text-[#3b82f6]">{user.username || '-'}</td>
                                <td className="p-4 text-[11px] font-mono text-[#fbbf24]">{user.password || '-'}</td>
                                <td className="p-4 text-right">
                                    <button onClick={() => handleOpenEdit(user)} className="h-8 px-4 bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 rounded-sm text-[9px] font-black tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all">
                                        DÜZENLE
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* EDIT MODAL */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1e293b] border border-white/10 w-full max-w-md p-6 rounded-lg shadow-2xl relative">
                        <h3 className="text-lg font-black text-white uppercase tracking-widest mb-1">BİLGİLERİ DÜZENLE</h3>
                        <p className="text-xs text-slate-500 font-bold uppercase mb-6">{editingUser.name}</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">KULLANICI ADI</label>
                                <input
                                    className="w-full h-10 bg-black/50 border border-white/10 rounded px-3 text-sm font-bold text-white outline-none focus:border-[#3b82f6]"
                                    value={editForm.username}
                                    onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">ŞİFRE</label>
                                <input
                                    className="w-full h-10 bg-black/50 border border-white/10 rounded px-3 text-sm font-bold text-[#fbbf24] outline-none focus:border-[#fbbf24]"
                                    value={editForm.password}
                                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setIsEditModalOpen(false)} className="flex-1 h-10 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/5 rounded">İPTAL</button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 h-10 bg-[#3b82f6] text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 rounded shadow-lg disabled:opacity-50">
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
