"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X, ArrowLeft, FileText, Code2, Globe, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePaperStore } from "@/lib/paper-store";

function SkeletonPage() {
  return (
    <div className="space-y-4 py-3 shrink-0">
      <div className="flex gap-3">
        <Skeleton className="h-5 flex-1 rounded-md" />
        <Skeleton className="h-5 w-2/5 rounded-md" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-4/5 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-3/5 rounded-md" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-20 w-1/3 rounded-lg" />
        <div className="flex-1 flex flex-col gap-2.5 justify-center">
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-4/5 rounded-md" />
          <Skeleton className="h-3 w-2/3 rounded-md" />
        </div>
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-5/6 rounded-md" />
        <Skeleton className="h-3 w-3/4 rounded-md" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-16 flex-1 rounded-lg" />
        <Skeleton className="h-16 flex-1 rounded-lg" />
      </div>
    </div>
  );
}

type UploadType = "pdf" | "latex" | "arxiv";
type ModalStep = "select" | "upload" | "processing" | "metadata";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Skip the type-selection screen and land directly on the upload/URL step. */
  initialStep?: ModalStep;
  /** Pre-select a specific upload type when skipping to the upload step. */
  initialUploadType?: UploadType;
}

function isValidArxivUrl(url: string): boolean {
  return (
    /arxiv\.org\/(abs|pdf)\/\d/.test(url) ||
    /biorxiv\.org\/content\//.test(url) ||
    /medrxiv\.org\/content\//.test(url)
  );
}

