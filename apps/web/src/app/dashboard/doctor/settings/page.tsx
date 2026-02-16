import { headers } from "next/headers";
import { redirect } from "next/navigation";

import DoctorPortal from "@/components/doctor-portal";
import { authClient } from "@/lib/auth-client";

export default async function DoctorSettingsPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <DoctorPortal userId={session.user.id} section="settings" />;
}
