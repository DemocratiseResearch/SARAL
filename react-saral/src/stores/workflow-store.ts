import { create } from "zustand"

export type WorkflowStep = "upload" | "scripts" | "output" | "done"

interface WorkflowState {
  currentStep: WorkflowStep
  paperId: string | null
  language: string
  voice: string
  setStep: (step: WorkflowStep) => void
  setPaperId: (id: string) => void
  setLanguage: (lang: string) => void
  setVoice: (voice: string) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  currentStep: "upload",
  paperId: null,
  language: "English",
  voice: "shubh",

  setStep: (step) => set({ currentStep: step }),
  setPaperId: (id) => set({ paperId: id }),
  setLanguage: (lang) => set({ language: lang }),
  setVoice: (voice) => set({ voice }),
  reset: () =>
    set({
      currentStep: "upload",
      paperId: null,
      language: "English",
      voice: "shubh",
    }),
}))
