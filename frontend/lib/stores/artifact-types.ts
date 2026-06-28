import type {
  AudioSlidePresigned,
  ReelScript,
  LinkedInDraft,
  TwitterDraft,
} from "../types";

export type ArtifactType =
  | "video"
  | "podcast"
  | "presentation"
  | "reel"
  | "x-linkedin"
  | "poster"
  | "business-brief";

export type ArtifactStatus =
  | "idle"
  | "pending"
  | "generating"
  | "waiting-script"
  | "done"
  | "error";

export interface ScriptSection {
  id: string;
  label: string;
  voiceoverScript: string;
  bulletPoints: string[];
}

export interface ArtifactConfig {
  audioLanguage: string;
  textLanguage: string;
  voiceGender: "male" | "female";
  language: string;
  slideLanguage?: string;
  presentationOutputFormat?: "ppt" | "beamer_pdf";
  pptTemplate?: string;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  status: ArtifactStatus;
  progress: number;
  config: ArtifactConfig;
  scripts: ScriptSection[];
  rawScript?: import("../types").Script;
  runId?: string;
  paperId?: string;
  downloadUrl?: string;
  slidesPdfUrl?: string;
  slidesPptxUrl?: string;
  briefSections?: Record<string, string>;
  briefModelVersion?: "v1" | "v2";
  pdfBlobUrl?: string;
  errorMessage?: string;
  statusMessage?: string;
  imageAssignments: Record<string, number>;
  audioSlides?: AudioSlidePresigned["slides"];
  podcastDurationSeconds?: number;
  podcastStep?: "script_gen" | "tts" | "ffmpeg_stitch" | "complete" | "error";
  podcastScript?: import("../types").PodcastScript;
  podcastRenderVideo?: boolean;
  podcastVideoUrl?: string;

  reelStage?:
    | "starting"
    | "script_review"
    | "avatar_pick"
    | "rendering"
    | "done"
    | "failed";
  reelScript?: ReelScript;
  reelLanguage?: string;
  reelSelectedPair?: string;
  reelAvatarPreview?: { person1Url: string; person2Url: string };
  reelStreamHandle?: { close: () => void } | null;
  reelErrorMessage?: string;

  linkedInDraft?: LinkedInDraft;
  twitterDraft?: TwitterDraft;

  needsUserAction?: "edit" | "preview";
  replacesArtifactId?: string;
  videoPaperRunId?: string;
}

import { ARTIFACT_CONFIG } from "../artifact-config";

export const ARTIFACT_LABELS = Object.fromEntries(
  Object.entries(ARTIFACT_CONFIG).map(([k, v]) => [k, v.label])
) as Record<ArtifactType, string>;

export const MOCK_SCRIPTS: ScriptSection[] = [
  {
    id: "introduction",
    label: "Introduction",
    voiceoverScript:
      "Lorem Ipsum Script here. This section introduces the core concepts of the research paper and sets the context for the audience.",
    bulletPoints: ["Point 1", "Point 2", "Point 3"],
  },
  {
    id: "methodology",
    label: "Methodology",
    voiceoverScript:
      "This section covers the research methodology, including data collection and analysis techniques used in the study.",
    bulletPoints: ["Point 1", "Point 2", "Point 3"],
  },
  {
    id: "findings",
    label: "Findings",
    voiceoverScript:
      "Key findings from the research are presented here, highlighting the most significant results and their implications.",
    bulletPoints: ["Point 1", "Point 2", "Point 3"],
  },
  {
    id: "conclusion",
    label: "Conclusion",
    voiceoverScript:
      "The conclusion summarizes the key takeaways and suggests directions for future research in this area.",
    bulletPoints: ["Point 1", "Point 2", "Point 3"],
  },
];
