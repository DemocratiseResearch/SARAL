"use client";
import { cn } from "@/lib/utils";
import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { IconUpload } from "@tabler/icons-react";
import { useDropzone } from "react-dropzone";

/** Derive a short, uppercase file-type label, e.g. "PDF" or "ZIP". */
const fileExtension = (file: File): string => {
  const ext = file.name.split(".").pop();
  if (ext && ext !== file.name) return ext.toUpperCase();
  return file.type.split("/").pop()?.toUpperCase() || "FILE";
};

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 20,
    y: -20,
    opacity: 0.9,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const FileUpload = ({
  onChange,
  accept,
  initialFile,
}: {
  onChange?: (files: File[]) => void;
  /** Restrict file types, e.g. ".pdf" or ".zip" */
  accept?: string;
  /** Pre-populate the component with a file that was selected outside this component */
  initialFile?: File;
}) => {
  const [files, setFiles] = useState<File[]>(initialFile ? [initialFile] : []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange && onChange(newFiles);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  // Build react-dropzone accept object from the accept string
  const dropzoneAccept = accept
    ? Object.fromEntries(
        accept.split(",").map((ext) => {
          const mime =
            ext.trim() === ".pdf"
              ? "application/pdf"
              : ext.trim() === ".zip"
                ? "application/zip"
                : "application/octet-stream";
          return [mime, [ext.trim()]];
        }),
      )
    : undefined;

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: (error) => {
      console.log(error);
    },
    ...(dropzoneAccept ? { accept: dropzoneAccept } : {}),
  });

  return (
    <div className="w-full" {...getRootProps()}>
      <motion.div
        onClick={handleClick}
        whileHover="animate"
        className="group/file relative block w-full cursor-pointer overflow-hidden rounded-lg p-6"
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          accept={accept}
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
        />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
          <GridPattern />
        </div>
        <div className="flex flex-col items-center justify-center">
          {/* <p className="relative z-20 font-sans text-base font-bold text-neutral-700 dark:text-neutral-300">
            Let&apos;s get started
          </p> */}
          {/* <p className="relative z-20 mt-2 font-sans text-base font-normal text-neutral-400 dark:text-neutral-400">
            Drop your paper here, or click to browse
          </p> */}
          <div className="relative mx-auto mt-4 w-full max-w-xl">
            {files.length > 0 &&
              files.map((file, idx) => (
                <motion.div
                  key={"file" + idx}
                  layoutId={idx === 0 ? "file-upload" : "file-upload-" + idx}
                  className={cn(
                    "relative z-40 mx-auto mt-4 flex w-full flex-col items-start justify-start overflow-hidden rounded-xl border border-pill-border bg-white p-4 md:h-24 dark:border-darkcardborder dark:bg-carddarkbg",
                    "shadow-[0_2px_10px_rgba(74,93,85,0.08)]",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-4">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="max-w-xs truncate font-sans text-base font-medium text-ink dark:text-white"
                    >
                      {file.name}
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="w-fit shrink-0 rounded-lg px-2 py-1 font-sans text-sm tabular-nums text-ink-muted dark:text-white/70"
                    >
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </motion.p>
                  </div>

                  <div className="mt-2 flex w-full items-center text-sm">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="rounded-md bg-saral-forest/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-saral-forest uppercase dark:bg-saral-forest/20 dark:text-white/80"
                    >
                      {fileExtension(file)}
                    </motion.p>
                  </div>
                </motion.div>
              ))}
            {!files.length && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className={cn(
                  "relative z-40 mx-auto mt-4 flex h-32 w-full max-w-[8rem] items-center justify-center rounded-md border border-pill-border bg-white group-hover/file:shadow-2xl dark:border-darkcardborder dark:bg-carddarkbg",
                  "shadow-[0px_10px_50px_rgba(74,93,85,0.12)]",
                )}
              >
                {isDragActive ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center font-sans text-sm text-saral-forest"
                  >
                    Drop it
                    <IconUpload className="h-4 w-4 text-saral-forest" />
                  </motion.p>
                ) : (
                  <IconUpload className="h-4 w-4 text-ink-muted dark:text-white/70" />
                )}
              </motion.div>
            )}

            {!files.length && (
              <motion.div
                variants={secondaryVariant}
                className="absolute inset-0 z-30 mx-auto mt-4 flex h-32 w-full max-w-[8rem] items-center justify-center rounded-md border border-dashed border-saral-forest/60 bg-transparent opacity-0"
              ></motion.div>
            )}
          </div>
          {!files.length && !isDragActive && (
            <div className="relative z-20 mt-5 text-center">
              <p className="font-sans text-[14px] font-semibold text-ink dark:text-white">
                Click to upload your paper
              </p>
              <p className="mt-1 font-sans text-[12px] text-ink-muted dark:text-white/60">
                or drag and drop it here
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export function GridPattern() {
  const columns = 50;
  const rows = 8;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-px gap-y-px bg-linen-dark dark:bg-carddarkbg">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`flex h-7 w-7 shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-linen dark:bg-saral-dark"
                  : "bg-linen shadow-[0px_0px_1px_3px_rgba(255,255,255,1)_inset] dark:bg-saral-dark dark:shadow-[0px_0px_1px_3px_rgba(0,0,0,1)_inset]"
              }`}
            />
          );
        }),
      )}
    </div>
  );
}
