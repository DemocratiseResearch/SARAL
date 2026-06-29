// Compatibility shim — all implementation moved to lib/stores/artifact-store.ts
// Consumers importing from "@/lib/artifact-store" continue to work unchanged.
export { useArtifactStore, selectActiveModal } from "./stores/artifact-store";
export type { ActiveModal } from "./stores/artifact-store";
export type { Artifact, ArtifactType, ArtifactStatus, ScriptSection, ArtifactConfig } from "./stores/artifact-types";
export { ARTIFACT_LABELS, MOCK_SCRIPTS } from "./stores/artifact-types";
