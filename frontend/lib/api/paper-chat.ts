import type {
  ChatSession,
  ChatMessage,
  ChatResponse,
} from "../types";
import { request } from "./client";

/**
 * Sends a question about the paper and returns the assistant's grounded answer.
 */
export async function sendChatMessage(
  paperId: string,
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  return request<ChatResponse>(`/api/paper/${paperId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
}

/**
 * Retrieves all chat sessions for the given paper.
 */
export async function getChatSessions(
  paperId: string,
): Promise<ChatSession[]> {
  return request<ChatSession[]>(`/api/paper/${paperId}/chat/sessions`);
}

/**
 * Retrieves the message history for a specific chat session.
 */
export async function getChatMessages(
  paperId: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  return request<ChatMessage[]>(
    `/api/paper/${paperId}/chat/sessions/${sessionId}/messages`,
  );
}
