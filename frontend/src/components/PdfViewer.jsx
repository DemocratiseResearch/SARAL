import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const PdfViewer = ({ pdfUrl, highlightSection, onClose, onAskAboutSelection }) => {
	const [numPages, setNumPages] = useState(null);
	const [scale, setScale] = useState(1.0);
	const [loading, setLoading] = useState(true);
	const [selectedText, setSelectedText] = useState('');
	const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
	const pdfContainerRef = useRef(null);

	// Get auth token from localStorage
	const getAuthToken = () => {
		try {
			return localStorage.getItem('auth_token');
		} catch (error) {
			console.warn('Failed to get token from localStorage:', error);
			return null;
		}
	};

	// Configure PDF loading options with auth headers
	const pdfLoadOptions = {
		httpHeaders: {
			Authorization: `Bearer ${getAuthToken()}`,
		},
		cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
		cMapPacked: true,
	};

	useEffect(() => {
		if (highlightSection) {
			// Jump to section if specified
			console.log('Highlighting section:', highlightSection);
			// Could implement page jump logic here based on section mapping
		}
	}, [highlightSection]);

	// Handle right-click context menu - only in PDF area
	const handleContextMenu = (e) => {
		e.preventDefault();
		e.stopPropagation();

		// Get selected text at the moment of right-click
		const selection = window.getSelection();
		const text = selection.toString().trim();

		// Check if the selection is within the PDF container
		if (text && pdfContainerRef.current && pdfContainerRef.current.contains(selection.anchorNode)) {
			setSelectedText(text);
			setContextMenu({
				visible: true,
				x: e.clientX,
				y: e.clientY,
			});
		}
	};

	// Close context menu
	const closeContextMenu = () => {
		setContextMenu({ visible: false, x: 0, y: 0 });
		setSelectedText('');
	};

	// Ask about selected text
	const handleAskAboutText = () => {
		if (selectedText && onAskAboutSelection) {
			onAskAboutSelection(selectedText);
			closeContextMenu();
			setSelectedText('');
		}
	};

	// Download PDF
	const handleDownload = async () => {
		try {
			const token = getAuthToken();
			const response = await fetch(pdfUrl, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `annotated_paper_${Date.now()}.pdf`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Download error:', error);
			alert('Failed to download PDF');
		}
	};

	function onDocumentLoadSuccess({ numPages }) {
		setNumPages(numPages);
		setLoading(false);
	}

	function onDocumentLoadError(error) {
		console.error('Error loading PDF:', error);
		setLoading(false);
	}

	const zoomIn = () => {
		setScale((prev) => Math.min(prev + 0.2, 3.0));
	};

	const zoomOut = () => {
		setScale((prev) => Math.max(prev - 0.2, 0.5));
	};

	return (
		<div className="fixed right-0 top-0 h-full w-1/2 bg-white border-l-2 border-gray-300 shadow-2xl z-50 flex flex-col">
			{/* Header */}
			<div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex justify-between items-center">
				<h3 className="text-lg font-semibold">Annotated PDF Viewer</h3>
				<button
					onClick={onClose}
					className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
					title="Close viewer"
				>
					<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{/* Controls */}
			<div className="bg-gray-100 p-3 flex items-center justify-between border-b">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						{numPages ? `${numPages} pages` : 'Loading...'}
					</span>
					<button
						onClick={handleDownload}
						className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
						title="Download PDF"
					>
						Download
					</button>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={zoomOut}
						className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
						title="Zoom out"
					>
						−
					</button>
					<span className="text-sm font-medium">{Math.round(scale * 100)}%</span>
					<button
						onClick={zoomIn}
						className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
						title="Zoom in"
					>
						+
					</button>
				</div>
			</div>

			{/* PDF Content - Scrollable */}
			<div
				ref={pdfContainerRef}
				className="flex-1 overflow-auto bg-gray-200 p-4"
				onContextMenu={handleContextMenu}
				onClick={closeContextMenu}
			>
				{loading && (
					<div className="flex items-center justify-center h-full">
						<div className="text-center">
							<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
							<p className="text-gray-600">Loading PDF...</p>
						</div>
					</div>
				)}

				<div className="flex flex-col items-center gap-4">
					<Document
						file={{
							url: pdfUrl,
							httpHeaders: pdfLoadOptions.httpHeaders,
						}}
						onLoadSuccess={onDocumentLoadSuccess}
						onLoadError={onDocumentLoadError}
						loading=""
						options={{
							cMapUrl: pdfLoadOptions.cMapUrl,
							cMapPacked: pdfLoadOptions.cMapPacked,
						}}
					>
						{Array.from(new Array(numPages), (el, index) => (
							<Page
								key={`page_${index + 1}`}
								pageNumber={index + 1}
								scale={scale}
								renderTextLayer={true}
								renderAnnotationLayer={true}
								className="mb-4 shadow-lg"
							/>
						))}
					</Document>
				</div>
			</div>

			{/* Context Menu */}
			{contextMenu.visible && (
				<div
					className="fixed bg-white border-2 border-gray-300 rounded-lg shadow-xl z-50 py-2"
					style={{ top: contextMenu.y, left: contextMenu.x }}
				>
					<button
						onClick={handleAskAboutText}
						className="w-full px-4 py-2 text-left hover:bg-blue-50 flex items-center gap-2"
					>
						<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
						</svg>
						<span className="text-sm font-medium">Ask about this text</span>
					</button>
				</div>
			)}

			{/* Section highlight indicator */}
			{highlightSection && (
				<div className="bg-yellow-100 border-t-2 border-yellow-400 p-3">
					<p className="text-sm text-yellow-800">
						Highlighting section: <strong>{highlightSection}</strong>
					</p>
				</div>
			)}
		</div>
	);
};

export default PdfViewer;
