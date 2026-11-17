import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  User, 
  Fingerprint, 
  Sparkles,
  ShieldAlert,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  Usb,
  Clock
} from "lucide-react";
import { Student } from "../types";
import { arduinoSerial, getNextAvailableArduinoId } from "../utils/arduinoSerial";

interface AddEditStudentModalProps {
  student: Student | null; // NULL if adding, Student if editing
  isOpen: boolean;
  onClose: () => void;
  onSave: (studentData: Partial<Student>) => void;
  isRealMode?: boolean;
  students?: Student[];
}

export default function AddEditStudentModal({
  student,
  isOpen,
  onClose,
  onSave,
  isRealMode = false,
  students = []
}: AddEditStudentModalProps) {
  // Local state form fields
  const [name, setName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [idAcademico, setIdAcademico] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [fingerprintHash, setFingerprintHash] = useState<string>("");
  const [arduinoId, setArduinoId] = useState<number>(1);
  
  // Mode selection inside modal if needed
  const [useRealSensor, setUseRealSensor] = useState<boolean>(isRealMode);

  // Registration scanning simulator state
  const [isCapturingSimulated, setIsCapturingSimulated] = useState<boolean>(false);
  const [captureProgress, setCaptureProgress] = useState<number>(0);
  
  // Real Arduino Coordinated Registration State
  type RealRegStep = "idle" | "waiting_start" | "step1_put" | "step2_remove" | "step3_put_again" | "processing" | "success" | "error";
  const [realStep, setRealStep] = useState<RealRegStep>("idle");
  const [guidanceMessage, setGuidanceMessage] = useState<string>("");
  const [regErrorDetails, setRegErrorDetails] = useState<string>("");
  const [captureCompleted, setCaptureCompleted] = useState<boolean>(false);

  // Timers references
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeout15sRef = useRef<NodeJS.Timeout | null>(null);

  // Sync mode when prop changes
  useEffect(() => {
    setUseRealSensor(isRealMode);
  }, [isRealMode]);

  // Clean timers helper
  const clearAllTimers = () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (timeout15sRef.current) clearTimeout(timeout15sRef.current);
  };

  // Load editing student if present
  useEffect(() => {
    if (student) {
      setName(student.name);
      setLastName(student.lastName);
      setIdAcademico(student.idAcademico.replace(/11A-?/gi, ""));
      setEmail(student.email);
      setFingerprintHash(student.fingerprintHash);
      setCaptureCompleted(true);
      
      // Extract numeric ID if present
      const match = student.fingerprintHash?.match(/ID_(\d+)/i);
      if (match) {
        setArduinoId(parseInt(match[1], 10));
      } else {
        const num = parseInt(student.idAcademico.replace(/\D/g, ""), 10);
        setArduinoId(!isNaN(num) && num >= 1 && num <= 127 ? num : 1);
      }
    } else {
      // Add defaults
      setName("");
      setLastName("");
      setIdAcademico("");
      setEmail("");
      setFingerprintHash("");
      setCaptureCompleted(false);
      setArduinoId(getNextAvailableArduinoId(students));
    }
    
    setCaptureProgress(0);
    setIsCapturingSimulated(false);
    setRealStep("idle");
    setGuidanceMessage("");
    setRegErrorDetails("");
    clearAllTimers();
  }, [student, isOpen, students]);

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  const handleCloseModal = () => {
    clearAllTimers();
    if (realStep !== "idle" && realStep !== "success") {
      // Reset Arduino to identification mode
      arduinoSerial.sendCommand("IDENTIFICAR");
    }
    onClose();
  };

  if (!isOpen) return null;

  // Auto-generate academic ID based on standard format if empty
  const handleAutoFillId = () => {
    const nextId = getNextAvailableArduinoId(students);
    setIdAcademico(String(nextId));
    setArduinoId(nextId);
  };

  // -------------------------------------------------------------
  // SIMULATED REGISTRATION FLOW
  // -------------------------------------------------------------
  const handleCaptureSimulated = () => {
    setIsCapturingSimulated(true);
    setCaptureProgress(0);
    setCaptureCompleted(false);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        setCaptureProgress(100);
        setIsCapturingSimulated(false);
        setCaptureCompleted(true);
        
        const hexChars = "0123456789abcdef";
        let randomHex = "";
        for (let i = 0; i < 8; i++) {
          randomHex += hexChars[Math.floor(Math.random() * 16)];
        }
        setFingerprintHash(`AES_256_FNG_ID_${arduinoId}_${randomHex}`);
      } else {
        setCaptureProgress(progress);
      }
    }, 120);
  };

  // -------------------------------------------------------------
  // REAL ARDUINO REGISTRATION FLOW (Coordinated timers + serial)
  // -------------------------------------------------------------
  const handleStartRealArduinoRegister = async () => {
    if (arduinoSerial.getStatus() !== "connected") {
      alert("El sensor Arduino no está conectado. Por favor, conecte el puerto COM o active el MODO SIMULACIÓN.");
      return;
    }

    clearAllTimers();
    setRealStep("waiting_start");
    setGuidanceMessage("Enviando orden de registro al Arduino...");
    setRegErrorDetails("");
    setCaptureCompleted(false);

    let isCurrentRegistrationActive = true;

    // 15 seconds global timeout guard
    timeout15sRef.current = setTimeout(() => {
      if (!isCurrentRegistrationActive) return;
      isCurrentRegistrationActive = false;
      arduinoSerial.sendCommand("IDENTIFICAR");
      setRealStep("error");
      setRegErrorDetails("Tiempo de espera agotado (Timeout 15s). El registro fue cancelado.");
      setGuidanceMessage("");
    }, 15000);

    // Send REGISTRAR:X
    await arduinoSerial.sendCommand(`REGISTRAR:${arduinoId}`);

    // Listen to incoming serial responses
    const unsubscribe = arduinoSerial.onMessage((rawMsg: string) => {
      if (!isCurrentRegistrationActive) return;

      const message = rawMsg.trim();

      // 1. REGISTRO:INICIADO -> Step 1 (Put finger)
      if (message.includes("REGISTRO:INICIADO") || message.includes("REGISTRO: INICIADO")) {
        setRealStep("step1_put");
        setGuidanceMessage("Coloque el dedo en el sensor (1ra lectura)...");
      }

      // 2. REGISTRO:PRIMERA_OK -> Step 2 (Captured 1st reading, ask user to remove finger and put again)
      else if (message.includes("REGISTRO:PRIMERA_OK") || message.includes("PRIMERA_OK") || message.includes("retire dedo")) {
        setRealStep("step2_remove");
        setGuidanceMessage("1ra Lectura OK. Retire el dedo y vuelva a colocar el MISMO dedo (2da lectura)...");
      }

      // 3. REGISTRO:EXITO:ID:X -> Registration complete!
      const successMatch = message.match(/REGISTRO\s*:\s*EXITO\s*:\s*ID\s*:\s*(\d+)/i);
      if (successMatch) {
        isCurrentRegistrationActive = false;
        clearAllTimers();
        const registeredId = successMatch[1] || String(arduinoId);
        setRealStep("success");
        setGuidanceMessage(`¡Huella guardada con éxito en la memoria del sensor (ID: ${registeredId})!`);
        
        const hexChars = "0123456789abcdef";
        let randomHex = "";
        for (let i = 0; i < 8; i++) {
          randomHex += hexChars[Math.floor(Math.random() * 16)];
        }
        setFingerprintHash(`AES_256_FNG_ID_${registeredId}_${randomHex}`);
        setCaptureCompleted(true);
        unsubscribe();
      }

      // 4. REGISTRO:ERROR:... -> Registration failed
      else if (message.includes("REGISTRO:ERROR") || (message.includes("ERROR:") && !message.includes("ESTADO"))) {
        isCurrentRegistrationActive = false;
        clearAllTimers();
        arduinoSerial.sendCommand("IDENTIFICAR");
        setRealStep("error");
        
        if (message.includes("NO_COINCIDEN")) {
          setRegErrorDetails("Las huellas no coinciden. Por favor, intente de nuevo.");
        } else if (message.includes("LECTURA")) {
          setRegErrorDetails("Error al leer el dedo durante el registro. Intente presionar el dedo firmemente sobre el cristal.");
        } else if (message.includes("PRIMERA")) {
          setRegErrorDetails("Error en la primera conversión de imagen a plantilla.");
        } else if (message.includes("SEGUNDA")) {
          setRegErrorDetails("Error en la segunda conversión de imagen a plantilla.");
        } else if (message.includes("GUARDAR")) {
          setRegErrorDetails("Error al escribir el modelo en la memoria del sensor.");
        } else {
          setRegErrorDetails(message.replace(">>> ", ""));
        }
        setGuidanceMessage("");
        unsubscribe();
      }
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !lastName.trim() || !idAcademico.trim()) {
      alert("Por favor, rellene todos los campos obligatorios del estudiante.");
      return;
    }
    if (!fingerprintHash) {
      alert("Por favor, registre la huella dactilar del estudiante antes de guardar.");
      return;
    }

    const formattedId = idAcademico.toUpperCase().startsWith("11A-") ? idAcademico : `11A-${idAcademico}`;
    const generatedEmail = `${name.toLowerCase().replace(/\s+/g, "")}.${lastName.toLowerCase().replace(/\s+/g, "")}@sanpedroclaver.edu.co`;

    onSave({
      name,
      lastName,
      idAcademico: formattedId,
      email: generatedEmail,
      fingerprintHash
    });
  };

  return (
    <div className="fixed inset-0 bg-[#111c2d]/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
      
      {/* Modal Card Box */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto transform scale-100 transition-all duration-300">
        
        {/* Header toolbar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-blue-light text-brand-blue rounded-xl">
              <User size={20} />
            </div>
            <div>
              <h3 className="font-family-hanken font-bold text-lg text-slate-800">
                {student ? `Editar Estudiante: ${student.lastName}, ${student.name}` : "Registrar Nuevo Estudiante (11A)"}
              </h3>
              <p className="text-xs text-slate-400">Rellene el perfil y registre el patrón biométrico</p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal body Form */}
        <form onSubmit={handleFormSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Name input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Nombres <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Juan Andrés"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-3 pr-3 py-2.5 bg-white border border-[#c3c6d7] rounded-xl text-xs font-semibold text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              />
            </div>

            {/* LastName input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Apellidos <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Pérez Valencia"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full pl-3 pr-3 py-2.5 bg-white border border-[#c3c6d7] rounded-xl text-xs font-semibold text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Academic registration matricula ID input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Número de Matrícula <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ej. 18"
                  value={idAcademico}
                  onChange={(e) => {
                    setIdAcademico(e.target.value);
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    if (!isNaN(n) && n >= 1 && n <= 127) setArduinoId(n);
                  }}
                  className="flex-1 pl-3 pr-3 py-2.5 bg-white border border-[#c3c6d7] rounded-xl text-xs font-semibold text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={handleAutoFillId}
                  className="px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-300 flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Autogenerar un ID escolar disponible"
                >
                  <Sparkles size={12} className="text-brand-lila" />
                  Auto
                </button>
              </div>
            </div>

            {/* Arduino Fingerprint ID Slot */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                ID de Huella en Arduino (1-127) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={127}
                required
                value={arduinoId}
                onChange={(e) => setArduinoId(parseInt(e.target.value, 10) || 1)}
                className="w-full pl-3 pr-3 py-2.5 bg-white border border-[#c3c6d7] rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-brand-blue outline-none transition-all"
              />
            </div>
          </div>

          {/* Fingerprint registration sub-panel */}
          <div className="p-5 bg-linear-to-b from-brand-lila-light/50 to-brand-lila-light/10 border border-brand-lila/10 rounded-2xl space-y-4">
            
            {/* Mode Switch Tab Header inside enrollment */}
            <div className="flex justify-between items-center pb-2 border-b border-brand-lila/10">
              <h4 className="text-xs font-bold text-brand-lila-dark flex items-center gap-1.5">
                <Fingerprint size={16} />
                Registro y Encriptación Biométrica de la Huella
              </h4>
              <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setUseRealSensor(true)}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    useRealSensor ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
                  }`}
                >
                  <Usb size={10} /> Sensor Arduino Real
                </button>
                <button
                  type="button"
                  onClick={() => setUseRealSensor(false)}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    !useRealSensor ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Simulación
                </button>
              </div>
            </div>

            {/* REAL SENSOR REGISTRATION UI */}
            {useRealSensor ? (
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs text-center space-y-3">
                  
                  {/* Real Step Status Displays */}
                  {realStep === "idle" && !captureCompleted && (
                    <div className="py-2 space-y-2">
                      <p className="text-xs font-bold text-slate-700">
                        Listo para registrar huella en el slot ID #{arduinoId} de Arduino.
                      </p>
                      <button
                        type="button"
                        onClick={handleStartRealArduinoRegister}
                        className="px-4 py-2.5 bg-brand-lila hover:bg-brand-lila-dark text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 mx-auto cursor-pointer"
                      >
                        <Usb size={16} />
                        Enviar Comando REGISTRAR:{arduinoId} al Arduino
                      </button>
                    </div>
                  )}

                  {/* ACTIVE GUIDED STEP ANIMATIONS */}
                  {realStep !== "idle" && realStep !== "success" && realStep !== "error" && (
                    <div className="py-3 space-y-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full animate-pulse">
                        <Clock size={14} className="animate-spin" />
                        Proceso de Registro Coordinado
                      </div>
                      
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-sm font-extrabold text-amber-900 tracking-wide animate-bounce">
                          {guidanceMessage}
                        </p>
                        <p className="text-[10px] text-amber-700 mt-1">
                          {realStep === "step1_put" && "Sostenga el dedo firme sobre el sensor óptico..."}
                          {realStep === "step2_remove" && "Levante el dedo por 2 segundos..."}
                          {realStep === "step3_put_again" && "Vuelva a posar el mismo dedo para la verificación..."}
                          {realStep === "processing" && "Guardando vector en memoria FLASH..."}
                        </p>
                      </div>

                      {/* Step Timeline Indicator */}
                      <div className="flex justify-center items-center gap-2 text-[10px] font-bold">
                        <span className={`px-2 py-0.5 rounded ${realStep === "step1_put" ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-600"}`}>1. 1ra Lectura</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded ${realStep === "step2_remove" ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-600"}`}>2. Retire Dedo</span>
                        <span>→</span>
                        <span className={`px-2 py-0.5 rounded ${realStep === "step3_put_again" ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-600"}`}>3. 2da Lectura</span>
                      </div>
                    </div>
                  )}

                  {/* SUCCESS STATE */}
                  {captureCompleted && (
                    <div className="flex items-center justify-center gap-2 py-3 text-emerald-700 text-xs font-bold bg-emerald-50 rounded-xl border border-emerald-200">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <div>
                        <p className="text-sm font-extrabold">¡Huella Registrada Exitosamente en Arduino!</p>
                        <p className="text-[10px] text-emerald-600 font-normal">
                          Asignada al Slot ID #{arduinoId} de la memoria del sensor.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ERROR STATE */}
                  {realStep === "error" && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2">
                      <div className="flex items-center justify-center gap-1.5 font-bold">
                        <AlertTriangle size={18} className="text-rose-600" />
                        <span>Fallo en el Registro del Sensor</span>
                      </div>
                      <p className="text-[11px] text-rose-700">{regErrorDetails}</p>
                      <button
                        type="button"
                        onClick={handleStartRealArduinoRegister}
                        className="px-3 py-1.5 bg-rose-600 text-white text-[11px] font-bold rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
                      >
                        Reintentar Registro
                      </button>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              /* SIMULATED SENSOR REGISTRATION UI */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                  {isCapturingSimulated ? (
                    <div className="w-full space-y-3 py-4">
                      <div className="flex justify-between text-xs font-bold text-brand-lila">
                        <span>Escaneando dedo del alumno...</span>
                        <span>{captureProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-brand-lila h-full transition-all duration-100" 
                          style={{ width: `${captureProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : captureCompleted ? (
                    <div className="flex items-center gap-2.5 py-4 text-emerald-700 text-xs font-bold leading-none">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <div>
                        <p>Huella Simulada Registrada</p>
                        <p className="text-[10px] text-slate-400 font-normal mt-1">
                          Seguridad biométrica activa.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCaptureSimulated}
                      className="w-full py-4 px-3 bg-brand-lila-light hover:bg-brand-lila text-brand-lila-dark hover:text-white font-bold text-xs rounded-xl transition-all border border-brand-lila/20 flex flex-col items-center gap-2.5 shrink-0 grow cursor-pointer"
                    >
                      <Fingerprint size={28} className="animate-pulse" />
                      <span>Iniciar Registro Simulado de Huella</span>
                    </button>
                  )}
                </div>

                {/* Secure Token display */}
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Token / Hash de Seguridad Generado
                    </p>
                    <div className="w-full p-2.5 bg-slate-900 text-white font-mono text-[10px] rounded-lg mt-1 border border-slate-700 select-all overflow-hidden text-ellipsis">
                      {fingerprintHash ? (
                        <span className="text-green-400 font-bold">{fingerprintHash}</span>
                      ) : (
                        <span className="text-slate-500 italic">Pendiente de escaneo...</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 text-[10px] text-slate-500 bg-white p-2 rounded-lg border border-slate-100">
                    <Info size={14} className="text-brand-lila shrink-0 mt-0.5" />
                    <span className="leading-tight">
                      La huella es procesada por el sensor AS608 y convertida en una firma cifrada no reversible para su verificación.
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Privacy statement footer alert */}
          <div className="p-3 bg-amber-50 text-amber-800 border-l-4 border-amber-400 text-[10px] rounded-lg flex items-start gap-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-500" />
            <span className="leading-relaxed">
              <b>Políticas de Privacidad de Datos Biométricos Estudiantiles:</b> Este software cumple estrictamente con el Artículo 15 de la Constitución y la Ley de Protección de Datos Personales, aislando la información de menores de edad.
            </span>
          </div>

          {/* Actions toolbar buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-5 py-2.5 text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isCapturingSimulated || (realStep !== "idle" && realStep !== "success" && useRealSensor)}
              className="px-6 py-2.5 bg-brand-blue text-white hover:bg-brand-blue-deep rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/10 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              {student ? "Guardar Cambios" : "Guardar Estudiante"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
