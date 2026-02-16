"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
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

type Role = "PATIENT" | "DOCTOR" | "PHARMACY" | "ADMIN";

type MeUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  approvalState: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  patient: {
    age: number | null;
    gender: string | null;
    bloodGroup: string | null;
    village: string | null;
    languagePreference: string | null;
  } | null;
  doctor: {
    id: string;
    specialty: string;
    languages: string[];
    emergencyPriority: boolean;
    availability?: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }>;
  } | null;
  pharmacy: {
    id: string;
    displayName: string;
    village: string | null;
  } | null;
};

type DoctorListing = {
  id: string;
  specialty: string;
  languages: string[];
  consultationFeePaise: number;
  user: {
    id: string;
    name: string;
  };
  availability: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
};

type Appointment = {
  id: string;
  scheduledAt: string;
  status: "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  callMode: "VIDEO" | "AUDIO" | "CHAT";
  callRoomId: string;
  consultationUi?: string | null;
  bucket?: "TODAY" | "UPCOMING";
  doctor?: {
    user?: {
      name?: string;
    };
  };
  patient?: {
    user?: {
      name?: string;
    };
  };
  prescription?: {
    id: string;
    qrToken?: string;
  } | null;
};

type PrescriptionRecord = {
  id: string;
  qrToken: string;
  diagnosis: string;
  symptoms: string;
  notes: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    medicineName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    instructions: string | null;
  }>;
  doctor: {
    user: {
      name: string;
    };
  };
};

type PharmacyAvailability = {
  pharmacyId: string;
  pharmacyName: string;
  village: string | null;
  canFulfillAll: boolean;
  totalPricePaise: number;
  items: Array<{
    medicineName: string;
    requiredQuantity: number;
    availableQuantity: number;
    inStock: boolean;
    pricePaise: number | null;
  }>;
};

type PharmacyInventory = {
  id: string;
  pricePaise: number;
  quantity: number;
  inStock: boolean;
  medicine: {
    name: string;
    brand: string | null;
  };
};

type Reservation = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "FULFILLED" | "CANCELLED";
  requestedAt: string;
  patient: {
    user: {
      name: string;
    };
  };
  prescription: {
    items: Array<{
      medicineName: string;
      quantity: number;
    }>;
  };
};

type PendingUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  approvalState: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  doctor: {
    specialty: string;
    licenseNumber: string | null;
  } | null;
  pharmacy: {
    displayName: string;
    registrationNumber: string | null;
  } | null;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: {
    name: string;
    role: Role;
  };
};

type EmergencyAlert = {
  id: string;
  createdAt: string;
  triageLevel: string;
  summary: string;
  explanation: string;
  recommendedAction: string;
  symptoms: string;
  additionalContext: string;
  actor: {
    id: string;
    name: string;
    role: Role;
    email: string;
    phone: string | null;
  };
};

type SymptomCheckHistoryEntry = {
  id?: number;
  symptoms: string;
  response: SymptomTriage;
  createdAt: string;
};

type AvailabilitySlotDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toLocalDateTimeValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function parseQrToken(input: string) {
  if (!input) return "";
  return input.replace(/^SANJEEVNI_RX:/i, "").trim();
}

