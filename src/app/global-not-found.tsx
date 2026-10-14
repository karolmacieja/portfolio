import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = { title: "404" };

// Routing-level 404 for URLs that match no route on any host. Rendered outside every layout,
// so it has no access to the request locale; kept bilingual and minimal.
export default function GlobalNotFound() {
  return (
    <html lang="pl">
      <body className="flex min-h-dvh items-center justify-center px-6 text-center">
        <main className="grid gap-2">
          <h1 className="text-4xl font-bold">404</h1>
          <p className="text-muted-foreground">Nie znaleziono strony · Page not found</p>
        </main>
      </body>
    </html>
  );
}
