import type { MutableRefObject } from "react";

export type OpenPreviewModalOpts = {
  socialTab?: "linkedin" | "twitter";
  initialView?: "preview" | "share-menu";
  videoResume?: { seconds: number; autoplay: boolean };
};

export type VideoCardPlaybackRef = MutableRefObject<{
  pause: () => void;
  getResumeOpts: () => Pick<OpenPreviewModalOpts, "videoResume"> | undefined;
} | null>;