function appointmentStatusClassname(status: Appointment["status"]) {
  if (status === "BOOKED") return "bg-sky-100 text-sky-900";
  if (status === "IN_PROGRESS") return "bg-red-100 text-red-800";
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-900";
  if (status === "NO_SHOW") return "bg-amber-100 text-amber-900";
  return "bg-zinc-200 text-zinc-800";
}

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const userId = session.user.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [me, setMe] = useState<MeUser | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<DoctorListing[]>([]);
  const [records, setRecords] = useState<{
    consultations: Appointment[];
    prescriptions: PrescriptionRecord[];
    reports: Array<{ id: string; fileName: string; fileUrl: string; createdAt: string }>;
  }>({
    consultations: [],
    prescriptions: [],
    reports: [],
  });
  const [recordsLastSyncedAt, setRecordsLastSyncedAt] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{
    prescriptionId: string;
    rows: PharmacyAvailability[];
  } | null>(null);
  const [selectedPrescriptionForAvailability, setSelectedPrescriptionForAvailability] = useState<string>("");

  const [inventory, setInventory] = useState<PharmacyInventory[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [analytics, setAnalytics] = useState<{
    patients: number;
    doctors: number;
    consultations: number;
    prescriptions: number;
    activePharmacies: number;
    pendingApprovals: number;
    sosAlerts24h: number;
  }>({
    patients: 0,
    doctors: 0,
    consultations: 0,
    prescriptions: 0,
    activePharmacies: 0,
    pendingApprovals: 0,
    sosAlerts24h: 0,
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);

  const [profileRole, setProfileRole] = useState<Role>("PATIENT");
  const [patientForm, setPatientForm] = useState({
    phone: "",
    age: "",
    gender: "",
    bloodGroup: "",
    village: "",
    languagePreference: "",
  });
  const [doctorForm, setDoctorForm] = useState({
    specialty: "",
    languagesCsv: "",
    licenseNumber: "",
    licenseDocumentUrl: "",
    consultationFeePaise: "50000",
  });
  const [pharmacyForm, setPharmacyForm] = useState({
    phone: "",
    displayName: "",
    village: "",
    registrationNumber: "",
    registrationDocumentUrl: "",
  });

  const [doctorSearch, setDoctorSearch] = useState({
    specialty: "",
    language: "",
  });
  const [booking, setBooking] = useState({
    doctorId: "",
    scheduledAt: "",
    callMode: "VIDEO" as "VIDEO" | "AUDIO" | "CHAT",
  });
  const bookingScheduleRef = useRef<HTMLInputElement | null>(null);
  const latestAdminEmergencyIdRef = useRef<string | null>(null);

  const [rxAppointmentId, setRxAppointmentId] = useState("");
  const [rxForm, setRxForm] = useState({
    symptoms: "",
    diagnosis: "",
    notes: "",
    followUpDate: "",
    items: [
      {
        medicineName: "",
        dosage: "",
        frequency: "",
        durationDays: 5,
        quantity: 10,
        instructions: "",
      },
    ],
  });
  const [generatedPrescription, setGeneratedPrescription] = useState<{
    id: string;
    qrToken: string;
    qrValue: string;
    qrImageUrl: string;
  } | null>(null);

  const [emergencyPriority, setEmergencyPriority] = useState(false);
  const [slotDraft, setSlotDraft] = useState<AvailabilitySlotDraft>({
    dayOfWeek: 1,
    startTime: "10:00",
    endTime: "10:30",
    isActive: true,
  });
  const [slots, setSlots] = useState<AvailabilitySlotDraft[]>([]);

  const [inventoryForm, setInventoryForm] = useState({
    name: "",
    brand: "",
    pricePaise: "1500",
    quantity: "10",
  });

  const [scannerValue, setScannerValue] = useState("");

  const [symptomForm, setSymptomForm] = useState({
    symptoms: "",
    age: "",
    duration: "",
    knownConditionsCsv: "",
    additionalContext: "",
  });
  const [symptomTriage, setSymptomTriage] = useState<SymptomTriage | null>(null);
  const [symptomHistory, setSymptomHistory] = useState<SymptomCheckHistoryEntry[]>([]);
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const profileReady = useMemo(() => {
    if (!me) return false;
    if (me.role === "PATIENT") return Boolean(me.patient);
    if (me.role === "DOCTOR") return Boolean(me.doctor);
    if (me.role === "PHARMACY") return Boolean(me.pharmacy);
    return true;
  }, [me]);

  const patientUpcomingAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "BOOKED" || appointment.status === "IN_PROGRESS")
        .slice(0, 5),
    [appointments],
  );

  const trackedMedicinesCount = useMemo(
    () => records.prescriptions.reduce((total, prescription) => total + prescription.items.length, 0),
    [records.prescriptions],
  );

  const doctorLiveAppointment = useMemo(
    () => appointments.find((appointment) => appointment.status === "IN_PROGRESS") ?? null,
    [appointments],
  );

  const doctorBookedAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === "BOOKED"),
    [appointments],
  );

  const doctorClosedAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "COMPLETED" || appointment.status === "NO_SHOW")
        .sort((left, right) => +new Date(right.scheduledAt) - +new Date(left.scheduledAt)),
    [appointments],
  );

  const pharmacyInStockCount = useMemo(
    () => inventory.filter((item) => item.inStock && item.quantity > 0).length,
    [inventory],
  );

  const pendingReservationsCount = useMemo(
    () => reservations.filter((item) => item.status === "PENDING").length,
    [reservations],
  );

  const fetchDoctors = useCallback(
    async (specialty?: string, language?: string) => {
      const params = new URLSearchParams();
      if (specialty?.trim()) params.set("specialty", specialty.trim());
      if (language?.trim()) params.set("language", language.trim());
      const query = params.toString();
      const response = await mvpApi.get<{ doctors: DoctorListing[] }>(
        `/doctors${query ? `?${query}` : ""}`,
        userId,
      );
      setDoctors(response.doctors);
    },
    [userId],
  );

  const fetchAppointments = useCallback(async () => {
    const response = await mvpApi.get<{ appointments: Appointment[] }>("/appointments/me", userId);
    setAppointments(response.appointments);
  }, [userId]);

  const fetchSymptomHistory = useCallback(async () => {
    const history = await getRecentSymptomChecksOffline(userId, 8);
    const typedHistory: SymptomCheckHistoryEntry[] = [];
    for (const entry of history) {
      const normalized = normalizeSymptomTriage(entry.response);
      if (!normalized) continue;
      typedHistory.push({
        id: entry.id,
        symptoms: entry.symptoms,
        response: normalized,
        createdAt: entry.createdAt,
      });
    }
    setSymptomHistory(typedHistory);
  }, [userId]);

  const fetchPatientRecords = useCallback(async () => {
    try {
      const response = await mvpApi.get<{
        consultations: Appointment[];
        prescriptions: PrescriptionRecord[];
        reports: Array<{ id: string; fileName: string; fileUrl: string; createdAt: string }>;
      }>("/patients/me/records", userId);
      setRecords(response);
      setRecordsLastSyncedAt(new Date().toISOString());
      await savePatientRecordsOffline(userId, response);
    } catch (error) {
      const cached = await getPatientRecordsOffline(userId);
      if (!cached) throw error;

      setRecords({
        consultations: cached.consultations as Appointment[],
        prescriptions: cached.prescriptions as PrescriptionRecord[],
        reports: cached.reports as Array<{ id: string; fileName: string; fileUrl: string; createdAt: string }>,
      });
      setRecordsLastSyncedAt(cached.updatedAt);
      toast.info("Offline mode: showing Dexie cached records");
    }
  }, [userId]);

  const fetchPharmacyData = useCallback(async () => {
    const [inventoryResponse, reservationsResponse] = await Promise.all([
      mvpApi.get<{ inventory: PharmacyInventory[] }>("/pharmacy/inventory", userId),
      mvpApi.get<{ reservations: Reservation[] }>("/pharmacy/reservations", userId),
    ]);
    setInventory(inventoryResponse.inventory);
    setReservations(reservationsResponse.reservations);
  }, [userId]);

  const fetchAdminData = useCallback(async () => {
    const [pendingResponse, analyticsResponse, logsResponse, emergencyResponse] = await Promise.all([
      mvpApi.get<{ users: PendingUser[] }>("/admin/pending-approvals", userId),
      mvpApi.get<{
        totals: {
          patients: number;
          doctors: number;
          consultations: number;
          prescriptions: number;
          activePharmacies: number;
          pendingApprovals: number;
          sosAlerts24h: number;
        };
      }>("/admin/analytics", userId),
      mvpApi.get<{ logs: AuditLog[] }>("/admin/audit-logs", userId),
      mvpApi.get<{ alerts: EmergencyAlert[] }>("/admin/emergency-alerts", userId),
    ]);

    setPendingUsers(pendingResponse.users);
    setAnalytics(analyticsResponse.totals);
    setAuditLogs(logsResponse.logs);
    setEmergencyAlerts(emergencyResponse.alerts);

    const newestAlert = emergencyResponse.alerts[0];
    if (newestAlert && latestAdminEmergencyIdRef.current && latestAdminEmergencyIdRef.current !== newestAlert.id) {
      toast.error(`SOS alert received from ${newestAlert.actor.name}`);
    }
    latestAdminEmergencyIdRef.current = newestAlert?.id ?? null;
  }, [userId]);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = await mvpApi.get<{ user: MeUser }>("/me", userId);
      setMe(meResponse.user);
      setProfileRole(meResponse.user.role);

      if (meResponse.user.doctor) {
        setEmergencyPriority(meResponse.user.doctor.emergencyPriority);
        setSlots(
          (meResponse.user.doctor.availability ?? []).map((slot) => ({
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isActive: slot.isActive,
          })),
        );
      }

      if (meResponse.user.role === "PATIENT" && meResponse.user.patient) {
        await Promise.all([fetchDoctors(), fetchAppointments(), fetchPatientRecords(), fetchSymptomHistory()]);
      }
      if (meResponse.user.role === "DOCTOR" && meResponse.user.doctor) {
        await fetchAppointments();
      }
      if (meResponse.user.role === "PHARMACY" && meResponse.user.pharmacy) {
        await fetchPharmacyData();
      }
      if (meResponse.user.role === "ADMIN") {
        await fetchAdminData();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load dashboard";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [
    fetchAdminData,
    fetchAppointments,
    fetchDoctors,
    fetchPatientRecords,
    fetchSymptomHistory,
    fetchPharmacyData,
    userId,
  ]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!loading && profileReady) {
      if (me?.role === "PATIENT") {
        window.location.href = "/dashboard/patient";
      }
      if (me?.role === "DOCTOR") {
        window.location.href = "/dashboard/doctor";
      }
    }
  }, [loading, me?.role, profileReady]);

  useEffect(() => {
    if (!me || me.role !== "DOCTOR") return;

    const interval = setInterval(() => {
      void fetchAppointments();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchAppointments, me]);

  useEffect(() => {
    if (!me || me.role !== "ADMIN") return;

    const interval = setInterval(() => {
      void fetchAdminData();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchAdminData, me]);

  const focusDoctorBooking = useCallback(() => {
    document.getElementById("patient-consultations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      bookingScheduleRef.current?.focus();
    }, 250);
  }, []);

  const callEmergencyServices = useCallback(() => {
    window.location.href = `tel:${EMERGENCY_CALL_NUMBER}`;
  }, []);

  const callAlertPatient = useCallback((phone: string | null) => {
    if (!phone) {
      toast.error("Patient phone number not available");
      return;
    }
    window.location.href = `tel:${phone}`;
  }, []);

  useEffect(() => {
    if (!symptomTriage) return;
    if (symptomTriage.triageLevel !== "RED") return;
    setShowEmergencyOverlay(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([300, 120, 300, 120, 500]);
    }
  }, [symptomTriage]);

  const saveProfile = async () => {
    setSubmitting(true);
    try {
      if (profileRole === "PATIENT") {
        await mvpApi.post("/profiles/patient", userId, {
          phone: patientForm.phone || undefined,
          age: patientForm.age ? Number(patientForm.age) : undefined,
          gender: patientForm.gender || undefined,
          bloodGroup: patientForm.bloodGroup || undefined,
          village: patientForm.village || undefined,
          languagePreference: patientForm.languagePreference || undefined,
        });
      }

      if (profileRole === "DOCTOR") {
        await mvpApi.post("/profiles/doctor", userId, {
          specialty: doctorForm.specialty,
          languages: doctorForm.languagesCsv
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          licenseNumber: doctorForm.licenseNumber || undefined,
          licenseDocumentUrl: doctorForm.licenseDocumentUrl || undefined,
          consultationFeePaise: Number(doctorForm.consultationFeePaise || "0"),
        });
      }

      if (profileRole === "PHARMACY") {
        await mvpApi.post("/profiles/pharmacy", userId, {
          phone: pharmacyForm.phone || undefined,
          displayName: pharmacyForm.displayName,
          village: pharmacyForm.village || undefined,
          registrationNumber: pharmacyForm.registrationNumber || undefined,
          registrationDocumentUrl: pharmacyForm.registrationDocumentUrl || undefined,
        });
      }

      toast.success("Profile saved");
      await initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save profile";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const bookAppointment = async () => {
    if (!booking.doctorId || !booking.scheduledAt) {
      toast.error("Select doctor and time slot");
      return;
    }

    setSubmitting(true);
    try {
      await mvpApi.post("/appointments", userId, {
        doctorId: booking.doctorId,
        scheduledAt: new Date(booking.scheduledAt).toISOString(),
        callMode: booking.callMode,
      });
      toast.success("Appointment booked");
      setBooking((previous) => ({ ...previous, scheduledAt: "" }));
      await Promise.all([fetchAppointments(), fetchPatientRecords()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Booking failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const seedDemoDoctor = async () => {
    setSubmitting(true);
    try {
      const response = await mvpApi.post<{ message: string }>("/dev/seed-doctor", userId);
      toast.success(response.message || "Demo doctor created");
      await fetchDoctors(doctorSearch.specialty, doctorSearch.language);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to seed demo doctor";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const markAppointmentStatus = async (
    appointmentId: string,
    status: "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
    callMode?: "VIDEO" | "AUDIO" | "CHAT",
  ) => {
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ status });
      if (callMode) params.set("callMode", callMode);
      await mvpApi.patch(`/appointments/${appointmentId}/status?${params.toString()}`, userId);
      await fetchAppointments();
      toast.success("Appointment updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update appointment";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const startDoctorConsultation = async (appointment: Appointment) => {
    if (doctorLiveAppointment && doctorLiveAppointment?.id !== appointment.id) {
      toast.error("Finish the current live consultation before starting a new one");
      return;
    }
    await markAppointmentStatus(appointment.id, "IN_PROGRESS", appointment.callMode);
  };

  const finishDoctorConsultation = async (appointment: Appointment) => {
    await markAppointmentStatus(appointment.id, "COMPLETED");
  };

  const generatePrescription = async () => {
    if (!rxAppointmentId) {
      toast.error("Choose an appointment");
      return;
    }
    if (!rxForm.symptoms || !rxForm.diagnosis) {
      toast.error("Symptoms and diagnosis are required");
      return;
    }

    const normalizedItems = rxForm.items
      .map((item) => ({
        medicineName: item.medicineName.trim(),
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
        durationDays: Number(item.durationDays),
        quantity: Number(item.quantity),
        instructions: item.instructions.trim(),
      }))
      .filter((item) => item.medicineName && item.dosage && item.frequency);

    if (!normalizedItems.length) {
      toast.error("Add at least one medicine line");
      return;
    }

    setSubmitting(true);
    try {
      const response = await mvpApi.post<{
        prescription: {
          id: string;
          qrToken: string;
        };
        qrValue: string;
        qrImageUrl: string;
      }>(`/appointments/${rxAppointmentId}/prescription`, userId, {
        symptoms: rxForm.symptoms,
        diagnosis: rxForm.diagnosis,
        notes: rxForm.notes || undefined,
        followUpDate: rxForm.followUpDate ? new Date(rxForm.followUpDate).toISOString() : undefined,
        items: normalizedItems,
      });

      setGeneratedPrescription({
        id: response.prescription.id,
        qrToken: response.prescription.qrToken,
        qrValue: response.qrValue,
        qrImageUrl: response.qrImageUrl,
      });
      toast.success("Prescription generated");
      await fetchAppointments();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate prescription";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveDoctorSettings = async () => {
    setSubmitting(true);
    try {
      await mvpApi.patch("/doctors/me/settings", userId, {
        emergencyPriority,
      });
      await mvpApi.post("/doctors/me/availability", userId, {
        slots,
      });
      toast.success("Doctor availability updated");
      await initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save doctor settings";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const addInventoryItem = async () => {
    if (!inventoryForm.name || !inventoryForm.pricePaise || !inventoryForm.quantity) {
      toast.error("Medicine, price and quantity are required");
      return;
    }

    setSubmitting(true);
    try {
      await mvpApi.post("/pharmacy/inventory", userId, {
        name: inventoryForm.name,
        brand: inventoryForm.brand || undefined,
        pricePaise: Number(inventoryForm.pricePaise),
        quantity: Number(inventoryForm.quantity),
      });
      setInventoryForm({
        name: "",
        brand: "",
        pricePaise: "1500",
        quantity: "10",
      });
      await fetchPharmacyData();
      toast.success("Inventory updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inventory update failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const checkAvailabilityByQr = async (tokenInput: string, prescriptionId?: string) => {
    const token = parseQrToken(tokenInput);
    if (!token) {
      toast.error("Enter or scan a valid QR value");
      return;
    }

    setSubmitting(true);
    try {
      const response = await mvpApi.get<{
        prescriptionId: string;
        availability: PharmacyAvailability[];
      }>(`/pharmacies/availability/${token}`, userId);

      setAvailability({
        prescriptionId: prescriptionId ?? response.prescriptionId,
        rows: response.availability,
      });
      setSelectedPrescriptionForAvailability(prescriptionId ?? response.prescriptionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to check stock";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const runSymptomChecker = async () => {
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

    setSubmitting(true);
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
      await fetchSymptomHistory();

      if (normalized.triageLevel === "RED") {
        toast.error("Emergency detected. Call emergency services now.");
      } else if (normalized.triageLevel === "YELLOW") {
        toast.warning("Urgent triage result. Talk to a doctor within 24 hours.");
        focusDoctorBooking();
      } else if (normalized.triageLevel === "GREEN") {
        toast.info("Routine consultation recommended.");
      } else {
        toast.info("Self-care guidance available. Monitor symptoms.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Symptom checker unavailable";
      toast.error(message);

      const localHistory = await getRecentSymptomChecksOffline(userId, 1);
      if (localHistory[0]) {
        const cached = normalizeSymptomTriage(localHistory[0].response);
        if (cached) {
          setSymptomTriage(cached);
          toast.info("Showing latest offline triage result");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reserveMedicines = async (pharmacyId: string) => {
    if (!selectedPrescriptionForAvailability) {
      toast.error("Choose prescription first");
      return;
    }

    setSubmitting(true);
    try {
      await mvpApi.post("/reservations", userId, {
        pharmacyId,
        prescriptionId: selectedPrescriptionForAvailability,
      });
      toast.success("Reservation sent");
      if (me?.role === "PATIENT") {
        await fetchPatientRecords();
      }
      if (me?.role === "PHARMACY") {
        await fetchPharmacyData();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reservation failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateReservation = async (
    reservationId: string,
    status: "ACCEPTED" | "REJECTED" | "FULFILLED" | "CANCELLED",
  ) => {
    setSubmitting(true);
    try {
      await mvpApi.patch(`/pharmacy/reservations/${reservationId}`, userId, { status });
      await fetchPharmacyData();
      toast.success("Reservation updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update reservation";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateUserApproval = async (
    targetUserId: string,
    approvalState: "APPROVED" | "REJECTED" | "SUSPENDED",
  ) => {
    setSubmitting(true);
    try {
      await mvpApi.patch(`/admin/users/${targetUserId}/approval`, userId, { approvalState });
      await fetchAdminData();
      toast.success("Approval state updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update approval";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-sm font-medium text-foreground">Loading SANJEEVNI</p>
          <p className="text-xs text-muted-foreground">Preparing your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-red-light">
            <span className="text-lg">⚠️</span>
          </div>
          <p className="text-sm font-medium text-foreground">Unable to load your account</p>
          <p className="text-xs text-muted-foreground">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  if (profileReady && me.role === "PATIENT") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-emerald-light">
            <div className="size-5 animate-spin rounded-full border-2 border-emerald border-t-transparent" />
          </div>
          <p className="text-sm font-medium text-foreground">Opening patient workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background pb-10">
      <div className="mx-auto w-full max-w-full space-y-6 px-4 py-6 lg:px-8">
        {!profileReady ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Complete Your Profile</CardTitle>
              <CardDescription>
                Choose your role and submit required details to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="profile-role">I am a</Label>
                <select
                  id="profile-role"
                  className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={profileRole}
                  onChange={(event) => setProfileRole(event.target.value as Role)}
                >
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="PHARMACY">Pharmacy</option>
                </select>
              </div>

              {profileRole === "PATIENT" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      value={patientForm.phone}
                      onChange={(event) =>
                        setPatientForm((previous) => ({ ...previous, phone: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Age</Label>
                    <Input
                      type="number"
                      value={patientForm.age}
                      onChange={(event) =>
                        setPatientForm((previous) => ({ ...previous, age: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Gender</Label>
                    <Input
                      value={patientForm.gender}
                      onChange={(event) =>
                        setPatientForm((previous) => ({ ...previous, gender: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Blood Group</Label>
                    <Input
                      value={patientForm.bloodGroup}
                      onChange={(event) =>
                        setPatientForm((previous) => ({ ...previous, bloodGroup: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Village</Label>
                    <Input
                      value={patientForm.village}
                      onChange={(event) =>
                        setPatientForm((previous) => ({ ...previous, village: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Language Preference</Label>
                    <Input
                      value={patientForm.languagePreference}
                      onChange={(event) =>
                        setPatientForm((previous) => ({
                          ...previous,
                          languagePreference: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              {profileRole === "DOCTOR" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Specialty</Label>
                    <Input
                      value={doctorForm.specialty}
                      onChange={(event) =>
                        setDoctorForm((previous) => ({ ...previous, specialty: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Languages (comma separated)</Label>
                    <Input
                      value={doctorForm.languagesCsv}
                      onChange={(event) =>
                        setDoctorForm((previous) => ({ ...previous, languagesCsv: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>License Number</Label>
                    <Input
                      value={doctorForm.licenseNumber}
                      onChange={(event) =>
                        setDoctorForm((previous) => ({ ...previous, licenseNumber: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>License Document URL</Label>
                    <Input
                      value={doctorForm.licenseDocumentUrl}
                      onChange={(event) =>
                        setDoctorForm((previous) => ({
                          ...previous,
                          licenseDocumentUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Consultation Fee (paise)</Label>
                    <Input
                      type="number"
                      value={doctorForm.consultationFeePaise}
                      onChange={(event) =>
                        setDoctorForm((previous) => ({
                          ...previous,
                          consultationFeePaise: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              {profileRole === "PHARMACY" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      value={pharmacyForm.phone}
                      onChange={(event) =>
                        setPharmacyForm((previous) => ({ ...previous, phone: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Pharmacy Name</Label>
                    <Input
                      value={pharmacyForm.displayName}
                      onChange={(event) =>
                        setPharmacyForm((previous) => ({ ...previous, displayName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Village</Label>
                    <Input
                      value={pharmacyForm.village}
                      onChange={(event) =>
                        setPharmacyForm((previous) => ({ ...previous, village: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Registration Number</Label>
                    <Input
                      value={pharmacyForm.registrationNumber}
                      onChange={(event) =>
                        setPharmacyForm((previous) => ({
                          ...previous,
                          registrationNumber: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Registration Document URL</Label>
                    <Input
                      value={pharmacyForm.registrationDocumentUrl}
                      onChange={(event) =>
                        setPharmacyForm((previous) => ({
                          ...previous,
                          registrationDocumentUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button disabled={submitting} onClick={() => void saveProfile()}>
                Save Setup
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {profileReady && me.role === "PATIENT" ? (
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* Patient Sidebar */}
            <aside className="rounded-lg border border-border bg-card p-4 shadow-soft lg:sticky lg:top-4 lg:h-[calc(100svh-7rem)]">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  S
                </div>
                <div>
                  <div className="font-heading text-sm font-semibold">Sanjeevni</div>
                  <div className="text-xs text-muted-foreground">Patient Portal</div>
                </div>
              </div>
              <nav className="space-y-1">
                <a href="#patient-dashboard" className="flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                  <span className="text-base">📊</span> Dashboard
                </a>
                <a href="#patient-consultations" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">📅</span> Consultations
                </a>
                <a href="#patient-symptoms" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">🩺</span> Symptom Checker
                </a>
                <a href="#patient-records" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">📋</span> Health Records
                </a>
              </nav>
              <div className="mt-6 rounded-lg border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className="size-2 rounded-full bg-emerald" />
                  Offline Ready
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {recordsLastSyncedAt
                    ? `Synced ${formatDateTime(recordsLastSyncedAt)}`
                    : "Sync enabled when online"}
                </div>
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-red px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                🚨 SOS Emergency
              </button>
            </aside>

            {/* Patient Main Content */}
            <div className="space-y-5">
              {/* Greeting + Quick Actions */}
              <div id="patient-dashboard" className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Good Morning, {me.name}</h1>
                    <p className="text-sm text-muted-foreground">Your health dashboard at a glance</p>
                  </div>
                  <span className="pill-success">Offline Ready</span>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <a href="#patient-consultations" className="group rounded-lg border border-border bg-card p-4 text-center shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30">
                    <div className="mx-auto mb-2 icon-circle-blue">
                      <span className="text-lg">📅</span>
                    </div>
                    <div className="text-xs font-medium text-foreground">Book Appointment</div>
                  </a>
                  <a href="#patient-records" className="group rounded-lg border border-border bg-card p-4 text-center shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30">
                    <div className="mx-auto mb-2 icon-circle-emerald">
                      <span className="text-lg">💊</span>
                    </div>
                    <div className="text-xs font-medium text-foreground">View Prescriptions</div>
                  </a>
                  <a href="#patient-records" className="group rounded-lg border border-border bg-card p-4 text-center shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30">
                    <div className="mx-auto mb-2 icon-circle-amber">
                      <span className="text-lg">📁</span>
                    </div>
                    <div className="text-xs font-medium text-foreground">Upload Record</div>
                  </a>
                  <a href="#patient-symptoms" className="group rounded-lg border border-border bg-card p-4 text-center shadow-soft transition-all hover:shadow-soft-md hover:border-primary/30">
                    <div className="mx-auto mb-2 icon-circle-red">
                      <span className="text-lg">🩺</span>
                    </div>
                    <div className="text-xs font-medium text-foreground">Start Consultation</div>
                  </a>
                </div>

                {/* Stats Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="shadow-soft">
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="icon-circle-blue"><span className="text-lg">📅</span></div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{patientUpcomingAppointments.length}</div>
                        <div className="text-xs text-muted-foreground">Upcoming Appointments</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-soft">
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="icon-circle-emerald"><span className="text-lg">📋</span></div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{records.prescriptions.length + records.reports.length}</div>
                        <div className="text-xs text-muted-foreground">Health Records</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-soft">
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="icon-circle-amber"><span className="text-lg">💊</span></div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{trackedMedicinesCount}</div>
                        <div className="text-xs text-muted-foreground">Medicines Tracked</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-soft">
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="icon-circle-blue"><span className="text-lg">👨‍⚕️</span></div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{doctors.length}</div>
                        <div className="text-xs text-muted-foreground">Available Doctors</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Upcoming Appointments Card */}
                <Card className="shadow-soft">
                  <CardHeader>
                    <CardTitle>Upcoming Appointments</CardTitle>
                    <CardAction>
                      <a href="#patient-consultations" className="text-xs font-medium text-primary hover:underline">View all</a>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {patientUpcomingAppointments.length ? null : (
                      <p className="text-sm text-muted-foreground">No upcoming consultations scheduled.</p>
                    )}
                    {patientUpcomingAppointments.map((appointment) => (
                      <div
                        key={`overview-${appointment.id}`}
                        className="flex flex-wrap items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="icon-circle-blue"><span>👨‍⚕️</span></div>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {appointment.doctor?.user?.name ?? "Doctor pending"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(appointment.scheduledAt)}
                            </div>
                          </div>
                        </div>
                        <span className="pill-success">{appointment.status}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Health Summary */}
                <Card className="shadow-soft">
                  <CardHeader>
                    <CardTitle>Health Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">Past Consultations</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{records.consultations.length}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">Prescriptions</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{records.prescriptions.length}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">Reports Uploaded</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{records.reports.length}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

            <Card id="patient-consultations" className="shadow-soft">
              <CardHeader>
                <CardTitle>Book Consultation</CardTitle>
                <CardDescription>
                  Filter doctors by specialty or language and schedule your appointment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Specialty</Label>
                    <Input
                      placeholder="e.g. General, Cardiology"
                      value={doctorSearch.specialty}
                      onChange={(event) =>
                        setDoctorSearch((previous) => ({ ...previous, specialty: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Language</Label>
                    <Input
                      placeholder="e.g. Hindi, English"
                      value={doctorSearch.language}
                      onChange={(event) =>
                        setDoctorSearch((previous) => ({ ...previous, language: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Schedule</Label>
                    <Input
                      ref={bookingScheduleRef}
                      type="datetime-local"
                      value={booking.scheduledAt}
                      onChange={(event) =>
                        setBooking((previous) => ({ ...previous, scheduledAt: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Mode</Label>
                    <select
                      className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      value={booking.callMode}
                      onChange={(event) =>
                        setBooking((previous) => ({
                          ...previous,
                          callMode: event.target.value as "VIDEO" | "AUDIO" | "CHAT",
                        }))
                      }
                    >
                      <option value="VIDEO">Video</option>
                      <option value="AUDIO">Audio Fallback</option>
                      <option value="CHAT">Chat Fallback</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchDoctors(doctorSearch.specialty, doctorSearch.language)}
                  >
                    Search Doctors
                  </Button>
                  <Button size="sm" disabled={submitting} onClick={() => void bookAppointment()}>
                    Book Appointment
                  </Button>
                </div>
                <div className="space-y-2">
                  {doctors.length ? null : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center">
                      <div className="mx-auto mb-2 icon-circle-blue"><span>👨‍⚕️</span></div>
                      <div className="text-sm font-medium text-foreground">No doctors available yet</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        In development mode, seed a demo doctor for testing.
                      </div>
                      <div className="mt-3">
                        <Button size="sm" variant="outline" disabled={submitting} onClick={() => void seedDemoDoctor()}>
                          Seed Demo Doctor
                        </Button>
                      </div>
                    </div>
                  )}
                  {doctors.map((doctor) => (
                    <div key={doctor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-blue-light text-sm font-semibold text-primary">
                          {doctor.user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{doctor.user.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {doctor.specialty} &middot; {doctor.languages.join(", ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {currency.format((doctor.consultationFeePaise ?? 0) / 100)} &middot;{" "}
                            {doctor.availability
                              .map((slot) => `${DAY_LABELS[slot.dayOfWeek] ?? slot.dayOfWeek} ${slot.startTime}-${slot.endTime}`)
                              .join(", ") || "Slots TBD"}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={booking.doctorId === doctor.id ? "default" : "outline"}
                        onClick={() => setBooking((previous) => ({ ...previous, doctorId: doctor.id }))}
                      >
                        {booking.doctorId === doctor.id ? "Selected" : "Select"}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

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

            <Card id="patient-symptoms" className="shadow-soft">
              <CardHeader>
                <CardTitle>AI Symptom Checker</CardTitle>
                <CardDescription>
                  Triage only: no diagnosis and no medication prescription.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium">Describe Your Symptoms</Label>
                    <textarea
                      value={symptomForm.symptoms}
                      onChange={(event) =>
                        setSymptomForm((previous) => ({ ...previous, symptoms: event.target.value }))
                      }
                      placeholder="Describe symptoms, when they started, and anything unusual..."
                      className="h-24 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Age</Label>
                    <Input type="number" value={symptomForm.age} onChange={(event) => setSymptomForm((previous) => ({ ...previous, age: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Duration</Label>
                    <Input value={symptomForm.duration} onChange={(event) => setSymptomForm((previous) => ({ ...previous, duration: event.target.value }))} placeholder="e.g. 2 days" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Known Conditions</Label>
                    <Input value={symptomForm.knownConditionsCsv} onChange={(event) => setSymptomForm((previous) => ({ ...previous, knownConditionsCsv: event.target.value }))} placeholder="diabetes, asthma" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Additional Context</Label>
                    <Input value={symptomForm.additionalContext} onChange={(event) => setSymptomForm((previous) => ({ ...previous, additionalContext: event.target.value }))} placeholder="fever pattern, oxygen reading" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" disabled={submitting} onClick={() => void runSymptomChecker()}>
                    Run Triage
                  </Button>
                  <span className="text-xs text-muted-foreground">Emergency? Call local services immediately.</span>
                </div>

                {symptomTriage ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${triageLevelClassName(symptomTriage.triageLevel)}`}>
                        {symptomTriage.triageLevel}
                      </span>
                      <span className="text-xs text-muted-foreground">{triageLevelLabel(symptomTriage.triageLevel)}</span>
                    </div>
                    <div className="rounded-md bg-card px-3 py-2 text-xs text-foreground">{symptomTriage.summary}</div>
                    <div className="rounded-md bg-card px-3 py-2 text-xs text-foreground">{symptomTriage.explanation}</div>
                    <div className="rounded-md border border-border border-dashed px-3 py-2 text-xs text-foreground">{symptomTriage.recommendedAction}</div>
                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{symptomTriage.disclaimer}</div>

                    <div className="flex flex-wrap gap-2">
                      {symptomTriage.triageLevel === "RED" ? (
                        <Button size="sm" variant="destructive" onClick={callEmergencyServices}>
                          CALL {EMERGENCY_CALL_NUMBER}
                        </Button>
                      ) : null}
                      {symptomTriage.triageLevel === "YELLOW" ? (
                        <Button size="sm" onClick={focusDoctorBooking}>
                          Talk to Doctor Now
                        </Button>
                      ) : null}
                      {symptomTriage.triageLevel === "GREEN" ? (
                        <Button size="sm" onClick={focusDoctorBooking}>
                          Schedule Appointment
                        </Button>
                      ) : null}
                      {symptomTriage.triageLevel === "BLUE" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => toast.info("Monitor symptoms and seek care if they worsen.")}>
                            Monitor Symptoms
                          </Button>
                          <Button size="sm" onClick={focusDoctorBooking}>
                            Chat with Doctor
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {symptomHistory.length ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saved Checks</div>
                    {symptomHistory.map((entry) => (
                      <button
                        key={`${entry.id ?? entry.createdAt}`}
                        type="button"
                        className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                        onClick={() => setSymptomTriage(entry.response)}
                      >
                        <div className="font-medium text-foreground">
                          {entry.response.triageLevel} &middot; {triageLevelLabel(entry.response.triageLevel)}
                        </div>
                        <div className="text-muted-foreground">{formatDateTime(entry.createdAt)} &middot; {entry.symptoms.slice(0, 80)}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card id="patient-upcoming" className="shadow-soft">
              <CardHeader>
                <CardTitle>All Appointments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {appointments.length ? null : (
                  <p className="text-sm text-muted-foreground">No appointments scheduled yet.</p>
                )}
                {appointments.map((appointment) => (
                  <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="icon-circle-blue"><span>👨‍⚕️</span></div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{appointment.doctor?.user?.name ?? "Doctor pending"}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(appointment.scheduledAt)} &middot; {appointment.callMode}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={appointment.status === "IN_PROGRESS" ? "pill-danger" : appointment.status === "COMPLETED" ? "pill-success" : appointment.status === "BOOKED" ? "pill-info" : "pill-warning"}>
                        {appointment.status}
                      </span>
                      {appointment.status === "IN_PROGRESS" ? (
                        <a href={`/dashboard/call/${appointment.callRoomId}`}>
                          <Button size="xs" variant="emerald">Join</Button>
                        </a>
                      ) : null}
                      {appointment.status === "BOOKED" ? (
                        <Button size="xs" variant="outline" onClick={() => void markAppointmentStatus(appointment.id, "CANCELLED")}>Cancel</Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card id="patient-records" className="shadow-soft">
              <CardHeader>
                <CardTitle>Digital Prescriptions</CardTitle>
                <CardDescription>
                  Your prescription records with QR codes for pharmacy fulfillment.
                  {recordsLastSyncedAt ? ` Synced: ${formatDateTime(recordsLastSyncedAt)}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {records.prescriptions.length ? null : (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <div className="mx-auto mb-2 icon-circle-emerald"><span>💊</span></div>
                    <p className="text-sm text-muted-foreground">No prescriptions yet.</p>
                  </div>
                )}
                {records.prescriptions.map((prescription) => (
                  <div key={prescription.id} className="rounded-lg border border-border p-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="pill-info">{prescription.diagnosis}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="text-muted-foreground">Dr. {prescription.doctor.user.name} &middot; {formatDateTime(prescription.createdAt)}</div>
                          <div className="text-foreground">
                            {prescription.items.map((item) => `${item.medicineName} (${item.dosage}, x${item.quantity})`).join(", ")}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="xs" variant="outline" onClick={() => void checkAvailabilityByQr(prescription.qrToken, prescription.id)}>
                            Check Availability
                          </Button>
                          <a
                            href={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(`SANJEEVNI_RX:${prescription.qrToken}`)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button size="xs" variant="outline">Open QR</Button>
                          </a>
                        </div>
                      </div>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`SANJEEVNI_RX:${prescription.qrToken}`)}`}
                        alt="Prescription QR"
                        className="size-[120px] rounded-lg border border-border"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            </div>
          </div>
        ) : null}

        {profileReady && me.role === "DOCTOR" ? (
          <div className="flex h-[50vh] w-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm font-medium text-muted-foreground">Opening Doctor Workspace...</p>
            </div>
          </div>
        ) : null}

        {profileReady && me.role === "DOCTOR" && false ? (
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* Doctor Sidebar */}
            <aside className="rounded-lg border border-border bg-card p-4 shadow-soft lg:sticky lg:top-4 lg:h-[calc(100svh-7rem)]">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  S
                </div>
                <div>
                  <div className="font-heading text-sm font-semibold">Sanjeevni</div>
                  <div className="text-xs text-muted-foreground">Doctor Portal</div>
                </div>
              </div>
              <nav className="space-y-1">
                <a href="#doctor-dashboard" className="flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                  <span className="text-base">📊</span> Dashboard
                </a>
                <a href="#doctor-queue" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">📅</span> Appointments
                </a>
                <a href="#doctor-rx" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">💊</span> Rx Creator
                </a>
                <a href="#doctor-history" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">💬</span> History
                </a>
                <a href="#doctor-settings" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="text-base">⚙️</span> Settings
                </a>
              </nav>
              
              <div className="mt-6 rounded-lg border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className={`size-2 rounded-full ${doctorLiveAppointment ? "bg-red animate-pulse" : "bg-emerald"}`} />
                  {doctorLiveAppointment ? "Live Session Active" : "Available"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {doctorLiveAppointment ? "Join the room to consult." : "Waiting for patients..."}
                </div>
              </div>
            </aside>

            {/* Doctor Main Content */}
            <div className="space-y-4">
              {/* Dashboard Header */}
              <div id="doctor-dashboard" className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">Doctor Dashboard</h1>
                  <p className="text-xs text-muted-foreground">Manage consultations & patients.</p>
                </div>
                {doctorLiveAppointment ? (
                  <span className="pill-danger flex items-center gap-1.5 animate-pulse">
                    <span className="size-1.5 rounded-full bg-red-600" /> Live
                  </span>
                ) : (
                  <span className="pill-success text-xs">Ready</span>
                )}
              </div>

              {/* Compact Stat Cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-emerald-light text-emerald-700">
                      <span className="text-lg">🟢</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{doctorLiveAppointment ? "1" : "0"}</div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Active</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-blue-light text-primary">
                      <span className="text-lg">📅</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{doctorBookedAppointments.length}</div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Today</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-amber-light text-amber-700">
                      <span className="text-lg">👥</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{appointments.length}</div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Patients</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-red-light text-red-700">
                      <span className="text-lg">💊</span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-foreground">{doctorClosedAppointments.filter((a) => !a.prescription).length}</div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pending Rx</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Live Session Banner */}
              {doctorLiveAppointment ? (
                <div id="doctor-live" className="rounded-lg border border-red/30 bg-red-light p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="icon-circle-red"><span className="text-lg">📹</span></div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          Live with {doctorLiveAppointment!.patient?.user?.name ?? "Patient"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(doctorLiveAppointment!.scheduledAt)} &middot; {doctorLiveAppointment!.callMode}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={doctorLiveAppointment!.consultationUi ?? `/dashboard/call/${doctorLiveAppointment!.callRoomId}`}
                        target={doctorLiveAppointment!.consultationUi ? "_blank" : undefined}
                        rel={doctorLiveAppointment!.consultationUi ? "noreferrer" : undefined}
                      >
                        <Button size="sm" variant="outline">Open Room</Button>
                      </a>
                      <Button size="sm" variant="destructive" onClick={() => void finishDoctorConsultation(doctorLiveAppointment!)}>
                        End Call
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Booked Queue */}
              <Card id="doctor-queue" className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Queue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3">
                  {doctorBookedAppointments.length ? null : (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
                      <p className="text-xs text-muted-foreground">No appointments in queue.</p>
                    </div>
                  )}
                  {doctorBookedAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="group flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card p-2.5 transition-all hover:border-primary/20 hover:bg-muted/40 hover:shadow-sm"
                      onClick={() => setSelectedAppointment(appointment)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-blue-light text-xs font-bold text-primary">
                          {(appointment.patient?.user?.name ?? "P").charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground group-hover:text-primary">
                            {appointment.patient?.user?.name ?? "Unknown"}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{toLocalDateTimeValue(appointment.scheduledAt).split("T")[1]}</span>
                            <span>&middot;</span>
                            <span>{appointment.callMode}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="emerald"
                          className="h-7 px-2 text-[10px]"
                          disabled={Boolean(doctorLiveAppointment && doctorLiveAppointment?.id !== appointment.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            void startDoctorConsultation(appointment);
                          }}
                        >
                          Start
                        </Button>
                        <span className="text-muted-foreground">›</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Consultation History */}
              <Card id="doctor-history" className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3">
                  {doctorClosedAppointments.length ? null : (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
                      <p className="text-xs text-muted-foreground">No history yet.</p>
                    </div>
                  )}
                  {doctorClosedAppointments.map((appointment) => (
                    <div
                      key={`closed-${appointment.id}`}
                      className="group flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card p-2.5 transition-all hover:border-primary/20 hover:bg-muted/40 hover:shadow-sm"
                      onClick={() => setSelectedAppointment(appointment)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                          {(appointment.patient?.user?.name ?? "P").charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground group-hover:text-primary">
                            {appointment.patient?.user?.name ?? "Unknown"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatDateTime(appointment.scheduledAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`pill-xs ${appointment.status === "COMPLETED" ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"} px-2 py-0.5 rounded text-[10px] font-medium`}>
                          {appointment.status}
                        </span>
                        <span className="text-muted-foreground">›</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Prescription Creator */}
              <Card id="doctor-rx" className="shadow-soft">
                <CardHeader>
                  <CardTitle>Prescription Creator</CardTitle>
                  <CardDescription>Generate a digital prescription with QR code for the patient.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Appointment ID</Label>
                      <Input value={rxAppointmentId} onChange={(event) => setRxAppointmentId(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Follow-up Date</Label>
                      <Input type="datetime-local" value={rxForm.followUpDate} onChange={(event) => setRxForm((previous) => ({ ...previous, followUpDate: event.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Symptoms</Label>
                    <Input value={rxForm.symptoms} onChange={(event) => setRxForm((previous) => ({ ...previous, symptoms: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Diagnosis</Label>
                    <Input value={rxForm.diagnosis} onChange={(event) => setRxForm((previous) => ({ ...previous, diagnosis: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Notes</Label>
                    <Input value={rxForm.notes} onChange={(event) => setRxForm((previous) => ({ ...previous, notes: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Medicines</Label>
                      <Button size="xs" variant="outline" onClick={() => setRxForm((previous) => ({ ...previous, items: [...previous.items, { medicineName: "", dosage: "", frequency: "", durationDays: 5, quantity: 10, instructions: "" }] }))}>
                        + Add Line
                      </Button>
                    </div>
                    {rxForm.items.map((item, index) => (
                      <div key={`rx-item-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3 lg:grid-cols-6">
                        <Input placeholder="Medicine" value={item.medicineName} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], medicineName: event.target.value }; return { ...previous, items: next }; })} />
                        <Input placeholder="Dosage" value={item.dosage} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], dosage: event.target.value }; return { ...previous, items: next }; })} />
                        <Input placeholder="Frequency" value={item.frequency} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], frequency: event.target.value }; return { ...previous, items: next }; })} />
                        <Input type="number" placeholder="Days" value={String(item.durationDays)} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], durationDays: Number(event.target.value || "0") }; return { ...previous, items: next }; })} />
                        <Input type="number" placeholder="Qty" value={String(item.quantity)} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], quantity: Number(event.target.value || "0") }; return { ...previous, items: next }; })} />
                        <Input placeholder="Instructions" value={item.instructions} onChange={(event) => setRxForm((previous) => { const next = [...previous.items]; next[index] = { ...next[index], instructions: event.target.value }; return { ...previous, items: next }; })} />
                      </div>
                    ))}
                  </div>
                  <Button size="sm" disabled={submitting} onClick={() => void generatePrescription()}>
                    Generate Prescription + QR
                  </Button>
                  {generatedPrescription ? (
                    <div className="grid gap-4 rounded-lg border border-emerald/30 bg-emerald-light p-4 md:grid-cols-[1fr_auto]">
                      <div className="space-y-1 text-sm">
                        <div className="font-medium text-foreground">Prescription Generated</div>
                        <div className="text-xs text-muted-foreground">ID: {generatedPrescription!.id}</div>
                        <div className="text-xs text-muted-foreground">Token: {generatedPrescription!.qrToken}</div>
                        <div className="text-xs"><code className="rounded bg-muted px-1 py-0.5">{generatedPrescription!.qrValue}</code></div>
                      </div>
                      <img src={generatedPrescription!.qrImageUrl} alt="Generated prescription QR" className="size-[120px] rounded-lg border border-border" />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Availability Settings */}
              <Card id="doctor-settings" className="shadow-soft">
                <CardHeader>
                  <CardTitle>Availability Settings</CardTitle>
                  <CardDescription>Configure your consultation slots and emergency priority.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={emergencyPriority} onChange={(event) => setEmergencyPriority(event.target.checked)} className="size-4 rounded border-border" />
                    <span className="font-medium text-foreground">Enable emergency priority</span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Day</Label>
                      <select className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" value={slotDraft.dayOfWeek} onChange={(event) => setSlotDraft((previous) => ({ ...previous, dayOfWeek: Number(event.target.value) }))}>
                        {DAY_LABELS.map((day, index) => (<option key={day} value={index}>{day}</option>))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Start</Label>
                      <Input type="time" value={slotDraft.startTime} onChange={(event) => setSlotDraft((previous) => ({ ...previous, startTime: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">End</Label>
                      <Input type="time" value={slotDraft.endTime} onChange={(event) => setSlotDraft((previous) => ({ ...previous, endTime: event.target.value }))} />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" variant="outline" onClick={() => setSlots((previous) => [...previous, { dayOfWeek: slotDraft.dayOfWeek, startTime: slotDraft.startTime, endTime: slotDraft.endTime, isActive: true }])}>
                        Add Slot
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {slots.length ? null : (<p className="text-sm text-muted-foreground">No slots configured.</p>)}
                    {slots.map((slot, index) => (
                      <div key={`slot-${index}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="icon-circle-blue text-xs"><span>📅</span></span>
                          <span className="text-sm font-medium text-foreground">{DAY_LABELS[slot.dayOfWeek]} {slot.startTime} - {slot.endTime}</span>
                        </div>
                        <Button size="xs" variant="outline" onClick={() => setSlots((previous) => previous.filter((_, item) => item !== index))}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" disabled={submitting} onClick={() => void saveDoctorSettings()}>
                    Save Availability
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Appointment Detail Sidebar (Slide-over) */}
            {selectedAppointment ? (
              <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm transition-all" onClick={() => setSelectedAppointment(null)}>
                <div 
                  className="h-full w-full max-w-md animate-in slide-in-from-right-10 bg-background shadow-2xl ring-1 ring-border/10 sm:w-[400px]" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex h-full flex-col">
                    {/* Sidebar Header */}
                    <div className="flex items-center justify-between border-b border-border p-4">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Appointment Details</h2>
                        <p className="text-xs text-muted-foreground">ID: {selectedAppointment!.id}</p>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => setSelectedAppointment(null)}>
                        ✕
                      </Button>
                    </div>

                    {/* Sidebar Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                      {/* Patient Info */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</h3>
                        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                            {(selectedAppointment!.patient?.user?.name ?? "P").charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{selectedAppointment!.patient?.user?.name ?? "Unknown Patient"}</div>
                            <div className="text-xs text-muted-foreground">Online Consultation</div>
                          </div>
                        </div>
                      </div>

                      {/* Session Info */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session Info</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Scheduled For</div>
                            <div className="mt-1 text-sm font-medium">{formatDateTime(selectedAppointment!.scheduledAt)}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Mode</div>
                            <div className="mt-1 text-sm font-medium">{selectedAppointment!.callMode}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="text-xs text-muted-foreground">Status</div>
                            <div className="mt-1">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                selectedAppointment!.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : 
                                selectedAppointment!.status === "BOOKED" ? "bg-blue-100 text-blue-800" : 
                                "bg-zinc-100 text-zinc-800"
                              }`}>
                                {selectedAppointment!.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</h3>
                        <div className="grid gap-2">
                          {selectedAppointment!.status === "BOOKED" || selectedAppointment!.status === "IN_PROGRESS" ? (
                            <Button 
                              className="w-full justify-start" 
                              variant="emerald"
                              disabled={Boolean(doctorLiveAppointment && doctorLiveAppointment?.id !== selectedAppointment!.id)}
                              onClick={() => {
                                void startDoctorConsultation(selectedAppointment!);
                                setSelectedAppointment(null);
                              }}
                            >
                              <span className="mr-2">📹</span> Start / Join Session
                            </Button>
                          ) : null}
                          
                          <Button 
                            className="w-full justify-start" 
                            variant="outline"
                            onClick={() => {
                              setRxAppointmentId(selectedAppointment!.id);
                              setRxForm((previous) => ({ ...previous, followUpDate: toLocalDateTimeValue(selectedAppointment!.scheduledAt) }));
                              setSelectedAppointment(null);
                              document.getElementById("doctor-rx")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            <span className="mr-2">💊</span> {selectedAppointment!.prescription ? "Update Prescription" : "Write Prescription"}
                          </Button>

                          {selectedAppointment!.status === "BOOKED" ? (
                            <Button 
                              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" 
                              variant="ghost"
                              onClick={() => {
                                void markAppointmentStatus(selectedAppointment!.id, "NO_SHOW");
                                setSelectedAppointment(null);
                              }}
                            >
                              <span className="mr-2">🚫</span> Mark as No Show
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {/* Prescription Preview */}
                      {selectedAppointment!.prescription ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                            <span>✅</span> Prescription Issued
                          </div>
                          <div className="mt-1 text-xs text-emerald-700">
                            Prescription ID: {selectedAppointment!.prescription!.id}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-4 text-center">
                          <div className="text-sm text-muted-foreground">No prescription issued yet.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {profileReady && me.role === "PHARMACY" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pharmacy Dashboard</h1>
                <p className="text-sm text-muted-foreground">Simple stock and reservation management.</p>
              </div>
            </div>

            <Card>
              <CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Pending Reservations</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{pendingReservationsCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Completed Orders</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {reservations.filter((reservation) => reservation.status === "FULFILLED").length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">In Stock Items</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{pharmacyInStockCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Reservations</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{reservations.length}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prescription Orders</CardTitle>
                <CardDescription>Incoming reservation requests from patients.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {reservations.length ? null : <p className="text-sm text-muted-foreground">No reservation requests yet.</p>}
                {reservations.map((reservation) => (
                  <div key={reservation.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{reservation.patient.user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {reservation.prescription.items.map((item) => `${item.medicineName} x${item.quantity}`).join(", ")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(reservation.requestedAt)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          reservation.status === "FULFILLED" || reservation.status === "ACCEPTED"
                            ? "pill-success"
                            : reservation.status === "PENDING"
                              ? "pill-warning"
                              : reservation.status === "REJECTED"
                                ? "pill-danger"
                                : "pill-info"
                        }
                      >
                        {reservation.status}
                      </span>
                      {reservation.status === "PENDING" ? (
                        <>
                          <Button size="xs" variant="outline" onClick={() => void updateReservation(reservation.id, "ACCEPTED")}>
                            Accept
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => void updateReservation(reservation.id, "REJECTED")}>
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {reservation.status === "ACCEPTED" ? (
                        <Button size="xs" onClick={() => void updateReservation(reservation.id, "FULFILLED")}>
                          Fulfill
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Medicine Name</Label>
                    <Input value={inventoryForm.name} onChange={(event) => setInventoryForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Brand</Label>
                    <Input value={inventoryForm.brand} onChange={(event) => setInventoryForm((previous) => ({ ...previous, brand: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Price (paise)</Label>
                    <Input type="number" value={inventoryForm.pricePaise} onChange={(event) => setInventoryForm((previous) => ({ ...previous, pricePaise: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Quantity</Label>
                    <Input type="number" value={inventoryForm.quantity} onChange={(event) => setInventoryForm((previous) => ({ ...previous, quantity: event.target.value }))} />
                  </div>
                </div>
                <Button size="sm" disabled={submitting} onClick={() => void addInventoryItem()}>
                  Add / Update Item
                </Button>
                <div className="space-y-2">
                  {inventory.length ? null : <p className="text-sm text-muted-foreground">No inventory entries.</p>}
                  {inventory.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {item.medicine.name}
                          {item.medicine.brand ? ` (${item.medicine.brand})` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {currency.format(item.pricePaise / 100)} · Qty: {item.quantity}
                        </div>
                      </div>
                      <span className={item.inStock && item.quantity > 0 ? "pill-success" : "pill-danger"}>
                        {item.inStock && item.quantity > 0 ? "In Stock" : "Out of Stock"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prescription Scanner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={scannerValue}
                    onChange={(event) => setScannerValue(event.target.value)}
                    placeholder="SANJEEVNI_RX:xxxxxxxx"
                    className="w-full sm:max-w-md"
                  />
                  <Button size="sm" onClick={() => void checkAvailabilityByQr(scannerValue)}>
                    Scan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {profileReady && me.role === "ADMIN" ? (
          <div id="admin-dashboard" className="space-y-5">
            {/* Admin Header */}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Control Center</h1>
              <p className="text-sm text-muted-foreground">Platform analytics, approvals, and audit trail.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="pill-warning">Pending Approvals: {analytics.pendingApprovals}</span>
                <span className={analytics.sosAlerts24h > 0 ? "pill-danger" : "pill-success"}>
                  SOS (24h): {analytics.sosAlerts24h}
                </span>
              </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-soft">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Total Doctors</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{analytics.doctors}</div>
                    </div>
                    <div className="icon-circle-blue"><span className="text-lg">👨‍⚕️</span></div>
                  </div>
                  {/* Mini bar chart */}
                  <div className="mt-3 flex items-end gap-1">
                    {[40, 65, 45, 80, 55, 70, 90].map((h, i) => (
                      <div key={`doc-${i}`} className="flex-1 rounded-sm bg-primary/20" style={{ height: `${h * 0.3}px` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-soft">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Total Patients</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{analytics.patients}</div>
                    </div>
                    <div className="icon-circle-emerald"><span className="text-lg">👥</span></div>
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    {[30, 50, 70, 60, 85, 75, 95].map((h, i) => (
                      <div key={`pat-${i}`} className="flex-1 rounded-sm bg-emerald/20" style={{ height: `${h * 0.3}px` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-soft">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Total Prescriptions</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{analytics.prescriptions}</div>
                    </div>
                    <div className="icon-circle-amber"><span className="text-lg">💊</span></div>
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    {[55, 40, 70, 85, 60, 50, 75].map((h, i) => (
                      <div key={`rx-${i}`} className="flex-1 rounded-sm bg-amber/20" style={{ height: `${h * 0.3}px` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-soft">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Active Consultations</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{analytics.consultations}</div>
                    </div>
                    <div className="icon-circle-red"><span className="text-lg">📹</span></div>
                  </div>
                  {/* Mini line chart approximation */}
                  <div className="mt-3">
                    <svg viewBox="0 0 100 30" className="h-6 w-full" preserveAspectRatio="none">
                      <polyline fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points="0,25 15,18 30,22 45,10 60,15 75,8 100,12" />
                      <polyline fill="url(#adminGrad)" stroke="none" points="0,25 15,18 30,22 45,10 60,15 75,8 100,12 100,30 0,30" />
                      <defs>
                        <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--red)" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-soft border-red/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Emergency SOS Feed
                  <span className="pill-danger">{emergencyAlerts.length}</span>
                </CardTitle>
                <CardDescription>Live RED alerts from triage checks and manual SOS requests.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {emergencyAlerts.length ? null : (
                  <p className="text-sm text-muted-foreground">No active SOS alerts right now.</p>
                )}
                {emergencyAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-red/30 bg-red-light/30 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{alert.actor.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {alert.actor.email} {alert.actor.phone ? `· ${alert.actor.phone}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="pill-danger">{alert.triageLevel}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(alert.createdAt)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-foreground">{alert.summary}</div>
                    {alert.explanation ? (
                      <div className="mt-1 text-xs text-muted-foreground">{alert.explanation}</div>
                    ) : null}
                    {alert.symptoms ? (
                      <div className="mt-2 rounded-md border border-red/20 bg-card px-2 py-1 text-xs text-foreground">
                        Symptoms: {alert.symptoms}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={!alert.actor.phone}
                        onClick={() => callAlertPatient(alert.actor.phone)}
                      >
                        {alert.actor.phone ? "Call Patient" : "No Phone"}
                      </Button>
                      <a href={`mailto:${alert.actor.email}`}>
                        <Button size="xs" variant="outline">Email Patient</Button>
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Pending Approvals */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
                <CardDescription>Review and approve new doctors, pharmacies, and users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingUsers.length ? null : (
                  <p className="text-sm text-muted-foreground">No pending approvals.</p>
                )}
                {pendingUsers.map((user) => (
                  <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="pill-info">{user.role}</span>
                          {user.doctor ? <span className="text-xs text-muted-foreground">{user.doctor.specialty}</span> : null}
                          {user.pharmacy ? <span className="text-xs text-muted-foreground">{user.pharmacy.displayName}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="xs" variant="emerald" onClick={() => void updateUserApproval(user.id, "APPROVED")}>Approve</Button>
                      <Button size="xs" variant="outline" onClick={() => void updateUserApproval(user.id, "REJECTED")}>Reject</Button>
                      <Button size="xs" variant="outline" onClick={() => void updateUserApproval(user.id, "SUSPENDED")}>Suspend</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Audit Logs */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>System-wide activity log for compliance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {auditLogs.length ? null : (
                  <p className="text-sm text-muted-foreground">No logs available.</p>
                )}
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/30">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {log.actor.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium text-foreground">{log.actor.name}</span>
                        <span className="text-muted-foreground"> {log.action}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.entityType} &middot; {formatDateTime(log.createdAt)}
                      </div>
                    </div>
                    <span className="pill-info shrink-0">{log.actor.role}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {availability ? (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Medicine Availability</CardTitle>
              <CardDescription>Stock availability across nearby pharmacies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {availability.rows.length ? null : (
                <p className="text-sm text-muted-foreground">No pharmacy match found for this prescription.</p>
              )}
              {availability.rows.map((row) => (
                <div key={row.pharmacyId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="icon-circle-blue"><span>🏥</span></div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{row.pharmacyName} {row.village ? `(${row.village})` : ""}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Total: {currency.format((row.totalPricePaise ?? 0) / 100)}</span>
                          <span className={row.canFulfillAll ? "pill-success" : "pill-warning"}>
                            {row.canFulfillAll ? "Can Fulfill All" : "Partial Only"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {me.role === "PATIENT" ? (
                      <Button size="sm" disabled={!row.canFulfillAll} onClick={() => void reserveMedicines(row.pharmacyId)}>
                        Reserve
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1 sm:pl-12">
                    {row.items.map((item) => (
                      <div key={`${row.pharmacyId}-${item.medicineName}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                        <span className="font-medium text-foreground">{item.medicineName}</span>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className="text-muted-foreground">Need: {item.requiredQuantity} / Avail: {item.availableQuantity}</span>
                          <span className={item.inStock ? "pill-success" : "pill-danger"}>
                            {item.inStock ? "In Stock" : "Out"}
                          </span>
                          {item.pricePaise !== null ? <span className="text-muted-foreground">{currency.format(item.pricePaise / 100)}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
