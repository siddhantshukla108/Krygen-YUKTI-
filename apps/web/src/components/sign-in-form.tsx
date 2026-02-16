import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { env } from "@my-better-t-app/env/web";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const BOOTSTRAP_ADMIN_EMAIL = "admin@admin.com";
const BOOTSTRAP_ADMIN_PASSWORD = "admin123";

function isBootstrapAdminCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && password === BOOTSTRAP_ADMIN_PASSWORD;
}

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      const password = value.password;
      const bootstrapAdmin = isBootstrapAdminCredentials(email, password);

      const promoteBootstrapAdmin = async () => {
        const session = await authClient.getSession();
        const sessionUserId = session.data?.user?.id;
        if (!sessionUserId) {
          throw new Error("Unable to read session for admin setup");
        }

        const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/mvp/admin/bootstrap-access`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": sessionUserId,
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to activate admin access");
        }
      };

      if (!bootstrapAdmin) {
        await authClient.signIn.email(
          {
            email,
            password,
          },
          {
            onSuccess: () => {
              router.push("/dashboard");
              toast.success("Sign in successful");
            },
            onError: (error) => {
              toast.error(error.error.message || error.error.statusText);
            },
          },
        );
        return;
      }

      let signedIn = false;
      await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess: async () => {
            signedIn = true;
          },
          onError: () => {},
        },
      );

      if (!signedIn) {
        await authClient.signUp.email(
          {
            name: "Admin",
            email,
            password,
          },
          {
            onSuccess: () => {
              signedIn = true;
            },
            onError: (error) => {
              toast.error(error.error.message || error.error.statusText);
            },
          },
        );
      }

      if (!signedIn) {
        return;
      }

      try {
        await promoteBootstrapAdmin();
        router.push("/dashboard#admin-dashboard");
        toast.success("Admin sign in successful");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to activate admin access");
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-md px-4 py-4 sm:mt-10 sm:p-6">
      <h1 className="mb-6 text-center text-2xl font-bold sm:text-3xl">Welcome Back</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
