import { AuthShell } from "@/components/auth/auth-shell";

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
