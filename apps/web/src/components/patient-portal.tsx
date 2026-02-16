"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { env } from "@my-better-t-app/env/web";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mvpApi } from "@/lib/mvp-api";
import {
  getPatientRecordsOffline,
  getRecentSymptomChecksOffline,
  savePatientRecordsOffline,
  saveSymptomCheckOffline,
} from "@/lib/offline-db";
import {
  EMERGENCY_CALL_NUMBER,
  normalizeSymptomTriage,
  triageLevelClassName,
  triageLevelLabel,
  type SymptomTriage,
} from "@/lib/triage";
import {
  prescriptionLanguageOptions,
  timingSlotDisplay,
  type PrescriptionLanguageCode,
  type SimplifiedPrescriptionSummary,
} from "@/lib/prescription-visual";

type PortalSection = "overview" | "consultations" | "symptoms" | "records" | "prescriptions" | "personal-info";

type MeUser = {
  id: string;
  name: string;
  role: "PATIENT" | "DOCTOR" | "PHARMACY" | "ADMIN";
  patient: {
    age: number | null;
    gender: string | null;
    bloodGroup: string | null;
    village: string | null;
    languagePreference: string | null;
  } | null;
};

type DoctorListing = {
  id: string;
  specialty: string;
  languages: string[];
  consultationFeePaise: number;
  user: {
    name: string;
  };
};

type Appointment = {
  id: string;
  scheduledAt: string;
  status: "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  callMode: "VIDEO" | "AUDIO" | "CHAT";
  callRoomId: string;
  consultationUi?: string | null;
  prescription?: {
    id: string;
    qrToken: string;
    createdAt: string;
  } | null;
  doctor?: {
    user?: {
      name?: string;
    };
  };
};

type Prescription = {
  id: string;
  createdAt: string;
  diagnosis: string;
  symptoms: string;
  notes: string | null;
  followUpDate: string | null;
  qrToken: string;
  appointment?: {
    scheduledAt: string;
    status: "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    callMode?: "VIDEO" | "AUDIO" | "CHAT";
  };
  doctor: {
    user: {
      name: string;
    };
  };
  items: Array<{
    medicineName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    instructions: string | null;
  }>;
};

type ReportItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  createdAt: string;
};

type SymptomHistoryItem = {
  id?: number;
  symptoms: string;
  response: SymptomTriage;
  createdAt: string;
};

type PrayagrajMedicineAvailability = {
  medicine_requested: string;
  status: "Available" | "Alternative Available" | "Not Available";
  exact_match: {
    pharmacy_name: string;
    area: string;
    stock: number;
    price: number;
  };
  alternatives: Array<{
    brand_name: string;
    generic_name: string;
    pharmacy_name: string;
    area: string;
    stock: number;
    price: number;
  }>;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

const dayTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dayTimeFormatter.format(date);
}

function doctorRating(name: string) {
  const seed = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return (4.1 + (seed % 8) * 0.1).toFixed(1);
}

function specialtyYears(name: string) {
  const seed = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return 7 + (seed % 9);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function appointmentStatusClassName(value: Appointment["status"]) {
  if (value === "BOOKED") return "bg-sky-100 text-sky-900";
  if (value === "IN_PROGRESS") return "bg-red-100 text-red-800";
  if (value === "COMPLETED") return "bg-emerald-100 text-emerald-900";
  if (value === "CANCELLED") return "bg-zinc-200 text-zinc-800";
  return "bg-amber-100 text-amber-900";
}

function languagePreferenceToCode(value: string | null | undefined): PrescriptionLanguageCode {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("ta")) return "ta";
  if (normalized.startsWith("bn")) return "bn";
  return "en";
}

function dosageTimingClass(icon: string) {
  if (icon.includes("☀️")) return "border-amber-200 bg-amber-50 text-amber-900";
  if (icon.includes("🌤️")) return "border-orange-200 bg-orange-50 text-orange-900";
  if (icon.includes("🌙") || icon.includes("🛌")) return "border-indigo-200 bg-indigo-50 text-indigo-900";
  if (icon.includes("🕒")) return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-900";
}

function primaryTimingIcon(icon: string) {
  if (icon.includes("☀️")) return "☀️";
  if (icon.includes("🌤️")) return "🌤️";
  if (icon.includes("🌙")) return "🌙";
  if (icon.includes("🛌")) return "🌙";
  if (icon.includes("🕒")) return "🕒";
  return "📌";
}

function splitTimingLabel(label: string) {
  const parts = label
    .split("—")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      primary: parts[0],
      secondary: parts.slice(1).join(" — "),
    };
  }
  return {
    primary: label,
    secondary: "",
  };
}

