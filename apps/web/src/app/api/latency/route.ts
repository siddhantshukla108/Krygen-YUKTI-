import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noContentProbeResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export function HEAD() {
  return noContentProbeResponse();
}

export function GET() {
  return noContentProbeResponse();
}
