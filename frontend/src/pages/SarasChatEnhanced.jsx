import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import apiService from "../services/api";
import { extractPaperId } from "../utils/arxiv";
import MarkdownRenderer from "../components/MarkdownRenderer";
import PdfViewer from "../components/PdfViewer";
import "../styles/pdf-viewer.css";

const SarasChatEnhanced = () => {
	const navigate = useNavigate();
	const [paperId, setPaperId] = useState("");
	const [messages, setMessages] = useState([]);
	const [inputMessage, setInputMessage] = useState("");
	const [loading, setLoading] = useState(false);
	const [analyzing, setAnalyzing] = useState(false);
	const [summary, setSummary] = useState(null);
	const [analysis, setAnalysis] = useState(null);
	const [showPdfViewer, setShowPdfViewer] = useState(false);
	const [pdfUrl, setPdfUrl] = useState(null);
	const [highlightedSection, setHighlightedSection] = useState(null);
	const messagesEndRef = useRef(null);

	// Get paper ID from localStorage on mount
	useEffect(() => {
		const storedPaperId = localStorage.getItem("current_paper_id");
		if (storedPaperId) {
			setPaperId(storedPaperId);
		}
	}, []);

	// Auto-scroll to bottom of messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Analyze paper
	const handleAnalyze = async () => {
		if (!paperId) {
			toast.error("Please enter a paper ID");
			return;
		}

		const actualPaperId = extractPaperId(paperId);
		if (!actualPaperId) {
			toast.error("Invalid paper ID or URL");
			return;
		}

		setAnalyzing(true);
		const toastId = toast.loading("Analyzing paper with OpenDataLoader...");

		try {
			const response = await apiService.analyzePaper(actualPaperId);
			setAnalysis(response.data);

			// Prepare PDF URL for viewing
			if (response.data.annotated_pdf_path) {
				const baseURL = apiService.getBaseURL();
				const pdfUrlPath = `${baseURL}/api/saras/download-annotated/${actualPaperId}`;
				setPdfUrl(pdfUrlPath);
			}

			toast.success("Paper analyzed successfully!", { id: toastId });
		} catch (error) {
			console.error("Analysis error:", error);
			toast.error(
				error.response?.data?.detail || "Failed to analyze paper",
				{ id: toastId }
			);
		} finally {
			setAnalyzing(false);
		}
	};

	// Get summary
	const handleGetSummary = async () => {
		if (!paperId) {
			toast.error("Please enter a paper ID");
			return;
		}

		const actualPaperId = extractPaperId(paperId);
		if (!actualPaperId) {
			toast.error("Invalid paper ID or URL");
			return;
		}

		setLoading(true);

		try {
			const response = await apiService.getPaperSummary(actualPaperId);
			setSummary(response.data.summary);

			// Add summary as a system message
			setMessages(prev => [
				...prev,
				{ role: "assistant", content: `## 📝 Paper Summary\n\n${response.data.summary}`, type: "summary" }
			]);

			toast.success("Summary loaded!");
		} catch (error) {
			console.error("Summary error:", error);
			toast.error(error.response?.data?.detail || "Failed to get summary");
		} finally {
			setLoading(false);
		}
	};

	// Send chat message
	const handleSendMessage = async () => {
		if (!paperId) {
			toast.error("Please enter a paper ID");
			return;
		}

		if (!inputMessage.trim()) {
			toast.error("Please enter a message");
			return;
		}

		const actualPaperId = extractPaperId(paperId);
		if (!actualPaperId) {
			toast.error("Invalid paper ID or URL");
			return;
		}

		const userMessage = inputMessage.trim();
		setInputMessage("");

		// Add user message to chat
		const newMessages = [...messages, { role: "user", content: userMessage }];
		setMessages(newMessages);

		setLoading(true);

		try {
			const historyToSend = newMessages.slice(-10); // Send last 10 messages as history
			const response = await apiService.chatWithSaras(actualPaperId, userMessage, undefined, historyToSend);

			// Add assistant response to chat
			setMessages([
				...newMessages,
				{
					role: "assistant",
					content: response.data.answer,
					groundingMetadata: response.data.grounding_metadata
				},
			]);
		} catch (error) {
			console.error("Chat error:", error);
			toast.error(error.response?.data?.detail || "Failed to send message");
			// Remove user message on error
			setMessages(messages);
		} finally {
			setLoading(false);
		}
	};

	// Handle section click from markdown
	const handleSectionClick = (sectionId) => {
		setHighlightedSection(sectionId);
		if (!showPdfViewer && pdfUrl) {
			setShowPdfViewer(true);
		}
		toast.success(`Navigating to section: ${sectionId}`);
	};

	// Handle asking about selected text from PDF
	const handleAskAboutSelection = (selectedText) => {
		const question = `Explain this part from the paper: "${selectedText}"`;
		setInputMessage(question);
		// Optionally auto-send the message
		// handleSendMessage();
	};

	// Toggle PDF viewer
	const togglePdfViewer = () => {
		if (!pdfUrl) {
			toast.error("Please analyze the paper first to view the annotated PDF");
			return;
		}
		setShowPdfViewer(!showPdfViewer);
	};

	const handleKeyPress = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className={`max-w-7xl mx-auto transition-all duration-300 ${showPdfViewer ? 'mr-[50%]' : ''}`}>
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold text-gray-900 mb-4">
						SARAS - Smart arXiv Research Assistant
					</h1>
					<p className="text-lg text-gray-600">
						Interactive AI-powered paper analysis with OpenDataLoader
					</p>
				</div>

				{/* Configuration Panel */}
				<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
					<h2 className="text-2xl font-semibold mb-6 text-gray-900">Paper Selection</h2>

					{/* Paper ID Input */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Paper ID or arXiv URL
						</label>
						<input
							type="text"
							value={paperId}
							onChange={(e) => setPaperId(e.target.value)}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
							placeholder="1706.03762 or https://arxiv.org/abs/1706.03762"
						/>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-4">
						<button
							onClick={handleAnalyze}
							disabled={!paperId || analyzing || loading}
							className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{loading ? "Loading..." : analyzing ? "Analyzing..." : "Analyze Paper"}
						</button>

						<button
							onClick={handleGetSummary}
							disabled={!paperId || loading}
							className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{loading ? "Loading..." : "Get Summary"}
						</button>

						{pdfUrl && (
							<button
								onClick={togglePdfViewer}
								className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
							>
								{showPdfViewer ? "Hide PDF" : "View Annotated PDF"}
							</button>
						)}
					</div>
				</div>

				{/* Analysis Results - Compact Version */}
				{analysis && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">Analysis Overview</h2>

						{/* Quick Stats */}
						<div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
							<div className="bg-blue-50 rounded-lg p-4 text-center">
								<p className="text-2xl font-bold text-blue-600">{analysis.statistics.total_pages || 0}</p>
								<p className="text-sm text-gray-600">Pages</p>
							</div>
							<div className="bg-green-50 rounded-lg p-4 text-center">
								<p className="text-2xl font-bold text-green-600">{analysis.statistics.total_words?.toLocaleString() || 0}</p>
								<p className="text-sm text-gray-600">Words</p>
							</div>
							<div className="bg-purple-50 rounded-lg p-4 text-center">
								<p className="text-2xl font-bold text-purple-600">{analysis.statistics.elements?.tables || 0}</p>
								<p className="text-sm text-gray-600">Tables</p>
							</div>
							<div className="bg-orange-50 rounded-lg p-4 text-center">
								<p className="text-2xl font-bold text-orange-600">{analysis.statistics.elements?.figures || 0}</p>
								<p className="text-sm text-gray-600">Figures</p>
							</div>
							<div className="bg-pink-50 rounded-lg p-4 text-center">
								<p className="text-2xl font-bold text-pink-600">{analysis.statistics.elements?.equations || 0}</p>
								<p className="text-sm text-gray-600">Equations</p>
							</div>
						</div>

						{analysis.annotated_pdf_path && !showPdfViewer && (
							<button
								onClick={togglePdfViewer}
								className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-colors font-medium"
							>
								View Interactive Annotated PDF
							</button>
						)}
					</div>
				)}

				{/* Chat Interface */}
				<div className="bg-white rounded-lg shadow-lg p-6">
					<h2 className="text-2xl font-semibold mb-6 flex items-center justify-between">
						<span>💬 Chat with Paper</span>
						{messages.length > 0 && (
							<button
								onClick={() => setMessages([])}
								className="text-sm px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
							>
								Clear Chat
							</button>
						)}
					</h2>

					{/* Messages */}
					<div className="mb-6 h-[500px] overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-4">
						{messages.length === 0 ? (
							<div className="text-center text-gray-500 mt-16">
								<div className="text-6xl mb-4">💬</div>
								<p className="text-xl font-semibold mb-2">Start a conversation</p>
								<p className="text-sm">Ask questions, request explanations, or discuss concepts</p>
								<div className="mt-6 space-y-2 text-left max-w-md mx-auto">
									<p className="text-sm text-gray-600">Try asking:</p>
									<button
										onClick={() => setInputMessage("What is the main contribution of this paper?")}
										className="w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 text-sm border border-gray-200"
									>
										"What is the main contribution of this paper?"
									</button>
									<button
										onClick={() => setInputMessage("Explain the methodology used")}
										className="w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 text-sm border border-gray-200"
									>
										"Explain the methodology used"
									</button>
									<button
										onClick={() => setInputMessage("What are the key findings?")}
										className="w-full text-left px-4 py-2 bg-white rounded-lg hover:bg-blue-50 text-sm border border-gray-200"
									>
										"What are the key findings?"
									</button>
								</div>
							</div>
						) : (
							<>
								{messages.map((message, index) => (
									<div
										key={index}
										className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
									>
										<div
											className={`max-w-[85%] px-5 py-4 rounded-lg ${message.role === "user"
												? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
												: "bg-white border-2 border-gray-200 text-gray-800 shadow-sm"
												}`}
										>
											<p className="text-xs font-semibold mb-2 opacity-75">
												{message.role === "user" ? "You" : "SARAS"}
											</p>
											<div className="prose prose-sm max-w-none">
												{message.role === "user" ? (
													<p className="whitespace-pre-wrap break-words">{message.content}</p>
												) : (
													<MarkdownRenderer
														content={message.content}
														onSectionClick={handleSectionClick}
													/>
												)}
											</div>
											{message.groundingMetadata && (
												<div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
													<p className="font-semibold mb-1">Sources:</p>
													<p className="italic">Grounded with web search and citations</p>
												</div>
											)}
										</div>
									</div>
								))}
								<div ref={messagesEndRef} />
							</>
						)}
					</div>

					{/* Input */}
					<div className="flex gap-3">
						<textarea
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder="Ask a question about the paper..."
							className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-black transition-all"
							rows={3}
							disabled={loading}
						/>
						<button
							onClick={handleSendMessage}
							disabled={!paperId || !inputMessage.trim() || loading}
							className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
						>
							{loading ? "Sending..." : "Send"}
						</button>
					</div>
				</div>

				{/* Features Info */}
				<div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border-2 border-blue-200">
					<h3 className="text-lg font-semibold mb-3 text-blue-900">
						Interactive Features
					</h3>
					<ul className="space-y-2 text-sm text-blue-800">
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Section Highlighting:</strong> Click on section references in answers to jump to that part in the annotated PDF</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Right-Click to Ask:</strong> Select text in PDF, right-click, and ask questions about it directly</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Download PDF:</strong> Download the annotated PDF for offline viewing</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Markdown Support:</strong> Answers are beautifully formatted with code highlighting, tables, and lists</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Scrollable PDF Viewer:</strong> View all pages of the annotated PDF side-by-side while chatting</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Web Search Integration:</strong> Ask about recent papers and get AI-powered search results</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>Smart Caching:</strong> Faster responses with automatic request caching</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2 text-blue-600">•</span>
							<span><strong>OpenDataLoader:</strong> Extracts tables, figures, equations, and document structure</span>
						</li>
					</ul>
				</div>
			</div>

			{/* PDF Viewer Sidebar */}
			{showPdfViewer && pdfUrl && (
				<PdfViewer
					pdfUrl={pdfUrl}
					highlightSection={highlightedSection}
					onClose={() => setShowPdfViewer(false)}
					onAskAboutSelection={handleAskAboutSelection}
				/>
			)}
		</div>
	);
};

export default SarasChatEnhanced;
