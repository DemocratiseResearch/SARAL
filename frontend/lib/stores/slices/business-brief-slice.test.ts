import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SSEEvent } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";

const api = vi.hoisted(() => ({
  generateBusinessBrief: vi.fn(),
  getBusinessBrief: vi.fn(),
  fetchBusinessBriefPdfBlob: vi.fn(),
  connectBusinessBriefSSE: vi.fn(),
}));

vi.mock("../../api", () => api);
vi.mock("../../paper-store", () => ({
  usePaperStore: { getState: () => ({ paperId: "paper-1" }) },
}));

import { createBusinessBriefSlice } from "./business-brief-slice";

let state: ArtifactStore;
let onEvent: (event: SSEEvent) => Promise<void>;
let close: ReturnType<typeof vi.fn>;

async function start() {
  // Only the state and actions used by this slice are needed.
  state = {
    artifacts: [],
    generatingModalOpen: false,
    generatingId: null,
    updateProgress: vi.fn(),
  } as unknown as ArtifactStore;
  const set = ((patch: Partial<ArtifactStore>) => {
    Object.assign(state, patch);
  }) as Parameters<typeof createBusinessBriefSlice>[0];
  const get = () => state;
  const slice = createBusinessBriefSlice(
    set, get, {} as Parameters<typeof createBusinessBriefSlice>[2],
  );
  slice.startBusinessBriefGeneration();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  close = vi.fn();
  api.generateBusinessBrief.mockResolvedValue({});
  api.getBusinessBrief.mockResolvedValue({ status: "completed", sections: {} });
  api.fetchBusinessBriefPdfBlob.mockResolvedValue(new Blob(["pdf"]));
  api.connectBusinessBriefSSE.mockImplementation((_id, handler) => {
    onEvent = handler;
    return { close };
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:brief");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("business brief SSE terminal events", () => {
  it.each(["business_brief_script", "business_brief_pdf_render"])(
    "shows %s failure and stops progress and polling",
    async (step) => {
      await start();
      await onEvent({ status: "failed", step, message: "Provider unavailable" });
      expect(close).toHaveBeenCalledOnce();
      expect(state.artifacts[0]).toMatchObject({
        status: "error", progress: 0, errorMessage: "Provider unavailable",
      });
      await vi.advanceTimersByTimeAsync(1200);
      expect(state.generatingModalOpen).toBe(false);
      expect(state.generatingId).toBeNull();
      await vi.advanceTimersByTimeAsync(30000);
      expect(state.updateProgress).not.toHaveBeenCalled();
      expect(api.getBusinessBrief).not.toHaveBeenCalled();
    },
  );

  it("uses a fallback message and ignores duplicate or late terminal events", async () => {
    await start();
    await onEvent({ status: "failed", step: "business_brief_script", message: undefined } as unknown as SSEEvent);
    expect(state.artifacts[0].errorMessage).toBe("Pipeline step failed");
    await onEvent({ status: "failed", step: "business_brief_pdf_render", message: "Later" });
    await onEvent({ status: "completed", step: "business_brief_pdf_render", message: "Ready" });
    expect(state.artifacts[0].status).toBe("error");
    expect(state.artifacts[0].errorMessage).toBe("Pipeline step failed");
    expect(api.getBusinessBrief).not.toHaveBeenCalled();
  });

  it("preserves successful completion even if a failure arrives afterward", async () => {
    await start();
    await onEvent({ status: "completed", step: "business_brief_pdf_render", message: "Ready" });
    expect(state.artifacts[0]).toMatchObject({ status: "done", progress: 100, pdfBlobUrl: "blob:brief" });
    await onEvent({ status: "failed", step: "business_brief_pdf_render", message: "Late failure" });
    expect(state.artifacts[0].status).toBe("done");
    expect(state.artifacts[0].errorMessage).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600);
    expect(state.generatingModalOpen).toBe(false);
  });
});
