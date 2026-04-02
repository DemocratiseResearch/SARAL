import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiEdit3,
  FiSave,
  FiRefreshCw,
  FiCheck,
  FiPlay,
  FiImage,
  FiList,
  FiMinus,
} from "react-icons/fi";

import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ImageSelector from "../components/workflow/ImageSelector";
import TemplateSelector from "../components/workflow/TemplateSelector";
import ChromeTabs from "../components/common/ChromeTabs";
import { apiService } from "../services/api";
import { useApi } from "../hooks/useApi";
import { useWorkflow } from "../contexts/WorkflowContext";
import toast from "../services/toastService";
import Analytics from "../lib/analytics";

const ScriptTextarea = ({ value, onChange, disabled = false }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`w-full min-h-[200px] px-3 py-2 border rounded-md resize-y transition-all duration-150 ${
      disabled
        ? "border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
        : "border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500"
    } bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500`}
    placeholder="Edit narration script here…"
  />
);

const BulletPointInput = ({ value, onChange, onRemove, disabled = false }) => (
  <div className="flex items-center gap-2">
    <span className="text-neutral-400 dark:text-neutral-500">•</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`flex-1 px-3 py-2 text-sm border rounded-md transition-colors duration-150 ${
        disabled
          ? "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
          : "border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500"
      } bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500`}
      placeholder="Enter bullet point..."
    />
    {!disabled && (
      <button
        onClick={onRemove}
        className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-150"
        title="Remove bullet point"
      >
        <FiMinus className="w-4 h-4" />
      </button>
    )}
  </div>
);

