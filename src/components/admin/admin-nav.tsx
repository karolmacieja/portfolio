"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type AdminNavLink = { href: string; label: string };
export type AdminNavEntry = AdminNavLink | { key: string; label: string; items: AdminNavLink[] };

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass = (active: boolean) =>
  cn(
    "rounded-md px-2 py-1 hover:bg-muted",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

/** Admin header navigation: top-level links and dropdown groups (one open at a time). */
export function AdminNav({ entries, label }: { entries: AdminNavEntry[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState(pathname);
  const ref = useRef<HTMLElement>(null);

  // Close the open group after navigating.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav ref={ref} aria-label={label} className="flex flex-wrap items-center gap-1 text-sm font-medium">
      {entries.map((entry) => {
        if ("href" in entry) {
          return (
            <Link key={entry.href} href={entry.href} className={linkClass(isActive(pathname, entry.href))}>
              {entry.label}
            </Link>
          );
        }
        const expanded = open === entry.key;
        const active = entry.items.some((item) => isActive(pathname, item.href));
        return (
          <div key={entry.key} className="relative">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`admin-nav-${entry.key}`}
              onClick={() => setOpen(expanded ? null : entry.key)}
              className={cn(linkClass(active), "inline-flex items-center gap-1")}
            >
              {entry.label}
              <ChevronDown
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </button>
            {expanded && (
              <ul
                id={`admin-nav-${entry.key}`}
                className="absolute top-full left-0 z-50 mt-1 min-w-44 rounded-md border bg-background p-1 shadow-md"
              >
                {entry.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={cn(linkClass(isActive(pathname, item.href)), "block")}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
