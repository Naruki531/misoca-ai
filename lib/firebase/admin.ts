// lib/firebase/admin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function required(name: string, v?: string) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const projectId = required("FIREBASE_ADMIN_PROJECT_ID", process.env.FIREBASE_ADMIN_PROJECT_ID);
const clientEmail = required("FIREBASE_ADMIN_CLIENT_EMAIL", process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
const privateKey = required("FIREBASE_ADMIN_PRIVATE_KEY", process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, "\n");

export const adminApp =
  getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
