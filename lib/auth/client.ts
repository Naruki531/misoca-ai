// lib/auth/client.ts
import { auth } from "@/lib/firebase/client";

export async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return await user.getIdToken();
}