function durationDaysFromText(value: string) {
  const dayMatch = value.match(/(\d+)\s*(?:day|days)/i);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = value.match(/(\d+)\s*(?:week|weeks)/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const monthMatch = value.match(/(\d+)\s*(?:month|months)/i);
  if (monthMatch) return Number(monthMatch[1]) * 30;

  return null;
}

function summaryDurationDays(summary: SimplifiedPrescriptionSummary | null) {
  if (!summary) return null;
  const parsed = summary.medicines
    .map((medicine) => durationDaysFromText(medicine.duration))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (!parsed.length) return null;
  return Math.max(...parsed);
}

export default function PatientPortal({ userId, section }: { userId: string; section: PortalSection }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [me, setMe] = useState<MeUser | null>(null);
  const [doctors, setDoctors] = useState<DoctorListing[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<{
    consultations: Appointment[];
    prescriptions: Prescription[];
    reports: ReportItem[];
  }>({
    consultations: [],
    prescriptions: [],
    reports: [],
  });
  const [recordsSyncedAt, setRecordsSyncedAt] = useState<string | null>(null);

  const [doctorSearch, setDoctorSearch] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preferredMode, setPreferredMode] = useState<"VIDEO" | "AUDIO" | "CHAT">("VIDEO");

  const [symptomForm, setSymptomForm] = useState({
    symptoms: "",
    age: "",
    duration: "",
    knownConditionsCsv: "",
    additionalContext: "",
  });
  const [symptomTriage, setSymptomTriage] = useState<SymptomTriage | null>(null);
  const [symptomHistory, setSymptomHistory] = useState<SymptomHistoryItem[]>([]);
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);

  const [recordSearch, setRecordSearch] = useState("");
  const [prescriptionTextInput, setPrescriptionTextInput] = useState("");
  const [lockedPrescriptionSource, setLockedPrescriptionSource] = useState<{
    id: string;
    doctorName: string;
    diagnosis: string;
    issuedAt: string;
  } | null>(null);
  const [prescriptionLanguage, setPrescriptionLanguage] = useState<PrescriptionLanguageCode>("en");
  const [simplifiedPrescription, setSimplifiedPrescription] = useState<SimplifiedPrescriptionSummary | null>(null);
  const [simplifyingPrescription, setSimplifyingPrescription] = useState(false);
  const [isPrescriptionCardOpen, setIsPrescriptionCardOpen] = useState(true);
  const [prayagrajAvailabilityByPrescription, setPrayagrajAvailabilityByPrescription] = useState<
    Record<string, PrayagrajMedicineAvailability[]>
  >({});
  const [checkingPrayagrajAvailabilityFor, setCheckingPrayagrajAvailabilityFor] = useState<string | null>(null);

  const upcomingAppointments = useMemo(
    () => appointments.filter((item) => item.status === "BOOKED" || item.status === "IN_PROGRESS"),
    [appointments],
  );

  const previousConsultations = useMemo(
    () =>
      records.consultations
        .filter((item) => item.status === "COMPLETED" || item.status === "CANCELLED" || item.status === "NO_SHOW")
        .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
    [records.consultations],
  );

  const trackedMedicines = useMemo(
    () => records.prescriptions.reduce((total, row) => total + row.items.length, 0),
    [records.prescriptions],
  );

  const filteredDoctors = useMemo(() => {
    const term = doctorSearch.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((doctor) => {
      return (
        doctor.user.name.toLowerCase().includes(term) ||
        doctor.specialty.toLowerCase().includes(term) ||
        doctor.languages.some((language) => language.toLowerCase().includes(term))
      );
    });
  }, [doctorSearch, doctors]);

  const normalizedRecordSearch = recordSearch.trim().toLowerCase();

  const filteredReports = useMemo(
    () =>
      records.reports.filter((item) => {
        if (!normalizedRecordSearch) return true;
        return (
          item.fileName.toLowerCase().includes(normalizedRecordSearch) ||
          item.mimeType.toLowerCase().includes(normalizedRecordSearch)
        );
      }),
    [normalizedRecordSearch, records.reports],
  );

  const filteredPrescriptions = useMemo(
    () =>
      records.prescriptions.filter((item) => {
        if (!normalizedRecordSearch) return true;
        const medicines = item.items.map((entry) => entry.medicineName).join(" ").toLowerCase();
        return (
          item.diagnosis.toLowerCase().includes(normalizedRecordSearch) ||
          item.symptoms.toLowerCase().includes(normalizedRecordSearch) ||
          (item.notes ?? "").toLowerCase().includes(normalizedRecordSearch) ||
          item.qrToken.toLowerCase().includes(normalizedRecordSearch) ||
          item.doctor.user.name.toLowerCase().includes(normalizedRecordSearch) ||
          medicines.includes(normalizedRecordSearch)
        );
      }),
    [normalizedRecordSearch, records.prescriptions],
  );

  const filteredConsultations = useMemo(
    () =>
      previousConsultations.filter((item) => {
        if (!normalizedRecordSearch) return true;
        const doctorName = item.doctor?.user?.name?.toLowerCase() ?? "";
        return (
          doctorName.includes(normalizedRecordSearch) ||
          item.status.toLowerCase().includes(normalizedRecordSearch) ||
          item.callMode.toLowerCase().includes(normalizedRecordSearch)
        );
      }),
    [normalizedRecordSearch, previousConsultations],
  );

  const loadSymptomHistory = useCallback(async () => {
    const rows = await getRecentSymptomChecksOffline(userId, 10);
    const normalizedRows: SymptomHistoryItem[] = [];
    for (const entry of rows) {
      const normalized = normalizeSymptomTriage(entry.response);
      if (!normalized) continue;
      normalizedRows.push({
        id: entry.id,
        symptoms: entry.symptoms,
        response: normalized,
        createdAt: entry.createdAt,
      });
    }
    setSymptomHistory(normalizedRows);
  }, [userId]);

  const loadDoctors = useCallback(async () => {
    const response = await mvpApi.get<{ doctors: DoctorListing[] }>("/doctors", userId);
    setDoctors(response.doctors);
  }, [userId]);

  const loadAppointments = useCallback(async () => {
    const response = await mvpApi.get<{ appointments: Appointment[] }>("/appointments/me", userId);
    setAppointments(response.appointments);
  }, [userId]);

  const loadRecords = useCallback(async () => {
    try {
      const response = await mvpApi.get<{
        consultations: Appointment[];
        prescriptions: Prescription[];
        reports: ReportItem[];
      }>("/patients/me/records", userId);
      setRecords(response);
      setRecordsSyncedAt(new Date().toISOString());
      await savePatientRecordsOffline(userId, response);
    } catch (error) {
      const cached = await getPatientRecordsOffline(userId);
      if (!cached) throw error;
      setRecords({
        consultations: cached.consultations as Appointment[],
        prescriptions: cached.prescriptions as Prescription[],
        reports: cached.reports as ReportItem[],
      });
      setRecordsSyncedAt(cached.updatedAt);
      toast.info("Offline mode: loaded cached health records");
    }
  }, [userId]);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = await mvpApi.get<{ user: MeUser }>("/me", userId);
      if (meResponse.user.role !== "PATIENT" || !meResponse.user.patient) {
        router.replace("/dashboard");
        return;
      }
      setMe(meResponse.user);
      setPrescriptionLanguage(languagePreferenceToCode(meResponse.user.patient.languagePreference));

      await Promise.all([loadDoctors(), loadAppointments(), loadRecords(), loadSymptomHistory()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load patient workspace");
    } finally {
      setLoading(false);
    }
  }, [loadAppointments, loadDoctors, loadRecords, loadSymptomHistory, router, userId]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadAppointments();
      if (section !== "symptoms") {
        void loadRecords();
      }
      if (section === "consultations") {
        void loadDoctors();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [loadAppointments, loadDoctors, loadRecords, section]);

  useEffect(() => {
    if (!symptomTriage) return;
    if (symptomTriage.triageLevel !== "RED") return;
    setShowEmergencyOverlay(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([300, 120, 300, 120, 500]);
    }
  }, [symptomTriage]);

  const callEmergencyServices = useCallback(() => {
    window.location.href = `tel:${EMERGENCY_CALL_NUMBER}`;
  }, []);

  const openDoctorBooking = useCallback(() => {
    router.push("/dashboard/patient/consultations");
  }, [router]);

  const seedDemoDoctor = async () => {
    setSaving(true);
    try {
      const response = await mvpApi.post<{ message: string }>("/dev/seed-doctor", userId);
      toast.success(response.message);
      await loadDoctors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not seed doctor");
    } finally {
      setSaving(false);
    }
  };

  const createAppointment = async (doctorId: string, mode: "VIDEO" | "AUDIO" | "CHAT") => {
    let target = scheduledAt;
    if (!target) {
      const suggested = new Date(Date.now() + 45 * 60 * 1000).toISOString().slice(0, 16);
      const userInput = window.prompt(
        `Choose appointment date & time for ${mode.toLowerCase()} call (YYYY-MM-DDTHH:mm)`,
        suggested,
      );
      if (!userInput) {
        return;
      }
      target = userInput.trim();
      setScheduledAt(target);
    }

    const parsed = new Date(target);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Invalid schedule format. Use YYYY-MM-DDTHH:mm");
      return;
    }

    setSaving(true);
    try {
      await mvpApi.post("/appointments", userId, {
        doctorId,
        scheduledAt: parsed.toISOString(),
        callMode: mode,
      });
      toast.success("Consultation booked");
      await Promise.all([loadAppointments(), loadRecords()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to book consultation");
    } finally {
      setSaving(false);
    }
  };

  const runSymptomCheck = async () => {
    if (symptomForm.symptoms.trim().length < 10) {
      toast.error("Please describe symptoms in more detail");
      return;
    }

    const payload = {
      symptoms: symptomForm.symptoms.trim(),
      age: symptomForm.age ? Number(symptomForm.age) : undefined,
      duration: symptomForm.duration || undefined,
      knownConditions: symptomForm.knownConditionsCsv
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      additionalContext: symptomForm.additionalContext || undefined,
    };

    setSaving(true);
    try {
      const response = await mvpApi.post<{ triage: unknown }>("/ai/symptom-checker", userId, payload);
      const normalized = normalizeSymptomTriage(response.triage);
      if (!normalized) {
        throw new Error("Received invalid triage format");
      }
      setSymptomTriage(normalized);

      await saveSymptomCheckOffline({
        userId,
        symptoms: payload.symptoms,
        age: payload.age,
        duration: payload.duration,
        knownConditions: payload.knownConditions,
        additionalContext: payload.additionalContext,
        response: normalized,
      });

      await loadSymptomHistory();

      if (normalized.triageLevel === "RED") {
        toast.error("Emergency detected. Call emergency services now.");
      } else if (normalized.triageLevel === "YELLOW") {
        toast.warning("Urgent symptoms detected. Opening doctor booking.");
        openDoctorBooking();
      } else if (normalized.triageLevel === "GREEN") {
        toast.info("Routine consultation recommended.");
      } else {
        toast.info("Self-care guidance available. Monitor symptoms.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Symptom triage unavailable");
    } finally {
      setSaving(false);
    }
  };

  const runPrescriptionSimplifier = async () => {
    const text = prescriptionTextInput.trim();
    if (text.length < 10) {
      toast.error("Load a doctor prescription first, then choose language and generate.");
      return;
    }

    setSimplifyingPrescription(true);
    try {
      const response = await mvpApi.post<{ summary: SimplifiedPrescriptionSummary }>(
        "/ai/prescription-simplify",
        userId,
        {
          text,
          language: prescriptionLanguage,
        },
      );
      setSimplifiedPrescription(response.summary);
      setIsPrescriptionCardOpen(true);
      toast.success("Visual prescription card generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Prescription simplifier unavailable");
    } finally {
      setSimplifyingPrescription(false);
    }
  };

  const checkPrayagrajAvailability = async (prescription: Prescription) => {
    setCheckingPrayagrajAvailabilityFor(prescription.id);
    try {
      const response = await mvpApi.get<{
        prescriptionId: string;
        results: PrayagrajMedicineAvailability[];
      }>(`/pharmacies/prayagraj/availability/${prescription.qrToken}`, userId);

      setPrayagrajAvailabilityByPrescription((previous) => ({
        ...previous,
        [prescription.id]: response.results,
      }));
      toast.success("Matched prescription medicines in Prayagraj inventory");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check Prayagraj inventory");
    } finally {
      setCheckingPrayagrajAvailabilityFor((current) =>
        current === prescription.id ? null : current,
      );
    }
  };

  const loadPrescriptionIntoSimplifier = useCallback((
    prescription: Prescription,
    options?: { silent?: boolean },
  ) => {
    const medicineText = prescription.items
      .map((item) => {
        const segments = [
          `${item.medicineName} ${item.dosage}`,
          `${item.frequency}`,
          `for ${item.durationDays} days`,
          `Qty ${item.quantity}`,
          item.instructions?.trim() || "",
        ].filter(Boolean);
        return segments.join(", ");
      })
      .join(". ");
    const assembled = [
      medicineText,
      prescription.notes?.trim(),
      `Symptoms: ${prescription.symptoms}`,
      `Diagnosis: ${prescription.diagnosis}`,
    ]
      .filter(Boolean)
      .join(". ");
    setPrescriptionTextInput(assembled);
    setLockedPrescriptionSource({
      id: prescription.id,
      doctorName: prescription.doctor.user.name,
      diagnosis: prescription.diagnosis,
      issuedAt: prescription.createdAt,
    });
    setIsPrescriptionCardOpen(true);
    document.getElementById("smart-prescription-simplifier")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!options?.silent) {
      toast.info("Doctor prescription loaded. You can now switch language and generate the card.");
    }
  }, []);

  const loadLatestPrescriptionIntoSimplifier = useCallback(() => {
    if (!filteredPrescriptions.length) {
      toast.error("No prescription found to load");
      return;
    }
    loadPrescriptionIntoSimplifier(filteredPrescriptions[0]);
  }, [filteredPrescriptions, loadPrescriptionIntoSimplifier]);

  useEffect(() => {
    if (section !== "prescriptions") return;
    if (prescriptionTextInput.trim().length >= 10) return;
    if (!filteredPrescriptions.length) return;
    loadPrescriptionIntoSimplifier(filteredPrescriptions[0], { silent: true });
  }, [
    filteredPrescriptions,
    loadPrescriptionIntoSimplifier,
    prescriptionTextInput,
    section,
  ]);

  const uploadRecord = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Max upload size is 8MB");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      await mvpApi.postForm("/patients/me/reports/upload", userId, formData);
      toast.success("Health record uploaded securely");
      await loadRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = async (report: ReportItem) => {
    if (report.fileUrl.startsWith("secure://")) {
      setSaving(true);
      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_SERVER_URL}/api/mvp/reports/${report.id}/download`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "x-user-id": userId,
            },
          },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Download failed");
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = report.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to download report");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (report.fileUrl) {
      window.open(report.fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-sm font-medium text-foreground">Loading patient workspace...</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-red-light">
            <span className="text-lg">⚠️</span>
          </div>
          <p className="text-sm font-medium text-foreground">Unable to load patient profile.</p>
        </div>
      </div>
    );
  }

  if (section === "overview") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Patient Dashboard</h1>
            <p className="text-sm text-muted-foreground">Simple view of appointments, records, and medicines.</p>
          </div>
          <a href="/dashboard/patient/consultations">
            <Button size="sm">Book Consultation</Button>
          </a>
        </div>

        <Card>
          <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Upcoming Appointments</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{upcomingAppointments.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Past Consultations</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{previousConsultations.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Prescriptions</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{records.prescriptions.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Medicines Tracked</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{trackedMedicines}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingAppointments.length ? null : (
              <p className="text-sm text-muted-foreground">No upcoming consultations.</p>
            )}
            {upcomingAppointments.slice(0, 5).map((appointment) => (
              <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{appointment.doctor?.user?.name ?? "Doctor"}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(appointment.scheduledAt)}</div>
                </div>
                <span className={appointment.status === "IN_PROGRESS" ? "pill-danger" : "pill-info"}>
                  {appointment.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === "consultations") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Consultations</CardTitle>
            <CardDescription>Book a video or audio call with verified doctors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_160px]">
              <Input
                value={doctorSearch}
                onChange={(event) => setDoctorSearch(event.target.value)}
                placeholder="Search by doctor name or specialty..."
              />
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
              <select
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={preferredMode}
                onChange={(event) => setPreferredMode(event.target.value as "VIDEO" | "AUDIO" | "CHAT")}
              >
                <option value="VIDEO">Prefer Video</option>
                <option value="AUDIO">Prefer Audio</option>
                <option value="CHAT">Prefer Chat</option>
              </select>
            </div>

            {!doctors.length ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <div className="mx-auto mb-2 icon-circle-blue"><span>👨‍⚕️</span></div>
                <div className="text-sm font-medium text-foreground">No doctors available yet</div>
                <div className="mt-1 text-xs text-muted-foreground">In development mode, seed a demo doctor for testing.</div>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => void seedDemoDoctor()}>
                  Seed Demo Doctor
                </Button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredDoctors.map((doctor) => (
                <div key={doctor.id} className="rounded-lg border-2 border-border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-soft-md">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 items-center justify-center rounded-full bg-blue-light text-sm font-semibold text-primary">
                      {initials(doctor.user.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{doctor.user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {doctor.specialty} &middot; {specialtyYears(doctor.user.name)} yrs exp
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {doctor.languages.map((language) => (
                          <span key={`${doctor.id}-${language}`} className="pill-info">
                            {language}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="text-sm font-semibold text-emerald">
                      {currency.format((doctor.consultationFeePaise ?? 0) / 100)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="xs" variant={preferredMode === "AUDIO" ? "default" : "outline"} disabled={saving} onClick={() => void createAppointment(doctor.id, "AUDIO")}>
                        Audio
                      </Button>
                      <Button size="xs" disabled={saving} onClick={() => void createAppointment(doctor.id, "VIDEO")}>
                        Video
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Consultations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingAppointments.length ? null : (
              <div className="text-sm text-muted-foreground">No upcoming consultations.</div>
            )}
            {upcomingAppointments.map((appointment) => {
              const liveHref = appointment.consultationUi ?? `/dashboard/call/${appointment.callRoomId}`;
              const externalLink = liveHref.startsWith("http");

              return (
                <div key={appointment.id} className="flex flex-wrap items-center justify-between rounded-lg border-2 border-border p-2">
                  <div>
                    <div className="font-medium">{appointment.doctor?.user?.name ?? "Doctor"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(appointment.scheduledAt)} • {appointment.callMode}
                    </div>
                    {appointment.prescription ? (
                      <div className="text-xs text-emerald-700">
                        Prescription ready for this consultation
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {appointment.status === "IN_PROGRESS" ? (
                      <>
                        <a
                          href={liveHref}
                          target={externalLink ? "_blank" : undefined}
                          rel={externalLink ? "noreferrer" : undefined}
                        >
                          <Button size="sm" variant="outline">
                            Join Live
                          </Button>
                        </a>
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                          LIVE
                        </span>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        Waiting for doctor
                      </Button>
                    )}
                    <span className={`rounded-full px-2 py-1 text-xs ${appointmentStatusClassName(appointment.status)}`}>
                      {appointment.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Previous Consultations</CardTitle>
            <CardDescription>
              Finished consultations are moved here. Prescription availability is shown per consultation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {previousConsultations.length ? null : (
              <div className="text-sm text-muted-foreground">No previous consultations yet.</div>
            )}
            {previousConsultations.map((appointment) => (
              <div key={`history-${appointment.id}`} className="rounded-lg border-2 border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{appointment.doctor?.user?.name ?? "Doctor"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(appointment.scheduledAt)} • {appointment.callMode}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${appointmentStatusClassName(appointment.status)}`}>
                    {appointment.status}
                  </span>
                </div>
                {appointment.prescription ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">
                    <div>Prescription generated for this meeting.</div>
                    <a href="/dashboard/patient/records">
                      <Button size="sm" variant="outline">
                        View Prescription
                      </Button>
                    </a>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">
                    No prescription attached to this consultation.
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === "symptoms") {
    return (
      <>
        {showEmergencyOverlay ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/85 p-4">
            <div className="w-full max-w-md rounded-xl border-2 border-red-200 bg-red-600 p-5 text-white shadow-2xl">
              <div className="text-2xl font-black">Emergency Detected</div>
              <div className="mt-1 text-sm text-red-100">Call Emergency Services Now</div>
              <div className="mt-4 space-y-2 rounded-lg bg-red-700/70 p-3 text-sm">
                <div>{symptomTriage?.summary}</div>
                <div className="text-red-100">{symptomTriage?.explanation}</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" onClick={callEmergencyServices}>
                  CALL {EMERGENCY_CALL_NUMBER}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowEmergencyOverlay(false)}
                  className="border-white/70 bg-white/10 text-white hover:bg-white/20"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Symptom Checker</CardTitle>
              <CardDescription>
                Triage only. No diagnosis and no medication prescription.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Symptoms</Label>
                  <textarea
                    value={symptomForm.symptoms}
                    onChange={(event) =>
                      setSymptomForm((previous) => ({ ...previous, symptoms: event.target.value }))
                    }
                    className="h-28 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
                    placeholder="Describe your symptoms in detail..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    value={symptomForm.age}
                    onChange={(event) => setSymptomForm((previous) => ({ ...previous, age: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Duration</Label>
                  <Input
                    value={symptomForm.duration}
                    onChange={(event) =>
                      setSymptomForm((previous) => ({ ...previous, duration: event.target.value }))
                    }
                    placeholder="e.g. 2 days"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Known Conditions</Label>
                  <Input
                    value={symptomForm.knownConditionsCsv}
                    onChange={(event) =>
                      setSymptomForm((previous) => ({
                        ...previous,
                        knownConditionsCsv: event.target.value,
                      }))
                    }
                    placeholder="diabetes, asthma"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Additional Context</Label>
                  <Input
                    value={symptomForm.additionalContext}
                    onChange={(event) =>
                      setSymptomForm((previous) => ({
                        ...previous,
                        additionalContext: event.target.value,
                      }))
                    }
                    placeholder="temperature, oxygen, etc."
                  />
                </div>
              </div>

              <Button disabled={saving} onClick={() => void runSymptomCheck()}>
                Run AI Triage
              </Button>

              {symptomTriage ? (
                <div className="space-y-3 rounded-lg border-2 border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Triage</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${triageLevelClassName(symptomTriage.triageLevel)}`}
                    >
                      {symptomTriage.triageLevel}
                    </span>
                    <span className="text-xs text-muted-foreground">{triageLevelLabel(symptomTriage.triageLevel)}</span>
                  </div>

                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{symptomTriage.summary}</div>
                  <div className="text-sm text-foreground">{symptomTriage.explanation}</div>
                  <div className="rounded-lg border border-border border-dashed bg-card px-3 py-2 text-sm">
                    {symptomTriage.recommendedAction}
                  </div>
                  <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    {symptomTriage.disclaimer}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {symptomTriage.triageLevel === "RED" ? (
                      <Button size="sm" variant="destructive" onClick={callEmergencyServices}>
                        CALL {EMERGENCY_CALL_NUMBER}
                      </Button>
                    ) : null}
                    {symptomTriage.triageLevel === "YELLOW" ? (
                      <Button size="sm" onClick={openDoctorBooking}>
                        Talk to Doctor Now
                      </Button>
                    ) : null}
                    {symptomTriage.triageLevel === "GREEN" ? (
                      <Button size="sm" onClick={openDoctorBooking}>
                        Schedule Appointment
                      </Button>
                    ) : null}
                    {symptomTriage.triageLevel === "BLUE" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => toast.info("Monitor symptoms and seek care if they worsen.")}>
                          Monitor Symptoms
                        </Button>
                        <Button size="sm" onClick={openDoctorBooking}>
                          Chat with Doctor
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved Offline Checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {symptomHistory.length ? null : (
                <div className="text-sm text-muted-foreground">No saved checks yet.</div>
              )}
              {symptomHistory.map((entry) => (
                <button
                  key={`${entry.id ?? entry.createdAt}`}
                  type="button"
                  className="w-full rounded-lg border-2 border-border px-3 py-2 text-left hover:bg-muted/30"
                  onClick={() => setSymptomTriage(entry.response)}
                >
                  <div className="font-medium">
                    {entry.response.triageLevel} - {triageLevelLabel(entry.response.triageLevel)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)} • {entry.symptoms.slice(0, 90)}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (section === "personal-info") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Personal Medical Info</CardTitle>
            <CardDescription>Your patient profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border-2 border-border p-3">
                <div className="text-xs text-muted-foreground">Age</div>
                <div className="mt-1 text-sm font-semibold">{me.patient?.age ?? "Not set"}</div>
              </div>
              <div className="rounded-lg border-2 border-border p-3">
                <div className="text-xs text-muted-foreground">Gender</div>
                <div className="mt-1 text-sm font-semibold">{me.patient?.gender ?? "Not set"}</div>
              </div>
              <div className="rounded-lg border-2 border-border p-3">
                <div className="text-xs text-muted-foreground">Blood Group</div>
                <div className="mt-1 text-sm font-semibold">{me.patient?.bloodGroup ?? "Not set"}</div>
              </div>
              <div className="rounded-lg border-2 border-border p-3">
                <div className="text-xs text-muted-foreground">Village</div>
                <div className="mt-1 text-sm font-semibold">{me.patient?.village ?? "Not set"}</div>
              </div>
              <div className="rounded-lg border-2 border-border p-3">
                <div className="text-xs text-muted-foreground">Language</div>
                <div className="mt-1 text-sm font-semibold">{me.patient?.languagePreference ?? "Not set"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === "prescriptions") {
    const visualDurationDays = summaryDurationDays(simplifiedPrescription);
    const treatmentDurationLabel = visualDurationDays
      ? `${visualDurationDays} days`
      : "As advised";

    return (
      <div className="space-y-4">
        <Card id="smart-prescription-simplifier" className="overflow-hidden border-2 border-border shadow-soft">
          <CardHeader className="border-b border-border bg-gradient-to-r from-sky-50 via-blue-50 to-emerald-50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Smart Prescription Simplifier</CardTitle>
                <CardDescription className="mt-1">
                  Doctor instructions are locked for safety. You can switch language and regenerate the visual card.
                </CardDescription>
              </div>
              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                Locked Source Text
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label>Prescription / Instructions Text</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadLatestPrescriptionIntoSimplifier()}
                  disabled={!filteredPrescriptions.length}
                >
                  Load Latest Prescription
                </Button>
              </div>
              <textarea
                readOnly
                value={prescriptionTextInput}
                className="h-28 w-full cursor-not-allowed rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground/90 outline-none"
                placeholder={'Use "Simplify This" from a doctor prescription below to load instructions.'}
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Instruction text cannot be edited manually. Language can be changed anytime.
              </div>
              {lockedPrescriptionSource ? (
                <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Source:</span>
                  Dr. {lockedPrescriptionSource.doctorName} • {lockedPrescriptionSource.diagnosis} •{" "}
                  {formatDate(lockedPrescriptionSource.issuedAt)}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Language</Label>
                <select
                  className="h-10 min-w-44 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={prescriptionLanguage}
                  onChange={(event) => setPrescriptionLanguage(event.target.value as PrescriptionLanguageCode)}
                >
                  {prescriptionLanguageOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={simplifyingPrescription || prescriptionTextInput.trim().length < 10}
                onClick={() => void runPrescriptionSimplifier()}
                className="h-10"
              >
                {simplifyingPrescription ? "Generating..." : "Generate Visual Card"}
              </Button>
            </div>

            {simplifiedPrescription ? (
              <details
                className="overflow-hidden rounded-2xl border-2 border-border bg-slate-100/50 shadow-soft"
                open={isPrescriptionCardOpen}
                onToggle={(event) =>
                  setIsPrescriptionCardOpen((event.currentTarget as HTMLDetailsElement).open)
                }
              >
                <summary className="cursor-pointer list-none bg-white/90 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">Visual Prescription Card</div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Tap to {isPrescriptionCardOpen ? "collapse" : "expand"}
                    </span>
                  </div>
                </summary>

                <div className="space-y-3 border-t border-border px-4 py-4 text-sm">
                  <div className="rounded-2xl border border-border bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-2xl font-semibold text-foreground">Prescription</div>
                        <div className="text-lg text-muted-foreground">
                          {lockedPrescriptionSource?.diagnosis || "Treatment Plan"}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Language : {simplifiedPrescription.languageLabel} · {simplifiedPrescription.medicines.length} Medicines · {treatmentDurationLabel}
                      </div>
                    </div>
                    <div className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                      Treatment Duration : <span className="font-semibold text-foreground">{treatmentDurationLabel}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-white px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Summary</div>
                    <div className="mt-1.5 leading-relaxed text-foreground">
                      {simplifiedPrescription.doctorExplanation}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {simplifiedPrescription.medicines.map((medicine, index) => {
                      const timings = medicine.timingSlots.map((slot) =>
                        timingSlotDisplay(slot, simplifiedPrescription.languageCode)
                      );
                      const title = medicine.medicineName;
                      const details = [
                        medicine.dosage,
                        medicine.duration,
                        ...medicine.instructions,
                      ]
                        .map((entry) => entry.trim())
                        .filter(Boolean)
                        .join(" • ");

                      return (
                        <div
                          key={`simplified-med-${index}`}
                          className="rounded-2xl border border-border bg-white px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-2xl font-semibold leading-tight text-foreground">
                              {title} <span className="text-xl font-normal text-muted-foreground">{medicine.dosage}</span>
                            </div>
                            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
                              {medicine.duration}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {details || "As prescribed by doctor"}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {timings.map((timing, timingIndex) => {
                              const icon = primaryTimingIcon(timing.icon);
                              const split = splitTimingLabel(timing.label);
                              return (
                                <div
                                  key={`${medicine.medicineName}-${timing.label}-${timingIndex}`}
                                  className={`rounded-xl border px-3 py-2 ${dosageTimingClass(icon)}`}
                                >
                                  <div className="text-[30px] leading-none sm:text-xl">
                                    {icon}
                                  </div>
                                  <div className="mt-1 text-lg font-semibold leading-tight sm:text-base">
                                    {split.primary}
                                  </div>
                                  {split.secondary ? (
                                    <div className="mt-0.5 text-sm opacity-80 sm:text-xs">{split.secondary}</div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {simplifiedPrescription.hydrationTips.length ? (
                      <div className="rounded-2xl border border-sky-200 bg-white px-4 py-3">
                        <div className="text-3xl leading-none">💧</div>
                        <div className="mt-1 text-2xl font-semibold text-foreground sm:text-xl">Stay Hydrated</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {simplifiedPrescription.hydrationTips.join(" • ")}
                        </div>
                      </div>
                    ) : null}

                    {simplifiedPrescription.generalAdvice.length ? (
                      <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                        <div className="text-sm font-semibold text-foreground">General Advice</div>
                        <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                          {simplifiedPrescription.generalAdvice.map((tip, tipIndex) => (
                            <div key={`${tip}-${tipIndex}`} className="flex items-start gap-2">
                              <span className="text-emerald-600">✓</span>
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {simplifiedPrescription.warnings.length ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 md:col-span-2">
                        <div className="text-sm font-semibold text-amber-900">Warnings</div>
                        <div className="mt-1 text-sm text-amber-900">
                          {simplifiedPrescription.warnings.join(" • ")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex w-full items-center gap-2">
           <Input value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)} placeholder="Search prescriptions..." className="w-full sm:max-w-md" />
        </div>
        <Card id="records-prescriptions">
          <CardHeader>
            <CardTitle>Doctor Prescriptions</CardTitle>
            <CardDescription>Doctor-issued prescriptions with full medicine and dosage details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredPrescriptions.length ? null : (
              <div className="text-sm text-muted-foreground">No prescriptions received yet.</div>
            )}
            <div className="space-y-2">
              {filteredPrescriptions.map((prescription) => {
                const availabilityRows = prayagrajAvailabilityByPrescription[prescription.id];
                const checkingAvailability = checkingPrayagrajAvailabilityFor === prescription.id;

                return (
                <details
                  key={`rx-${prescription.id}`}
                  className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-soft"
                >
                  <summary className="cursor-pointer list-none bg-gradient-to-r from-violet-50/70 to-sky-50/70 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{prescription.diagnosis}</div>
                        <div className="text-xs text-muted-foreground">
                          Dr. {prescription.doctor.user.name} • {formatDate(prescription.createdAt)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="max-w-full break-all rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-900">
                          QR: SANJEEVNI_RX:{prescription.qrToken}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {prescription.items.length} medicine
                          {prescription.items.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </summary>

                  <div className="space-y-2 border-t border-border px-4 py-4 text-sm">
                    <div><span className="font-medium">Symptoms:</span> {prescription.symptoms}</div>
                    <div><span className="font-medium">Diagnosis:</span> {prescription.diagnosis}</div>
                    <div>
                      <span className="font-medium">Linked Consultation:</span>{" "}
                      {prescription.appointment ? formatDate(prescription.appointment.scheduledAt) : "Not linked"}
                      {prescription.appointment ? (
                        <span
                          className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs ${appointmentStatusClassName(prescription.appointment.status)}`}
                        >
                          {prescription.appointment.status}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="font-medium">Follow-up Date:</span>{" "}
                      {prescription.followUpDate ? formatDate(prescription.followUpDate) : "Not specified"}
                    </div>
                    <div><span className="font-medium">Doctor Notes:</span> {prescription.notes?.trim() || "No additional notes"}</div>

                    <div className="rounded-md border border-border bg-muted/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medicines</div>
                      <div className="mt-1 space-y-1 text-xs">
                        {prescription.items.map((item, index) => (
                          <div key={`${prescription.id}-medicine-${index}`}>
                            • {item.medicineName} ({item.dosage}) • {item.frequency} • {item.durationDays} days • Qty {item.quantity}
                            {item.instructions?.trim() ? ` • ${item.instructions.trim()}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadPrescriptionIntoSimplifier(prescription)}
                      >
                        Simplify This
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={checkingAvailability}
                        onClick={() => void checkPrayagrajAvailability(prescription)}
                      >
                        {checkingAvailability ? "Checking..." : "Check Prayagraj Availability"}
                      </Button>
                    </div>

                    {availabilityRows ? (
                      <div className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Prayagraj Inventory Match
                        </div>
                        <div className="mt-2 space-y-2 text-xs">
                          {availabilityRows.map((result, index) => (
                            <div key={`${prescription.id}-prayagraj-result-${index}`} className="rounded-md border border-border/70 bg-card p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-foreground">{result.medicine_requested}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    result.status === "Available"
                                      ? "bg-emerald-100 text-emerald-900"
                                      : result.status === "Alternative Available"
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-red-100 text-red-900"
                                  }`}
                                >
                                  {result.status}
                                </span>
                              </div>

                              {result.status === "Available" ? (
                                <div className="mt-1 text-muted-foreground">
                                  {result.exact_match.pharmacy_name} ({result.exact_match.area}) • Stock {result.exact_match.stock} •{" "}
                                  {currency.format(result.exact_match.price)}
                                </div>
                              ) : null}

                              {result.status === "Alternative Available" ? (
                                <div className="mt-1 space-y-1 text-muted-foreground">
                                  {result.alternatives.map((alternative, altIndex) => (
                                    <div key={`${prescription.id}-alt-${index}-${altIndex}`}>
                                      {alternative.brand_name} ({alternative.generic_name}) • {alternative.pharmacy_name} ({alternative.area}) • Stock {alternative.stock} •{" "}
                                      {currency.format(alternative.price)}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {result.status === "Not Available" ? (
                                <div className="mt-1 text-red-800">
                                  Not Available in Prayagraj
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Health Records</CardTitle>
          <CardDescription>
            Separate views for personal medical info, doctor prescriptions, and consultation history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              placeholder="Search across personal records, prescriptions, and consultations..."
              className="w-full sm:max-w-lg"
            />
            <Button
              disabled={saving}
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              Upload Record
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadRecord(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Secure uploads are private and only accessible to you, your consulting doctor, or admin.
            {recordsSyncedAt ? ` Last synced: ${formatDate(recordsSyncedAt)}` : ""}
          </div>

          <div className="space-y-2 mt-4">
            <div className="text-sm font-semibold">Personal Medical Uploads</div>
            {filteredReports.length ? null : (
              <div className="text-sm text-muted-foreground">No personal records found.</div>
            )}
            {filteredReports.map((report) => (
              <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{report.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {report.mimeType} • Uploaded {formatDate(report.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {report.fileUrl.startsWith("secure://") ? "Secure" : "External"}
                  </span>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => void downloadReport(report)}>
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consultation History</CardTitle>
          <CardDescription>Previous consultations and linked prescription status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredConsultations.length ? null : (
            <div className="text-sm text-muted-foreground">No previous consultations found.</div>
          )}
          {filteredConsultations.map((consultation) => (
            <div key={consultation.id} className="rounded-lg border-2 border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{consultation.doctor?.user?.name ?? "Doctor"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(consultation.scheduledAt)} • {consultation.callMode}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${appointmentStatusClassName(consultation.status)}`}>
                  {consultation.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {consultation.prescription ? (
                  <>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
                      Prescription attached
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (consultation.prescription?.qrToken) {
                          setRecordSearch(consultation.prescription.qrToken);
                        }
                        document
                          .getElementById("records-prescriptions")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      Open Linked Prescription
                    </Button>
                  </>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">No prescription attached</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
