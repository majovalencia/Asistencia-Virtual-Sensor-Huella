import React, { useState, useEffect } from "react";
import {
  Users,
  Fingerprint,
  Database,
  FileCheck,
  Clock,
  HelpCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Calendar,
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

import { Student, AttendanceRecord, SqlLog } from "./types";
import { seedStudents } from "./seedStudents";
import { formatTo12HourTime } from "./utils/timeFormatter";
import { arduinoSerial, findStudentByArduinoId, parseArduinoIdFromLine } from "./utils/arduinoSerial";
import { loadDatabase, saveDatabaseToDisk, exportDatabaseBackup } from "./utils/dbStorage";
import Sidebar from "./components/Sidebar";
import BiometricScanner from "./components/BiometricScanner";
import StudentTable from "./components/StudentTable";
import ReportsView from "./components/ReportsView";
import AddEditStudentModal from "./components/AddEditStudentModal";

export default function App() {
  // Tab control
  const [activeTab, setActiveTab] = useState<string>("asistencia");

  // Mode control (Real Arduino Serial vs Simulation)
  const [isRealMode, setIsRealMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("colegio_biometric_mode");
    return saved === "real";
  });

  const handleSetIsRealMode = (real: boolean) => {
    setIsRealMode(real);
    localStorage.setItem("colegio_biometric_mode", real ? "real" : "simulated");
  };

  // Helper to format Date to YYYY-MM-DD
  const getTodayFormatted = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Selected date initialized from localStorage or default to today's date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const saved = localStorage.getItem("colegio_selected_date");
    return saved || getTodayFormatted();
  });

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    setSelectedDate(newDate);
    localStorage.setItem("colegio_selected_date", newDate);
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    handleDateChange(`${year}-${month}-${day}`);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    handleDateChange(`${year}-${month}-${day}`);
  };

  const handleToday = () => {
    handleDateChange(getTodayFormatted());
  };

  const formatSpanishDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  // Core database state lists
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [sqlLogs, setSqlLogs] = useState<SqlLog[]>([]);

  // Modal dialog states
  const [isAddEditOpen, setIsAddEditOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Success Toast state
  const [toast, setToast] = useState<{ show: boolean; title: string; message: string; type: "success" | "info" }>({
    show: false,
    title: "",
    message: "",
    type: "success"
  });

  // Load from disk (/api/db -> database.json) or fallback
  useEffect(() => {
    loadDatabase().then((db) => {
      setStudents(db.students);
      setAttendanceRecords(db.attendanceRecords);
      setSqlLogs(db.sqlLogs);
    });
  }, []);

  // Global serial reader subscription for background attendance tracking
  useEffect(() => {
    const unsub = arduinoSerial.onMessage((line) => {
      if (!isRealMode) return;

      const parsed = parseArduinoIdFromLine(line);
      if (parsed) {
        const match = findStudentByArduinoId(students, parsed.id);
        if (match) {
          const timeNow = formatTo12HourTime();
          handleRegisterAttendanceBiometric(match.id, timeNow);
        }
      }
    });

    return () => unsub();
  }, [isRealMode, students]);

  // Utility to fire custom system logs
  const runSqlLog = (queryText: string, affected: number) => {
    const newLog: SqlLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      query: queryText,
      timestamp: formatTo12HourTime(),
      rowsAffected: affected
    };

    const updatedLogs = [...sqlLogs, newLog];
    setSqlLogs(updatedLogs);
    localStorage.setItem("colegio_attend_sql_logs", JSON.stringify(updatedLogs));
  };

  // Helper trigger custom Toast pop-ups
  const triggerToast = (title: string, message: string, type: "success" | "info" = "success") => {
    setToast({
      show: true,
      title,
      message,
      type
    });

    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Clear log logs
  const handleClearSqlLogs = () => {
    if (confirm("¿Está seguro de limpiar todo el historial de transacciones SQL?")) {
      setSqlLogs([]);
      saveDatabaseToDisk({ students, attendanceRecords, sqlLogs: [] });
    }
  };

  // Create or update a student profile (CRUD - Add / Edit)
  const handleSaveStudent = (data: Partial<Student>) => {
    let updatedList: Student[] = [];
    if (editingStudent) {
      // Edit student
      updatedList = students.map((s) => {
        if (s.id === editingStudent.id) {
          return {
            ...s,
            name: data.name!,
            lastName: data.lastName!,
            idAcademico: data.idAcademico!,
            email: data.email!,
            fingerprintHash: data.fingerprintHash!
          };
        }
        return s;
      });

      setStudents(updatedList);

      // Execute SQL updates Log representation
      runSqlLog(
        `UPDATE estudiantes \nSET nombre = '${data.name}', apellido = '${data.lastName}', id_academico = '${data.idAcademico}', email = '${data.email}', huella_hash = '${data.fingerprintHash}' \nWHERE id = '${editingStudent.id}';`,
        1
      );

      triggerToast(
        "Estudiante Modificado",
        `Se han actualizado los datos de ${data.lastName}, ${data.name}`
      );
    } else {
      // Add student
      const newStudent: Student = {
        id: `stud-${Date.now()}`,
        name: data.name!,
        lastName: data.lastName!,
        idAcademico: data.idAcademico!,
        email: data.email!,
        fingerprintHash: data.fingerprintHash!,
        registeredAt: new Date().toISOString().substring(0, 19).replace("T", " ")
      };

      updatedList = [...students, newStudent];
      setStudents(updatedList);

      // Execute SQL insert Log representation
      runSqlLog(
        `INSERT INTO estudiantes (id, nombre, apellido, id_academico, email, huella_hash) \nVALUES ('${newStudent.id}', '${newStudent.name}', '${newStudent.lastName}', '${newStudent.idAcademico}', '${newStudent.email}', '${newStudent.fingerprintHash}');`,
        1
      );

      triggerToast(
        "Estudiante Registrado",
        `${newStudent.lastName}, ${newStudent.name} se agregó con éxito.`
      );
    }

    saveDatabaseToDisk({
      students: updatedList,
      attendanceRecords,
      sqlLogs
    });

    setIsAddEditOpen(false);
    setEditingStudent(null);
  };

  // Delete student (CRUD - Delete)
  const handleDeleteStudent = (studentId: string) => {
    const studentToDelete = students.find(s => s.id === studentId);
    if (!studentToDelete) return;

    // Filter list
    const updatedList = students.filter(s => s.id !== studentId);
    setStudents(updatedList);

    // Filter attendance records to keep schema reference integrous
    const updatedAttendance = attendanceRecords.filter(r => r.studentId !== studentId);
    setAttendanceRecords(updatedAttendance);

    // Output SQL deletion query Log representation
    runSqlLog(
      `BEGIN TRANSACTION;\n  DELETE FROM asistencia WHERE estudiante_id = '${studentId}';\n  DELETE FROM estudiantes WHERE id = '${studentId}';\nCOMMIT;`,
      2
    );

    saveDatabaseToDisk({
      students: updatedList,
      attendanceRecords: updatedAttendance,
      sqlLogs
    });

    triggerToast(
      "Estudiante Eliminado",
      `Se borró el perfil de ${studentToDelete.lastName}, ${studentToDelete.name} del roster.`
    );
  };

  // Main high speed toggle for manual "X" checklist (or touch register override)
  const handleToggleAttendance = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const existingRecordIndex = attendanceRecords.findIndex(
      (r) => r.studentId === studentId && r.date === selectedDate
    );

    let updatedRecords = [...attendanceRecords];

    if (existingRecordIndex > -1) {
      // Toggle attendance Present <-> Absent
      const currentPresentState = updatedRecords[existingRecordIndex].present;
      const nextState = !currentPresentState;
      updatedRecords[existingRecordIndex].present = nextState;

      const timeNow = formatTo12HourTime();
      updatedRecords[existingRecordIndex].timestamp = nextState ? timeNow : undefined;
      updatedRecords[existingRecordIndex].method = nextState ? "Manual" : undefined;

      // Log transaction SQL Query representation
      if (nextState) {
        runSqlLog(
          `UPDATE asistencia \nSET presente = TRUE, hora_marca = '${timeNow}', metodo = 'Manual' \nWHERE estudiante_id = '${studentId}' AND fecha = '${selectedDate}';`,
          1
        );
        triggerToast("Asistencia Registrada", `Se marcó con X a ${student.lastName}, ${student.name}`);
      } else {
        runSqlLog(
          `UPDATE asistencia \nSET presente = FALSE, hora_marca = NULL, metodo = NULL \nWHERE estudiante_id = '${studentId}' AND fecha = '${selectedDate}';`,
          1
        );
        triggerToast("Registro Removido", `Se retiró la marca X de ${student.lastName}, ${student.name}`, "info");
      }
    } else {
      // Create new record
      const timeNow = formatTo12HourTime();
      const newRecord: AttendanceRecord = {
        id: `rec-${Date.now()}`,
        studentId,
        date: selectedDate,
        present: true,
        timestamp: timeNow,
        method: "Manual"
      };
      updatedRecords.push(newRecord);

      // Log transaction SQL Query insert representation
      runSqlLog(
        `INSERT INTO asistencia (id, estudiante_id, fecha, presente, hora_marca, metodo) \nVALUES ('${newRecord.id}', '${studentId}', '${selectedDate}', TRUE, '${timeNow}', 'Manual');`,
        1
      );

      triggerToast("Asistencia Registrada", `Se marcó con X a ${student.lastName}, ${student.name}`);
    }

    setAttendanceRecords(updatedRecords);
    saveDatabaseToDisk({
      students,
      attendanceRecords: updatedRecords,
      sqlLogs
    });
  };

  // High-fidelity sensor check in callback with fingerprint pattern matched
  const handleRegisterAttendanceBiometric = (studentId: string, timestamp: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const existingRecordIndex = attendanceRecords.findIndex(
      (r) => r.studentId === studentId && r.date === selectedDate
    );

    let updatedRecords = [...attendanceRecords];

    if (existingRecordIndex > -1) {
      updatedRecords[existingRecordIndex].present = true;
      updatedRecords[existingRecordIndex].timestamp = timestamp;
      updatedRecords[existingRecordIndex].method = "Biométrico";

      // Log transaction SQL Query update representation
      runSqlLog(
        `UPDATE index_public.asistencia \nSET presente = TRUE, hora_marca = '${timestamp}', metodo = 'Biométrico' \nWHERE estudiante_id = '${studentId}' AND fecha = '${selectedDate}' /* AUTHENTICATED VIA AS608 */;`,
        1
      );
    } else {
      const newRecord: AttendanceRecord = {
        id: `rec-${Date.now()}`,
        studentId,
        date: selectedDate,
        present: true,
        timestamp,
        method: "Biométrico"
      };
      updatedRecords.push(newRecord);

      // Log transaction SQL Query insert representation
      runSqlLog(
        `INSERT INTO public.asistencia (id, estudiante_id, fecha, presente, hora_marca, metodo) \nVALUES ('${newRecord.id}', '${studentId}', '${selectedDate}', TRUE, '${timestamp}', 'Biométrico') /* BIOMETRIC DIGITAL AUTHENTICATED */;`,
        1
      );
    }

    setAttendanceRecords(updatedRecords);
    saveDatabaseToDisk({
      students,
      attendanceRecords: updatedRecords,
      sqlLogs
    });

    triggerToast(
      "Biometría Reconocida",
      `¡Asistencia registrada para ${student.name} ${student.lastName}!`
    );
  };

  // Compute Present vs Absent metrics
  const studentsPresentCount = students.filter(student => {
    const record = attendanceRecords.find(r => r.studentId === student.id && r.date === selectedDate);
    return record ? record.present : false;
  }).length;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">

      {/* Sidebar sidebar navigation panel wrapper */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        presentCount={studentsPresentCount}
        totalCount={students.length}
      />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-h-screen w-0">

        {/* Top bar search header dashboard info */}
        <header className="h-20 bg-white border-b border-[#e2e8f0] px-8 flex justify-between items-center sticky top-0 z-40 no-print">
          <div>
            <h2 className="font-family-hanken font-extrabold text-xl text-slate-800 flex items-center gap-2">
              {activeTab === "asistencia" && "Panel de Toma de Asistencia"}
              {activeTab === "estudiantes" && "Asistencia y Fichas Biométricas de Alumnos"}
              {activeTab === "reportes" && "Sección de Reportes y Descargas"}
              <span className="text-xs bg-slate-100 text-slate-500 py-1 px-2.5 rounded-full font-bold ml-1 border border-slate-200">
                Sección 11A
              </span>
            </h2>
            <p className="text-xs text-indigo-950 font-normal mt-0.5">
              Administración escolar biométrica guiada por huella dactilar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Real time date selector & navigation */}
            <div className="flex items-center bg-slate-100 border border-[#e2e8f0] p-1 rounded-xl gap-1.5 text-xs shadow-xs">
              <button
                onClick={handlePrevDay}
                title="Día anterior"
                className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>

              <div className="flex items-center gap-1.5 px-2">
                <Calendar size={13} className="text-brand-blue" />
                <span className="font-bold text-slate-500 hidden sm:inline">Fecha:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="bg-transparent border-0 p-0 font-bold text-slate-800 outline-none cursor-pointer focus:ring-0 text-xs"
                />
              </div>

              <button
                onClick={handleNextDay}
                title="Día siguiente"
                className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>

              <button
                onClick={handleToday}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${selectedDate === getTodayFormatted()
                  ? "bg-brand-blue text-white shadow-xs"
                  : "bg-white text-slate-700 hover:bg-slate-200"
                  }`}
              >
                Hoy
              </button>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100/70 border border-slate-200 px-3 py-1.5 rounded-xl capitalize hidden lg:inline-block">
              📅 {formatSpanishDate(selectedDate)}
            </span>
          </div>
        </header>

        {/* Dashboard Tab content container with scroll */}
        <main className="p-8 flex-1 max-w-7xl w-full mx-auto pb-24">

          {/* Main Attendance Module Tab */}
          {activeTab === "asistencia" && (
            <div className="space-y-6">
              <BiometricScanner
                students={students}
                attendanceRecords={attendanceRecords}
                onRegisterAttendance={handleRegisterAttendanceBiometric}
                selectedDate={selectedDate}
                isRealMode={isRealMode}
                setIsRealMode={handleSetIsRealMode}
              />

              {/* Secondary block matching table lists */}
              <div className="pt-2">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-family-hanken font-bold text-base text-slate-800">
                    Vista Rápida de Entrada Oficial de Estudiantes
                  </h3>
                  <button
                    onClick={() => setActiveTab("estudiantes")}
                    className="text-xs font-bold text-brand-blue hover:underline"
                  >
                    Ir a Fichas de Estudiantes →
                  </button>
                </div>
                <StudentTable
                  students={students}
                  attendanceRecords={attendanceRecords}
                  selectedDate={selectedDate}
                  onAddStudentClick={() => {
                    setEditingStudent(null);
                    setIsAddEditOpen(true);
                  }}
                  onEditStudentClick={(student) => {
                    setEditingStudent(student);
                    setIsAddEditOpen(true);
                  }}
                  onDeleteStudent={handleDeleteStudent}
                  onToggleAttendance={handleToggleAttendance}
                />
              </div>
            </div>
          )}

          {/* Core Student register matrix tabs */}
          {activeTab === "estudiantes" && (
            <div className="space-y-6">
              <div className="p-5 bg-linear-to-r from-brand-blue-light to-white rounded-2xl border border-brand-blue/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="font-family-hanken font-bold text-slate-800 text-base">
                    Matricula Completa Grado 11A ({students.length} Estudiantes Registrados)
                  </h3>
                  <p className="text-xs text-slate-500 font-normal leading-relaxed">
                    Usted puede agregar estudiantes del colegio, borrar perfiles, editar matrículas y generar firmas electrónicas dactilares.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setIsAddEditOpen(true);
                  }}
                  className="px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-deep text-white text-xs font-bold rounded-xl shadow-xs shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={15} />
                  Añadir Nuevo Estudiante
                </button>
              </div>

              <StudentTable
                students={students}
                attendanceRecords={attendanceRecords}
                selectedDate={selectedDate}
                onAddStudentClick={() => {
                  setEditingStudent(null);
                  setIsAddEditOpen(true);
                }}
                onEditStudentClick={(student) => {
                  setEditingStudent(student);
                  setIsAddEditOpen(true);
                }}
                onDeleteStudent={handleDeleteStudent}
                onToggleAttendance={handleToggleAttendance}
              />
            </div>
          )}

          {/* Active stats, filters, print layouts */}
          {activeTab === "reportes" && (
            <ReportsView
              students={students}
              attendanceRecords={attendanceRecords}
              selectedDate={selectedDate}
            />
          )}



        </main>

      </div>

      {/* Roster profiles CRUD Add / Edit dialog modal */}
      <AddEditStudentModal
        student={editingStudent}
        isOpen={isAddEditOpen}
        onClose={() => {
          setIsAddEditOpen(false);
          setEditingStudent(null);
        }}
        onSave={handleSaveStudent}
        isRealMode={isRealMode}
        students={students}
      />

      {/* Floating success toast notification segment */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 z-50 animate-slide-up max-w-sm shrink-0">
          <div className="p-1.5 bg-brand-blue text-white rounded-lg shrink-0">
            {toast.type === "success" ? <CheckCircle size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-sky-300" />}
          </div>
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-slate-100">{toast.title}</h5>
            <p className="text-[11px] text-slate-300 font-normal leading-relaxed">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(prev => ({ ...prev, show: false }))}
            className="text-slate-400 hover:text-white p-1 ml-auto"
          >
            <X size={14} />
          </button>
        </div>
      )}

    </div>
  );
}
