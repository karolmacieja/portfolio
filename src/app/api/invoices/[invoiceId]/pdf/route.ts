import { NextResponse } from "next/server";

import { isStaff } from "@/server/auth/roles";
import { getCurrentUser } from "@/server/auth/session";
import { getInvoicePdf } from "@/server/invoicing/client";
import { pdfFilename } from "@/server/invoicing/service";

/** Invoice PDF download: the owner (app host) or staff (admin host session). */
export async function GET(_request: Request, { params }: RouteContext<"/api/invoices/[invoiceId]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { invoiceId } = await params;
  const pdf = await getInvoicePdf(invoiceId, { userId: user.id, asStaff: isStaff(user.role) });
  if (!pdf) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(pdf.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
