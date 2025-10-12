import React, { useState } from 'react';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';
// ADDED: New icons for the new templates
import { FiDownload, FiImage, FiBookOpen, FiTerminal, FiFeather } from 'react-icons/fi';

const PosterGenerator = ({ paperId }) => {
    const [loading, setLoading] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [language, setLanguage] = useState('en');
    const [template, setTemplate] = useState('modern_blue');

    // ADDED: New templates with creative names and icons
    const templates = [
        { id: 'modern_blue', name: 'Modern Blue', icon: <FiImage className="text-blue-500" /> },
        { id: 'classic_ivory', name: 'Classic Ivory', icon: <FiBookOpen className="text-yellow-800" /> },
        { id: 'synthwave', name: 'Synthwave', icon: <FiTerminal className="text-pink-500" /> },
        { id: 'forest', name: 'Forest', icon: <FiFeather className="text-green-600" /> },
    ];

    const handleGenerate = async () => {
        setLoading(true);
        setDownloadUrl(null);
        const toastId = toast.loading('Crafting your poster with new designs...');

        try {
            const response = await apiService.generatePoster(paperId, language, template);
            setDownloadUrl(response.data.download_url);
            toast.success('Your new poster is ready!', { id: toastId });
        } catch (err) {
            const errorMessage = err.response?.data?.detail || 'Failed to generate poster.';
            toast.error(errorMessage, { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const fullDownloadUrl = downloadUrl
        ? `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}${downloadUrl}`
        : '#';

    return (
        <div className="mt-8 p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h3 className="text-2xl font-bold mb-5 text-gray-800 dark:text-gray-200">Create a Conference Poster</h3>

            {/* Template Selector */}
            <div className="mb-6">
                <h4 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">1. Choose a Design Template</h4>
                {/* UPDATED: Grid layout to accommodate more templates */}
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                    {templates.map((tmpl) => (
                        <div
                            key={tmpl.id}
                            onClick={() => setTemplate(tmpl.id)}
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                                template === tmpl.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="text-3xl">{tmpl.icon}</div>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">{tmpl.name}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Language and Generate Button */}
            <div className="mb-4">
                 <h4 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">2. Select Language & Generate</h4>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full sm:w-auto border rounded-md px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                    </select>
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full sm:w-auto bg-blue-600 text-white font-bold px-6 py-2.5 rounded-md disabled:bg-gray-400 hover:bg-blue-700 transition-transform transform hover:scale-105"
                    >
                        {loading ? 'Creating...' : 'Generate Poster'}
                    </button>
                </div>
            </div>

            {/* Result Section */}
            {downloadUrl && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                    <a
                        href={fullDownloadUrl}
                        download
                        className="flex items-center gap-3 font-semibold text-green-700 dark:text-green-300 hover:underline text-lg"
                    >
                        <FiDownload />
                        Download Your Poster
                    </a>
                </div>
            )}
        </div>
    );
};

export default PosterGenerator;