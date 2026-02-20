// lib/auth/server.ts
import { adminAuth } from "@/lib/firebase/admin";

export async function verifyBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) throw new Error("Missing Bearer token");
  const decoded = await adminAuth.verifyIdToken(m[1]);
  return decoded; // { uid, ... }
}
