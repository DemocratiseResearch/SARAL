import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import apiService from "../services/api";
import { extractPaperId } from "../utils/arxiv";

const SarasChat = () => {
	const navigate = useNavigate();
	const [paperId, setPaperId] = useState("");
	const [messages, setMessages] = useState([]);
	const [inputMessage, setInputMessage] = useState("");
	const [loading, setLoading] = useState(false);
	const [analyzing, setAnalyzing] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [summary, setSummary] = useState(null);
	const [analysis, setAnalysis] = useState(null);

	// Get paper ID from localStorage on mount
	useEffect(() => {
		const storedPaperId = localStorage.getItem("current_paper_id");
		if (storedPaperId) {
			setPaperId(storedPaperId);
		}
	}, []);

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
				{ role: "assistant", content: response.data.answer },
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

	// Download annotated PDF
	const handleDownloadAnnotatedPdf = async () => {
		if (!paperId) {
			toast.error("Please enter a paper ID");
			return;
		}

		const actualPaperId = extractPaperId(paperId);
		if (!actualPaperId) {
			toast.error("Invalid paper ID or URL");
			return;
		}

		setDownloading(true);
		const toastId = toast.loading("Downloading annotated PDF...");

		try {
			const response = await apiService.downloadAnnotatedPdf(actualPaperId);

			// Create blob URL and trigger download
			const blob = new Blob([response.data], { type: "application/pdf" });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `annotated_${actualPaperId}.pdf`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			toast.success("PDF downloaded successfully!", { id: toastId });
		} catch (error) {
			console.error("Download error:", error);
			toast.error(
				error.response?.data?.detail || "Failed to download PDF",
				{ id: toastId }
			);
		} finally {
			setDownloading(false);
		}
	};

	const handleKeyPress = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold text-gray-900 mb-4">
						SARAS - Smart arXiv Research Assistant
					</h1>
					<p className="text-lg text-gray-600">
						Chat with research papers using AI-powered analysis
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
							{loading ? "Loading..." : analyzing ? "Analyzing..." : "📊 Analyze Paper"}
						</button>

						<button
							onClick={handleGetSummary}
							disabled={!paperId || loading}
							className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{loading ? "Loading..." : "📝 Get Summary"}
						</button>
					</div>
				</div>

				{/* Analysis Results */}
				{analysis && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">📊 Analysis Results</h2>
						<div className="space-y-6">
							{/* Statistics Overview */}
							{analysis.statistics && (
								<div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
									<h3 className="font-semibold text-lg mb-4 text-blue-900">
										Document Statistics
									</h3>
									<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
										<div className="bg-white rounded-lg p-4 shadow-sm">
											<p className="text-gray-500 text-sm">Pages</p>
											<p className="text-2xl font-bold text-blue-600">
												{analysis.statistics.total_pages || 0}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm">
											<p className="text-gray-500 text-sm">Words</p>
											<p className="text-2xl font-bold text-green-600">
												{analysis.statistics.total_words?.toLocaleString() || 0}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm">
											<p className="text-gray-500 text-sm">Characters</p>
											<p className="text-2xl font-bold text-purple-600">
												{analysis.statistics.total_characters?.toLocaleString() ||
													0}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm">
											<p className="text-gray-500 text-sm">Sections</p>
											<p className="text-2xl font-bold text-orange-600">
												{analysis.statistics.elements?.sections || 0}
											</p>
										</div>
									</div>
								</div>
							)}

							{/* Document Elements */}
							{analysis.statistics?.elements && (
								<div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
									<h3 className="font-semibold text-lg mb-4 text-purple-900">
										Extracted Elements
									</h3>
									<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
										<div className="bg-white rounded-lg p-4 shadow-sm text-center">
											<p className="text-3xl mb-2">📊</p>
											<p className="text-gray-500 text-sm">Tables</p>
											<p className="text-xl font-bold text-blue-600">
												{analysis.statistics.elements.tables}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm text-center">
											<p className="text-3xl mb-2">🖼️</p>
											<p className="text-gray-500 text-sm">Figures</p>
											<p className="text-xl font-bold text-green-600">
												{analysis.statistics.elements.figures}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm text-center">
											<p className="text-3xl mb-2">🔢</p>
											<p className="text-gray-500 text-sm">Equations</p>
											<p className="text-xl font-bold text-purple-600">
												{analysis.statistics.elements.equations}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm text-center">
											<p className="text-3xl mb-2">📑</p>
											<p className="text-gray-500 text-sm">Sections</p>
											<p className="text-xl font-bold text-orange-600">
												{analysis.statistics.elements.sections}
											</p>
										</div>
										<div className="bg-white rounded-lg p-4 shadow-sm text-center">
											<p className="text-3xl mb-2">📚</p>
											<p className="text-gray-500 text-sm">References</p>
											<p className="text-xl font-bold text-red-600">
												{analysis.statistics.elements.references}
											</p>
										</div>
									</div>
								</div>
							)}

							{/* Annotated PDF Download */}
							{analysis.annotated_pdf_path && (
								<div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
									<h3 className="font-semibold text-lg mb-3 text-green-900">
										📄 Annotated PDF Available
									</h3>
									<p className="text-gray-700 mb-4">
										OpenDataLoader has generated an annotated version of this
										paper with layout highlighting and element boundaries.
									</p>
									<button
										onClick={handleDownloadAnnotatedPdf}
										disabled={downloading}
										className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{downloading ? "⏳ Downloading..." : "📥 Download Annotated PDF"}
									</button>
								</div>
							)}

							{/* Extracted Elements Details */}
							{analysis.elements && (
								<div className="space-y-4">
									{/* Tables */}
									{analysis.elements.tables?.length > 0 && (
										<details className="bg-white border-2 border-blue-200 rounded-lg p-4">
											<summary className="cursor-pointer font-semibold text-blue-900 hover:text-blue-700">
												📊 Tables ({analysis.elements.tables.length})
											</summary>
											<div className="mt-4 space-y-2">
												{analysis.elements.tables.slice(0, 5).map((table, idx) => (
													<div
														key={idx}
														className="bg-blue-50 p-3 rounded text-sm"
													>
														<p className="font-medium text-blue-800">
															Table {idx + 1}
														</p>
														<p className="text-gray-600 truncate">
															{table.content || "No content"}
														</p>
													</div>
												))}
												{analysis.elements.tables.length > 5 && (
													<p className="text-gray-500 text-sm italic">
														...and {analysis.elements.tables.length - 5} more
													</p>
												)}
											</div>
										</details>
									)}

									{/* Figures */}
									{analysis.elements.figures?.length > 0 && (
										<details className="bg-white border-2 border-green-200 rounded-lg p-4">
											<summary className="cursor-pointer font-semibold text-green-900 hover:text-green-700">
												🖼️ Figures ({analysis.elements.figures.length})
											</summary>
											<div className="mt-4 space-y-2">
												{analysis.elements.figures.slice(0, 5).map((fig, idx) => (
													<div
														key={idx}
														className="bg-green-50 p-3 rounded text-sm"
													>
														<p className="font-medium text-green-800">
															Figure {idx + 1}
														</p>
														<p className="text-gray-600 truncate">
															{fig.content || "No caption"}
														</p>
													</div>
												))}
												{analysis.elements.figures.length > 5 && (
													<p className="text-gray-500 text-sm italic">
														...and {analysis.elements.figures.length - 5} more
													</p>
												)}
											</div>
										</details>
									)}

									{/* Equations */}
									{analysis.elements.equations?.length > 0 && (
										<details className="bg-white border-2 border-purple-200 rounded-lg p-4">
											<summary className="cursor-pointer font-semibold text-purple-900 hover:text-purple-700">
												🔢 Equations ({analysis.elements.equations.length})
											</summary>
											<div className="mt-4 space-y-2">
												{analysis.elements.equations
													.slice(0, 5)
													.map((eq, idx) => (
														<div
															key={idx}
															className="bg-purple-50 p-3 rounded text-sm font-mono"
														>
															<p className="font-medium text-purple-800">
																Equation {idx + 1}
															</p>
															<p className="text-gray-600 truncate">
																{eq.content || "No content"}
															</p>
														</div>
													))}
												{analysis.elements.equations.length > 5 && (
													<p className="text-gray-500 text-sm italic">
														...and {analysis.elements.equations.length - 5} more
													</p>
												)}
											</div>
										</details>
									)}

									{/* Sections */}
									{analysis.elements.sections?.length > 0 && (
										<details className="bg-white border-2 border-orange-200 rounded-lg p-4">
											<summary className="cursor-pointer font-semibold text-orange-900 hover:text-orange-700">
												📑 Sections ({analysis.elements.sections.length})
											</summary>
											<div className="mt-4 space-y-2">
												{analysis.elements.sections
													.slice(0, 10)
													.map((section, idx) => (
														<div
															key={idx}
															className="bg-orange-50 p-3 rounded text-sm"
														>
															<p className="font-medium text-orange-800">
																{section.content || `Section ${idx + 1}`}
															</p>
															<p className="text-gray-500 text-xs">
																Level {section.level || 1}
															</p>
														</div>
													))}
												{analysis.elements.sections.length > 10 && (
													<p className="text-gray-500 text-sm italic">
														...and {analysis.elements.sections.length - 10} more
													</p>
												)}
											</div>
										</details>
									)}
								</div>
							)}

							{/* Raw Data (collapsible) */}
							<details className="bg-gray-50 rounded-lg p-4">
								<summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
									🔍 View Raw Analysis Data
								</summary>
								<pre className="mt-4 text-xs text-gray-600 whitespace-pre-wrap overflow-auto max-h-96">
									{JSON.stringify(analysis, null, 2)}
								</pre>
							</details>

							{analysis.message && (
								<p className="text-gray-700 italic">{analysis.message}</p>
							)}
						</div>
					</div>
				)}

				{/* Summary */}
				{summary && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">Paper Summary</h2>
						<div className="bg-gray-50 rounded-lg p-4">
							<p className="text-gray-700 whitespace-pre-wrap">{summary}</p>
						</div>
					</div>
				)}

				{/* Chat Interface */}
				<div className="bg-white rounded-lg shadow-lg p-6">
					<h2 className="text-2xl font-semibold mb-6">Chat with Paper</h2>

					{/* Messages */}
					<div className="mb-6 h-96 overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-4">
						{messages.length === 0 ? (
							<div className="text-center text-gray-500 mt-8">
								<p>Start a conversation about the paper</p>
								<p className="text-sm mt-2">
									Ask questions, request explanations, or discuss concepts
								</p>
							</div>
						) : (
							messages.map((message, index) => (
								<div
									key={index}
									className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
										}`}
								>
									<div
										className={`max-w-3/4 px-4 py-3 rounded-lg ${message.role === "user"
											? "bg-blue-600 text-white"
											: "bg-white border border-gray-200 text-gray-800"
											}`}
									>
										<p className="text-sm font-medium mb-1">
											{message.role === "user" ? "You" : "SARAS"}:
										</p>
										<p className={`whitespace-pre-wrap break-word`}>{message.content}</p>
									</div>
								</div>
							))
						)}
					</div>

					{/* Input */}
					<div className="flex gap-2">
						<textarea
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder="Ask a question about the paper..."
							className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-black"
							rows={3}
							disabled={loading}
						/>
						<button
							onClick={handleSendMessage}
							disabled={!paperId || !inputMessage.trim() || loading}
							className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{loading ? "⏳" : "Send"}
						</button>
					</div>
				</div>

				{/* Info Panel */}
				<div className="mt-8 bg-blue-50 rounded-lg p-6">
					<h3 className="text-lg font-semibold mb-3 text-blue-900">
						ℹ️ About SARAS
					</h3>
					<ul className="space-y-2 text-sm text-blue-800">
						<li>
							<strong>Powered by Gemini AI:</strong> Advanced natural language
							understanding
						</li>
						<li>
							<strong>OpenDataLoader Integration:</strong> Extracts structured data
							from papers
						</li>
						<li>
							<strong>arXiv Support:</strong> Automatically downloads papers from
							arXiv
						</li>
						<li>
							<strong>Smart Analysis:</strong> Get statistics, summaries, and
							insights
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
};

export default SarasChat;