const SectionPanel = ({
  section,
  script,
  onScriptChange,
  bullets,
  onBulletsChange,
  selectedImage,
  onSelectImage,
  paperId,
  images,
  savingScripts,
  generateBullets,
  hasLocalChanges,
}) => {
  const [localBullets, setLocalBullets] = useState(bullets || []);
  const [localScript, setLocalScript] = useState(script);

  useEffect(() => setLocalBullets(bullets || []), [bullets]);
  useEffect(() => setLocalScript(script), [script]);

  const handleBulletChange = (idx, value) => {
    const updated = [...localBullets];
    updated[idx] = value;
    setLocalBullets(updated);
    onBulletsChange(section, updated);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {/* Script Editor */}
      <div className="bg-white dark:bg-neutral-900 rounded-md p-6 border border-neutral-300 dark:border-neutral-600 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                {selectedImage && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 rounded-full">
                    <FiImage className="w-3 h-3 text-green-600 dark:text-green-400" />
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Image
                    </span>
                  </div>
                )}
                {hasLocalChanges && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                    <FiEdit3 className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                      Modified
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{localScript.length} characters</span>
            <span>•</span>
            <span>~{Math.ceil(localScript.length / 150)} minutes</span>
          </div>
        </div>

        <ScriptTextarea
          value={localScript}
          onChange={(v) => {
            setLocalScript(v);
            onScriptChange(section, v);
          }}
          disabled={savingScripts}
        />
      </div>

      {/* Bullet Points + Image picker */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* Bullet Points */}
        <div className="bg-white dark:bg-neutral-900 rounded-md p-6 border border-neutral-300 dark:border-neutral-600 space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-neutral-900 dark:text-white">
            <FiList className="w-4 h-4" /> Slide Bullet Points
          </h4>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {localBullets.map((bp, i) => (
              <BulletPointInput
                key={i}
                value={bp}
                onChange={(val) => handleBulletChange(i, val)}
                onRemove={() => {
                  const updated = localBullets.filter((_, idx) => idx !== i);
                  setLocalBullets(updated);
                  onBulletsChange(section, updated);
                }}
                disabled={savingScripts}
              />
            ))}

            {localBullets.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 dark:text-neutral-400 italic border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-md">
                <FiList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No bullet points yet.</p>
                <p className="text-xs mt-1">Add bullet points manually.</p>
              </div>
            ) : (
              <button
                onClick={() => {
                  const updated = [...localBullets, ""];
                  setLocalBullets(updated);
                  onBulletsChange(section, updated);
                }}
                disabled={savingScripts}
                className="w-full py-2 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-md text-sm text-neutral-500 hover:border-neutral-400 dark:hover:border-neutral-500 transition disabled:opacity-50"
              >
                + Add bullet point
              </button>
            )}
          </div>
        </div>

        {/* Image picker */}
        <div className="bg-white dark:bg-neutral-900 rounded-md p-6 border border-neutral-300 dark:border-neutral-600 space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-neutral-900 dark:text-white">
            <FiImage className="w-4 h-4" /> Slide Image
          </h4>

          <div className="aspect-video bg-neutral-100 dark:bg-gray-900 rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
            {selectedImage ? (
              <div className="relative w-full h-full">
                <img
                  src={apiService.getImageUrl(paperId, selectedImage)}
                  alt={selectedImage}
                  className="object-contain w-full h-full"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded">
                  {selectedImage}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <FiImage className="w-8 h-8 text-neutral-400 dark:text-gray-800 mx-auto mb-2" />
                <span className="text-neutral-400 dark:text-gray-500">
                  No image selected
                </span>
                <p className="text-xs text-neutral-400 dark:text-gray-500 mt-1">
                  Text-only slide
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => onSelectImage(section)}
            disabled={savingScripts}
            className="w-full px-4 py-2 bg-neutral-900 hover:bg-neutral-700 dark:bg-gray-900 dark:hover:bg-gray-600 text-white font-medium rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            {selectedImage ? "Change Image" : "Select Image"}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const ScriptGeneration = () => {
  const {
    paperId,
    metadata,
    scripts,
    editedScripts,
    bulletPoints,
    images,
    selectedImages,
    setScripts,
    setEditedScripts,
    setBulletPoints,
    updateScript,
    updateBulletPoints,
    setSelectedImage,
    progressToNextStep,
  } = useWorkflow();

  const { loading: apiLoading } = useApi();

  const [generating, setGenerating] = useState(false);
  const [generatingSlides, setGeneratingSlides] = useState(false);
  const [savingScripts, setSavingScripts] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [imageSelectorSection, setImageSelectorSection] = useState(null);
  const [localChanges, setLocalChanges] = useState({});
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [generatingPPT, setGeneratingPPT] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const initializationRef = useRef(false);
  const loadingRef = useRef(false);
  const autoGenerateRef = useRef(false);

  const loadExisting = useCallback(async () => {
    if (!paperId || initializationRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await apiService.getScriptsWithBullets(paperId);
      const sectionsData = res.data.sections || {};

      if (Object.keys(sectionsData).length > 0) {
        const loadedScripts = {};
        const loadedBullets = {};
        const loadedImages = {};

        Object.entries(sectionsData).forEach(([section, data]) => {
          loadedScripts[section] = data.script || "";
          loadedBullets[section] = data.bullet_points || [];
          if (data.assigned_image) loadedImages[section] = data.assigned_image;
        });

        setScripts(loadedScripts);
        setEditedScripts(loadedScripts);
        setBulletPoints(loadedBullets);
        Object.entries(loadedImages).forEach(([section, image]) =>
          setSelectedImage(section, image),
        );
        setActiveTab(Object.keys(loadedScripts)[0]);
        initializationRef.current = true;
      }
    } catch (err) {
      // ignore — no scripts found or load error
    } finally {
      loadingRef.current = false;
    }
  }, [
    paperId,
    setScripts,
    setEditedScripts,
    setBulletPoints,
    setSelectedImage,
  ]);

  useEffect(() => {
    if (paperId && !initializationRef.current) loadExisting();
  }, [paperId, loadExisting]);

  // Fetch available languages when paperId is available
  useEffect(() => {
    if (!paperId) return;

    const fetchLanguages = async () => {
      try {
        const res = await apiService.getAvailableLanguagesForSlides(paperId);
        console.log("Language API Response:", res);

        let languages = [];

        // Handle different response formats
        if (res.data) {
          if (Array.isArray(res.data)) {
            languages = res.data;
          } else if (res.data.languages && Array.isArray(res.data.languages)) {
            languages = res.data.languages;
          } else if (res.data.language) {
            // If single language returned, wrap in array
            languages = Array.isArray(res.data.language)
              ? res.data.language
              : [res.data.language];
          }
        }

        if (languages.length > 0) {
          setAvailableLanguages(languages);
          // Auto-select if only one language
          if (languages.length === 1) {
            setSelectedLanguage(languages[0]);
          } else {
            // Reset selected language if multiple available
            setSelectedLanguage(null);
          }
        }
      } catch (error) {
        console.error("Error fetching languages:", error);
        // If API fails, set empty array - continue without language selection
        setAvailableLanguages([]);
      }
    };

    fetchLanguages();
  }, [paperId]);

  const handleGenerateScripts = async () => {
    if (!paperId)
      return toast.error("Upload a paper first", { duration: 8000 });
    setGenerating(true);
    try {
      await apiService.generateScript(paperId);
      await new Promise((r) => setTimeout(r, 1000));
      const res = await apiService.getScriptsWithBullets(paperId);
      const sectionsData = res.data.sections || {};
      if (Object.keys(sectionsData).length > 0) {
        const generatedScripts = {};
        const generatedBullets = {};
        Object.entries(sectionsData).forEach(([section, data]) => {
          generatedScripts[section] = data.script || "";
          generatedBullets[section] = data.bullet_points || [];
        });
        setScripts(generatedScripts);
        setEditedScripts(generatedScripts);
        setBulletPoints(generatedBullets);
        setActiveTab(Object.keys(generatedScripts)[0]);
        setLocalChanges({});
        initializationRef.current = true;
        toast.success("Scripts generated successfully!");
      } else {
        toast.error("Scripts generated but failed to load");
      }
    } catch (error) {
      console.error("Error generating scripts:", error);
      toast.error("Failed to generate scripts");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    const noScriptsYet = Object.keys(scripts || {}).length === 0;
    if (
      paperId &&
      noScriptsYet &&
      !generating &&
      !apiLoading &&
      !autoGenerateRef.current
    ) {
      autoGenerateRef.current = true;
      handleGenerateScripts();
    }
  }, [paperId, scripts, generating, apiLoading]);

  const handleSaveScripts = async () => {
    if (!paperId) return;
    setSavingScripts(true);
    try {
      const sectionsData = {};
      Object.keys(editedScripts).forEach((section) => {
        sectionsData[section] = {
          script: editedScripts[section] || "",
          bullet_points: bulletPoints[section] || [],
        };
      });
      await apiService.updateScriptsWithBullets(paperId, {
        sections: sectionsData,
      });
      setScripts(editedScripts);
      setLocalChanges({});
      toast.success("Scripts saved successfully!");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save scripts");
    } finally {
      setSavingScripts(false);
    }
  };

  const handleScriptChange = (section, value) => {
    updateScript(section, value);
    setLocalChanges((prev) => ({ ...prev, [section]: true }));
  };

  const handleBulletsChange = (section, bullets) => {
    updateBulletPoints(section, bullets);
    setLocalChanges((prev) => ({ ...prev, [section]: true }));
  };

  const openImageSelector = (section) => setImageSelectorSection(section);
  const closeImageSelector = () => setImageSelectorSection(null);

  const sectionKeys = Object.keys(editedScripts);
  const hasScripts = sectionKeys.length > 0;
  const hasChanges = Object.keys(localChanges).some((key) => localChanges[key]);

  /** Handle PPT template selection - opens the template selector modal */
  const handleContinueToPPT = () => {
    if (hasChanges)
      return toast.error("Please save your changes before continuing");
    if (savingScripts)
      return toast.error("Please wait for scripts to finish saving");
    if (!editedScripts || Object.keys(editedScripts).length === 0)
      return toast.error("Please generate scripts first");

    // If multiple languages available, show language selector first
    if (availableLanguages.length > 1) {
      setPendingAction("ppt");
      setShowLanguageSelector(true);
      return;
    }

    // Otherwise, open template selector directly
    setShowTemplateSelector(true);
  };

  /** Handle template selection and generate PPT */
  const handleSelectTemplate = async (templateType) => {
    if (!paperId) return toast.error("Paper ID not found");

    setGeneratingPPT(true);
    try {
      await apiService.generateSlides(
        paperId,
        "powerpoint",
        templateType,
        selectedLanguage,
      );

      sessionStorage.setItem("presentation_format", "powerpoint");
      sessionStorage.setItem("template_type", templateType);
      if (selectedLanguage)
        sessionStorage.setItem("slide_language", selectedLanguage);

      try {
        Analytics.track("PPT Generated with Template", {
          timestamp: new Date().toISOString(),
          paper_id: paperId || null,
          template_type: templateType,
          format: "powerpoint",
          language: selectedLanguage,
        });
      } catch (e) {
        // ignore analytics errors
      }

      toast.success(
        `PPT generated successfully with ${templateType} template!`,
      );
      setShowTemplateSelector(false);
      progressToNextStep();
    } catch (error) {
      console.error("Error generating PPT:", error);
      toast.error("Failed to generate PPT");
    } finally {
      setGeneratingPPT(false);
    }
  };

  /** Continue to Slides (Beamer) - direct call without template selection */
  const handleContinueToSlides = async () => {
    if (hasChanges)
      return toast.error("Please save your changes before continuing");
    if (savingScripts)
      return toast.error("Please wait for scripts to finish saving");
    if (!editedScripts || Object.keys(editedScripts).length === 0)
      return toast.error("Please generate scripts first");

    // If multiple languages available, show language selector first
    if (availableLanguages.length > 1) {
      setPendingAction("pdf");
      setShowLanguageSelector(true);
      return;
    }

    // Otherwise, proceed directly with PDF generation
    await proceedToSlides(selectedLanguage);
  };

  // Helper function to handle PDF slides generation
  const proceedToSlides = async (language) => {
    const templateType = "template1"; // default for PDF (beamer)
    setGeneratingSlides(true);

    try {
      await apiService.generateSlides(
        paperId,
        "beamer",
        templateType,
        language,
      );

      sessionStorage.setItem("presentation_format", "beamer");
      sessionStorage.setItem("template_type", templateType);
      if (language) sessionStorage.setItem("slide_language", language);

      try {
        Analytics.track("Continue to Slides (Generated)", {
          timestamp: new Date().toISOString(),
          paper_id: paperId || null,
          format: "beamer",
          template_type: templateType,
          language: language,
        });
      } catch (e) {
        // ignore analytics errors
      }

      toast.success(
        `Slides (PDF) generated successfully with ${templateType}!`,
      );
      progressToNextStep();
    } catch (error) {
      console.error("Error generating Slides (beamer):", error);
      toast.error("Failed to generate PDF slides");
    } finally {
      setGeneratingSlides(false);
    }
  };

  const breadcrumbs = [
    { label: "Script Generation", href: "/script-generation" },
  ];

  if (!paperId) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="text-center py-12">
          <FiEdit3 className="w-16 h-16 text-neutral-400 dark:text-neutral-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-2">
            No Paper Selected
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400">
            Please upload a paper first to generate scripts.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <div className="max-w-7xl mx-auto space-y-0">
        {/* Action Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 rounded-md p-6 border border-neutral-300 dark:border-neutral-600 space-y-6 mb-2"
        >
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">
              {metadata?.title || "Generate Presentation Scripts"}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Create and customize scripts with bullet points for your academic
              presentation
            </p>
          </div>

          {(generating || savingScripts) && (
            <div className="h-1 rounded bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
              <div className="h-full w-full animate-pulse bg-neutral-700 dark:bg-neutral-400" />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGenerateScripts}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 
                         bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 
                         text-white font-medium rounded-md transition-colors duration-150"
            >
              {generating ? (
                <>
                  <LoadingSpinner size="sm" /> Generating
                </>
              ) : (
                <>
                  <FiRefreshCw className="w-4 h-4" />
                  {hasScripts ? "Regenerate" : "Generate"}
                </>
              )}
            </button>

            {hasScripts && (
              <>
                <button
                  onClick={handleSaveScripts}
                  disabled={savingScripts}
                  className="flex items-center gap-2 px-4 py-2 
                             bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 
                             text-white font-medium rounded-md transition-colors duration-150"
                >
                  {savingScripts ? (
                    <>
                      <LoadingSpinner size="sm" /> Saving
                    </>
                  ) : (
                    <>
                      <FiSave className="w-4 h-4" /> Save Scripts
                    </>
                  )}
                </button>

                <button
                  onClick={handleContinueToSlides}
                  disabled={hasChanges || savingScripts || generatingSlides}
                  className="flex items-center gap-2 px-4 py-2 
                            bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 
                            text-white font-medium rounded-md transition-colors duration-150"
                >
                  {generatingSlides ? (
                    <>
                      <LoadingSpinner size="sm" /> Generating
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-4 h-4" /> Continue to PDF
                    </>
                  )}
                </button>

                <button
                  onClick={handleContinueToPPT}
                  disabled={hasChanges || savingScripts || generatingPPT}
                  title="Build a PPT instead of LaTeX slides"
                  className="flex items-center gap-2 px-4 py-2 
                             bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 
                             text-white font-medium rounded-md transition-colors duration-150"
                >
                  {generatingPPT ? (
                    <>
                      <LoadingSpinner size="sm" /> Generating
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-4 h-4" /> Continue to PPT
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </motion.div>

        {hasScripts && (
          <ChromeTabs
            tabs={Object.keys(editedScripts).map((k) => ({
              id: k,
              title: k.replace(/_/g, " "),
              hasChanges: localChanges[k] || false,
              isCompleted: bulletPoints[k]?.length > 0,
            }))}
            activeTab={activeTab}
            onTabClick={setActiveTab}
          />
        )}

        {hasScripts && activeTab && (
          <SectionPanel
            key={activeTab}
            section={activeTab}
            script={editedScripts[activeTab]}
            onScriptChange={handleScriptChange}
            bullets={bulletPoints[activeTab] || []}
            onBulletsChange={handleBulletsChange}
            selectedImage={selectedImages[activeTab]}
            onSelectImage={(s) => setImageSelectorSection(s)}
            paperId={paperId}
            images={images}
            savingScripts={savingScripts}
            generateBullets={async () => []}
            hasLocalChanges={localChanges[activeTab]}
          />
        )}

        {!hasScripts && !apiLoading && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12 bg-neutral-50 dark:bg-neutral-800 rounded-md border-2 border-dashed border-neutral-300 dark:border-neutral-600"
          >
            <FiEdit3 className="w-16 h-16 text-neutral-400 dark:text-neutral-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
              No Scripts Generated Yet
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              Click "Generate" to let the AI create narration scripts from your
              paper.
            </p>
            <button
              onClick={handleGenerateScripts}
              disabled={generating}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors duration-150 mx-auto"
            >
              <FiPlay className="w-4 h-4" /> Generate Scripts
            </button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {imageSelectorSection && (
          <ImageSelector
            paperId={paperId}
            sectionName={imageSelectorSection}
            images={images}
            selectedImage={selectedImages[imageSelectorSection]}
            onSelect={(imgName) => {
              // backend assignment is handled *inside* ImageSelector.handleUseSelected
              setSelectedImage(imageSelectorSection, imgName);
            }}
            onClose={() => setImageSelectorSection(null)}
          />
        )}
      </AnimatePresence>

      {/* Language Selection Modal */}
      {showLanguageSelector && availableLanguages.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowLanguageSelector(false)}
          />
          <motion.div
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 w-full max-w-md bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {pendingAction === "ppt"
                ? "Select Language for PPT"
                : "Select Language for PDF"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose language for the output document.
            </p>

            <div className="mb-4 space-y-2">
              {availableLanguages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguage(lang)}
                  className={`w-full text-left px-4 py-2 rounded-md transition-colors duration-150 ${
                    selectedLanguage === lang ||
                    (!selectedLanguage && lang === availableLanguages[0])
                      ? "bg-gray-900 dark:bg-neutral-700 text-white font-semibold"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowLanguageSelector(false);
                  setPendingAction(null);
                }}
                className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const langToUse = selectedLanguage || availableLanguages[0];
                  setShowLanguageSelector(false);
                  if (pendingAction === "ppt") {
                    setSelectedLanguage(langToUse);
                    setShowTemplateSelector(true);
                  } else if (pendingAction === "pdf") {
                    await proceedToSlides(langToUse);
                  }
                  setPendingAction(null);
                }}
                className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white text-sm"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelectTemplate={handleSelectTemplate}
        isLoading={generatingPPT}
      />
    </Layout>
  );
};

export default ScriptGeneration;
