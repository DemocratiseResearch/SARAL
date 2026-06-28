import type { ApiEnvelope } from "../types";
import { BASE_URL, request } from "./client";

export async function login(token: string) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const envelope: ApiEnvelope<{ access_token: string }> = await res.json();
  if (!envelope.success || !envelope.data) {
    throw new Error(envelope.error?.message ?? "Login failed");
  }
  return envelope.data;
}

export async function logout() {
  await request<{ message: string }>("/auth/logout", { method: "POST" });
}
