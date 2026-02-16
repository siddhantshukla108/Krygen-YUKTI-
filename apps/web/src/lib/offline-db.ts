import Dexie, { type EntityTable } from "dexie";

type CachedPatientRecords = {
  userId: string;
  consultations: unknown[];
  prescriptions: unknown[];
  reports: unknown[];
  updatedAt: string;
};

export type CachedSymptomCheck = {
  id?: number;
  userId: string;
  symptoms: string;
  age?: number;
  duration?: string;
  knownConditions?: string[];
  additionalContext?: string;
  response: unknown;
  createdAt: string;
};

class SanjeevniOfflineDatabase extends Dexie {
  records!: EntityTable<CachedPatientRecords, "userId">;
  symptomChecks!: EntityTable<CachedSymptomCheck, "id">;

  constructor() {
    super("sanjeevni_offline");

    this.version(1).stores({
      records: "userId, updatedAt",
      symptomChecks: "++id, userId, createdAt",
    });
  }
}

export const offlineDb = new SanjeevniOfflineDatabase();

export async function savePatientRecordsOffline(
  userId: string,
  payload: {
    consultations: unknown[];
    prescriptions: unknown[];
    reports: unknown[];
  },
) {
  await offlineDb.records.put({
    userId,
    consultations: payload.consultations,
    prescriptions: payload.prescriptions,
    reports: payload.reports,
    updatedAt: new Date().toISOString(),
  });
}

export async function getPatientRecordsOffline(userId: string) {
  return offlineDb.records.get(userId);
}

export async function saveSymptomCheckOffline(entry: Omit<CachedSymptomCheck, "id" | "createdAt">) {
  await offlineDb.symptomChecks.add({
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

export async function getRecentSymptomChecksOffline(userId: string, limit = 10) {
  const rows = await offlineDb.symptomChecks.where("userId").equals(userId).toArray();
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
