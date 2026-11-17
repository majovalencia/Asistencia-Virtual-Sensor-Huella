export interface Student {
  id: string; // Unique UUID or incremental ID
  name: string;
  lastName: string;
  idAcademico: string; // academic ID like "11A-01", "11A-02"
  email: string;
  fingerprintHash: string; // Simulated encrypted hash
  registeredAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  present: boolean; // true = marked as "X", false = marked as empty
  timestamp?: string; // HH:MM:SS
  method?: string; // "Biométrico" or "Manual"
}

export interface SqlLog {
  id: string;
  query: string;
  timestamp: string;
  rowsAffected: number;
}
