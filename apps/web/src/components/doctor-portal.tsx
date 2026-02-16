"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mvpApi } from "@/lib/mvp-api";

type DoctorSection = "overview" | "appointments" | "prescriptions" | "history" | "settings";

type MeUser = {
  id: string;
  name: string;
  email: string;
  role: "PATIENT" | "DOCTOR" | "PHARMACY" | "ADMIN";
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

type AvailabilitySlotDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function DoctorPortal({ userId, section }: { userId: string; section: DoctorSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [me, setMe] = useState<MeUser | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [rxAppointmentId, setRxAppointmentId] = useState(searchParams?.get("appointmentId") ?? "");
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

  // Derived state
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

  const fetchAppointments = useCallback(async () => {
    const response = await mvpApi.get<{ appointments: Appointment[] }>("/appointments/me", userId);
    setAppointments(response.appointments);
  }, [userId]);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = await mvpApi.get<{ user: MeUser }>("/me", userId);
      setMe(meResponse.user);

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
      await fetchAppointments();
    } catch (error) {
      toast.error("Unable to load doctor profile");
    } finally {
      setLoading(false);
    }
  }, [userId, fetchAppointments]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchAppointments();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAppointments]);

  useEffect(() => {
    if (rxAppointmentId && appointments.length) {
      const appointment = appointments.find((a) => a.id === rxAppointmentId);
      if (appointment) {
        setRxForm((prev) => ({
          ...prev,
          followUpDate: prev.followUpDate || toLocalDateTimeValue(appointment.scheduledAt),
        }));
      }
    }
  }, [rxAppointmentId, appointments]);

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
      toast.error("Unable to update appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const startDoctorConsultation = async (appointment: Appointment) => {
    if (doctorLiveAppointment && doctorLiveAppointment.id !== appointment.id) {
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
      toast.error("Unable to generate prescription");
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
      toast.error("Unable to save settings");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full"/></div>;
  }

  return (
    <div className="space-y-6">
      {/* Live Session Banner (Always visible if live) */}
      {doctorLiveAppointment ? (
        <div id="doctor-live" className="rounded-xl border-2 border-black bg-red-light p-4 shadow-[4px_4px_0px_0px_var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="icon-circle-red"><span className="text-lg">📹</span></div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  Live with {doctorLiveAppointment.patient?.user?.name ?? "Patient"}
                </div>
                <div className="text-xs font-medium text-black/70">
                  {formatDateTime(doctorLiveAppointment.scheduledAt)} &middot; {doctorLiveAppointment.callMode}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={doctorLiveAppointment.consultationUi ?? `/dashboard/call/${doctorLiveAppointment.callRoomId}`}
                target={doctorLiveAppointment.consultationUi ? "_blank" : undefined}
                rel={doctorLiveAppointment.consultationUi ? "noreferrer" : undefined}
              >
                <Button size="sm" variant="outline">Open Room</Button>
              </a>
              <Button size="sm" variant="destructive" onClick={() => void finishDoctorConsultation(doctorLiveAppointment)}>
                End Call
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {section === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="shadow-soft">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="icon-circle-emerald"><span className="text-lg">🟢</span></div>
                <div>
                  <div className="text-2xl font-black text-foreground">{doctorLiveAppointment ? "1" : "0"}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Active</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="icon-circle-blue"><span className="text-lg">📅</span></div>
                <div>
                  <div className="text-2xl font-black text-foreground">{doctorBookedAppointments.length}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Today</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="icon-circle-amber"><span className="text-lg">👥</span></div>
                <div>
                  <div className="text-2xl font-black text-foreground">{appointments.length}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Patients</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="icon-circle-red"><span className="text-lg">💊</span></div>
                <div>
                  <div className="text-2xl font-black text-foreground">{doctorClosedAppointments.filter((a) => !a.prescription).length}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Pending Rx</div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Also show queue in overview for quick access */}
          <Card id="doctor-queue">
            <CardHeader>
              <CardTitle>Appointment Queue</CardTitle>
              <CardDescription>Start consultations when ready.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {doctorBookedAppointments.length ? null : (
                <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">No booked consultations.</div>
              )}
              {doctorBookedAppointments.slice(0, 5).map((appointment) => (
                <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3 transition-colors hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-blue-light text-sm font-bold text-primary">
                      {(appointment.patient?.user?.name ?? "P").charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-foreground">{appointment.patient?.user?.name ?? "Unknown"}</div>
                      <div className="text-xs font-medium text-muted-foreground">{formatDateTime(appointment.scheduledAt)} &middot; {appointment.callMode}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="emerald" onClick={() => void startDoctorConsultation(appointment)}>Start</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {section === "appointments" && (
        <Card id="doctor-queue">
          <CardHeader>
            <CardTitle>Full Appointment Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doctorBookedAppointments.map((appointment) => (
              <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-blue-light text-sm font-bold text-primary">
                    {(appointment.patient?.user?.name ?? "P").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-foreground">{appointment.patient?.user?.name ?? "Unknown"}</div>
                    <div className="text-xs font-medium text-muted-foreground">{formatDateTime(appointment.scheduledAt)} &middot; {appointment.callMode}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="emerald" onClick={() => void startDoctorConsultation(appointment)}>Go Live</Button>
                  <Button size="sm" variant="outline" onClick={() => void markAppointmentStatus(appointment.id, "NO_SHOW")}>No Show</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {section === "history" && (
        <Card id="doctor-history">
          <CardHeader>
            <CardTitle>Consultation History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doctorClosedAppointments.map((appointment) => (
              <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full border-2 border-border bg-muted text-sm font-bold text-muted-foreground">
                    {(appointment.patient?.user?.name ?? "P").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-foreground">{appointment.patient?.user?.name ?? "Unknown"}</div>
                    <div className="text-xs font-medium text-muted-foreground">{formatDateTime(appointment.scheduledAt)}</div>
                    <div className="text-xs font-bold text-emerald">{appointment.prescription ? "Rx Sent" : "Rx Pending"}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/doctor/prescriptions?appointmentId=${appointment.id}`)}>
                  {appointment.prescription ? "View Rx" : "Write Rx"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {section === "prescriptions" && (
        <Card id="doctor-rx">
          <CardHeader>
            <CardTitle>Prescription Creator</CardTitle>
            <CardDescription>Generate digital Rx for patients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Appointment ID</Label>
                <Input value={rxAppointmentId} onChange={(e) => setRxAppointmentId(e.target.value)} placeholder="Paste ID from History/Queue" />
              </div>
              <div className="space-y-2">
                <Label>Follow-up Date</Label>
                <Input type="datetime-local" value={rxForm.followUpDate} onChange={(e) => setRxForm((p) => ({ ...p, followUpDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Symptoms</Label>
              <Input value={rxForm.symptoms} onChange={(e) => setRxForm((p) => ({ ...p, symptoms: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis</Label>
              <Input value={rxForm.diagnosis} onChange={(e) => setRxForm((p) => ({ ...p, diagnosis: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Medicines</Label>
                <Button size="xs" variant="outline" onClick={() => setRxForm((p) => ({ ...p, items: [...p.items, { medicineName: "", dosage: "", frequency: "", durationDays: 5, quantity: 10, instructions: "" }] }))}>+ Add</Button>
              </div>
              {rxForm.items.map((item, index) => (
                <div key={index} className="grid gap-2 p-3 border-2 border-border rounded-lg md:grid-cols-6">
                  <Input placeholder="Med Name" value={item.medicineName} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], medicineName: e.target.value }; return { ...p, items: n }; })} />
                  <Input placeholder="Dosage" value={item.dosage} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], dosage: e.target.value }; return { ...p, items: n }; })} />
                  <Input placeholder="Freq" value={item.frequency} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], frequency: e.target.value }; return { ...p, items: n }; })} />
                  <Input type="number" placeholder="Days" value={String(item.durationDays)} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], durationDays: Number(e.target.value) }; return { ...p, items: n }; })} />
                  <Input type="number" placeholder="Qty" value={String(item.quantity)} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], quantity: Number(e.target.value) }; return { ...p, items: n }; })} />
                  <Input placeholder="Instructions" value={item.instructions} onChange={(e) => setRxForm((p) => { const n = [...p.items]; n[index] = { ...n[index], instructions: e.target.value }; return { ...p, items: n }; })} />
                </div>
              ))}
            </div>
            <Button disabled={submitting} onClick={() => void generatePrescription()}>Generate Rx</Button>
            
            {generatedPrescription && (
              <div className="p-4 border-2 border-emerald rounded-lg bg-emerald-light">
                <div className="font-bold text-emerald-900">Rx Generated!</div>
                <div className="break-all text-xs font-mono">{generatedPrescription.qrToken}</div>
                <img src={generatedPrescription.qrImageUrl} alt="QR" className="mt-2 size-28 border-2 border-border sm:size-32" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {section === "settings" && (
        <Card id="doctor-settings">
          <CardHeader>
            <CardTitle>Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" checked={emergencyPriority} onChange={(e) => setEmergencyPriority(e.target.checked)} className="size-5 border-2 border-black rounded" />
              Emergency Priority
            </label>
            <div className="grid gap-2 md:grid-cols-4 items-end">
              <div className="space-y-1">
                <Label>Day</Label>
                <select className="h-10 w-full border-2 border-border rounded-lg px-3 bg-card" value={slotDraft.dayOfWeek} onChange={(e) => setSlotDraft((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}>
                  {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="time" value={slotDraft.startTime} onChange={(e) => setSlotDraft((p) => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="time" value={slotDraft.endTime} onChange={(e) => setSlotDraft((p) => ({ ...p, endTime: e.target.value }))} />
              </div>
              <Button onClick={() => setSlots((p) => [...p, { ...slotDraft, isActive: true }])}>Add Slot</Button>
            </div>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border p-3">
                  <div className="font-medium">{DAY_LABELS[s.dayOfWeek]} {s.startTime} - {s.endTime}</div>
                  <Button size="xs" variant="outline" onClick={() => setSlots((p) => p.filter((_, idx) => idx !== i))}>Remove</Button>
                </div>
              ))}
            </div>
            <Button disabled={submitting} onClick={() => void saveDoctorSettings()}>Save Changes</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
