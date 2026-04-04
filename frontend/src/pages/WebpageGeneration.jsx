import React, { useEffect, useMemo, useState } from "react";
import { FiDownload, FiGlobe, FiMonitor, FiSmartphone, FiTablet } from "react-icons/fi";

import Layout from "../components/common/Layout";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import toast from "../services/toastService";
import { downloadBlob } from "../utils/helpers";

const ViewportButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors ${
      active
        ? "bg-gray-900 text-white border-gray-900"
        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-600 dark:hover:bg-neutral-700"
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read preview asset"));
    reader.readAsDataURL(blob);
  });

const WebpageGeneration = () => {
  const { paperId: ctxPaperId } = useWorkflow();
  const paperId = ctxPaperId;
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewport, setViewport] = useState("desktop");

  const crumbs = [{ label: "Webpage Generation", href: "/webpage-generation" }];

  const frameStyle = useMemo(() => {
    if (viewport === "mobile") return { width: "390px", height: "75vh" };
    if (viewport === "tablet") return { width: "820px", height: "75vh" };
    return { width: "100%", height: "75vh" };
  }, [viewport]);

  const loadLatestVariant = async () => {
    if (!paperId) return;
    try {
      const resp = await apiService.listWebpageVariants(paperId);
      const list = resp?.data || [];
      if (list.length) setSelected(list[0]);
    } catch (e) {
      console.warn("Failed to fetch variants", e);
    }
  };

  useEffect(() => {
    setSelected(null);
    setPreviewHtml("");
    loadLatestVariant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!paperId || !selected?.variant_id) {
        setPreviewHtml("");
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      try {
        const resp = await apiService.getWebpagePreviewHtml(paperId, selected.variant_id);
        let html = resp?.data || "";
        const matches = [...html.matchAll(/(\/api\/webpage\/[^"'\s>]+\/asset\/[^"'\s>]+)/g)];
        const uniqueUrls = [...new Set(matches.map((match) => match[1]))];

        for (const url of uniqueUrls) {
          const fileName = url.split("/").pop();
          const assetResp = await apiService.getWebpagePreviewAsset(paperId, fileName);
          const dataUrl = await blobToDataUrl(assetResp.data);
          html = html.split(url).join(dataUrl);
        }

        if (!cancelled) {
          setPreviewHtml(html);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewHtml("");
          toast.error("Failed to load preview.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [paperId, selected]);

  const generate = async () => {
    if (!paperId) {
      toast.error("Please upload/process a paper first.");
      return;
    }

    setLoading(true);
    try {
      const resp = await apiService.generateWebpage(paperId);
      const created = resp?.data?.variants || [];
      if (!created.length) {
        toast.error("No variants were generated.");
      } else {
        setSelected(created[0]);
        toast.success("Generated a new webpage.");
      }
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || "Failed to generate webpage";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const downloadSelected = async () => {
    if (!paperId || !selected?.variant_id) return;
    try {
      const resp = await apiService.downloadWebpageVariant(paperId, selected.variant_id);
      downloadBlob(resp.data, `webpage_${selected.variant_id}.html`);
      toast.success("Downloaded HTML");
    } catch (error) {
      toast.error("Download failed");
    }
  };

  return (
    <Layout title="Webpage Generation" breadcrumbs={crumbs}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Generate a polished research webpage</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Focused on paper highlights, figures, and repository links.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={generate}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm disabled:opacity-60"
              >
                <FiGlobe className="w-4 h-4" />
                {loading ? "Generating..." : "Generate"}
              </button>

              <button
                onClick={downloadSelected}
                disabled={!selected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-neutral-600 text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <FiDownload className="w-4 h-4" />
                Download HTML
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Live Preview</h3>
            <div className="flex items-center gap-2">
              <ViewportButton
                active={viewport === "desktop"}
                onClick={() => setViewport("desktop")}
                icon={FiMonitor}
                label="Desktop"
              />
              <ViewportButton
                active={viewport === "tablet"}
                onClick={() => setViewport("tablet")}
                icon={FiTablet}
                label="Tablet"
              />
              <ViewportButton
                active={viewport === "mobile"}
                onClick={() => setViewport("mobile")}
                icon={FiSmartphone}
                label="Mobile"
              />
            </div>
          </div>

          {!selected ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-neutral-600 p-10 text-center text-sm text-gray-500">
              Generate a webpage to preview it here.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-300 dark:border-neutral-700 p-2 bg-gray-50 dark:bg-neutral-900 flex justify-center">
              <iframe
                title="webpage-preview"
                srcDoc={previewHtml || "<html><body></body></html>"}
                style={frameStyle}
                className="border rounded-md bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          )}
          {previewLoading ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Loading preview assets...</p>
          ) : null}
        </div>
      </div>
    </Layout>
  );
};

export default WebpageGeneration;
