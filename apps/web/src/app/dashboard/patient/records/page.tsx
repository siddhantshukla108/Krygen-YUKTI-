import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PatientPortal from "@/components/patient-portal";
import { authClient } from "@/lib/auth-client";

export default async function PatientRecordsPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <PatientPortal userId={session.user.id} section="records" />;
}
