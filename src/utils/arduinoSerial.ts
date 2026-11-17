export type SerialStatus = "disconnected" | "connecting" | "connected" | "error";

export type SerialMessageCallback = (message: string) => void;
export type SerialStatusCallback = (status: SerialStatus, errorDetails?: string) => void;

class ArduinoSerialManager {
  private port: any = null;
  private reader: any = null;
  private keepReading: boolean = false;
  private status: SerialStatus = "disconnected";
  private messageListeners: Set<SerialMessageCallback> = new Set();
  private statusListeners: Set<SerialStatusCallback> = new Set();
  private logs: string[] = [];

  constructor() {
    if (typeof window !== "undefined" && "serial" in navigator) {
      (navigator as any).serial.addEventListener("connect", () => {
        console.log("Dispositivo Serial USB conectado físicamente");
        this.autoConnect();
      });

      (navigator as any).serial.addEventListener("disconnect", () => {
        console.log("Dispositivo Serial USB desconectado físicamente");
        this.disconnect();
      });
    }
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && "serial" in navigator;
  }

  public getStatus(): SerialStatus {
    return this.status;
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public onMessage(callback: SerialMessageCallback): () => void {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  public onStatusChange(callback: SerialStatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private setStatus(newStatus: SerialStatus, errorDetails?: string) {
    this.status = newStatus;
    this.statusListeners.forEach((cb) => cb(newStatus, errorDetails));
  }

  public addLog(logText: string) {
    const time = new Date().toLocaleTimeString("es-ES", { hour12: true });
    const formatted = `[${time}] ${logText}`;
    this.logs = [formatted, ...this.logs.slice(0, 99)];
  }

  public async requestPortAndConnect(): Promise<boolean> {
    if (!this.isSupported()) {
      this.setStatus("error", "El navegador no soporta Web Serial API (use Chrome, Edge u Opera).");
      return false;
    }

    try {
      this.setStatus("connecting");
      const selectedPort = await (navigator as any).serial.requestPort();
      this.port = selectedPort;
      return await this.openPort();
    } catch (err: any) {
      console.error("Error al seleccionar puerto serial:", err);
      this.setStatus("disconnected", err?.message || "Selección de puerto cancelada");
      return false;
    }
  }

  public async autoConnect(): Promise<boolean> {
    if (!this.isSupported() || this.status === "connected") return false;

    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        this.port = ports[0];
        return await this.openPort();
      }
    } catch (err) {
      console.warn("Auto-conectar falló:", err);
    }
    return false;
  }

  private async openPort(): Promise<boolean> {
    if (!this.port) return false;

    try {
      if (!this.port.readable) {
        await this.port.open({ baudRate: 9600 });
      }

      this.keepReading = true;
      this.setStatus("connected");
      this.addLog("[PUERTO] Conectado exitosamente al sensor Arduino (9600 baudios)");

      // Enviar ESTADO ping tras conectar
      setTimeout(() => {
        this.sendCommand("ESTADO");
      }, 600);

      this.startReadingLoop();
      return true;
    } catch (err: any) {
      console.error("Error abriendo puerto serial:", err);
      this.setStatus("error", err?.message || "No se pudo abrir el puerto serie");
      this.port = null;
      return false;
    }
  }

  private async startReadingLoop() {
    if (!this.port || !this.port.readable) return;

    try {
      this.reader = this.port.readable.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.handleIncomingLine(trimmed);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Error en bucle de lectura serial:", err);
      if (this.keepReading) {
        this.setStatus("error", `Error en puerto serial: ${err?.message || "Desconectado abruptamente"}`);
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch (e) {
          // ignore
        }
        this.reader = null;
      }
    }
  }

  private handleIncomingLine(line: string) {
    const logPrefix = line.startsWith(">>>") ? "" : "<<< ";
    this.addLog(`${logPrefix}${line}`);
    this.messageListeners.forEach((cb) => cb(line));
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.port || !this.port.writable || this.status !== "connected") {
      this.addLog(`[ERROR] No se pudo enviar '${cmd}': Sensor no conectado.`);
      return false;
    }

    try {
      const textEncoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      // Use \r\n (CRLF) for standard Arduino serial communication
      await writer.write(textEncoder.encode(`${cmd}\r\n`));
      writer.releaseLock();
      this.addLog(`>>> ENVIADO: ${cmd}`);
      return true;
    } catch (err: any) {
      console.error("Error enviando comando serial:", err);
      this.addLog(`[ERROR] Fallo enviando comando: ${err?.message}`);
      return false;
    }
  }

