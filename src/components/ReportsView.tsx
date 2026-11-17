import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Download, 
  Printer, 
  Calendar, 
  Check, 
  X, 
  Filter, 
  BarChart2, 
  AlertCircle 
} from "lucide-react";
import { Student, AttendanceRecord } from "../types";
import { isAfter630AM } from "../utils/timeFormatter";

interface ReportsViewProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  selectedDate: string;
}

export default function ReportsView({
  students,
  attendanceRecords,
  selectedDate
}: ReportsViewProps) {
  const [filterType, setFilterType] = useState<"todos" | "presentes" | "ausentes">("todos");
  const [reportDate, setReportDate] = useState<string>(selectedDate);

  useEffect(() => {
    setReportDate(selectedDate);
  }, [selectedDate]);

  // Compute stats for report date
  const totalStudents = students.length;
  const recordedToday = attendanceRecords.filter(r => r.date === reportDate);
  const presentCount = recordedToday.filter(r => r.present).length;
  const absentCount = totalStudents - presentCount;
  const attendancePercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Compile list with attendance status on selected date
  const compiledList = students.map(student => {
    const record = attendanceRecords.find(r => r.studentId === student.id && r.date === reportDate);
    return {
      ...student,
      present: record ? record.present : false,
      time: record?.timestamp || "--"
    };
  });

  // Sort alphabetically by last name!
  const sortedCompiledList = [...compiledList].sort((a, b) => {
    const nameA = `${a.lastName} ${a.name}`.toLowerCase();
    const nameB = `${b.lastName} ${b.name}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Filter based on selected filter
  const filteredCompiledList = sortedCompiledList.filter(item => {
    if (filterType === "presentes") return item.present;
    if (filterType === "ausentes") return !item.present;
    return true; // "todos"
  });

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Filters and Command Actions */}
      <div className="bg-white p-6 rounded-2xl border border-[#e2e8f0] flex flex-col md:flex-row gap-4 justify-between items-center no-print">
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 shrink-0">
              <Calendar size={14} className="text-brand-blue" />
              Ver de la Fecha:
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="p-2 border border-[#c3c6d7] rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {/* Present/Absent Tabs Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(["todos", "presentes", "ausentes"] as const).map((tab) => {
              let label = "";
              let count = 0;
              if (tab === "todos") {
                label = "Todos";
                count = totalStudents;
              } else if (tab === "presentes") {
                label = "Presentes";
                count = presentCount;
              } else if (tab === "ausentes") {
                label = "Ausentes";
                count = absentCount;
              }

              return (
                <button
                  key={tab}
                  onClick={() => setFilterType(tab)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wide transition-all flex items-center gap-1.5 cursor-pointer ${
                    filterType === tab
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${
                    filterType === tab
                      ? "bg-slate-100 text-slate-700"
                      : "bg-slate-200/60 text-slate-500"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

        </div>

        {/* Generate triggers toolbar */}
        <div className="flex items-center gap-2">
          {/* Printer button */}
          <button
            onClick={handlePrintReport}
            className="px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-850 rounded-xl text-xs font-bold flex items-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-sm"
          >
            <Printer size={14} />
            Imprimir Reporte (PDF)
          </button>
        </div>
      </div>

      {/* Main Print Wrapper Container */}
      <div className="bg-white p-8 rounded-3xl border border-[#e2e8f0] shadow-sm relative overflow-hidden" id="printable-report">
        
        {/* Top Header display in print */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b-2 border-brand-blue/30 mb-6 gap-4">
          <div>
            <span className="text-[10px] font-extrabold text-brand-lila uppercase tracking-widest bg-brand-lila-light px-2.5 py-1 rounded-md mb-2 inline-block">
              Reporte Oficial de Asistencia
            </span>
            <h2 className="font-family-hanken font-extrabold text-2xl text-brand-blue-deep leading-tight">
              Institución Educativa San Pedro Claver - Aula Virtual 11A
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Grado: <b>Grado 11º - Sección A</b> • Jornada: Mañana • Director: Ing. Carlos Gómez
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha Consulta</p>
            <p className="text-lg font-family-hanken font-bold text-brand-blue">{reportDate}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Sincronizado vía Terminal Biométrico</p>
          </div>
        </div>

        {/* Stats segment display in top block of report */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 mb-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Estudiantes</span>
            <p className="text-2xl font-black font-family-hanken mt-1 text-slate-800">{totalStudents}</p>
          </div>
          <div className="text-center md:text-left border-l border-slate-200 pl-0 md:pl-4">
            <span className="text-[10px] uppercase font-bold text-emerald-600">Alumnos Presentes (X)</span>
            <p className="text-2xl font-black font-family-hanken mt-1 text-emerald-700">{presentCount}</p>
          </div>
          <div className="text-center md:text-left border-l border-slate-200 pl-0 md:pl-4">
            <span className="text-[10px] uppercase font-bold text-slate-500">Alumnos Ausentes</span>
            <p className="text-2xl font-black font-family-hanken mt-1 text-slate-600">{absentCount}</p>
          </div>
          <div className="text-center md:text-left border-l border-slate-200 pl-0 md:pl-4">
            <span className="text-[10px] uppercase font-bold text-brand-blue">Ratio de Asistencia</span>
            <p className="text-2xl font-black font-family-hanken mt-1 text-brand-blue">{attendancePercentage}%</p>
          </div>
        </div>

        {/* Dynamic alphabetical students list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-medium text-slate-700">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3">ID Académico</th>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3 text-center">Registro de Huella</th>
                <th className="px-4 py-3 text-center">Fecha / Hora de Asistencia</th>
                <th className="px-4 py-3 text-right">Asistencia de Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCompiledList.length > 0 ? (
                filteredCompiledList.map((student) => {
                  const isLate = student.present && student.time !== "--" ? isAfter630AM(student.time) : false;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-400">
                        {student.idAcademico.replace(/11A-?/gi, "")}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span className={`${isLate ? "line-through text-slate-400 decoration-rose-500 decoration-[1.5px]" : "text-slate-800"}`}>
                            {student.lastName}, {student.name}
                          </span>
                          {isLate && (
                            <span className="text-[8px] bg-rose-50 text-rose-600 border border-rose-200 px-1 py-0.5 rounded uppercase font-bold tracking-wider">
                              Llegada Tarde
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-[10px] text-slate-400">
                        {student.fingerprintHash.substring(0, 15)}...
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-700">
                        {student.present ? (
                          <span className={isLate ? "text-rose-600 font-bold" : "text-slate-705"}>
                            {reportDate} {student.time}
                          </span>
                        ) : "--"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`inline-block w-8 py-1 rounded-md text-center font-font-family-hanken font-black text-xs ${
                          student.present 
                            ? isLate
                              ? "bg-rose-100 text-rose-700 font-black border border-rose-200"
                              : "bg-brand-blue-light text-brand-blue font-black" 
                            : "bg-slate-100 text-slate-400 font-normal"
                        }`}>
                          {student.present ? "X" : "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic font-normal">
                    No se registran alumnos con el filtro seleccionado para la fecha "{reportDate}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures verification display in printable section */}
        <div className="grid grid-cols-2 gap-8 mt-16 pt-8 border-t border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <div className="space-y-12">
            <div className="w-48 h-[1px] bg-slate-300 mx-auto" />
            <p>Director de Grado / Coordinador</p>
          </div>
          <div className="space-y-12">
            <div className="w-48 h-[1px] bg-slate-300 mx-auto" />
            <p>Área de Sistemas & Biometría</p>
          </div>
        </div>

        {/* Security seal stamp in bottom page */}
        <div className="mt-12 text-center text-[9px] text-slate-400 font-mono no-print">
          ID de Certificación: bio_secure_sha256_colegio_11a_v2.0_valid_commit
        </div>

      </div>

    </div>
  );
}
