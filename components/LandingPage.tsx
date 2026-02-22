import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2,
    PlayCircle,
    Calendar,
    ShieldCheck,
    Zap,
    CreditCard,
    BarChart3,
    Globe,
    ChevronRight,
    Menu,
    X,
    Plus,
    Minus,
    MessageSquare,
    ArrowRight,
    Database,
    Brain,
    Layers,
    Users,
    Building2,
    Check,
    FileDown,
    Edit3,
    UploadCloud,
    Instagram
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface LandingPageProps {
    onLoginClick: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeFaq, setActiveFaq] = useState<number | null>(null);
    const [scrolled, setScrolled] = useState(false);

    // Calculator State
    const [studentCount, setStudentCount] = useState<number | string>(10);

    // Slider State
    const [currentSlide, setCurrentSlide] = useState(0);
    const slides = [
        { url: '/slide_optik.png', title: 'Optik Form Okuma' },
        { url: '/slide_isgucu.png', title: 'İş Gücü Verimliliği' },
        { url: '/slide_analiz.png', title: 'Detaylı Öğrenci Analizi' },
        { url: '/slide_ders_analizi.png', title: 'Detaylı Ders Analizi' },
        { url: '/slide_programlama.png', title: 'AI Destekli Programlama' },
        { url: '/slide_guvenlik.png', title: 'Güvenlik ve Arşiv' },
        { url: '/slide_yonetim.png', title: 'Okul Yönetimi' }
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % slides.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    // Legal Modal State
    const [legalModal, setLegalModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode } | null>(null);

    const legalContent = {
        terms: {
            title: "KULLANIM ŞARTLARI",
            content: (
                <div className="space-y-4">
                    <p>Senkron Bulut Okul Yönetim Sistemi ("Sistem"), eğitim kurumlarının yönetim süreçlerini dijitalleştirmek amacıyla sunulan bir hizmettir.</p>
                    <section>
                        <h4 className="font-bold">1. Lisans ve Kullanım</h4>
                        <p>Kullanıcılar, sistemi sadece kendi eğitim kurumlarının iç süreçleri için kullanma hakkına sahiptir. Sistemin kopyalanması veya üçüncü taraflara kiralanması yasaktır.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">2. Sorumluluklar</h4>
                        <p>Kullanıcı, sisteme girilen verilerin doğruluğundan sorumludur. Senkron, veri girişi kaynaklı hatalardan dolayı sorumlu tutulamaz.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">3. Hizmet Kesintisi</h4>
                        <p>Planlı bakım çalışmaları dışında, sistem %99.9 erişilebilirlik hedefiyle sunulmaktadır.</p>
                    </section>
                </div>
            )
        },
        privacy: {
            title: "GİZLİLİK POLİTİKASI",
            content: (
                <div className="space-y-4">
                    <p>Veri gizliliğiniz bizim için en üst önceliktir. Senkron, verilerinizi asla reklam amaçlı üçüncü taraflarla paylaşmaz.</p>
                    <section>
                        <h4 className="font-bold">1. Toplanan Veriler</h4>
                        <p>Öğrenci numaraları, öğretmen branş bilgileri ve kurum içi ders programları sistemin işleyişi için güvenli bulut sunucularımızda saklanır.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">2. Veri Güvenliği</h4>
                        <p>Tüm veriler SSL sertifikası ile şifrelenir ve düzenli olarak yedeklenir.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">3. Çerezler</h4>
                        <p>Oturum yönetimi ve kullanıcı deneyimini iyileştirmek için sadece teknik çerezler kullanılmaktadır.</p>
                    </section>
                </div>
            )
        },
        kvkk: {
            title: "KVKK AYDINLATMA METNİ",
            content: (
                <div className="space-y-4">
                    <p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca Senkron, veri işleyen sıfatıyla hareket etmektedir.</p>
                    <section>
                        <h4 className="font-bold">1. İşleme Amacı</h4>
                        <p>Kişisel veriler, okul yönetim süreçlerinin yürütülmesi, ders programlarının hazırlanması ve veli-öğrenci bilgilendirmesi amacıyla işlenir.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">2. Haklarınız</h4>
                        <p>Veri sahipleri, KVKK'nın 11. maddesi uyarınca verilerinin işlenip işlenmediğini öğrenme ve düzeltilmesini isteme hakkına sahiptir.</p>
                    </section>
                    <section>
                        <h4 className="font-bold">3. Veri Sorumlusu</h4>
                        <p>Veri sorumlusu, hizmeti kullanan eğitim kurumudur. Senkron, veri işleyen alt yüklenici olarak hizmet vermektedir.</p>
                    </section>
                </div>
            )
        }
    };

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const stats = [
        { label: "Okul", value: "262+" },
        { label: "Öğrenci", value: "48k+" },
        { label: "Öğretmen", value: "12k+" },
        { label: "Memnuniyet", value: "%99" }
    ];

    const features = [
        {
            title: "AI Kamera: Optik Okuma",
            description: "Sadece telefonunuzu tutun ve okuyun. Pahalı cihazlara gerek kalmadan sınav sonuçlarını saniyeler içinde dijitalleştirin.",
            icon: <Zap className="w-6 h-6" />,
            items: ["Cihazsız optik okuma", "Anlık analiz raporları", "Eksiksiz veri güvenliği"]
        },
        {
            title: "Saniyelik Mobil Yoklama",
            description: "Ders başında kağıt kalem karmaşasına son. Mobil uygulama üzerinden tek tıkla yoklama alın, veriler anında öğrenci/veli paneline işlensin.",
            icon: <CheckCircle2 className="w-6 h-6" />,
            items: ["Hızlı yoklama alma", "Anlık panel bildirimi", "Devamsızlık istatistikleri"]
        },
        {
            title: "Yapay Zeka Ders Motoru",
            description: "Binlerce olasılığı saniyeler içinde hesaplayan gelişmiş AI motoruyla veya dilerseniz tamamen manuel olarak okulunuzun en ideal ders programını oluşturun.",
            icon: <Brain className="w-6 h-6" />,
            items: ["Otomatik veya manuel planlama", "Anlık çakışma kontrolü", "Esnek ders dağıtımı"]
        },
        {
            title: "e-Okul & MEB Uyumu",
            description: "Raporlarınızı e-Okul formatında otomatik alın. MEB standartlarıyla %100 uyumlu, yasal süreçlere tam entegre.",
            icon: <Globe className="w-6 h-6" />,
            items: ["Otomatik karne/rapor", "%100 MEB uyumu", "Tek tıkla dosya aktarımı"]
        },
        {
            title: "Branş DNA Analizi",
            description: "Öğretmenlerinizin yetkinliklerini, mesai yüklerini ve verimlilik grafiklerini tek bakışta görün.",
            icon: <Database className="w-6 h-6" />,
            items: ["Yük dengeleme", "Performans grafikleri", "Yetkinlik eşleştirme"]
        },
        {
            title: "Öğrenci & Öğretmen Etkileşimi",
            description: "Öğretmenler her şubeye özel ödev ve duyurular gönderebilir. Öğrenciler ise kendilerine özel panellerinden ödevlerini, notlarını, devamsızlıklarını ve öğretmen görüşlerini anlık takip edebilir.",
            icon: <MessageSquare className="w-6 h-6" />,
            items: ["Şube özelinde duyuru", "Öğrenci gelişim paneli", "Akademik görüş takibi"]
        },
        {
            title: "Akıllı Kurs Yönetimi",
            description: "İdareciler, öğretmen ve öğrencileri hedefleyerek kurslar tanımlayabilir. Kurs talepleri tüm öğrenci panellerine anında düşer ve öğrenciler 'Online Katıl' butonuyla talep oluşturabilir.",
            icon: <Calendar className="w-6 h-6" />,
            items: ["Hedefli kurs tanımı", "Anlık panel bildirimi", "Online başvuru"]
        },
        {
            title: "Anahtar Teslim Kurulum",
            description: "Vaktiniz mi yok? Verilerinizi bize iletin, sisteminizi uzman ekibimiz tüm detaylarıyla hazır hale getirsin.",
            icon: <Plus className="w-6 h-6" />,
            items: ["Ücretsiz veri girişi", "Hızlı geçiş desteği", "Eksiksiz yapılandırma"]
        }
    ];

    const faqs = [
        {
            q: "Senkron tam olarak nedir ve okuluma ne katar?",
            a: "Senkron, okul yönetimini baştan sona dijitalleştiren yapay zeka tabanlı bütünleşik bir platformdur. Saniyeler içinde en adil ve optimize ders programını hazırlayan 'Zeka Motoru', ek bir cihaz gerektirmeden sadece cep telefonu kamerasıyla sınav kağıtlarını okuyan 'AI Optik', anlık mobil yoklama ve gelişmiş öğrenci akademik analiz araçlarını tek bir merkezde toplar. Manuel süreçlerin yarattığı veri karmaşasını ve personel yükünü ortadan kaldırarak okulunuza operasyonel verimlilik, %100 MEB uyumu ve objektif yönetim imkanı katar."
        },
        {
            q: "Ders programını manuel hazırlayabilir miyim?",
            a: "Kesinlikle. Senkron'un gelişmiş arayüzü sayesinde tüm programı manuel olarak sürükle-bırak yöntemiyle oluşturabilir veya AI motorunun hazırladığı program üzerinde dilediğiniz manuel değişiklikleri yapabilirsiniz."
        },
        {
            q: "Zeka motoru programı ne kadar sürede hazırlar?",
            a: "AI motoru binlerce olasılığı tarayarak, okulunuzun büyüklüğüne göre 2 ile 4 dakika içinde en optimize ve çakışmasız programı sunar."
        },
        {
            q: "Öğretmen kısıtlamalarını sisteme girebilir miyim?",
            a: "Kesinlikle! \"Akıllı Kısıtlar\" özelliği sayesinde örneğin bir öğretmenin Salı gününü boşaltmak istiyorsanız, sadece o günü işaretlemeniz yeterlidir; sistem tüm programı saniyeler içinde revize eder. Ayrıca öğretmenlerin haftalık saat yüklerini ve doluluk oranlarını kapasite kontrolü ile izleyebilirsiniz."
        },
        {
            q: "Öğretmen ve sınıf çakışmaları nasıl çözülüyor?",
            a: "Senkron Zeka Motoru, binlerce olasılığı saniyeler içinde tarar ve size sıfır hata ile en optimize planı sunar. Yapay zeka destekli \"Akıllı Çakışma Önleyici\", çakışmaları daha oluşmadan yakalar ve kırmızı uyarıları saniyeler içinde yeşil onay tiklerine dönüştürür."
        },
        {
            q: "Veriler üzerinde kimler değişiklik yapabilir?",
            a: "Sistemde veri hiyerarşisi mutlak güven üzerine kuruludur. Ders notları ve devamsızlık içerikleri sadece ilgili branş öğretmeninin düzenleme yetkisindedir; okul idaresi veya yöneticiler bu verilere müdahale edemez. Her kullanıcı sadece kendi yetki alanındaki verilere erişebilir."
        },
        {
            q: "Veri güvenliği ve denetim nasıl sağlanıyor?",
            a: "Sistemde yapılan her yetkili işlem saniyeler içinde kayıt (log) altına alınır. Kimin, ne zaman ve hangi değişikliği yaptığı geri döndürülemez şekilde arşivlenerek mutlak denetleme ve manipülasyon koruması sağlanır."
        },
        {
            q: "e-Okul ile veri aktarımı nasıl çalışıyor?",
            a: "Senkron, e-Okul'un beklediği formatlarda raporlar üretir. Bu raporları tek tıkla indirip e-Okul sistemine yükleyebilir veya doğrudan entegrasyon API'larını kullanabilirsiniz."
        },
        {
            q: "Veri girişini siz yapıyor musunuz?",
            a: "Dilerseniz Excel formatındaki verilerinizi bize iletebilirsiniz. Uzman ekibimiz tüm öğrenci, öğretmen ve ders tanımlamalarınızı yaparak sistemi anahtar teslim şekilde size sunabilir."
        },
        {
            q: "Fiyatlandırma modeliniz nedir?",
            a: "Senkron, öğrenci başı yıllık lisanslama modeliyle çalışır. Yıllık öğrenci başı ücretimiz $1.80'dır. Bu ücrete tüm güncellemeler ve teknik destek dahildir."
        }
    ];

    // Calculator Logic
    const estimatedPrice = Number(studentCount) * 1.80;
    const monthlyPrice = estimatedPrice / 12;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-mono selection:bg-cyan-100 selection:text-cyan-900">
            {/* Navigation */}
            <nav className={cn(
                "fixed top-0 w-full z-50 transition-all duration-300 border-b",
                scrolled ? "bg-white/80 backdrop-blur-md py-3 shadow-sm border-slate-100" : "bg-transparent py-5 border-transparent"
            )}>
                <div className="container mx-auto px-6 flex justify-between items-center">
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <div className="w-10 h-10 rounded-none flex items-center justify-center group-hover:scale-110 transition-transform overflow-hidden">
                            <img src="/senkron_logo.png" alt="Senkron Logo" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter text-slate-900 uppercase">Senkron</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        <a href="#ozellikler" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">Özellikler</a>
                        <a href="#sss" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">SSS</a>
                        <a href="#nasil-calisir" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">Nasıl Çalışır</a>
                        <a href="#hesaplayici" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">Hesaplayıcı</a>
                        <a href="#taslaklar" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">Taslaklar</a>
                        <a href="#katalog" className="text-sm font-semibold text-slate-600 hover:text-cyan-600 transition-colors">Katalog</a>
                        <button
                            onClick={onLoginClick}
                            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold rounded-none shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all active:scale-95"
                        >
                            14 Gün Ücretsiz Dene
                        </button>
                    </div>

                    <button className="md:hidden text-slate-900" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        {isMenuOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </nav>

            {/* Mobile Menu */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 bg-white pt-24 px-6 md:hidden"
                    >
                        <div className="flex flex-col gap-6 text-center">
                            <a href="#ozellikler" onClick={() => setIsMenuOpen(false)} className="text-xl font-bold text-slate-800">Özellikler</a>
                            <a href="#sss" onClick={() => setIsMenuOpen(false)} className="text-xl font-bold text-slate-800">SSS</a>
                            <a href="#nasil-calisir" onClick={() => setIsMenuOpen(false)} className="text-xl font-bold text-slate-800">Nasıl Çalışır</a>
                            <a href="#hesaplayici" onClick={() => setIsMenuOpen(false)} className="text-xl font-bold text-slate-800">Hesaplayıcı</a>
                            <a href="#taslaklar" onClick={() => setIsMenuOpen(false)} className="text-xl font-bold text-slate-800">Taslaklar</a>
                            <button
                                onClick={() => { setIsMenuOpen(false); onLoginClick(); }}
                                className="w-full py-4 bg-cyan-500 text-white font-bold rounded-none"
                            >
                                14 Gün Ücretsiz Dene
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hero Section */}
            <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-cyan-50/50 rounded-[100%] blur-3xl -z-10" />

                <div className="container mx-auto px-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-none bg-cyan-50 border border-cyan-100 text-cyan-700 text-xs font-bold uppercase tracking-wider mb-6">
                            <ShieldCheck className="w-4 h-4" /> MEB Müfredatı ile %100 Uyumlu
                        </div>
                        <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter leading-[0.95] text-slate-900 mb-8 uppercase">
                            OKUL<br />
                            YÖNETİMİNDE<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">YENİ NESİL</span><br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">ÇÖZÜM</span>
                        </h1>
                        <p className="text-base md:text-lg text-slate-600 max-w-3xl mx-auto mb-8 font-medium leading-relaxed">
                            Öğretmen, öğrenci ve sınıf yönetiminden otomatik ders programı oluşturmaya, <span className="text-slate-900 font-bold">sınav kağıdını okuma</span>, <span className="text-slate-900 font-bold">yoklama takibinden</span> AI destekli analize kadar tüm eğitim süreçlerinizi tek platformda yönetin.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                            <button
                                onClick={onLoginClick}
                                className="w-full sm:w-auto px-10 py-5 bg-slate-900 text-white rounded-none font-black text-lg shadow-2xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                ÜCRETSİZ KAYDOL <ArrowRight className="w-5 h-5" />
                            </button>
                            <a
                                href="#nasil-calisir"
                                className="w-full sm:w-auto px-10 py-5 bg-white border-2 border-slate-200 text-slate-900 rounded-none font-black text-lg hover:border-cyan-500 hover:text-cyan-600 transition-all flex items-center justify-center gap-3"
                            >
                                NASIL ÇALIŞIR? <PlayCircle className="w-5 h-5" />
                            </a>
                        </div>

                        {/* Interactive Image Slider */}
                        <div className="relative max-w-5xl mx-auto mt-14">
                            {/* Massive Slide Title - Outside & Above */}
                            <div className="mb-8 px-4 md:px-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-6 bg-cyan-500 rounded-full" />
                                        <span className="text-[10px] md:text-xs font-black text-cyan-600 uppercase tracking-[0.3em]">Senkron Özellikleri</span>
                                    </div>
                                    <span className="text-sm md:text-lg font-black text-slate-300 tabular-nums">{currentSlide + 1} / {slides.length}</span>
                                </div>
                                <h2 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none">
                                    {slides[currentSlide].title}
                                </h2>
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3, duration: 0.8 }}
                                className="relative rounded-none p-2 bg-gradient-to-b from-white to-slate-200/50 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border-2 border-slate-900/10 ring-1 ring-slate-900/5 overflow-hidden"
                            >
                                <div className="aspect-[4/3] md:aspect-[16/11] bg-[#f8fafc] rounded-none overflow-hidden relative">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={currentSlide}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.5 }}
                                            className="absolute inset-0"
                                        >
                                            <img
                                                src={slides[currentSlide].url}
                                                alt={slides[currentSlide].title}
                                                className="w-full h-full object-cover"
                                            />
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </motion.div>

                            {/* Slider Navigation Dots - Outside & Below */}
                            <div className="flex justify-center gap-3 mt-8">
                                {slides.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentSlide(idx)}
                                        className={cn(
                                            "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                            currentSlide === idx ? "bg-cyan-500 w-10" : "bg-slate-300 hover:bg-slate-400"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>


            {/* How It Works Section */}
            <section id="nasil-calisir" className="py-24 md:py-32 bg-white">
                <div className="container mx-auto px-6">
                    <div className="max-w-3xl mx-auto text-center mb-16">
                        <h2 className="text-sm font-black text-cyan-600 uppercase tracking-widest mb-4">Süreç Nasıl İlerler?</h2>
                        <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-6 uppercase">3 ADIMDA OKULUNUZU DİJİTALLEŞTİRİN</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
                        {/* Step 1 */}
                        <div id="taslaklar" className="flex flex-col items-center text-center group scroll-mt-40">
                            <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-900 mb-6 group-hover:bg-cyan-500 group-hover:text-white transition-all border-2 border-slate-900/5">
                                <FileDown className="w-10 h-10" />
                            </div>
                            <span className="text-xs font-black text-cyan-600 uppercase tracking-widest mb-2">ADIM 1</span>
                            <h4 className="text-xl font-bold text-slate-900 mb-4 uppercase">TASLAKLARI İNDİRİN</h4>
                            <p className="text-slate-600 text-sm font-medium leading-relaxed mb-8">
                                Sisteme veri girişi yapmak için hazırladığımız standart Excel taslaklarını bilgisayarınıza indirin.
                            </p>

                            <div className="flex flex-col gap-3 w-full">
                                <a
                                    href="https://docs.google.com/spreadsheets/d/1oXtMAcUM4MA14C5vBGecf_vUVhNWGEml/export?format=xlsx"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 text-xs font-black text-slate-700 hover:border-cyan-500 hover:bg-white transition-all uppercase tracking-tighter"
                                >
                                    ÖĞRENCİ LİSTESİ TASLAĞI <FileDown className="w-4 h-4 text-cyan-500" />
                                </a>
                                <a
                                    href="https://docs.google.com/spreadsheets/d/1KmAwIYC-XkB7HNTqaGP5r-VF4V_7rCUj/export?format=xlsx"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 text-xs font-black text-slate-700 hover:border-cyan-500 hover:bg-white transition-all uppercase tracking-tighter"
                                >
                                    ÖĞRETMEN LİSTESİ TASLAĞI <FileDown className="w-4 h-4 text-cyan-500" />
                                </a>
                                <a
                                    href="https://docs.google.com/spreadsheets/d/18w96kP-GBStFqsjfPC4f_III5N0NV9SB/export?format=xlsx"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 text-xs font-black text-slate-700 hover:border-cyan-500 hover:bg-white transition-all uppercase tracking-tighter"
                                >
                                    DERS/BRANŞ TASLAĞI <FileDown className="w-4 h-4 text-cyan-500" />
                                </a>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex flex-col items-center text-center group">
                            <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-900 mb-6 group-hover:bg-cyan-500 group-hover:text-white transition-all border-2 border-slate-900/5">
                                <Edit3 className="w-10 h-10" />
                            </div>
                            <span className="text-xs font-black text-cyan-600 uppercase tracking-widest mb-2">ADIM 2</span>
                            <h4 className="text-xl font-bold text-slate-900 mb-4 uppercase">BİLGİLERİ DOLDURUN</h4>
                            <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                Okulunuzdaki mevcut verileri (öğrenci, öğretmen, ders programı) indirdiğiniz Excel dosyalarına kopyalayın.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="flex flex-col items-center text-center group">
                            <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-900 mb-6 group-hover:bg-cyan-500 group-hover:text-white transition-all border-2 border-slate-900/5">
                                <UploadCloud className="w-10 h-10" />
                            </div>
                            <span className="text-xs font-black text-cyan-600 uppercase tracking-widest mb-2">ADIM 3</span>
                            <h4 className="text-xl font-bold text-slate-900 mb-4 uppercase">SİSTEME YÜKLEYİN</h4>
                            <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                Hazırladığınız dosyaları Senkron paneline sürükleyip bırakın. Tüm okulunuz saniyeler içinde dijitalleşsin.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="ozellikler" className="py-24 md:py-32 bg-slate-100/80">
                <div className="container mx-auto px-6">
                    <div className="max-w-3xl mx-auto text-center mb-20">
                        <h2 className="text-sm font-black text-cyan-600 uppercase tracking-widest mb-4">Üstün Teknoloji</h2>
                        <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">Senkron ile Yönetim Artık Bir Sanat</h3>
                        <p className="text-lg text-slate-600 font-medium leading-relaxed mb-8">Ekipler arası veri kopukluğunu ve operasyonel karmaşayı ortadan kaldırıyoruz. Yapay zeka tabanlı bütünleşik ekosistemimizle okulunuzun akademik başarısını, idari verimliliğini ve kurumsal hafızasını tek bir merkezden, 360 derece yönetin.</p>
                        <a
                            href="https://drive.google.com/file/d/1L69KD7n84de0wc2lu4hmO8FSEW_1DOTI/view?usp=drive_link"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-none text-sm font-bold text-slate-600 hover:border-cyan-500 hover:text-cyan-600 transition-all shadow-sm shadow-slate-100"
                        >
                            <Database className="w-4 h-4" /> Detaylı Kataloğu İndirin (PDF)
                        </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((f, idx) => (
                            <motion.div
                                whileHover={{ y: -5 }}
                                key={idx}
                                className="bg-white p-8 rounded-none border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-cyan-500/5 transition-all group"
                            >
                                <div className="w-14 h-14 bg-cyan-50 rounded-none flex items-center justify-center text-cyan-600 mb-6 group-hover:scale-110 group-hover:bg-cyan-600 group-hover:text-white transition-all duration-300">
                                    {f.icon}
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 mb-4 tracking-tight">{f.title}</h4>
                                <p className="text-slate-600 text-sm leading-relaxed mb-6 font-medium">{f.description}</p>
                                <div className="flex flex-wrap gap-2">
                                    {f.items.map((item, i) => (
                                        <span key={i} className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-50 text-slate-500 rounded-none border border-slate-100">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="sss" className="bg-slate-900 py-24 relative overflow-hidden scroll-mt-20">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 blur-[120px] rounded-full" />
                <div className="container mx-auto px-6 max-w-4xl relative z-10">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase">Sıkça Sorulan Sorular</h2>
                    </div>

                    <div className="flex flex-col gap-4">
                        {faqs.map((faq, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 rounded-none overflow-hidden hover:border-cyan-500/30 transition-colors">
                                <button
                                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                                    className="w-full px-8 py-4 flex justify-between items-center text-left"
                                >
                                    <span className="text-base text-white tracking-tight flex-1">{faq.q}</span>
                                    <div className={cn("p-1 rounded-none transition-all", activeFaq === idx ? "bg-cyan-500 text-white rotate-45" : "bg-white/10 text-slate-400 -rotate-0")}>
                                        <Plus className="w-5 h-5" />
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {activeFaq === idx && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="px-8 pb-8 text-[15px] text-slate-300 font-medium leading-relaxed"
                                        >
                                            {faq.a}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Calculator Section */}
            <section id="hesaplayici" className="py-24 md:py-32 overflow-hidden relative bg-slate-100/80">
                <div className="container mx-auto px-6">
                    <div className="max-w-3xl mx-auto text-center mb-16">
                        <h2 className="text-sm font-black text-cyan-600 uppercase tracking-widest mb-4">Şeffaf Fiyatlandırma</h2>
                        <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-8">Bütçenizi Şeffafça Planlayın</h3>
                        <p className="text-lg text-slate-600 font-medium leading-relaxed">Senkron, okulunuzun büyüklüğüne göre ölçeklenir. Gizli ücretler yok, karmaşık paketler yok. Sadece öğrenci sayısı kadar ödeyin.</p>
                    </div>

                    <div className="max-w-2xl mx-auto bg-white rounded-none p-8 md:p-12 border-2 border-slate-200 shadow-2xl relative">
                        <div className="flex flex-col gap-10">
                            <div className="space-y-8">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <label className="text-sm font-black text-slate-900 uppercase tracking-wider">Öğrenci Sayısı</label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            value={studentCount}
                                            onChange={(e) => setStudentCount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                            onFocus={() => setStudentCount('')}
                                            className="text-center sm:text-right text-3xl font-black text-cyan-600 bg-slate-50 border-2 border-slate-100 rounded-none px-6 py-3 focus:border-cyan-500 focus:bg-white outline-none w-full sm:w-48 transition-all"
                                        />
                                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-cyan-600 rounded-full flex items-center justify-center text-white scale-0 group-hover:scale-100 transition-transform">
                                            <Check className="w-3 h-3" />
                                        </div>
                                    </div>
                                </div>
                                <input
                                    type="range" min="1" max="5000" step="50"
                                    value={studentCount}
                                    onChange={(e) => setStudentCount(Number(e.target.value))}
                                    className="w-full h-3 bg-slate-100 rounded-none appearance-none cursor-pointer accent-cyan-600"
                                />
                            </div>

                            <div className="pt-8 border-t border-slate-100 mt-4">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 py-8 bg-gradient-to-br from-cyan-50 to-blue-50 px-8 rounded-none border border-cyan-100/50">
                                    <div className="flex flex-col text-center sm:text-left">
                                        <span className="text-cyan-900 font-black text-xs uppercase tracking-[0.2em] mb-1">Yıllık Lisans Bedeli</span>
                                        <span className="text-slate-500 text-[11px] font-bold">Öğrenci başı $1.80 (Tüm özellikler dahil)</span>
                                    </div>
                                    <div className="flex flex-col items-center sm:items-end">
                                        <div className="text-cyan-600 font-black text-5xl tracking-tighter">
                                            ${estimatedPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </div>
                                        <div className="text-cyan-600/60 font-bold text-[13px] mt-1">
                                            aylık: ${monthlyPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8">
                                    <button
                                        onClick={onLoginClick}
                                        className="w-full py-5 bg-slate-900 text-white rounded-none font-black text-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-slate-900/20 mb-4"
                                    >
                                        ÜCRETSİZ KAYDOL
                                    </button>
                                    <p className="text-center text-slate-500 text-sm font-medium">
                                        * Kayıt için kredi kartı bilgisi gerekmez. 14 gün boyunca tüm özellikleri çekinmeden deneyebilirsiniz.
                                    </p>
                                </div>
                            </div>

                            <div className="text-center px-4">
                                <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic">
                                    * Bu tutar, okulunuzun yıllık toplam kullanım bedelidir. Teknik destek, bulut barındırma ve tüm yapay zeka güncellemeleri fiyata dahildir.
                                    <span className="text-cyan-600 font-bold block mt-1">İsteğe bağlı olarak veri girişleriniz uzman ekibimiz tarafından ücretsiz/destek kapsamında gerçekleştirilebilir.</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>



            {/* CTA Section */}
            <section className="pb-24 pt-12">
                <div className="container mx-auto px-6">
                    <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-none p-12 md:p-24 text-center relative overflow-hidden shadow-2xl shadow-cyan-500/30">
                        <div className="absolute inset-0 bg-grid-white/[0.05] -z-0" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white opacity-10 blur-[100px] rounded-full -z-0" />

                        <div className="relative z-10 max-w-2xl mx-auto">
                            <h2 className="text-4xl md:text-6xl font-black text-white mb-8 tracking-tighter leading-tight uppercase">OKULUNUZUN RİTMİNİ DEĞİŞTİRMEYE HAZIR MISINIZ?</h2>
                            <p className="text-cyan-100 text-xl font-medium mb-12">Karmaşayı durdurun, yönetimi sanat haline getirin. Senkron ile yarının okulunu bugün yönetin.</p>
                            <button
                                onClick={onLoginClick}
                                className="px-12 py-6 bg-white text-slate-900 rounded-none font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-cyan-900/40"
                            >
                                ÜCRETSİZ KAYDOL
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-20 bg-slate-50 border-t border-slate-100">
                <div className="container mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
                        <div className="col-span-1 md:col-span-1">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-8 h-8 overflow-hidden">
                                    <img src="/senkron_logo.png" alt="Senkron Logo" className="w-full h-full object-contain" />
                                </div>
                                <span className="text-xl font-black tracking-tighter text-slate-900 uppercase">Senkron</span>
                            </div>
                            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
                                Geleceğin okul yönetim sistemi. Yapay zeka ile her şey kontrolünüz altında.
                            </p>
                            <div className="flex gap-4">
                                <a
                                    href="https://instagram.com/senkronai"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-10 h-10 bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-pink-600 hover:border-pink-200 transition-all"
                                    title="Instagram'da bizi takip edin"
                                >
                                    <Instagram className="w-5 h-5" />
                                </a>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">HIZLI MENÜ</span>
                            <a href="#ozellikler" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">Özellikler</a>
                            <a href="#sss" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">SSS</a>
                            <a href="#nasil-calisir" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">Nasıl Çalışır</a>
                            <a href="#taslaklar" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">Taslaklar</a>
                            <a href="#hesaplayici" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">Hesaplayıcı</a>
                            <a href="#katalog" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">Katalog</a>
                        </div>

                        <div className="flex flex-col gap-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">İLETİŞİM</span>
                            <a href="mailto:agentzekai@gmail.com" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">agentzekai@gmail.com</a>
                            <a href="tel:+905458858577" className="text-slate-600 font-bold hover:text-cyan-600 transition-colors">+90 (545) 885 85 77</a>
                            <span className="text-slate-500 text-sm font-medium">Bilişim Vadisi, Gebze/Kocaeli</span>
                        </div>

                        <div className="flex flex-col gap-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">YASAL</span>
                            <button onClick={() => setLegalModal({ isOpen: true, ...legalContent.terms })} className="text-left text-slate-600 font-bold hover:text-cyan-600 transition-colors">Kullanım Şartları</button>
                            <button onClick={() => setLegalModal({ isOpen: true, ...legalContent.privacy })} className="text-left text-slate-600 font-bold hover:text-cyan-600 transition-colors">Gizlilik Politikası</button>
                            <button onClick={() => setLegalModal({ isOpen: true, ...legalContent.kvkk })} className="text-left text-slate-600 font-bold hover:text-cyan-600 transition-colors">KVKK Aydınlatma</button>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-slate-200/50">
                        <span className="text-slate-400 text-sm font-medium">© 2026 Senkron AI. Tüm hakları saklıdır.</span>
                        <div className="flex gap-8">
                            <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">MADE IN TURKIYE</span>
                            <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">SECURE PAYMENT</span>
                        </div>
                    </div>
                </div>
            </footer>

            {/* Back to top button snippet */}
            {scrolled && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-8 right-8 w-14 h-14 bg-white border border-slate-100 shadow-2xl rounded-none flex items-center justify-center text-slate-900 z-50 hover:bg-slate-50 transition-colors"
                >
                    <ChevronRight className="w-6 h-6 -rotate-90" />
                </motion.button>
            )}

            {/* WhatsApp Floating Button */}
            <a
                href="https://wa.me/905458858577"
                target="_blank"
                rel="noreferrer"
                className="fixed bottom-8 left-8 w-14 h-14 bg-green-500 shadow-2xl shadow-green-500/30 rounded-none flex items-center justify-center text-white z-50 cursor-pointer hover:scale-110 active:scale-95 transition-all"
            >
                <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.672 1.433 5.66 1.434h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
            </a>

            {/* Legal Modal Render */}
            <AnimatePresence>
                {legalModal?.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setLegalModal(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-none shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{legalModal.title}</h3>
                                <button onClick={() => setLegalModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-6 h-6 text-slate-500" />
                                </button>
                            </div>
                            <div className="p-8 overflow-y-auto text-slate-600 font-medium leading-relaxed">
                                {legalModal.content}
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
                                <button
                                    onClick={() => setLegalModal(null)}
                                    className="px-8 py-3 bg-slate-900 text-white rounded-none font-bold hover:scale-105 active:scale-95 transition-all"
                                >
                                    ANLADIM, KAPAT
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LandingPage;
