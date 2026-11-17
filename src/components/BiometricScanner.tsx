import React, { useState, useEffect, useRef } from "react";
import { 
  Fingerprint, 
  Check, 
  RefreshCw, 
  Calendar,
  Clock,
  AlertCircle,
  HelpCircle as QuestionIcon,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Usb,
  ToggleLeft,
  ToggleRight,
  Wifi,
  WifiOff,
  Trash2,
  CheckCircle2,
  Terminal,
  Activity,
  AlertTriangle,
  Info
} from "lucide-react";
import { Student, AttendanceRecord } from "../types";
import { formatTo12HourTime, isAfter630AM } from "../utils/timeFormatter";
import { arduinoSerial, findStudentByArduinoId, SerialStatus } from "../utils/arduinoSerial";

interface BiometricScannerProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  onRegisterAttendance: (studentId: string, timestamp: string) => void;
  selectedDate: string;
  isRealMode: boolean;
  setIsRealMode: (mode: boolean) => void;
}

export default function BiometricScanner({
  students,
  attendanceRecords,
  onRegisterAttendance,
  selectedDate,
  isRealMode,
  setIsRealMode
}: BiometricScannerProps) {
  // SIMULATION MODE LOCAL STATES
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [isScanningSimulated, setIsScanningSimulated] = useState<boolean>(false);
  const [scanProgressSimulated, setScanProgressSimulated] = useState<number>(0);

  // GENERAL SCANNER DISPLAY STATES
  const [scanState, setScanState] = useState<"idle" | "scanning" | "success" | "error" | "not_registered">("idle");
  const [lastRegistered, setLastRegistered] = useState<{ name: string; time: string; confidence?: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [localTime, setLocalTime] = useState<string>(formatTo12HourTime());
  
  // ARDUINO SERIAL STATES
  const [serialStatus, setSerialStatus] = useState<SerialStatus>(arduinoSerial.getStatus());
  const [serialLogs, setSerialLogs] = useState<string[]>(arduinoSerial.getLogs());

  // Custom dropdown states for simulation picker
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setLocalTime(formatTo12HourTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // -------------------------------------------------------------
  // ARDUINO SERIAL EVENT LISTENERS & AUTO CONNECT
  // -------------------------------------------------------------
  useEffect(() => {
    // Attempt auto-connect if real mode is enabled
    if (isRealMode && arduinoSerial.getStatus() === "disconnected") {
      arduinoSerial.autoConnect();
    }

    // Subscribe to status changes
    const unsubStatus = arduinoSerial.onStatusChange((newStatus, errorDetails) => {
      setSerialStatus(newStatus);
      setSerialLogs([...arduinoSerial.getLogs()]);

      if (newStatus === "error" && errorDetails) {
        setStatusMessage(`Error Serial: ${errorDetails}`);
      } else if (newStatus === "connected") {
        setStatusMessage("");
      }
    });

    // Subscribe to incoming line messages from Arduino
    const unsubMessage = arduinoSerial.onMessage((line: string) => {
      setSerialLogs([...arduinoSerial.getLogs()]);

      // Process only when in Real Mode
      if (!isRealMode) return;

      const cleanLine = line.trim();

      // 1. >>> ID:X:CONF:Y -> Identified student (Flexible Regex)
      const idMatch = cleanLine.match(/ID\s*:\s*(\d+)(?:\s*:\s*CONF\s*:\s*(\d+))?/i);
      if (idMatch && !cleanLine.includes("REGISTRO")) {
        const arduinoId = parseInt(idMatch[1], 10);
        const confidence = idMatch[2] ? parseInt(idMatch[2], 10) : 100;

        const matchedStudent = findStudentByArduinoId(students, arduinoId);
        const timeNow = formatTo12HourTime();

        if (matchedStudent) {
          setScanState("success");
          setStatusMessage(`¡Huella Encontrada! ID #${arduinoId} (Confianza: ${confidence}%)`);
          onRegisterAttendance(matchedStudent.id, timeNow);

          setLastRegistered({
            name: `${matchedStudent.lastName}, ${matchedStudent.name}`,
            time: timeNow,
            confidence
          });

          setTimeout(() => {
            setScanState("idle");
            setStatusMessage("");
          }, 3500);
        } else {
          setScanState("not_registered");
          setStatusMessage(`Huella ID #${arduinoId} detectada en el sensor, pero no está asignada a ningún estudiante.`);
          setTimeout(() => {
            setScanState("idle");
            setStatusMessage("");
          }, 4000);
        }
      }

      // 2. >>> NO_REGISTRADA -> Unregistered finger
      else if (cleanLine.includes("NO_REGISTRADA")) {
        setScanState("not_registered");
        setStatusMessage("Huella No Registrada en el Sensor");
        setTimeout(() => {
          setScanState("idle");
          setStatusMessage("");
        }, 3500);
      }

      // 3. >>> ERROR:... -> Hardware / Search / Conversion errors
      else if (cleanLine.includes("ERROR:") && !cleanLine.includes("REGISTRO")) {
        setScanState("error");
        let errorDesc = "Error al leer el sensor";
        if (cleanLine.includes("LECTURA")) errorDesc = "Error al leer el dedo";
        if (cleanLine.includes("CONVERSION")) errorDesc = "Error en la conversión de la imagen dactilar";
        if (cleanLine.includes("BUSQUEDA")) errorDesc = "Error durante la búsqueda de coincidencia";
        
        setStatusMessage(errorDesc);
        setTimeout(() => {
          setScanState("idle");
          setStatusMessage("");
        }, 3500);
      }

      // 4. >>> ESTADO:OK
      else if (cleanLine.includes("ESTADO:OK") || cleanLine.includes("ESTADO: OK")) {
        setStatusMessage("Conexión con el sensor verificada (ESTADO: OK)");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    });

    return () => {
      unsubStatus();
      unsubMessage();
    };
  }, [isRealMode, students, onRegisterAttendance]);

  // Connect serial button handler
  const handleConnectSerial = async () => {
    await arduinoSerial.requestPortAndConnect();
  };

  // Ping serial status button
  const handlePingStatus = () => {
    arduinoSerial.sendCommand("ESTADO");
  };

  // Wipe Arduino memory handler
  const handleWipeMemory = async () => {
    if (confirm("⚠️ ¿ATENCIÓN! ¿Está seguro de BORRAR TODAS las huellas almacenadas en la memoria del Arduino?\n\nEsta acción no se puede deshacer.")) {
      await arduinoSerial.sendCommand("BORRAR:TODO");
      alert("Comando BORRAR:TODO enviado al Arduino.");
    }
  };

  // Filter students based on search query for simulation picker
  const filteredStudentsForSelect = students.filter(student => {
    const fullName = `${student.name} ${student.lastName}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    const idNum = student.idAcademico.replace(/11A-?/gi, "").toLowerCase();
    return fullName.includes(query) || idNum.includes(query);
  });

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // -------------------------------------------------------------
  // SIMULATED SCAN TRIGGER ACTION
  // -------------------------------------------------------------
  const handleStartScanSimulated = () => {
    if (isRealMode) return;

    if (!selectedStudentId) {
      alert("Por favor, seleccione un estudiante de la lista para simular el escaneo.");
      return;
    }

    setIsScanningSimulated(true);
    setScanProgressSimulated(0);
    setScanState("scanning");

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 8;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        setScanProgressSimulated(100);
        setScanState("success");
        
        const matchingStudent = students.find(s => s.id === selectedStudentId);
        const timeNow = formatTo12HourTime();
        
        if (matchingStudent) {
          onRegisterAttendance(matchingStudent.id, timeNow);
          setLastRegistered({
            name: `${matchingStudent.lastName}, ${matchingStudent.name}`,
            time: timeNow
          });
        }

        setTimeout(() => {
          setIsScanningSimulated(false);
          setScanState("idle");
          setScanProgressSimulated(0);
        }, 3000);
      } else {
        setScanProgressSimulated(progress);
      }
    }, 150);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Interactive Biometric Fingerprint Panel */}
      <div className="xl:col-span-7 bg-white p-6 rounded-2xl border border-[#e2e8f0]">
        
        {/* Header segment with mode switch */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 mb-6 border-b border-[#f4f4fa] gap-3">
          <div>
            <h3 className="font-family-hanken font-bold text-lg text-slate-800 flex items-center gap-2">
              Terminal Biométrico Integrado
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {isRealMode ? "Hardware Real" : "Simulador Virtual"}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {isRealMode 
                ? "Conectado al sensor dactilar óptico Arduino por USB Serial"
                : "Interactúe digitalmente simulando la huella de los estudiantes"}
            </p>
          </div>

          {/* MODE TOGGLE SWITCH */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setIsRealMode(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                !isRealMode 
                  ? "bg-white text-slate-800 shadow-xs" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Modo Simulación
            </button>
            <button
              onClick={() => setIsRealMode(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isRealMode 
                  ? "bg-brand-blue text-white shadow-xs" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Usb size={13} />
              Modo Real Arduino
            </button>
          </div>
        </div>

        {/* SERIAL CONNECTION STATUS BAR & DIAGNOSTIC HELP (Only shown when in Real Mode) */}
        {isRealMode && (
          <div className="mb-6 space-y-3">
            <div className="p-4 rounded-xl border bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${
                  serialStatus === "connected" 
                    ? "bg-emerald-100 text-emerald-700" 
                    : serialStatus === "connecting"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700"
                }`}>
                  {serialStatus === "connected" ? <Wifi size={18} /> : <WifiOff size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-slate-800">
                      Estado del Puerto Serial USB:
                    </span>
                    {serialStatus === "connected" && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                        Conectado (9600 Baud)
                      </span>
                    )}
                    {serialStatus === "connecting" && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                        Conectando...
                      </span>
                    )}
                    {serialStatus === "disconnected" && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Sensor no conectado
                      </span>
                    )}
                    {serialStatus === "error" && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Error de Conexión
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {serialStatus === "connected" 
                      ? "Escuchando constantemente el sensor Arduino en segundo plano."
                      : "Presione 'Conectar Sensor Arduino' y seleccione el puerto COM (ej. COM3 / CH340)."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                {serialStatus !== "connected" ? (
                  <button
                    onClick={handleConnectSerial}
                    className="w-full md:w-auto px-4 py-2 bg-brand-blue hover:bg-brand-blue-deep text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Usb size={14} />
                    Conectar Sensor Arduino
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handlePingStatus}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      title="Verificar comunicación con comando ESTADO"
                    >
                      Verificar Estado
                    </button>
                    <button
                      onClick={handleWipeMemory}
                      className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      title="Borrar todas las huellas del Arduino"
                    >
                      <Trash2 size={13} />
                      Limpiar
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Diagnostic help box for Serial Connection troubleshooting */}
            {serialStatus !== "connected" && (
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <Info size={15} className="text-blue-600 shrink-0" />
                  <span>Guía para detectar el sensor de huella en Arduino:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-800 leading-relaxed font-medium pl-1">
                  <li>Asegúrate de que el Arduino esté conectado por cable USB al PC.</li>
                  <li><b>Cierra el Monitor Serie de Arduino IDE</b> u otros programas que usen el puerto COM (en Windows solo una aplicación puede abrir el puerto serial a la vez).</li>
                  <li>Usa un navegador compatible como <b>Google Chrome</b>, <b>Microsoft Edge</b> u <b>Opera</b>.</li>
                  <li>Haz clic en el botón azul <b>"Conectar Sensor Arduino"</b> y selecciona tu dispositivo serial (ej. <i>Arduino Uno</i>, <i>USB-SERIAL CH340</i> o <i>COM3/COM4</i>) en la ventana flotante del navegador.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Simulator controls (Only shown in Simulation Mode) */}
        {!isRealMode && (
          <div className="space-y-6 mb-6">
            <div ref={dropdownRef} className="p-4 bg-slate-50 rounded-xl border border-[#e2e8f0] relative">
              <div className="absolute top-3 right-3 text-brand-lila">
                <QuestionIcon size={16} className="cursor-help" title="Esto simula el estudiante colocando el dedo." />
              </div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                1. Seleccione Estudiante para Simulación
              </label>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsOpen(!isOpen)}
                  className="w-full flex items-center justify-between p-2.5 bg-white border border-[#c3c6d7] hover:border-brand-blue rounded-xl text-xs font-semibold focus:ring-2 focus:ring-brand-blue outline-none transition-all text-left cursor-pointer"
                >
                  {selectedStudent ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-brand-blue-light text-brand-blue flex items-center justify-center font-extrabold text-[9px] shrink-0">
                        {selectedStudent.name.charAt(0)}{selectedStudent.lastName.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-700 truncate max-w-[200px]">
                        {selectedStudent.lastName}, {selectedStudent.name}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded-md font-mono shrink-0">
                        #{selectedStudent.idAcademico.replace(/11A-?/gi, "")}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 font-semibold">-- Seleccionar estudiante del Grado 11A --</span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedStudentId && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudentId("");
                        }}
                        className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition-all cursor-pointer mr-0.5"
                        title="Limpiar selección"
                      >
                        <X size={12} />
                      </span>
                    )}
                    {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e2e8f0] rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5">
                      <Search size={12} className="text-slate-400 shrink-0 ml-1" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre, apellido o matrícula..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-xs font-bold text-slate-700 placeholder-slate-400 focus:ring-0 py-1"
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-full transition-all shrink-0 mr-1"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {filteredStudentsForSelect.length > 0 ? (
                        filteredStudentsForSelect.map((student) => {
                          const hasRecord = attendanceRecords.some(
                            r => r.studentId === student.id && r.date === selectedDate && r.present
                          );
                          const isSelected = student.id === selectedStudentId;

                          return (
                            <div
                              key={student.id}
                              onClick={() => {
                                setSelectedStudentId(student.id);
                                setIsOpen(false);
                                setSearchQuery("");
                              }}
                              className={`flex items-center justify-between p-2 hover:bg-slate-50 transition-colors cursor-pointer ${
                                isSelected ? "bg-brand-blue-light/20" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                                  {student.name.charAt(0)}{student.lastName.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                                    {student.lastName}, {student.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-bold">
                                    Matrícula: #{student.idAcademico.replace(/11A-?/gi, "")}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {hasRecord ? (
                                  <span className="text-[8px] font-black text-green-700 bg-green-50 border border-green-200 px-1 py-0.5 rounded-md uppercase tracking-wider">
                                    Asistió
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-1 py-0.5 rounded-md uppercase tracking-wider">
                                    Pendiente
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-slate-400 italic text-xs font-semibold">
                          No se encontraron estudiantes
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Interactive touch sensor screen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          
          {/* Left side column: Visual Touch Point */}
          <div className="flex flex-col items-center p-6 bg-linear-to-b from-slate-50 to-slate-100/50 rounded-2xl border border-slate-200">
            
            {/* Live Status Label */}
            <div className="mb-4 text-center">
              {isRealMode ? (
                scanState === "idle" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-blue-light text-brand-blue text-xs font-bold rounded-full animate-pulse uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-brand-blue animate-ping"></span>
                    Escuchando Sensor Real...
                  </span>
                ) : scanState === "success" ? (
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full uppercase tracking-wider animate-bounce">
                    ¡Huella Reconocida!
                  </span>
                ) : scanState === "not_registered" ? (
                  <span className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full uppercase tracking-wider">
                    Huella No Registrada
                  </span>
                ) : (
                  <span className="inline-block px-3 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-full uppercase tracking-wider">
                    Error de Lectura
                  </span>
                )
              ) : (
                scanState === "idle" ? (
                  <span className="inline-block px-3 py-1 bg-brand-lila-light text-brand-lila-dark text-xs font-bold rounded-full animate-pulse uppercase tracking-wider">
                    Listo para Escanear (Simulado)
                  </span>
                ) : scanState === "scanning" ? (
                  <span className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full uppercase tracking-wider">
                    Escaneando... ({scanProgressSimulated}%)
                  </span>
                ) : (
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full uppercase tracking-wider animate-bounce">
                    ¡Identificación Completa!
                  </span>
                )
              )}
            </div>

            {/* Touch fingerprint target pad */}
            <button 
              onClick={handleStartScanSimulated}
              disabled={isRealMode || isScanningSimulated}
              className={`relative w-40 h-40 rounded-3xl border-4 p-5 flex items-center justify-center transition-all ${
                isRealMode
                  ? scanState === "success"
                    ? "border-green-500 bg-green-50 scale-105"
                    : scanState === "not_registered"
                    ? "border-amber-500 bg-amber-50"
                    : scanState === "error"
                    ? "border-rose-500 bg-rose-50"
                    : "border-brand-blue bg-white scanner-pulse"
                  : scanState === "idle" 
                  ? "border-brand-lila bg-white cursor-pointer hover:scale-105 active:scale-95 scanner-pulse" 
                  : scanState === "scanning"
                  ? "border-amber-400 bg-amber-50"
                  : "border-green-500 bg-green-50"
              }`}
            >
              {/* Simulated laser scan line overlay */}
              {(!isRealMode && scanState === "scanning") && (
                <div 
                  className="absolute left-0 right-0 h-1 bg-amber-400 shadow-lg shadow-amber-400/80 animate-bounce"
                  style={{ 
                    top: `${scanProgressSimulated}%`,
                    transition: "top 0.1s ease" 
                  }}
                />
              )}

              <Fingerprint 
                size={80} 
                className={`transition-colors ${
                  scanState === "idle" 
                    ? isRealMode ? "text-brand-blue" : "text-brand-lila" 
                    : scanState === "scanning"
                    ? "text-amber-500"
                    : scanState === "not_registered"
                    ? "text-amber-600"
                    : scanState === "error"
                    ? "text-rose-600"
                    : "text-green-600 scale-110"
                }`} 
              />

              {/* Status indicator circles */}
              <div className="absolute -bottom-3 flex justify-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${scanState === "success" ? "bg-green-500 animate-ping" : "bg-slate-300"}`} />
                <span className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${scanState === "scanning" ? "bg-amber-400" : "bg-slate-300"}`} />
              </div>
            </button>

            <p className="text-[11px] font-semibold text-slate-500 mt-6 text-center">
              {isRealMode 
                ? serialStatus === "connected"
                  ? "COLOQUE EL DEDO EN EL SENSOR DE HUELLA ARDUINO"
                  : "CONECTE EL SENSOR ARDUINO PARA IDENTIFICAR"
                : scanState === "idle" 
                ? "PRESIONE EL SENSOR PARA SIMULAR HUELLA"
                : scanState === "scanning"
                ? "COMPARANDO MUESTRA DACTILAR..."
                : "¡ACCESO AUTORIZADO!"}
            </p>

            {statusMessage && (
              <p className={`text-xs font-bold mt-2 text-center px-3 py-1 rounded-lg ${
                scanState === "success" ? "bg-green-100 text-green-800" :
                scanState === "not_registered" ? "bg-amber-100 text-amber-800" :
                "bg-rose-100 text-rose-800"
              }`}>
                {statusMessage}
              </p>
            )}
          </div>

          {/* Right side column: Real-time Serial Console Logs */}
          <div className="space-y-4">
            <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-xs overflow-hidden leading-relaxed border border-slate-700 shadow-sm flex flex-col h-56">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700 mb-2 shrink-0">
                <span className="text-brand-lila font-bold flex items-center gap-1.5">
                  <Terminal size={14} /> Consola de Hardware Serial
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isRealMode ? `PORT: USB (9600 BAUD)` : `SIMULADOR VIRTUAL`}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-1 text-[11px] font-mono pr-1 scrollbar-thin">
                {serialLogs.length > 0 ? (
                  serialLogs.map((log, index) => (
                    <p key={index} className={
                      log.includes("<<< ID:") || log.includes("EXITO") ? "text-green-400 font-bold" :
                      log.includes(">>> ENVIADO") ? "text-sky-300" :
                      log.includes("ERROR") || log.includes("NO_REGISTRADA") ? "text-rose-400" :
                      "text-slate-300 font-normal"
                    }>
                      {log}
                    </p>
                  ))
                ) : (
                  <p className="text-slate-500 italic">[SERIAL] Esperando eventos del sensor...</p>
                )}
                <div ref={consoleBottomRef} />
              </div>
            </div>

            {/* Dynamic last checked result card */}
            <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Última Asistencia Confirmada
              </h4>
              {lastRegistered ? (() => {
                const isLate = isAfter630AM(lastRegistered.time);
                return (
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isLate ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700'}`}>
                      {isLate ? <AlertCircle size={16} /> : <Check size={16} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-bold leading-tight ${isLate ? "line-through text-slate-400 decoration-rose-500 decoration-[1.5px]" : "text-slate-800"}`}>
                          {lastRegistered.name}
                        </p>
                        {isLate && (
                          <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded uppercase tracking-wider font-mono shrink-0">
                            TARDE
                          </span>
                        )}
                        {lastRegistered.confidence !== undefined && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded shrink-0">
                            Confianza: {lastRegistered.confidence}%
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        Hora: {lastRegistered.time} • Grado: Grado 11A
                      </p>
                    </div>
                  </div>
                );
              })() : (
                <div className="py-2 text-center text-slate-400 text-xs italic">
                  Ninguna asistencia registrada en los últimos minutos del módulo
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Classroom Status, Hour & High Contrast Stats (Right Column) */}
      <div className="xl:col-span-5 flex flex-col gap-6">
        
        {/* Real-time Clock, Date & Group Details Card */}
        <div className="bg-white p-6 rounded-2xl border border-[#e2e8f0] relative overflow-hidden bg-linear-to-b from-brand-blue-light/30 to-white">
          <div className="absolute right-[-10px] top-[-10px] text-brand-blue-light/40 pointer-events-none">
            <Clock size={150} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Calendar size={14} className="text-brand-blue" />
              Sesión Académica Activa
            </div>
            
            <div className="text-3xl font-family-hanken font-extrabold text-brand-blue-deep mb-1 tracking-tight">
              {localTime}
            </div>
            <div className="text-sm font-semibold text-slate-600 mb-4 bg-white/70 inline-block px-3 py-1 rounded-full border border-slate-100 shadow-xs">
              📅 Fecha Oficial: {selectedDate}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grado</p>
                <p className="text-sm font-bold text-brand-blue">11A</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modo Activo</p>
                <p className="text-xs font-extrabold text-slate-700">
                  {isRealMode ? "Hardware Arduino" : "Simulador Local"}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
