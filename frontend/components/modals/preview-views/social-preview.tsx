"use client";

import { useState, useEffect } from "react";
import { Check, Copy, Download, Share2, Edit2, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Artifact } from "@/lib/artifact-store";
import { LinkedInIcon, XIcon2 } from "@/components/icons/preview-modal-icons";

interface SocialPreviewProps {
  artifact: Artifact;
  socialDraftTab: "linkedin" | "twitter";
  onSocialDraftTabChange: (tab: "linkedin" | "twitter") => void;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
  onShareLinkedIn?: () => void;
}

export function SocialPreview({
  artifact,
  socialDraftTab,
  onSocialDraftTabChange,
  copiedKey,
  copyToClipboard,
  onShareLinkedIn,
}: SocialPreviewProps) {
  const [editMode, setEditMode] = useState<"linkedin" | "twitter" | null>(null);
  const [editedLinkedInCaption, setEditedLinkedInCaption] = useState(
    artifact.linkedInDraft?.caption || "",
  );
  const [editedLinkedInTitle, setEditedLinkedInTitle] = useState(
    artifact.linkedInDraft?.title || "",
  );
  const [editedTweets, setEditedTweets] = useState(
    artifact.twitterDraft?.thread.tweets || [],
  );
  const [editingTweetIndex, setEditingTweetIndex] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const handleSaveLinkedIn = () => {
    if (artifact.linkedInDraft) {
      artifact.linkedInDraft.caption = editedLinkedInCaption;
      artifact.linkedInDraft.title = editedLinkedInTitle;
    }
    setEditMode(null);
  };

  const handleSaveTweets = () => {
    if (artifact.twitterDraft) {
      artifact.twitterDraft.thread.tweets = editedTweets;
    }
    setEditingTweetIndex(null);
    setEditMode(null);
  };

  const handleCancelEdit = () => {
    setEditedLinkedInCaption(artifact.linkedInDraft?.caption || "");
    setEditedLinkedInTitle(artifact.linkedInDraft?.title || "");
    setEditedTweets(artifact.twitterDraft?.thread.tweets || []);
    setEditingTweetIndex(null);
    setEditMode(null);
  };

  return (
    <>
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <XIcon size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Expanded image"
            className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="mx-7 my-6 max-sm:mx-5 max-sm:my-4">
      <Tabs
        value={socialDraftTab}
        onValueChange={(v) => onSocialDraftTabChange(v as "linkedin" | "twitter")}
      >
        <TabsList className="mb-5 w-full h-10 bg-linen dark:bg-white/[0.04] border border-pill-border dark:border-darkcardborder rounded-xl p-1">
          <TabsTrigger
            value="linkedin"
            className="flex-1 gap-2 rounded-lg text-[13px] font-semibold"
          >
            <LinkedInIcon className="text-[#0A66C2] w-[14px] h-[14px]" />
            LinkedIn
          </TabsTrigger>
          <TabsTrigger
            value="twitter"
            className="flex-1 gap-2 rounded-lg text-[13px] font-semibold"
          >
            <XIcon2 />X / Twitter
          </TabsTrigger>
        </TabsList>

        {/* ── LinkedIn tab ── */}
        <TabsContent value="linkedin">
          {artifact.linkedInDraft ? (
            <div className="max-h-[62vh] overflow-y-auto rounded-xl border-l-[3px] border border-pill-border dark:border-darkcardborder border-l-[#0A66C2] bg-white dark:bg-carddarkbg shadow-sm">
              {/* Header row */}
              <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-pill-border dark:border-darkcardborder">
                <div className="flex items-center gap-2">
                  <LinkedInIcon className="text-[#0A66C2] w-[15px] h-[15px]" />
                  <span className="font-sans text-[11px] font-semibold text-[#0A66C2] tracking-widest uppercase">
                    LinkedIn Post
                  </span>
                </div>
                {editMode !== "linkedin" && (
                  <div className="flex items-center gap-0.5">
                    {onShareLinkedIn && (
                      <button
                        onClick={onShareLinkedIn}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-ink-muted dark:text-white/60 hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
                      >
                        <Share2 size={12} />
                        Share
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditMode("linkedin");
                        setEditedLinkedInCaption(artifact.linkedInDraft?.caption || "");
                        setEditedLinkedInTitle(artifact.linkedInDraft?.title || "");
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-ink-muted dark:text-white/60 hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
                    >
                      <Edit2 size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => copyToClipboard(artifact.linkedInDraft!.caption, "li-caption")}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-ink-muted dark:text-white/60 hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
                    >
                      {copiedKey === "li-caption" ? (
                        <><Check size={12} className="text-green-500" /><span className="text-green-600 dark:text-green-400">Copied</span></>
                      ) : (
                        <><Copy size={12} />Copy</>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-5">
                {editMode !== "linkedin" ? (
                  <>
                    {artifact.linkedInDraft.title && (
                      <p className="font-sans text-[15px] font-semibold text-ink dark:text-white mb-3 leading-snug">
                        {artifact.linkedInDraft.title}
                      </p>
                    )}
                    <p className="font-sans text-[14px] text-ink dark:text-white leading-relaxed whitespace-pre-wrap">
                      {artifact.linkedInDraft.caption}
                    </p>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="font-sans text-[11px] font-semibold text-ink-muted dark:text-white/60 uppercase tracking-widest block mb-1.5">
                        Title
                      </label>
                      <Textarea
                        value={editedLinkedInTitle}
                        onChange={(e) => setEditedLinkedInTitle(e.target.value)}
                        className="font-sans text-[14px]"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="font-sans text-[11px] font-semibold text-ink-muted dark:text-white/60 uppercase tracking-widest block mb-1.5">
                        Caption
                      </label>
                      <Textarea
                        value={editedLinkedInCaption}
                        onChange={(e) => setEditedLinkedInCaption(e.target.value)}
                        className="font-sans text-[14px]"
                        rows={6}
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="border-pill-border dark:border-darkcardborder text-ink-muted dark:text-white/70"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="bg-saral-forest hover:bg-[#3d4b45] text-white"
                        onClick={handleSaveLinkedIn}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="font-sans text-[14px] text-ink-faint text-center py-10">
              LinkedIn draft not available
            </p>
          )}
        </TabsContent>

        {/* ── X / Twitter tab ── */}
        <TabsContent value="twitter">
          {artifact.twitterDraft ? (
            <Tabs defaultValue="thread">
              <TabsList variant="line" className="mb-5 w-full justify-start border-b border-pill-border dark:border-darkcardborder">
                <TabsTrigger value="thread" className="text-[13px] font-semibold px-3 pb-2.5">Thread</TabsTrigger>
                {artifact.twitterDraft.images.length > 0 && (
                  <TabsTrigger value="images" className="text-[13px] font-semibold px-3 pb-2.5">Images</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="thread">
                <div className="max-h-[55vh] overflow-y-auto pr-0.5">
                  {(editMode === "twitter" ? editedTweets : artifact.twitterDraft.thread.tweets).map((tweet, i) => {
                    const total = artifact.twitterDraft!.thread.tweet_count;
                    const isLast = i === total - 1;
                    return (
                      <div key={i} className="flex gap-3">
                        {/* Thread spine */}
                        <div className="flex flex-col items-center pt-3.5 shrink-0">
                          <div className="w-6 h-6 rounded-full bg-ink dark:bg-white/15 flex items-center justify-center z-10">
                            <span className="font-sans text-[10px] font-bold text-white dark:text-white/90">
                              {i + 1}
                            </span>
                          </div>
                          {!isLast && (
                            <div className="w-px flex-1 min-h-4 bg-pill-border dark:bg-darkcardborder mt-1 mb-0" />
                          )}
                        </div>

                        {/* Tweet card */}
                        <div className="flex-1 rounded-xl border border-pill-border dark:border-darkcardborder bg-white dark:bg-carddarkbg shadow-sm mb-2.5 overflow-hidden">
                          {editMode === "twitter" && editingTweetIndex === i ? (
                            <div className="p-3 space-y-2">
                              <Textarea
                                value={editedTweets[i]}
                                onChange={(e) => {
                                  const updated = [...editedTweets];
                                  updated[i] = e.target.value;
                                  setEditedTweets(updated);
                                }}
                                className="font-sans text-[14px]"
                                rows={4}
                              />
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setEditingTweetIndex(null); setEditMode(null); handleCancelEdit(); }}
                                  className="h-7 text-ink-muted dark:text-white/70"
                                >
                                  <XIcon size={13} />
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-saral-forest hover:bg-[#3d4b45] text-white h-7"
                                  onClick={handleSaveTweets}
                                >
                                  Done
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="px-3 pt-2.5 pb-2 flex items-center justify-between border-b border-pill-border dark:border-darkcardborder">
                                <span className="font-sans text-[10px] font-semibold text-ink-faint dark:text-white/30 tracking-widest uppercase">
                                  {i + 1}&thinsp;/&thinsp;{total}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => copyToClipboard(tweet, `tweet-${i}`)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-ink-muted dark:text-white/50 hover:text-ink dark:hover:text-white hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
                                  >
                                    {copiedKey === `tweet-${i}` ? (
                                      <><Check size={11} className="text-green-500" /><span className="text-green-600 dark:text-green-400">Copied</span></>
                                    ) : (
                                      <><Copy size={11} />Copy</>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditMode("twitter");
                                      setEditingTweetIndex(i);
                                      setEditedTweets(artifact.twitterDraft?.thread.tweets || []);
                                    }}
                                    title="Edit tweet"
                                    className="p-1.5 rounded-md text-ink-muted dark:text-white/50 hover:text-ink dark:hover:text-white hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                </div>
                              </div>
                              <p className="px-3 py-2.5 font-sans text-[14px] text-ink dark:text-white leading-relaxed whitespace-pre-wrap">
                                {tweet}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              {artifact.twitterDraft.images.length > 0 && (
                <TabsContent value="images">
                  <div className="grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
                    {artifact.twitterDraft.images.map((img) => (
                      <div
                        key={img.index}
                        className="relative rounded-lg overflow-hidden border border-pill-border dark:border-darkcardborder aspect-video bg-linen dark:bg-saral-dark/40 group cursor-zoom-in"
                        onClick={() => setLightboxUrl(img.url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={`Slide ${img.index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          title="Download image"
                          className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-md bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await fetch(img.url);
                              const blob = await res.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = blobUrl;
                              a.download = `slide-${img.index + 1}.png`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                            } catch {
                              // silently fail
                            }
                          }}
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <p className="font-sans text-[14px] text-ink-faint text-center py-10">
              Twitter/X draft not available
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
