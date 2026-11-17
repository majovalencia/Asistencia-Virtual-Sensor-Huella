import { Student, AttendanceRecord, SqlLog } from "../types";
import { seedStudents } from "../seedStudents";

export interface DatabaseState {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  sqlLogs: SqlLog[];
}

const LOCAL_STORAGE_KEY_STUDENTS = "colegio_attend_students";
const LOCAL_STORAGE_KEY_ATTENDANCE = "colegio_attend_records";
const LOCAL_STORAGE_KEY_LOGS = "colegio_attend_sql_logs";

/**
 * Loads database from disk (/api/db endpoint which reads database.json).
 * Fallback to localStorage or seedStudents if API fails.
 */
export async function loadDatabase(): Promise<DatabaseState> {
  try {
    const res = await fetch("/api/db");
    if (res.ok) {
      const diskData = await res.json();
      if (diskData && Array.isArray(diskData.students) && diskData.students.length > 0) {
        // Sync to localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(diskData.students));
        if (Array.isArray(diskData.attendanceRecords)) {
          localStorage.setItem(LOCAL_STORAGE_KEY_ATTENDANCE, JSON.stringify(diskData.attendanceRecords));
        }
        if (Array.isArray(diskData.sqlLogs)) {
          localStorage.setItem(LOCAL_STORAGE_KEY_LOGS, JSON.stringify(diskData.sqlLogs));
        }

        return {
          students: diskData.students,
          attendanceRecords: Array.isArray(diskData.attendanceRecords) ? diskData.attendanceRecords : [],
          sqlLogs: Array.isArray(diskData.sqlLogs) ? diskData.sqlLogs : []
        };
      }
    }
  } catch (err) {
    console.warn("No se pudo conectar a /api/db, utilizando almacenamiento local:", err);
  }

  // Fallback to localStorage
  const cachedStudentsStr = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS);
  const cachedAttendanceStr = localStorage.getItem(LOCAL_STORAGE_KEY_ATTENDANCE);
  const cachedLogsStr = localStorage.getItem(LOCAL_STORAGE_KEY_LOGS);

  let students: Student[] = cachedStudentsStr ? JSON.parse(cachedStudentsStr) : seedStudents;
  let attendanceRecords: AttendanceRecord[] = cachedAttendanceStr ? JSON.parse(cachedAttendanceStr) : [];
  let sqlLogs: SqlLog[] = cachedLogsStr ? JSON.parse(cachedLogsStr) : [];

  // Save to disk immediately so database.json is created
  const state: DatabaseState = { students, attendanceRecords, sqlLogs };
  saveDatabaseToDisk(state).catch(() => {});

  return state;
}

/**
 * Saves full state to disk (/api/db -> database.json) and localStorage.
 */
export async function saveDatabaseToDisk(state: DatabaseState): Promise<boolean> {
  // Always update localStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS, JSON.stringify(state.students));
    localStorage.setItem(LOCAL_STORAGE_KEY_ATTENDANCE, JSON.stringify(state.attendanceRecords));
    localStorage.setItem(LOCAL_STORAGE_KEY_LOGS, JSON.stringify(state.sqlLogs));
  } catch (e) {
    console.error("Error al guardar en localStorage:", e);
  }

  // Send to server API to write to database.json file on hard drive
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.error("Error al guardar en el archivo de disco database.json:", err);
  }
  return false;
}

/**
 * Trigger manual JSON download backup.
 */
export function exportDatabaseBackup(state: DatabaseState) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  const dateToday = new Date().toISOString().substring(0, 10);
  downloadAnchor.setAttribute("download", `copia_seguridad_huellas_${dateToday}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
