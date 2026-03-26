import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiImage, FiCheck, FiLoader, FiUpload, FiPlus } from 'react-icons/fi';
import { apiService } from '../../services/api';
import Pagination from '../common/Pagination';
import toast from '../../services/toastService';

const ImageThumbnail = ({ imageName, imageUrl, isSelected, onSelect, loading }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => onSelect(imageName)}
    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-150 ${
      isSelected
        ? 'border-gray-700 ring-2 ring-gray-200 dark:ring-gray-800'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
    }`}
  >
    {loading ? (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <FiLoader className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    ) : imageUrl ? (
      <img
        src={imageUrl}
        alt={imageName}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    ) : (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <FiImage className="w-8 h-8 text-gray-400" />
      </div>
    )}

    {isSelected && (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="absolute top-2 right-2 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center shadow-lg"
      >
        <FiCheck className="w-4 h-4 text-white" />
      </motion.div>
    )}

    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-2 truncate">
      {imageName}
    </div>
  </motion.button>
);

const PendingUploadTile = ({ previewUrl, name, isSelected, onSelect, uploading }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => onSelect('__pending__')}
    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-150 ${
      isSelected
        ? 'border-gray-700 ring-2 ring-gray-200 dark:ring-gray-800'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
    }`}
  >
    {uploading ? (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <FiLoader className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    ) : previewUrl ? (
      <img src={previewUrl} alt={name} className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <FiImage className="w-8 h-8 text-gray-400" />
      </div>
    )}

    {isSelected && (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="absolute top-2 right-2 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center shadow-lg"
      >
        <FiCheck className="w-4 h-4 text-white" />
      </motion.div>
    )}

    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-2 truncate">
      {name || 'New image'}
    </div>
  </motion.button>
);

const NoImageOption = ({ isSelected, onSelect }) => (
  <motion.button
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.99 }}
    onClick={() => onSelect(null)}
    className={`w-full p-4 sm:p-6 border-2 border-dashed rounded-lg transition-all duration-150 ${
      isSelected ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
    }`}
  >
    <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
      <FiImage className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
      <span className="font-medium text-sm sm:text-base text-gray-600 dark:text-gray-300">No Image (Text Only Slide)</span>
      {isSelected && <FiCheck className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />}
    </div>
  </motion.button>
);

