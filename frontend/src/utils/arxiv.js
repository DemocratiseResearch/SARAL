/**
 * Extract paper ID from arxiv URL or return the ID as-is
 * Supports formats:
 * - https://arxiv.org/abs/1706.03762
 * - https://arxiv.org/pdf/1706.03762.pdf
 * - arxiv.org/abs/1706.03762
 * - 1706.03762 (direct ID)
 */
export const extractPaperId = (input) => {
	if (!input) return "";

	const trimmed = input.trim();

	// Match arxiv URL patterns
	const patterns = [
		/arxiv\.org\/abs\/([0-9]+\.[0-9]+)/i,
		/arxiv\.org\/pdf\/([0-9]+\.[0-9]+)/i,
	];

	for (const pattern of patterns) {
		const match = trimmed.match(pattern);
		if (match) {
			return match[1];
		}
	}

	// If no URL pattern matched, return as-is (assuming it's already a paper ID)
	return trimmed;
};

/**
 * Validate if a string is a valid arxiv paper ID format
 */
export const isValidPaperId = (paperId) => {
	if (!paperId) return false;
	// arxiv IDs are in format YYMM.NNNNN (e.g., 1706.03762)
	return /^[0-9]{4}\.[0-9]{5}$/.test(paperId);
};