  public async sendIdentifyCommand(): Promise<boolean> {
    if (this.status !== "connected") return false;
    return await this.sendCommand("IDENTIFICAR");
  }

  public async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("Error desconectando puerto serial:", err);
    } finally {
      this.setStatus("disconnected");
      this.addLog("[PUERTO] Sensor desconectado.");
    }
  }
}

export const arduinoSerial = new ArduinoSerialManager();

// Utilidades para mapeo de estudiantes e IDs de Arduino (1-127)
export function parseArduinoIdFromLine(rawLine: string): { id: number; confidence?: number } | null {
  const cleanLine = rawLine.trim();

  // Ignore registration / status log messages
  if (cleanLine.includes("REGISTRO") || cleanLine.includes("REGISTRAR") || cleanLine.includes("GUARDAR")) {
    return null;
  }

  // 1. Match "Found ID #1 with confidence of 120", "ID: 1", "ID #1", "FOUND ID: 1", "HUELLA ID: 1", "ID:1:CONF:100"
  const idMatch = cleanLine.match(/(?:ID|FOUND|HUELLA|FINGERPRINT|SLOT)\s*(?:ID)?\s*#?\s*:?\s*(\d+)/i);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    if (!isNaN(id)) {
      let confidence: number | undefined = undefined;
      const confMatch = cleanLine.match(/CONF(?:IDENCE)?\s*[:=]?\s*(\d+)/i);
      if (confMatch) {
        confidence = parseInt(confMatch[1], 10);
      }
      return { id, confidence };
    }
  }

  // 2. Fallback: Match #X (e.g. "Found #1", "Huella #1", "#1")
  const hashMatch = cleanLine.match(/#(\d{1,3})/);
  if (hashMatch) {
    const id = parseInt(hashMatch[1], 10);
    if (!isNaN(id)) return { id };
  }

  // 3. Fallback: Standalone number line (e.g. "1" or "01")
  if (/^\d{1,3}$/.test(cleanLine)) {
    const id = parseInt(cleanLine, 10);
    if (!isNaN(id) && id >= 0 && id <= 127) return { id };
  }

  return null;
}

export function findStudentByArduinoId(students: any[], arduinoId: number | string) {
  const numericId = typeof arduinoId === "number" ? arduinoId : parseInt(String(arduinoId), 10);
  if (isNaN(numericId)) return undefined;

  return students.find((s) => {
    if (s.fingerprintHash) {
      const matchHash = s.fingerprintHash.match(/ID_(\d+)/i);
      if (matchHash && parseInt(matchHash[1], 10) === numericId) return true;
    }
    if (s.id === `stud-${numericId}` || s.id === String(numericId)) return true;
    if (s.idAcademico) {
      const academicNum = parseInt(s.idAcademico.replace(/\D/g, ""), 10);
      if (!isNaN(academicNum) && academicNum === numericId) return true;
    }
    return false;
  });
}

export function getNextAvailableArduinoId(students: any[]): number {
  const usedIds = new Set<number>();
  students.forEach((s) => {
    if (s.fingerprintHash) {
      const match = s.fingerprintHash.match(/ID_(\d+)/i);
      if (match) usedIds.add(parseInt(match[1], 10));
    }
    const num = parseInt(s.idAcademico.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= 127) usedIds.add(num);
  });
  for (let i = 1; i <= 127; i++) {
    if (!usedIds.has(i)) return i;
  }
  return 1;
}
