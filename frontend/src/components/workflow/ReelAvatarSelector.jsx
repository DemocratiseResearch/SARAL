import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import toast from '../../services/toastService';
import { apiService } from "../../services/api";
import LoadingSpinner from "../common/LoadingSpinner";

// Import all avatar images
import prof1 from "../../assets/prof1.png";
import prof2 from "../../assets/prof2.png";
import student1 from "../../assets/student1.png";
import student2 from "../../assets/student2.png";

// Map filename to imported image
const avatarImageMap = {
  "prof1.png": prof1,
  "prof2.png": prof2,
  "student1.png": student1,
  "student2.png": student2,
};

const getAvatarImage = (filename) => {
  return avatarImageMap[filename] || null;
};

const ReelAvatarSelector = ({ paperId, onBack, onGenerate }) => {
  const [avatarPairs, setAvatarPairs] = useState([]);
  const [selectedPairId, setSelectedPairId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        setIsLoading(true);
        const resp = await apiService.reel.getAvailableAvatars();
        const pairs = resp?.data?.avatar_pairs || [];
        setAvatarPairs(pairs);

        // Auto-select first pair
        if (pairs.length > 0) {
          setSelectedPairId(pairs[0].id);
        }
      } catch (error) {
        const errorMessage =
          error.response?.data?.detail || "Failed to load avatars";
        toast.error(errorMessage);
        console.error("Avatar fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvatars();
  }, [paperId]);

  const handleGenerate = async () => {
    if (!selectedPairId) {
      toast.error("Please select an avatar pair");
      return;
    }

    setIsSelecting(true);
    try {
      await apiService.reel.selectAvatars(paperId, selectedPairId);
      toast.success("Avatars selected! Starting reel generation...");
      onGenerate();
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to select avatars";
      toast.error(errorMessage);
      console.error("Avatar selection error:", error);
    } finally {
      setIsSelecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto pt-20 px-4 pb-20">
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-5 px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Choose Avatar Pair
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select the avatars that will appear in your reel.
          </p>
        </div>

        {/* Avatar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {avatarPairs.map((pair) => (
            <motion.button
              key={pair.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedPairId(pair.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedPairId === pair.id
                  ? "border-slate-300 bg-gray-200 dark:bg-slate-900"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-neutral-800"
              }`}
            >
              <div className="space-y-3">
                {/* Avatar Name */}
                <div className="font-semibold text-gray-900 dark:text-white">
                  {pair.name}
                </div>

                {/* Avatar Images */}
                <div className="flex gap-3">
                  {/* Male Avatar */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Male
                    </div>
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      {pair.male_avatar ? (
                        <img
                          src={getAvatarImage(pair.male_avatar)}
                          alt="Male avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="text-sm text-gray-400">No image</div>
                      )}
                    </div>
                  </div>

                  {/* Female Avatar */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Female
                    </div>
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      {pair.female_avatar ? (
                        <img
                          src={getAvatarImage(pair.female_avatar)}
                          alt="Female avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="text-sm text-gray-400">No image</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {pair.description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 italic">
                    {pair.description}
                  </div>
                )}

                {/* Selection Indicator */}
                {selectedPairId === pair.id && (
                  <div className="flex items-center justify-center mt-2 text-black dark:text-white">
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M20 6L9 17l-5-5"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="ml-1 text-sm font-semibold">Selected</span>
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onBack}
            disabled={isSelecting}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium transition-colors disabled:opacity-50"
          >
            <FiChevronLeft className="w-5 h-5" />
            Back
          </button>
          <button
            onClick={handleGenerate}
            disabled={isSelecting || !selectedPairId}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-black dark:bg-slate-800 dark:hover:bg-slate-700 hover:bg-gray-800 text-white font-medium transition-colors disabled:opacity-50"
          >
            {isSelecting ? (
              <>
                <LoadingSpinner size="sm" />
                Starting...
              </>
            ) : (
              <>
                Generate Reel
                <FiChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ReelAvatarSelector;