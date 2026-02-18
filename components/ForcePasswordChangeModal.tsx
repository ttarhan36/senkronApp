import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface Props {
    userId: string;
    userType: 'teacher' | 'student';
    currentUsername?: string;
    currentPassword?: string;
    onSuccess: (newUsername: string, newPassword: string) => void;
}

const ForcePasswordChangeModal: React.FC<Props> = ({ userId, userType, currentUsername, currentPassword, onSuccess }) => {
    const [newUsername, setNewUsername] = useState(currentUsername || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newUsername.trim()) {
            setError("KULLANICI ADI BOŞ BIRAKILAMAZ");
            return;
        }
        if (newUsername.trim().length < 3) {
            setError("KULLANICI ADI EN AZ 3 KARAKTER OLMALI");
            return;
        }
        if (newPassword.length < 6) {
            setError("ŞİFRE EN AZ 6 KARAKTER OLMALI");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("ŞİFRELER EŞLEŞMİYOR");
            return;
        }
        if (newUsername.trim() === currentUsername && newPassword === currentPassword) {
            setError("GÜVENLİĞİNİZ İÇİN KULLANICI ADI VEYA ŞİFRENİZİ DEĞİŞTİRMENİZ ZORUNLUDUR");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const table = userType === 'teacher' ? 'teachers' : 'students';
            const trimmedUsername = newUsername.trim();

            // Aynı kullanıcı adının başkası tarafından kullanılıp kullanılmadığını kontrol et (her iki tabloda da)
            const otherTable = userType === 'teacher' ? 'students' : 'teachers';

            // Kendi tablosunda kontrol
            const { data: existingSame } = await supabase
                .from(table)
                .select('id')
                .eq('username', trimmedUsername)
                .neq('id', userId)
                .maybeSingle();

            if (existingSame) {
                setError("BU KULLANICI ADI ZATEN KULLANIMDA. BAŞKA BİR AD SEÇİN.");
                setLoading(false);
                return;
            }

            // Diğer tabloda kontrol (öğretmen-öğrenci çakışması önleme)
            const { data: existingOther } = await supabase
                .from(otherTable)
                .select('id')
                .eq('username', trimmedUsername)
                .maybeSingle();

            if (existingOther) {
                setError("BU KULLANICI ADI BİR " + (otherTable === 'teachers' ? 'ÖĞRETMEN' : 'ÖĞRENCİ') + " TARAFINDAN KULLANIMDA. BAŞKA BİR AD SEÇİN.");
                setLoading(false);
                return;
            }

            const { error: updateError } = await supabase
                .from(table)
                .update({
                    username: trimmedUsername,
                    password: newPassword,
                    is_first_login: false
                })
                .eq('id', userId);

            if (updateError) throw updateError;

            onSuccess(trimmedUsername, newPassword);
        } catch (err: any) {
            console.error("Credential Update Error:", err);
            setError("GÜNCELLENEMEDİ: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border-2 border-red-500 w-full max-w-md shadow-[0_0_50px_rgba(239,68,68,0.5)] animate-in zoom-in-95">
                <div className="bg-red-500/10 p-6 border-b border-red-500/30 text-center">
                    <i className="fa-solid fa-lock text-4xl text-red-500 mb-4 animate-pulse"></i>
                    <h2 className="text-xl font-black text-white uppercase tracking-widest">GÜVENLİK UYARISI</h2>
                    <p className="text-[10px] font-bold text-red-400 mt-2 uppercase tracking-wide">
                        BU HESAP İLE İLK KEZ GİRİŞ YAPIYORSUNUZ.<br />
                        DEVAM ETMEK İÇİN KENDİ KULLANICI ADINIZI VE ŞİFRENİZİ BELİRLEMENİZ ZORUNLUDUR.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">YENİ KULLANICI ADI</label>
                        <input
                            type="text"
                            className="w-full h-12 bg-black border border-red-900/50 focus:border-red-500 text-white px-4 font-bold outline-none transition-colors"
                            placeholder="EN AZ 3 KARAKTER"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">YENİ ŞİFRE</label>
                        <input
                            type="text"
                            className="w-full h-12 bg-black border border-red-900/50 focus:border-red-500 text-white px-4 font-bold outline-none transition-colors"
                            placeholder="EN AZ 6 KARAKTER"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">ŞİFRE TEKRAR</label>
                        <input
                            type="text"
                            className="w-full h-12 bg-black border border-red-900/50 focus:border-red-500 text-white px-4 font-bold outline-none transition-colors"
                            placeholder="ŞİFREYİ TEKRAR GİRİN"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 text-red-500 text-[9px] font-black uppercase text-center border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        disabled={loading}
                        className="w-full h-14 bg-red-600 hover:bg-red-500 text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'GÜNCELLENİYOR...' : 'KAYDET VE GİRİŞ YAP'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ForcePasswordChangeModal;