export default function UploadModal({
  open,
  onClose,
  initialStep,
  initialUploadType,
}: UploadModalProps) {
  const router = useRouter();
  const {
    file,
    isPatent,
    status,
    processingStep: storeProcessingStep,
    metadata,
    setFile,
    setIsPatent,
    setMetadata,
    startUpload,
    startArxivIngest,
    addPaper,
    reset,
  } = usePaperStore();

  const [step, setStep] = useState<ModalStep>("select");
  const [uploadType, setUploadType] = useState<UploadType>("pdf");
  const [arxivUrl, setArxivUrl] = useState("");
  const [arxivError, setArxivError] = useState("");

  // Reset when modal opens — skip full reset when jumping straight to upload step
  // (caller has already set the file in the store)
  useEffect(() => {
    if (open) {
      const skipToUpload = initialStep === "upload";
      if (!skipToUpload) reset();
      setStep(initialStep ?? "select");
      setUploadType(initialUploadType ?? "pdf");
      setArxivUrl("");
      setArxivError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move to metadata step when backend processing is done
  useEffect(() => {
    if (step === "processing" && status === "done") {
      setStep("metadata");
    }
  }, [step, status]);

  const handleUploadNext = async () => {
    setStep("processing");
    await startUpload();
  };

  const handleArxivNext = async () => {
    if (!isValidArxivUrl(arxivUrl)) {
      setArxivError("Please enter a valid arXiv, bioRxiv, or medRxiv URL");
      return;
    }
    setArxivError("");
    setStep("processing");
    await startArxivIngest(arxivUrl);
  };

  const handleMetadataNext = () => {
    const newPaperId = addPaper();
    onClose();
    router.push(`/dashboard/paper/${newPaperId}`);
  };

  // Determine the file accept string and label for the current upload type
  const fileAccept = uploadType === "latex" ? ".zip" : ".pdf";
  const fileLabel =
    uploadType === "latex"
      ? "Drop your LaTeX ZIP here or click to browse"
      : "Drop your PDF here or click to browse";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg dark:border dark:border-saral-dark rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-[720px] max-sm:max-w-[95vw] max-h-[85vh] overflow-y-auto relative">
              {/* Header bar */}
              <div className="flex items-center justify-between px-8 pt-6 pb-4 max-sm:px-5 max-sm:pt-5 max-sm:pb-3 border-b border-pill-border">
                <div className="flex items-center gap-3">
                  {step !== "select" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setStep(step === "upload" ? "select" : "upload")
                      }
                      className="text-ink-muted dark:text-white/70 hover:text-ink dark:text-white h-8 w-8"
                    >
                      <ArrowLeft size={18} />
                    </Button>
                  )}
                  <h2 className="font-sans text-[20px] max-sm:text-[17px] font-semibold text-ink dark:text-white">
                    {step === "select" && "Add a new paper"}
                    {step === "upload" &&
                      (uploadType === "arxiv"
                        ? "Enter arXiv URL"
                        : "Upload Paper")}
                    {step === "processing" && "Processing..."}
                    {step === "metadata" && "Paper Details"}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-ink-faint hover:text-ink dark:text-white h-8 w-8"
                >
                  <X size={18} />
                </Button>
              </div>

              {/* Step indicator */}
              <div className="flex gap-1.5 px-8 pt-4 max-sm:px-5">
                {["select", "upload", "processing", "metadata"].map((s, i) => (
                  <div
                    key={s}
                    className={`h-[3px] flex-1 rounded-full transition-colors ${
                      i <=
                      ["select", "upload", "processing", "metadata"].indexOf(
                        step,
                      )
                        ? "bg-saral-forest"
                        : "bg-linen-dark dark:bg-white/10"
                    }`}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="px-8 py-6 max-sm:px-5 max-sm:py-5">
                {/* ─── Step 0: Select Upload Type ─── */}
                {step === "select" && (
                  <div>
                    <p className="text-[16px] text-ink-muted dark:text-white/70 mb-8 max-sm:mb-6">
                      Choose how you'd like to bring your research in
                    </p>

                    <RadioGroup
                      value={uploadType}
                      onValueChange={(val) => setUploadType(val as UploadType)}
                    >
                      <div className="space-y-3 max-sm:space-y-3">
                        {/* PDF Option */}
                        <label
                          className={`flex items-center p-5 max-sm:p-4 border-2 rounded-xl cursor-pointer transition-colors ${uploadType === "pdf" ? "border-saral-forest bg-saral-forest/5 dark:bg-saral-forest/10" : "border-pill-border dark:border-saral-dark bg-white dark:bg-carddarkbg hover:bg-linen dark:hover:bg-white/5"}`}
                        >
                          <RadioGroupItem
                            value="pdf"
                            id="pdf"
                            className="mr-4"
                          />
                          <div className="flex-1 flex items-start gap-4">
                            <div
                              className={`w-12 h-12 max-sm:w-10 max-sm:h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${uploadType === "pdf" ? "bg-saral-forest/15" : "bg-ink/10"}`}
                            >
                              <FileText
                                size={24}
                                className={
                                  uploadType === "pdf"
                                    ? "text-saral-forest"
                                    : "text-ink dark:text-white"
                                }
                              />
                            </div>
                            <div>
                              <p className="font-sans font-semibold text-[16px] max-sm:text-[15px] text-ink dark:text-white">
                                Upload PDF
                              </p>
                              <p className="font-sans text-[14px] max-sm:text-[13px] text-ink-muted dark:text-white/70 mt-1">
                                Upload a research paper in PDF format
                              </p>
                            </div>
                          </div>
                        </label>

                        {/* LaTeX Option */}
                        <label
                          className={`flex items-center p-5 max-sm:p-4 border-2 rounded-xl cursor-pointer transition-colors ${uploadType === "latex" ? "border-saral-forest bg-saral-forest/5 dark:bg-saral-forest/10" : "border-pill-border dark:border-saral-dark bg-white dark:bg-carddarkbg hover:bg-linen dark:hover:bg-white/5"}`}
                        >
                          <RadioGroupItem
                            value="latex"
                            id="latex"
                            className="mr-4"
                          />
                          <div className="flex-1 flex items-start gap-4">
                            <div
                              className={`w-12 h-12 max-sm:w-10 max-sm:h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${uploadType === "latex" ? "bg-saral-forest/15" : "bg-ink/10"}`}
                            >
                              <Code2
                                size={24}
                                className={
                                  uploadType === "latex"
                                    ? "text-saral-forest"
                                    : "text-ink dark:text-white"
                                }
                              />
                            </div>
                            <div>
                              <p className="font-sans font-semibold text-[16px] max-sm:text-[15px] text-ink dark:text-white">
                                Upload LaTeX
                              </p>
                              <p className="font-sans text-[14px] max-sm:text-[13px] text-ink-muted dark:text-white/70 mt-1">
                                Upload a LaTeX source as a{" "}
                                <code className="font-mono text-[13px] bg-ink/5 px-1 rounded">
                                  .zip
                                </code>{" "}
                                file
                              </p>
                            </div>
                          </div>
                        </label>

                        {/* arXiv Option */}
                        <label
                          className={`flex items-center p-5 max-sm:p-4 border-2 rounded-xl cursor-pointer transition-colors ${uploadType === "arxiv" ? "border-saral-forest bg-saral-forest/5 dark:bg-saral-forest/10" : "border-pill-border dark:border-saral-dark bg-white dark:bg-carddarkbg hover:bg-linen dark:hover:bg-white/5"}`}
                        >
                          <RadioGroupItem
                            value="arxiv"
                            id="arxiv"
                            className="mr-4"
                          />
                          <div className="flex-1 flex items-start gap-4">
                            <div
                              className={`w-12 h-12 max-sm:w-10 max-sm:h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${uploadType === "arxiv" ? "bg-saral-forest/15" : "bg-ink/10"}`}
                            >
                              <Globe
                                size={24}
                                className={
                                  uploadType === "arxiv"
                                    ? "text-saral-forest"
                                    : "text-ink dark:text-white"
                                }
                              />
                            </div>
                            <div>
                              <p className="font-sans font-semibold text-[16px] max-sm:text-[15px] text-ink dark:text-white">
                                arXiv URL
                              </p>
                              <p className="font-sans text-[14px] max-sm:text-[13px] text-ink-muted dark:text-white/70 mt-1">
                                Paste a link like arxiv.org/abs/1706.03762
                              </p>
                            </div>
                          </div>
                        </label>
                      </div>
                    </RadioGroup>

                    <div className="flex justify-between items-center pt-8 max-sm:pt-6 mt-8 max-sm:mt-6 border-t border-pill-border">
                      <Button
                        variant="outline"
                        onClick={onClose}
                        className="font-sans font-semibold text-[14px] px-6 py-3 h-auto border-pill-border text-ink dark:text-white hover:bg-linen dark:bg-saral-dark/50"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => setStep("upload")}
                        className="bg-ink cursor-pointer text-white hover:bg-[#333] font-sans font-bold text-[14px] px-6 py-3 h-auto"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

                {/* ─── Step 1: Upload / URL input ─── */}
                {step === "upload" && (
                  <div>
                    {/* arXiv URL input */}
                    {uploadType === "arxiv" ? (
                      <div className="mb-6">
                        <label className="font-sans text-[14px] font-semibold text-ink dark:text-white mb-2 block">
                          arXiv Paper URL
                        </label>
                        <div className="relative">
                          <Link
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-white/70 pointer-events-none"
                          />
                          <Input
                            value={arxivUrl}
                            onChange={(e) => {
                              setArxivUrl(e.target.value);
                              if (arxivError) setArxivError("");
                            }}
                            placeholder="https://arxiv.org/abs/1706.03762"
                            className={`pl-9 font-mono text-[13px] h-11 border-pill-border rounded-xl focus-visible:ring-saral-forest ${arxivError ? "border-red-400" : ""}`}
                            autoFocus
                          />
                        </div>
                        {arxivError && (
                          <p className="font-sans text-[12px] text-red-500 mt-1.5">
                            {arxivError}
                          </p>
                        )}
                        <p className="font-sans text-[12px] text-ink-faint mt-2">
                          Supports arxiv.org/abs/… and arxiv.org/pdf/… links
                        </p>
                      </div>
                    ) : (
                      /* File upload (PDF or LaTeX ZIP) */
                      <div className="border-2 border-dashed border-pill-border dark:border-darkcardborder rounded-xl bg-linen/60 dark:bg-saral-dark/50 transition-colors hover:border-saral-forest/50 mb-6">
                        <FileUpload
                          key={`${uploadType}-${file?.name ?? "empty"}`} // remount when type or file changes
                          onChange={(newFiles) => setFile(newFiles[0] ?? null)}
                          accept={fileAccept}
                          initialFile={file ?? undefined}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-end">
                      {/* {uploadType !== "arxiv" ? (
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={isPatent}
                            onCheckedChange={setIsPatent}
                          />
                          <label className="text-[13px] max-sm:text-[12px] text-ink-muted dark:text-white/70 font-sans">
                            Uploaded a Patent?
                          </label>
                        </div>
                      ) : (
                        <div />
                      )} */}

                      {uploadType === "arxiv" ? (
                        <Button
                          disabled={!arxivUrl.trim()}
                          onClick={handleArxivNext}
                          className="bg-saral-forest cursor-pointer text-white hover:bg-saral-forest/90 font-sans font-bold text-[14px] px-6 py-5 disabled:opacity-40"
                        >
                          Get Started
                        </Button>
                      ) : (
                        <Button
                          disabled={!file}
                          onClick={handleUploadNext}
                          className="bg-saral-forest cursor-pointer text-white hover:bg-saral-forest/90 font-sans font-bold text-[14px] px-6 py-5 disabled:opacity-40"
                        >
                          {file ? "Get Started" : "Next"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Step 2: Processing ─── */}
                {step === "processing" && (
                  <div className="flex flex-col items-center py-4 max-sm:py-2">
                    {/* Scrolling paper */}
                    <div className="w-full max-w-[460px] max-sm:max-w-full bg-white dark:bg-carddarkbg rounded-xl border border-[#e5e2dc] dark:border-darkcardborder shadow-sm overflow-hidden mb-6">
                      <div className="relative h-[280px] max-sm:h-[200px] overflow-hidden px-6 max-sm:px-4 pt-2">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 z-10 bg-gradient-to-b from-white to-transparent dark:from-carddarkbg" />
                        <div className="animate-scroll-paper flex flex-col">
                          <SkeletonPage />
                          <SkeletonPage />
                          <SkeletonPage />
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 z-10 bg-gradient-to-t from-white to-transparent dark:from-carddarkbg" />
                      </div>
                    </div>

                    <p className="font-sans text-[16px] max-sm:text-[14px] font-semibold text-ink dark:text-white">
                      {storeProcessingStep}
                    </p>
                    <p className="font-sans text-[13px] text-ink-faint mt-1">
                      This may take a moment
                    </p>
                  </div>
                )}

                {/* ─── Step 3: Metadata ─── */}
                {step === "metadata" && (
                  <div className="space-y-5">
                    <div>
                      <label className="font-sans text-[14px] max-sm:text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                        Title
                      </label>
                      <Input
                        value={metadata.title}
                        onChange={(e) => setMetadata({ title: e.target.value })}
                        placeholder="Paper title…"
                        className="bg-linen dark:bg-saral-dark/50 border-pill-border rounded-xl h-11 text-[14px] font-sans text-ink dark:text-white placeholder:text-ink-faint"
                      />
                    </div>

                    <div>
                      <label className="font-sans text-[14px] max-sm:text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                        Authors
                      </label>
                      <Input
                        value={metadata.authors}
                        onChange={(e) =>
                          setMetadata({ authors: e.target.value })
                        }
                        placeholder="Author names, comma separated…"
                        className="bg-linen dark:bg-saral-dark/50 border-pill-border rounded-xl h-11 text-[14px] font-sans text-ink dark:text-white placeholder:text-ink-faint"
                      />
                    </div>

                    <div>
                      <label className="font-sans text-[14px] max-sm:text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                        Year of Publication
                      </label>
                      <Input
                        value={metadata.year}
                        onChange={(e) => setMetadata({ year: e.target.value })}
                        placeholder="e.g. 2024"
                        className="bg-linen dark:bg-saral-dark/50 border-pill-border rounded-xl h-11 text-[14px] font-sans text-ink dark:text-white placeholder:text-ink-faint"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleMetadataNext}
                        className="bg-ink cursor-pointer text-white hover:bg-[#333] font-sans font-bold text-[14px] px-6 py-5"
                      >
                        Go to dashboard
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
