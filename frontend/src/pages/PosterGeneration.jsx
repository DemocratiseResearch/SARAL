import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiService from '../services/api';

const PosterGeneration = () => {
	const navigate = useNavigate();

	// State management
	const [file, setFile] = useState(null);
	const [paperId, setPaperId] = useState('');
	const [uploadMode, setUploadMode] = useState('file'); // 'file' or 'existing'

	// Configuration
	const [config, setConfig] = useState({
		width: 48,
		height: 36,
		style: 'academic',
	});

	// Generation state
	const [generating, setGenerating] = useState(false);
	const [posterId, setPosterId] = useState(null);
	const [status, setStatus] = useState(null);
	const [progress, setProgress] = useState(0);

	// User's posters
	const [userPosters, setUserPosters] = useState([]);
	const [loadingPosters, setLoadingPosters] = useState(false);

	// Load user's posters on mount
	useEffect(() => {
		loadUserPosters();
	}, []);

	// Poll for status if generating
	useEffect(() => {
		let intervalId;

		if (posterId && generating) {
			intervalId = setInterval(async () => {
				try {
					const response = await apiService.getPosterStatus(posterId);
					console.log('📊 Poster status response:', response.data);
					setStatus(response.data.status);
					setProgress(response.data.progress);

					if (response.data.status === 'completed') {
						console.log('✅ Poster completed!');
						toast.success('Poster generated successfully!');
						setGenerating(false);
						loadUserPosters(); // Refresh poster list
					} else if (response.data.status === 'failed') {
						console.log('❌ Poster failed:', response.data.error);
						toast.error(response.data.error || 'Poster generation failed');
						setGenerating(false);
					}
				} catch (error) {
					console.error('Error checking status:', error);
				}
			}, 2000); // Poll every 2 seconds
		}

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [posterId, generating]); const loadUserPosters = async () => {
		try {
			setLoadingPosters(true);
			const response = await apiService.listUserPosters();
			console.log('📋 Loaded posters:', response.data);
			setUserPosters(response.data.posters || []);
		} catch (error) {
			console.error('Error loading posters:', error);
		} finally {
			setLoadingPosters(false);
		}
	};

	const handleFileChange = (e) => {
		const selectedFile = e.target.files[0];
		if (selectedFile) {
			if (!selectedFile.name.endsWith('.pdf')) {
				toast.error('Please select a PDF file');
				return;
			}
			setFile(selectedFile);
		}
	};

	const handleGeneratePoster = async () => {
		try {
			setGenerating(true);
			setProgress(0);
			let response;

			if (uploadMode === 'file') {
				if (!file) {
					toast.error('Please select a PDF file');
					setGenerating(false);
					return;
				}

				const toastId = toast.loading('Uploading PDF and starting poster generation...');

				const formData = new FormData();
				formData.append('file', file);
				formData.append('width', config.width);
				formData.append('height', config.height);
				formData.append('style', config.style);

				response = await apiService.uploadAndGeneratePoster(formData);
				toast.success('Poster generation started!', { id: toastId });
			} else {
				if (!paperId) {
					toast.error('Please enter a paper ID');
					setGenerating(false);
					return;
				}

				const toastId = toast.loading('Starting poster generation...');

				response = await apiService.generatePosterFromPaper({
					paper_id: paperId,
					config: config,
				});

				toast.success('Poster generation started!', { id: toastId });
			}

			setPosterId(response.data.poster_id);
			setStatus(response.data.status);
			setProgress(5);
			setGenerating(true); // Explicitly set generating to true to start polling
			console.log('🚀 Started poster generation:', response.data.poster_id);

		} catch (error) {
			console.error('Error generating poster:', error);
			toast.error(error.response?.data?.detail || 'Failed to start poster generation');
			setGenerating(false);
		}
	};

	const handleDownloadPoster = async (posterId) => {
		try {
			toast.loading('Downloading poster...', { id: 'download' });

			const response = await apiService.downloadPosterHTML(posterId);

			// Create blob and download
			const blob = new Blob([response.data], { type: 'text/html' });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `poster_${posterId}.html`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			toast.success('Poster downloaded!', { id: 'download' });
		} catch (error) {
			console.error('Error downloading poster:', error);
			toast.error('Failed to download poster', { id: 'download' });
		}
	};

	const handleDeletePoster = async (posterId) => {
		if (!window.confirm('Are you sure you want to delete this poster?')) {
			return;
		}

		try {
			await apiService.deletePoster(posterId);
			toast.success('Poster deleted');
			loadUserPosters();
		} catch (error) {
			console.error('Error deleting poster:', error);
			toast.error('Failed to delete poster');
		}
	};

	const resetForm = () => {
		setFile(null);
		setPaperId('');
		setPosterId(null);
		setStatus(null);
		setProgress(0);
		setGenerating(false);
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900">
			{/* Header */}
			<div className="bg-white dark:bg-gray-800 shadow">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
								🎨 Poster Generation
							</h1>
							<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
								Transform research papers into beautiful academic posters
							</p>
						</div>
						<button
							onClick={() => navigate('/dashboard')}
							className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
						>
							← Back to Dashboard
						</button>
					</div>
				</div>
			</div>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Left Column - Input & Configuration */}
					<div className="lg:col-span-2 space-y-6">
						{/* Upload Mode Selection */}
						<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
								Select Input Method
							</h2>
							<div className="flex gap-4">
								<button
									onClick={() => setUploadMode('file')}
									className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${uploadMode === 'file'
										? 'bg-indigo-600 text-white'
										: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
										}`}
								>
									📄 Upload PDF
								</button>
								<button
									onClick={() => setUploadMode('existing')}
									className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${uploadMode === 'existing'
										? 'bg-indigo-600 text-white'
										: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
										}`}
								>
									📚 Use Existing Paper
								</button>
							</div>
						</div>

						{/* File Upload or Paper ID Input */}
						<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
								{uploadMode === 'file' ? 'Upload Research Paper' : 'Enter Paper ID'}
							</h2>

							{uploadMode === 'file' ? (
								<div>
									<label className="block w-full">
										<div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition cursor-pointer">
											<input
												type="file"
												accept=".pdf"
												onChange={handleFileChange}
												className="hidden"
											/>
											<div className="flex flex-col items-center">
												<svg
													className="w-16 h-16 text-gray-400 mb-4"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
													/>
												</svg>
												<p className="text-lg font-medium text-gray-700 dark:text-gray-300">
													{file ? file.name : 'Click to upload PDF'}
												</p>
												<p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
													PDF files only
												</p>
											</div>
										</div>
									</label>
								</div>
							) : (
								<div>
									<input
										type="text"
										value={paperId}
										onChange={(e) => setPaperId(e.target.value)}
										placeholder="Enter paper ID (e.g., 2301.07041)"
										className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
									/>
									<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
										Enter the ID of a paper you've already uploaded or scraped
									</p>
								</div>
							)}
						</div>

						{/* Configuration */}
						<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
								Poster Configuration
							</h2>

							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
											Width (inches)
										</label>
										<input
											type="number"
											value={config.width}
											onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) })}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
											Height (inches)
										</label>
										<input
											type="number"
											value={config.height}
											onChange={(e) => setConfig({ ...config, height: parseInt(e.target.value) })}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
										/>
									</div>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										Style
									</label>
									<select
										value={config.style}
										onChange={(e) => setConfig({ ...config, style: e.target.value })}
										className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
									>
										<option value="academic">Academic</option>
										<option value="modern">Modern</option>
										<option value="minimal">Minimal</option>
									</select>
								</div>
							</div>
						</div>

						{/* Generate Button */}
						<button
							onClick={handleGeneratePoster}
							disabled={generating || (!file && !paperId)}
							className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
						>
							{generating ? (
								<span className="flex items-center justify-center">
									<svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Generating Poster... {progress}%
								</span>
							) : (
								'🎨 Generate Poster'
							)}
						</button>

						{/* Progress Bar */}
						{generating && (
							<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
								<div className="space-y-3">
									<div className="flex justify-between text-sm">
										<span className="text-gray-700 dark:text-gray-300">Status: {status}</span>
										<span className="text-gray-700 dark:text-gray-300">{progress}%</span>
									</div>
									<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
										<div
											className="bg-gradient-to-r from-indigo-600 to-purple-600 h-3 rounded-full transition-all duration-300"
											style={{ width: `${progress}%` }}
										></div>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Right Column - User's Posters */}
					<div className="lg:col-span-1">
						<div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sticky top-4">
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
									Your Posters
								</h2>
								<button
									onClick={loadUserPosters}
									disabled={loadingPosters}
									className="p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
								>
									<svg className={`w-5 h-5 ${loadingPosters ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
									</svg>
								</button>
							</div>

							<div className="space-y-3 max-h-[600px] overflow-y-auto">
								{userPosters.length === 0 ? (
									<p className="text-center text-gray-500 dark:text-gray-400 py-8">
										No posters yet. Create your first one!
									</p>
								) : (
									userPosters.map((poster) => (
										<div
											key={poster.poster_id}
											className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-indigo-500 dark:hover:border-indigo-400 transition"
										>
											<div className="flex items-start justify-between mb-2">
												<div className="flex-1">
													<p className="text-sm font-medium text-gray-900 dark:text-white truncate">
														Poster #{poster.poster_id.slice(0, 8)}
													</p>
													<p className="text-xs text-gray-500 dark:text-gray-400">
														{poster.status}
													</p>
												</div>
												{poster.status === 'completed' && (
													<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
														✓ Ready
													</span>
												)}
											</div>

											{poster.progress > 0 && poster.progress < 100 && (
												<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
													<div
														className="bg-indigo-600 h-1.5 rounded-full transition-all"
														style={{ width: `${poster.progress}%` }}
													></div>
												</div>
											)}

											<div className="flex gap-2 mt-3">
												{poster.status === 'completed' && (
													<button
														onClick={() => handleDownloadPoster(poster.poster_id)}
														className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition"
													>
														Download
													</button>
												)}
												<button
													onClick={() => handleDeletePoster(poster.poster_id)}
													className="px-3 py-1.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200 text-xs rounded hover:bg-red-200 dark:hover:bg-red-800 transition"
												>
													Delete
												</button>
											</div>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PosterGeneration;
