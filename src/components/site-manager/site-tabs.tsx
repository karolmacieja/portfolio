"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function SiteTabs({ base, tabs }: { base: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const href = `${base}${tab.href}`;
        // usePathname returns the internal (rewritten) path; compare by suffix.
        const active = tab.href === "" ? pathname.endsWith(base) : pathname.endsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
