import React from "react";
import { 
  Fingerprint, 
  GraduationCap, 
  Database, 
  FileText, 
  Info,
  ShieldCheck,
  Cpu
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  presentCount: number;
  totalCount: number;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  presentCount, 
  totalCount 
}: SidebarProps) {
  const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  const menuItems = [
    { id: "asistencia", label: "Control de Entrada", icon: Fingerprint, desc: "Toma de asistencia biométrica" },
    { id: "estudiantes", label: "Asistencia", icon: GraduationCap, desc: "Listado oficial y registro" },
    { id: "reportes", label: "Reportes & Estadísticas", icon: FileText, desc: "Exportación y análisis" },
  ];

  return (
    <aside className="w-80 bg-white border-r border-[#e2e8f0] flex flex-col h-screen sticky top-0 no-print">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#f4f4fa] bg-linear-to-br from-brand-blue-light to-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-blue text-white rounded-xl shadow-md shadow-blue-500/10">
            <Fingerprint size={26} className="animate-pulse" />
          </div>
          <div>
            <h1 className="font-family-hanken font-bold text-xl leading-tight text-brand-blue-deep">
              EduAttend <span className="text-brand-lila">Bio</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">I.E. San Pedro Claver - 11A</p>
          </div>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 p-4 space-y-2 mt-4">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
          Módulos del Sistema
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-start gap-3.5 p-3.5 rounded-xl text-left transition-all group ${
                isActive
                  ? "bg-brand-lila-light text-brand-lila-dark shadow-sm border-l-4 border-brand-lila pl-2.5"
                  : "text-slate-600 hover:bg-slate-50 hover:text-brand-blue"
              }`}
            >
              <Icon 
                size={20} 
                className={`mt-0.5 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? "text-brand-lila animate-bounce" : "text-slate-400"
                }`} 
              />
              <div>
                <div className="text-sm font-semibold tracking-tight">{item.label}</div>
                <div className="text-xs text-slate-500 font-normal leading-relaxed mt-0.5 opacity-80">
                  {item.desc}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Biometric Security Seal & Local Database Status */}
      <div className="p-4 mx-4 mb-4 bg-linear-to-b from-brand-lila-light/40 to-brand-lila-light/10 rounded-2xl border border-brand-lila/10 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1 bg-brand-lila text-white rounded-full">
            <ShieldCheck size={14} />
          </div>
          <span className="text-xs font-bold text-brand-lila-dark">Persistencia Local en Disco</span>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
          Tus huellas y datos se guardan permanentemente en <b>database.json</b> en el disco duro local. No se borrarán al cerrar la plataforma.
        </p>
      </div>

      {/* Hardware Status footer bar */}
      <div className="p-4 border-t border-[#f4f4fa] bg-slate-50/70 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
          <span className="font-semibold text-slate-700">DB Local Guardada</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Cpu size={14} className="text-brand-lila" />
          <span className="font-mono text-[10px]">AS608 v1.4</span>
        </div>
      </div>
    </aside>
  );
}
