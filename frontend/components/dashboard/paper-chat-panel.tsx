"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  User,
  Send,
  Sparkles,
  Plus,
  History,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArtifactStore } from "@/lib/artifact-store";
import { usePaperStore } from "@/lib/paper-store";
import { cn } from "@/lib/utils";

interface PaperChatPanelProps {
  paperId: string;
}

const SUGGESTED_QUESTIONS = [
  "What is the main contribution of this research?",
  "What methodology and datasets were used in this work?",
  "What are the key results, benchmarks, or quantitative findings?",
  "What limitations or future directions did the authors discuss?",
];

export default function PaperChatPanel({ paperId }: PaperChatPanelProps) {
  const {
    chatSessions,
    activeChatSessionId,
    chatMessages,
    chatLoading,
    chatError,
    sendChatMessage,
    loadChatSessions,
    selectChatSession,
    startNewChatSession,
    clearChatError,
  } = useArtifactStore();

  const { metadata } = usePaperStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat sessions when paperId is available
  useEffect(() => {
    if (paperId) {
      void loadChatSessions(paperId);
    }
  }, [paperId, loadChatSessions]);

  // Scroll to bottom when new messages arrive or loading begins
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const handleSend = async (messageToSend?: string) => {
    const text = (messageToSend ?? input).trim();
    if (!text || chatLoading) return;

    setInput("");
    await sendChatMessage(paperId, text);
    // Focus back on textarea after sending
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const currentSession = chatSessions.find((s) => s.id === activeChatSessionId);

  return (
    <div className="isolate min-w-0 overflow-hidden rounded-[20px] border border-border bg-card dark:bg-carddarkbg shadow-sm ring-1 ring-border">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pill-border/80 px-4 py-3 sm:px-6 bg-linen/50 dark:bg-carddarkbg/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-saral-forest/15 text-saral-forest dark:bg-saral-forest/25 dark:text-white">
            <Bot className="size-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-[15px] font-semibold text-ink dark:text-white truncate">
                Chat with Paper
              </h3>
              <Badge
                variant="outline"
                className="hidden sm:inline-flex text-[11px] font-medium border-pill-border bg-pill-bg text-ink-muted dark:bg-saral-dark dark:text-white/70"
              >
                Grounded Q&A
              </Badge>
            </div>
            <p className="text-[12px] text-ink-muted dark:text-white/60 truncate">
              {currentSession ? currentSession.title : metadata.title || "Ask questions about the extracted paper text"}
            </p>
          </div>
        </div>

        {/* Action buttons: Session switcher & New Chat */}
        <div className="flex items-center gap-2">
          {chatSessions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full border-pill-border bg-linen dark:bg-saral-dark text-[12px] font-medium text-ink dark:text-white hover:bg-saral-forest/10 hover:border-saral-forest/30"
                >
                  <History className="size-3.5 text-ink-muted dark:text-white/70" />
                  <span>History ({chatSessions.length})</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 max-h-72 overflow-y-auto rounded-xl border-pill-border bg-linen dark:bg-saral-dark p-1 shadow-lg"
              >
                {chatSessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    onClick={() => selectChatSession(paperId, session.id)}
                    className={cn(
                      "cursor-pointer rounded-lg px-3 py-2 text-[13px] text-ink dark:text-white hover:bg-saral-forest/10 dark:hover:bg-saral-forest/20",
                      session.id === activeChatSessionId &&
                        "bg-saral-forest/15 font-semibold text-saral-forest dark:text-white",
                    )}
                  >
                    <span className="truncate">{session.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startNewChatSession}
            className="h-8 gap-1.5 rounded-full border-pill-border bg-linen dark:bg-saral-dark text-[12px] font-medium text-ink dark:text-white hover:bg-saral-forest/10 hover:border-saral-forest/30"
          >
            <Plus className="size-3.5" />
            <span>New Chat</span>
          </Button>
        </div>
      </div>

      {/* Message scroll container */}
      <div className="flex flex-col min-h-[380px] max-h-[560px] overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {chatMessages.length === 0 ? (
          /* Empty State */
          <div className="my-auto flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-saral-forest/10 text-saral-forest dark:bg-saral-forest/20 dark:text-white">
              <Sparkles className="size-6" strokeWidth={1.8} />
            </div>
            <h4 className="font-serif text-[20px] font-bold text-ink dark:text-white mb-2">
              Ask anything about this research
            </h4>
            <p className="max-w-md text-[13px] sm:text-[14px] leading-relaxed text-ink-muted dark:text-white/70 mb-6">
              Answers are strictly grounded in the extracted paper text. If a detail isn&rsquo;t in the paper, SARAL will clearly let you know.
            </p>

            {/* Suggestion Chips */}
            <div className="grid w-full max-w-xl grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <Button
                  key={idx}
                  type="button"
                  variant="outline"
                  onClick={() => void handleSend(q)}
                  disabled={chatLoading}
                  className="h-auto whitespace-normal rounded-xl border-pill-border bg-linen/60 dark:bg-carddarkbg/80 p-3 text-left font-sans text-[13px] font-normal leading-snug text-ink dark:text-white shadow-none transition-colors hover:border-saral-forest/35 hover:bg-saral-forest/10 dark:hover:bg-saral-forest/20"
                >
                  <span className="line-clamp-2">{q}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation stream */
          chatMessages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]",
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none",
                    isUser
                      ? "bg-saral-forest text-white"
                      : "bg-saral-gold/20 text-saral-gold dark:bg-saral-gold/30 dark:text-white",
                  )}
                >
                  {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>

                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                    isUser
                      ? "rounded-tr-none bg-saral-forest/15 dark:bg-saral-forest/25 text-ink dark:text-white border border-saral-forest/20"
                      : "rounded-tl-none bg-muted/40 dark:bg-carddarkbg/90 text-ink dark:text-white/95 border border-pill-border/60 shadow-xs whitespace-pre-wrap",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}

        {/* Thinking / Loading indicator */}
        {chatLoading && (
          <div className="flex items-start gap-2.5 mr-auto max-w-[85%] animate-fade-in">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-saral-gold/20 text-saral-gold dark:bg-saral-gold/30 dark:text-white">
              <Bot className="size-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-none bg-muted/40 dark:bg-carddarkbg/90 border border-pill-border/60 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2 text-[13px] text-ink-muted dark:text-white/70">
                <Loader2 className="size-3.5 animate-spin text-saral-forest" />
                <span>Searching paper text and drafting grounded answer...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {chatError && (
          <div className="mx-auto my-2 flex max-w-lg items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="size-4 shrink-0" />
              <span className="truncate">{chatError}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearChatError}
              className="h-7 px-2 text-[12px] hover:bg-destructive/20 text-destructive"
            >
              Dismiss
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input composition area */}
      <div className="border-t border-pill-border/80 bg-linen/30 dark:bg-carddarkbg/40 p-3 sm:p-4">
        <div className="relative flex items-end gap-2 rounded-xl border border-pill-border bg-white dark:bg-saral-dark p-1.5 focus-within:border-saral-forest/40 focus-within:ring-2 focus-within:ring-saral-forest/15 transition-all">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the paper (Press Enter to send, Shift+Enter for new line)..."
            disabled={chatLoading}
            rows={1}
            className="min-h-[44px] max-h-32 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 font-sans text-[14px] text-ink dark:text-white placeholder:text-ink-muted/70 dark:placeholder:text-white/40 focus-visible:ring-0 shadow-none"
          />

          <Button
            type="button"
            size="icon"
            onClick={() => void handleSend()}
            disabled={!input.trim() || chatLoading}
            className="size-9 shrink-0 rounded-lg bg-saral-forest text-white shadow-sm hover:bg-saral-forest/90 disabled:opacity-30 transition-opacity"
            aria-label="Send message"
          >
            {chatLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-ink-muted/70 dark:text-white/40">
          <span>Grounded in extracted paper text</span>
          <span>Shift + Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
