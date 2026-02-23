
import React, { useState } from 'react';
import { ModuleType, UserRole } from '../types';

interface SidebarProps {
  activeModule: ModuleType;
  setActiveModule: (m: ModuleType) => void;
  editMode: boolean;
  setEditMode: (e: boolean) => void;
  userRole: UserRole;
  dbError?: string | null;
}

const LogoSVG = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="80" height="80" stroke="currentColor" strokeWidth="8" rx="2" />
    <path d="M70 30 H30 V50 H70 V70 H30" stroke="currentColor" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter"/>
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ activeModule, setActiveModule, userRole, dbError }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  let menuItems = [];

  if (userRole === UserRole.STUDENT) {
    menuItems = [
      { id: ModuleType.STUDENT_OVERVIEW, label: 'KİMLİK', icon: 'fa-id-card', roles: [UserRole.STUDENT] },
      { id: ModuleType.STUDENT_ATTENDANCE, label: 'DEVAMSIZLIK', icon: 'fa-user-clock', roles: [UserRole.STUDENT] },
      { id: ModuleType.STUDENT_TOPICS, label: 'KONULAR', icon: 'fa-book-open', roles: [UserRole.STUDENT] },
      { id: ModuleType.STUDENT_EXAMS, label: 'SINAVLAR', icon: 'fa-calendar-check', roles: [UserRole.STUDENT] },
      { id: ModuleType.STUDENT_GRADES, label: 'NOTLARIM', icon: 'fa-file-signature', roles: [UserRole.STUDENT] },
      { id: ModuleType.STUDENT_COURSES, label: 'KURSLAR', icon: 'fa-graduation-cap', roles: [UserRole.STUDENT] },
      { id: ModuleType.COMMUNICATION, label: 'İLETİŞİM', icon: 'fa-bullhorn', roles: [UserRole.STUDENT] },
      { id: ModuleType.CLASS_SCHEDULES, label: 'DERS PROGRAMI', icon: 'fa-calendar-alt', roles: [UserRole.STUDENT] },
    ];
  } else if (userRole === UserRole.TEACHER) {
    menuItems = [
      { id: ModuleType.TEACHER_OVERVIEW, label: 'KİMLİK', icon: 'fa-id-card', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_AGENDA, label: 'AJANDA', icon: 'fa-calendar-day', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_CLASSES, label: 'ŞUBELERİM', icon: 'fa-users-rectangle', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_STUDENTS, label: 'ÖĞRENCİLERİM', icon: 'fa-user-graduate', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_SCHEDULE, label: 'PLAN', icon: 'fa-calendar-week', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_CONSTRAINTS, label: 'KISITLAMALAR', icon: 'fa-ban', roles: [UserRole.TEACHER] },
      { id: ModuleType.TEACHER_PERFORMANCE, label: 'PERFORMANS', icon: 'fa-chart-line', roles: [UserRole.TEACHER] },
      { id: ModuleType.COMMUNICATION, label: 'İLETİŞİM', icon: 'fa-bullhorn', roles: [UserRole.TEACHER] },
      { id: ModuleType.COURSES, label: 'KURSLAR', icon: 'fa-graduation-cap', roles: [UserRole.TEACHER] },
      { id: ModuleType.GUARD_DUTY, label: 'NÖBET LİSTESİ', icon: 'fa-shield-halved', roles: [UserRole.TEACHER] },
    ];
  } else {
    // Admin Items
    menuItems = [
      { id: ModuleType.DASHBOARD, label: 'KONSOL', icon: 'fa-terminal', roles: [UserRole.ADMIN] },
      { id: ModuleType.TEACHERS, label: 'KADRO', icon: 'fa-id-badge', roles: [UserRole.ADMIN] },
      { id: ModuleType.CLASSES, label: 'ŞUBELER', icon: 'fa-cubes', roles: [UserRole.ADMIN] },
      { id: ModuleType.COURSES, label: 'KURSLAR', icon: 'fa-graduation-cap', roles: [UserRole.ADMIN] },
      { id: ModuleType.COMMUNICATION, label: 'İLETİŞİM', icon: 'fa-bullhorn', roles: [UserRole.ADMIN] },
      { id: ModuleType.GUARD_DUTY, label: 'NÖBET', icon: 'fa-shield-halved', roles: [UserRole.ADMIN] },
      { id: ModuleType.CLASS_SCHEDULES, label: 'PLANLAR', icon: 'fa-calendar-alt', roles: [UserRole.ADMIN] },
      { id: ModuleType.LESSONS, label: 'ENVANTER', icon: 'fa-layer-group', roles: [UserRole.ADMIN] },
      { id: ModuleType.SCHEDULING, label: 'MOTOR', icon: 'fa-bolt', roles: [UserRole.ADMIN] },
      { id: ModuleType.SETTINGS, label: 'AYARLAR', icon: 'fa-gear', roles: [UserRole.ADMIN] },
    ].filter(item => item.roles.includes(userRole));
  }

  return (
    <>
      {/* Mobile Menu Button - Only visible on small screens */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden fixed top-3 left-3 z-[100] w-10 h-10 bg-[#1e2e3d] border border-[#354a5f] flex items-center justify-center text-[#3b82f6] active:scale-95 transition-all shadow-lg"
      >
        <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-lg`}></i>
      </button>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <nav className={`
        fixed md:relative inset-y-0 left-0 z-[90]
        w-64 md:w-48 bg-[#1e2e3d] border-r border-[#354a5f] 
        flex flex-col items-stretch py-4 shadow-xl
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
      <div className="px-6 mb-8 flex flex-col items-start shrink-0">
        <div className="w-12 h-12 flex items-center justify-center mb-2 transition-transform hover:scale-110">
          <LogoSVG className="w-full h-full text-[#3b82f6] drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
        </div>
        <div>
          <h1 className="text-[12px] font-black tracking-[0.4em] text-white uppercase leading-none">SENKRON</h1>
          <p className="text-[7px] text-[#3b82f6] font-bold uppercase tracking-[0.2em] mt-1.5 opacity-80 border-t border-[#354a5f] pt-1">BULUT_MODU v2.5</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 px-3 overflow-y-auto no-scrollbar">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveModule(item.id as ModuleType);
              setIsMobileMenuOpen(false); // Close menu on mobile after selection
            }}
            className={`w-full flex items-center justify-start gap-4 px-4 py-3 transition-all duration-200 group relative ${
              activeModule === item.id 
                ? 'bg-[#141d26] border-l-4 border-[#3b82f6] text-[#3b82f6]' 
                : 'text-[#909aa3]/50 hover:text-[#e4e4e7] hover:bg-[#141d26]/40 border-l-4 border-transparent'
            }`}
          >
            <i className={`fa-solid ${item.icon} w-5 text-center text-[12px] group-hover:scale-110 transition-transform`}></i>
            <span className="font-black text-[8px] uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto px-6 py-4 border-t border-[#354a5f]">
        <div className="space-y-2">
            <div className="flex justify-between items-center text-[6px] font-black uppercase tracking-widest">
              <span className="text-[#909aa3]/30">CLOUD SYNC</span>
              {dbError === 'RLS_BLOCKED' ? (
                <span className="text-orange-500 animate-pulse">RLS_ENGELİ</span>
              ) : dbError === 'CONNECTION_FAILED' ? (
                <span className="text-red-500">CONN_HATA</span>
              ) : (
                <span className="text-green-500/40">DNA_OK</span>
              )}
            </div>
            <div className={`h-[1px] ${dbError ? 'bg-orange-500/50' : 'bg-[#354a5f]'} overflow-hidden`}>
              <div className={`h-full ${dbError ? 'bg-orange-500 w-[40%] animate-ping' : 'bg-green-500 w-full opacity-20'}`}></div>
            </div>
        </div>
      </div>
    </nav>
    </>
  );
};

export default Sidebar;