import React from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const handlePrev = () => currentPage > 1 && onPageChange(currentPage - 1);
  const handleNext = () => currentPage < totalPages && onPageChange(currentPage + 1);

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={handlePrev}
        disabled={currentPage === 1}
        className="p-2 rounded-md border border-gray-300 dark:border-gray-700 disabled:opacity-50"
      >
        <FiChevronLeft />
      </button>

      <span className="text-sm text-gray-700 dark:text-gray-300">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        className="p-2 rounded-md border border-gray-300 dark:border-gray-700 disabled:opacity-50"
      >
        <FiChevronRight />
      </button>
    </div>
  );
};

export default Pagination;