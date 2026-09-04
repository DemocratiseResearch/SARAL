import type { StateCreator } from "zustand";
import {
  sendChatMessage,
  getChatSessions,
  getChatMessages,
} from "../../api";
import type { ArtifactStore } from "../artifact-store-types";
import type { ChatSession, ChatMessage } from "../../types";

export type PaperChatSlice = {
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;

  sendChatMessage: (paperId: string, message: string) => Promise<void>;
  loadChatSessions: (paperId: string) => Promise<void>;
  selectChatSession: (paperId: string, sessionId: string) => Promise<void>;
  startNewChatSession: () => void;
  clearChatError: () => void;
};

export const createPaperChatSlice: StateCreator<
  ArtifactStore,
  [],
  [],
  PaperChatSlice
> = (set, get) => ({
  chatSessions: [],
  activeChatSessionId: null,
  chatMessages: [],
  chatLoading: false,
  chatError: null,

  clearChatError: () => set({ chatError: null }),

  startNewChatSession: () =>
    set({
      activeChatSessionId: null,
      chatMessages: [],
      chatError: null,
    }),

  loadChatSessions: async (paperId: string) => {
    if (!paperId) return;
    try {
      const sessions = await getChatSessions(paperId);
      set({ chatSessions: sessions });
      // If no active session, auto-select the most recent one if available
      if (!get().activeChatSessionId && sessions.length > 0) {
        const latest = sessions[0];
        set({ activeChatSessionId: latest.id });
        const messages = await getChatMessages(paperId, latest.id);
        set({ chatMessages: messages });
      }
    } catch (err) {
      console.warn("loadChatSessions error:", err);
    }
  },

  selectChatSession: async (paperId: string, sessionId: string) => {
    set({
      activeChatSessionId: sessionId,
      chatLoading: true,
      chatError: null,
    });
    try {
      const messages = await getChatMessages(paperId, sessionId);
      set({ chatMessages: messages, chatLoading: false });
    } catch (err) {
      set({
        chatError:
          err instanceof Error ? err.message : "Failed to load messages",
        chatLoading: false,
      });
    }
  },

  sendChatMessage: async (paperId: string, message: string) => {
    const trimmed = message.trim();
    if (!trimmed || !paperId) return;

    const currentSessionId = get().activeChatSessionId ?? undefined;

    // Optimistically add the user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSessionId || "",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    set({
      chatMessages: [...get().chatMessages, tempUserMsg],
      chatLoading: true,
      chatError: null,
    });

    try {
      const resp = await sendChatMessage(paperId, trimmed, currentSessionId);
      const isNewSession = !currentSessionId || currentSessionId !== resp.session_id;

      set((state) => {
        const withoutTemp = state.chatMessages.filter(
          (m) => m.id !== tempUserMsg.id,
        );
        const serverUserMsg: ChatMessage = {
          ...tempUserMsg,
          session_id: resp.session_id,
        };
        return {
          activeChatSessionId: resp.session_id,
          chatMessages: [...withoutTemp, serverUserMsg, resp.message],
          chatLoading: false,
        };
      });

      if (isNewSession) {
        void get().loadChatSessions(paperId);
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to get answer from paper";
      set({
        chatLoading: false,
        chatError: errMsg,
        chatMessages: get().chatMessages.filter((m) => m.id !== tempUserMsg.id),
      });
    }
  },
});
