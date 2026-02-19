import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  return NextResponse.json({
    ok: true,
    hasKey: !!apiKey,
    apiKeyHead: apiKey.slice(0, 6),
    apiKeyLen: apiKey.length,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  });
}
