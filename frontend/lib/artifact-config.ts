import type { ArtifactType } from "./stores/artifact-types";

export interface ArtifactTypeConfig {
  label: string;
  pluralLabel: string;
  color: string;
  editable: boolean;
  shareable: boolean;
  languageVisible: boolean;
}

export const ARTIFACT_CONFIG = {
  video: {
    label: "Video",
    pluralLabel: "Videos",
    color: "#836879",
    editable: true,
    shareable: true,
    languageVisible: true,
  },
  podcast: {
    label: "Podcast",
    pluralLabel: "Podcasts",
    color: "#D4A853",
    editable: true,
    shareable: true,
    languageVisible: true,
  },
  presentation: {
    label: "Presentation",
    pluralLabel: "Presentations",
    color: "#4A5D55",
    editable: true,
    shareable: true,
    languageVisible: true,
  },
  reel: {
    label: "Reel",
    pluralLabel: "Reels",
    color: "#4A5D55",
    editable: true,
    shareable: true,
    languageVisible: true,
  },
  "x-linkedin": {
    label: "X/Linkedin",
    pluralLabel: "Social Media Posts",
    color: "#836879",
    editable: false,
    shareable: false,
    languageVisible: false,
  },
  poster: {
    label: "Poster",
    pluralLabel: "Poster",
    color: "rgb(100,116,139)",
    editable: false,
    shareable: true,
    languageVisible: false,
  },
  "business-brief": {
    label: "Business Brief",
    pluralLabel: "Business Brief",
    color: "#836879",
    editable: false,
    shareable: true,
    languageVisible: false,
  },
} satisfies Record<ArtifactType, ArtifactTypeConfig>;

export const ARTIFACT_TYPES = Object.keys(ARTIFACT_CONFIG) as ArtifactType[];

export const EDITABLE_TYPES = ARTIFACT_TYPES.filter((t) => ARTIFACT_CONFIG[t].editable);
export const SHAREABLE_TYPES = ARTIFACT_TYPES.filter((t) => ARTIFACT_CONFIG[t].shareable);
export const LANGUAGE_VISIBLE_TYPES = new Set(
  ARTIFACT_TYPES.filter((t) => ARTIFACT_CONFIG[t].languageVisible)
);
