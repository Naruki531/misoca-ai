import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const userDoc = (uid: string) => doc(db, "users", uid);
export const clientsCol = (uid: string) => collection(db, "users", uid, "clients");
export const issuersCol = (uid: string) => collection(db, "users", uid, "issuers");
export const banksCol = (uid: string) => collection(db, "users", uid, "bankAccounts");
export const draftsCol = (uid: string) => collection(db, "users", uid, "drafts");
