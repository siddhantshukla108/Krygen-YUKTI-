import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PatientShell from "@/components/patient-shell";
import { authClient } from "@/lib/auth-client";

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <PatientShell userId={session.user.id} userName={session.user.name}>
      {children}
    </PatientShell>
  );
}
