import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiVideo, FiDownload, FiCode, FiMic, FiPlay } from 'react-icons/fi';
import { apiService } from '../../services/api';
import { downloadBlob } from '../../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';
import toast from 'react-hot-toast';

const ManimGenerator = ({ paperId, audioFile, onVideoGenerated }) => {
	const [loading, setLoading] = useState(false);
	const [manimData, setManimData] = useState(null);
	const [downloadingVideo, setDownloadingVideo] = useState(false);
	const [downloadingCode, setDownloadingCode] = useState(false);

	const generateAnimation = async () => {
		if (!paperId) {
			toast.error('Paper ID is required');
			return;
		}

		console.log('Starting Manim generation...');
		console.log('Paper ID:', paperId);
		console.log('Audio file:', audioFile);

		setLoading(true);
		try {
			console.log('Calling API with config:', {
				audioFile
			});

			const response = await apiService.generateManimAnimation(paperId, {
				audioFile
			});

			console.log('API Response:', response);

			if (response.data.success) {
				setManimData(response.data);

				// Show different messages based on whether video was created
				if (response.data.video_path) {
					console.log('Video path from API:', response.data.video_path);
					console.log('Generated stream URL:', apiService.getManimVideoStreamUrl(paperId));
					toast.success('Manim animation generated successfully!');
				} else {
					toast.success('Manim code generated! Video creation had issues but you can download the code.');
				} if (onVideoGenerated && response.data.video_path) {
					onVideoGenerated(response.data.video_path);
				}
			} else {
				console.error('Generation failed:', response.data.message);
				toast.error(response.data.message || 'Failed to generate animation');
			}
		} catch (error) {
			console.error('Manim generation error:', error);
			console.error('Error response:', error.response?.data);
			console.error('Error status:', error.response?.status);

			// Show more specific error messages
			if (error.response?.status === 404) {
				toast.error('Scripts not found. Please generate scripts first.');
			} else if (error.response?.status === 400) {
				toast.error('Missing API keys. Please check your configuration.');
			} else {
				toast.error(`Failed to generate Manim animation: ${error.response?.data?.detail || error.message}`);
			}
		} finally {
			setLoading(false);
		}
	};

	const downloadVideo = async () => {
		if (!paperId) return;

		setDownloadingVideo(true);
		try {
			const response = await apiService.downloadManimVideo(paperId);
			downloadBlob(response.data, `manim_animation_${paperId}.mp4`);
			toast.success('Video downloaded successfully');
		} catch (error) {
			console.error('Download error:', error);
			toast.error('Failed to download video');
		} finally {
			setDownloadingVideo(false);
		}
	};

	const downloadCode = async () => {
		if (!paperId) return;

		setDownloadingCode(true);
		try {
			const response = await apiService.getManimCode(paperId);
			const blob = new Blob([response.data.manim_code], { type: 'text/plain' });
			downloadBlob(blob, `manim_code_${paperId}.py`);
			toast.success('Code downloaded successfully');
		} catch (error) {
			console.error('Download error:', error);
			toast.error('Failed to download code');
		} finally {
			setDownloadingCode(false);
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700"
		>
			<div className="flex items-center gap-3 mb-6">
				<div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
					<FiVideo className="w-5 h-5 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
						Manim Animation Generator
					</h3>
					<p className="text-sm text-neutral-600 dark:text-neutral-400">
						Create animated 60-second mathematical visualizations from your research
					</p>
				</div>
			</div>

			{/* Audio File Info */}
			{audioFile && (
				<div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
					<div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
						<FiMic className="w-4 h-4" />
						<span className="text-sm font-medium">Audio will be synchronized with animation</span>
					</div>
				</div>
			)}

			{/* Generate Button */}
			<button
				onClick={generateAnimation}
				disabled={loading || !paperId}
				className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 
                 text-white font-medium py-3 px-4 rounded-lg transition-colors
                 flex items-center justify-center gap-2"
			>
				{loading ? (
					<>
						<LoadingSpinner size="sm" />
						Generating Animation...
					</>
				) : (
					<>
						<FiVideo className="w-4 h-4" />
						Generate Manim Animation
					</>
				)}
			</button>

			{/* Results */}
			{manimData && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mt-6 space-y-4"
				>
					{/* Video Preview */}
					{manimData.video_path && (
						<div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
							<video
								key={paperId} // Force re-render when paperId changes
								controls
								className="w-full aspect-video"
								src={apiService.getManimVideoStreamUrl(paperId)}
								preload="metadata"
								onLoadStart={() => console.log('Video loading started')}
								onCanPlay={() => console.log('Video can play')}
								onError={(e) => console.error('Video error:', e)}
							>
								Your browser does not support video playback.
							</video>
						</div>
					)}

					{/* Narration Display */}
					{manimData.narration && (
						<div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
							<h4 className="font-medium text-neutral-900 dark:text-white mb-2">
								Generated Narration:
							</h4>
							<p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
								{manimData.narration}
							</p>
						</div>
					)}

					{/* Action Buttons */}
					<div className="flex gap-3">
						{manimData.video_path && (
							<button
								onClick={downloadVideo}
								disabled={downloadingVideo}
								className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                         text-white font-medium py-2 px-4 rounded-lg transition-colors
                         flex items-center justify-center gap-2"
							>
								{downloadingVideo ? (
									<LoadingSpinner size="sm" />
								) : (
									<FiDownload className="w-4 h-4" />
								)}
								Download Video
							</button>
						)}

						{manimData.manim_code && (
							<button
								onClick={downloadCode}
								disabled={downloadingCode}
								className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                         text-white font-medium py-2 px-4 rounded-lg transition-colors
                         flex items-center justify-center gap-2"
							>
								{downloadingCode ? (
									<LoadingSpinner size="sm" />
								) : (
									<FiCode className="w-4 h-4" />
								)}
								Download Code
							</button>
						)}
					</div>
				</motion.div>
			)}
		</motion.div>
	);
};

export default ManimGenerator;