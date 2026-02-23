import React, { useState, useRef, useEffect } from 'react';
import { GeminiMessage, Teacher, ClassSection, Lesson, UserRole } from '../types';
import { chatWithGemini, getTTSAudio, getAudioContext } from '../services/geminiService';

interface ChatPanelProps {
  teachers: Teacher[];
  classes: ClassSection[];
  lessons: Lesson[];
  userRole?: UserRole;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ teachers, classes, lessons, userRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<GeminiMessage[]>([
    { role: 'model', content: `SİSTEM ÇEVRİMİÇİ (${userRole}). Ben Senkron-AI. Translation-Sealed modu aktif. Bana istediğin dilde seslenebilirsin, Türkçeye çevirip okul verilerine göre yanıtlayacağım.`, timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activePlaybackId, setActivePlaybackId] = useState<number | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      // Otomatik dil tespiti için bazen lang boş bırakılır veya sistem dilleri kullanılır
      recognitionRef.current.lang = 'tr-TR'; 

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInput('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setActivePlaybackId(null);
    setIsAudioLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const finalInput = input;
    const userMsg: GeminiMessage = { role: 'user', content: finalInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const context = { teachers, classes, lessons };
      // AI'ya rol bilgisini ve çeviri zorunluluğunu tekrar hatırlat
      const systemContext = `[USER_ROLE: ${userRole}] [MODE: TRANSLATION_SEALED] Mesaj: ${finalInput}`;
      const response = await chatWithGemini(systemContext, context);
      setMessages(prev => [...prev, { role: 'model', content: response || "Yanıt üretilemedi.", timestamp: Date.now() }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: "BAĞLANTI HATASI: Mantık Motoru meşgul.", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleToggleAudio = async (text: string, id: number) => {
    if (activePlaybackId === id) { stopAudio(); return; }
    stopAudio();
    setActivePlaybackId(id);
    setIsAudioLoading(true);
    try {
      const ctx = await getAudioContext();
      const audioBuffer = await getTTSAudio(text);
      if (audioBuffer && activePlaybackId === id) {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => { if (activePlaybackId === id) { setActivePlaybackId(null); setIsAudioLoading(false); } };
        audioSourceRef.current = source;
        setIsAudioLoading(false);
        source.start(0);
      } else { stopAudio(); }
    } catch (e) { stopAudio(); }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-2 left-1 w-14 h-14 bg-[#007BFF] text-white flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(0,123,255,0.4)] z-[100] hover:scale-110 transition-all duration-300 ${isOpen ? 'rotate-180 bg-[#1a1a1a]' : ''}`}
      >
        <i className={`fa-solid ${isOpen ? 'fa-xmark' : 'fa-robot'} text-xl`}></i>
        {!isOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#0a0a0a] animate-bounce"></span>}
      </button>

      {isOpen && (
        <div className="fixed bottom-20 left-1 w-[350px] h-[550px] bg-[#161616] border border-[#333] shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[110] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
          <div className="p-4 border-b border-[#2a2a2a] bg-black/80 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 bg-[#007BFF]/20 flex items-center justify-center rounded-sm border border-[#007BFF]/30">
                   <i className="fa-solid fa-headset text-[#007BFF] text-xs"></i>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#161616] animate-pulse"></div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">SENKRON_AI</span>
                <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">TRANSLATION-SEALED v2.5</span>
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-6 bg-black/40 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[85%] p-3.5 text-[11px] leading-relaxed relative ${m.role === 'user' ? 'bg-[#007BFF] text-white font-medium border border-white/10 shadow-lg' : 'bg-[#222] border border-[#333] text-gray-300 shadow-xl'}`}>
                   <div className={`absolute top-0 w-2 h-2 ${m.role === 'user' ? '-right-1 bg-[#007BFF]' : '-left-1 bg-[#222]'} rotate-45`}></div>
                   {m.content}
                </div>
                {m.role === 'model' && (
                  <button onClick={() => handleToggleAudio(m.content, i)} disabled={isAudioLoading && activePlaybackId !== i} className="mt-2 text-[8px] font-black text-[#3b82f6] uppercase tracking-widest hover:text-white transition-all">
                    {activePlaybackId === i ? '■ SESİ DURDUR' : '▶ SESLİ DİNLE'}
                  </button>
                )}
              </div>
            ))}
            {isTyping && <div className="flex items-center gap-2 ml-1 animate-pulse"><i className="fa-solid fa-spinner animate-spin text-[8px] text-[#007BFF]"></i><span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">DNA_İŞLENİYOR...</span></div>}
          </div>

          <div className="p-4 bg-[#0c0c0c] border-t border-[#2a2a2a] space-y-4">
            <div className="flex gap-2 relative">
              <button onClick={toggleListening} className={`w-12 h-12 flex items-center justify-center transition-all border ${isListening ? 'bg-red-600 border-red-400 animate-pulse text-white shadow-[0_0_15px_#ef4444]' : 'bg-[#222] border-[#333] text-gray-500 hover:text-white'}`}>
                <i className={`fa-solid ${isListening ? 'fa-microphone' : 'fa-microphone-lines'} text-lg`}></i>
              </button>
              <input type="text" placeholder={isListening ? "Dinleniyor..." : "Her dilde sorabilirsin..."} className="flex-1 bg-black/60 border border-[#2a2a2a] px-5 py-4 text-[10px] font-bold uppercase tracking-widest focus:border-[#007BFF] outline-none text-white" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
              <button onClick={handleSend} disabled={!input.trim() || isTyping} className={`w-12 h-12 flex items-center justify-center transition-all ${!input.trim() ? 'bg-gray-800 text-gray-600' : 'bg-[#007BFF] text-white hover:brightness-110 active:scale-95'}`}><i className="fa-solid fa-paper-plane text-sm"></i></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPanel;