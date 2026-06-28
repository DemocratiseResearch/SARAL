import { request } from "./client";

export interface UserKeys {
  gemini_key_set: boolean;
  gemini_key_preview: string;
  sarvam_key_set: boolean;
  sarvam_key_preview: string;
}

export async function getUserKeys(): Promise<UserKeys> {
  return request<UserKeys>("/api/user/keys");
}

export async function putUserKeys(body: {
  gemini_key?: string;
  sarvam_key?: string;
}): Promise<UserKeys> {
  return request<UserKeys>("/api/user/keys", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
