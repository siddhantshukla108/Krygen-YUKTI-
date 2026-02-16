"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { mvpApi } from "@/lib/mvp-api";
import { EMERGENCY_CALL_NUMBER } from "@/lib/triage";

const NAV_ITEMS = [
  { href: "/dashboard/patient", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/patient/personal-info", label: "Personal Info", icon: "👤" },
  { href: "/dashboard/patient/prescriptions", label: "Prescriptions", icon: "💊" },
  { href: "/dashboard/patient/consultations", label: "Consultations", icon: "📅" },
  { href: "/dashboard/patient/symptom-checker", label: "Symptom Checker", icon: "🩺" },
  { href: "/dashboard/patient/records", label: "Health Records", icon: "📋" },
];

type SosEmergencyType =
  | "CHEST_PAIN"
  | "BREATHING_DIFFICULTY"
  | "SEVERE_BLEEDING"
  | "STROKE_SYMPTOMS"
  | "ALLERGIC_REACTION"
  | "UNCONSCIOUSNESS"
  | "MENTAL_HEALTH_CRISIS"
  | "ACCIDENT_INJURY"
  | "OTHER";

const SOS_EMERGENCY_OPTIONS: Array<{
  value: SosEmergencyType;
  label: string;
}> = [
  { value: "BREATHING_DIFFICULTY", label: "Difficulty breathing" },
  { value: "CHEST_PAIN", label: "Chest pain or pressure" },
  { value: "SEVERE_BLEEDING", label: "Severe bleeding" },
  { value: "STROKE_SYMPTOMS", label: "Stroke-like symptoms" },
  { value: "ALLERGIC_REACTION", label: "Severe allergic reaction" },
  { value: "UNCONSCIOUSNESS", label: "Loss of consciousness" },
  { value: "MENTAL_HEALTH_CRISIS", label: "Mental health crisis" },
  { value: "ACCIDENT_INJURY", label: "Accident or injury" },
  { value: "OTHER", label: "Other emergency" },
];

export default function PatientShell({
  children,
  userId,
  userName,
}: {
  children: React.ReactNode;
  userId: string;
  userName: string;
}) {
  const pathname = usePathname();
  const shortName = userName.split(" ")[0] ?? userName;
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosEmergencyType, setSosEmergencyType] = useState<SosEmergencyType>("BREATHING_DIFFICULTY");
  const [sosDetails, setSosDetails] = useState("");
  const [sendingSosAlert, setSendingSosAlert] = useState(false);

  const openEmergencyDialer = () => {
    window.location.href = `tel:${EMERGENCY_CALL_NUMBER}`;
  };

  const triggerSosAlert = async () => {
    setSendingSosAlert(true);
    try {
      await mvpApi.post<{ ok: boolean }>("/patients/me/sos-alert", userId, {
        emergencyType: sosEmergencyType,
        details: sosDetails.trim() || undefined,
      });
      toast.success("SOS alert sent to admin. Calling emergency services now.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${error.message}. Calling emergency services now.`
          : "SOS alert could not sync. Calling emergency services now.",
      );
    } finally {
      setSendingSosAlert(false);
      setShowSosModal(false);
      setSosDetails("");
      openEmergencyDialer();
    }
  };

  return (
    <>
      {showSosModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border-2 border-border bg-card p-4 shadow-[8px_8px_0px_0px_var(--shadow)]">
            <div className="text-lg font-black text-foreground">SOS Emergency</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Select emergency type, then send alert and call {EMERGENCY_CALL_NUMBER}.
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Emergency Type
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={sosEmergencyType}
                  onChange={(event) => setSosEmergencyType(event.target.value as SosEmergencyType)}
                >
                  {SOS_EMERGENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Extra Details (optional)
                </label>
                <textarea
                  value={sosDetails}
                  onChange={(event) => setSosDetails(event.target.value)}
                  className="h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Example: patient fainted near home, heavy bleeding, severe chest pressure..."
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={sendingSosAlert}
                onClick={() => setShowSosModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={sendingSosAlert}
                onClick={() => void triggerSosAlert()}
              >
                {sendingSosAlert ? "Sending..." : `Send SOS & Call ${EMERGENCY_CALL_NUMBER}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[calc(100svh-52px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r-2 border-border bg-card p-6 lg:sticky lg:top-0 lg:block lg:h-[calc(100svh-52px)]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-lg border-2 border-border bg-primary text-xl font-black text-primary-foreground shadow-[2px_2px_0px_0px_var(--shadow)]">
              S
            </div>
            <div>
              <div className="font-heading text-lg font-bold text-foreground leading-none">Sanjeevni</div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Patient Portal</div>
            </div>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-sm font-bold transition-all ${
                    active
                      ? "border-border bg-primary text-black shadow-[4px_4px_0px_0px_var(--shadow)] translate-x-[-2px] translate-y-[-2px]"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-8 rounded-lg border-2 border-border bg-emerald-light p-4 shadow-[4px_4px_0px_0px_var(--shadow)]">
            <div className="flex items-center gap-2 text-sm font-bold text-black">
              <span className="size-3 rounded-full bg-emerald border border-border" />
              Offline Ready
            </div>
            <div className="mt-1 text-xs font-medium text-black">Data syncs when online</div>
          </div>

          <Button
            className="mt-4 w-full bg-red text-white border-2 border-border shadow-[4px_4px_0px_0px_var(--shadow)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow)]"
            onClick={() => setShowSosModal(true)}
          >
            🚨 SOS Emergency
          </Button>
        </aside>

        <main className="w-full overflow-x-hidden bg-background">
          <div className="border-b-2 border-border bg-card px-4 py-3 lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-primary text-sm font-black text-primary-foreground shadow-[2px_2px_0px_0px_var(--shadow)]">
                  S
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-foreground">Patient Portal</div>
                  <div className="truncate text-xs font-medium text-muted-foreground">{shortName}</div>
                </div>
              </div>
              <Button
                size="xs"
                className="border-2 border-border bg-red text-white"
                onClick={() => setShowSosModal(true)}
              >
                SOS
              </Button>
            </div>
            <div className="mt-3 overflow-x-auto pb-1">
              <nav className="flex w-max gap-2">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <a
                      key={`mobile-${item.href}`}
                      href={item.href}
                      className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition-all ${
                        active
                          ? "border-border bg-primary text-black shadow-[3px_3px_0px_0px_var(--shadow)]"
                          : "border-transparent bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-border bg-emerald-light px-2.5 py-1 text-xs font-bold text-black shadow-[2px_2px_0px_0px_var(--shadow)]">
              <span className="size-2 rounded-full bg-emerald border border-border" />
              Offline Ready
            </div>
          </div>

          <div className="hidden items-center justify-between border-b-2 border-border bg-card px-6 py-4 lg:flex">
            <div className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Patient Workspace</div>
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-primary text-xs font-bold text-primary-foreground">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-bold text-foreground">{userName}</span>
            </div>
          </div>
          <div className="w-full px-4 py-4 sm:px-5 sm:py-5 lg:px-10 lg:py-6">{children}</div>
        </main>
      </div>
    </>
  );
}
