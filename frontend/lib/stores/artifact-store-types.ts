import type { Artifact, ArtifactType, ArtifactConfig } from "./artifact-types";
import type { VideoConfig, ReelTurn, Script } from "../types";

// ── activeModal discriminated union ──────────────────────────────────────────
// Read-only derived view over the flat boolean modal fields.
// Use this in new code — avoids subscribing to unrelated modal state.
export type ActiveModal =
  | { type: "none" }
  | { type: "edit"; artifactId: string; triggeredByPipeline: boolean; originalConfig: ArtifactConfig | null }
  | { type: "preview"; artifactId: string; socialTab: "linkedin" | "twitter" | null; initialView: "preview" | "share-menu"; videoResume: { seconds: number; autoplay: boolean } | null }
  | { type: "generating"; artifactId: string }
  | { type: "config-video"; runId: string }
  | { type: "config-podcast"; paperId: string }
  | { type: "config-reel"; paperId: string }
  | { type: "config-presentation"; paperId: string }
  | { type: "reel-script"; artifactId: string }
  | { type: "reel-avatar"; artifactId: string };

/**
 * Full shape of the artifact store.
 * Defined here — separate from the implementation — so slices can reference
 * it without creating a circular import with artifact-store.ts.
 */
export interface ArtifactStore {
  // ── State ────────────────────────────────────────────────────────────────
  artifacts: Artifact[];

  selectedArtifactId: string | null;

  editModalOpen: boolean;
  editModalTriggeredByPipeline: boolean;
  editModalOriginalConfig: ArtifactConfig | null;

  previewModalOpen: boolean;
  previewSocialTab: "linkedin" | "twitter" | null;
  previewInitialView: "preview" | "share-menu";
  previewVideoResume: { seconds: number; autoplay: boolean } | null;

  generatingModalOpen: boolean;
  dismissedArtifactIds: string[];
  generatingId: string | null;

  podcastConfigModalOpen: boolean;
  podcastConfigPaperId: string | null;

  videoConfigModalOpen: boolean;
  videoConfigRunId: string | null;

  reelConfigModalOpen: boolean;
  reelConfigPaperId: string | null;
  reelScriptModalOpen: boolean;
  reelAvatarModalOpen: boolean;

  presentationConfigModalOpen: boolean;
  presentationConfigPaperId: string | null;

  // ── Public actions ────────────────────────────────────────────────────────
  startGeneration: (type: ArtifactType, runId?: string, videoConfig?: VideoConfig) => void;
  startPosterGeneration: (paperId: string) => void;
  startPresentationGeneration: (paperId: string, language?: string, pptTemplate?: string) => void;
  confirmPresentationDeck: (artifactId: string, language?: string, outputFormat?: "ppt" | "beamer_pdf", editedScript?: Script) => void;
  startPodcastGeneration: (paperId: string, opts?: { language?: string; hostAGender?: "female" | "male"; hostBGender?: "female" | "male"; renderVideo?: boolean; replacesArtifactId?: string }) => void;
  startSocialGeneration: (runId: string) => void;
  startBusinessBriefGeneration: () => void;

  openPodcastConfigModal: (paperId: string) => void;
  closePodcastConfigModal: () => void;

  openVideoConfigModal: (runId: string) => void;
  closeVideoConfigModal: () => void;
  confirmVideoConfig: (config: VideoConfig) => void;

  openReelConfigModal: (paperId: string) => void;
  closeReelConfigModal: () => void;
  startReelGeneration: (paperId: string, language?: string, replacesArtifactId?: string) => void;
  saveReelScript: (artifactId: string, turns: ReelTurn[]) => Promise<void>;
  proceedToReelAvatars: (artifactId: string) => void;
  selectReelAvatarAndFinalize: (artifactId: string, pair: string, person1Url: string, person2Url: string) => Promise<void>;
  closeReelScriptModal: () => void;
  closeReelAvatarModal: () => void;
  reopenReelStageModal: (artifactId: string) => void;

  openPresentationConfigModal: (paperId: string) => void;
  closePresentationConfigModal: () => void;

  resumePipeline: (artifactId: string, opts?: { language?: string; voiceGender?: string; slideLanguage?: string; editedScript?: Script }) => void;

  updateProgress: (id: string, progress: number) => void;
  completeGeneration: (id: string) => void;
  setSelectedArtifact: (id: string | null) => void;

  openEditModal: (id: string) => void;
  closeEditModal: () => void;

  openPreviewModal: (id: string, opts?: { socialTab?: "linkedin" | "twitter"; initialView?: "preview" | "share-menu"; videoResume?: { seconds: number; autoplay: boolean } }) => void;
  closePreviewModal: () => void;

  openGeneratingModal: (id: string) => void;
  closeGeneratingModal: () => void;

  updateConfig: (id: string, config: Partial<ArtifactConfig>) => void;
  updateScript: (artifactId: string, sectionId: string, field: "voiceoverScript" | "bulletPoints", value: string | string[]) => void;
  updateBriefSection: (artifactId: string, sectionKey: string, content: string) => void;
  setImageAssignment: (artifactId: string, sectionId: string, imageIndex: number) => void;
  retryArtifact: (id: string) => void;
  reset: () => void;

  // ── Slice-internal methods (called by dispatcher or other slices) ──────────
  startVideoGeneration: (runId: string, videoConfig?: VideoConfig) => void;
  resumeVideoPipeline: (artifactId: string, originalArtifact: Artifact, opts?: { language?: string; voiceGender?: string; slideLanguage?: string; editedScript?: Script }) => void;
  retryVideoArtifact: (id: string, a: Artifact) => void;
  retryPodcastArtifact: (id: string, a: Artifact) => void;
  retryPosterArtifact: (id: string, a: Artifact) => void;
  retryReelArtifact: (id: string, a: Artifact) => void;

  // ── Internal helpers (used by slices) ─────────────────────────────────────
  _failRetry: (id: string, msg: string) => void;
  _updateRetryState: (id: string, msg: string) => void;
  _openPreviewIfAllowed: (id: string) => void;
  _openEditIfAllowed: (id: string) => void;
}
