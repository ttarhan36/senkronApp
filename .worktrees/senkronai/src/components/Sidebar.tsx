
import React from 'react';
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
    <nav className="w-16 bg-[#1e2e3d] border-r border-[#354a5f] flex flex-col items-center py-4 shadow-xl shrink-0">
      <div className="w-10 h-10 flex items-center justify-center mb-6 transition-transform hover:scale-110">
        <LogoSVG className="w-full h-full text-[#3b82f6] drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
      </div>

      <div className="flex-1 space-y-1 w-full overflow-y-auto no-scrollbar">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveModule(item.id as ModuleType)}
            title={item.label}
            className={`w-full h-8 flex items-center justify-center transition-all duration-200 group relative ${
              activeModule === item.id 
                ? 'bg-[#141d26] border-l-4 border-[#3b82f6] text-[#3b82f6]' 
                : 'text-[#909aa3]/50 hover:text-[#e4e4e7] hover:bg-[#141d26]/40 border-l-4 border-transparent'
            }`}
          >
            <i className={`fa-solid ${item.icon} text-[14px] group-hover:scale-110 transition-transform`}></i>
          </button>
        ))}
      </div>

      <div className="mt-auto px-2 py-4 border-t border-[#354a5f] w-full">
        <div className="flex flex-col items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${dbError === 'RLS_BLOCKED' ? 'bg-orange-500 animate-pulse' : dbError === 'CONNECTION_FAILED' ? 'bg-red-500' : 'bg-green-500/40'}`}></div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;