const ImageSelector = ({ paperId, sectionName = null, images = [], selectedImage, onSelect, onClose }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [imageUrls, setImageUrls] = useState({});
  const [loadingImages, setLoadingImages] = useState(new Set());
  const [localImages, setLocalImages] = useState(images || []);
  const [pendingUpload, setPendingUpload] = useState(null); // { file, previewUrl, name }
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(selectedImage ?? null);

  const fileRef = useRef();

  // pagination
  const imagesPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(localImages.length / imagesPerPage));
  const startIndex = (currentPage - 1) * imagesPerPage;
  const currentImages = localImages.slice(startIndex, startIndex + imagesPerPage);

  // sync parent selectedImage prop
  useEffect(() => {
    setSelected(selectedImage ?? null);
  }, [selectedImage]);

  // initial fetch available images
  useEffect(() => {
    setLocalImages(images || []);
    const fetchAvailable = async () => {
      if (!paperId) return;
      try {
        const res = await apiService.getAvailableImages(paperId);
        const data = Array.isArray(res.data) ? res.data : (res.data.image_files || []);
        const names = data.map((p) => (p ? p.split('/').slice(-1)[0] : p));
        setLocalImages(names);
      } catch (e) {
        // fallback to provided list
        console.debug('Failed fetching images, using provided images', e);
      }
    };
    fetchAvailable();
  }, [paperId, images]);

  // load image urls for current page
  useEffect(() => {
    const loadImageUrls = async () => {
      if (!paperId || !currentImages.length) return;
      setLoadingImages(new Set(currentImages));
      for (const imageName of currentImages) {
        if (!imageUrls[imageName]) {
          try {
            const url = apiService.getImageUrl(paperId, imageName);
            setImageUrls((prev) => ({ ...prev, [imageName]: url }));
          } catch (err) {
            console.error('Error building image url', err);
          }
        }
        setLoadingImages((prev) => {
          const newSet = new Set(prev);
          newSet.delete(imageName);
          return newSet;
        });
      }
    };
    loadImageUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, currentImages]);

  const refreshImages = async () => {
    if (!paperId) return;
    try {
      const res = await apiService.getAvailableImages(paperId);
      const data = Array.isArray(res.data) ? res.data : (res.data.image_files || []);
      const names = data.map((p) => (p ? p.split('/').slice(-1)[0] : p));
      setLocalImages(names);
      setCurrentPage(1);
    } catch (e) {
      console.error('Failed to refresh images', e);
      toast.error('Failed to refresh images');
    }
  };

  const handleImageSelect = (image) => {
    // image can be actual name, null for no-image, or '__pending__' for pending upload
    if (image === '__pending__') {
      setSelected('__pending__');
    } else {
      setSelected(image);
    }
  };

  const handleUploadClick = () => {
    if (!fileRef.current) return;
    fileRef.current.value = null;
    fileRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    // create preview and store pendingUpload (no network call yet)
    const previewUrl = URL.createObjectURL(file);
    setPendingUpload({ file, previewUrl, name: file.name });
    setSelected('__pending__');
  };

  const imageUrl = (name) => apiService.getImageUrl(paperId, name);

  // Use Selected Image button handler:
  // - if selected is pending upload -> upload to backend, then refresh, set selected name and call onSelect
  // - if selected is existing -> just call onSelect(selected)
  const handleUseSelected = async () => {
    if (selected === '__pending__' && pendingUpload) {
      if (!paperId) {
        toast.error('Missing paper id');
        return;
      }
      setUploading(true);
      const toastId = toast.loading('Uploading image...');
      try {
        const res = await apiService.uploadImageToSection(
          paperId,
          sectionName || '',
          pendingUpload.file
        );
        const uploadedName = res?.data?.image_name || pendingUpload.name;
        await refreshImages();
        URL.revokeObjectURL(pendingUpload.previewUrl);
        setPendingUpload(null);
        setSelected(uploadedName);

        // Update parent + close
        onSelect && onSelect(uploadedName);
        toast.success('Image uploaded and selected', { id: toastId });
        onClose && onClose();
      } catch (err) {
        console.error('Upload failed', err);
        toast.error('Upload failed', { id: toastId });
      } finally {
        setUploading(false);
      }
      return;
    }
    try {
      if (paperId && sectionName) {
        // selected can be: string | null
        await apiService.assignImageToSection(paperId, sectionName, selected || null);
      }

      onSelect && onSelect(selected);

      toast.success(
        selected
          ? 'Image assigned to this section'
          : 'Image removed for this section'
      );

      onClose && onClose();
    } catch (err) {
      console.error('Failed to assign image', err);
      toast.error('Failed to assign image to section');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-gray-900/20 rounded-md w-full max-w-6xl shadow-xl flex flex-col max-h-[95vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Select Slide Image</h3>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleUploadClick}
              disabled={uploading}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md text-xs sm:text-sm"
              title="Upload from device"
            >
              <FiUpload className="w-4 h-4" />
              <span className="hidden sm:inline">{uploading ? 'Uploading…' : 'Upload from device'}</span>
              <span className="sm:hidden">Upload</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-150"
            >
              <FiX className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {/* Content Area - Non-scrollable */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden">
          {/* No Image Option - Fixed at top */}
          <div className="mb-4 sm:mb-6 flex-shrink-0">
            <NoImageOption isSelected={selected === null} onSelect={handleImageSelect} />
          </div>

          {/* Images Grid - Only this scrolls */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {localImages.length === 0 && !pendingUpload ? (
              <div className="text-center py-8 sm:py-12">
                <FiImage className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
                <h4 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">No Images Available</h4>
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-4">No images were found in your paper. Upload from device to add images.</p>
                <button onClick={handleUploadClick} className="btn-primary text-sm sm:text-base">Upload an image</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 pb-2">
                  {/* First tile: visual upload + pending preview shown here as first tile */}
                  {pendingUpload ? (
                    <PendingUploadTile
                      previewUrl={pendingUpload.previewUrl}
                      name={pendingUpload.name}
                      isSelected={selected === '__pending__'}
                      onSelect={handleImageSelect}
                      uploading={uploading}
                    />
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleUploadClick}
                      className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center p-2 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                      title="Upload new image"
                    >
                      <div className="flex flex-col items-center justify-center gap-1 sm:gap-2">
                        <FiPlus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-500" />
                        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">Upload</div>
                      </div>
                    </motion.button>
                  )}

                  {currentImages.map((imageName) => (
                    <ImageThumbnail
                      key={imageName}
                      imageName={imageName}
                      imageUrl={imageUrls[imageName] || imageUrl(imageName)}
                      isSelected={selected === imageName}
                      onSelect={handleImageSelect}
                      loading={loadingImages.has(imageName)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={(p) => setCurrentPage(p)}
                      totalItems={localImages.length}
                      itemsPerPage={imagesPerPage}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6 bg-white dark:bg-gray-900/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {localImages.length + (pendingUpload ? 1 : 0)} image{localImages.length + (pendingUpload ? 1 : 0) !== 1 ? 's' : ''} available
            </div>

            <div className="flex gap-2 sm:gap-3">
              <button onClick={onClose} className="btn-secondary text-sm sm:text-base px-3 sm:px-4 py-2">Cancel</button>
              <button
                onClick={handleUseSelected}
                className="btn-primary text-sm sm:text-base px-3 sm:px-4 py-2"
                disabled={uploading}
              >
                <span className="hidden sm:inline">
                  {selected === '__pending__' ? (uploading ? 'Uploading…' : 'Upload & Use') : (selected ? 'Use Selected Image' : 'Use No Image')}
                </span>
                <span className="sm:hidden">
                  {selected === '__pending__' ? (uploading ? 'Upload…' : 'Upload') : (selected ? 'Use Image' : 'No Image')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ImageSelector;