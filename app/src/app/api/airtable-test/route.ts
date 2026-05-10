import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return NextResponse.json({
      ok: false,
      error: "Missing env vars",
      AIRTABLE_API_KEY: !!apiKey,
      AIRTABLE_BASE_ID: !!baseId,
    });
  }

  // Try to write a test row
  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/Questions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          Timestamp: new Date().toISOString(),
          Question: "[TEST] Airtable connection check",
          Mode: "test",
          Answer: "This is an automated connectivity test.",
          "Citation Count": 0,
          Citations: "",
          "Citation IDs": "",
          Scores: "",
          "Latency (ms)": 0,
          Model: "test",
        },
      }),
    });

    const body = await res.json();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      airtableResponse: body,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
