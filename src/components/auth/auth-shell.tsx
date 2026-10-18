import { platformUrl } from "@/lib/env";

import { BrandMark } from "@/components/branding/brand-mark";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="grid w-full max-w-sm gap-6">
        <BrandMark href={platformUrl(undefined, "/")} className="justify-center" />
        {children}
      </div>
    </main>
  );
}
