import { headers } from "next/headers";
import { redirect } from "next/navigation";

import DoctorShell from "@/components/doctor-shell";
import { authClient } from "@/lib/auth-client";

export default async function DoctorLayout({
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

  return <DoctorShell userId={session.user.id} userName={session.user.name}>{children}</DoctorShell>;
}
