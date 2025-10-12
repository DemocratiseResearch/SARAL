import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MarkdownRenderer = ({ content, onSectionClick }) => {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				code({ node, inline, className, children, ...props }) {
					const match = /language-(\w+)/.exec(className || '');
					return !inline && match ? (
						<SyntaxHighlighter
							style={vscDarkPlus}
							language={match[1]}
							PreTag="div"
							{...props}
						>
							{String(children).replace(/\n$/, '')}
						</SyntaxHighlighter>
					) : (
						<code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm font-mono" {...props}>
							{children}
						</code>
					);
				},
				h1: ({ children }) => (
					<h1 className="text-3xl font-bold my-4 text-gray-900">{children}</h1>
				),
				h2: ({ children }) => (
					<h2 className="text-2xl font-semibold my-3 text-gray-800">{children}</h2>
				),
				h3: ({ children }) => (
					<h3 className="text-xl font-semibold my-2 text-gray-700">{children}</h3>
				),
				p: ({ children }) => (
					<p className="my-2 leading-relaxed">{children}</p>
				),
				ul: ({ children }) => (
					<ul className="list-disc list-inside my-2 space-y-1">{children}</ul>
				),
				ol: ({ children }) => (
					<ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>
				),
				li: ({ children }) => (
					<li className="ml-4">{children}</li>
				),
				blockquote: ({ children }) => (
					<blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-2 italic bg-blue-50">
						{children}
					</blockquote>
				),
				table: ({ children }) => (
					<div className="overflow-x-auto my-4">
						<table className="min-w-full border border-gray-300 rounded-lg">
							{children}
						</table>
					</div>
				),
				thead: ({ children }) => (
					<thead className="bg-gray-100">{children}</thead>
				),
				tbody: ({ children }) => (
					<tbody className="divide-y divide-gray-200">{children}</tbody>
				),
				tr: ({ children }) => (
					<tr className="hover:bg-gray-50">{children}</tr>
				),
				th: ({ children }) => (
					<th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">
						{children}
					</th>
				),
				td: ({ children }) => (
					<td className="px-4 py-2 text-gray-600">{children}</td>
				),
				a: ({ href, children }) => {
					// Check if it's a section reference
					if (href && href.startsWith('#section-')) {
						const sectionId = href.replace('#section-', '');
						return (
							<button
								onClick={() => onSectionClick && onSectionClick(sectionId)}
								className="text-blue-600 hover:text-blue-800 underline cursor-pointer font-medium"
							>
								{children} 📍
							</button>
						);
					}
					return (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-600 hover:text-blue-800 underline"
						>
							{children}
						</a>
					);
				},
				strong: ({ children }) => (
					<strong className="font-bold text-gray-900">{children}</strong>
				),
				em: ({ children }) => (
					<em className="italic">{children}</em>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
};

export default MarkdownRenderer;
