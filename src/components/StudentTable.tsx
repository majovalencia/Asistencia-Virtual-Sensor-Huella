import React, { useState } from "react";
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Fingerprint, 
  UserCheck, 
  UserX,
  Lock,
  Unlock,
  ChevronsUpDown,
  Filter
} from "lucide-react";
import { Student, AttendanceRecord } from "../types";
import { isAfter630AM } from "../utils/timeFormatter";

interface StudentTableProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  selectedDate: string;
  onAddStudentClick: () => void;
  onEditStudentClick: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onToggleAttendance: (studentId: string) => void;
}

export default function StudentTable({
  students,
  attendanceRecords,
  selectedDate,
  onAddStudentClick,
  onEditStudentClick,
  onDeleteStudent,
  onToggleAttendance
}: StudentTableProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [biometricSecured, setBiometricSecured] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter students based on search name/lastname or academic ID
  const filteredStudents = students.filter(student => {
    const searchString = `${student.name} ${student.lastName} ${student.idAcademico}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  // Sort them ALPHABETICALLY by Last Name and First name as required: "Que estén en orden alfabético"
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const nameA = `${a.lastName} ${a.name}`.toLowerCase();
    const nameB = `${b.lastName} ${b.name}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden">
      
      {/* Controls and Actions Bar */}
      <div className="p-6 border-b border-[#f4f4fa] flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div>
          <h3 className="font-family-hanken font-bold text-lg text-slate-800">
            Listado Oficial de Estudiantes del Grado 11A
          </h3>
          <p className="text-xs text-slate-400">
            Haga clic en las filas para conmutar asistencia manualmente o use la sección "Control de Entrada" biométrica.
          </p>
        </div>

        {/* Buttons and Search container */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Decryption toggle for security representation */}
          <button
            onClick={() => setBiometricSecured(!biometricSecured)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-all ${
              biometricSecured
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
            title="Conmuta encriptación de hash biométrico en la grilla."
          >
            {biometricSecured ? <Lock size={14} /> : <Unlock size={14} />}
            {biometricSecured ? "Biometría Segura: AES-256" : "Biometría Visible"}
          </button>

          <button
            onClick={onAddStudentClick}
            className="px-4 py-2 bg-brand-blue text-white font-semibold text-xs rounded-xl hover:bg-brand-blue-deep flex items-center gap-2 shadow-sm shadow-blue-500/10 transition-transform active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            Agregar Estudiante
          </button>
        </div>
      </div>

      {/* Roster Search Filters bar */}
      <div className="px-6 py-4 bg-slate-50/70 border-b border-[#f4f4fa] flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-2.5 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, apellido, código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white pl-9 pr-4 py-2 text-xs font-medium border border-[#c3c6d7] rounded-xl outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-all"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Mostrando <span className="font-bold text-brand-blue">{sortedStudents.length}</span> estudiantes del roster. Orden: <span className="font-bold text-brand-lila">Alfabético [A-Z]</span>
        </div>
      </div>

      {/* Dynamic Student Matrix Grid / Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f8f9fc] border-b border-[#e2e8f0] text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <th className="px-6 py-4"># Cod.</th>
              <th className="px-6 py-4">Estudiante (Apellido, Nombre)</th>
              <th className="px-6 py-4 text-center">Firma Biométrica</th>
              <th className="px-6 py-4 text-center">Asistencia [X]</th>
              <th className="px-6 py-4 text-center">Detalle Registro</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f4f4fa] text-xs font-medium text-slate-600">
            {sortedStudents.length > 0 ? (
              sortedStudents.map((student, index) => {
                // Check if recorded as present on the selected date
                const record = attendanceRecords.find(
                  (r) => r.studentId === student.id && r.date === selectedDate
                );
                const isPresent = record ? record.present : false;
                const isLate = isPresent && record?.timestamp ? isAfter630AM(record.timestamp) : false;

                return (
                  <tr 
                    key={student.id} 
                    className="hover:bg-brand-blue-light/20 transition-colors group"
                  >
                    {/* Academic registration matricula */}
                    <td className="px-6 py-4 font-mono font-bold text-slate-500">
                      {student.idAcademico.replace(/11A-?/gi, "")}
                    </td>

                    {/* Surname / First Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-blue-light text-brand-blue-deep flex items-center justify-center font-bold text-[11px] uppercase border border-brand-blue/10">
                          {student.lastName.charAt(0)}{student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-bold text-sm leading-tight transition-all ${
                              isLate 
                                ? "line-through text-slate-400 decoration-rose-500 decoration-2" 
                                : "text-slate-800"
                            }`}>
                              {student.lastName}, {student.name}
                            </p>
                            {isLate && (
                              <span className="text-[9px] text-rose-600 font-extrabold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse shrink-0">
                                Llegada Tarde
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 tracking-wide mt-0.5">
                            ID: {student.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Hash fingerprint representational */}
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono text-[9px] font-bold border border-slate-200">
                        <Fingerprint size={12} className="text-brand-lila" />
                        {biometricSecured 
                          ? `${student.fingerprintHash.substring(0, 11)}... [ENCRYPTED]` 
                          : student.fingerprintHash
                        }
                      </div>
                    </td>

                    {/* Present/Absent Indicator as: 'Los estudiantes que ingresan quedaran tachados con una X, y los estudiantes ausentes se deja en blanco' */}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => onToggleAttendance(student.id)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border font-family-hanken text-lg font-extrabold shadow-xs transition-all ${
                          isPresent
                            ? "bg-brand-blue text-white border-brand-blue shadow-blue-500/10 scale-105"
                            : "bg-white hover:bg-slate-50 text-slate-300 border-slate-200"
                        }`}
                        title="Haga clic para conmutar asistencia de forma manual"
                      >
                        {isPresent ? "X" : ""}
                      </button>
                    </td>

                    {/* Registration hour log details */}
                    <td className="px-6 py-4 text-center">
                      {isPresent && record?.timestamp ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`font-bold font-mono text-[11px] ${isLate ? "text-rose-600" : "text-slate-800"}`}>
                            {record.timestamp}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded-md mt-0.5 uppercase tracking-wider ${
                            isLate 
                              ? "bg-rose-100 text-rose-700 border border-rose-200" 
                              : "bg-brand-blue-light text-brand-blue"
                          }`}>
                            {isLate ? "Llegada Tarde" : (record.method || "Biométrico")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-normal text-[10px]">
                          Sin registros hoy
                        </span>
                      )}
                    </td>

                    {/* CRUDS actions */}
                    <td className="px-6 py-4 text-right">
                      {deletingId === student.id ? (
                        <div className="flex justify-end items-center gap-1.5">
                          <span className="text-[10px] font-bold text-rose-500 mr-1 shrink-0">¿Eliminar?</span>
                          <button
                            onClick={() => {
                              onDeleteStudent(student.id);
                              setDeletingId(null);
                            }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg shadow-sm cursor-pointer transition-all"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] rounded-lg border border-slate-300 cursor-pointer transition-all"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditStudentClick(student)}
                            className="p-1.5 bg-slate-50 hover:bg-brand-lila-light text-slate-600 hover:text-brand-lila-dark rounded-lg border border-slate-200 hover:border-brand-lila/30 transition-all cursor-pointer"
                            title="Editar información de este alumno"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeletingId(student.id)}
                            className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 transition-all cursor-pointer"
                            title="Eliminar este estudiante permanente"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-normal">
                  No se encontraron estudiantes para "{searchTerm}". Pruebe agregando un nuevo estudiante.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
