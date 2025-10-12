"""
SARAS Chat Service
Intelligent paper analysis and Q&A using OpenDataLoader and arXiv
"""

import os
import logging
from pathlib import Path
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch, UrlContext


load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SarasService:
    """SARAS - Smart Academic Research Assistant Service"""

    def __init__(self, gemini_api_key: str):
        self.gemini_api_key = gemini_api_key
        self.client = genai.Client(api_key=gemini_api_key)

    def _extract_text_from_response(self, response) -> str:
        """Extract text reliably from different genai response shapes."""
        try:
            # Newer responses: response.candidates[0].content.parts[*].text
            candidates = getattr(response, "candidates", None)
            if candidates:
                first = candidates[0]
                content = getattr(first, "content", None)
                if content:
                    parts = getattr(content, "parts", None)
                    if parts:
                        return "".join(
                            [
                                getattr(p, "text", "")
                                for p in parts
                                if getattr(p, "text", None)
                            ]
                        )
                    # fallback: content.text
                    return getattr(content, "text", "") or ""

            # Older/alternate shapes
            text = getattr(response, "text", None) or getattr(
                response, "output_text", None
            )
            if text:
                return text

        except Exception:
            logger.exception("Error extracting text from genai response")
            return ""

        return ""

    def _add_inline_citations(self, text: str, grounding_metadata) -> str:
        """
        Add inline citations to text based on grounding metadata

        Args:
            text: Original response text
            grounding_metadata: Grounding metadata from Gemini response

        Returns:
            Text with inline citations in markdown format
        """
        try:
            if not grounding_metadata:
                return text

            supports = getattr(grounding_metadata, "grounding_supports", [])
            chunks = getattr(grounding_metadata, "grounding_chunks", [])

            if not supports or not chunks:
                return text

            # Sort supports by end_index in descending order to avoid shifting issues
            sorted_supports = sorted(
                supports, key=lambda s: getattr(s.segment, "end_index", 0), reverse=True
            )

            for support in sorted_supports:
                segment = getattr(support, "segment", None)
                if not segment:
                    continue

                end_index = getattr(segment, "end_index", None)
                chunk_indices = getattr(support, "grounding_chunk_indices", [])

                if end_index is not None and chunk_indices:
                    # Create citation string like [1](url1), [2](url2)
                    citation_links = []
                    for i in chunk_indices:
                        if i < len(chunks):
                            chunk = chunks[i]
                            web = getattr(chunk, "web", None)
                            if web:
                                uri = getattr(web, "uri", "")
                                title = getattr(web, "title", f"Source {i + 1}")
                                # Create markdown link with cite prefix
                                citation_links.append(
                                    f'[cite: {i + 1}]({uri} "{title}")'
                                )

                    if citation_links:
                        citation_string = " " + ", ".join(citation_links)
                        text = text[:end_index] + citation_string + text[end_index:]

            return text

        except Exception as e:
            logger.error(f"Error adding inline citations: {e}")
            return text

    async def analyze_paper(self, paper_id: str) -> Dict[str, Any]:
        """
        Analyze paper and extract key information using OpenDataLoader

        Args:
            paper_id: ArXiv paper ID

        Returns:
            Dictionary with analysis results
        """
        try:
            # Import PDF processor
            from .pdf_processor import extract_with_full_features

            # Get PDF path
            pdf_path = Path(f"temp/papers/{paper_id}.pdf")

            if not pdf_path.exists():
                logger.warning(
                    f"PDF not found at {pdf_path}, trying to download from arXiv"
                )
                # Try to download from arXiv
                from .arxiv_scraper import ArxivScraper

                scraper = ArxivScraper()
                success = scraper.download_pdf_from_arxiv(paper_id, str(pdf_path))

                if not success:
                    raise FileNotFoundError(f"Could not download paper {paper_id}")

            # Extract content with OpenDataLoader
            logger.info(f"📄 Extracting content from {pdf_path}")
            extraction_result = extract_with_full_features(
                str(pdf_path),
                generate_markdown=True,
                generate_html=False,
                generate_annotated_pdf=True,
                output_dir=f"temp/saras/{paper_id}",
            )

            if not extraction_result:
                raise ValueError("Failed to extract content from PDF")

            # Get structured data for detailed analysis
            structured_data = extraction_result.get("structured_data", {})

            # Extract document elements
            elements = self._extract_elements(structured_data)

            # Count elements
            element_counts = {
                "tables": len(elements.get("tables", [])),
                "figures": len(elements.get("figures", [])),
                "equations": len(elements.get("equations", [])),
                "sections": len(elements.get("sections", [])),
                "references": len(elements.get("references", [])),
            }

            # Prepare analysis data
            analysis = {
                "paper_id": paper_id,
                "text_content": extraction_result.get("text", ""),
                "markdown_content": extraction_result.get("markdown", ""),
                "metadata": extraction_result.get("metadata", {}),
                "statistics": {
                    "total_pages": (
                        structured_data.get("num_pages", 0) if structured_data else 0
                    ),
                    "total_words": len(extraction_result.get("text", "").split()),
                    "total_characters": len(extraction_result.get("text", "")),
                    "elements": element_counts,
                },
                "elements": elements,
                "annotated_pdf_path": extraction_result.get("annotated_pdf_path"),
                "output_dir": extraction_result.get("output_dir"),
                "preview": extraction_result.get("text", "")[:1000] + "...",
            }

            logger.info(f"✅ Successfully analyzed paper {paper_id}")
            return analysis

        except Exception as e:
            logger.error(f"❌ Error analyzing paper {paper_id}: {e}")
            raise

    def _extract_elements(self, structured_data: Dict) -> Dict[str, List]:
        """Extract tables, figures, equations, etc. from structured data"""
        elements = {
            "tables": [],
            "figures": [],
            "equations": [],
            "sections": [],
            "references": [],
        }

        if not structured_data:
            return elements

        def traverse(obj, depth=0):
            """Recursively traverse structure to find elements"""
            if isinstance(obj, dict):
                # Check for element types
                elem_type = obj.get("type", "")

                if "table" in elem_type.lower():
                    elements["tables"].append(
                        {
                            "type": elem_type,
                            "content": obj.get("text", ""),
                            "bbox": obj.get("bbox"),
                        }
                    )
                elif "figure" in elem_type.lower() or "image" in elem_type.lower():
                    elements["figures"].append(
                        {
                            "type": elem_type,
                            "content": obj.get("text", ""),
                            "bbox": obj.get("bbox"),
                        }
                    )
                elif "equation" in elem_type.lower() or "formula" in elem_type.lower():
                    elements["equations"].append(
                        {
                            "type": elem_type,
                            "content": obj.get("text", ""),
                            "bbox": obj.get("bbox"),
                        }
                    )
                elif "section" in elem_type.lower() or "heading" in elem_type.lower():
                    elements["sections"].append(
                        {
                            "type": elem_type,
                            "content": obj.get("text", ""),
                            "level": obj.get("level", 1),
                        }
                    )
                elif "reference" in elem_type.lower():
                    elements["references"].append(
                        {"type": elem_type, "content": obj.get("text", "")}
                    )

                # Recurse into nested structures
                for value in obj.values():
                    traverse(value, depth + 1)

            elif isinstance(obj, list):
                for item in obj:
                    traverse(item, depth)

        # Start traversal
        traverse(structured_data)

        return elements

    async def chat(
        self,
        paper_id: str,
        question: str,
        context: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, str]:
        """
        Chat with SARAS about a specific paper

        Args:
            paper_id: ArXiv paper ID
            question: User's question
            context: Optional additional context
            history: Optional chat history

        Returns:
            Dictionary with answer and references
        """
        try:
            # Get paper analysis
            analysis = await self.analyze_paper(paper_id)

            # Prepare context for Gemini
            paper_context = f"""
You are SARAS (Smart Academic Research Assistant Service), an intelligent AI assistant specialized in academic paper analysis.

**Paper Information:**
- Paper ID: {paper_id}
- Total Pages: {analysis['statistics']['total_pages']}
- Total Words: {analysis['statistics']['total_words']}

**Paper Content:**
{analysis['text_content']}

**User Question:**
{question}

**Instructions:**
1. Provide clear, accurate answers based on the paper content
2. Quote relevant sections from the paper when possible
3. If the user asks for recent papers, web search, or external information, USE THE GOOGLE SEARCH TOOL to find current research
4. When referencing specific sections, use markdown links like: [Section 1](#section-1), [Introduction](#section-intro), [Methods](#section-methods)
5. Use markdown formatting for better readability (headers, code blocks, lists, tables)
6. When you perform a web search, cite your sources naturally in the text
7. Keep answers concise but comprehensive

Please answer the question:
"""

            if context:
                paper_context += f"\n\n**Additional Context:**\n{context}\n"

            if history:
                logger.info(
                    f"Adding chat history with {len(history)} messages to context"
                )
                N = 15
                recent_history = history[-N:]
                hist_lines = []
                for m in recent_history:
                    role = m.get("role", "user")
                    content = m.get("content", "")
                    prefix = "User" if role == "user" else "Assistant"
                    hist_lines.append(f"{prefix}: {content}")
                paper_context += "\n\n**Chat History:**\n" + "\n".join(hist_lines)

            # Configure tools for grounding with Google Search
            grounding_tool = Tool(google_search=GoogleSearch())
            tools = [grounding_tool]

            # Generate response with Gemini
            logger.info(f"🤖 Generating response for question: {question[:50]}...")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=paper_context,
                config=GenerateContentConfig(tools=tools),
            )

            # Format answer with citations
            answer_text = self._extract_text_from_response(response)

            # Add inline citations if grounding metadata exists
            grounding_metadata = None
            if hasattr(response, "candidates") and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, "grounding_metadata"):
                    grounding_metadata = candidate.grounding_metadata
                    answer_text = self._add_inline_citations(
                        answer_text, grounding_metadata
                    )
                    chunks = getattr(grounding_metadata, "grounding_chunks", None)
                    if chunks:
                        logger.info(f"📚 Added citations from {len(chunks)} sources")

            logger.info(f"🤖 Extracted answer text: {answer_text[:100]}...")

            answer = {
                "question": question,
                "answer": answer_text,
                "paper_id": paper_id,
                "paper_statistics": analysis["statistics"],
                "grounding_metadata": grounding_metadata,
            }

            logger.info(f"✅ Generated answer ({len(answer_text)} characters)")
            return answer

        except Exception as e:
            logger.error(f"❌ Error in chat: {e}")
            raise

    async def get_paper_summary(self, paper_id: str) -> Dict[str, Any]:
        """
        Generate comprehensive summary of the paper

        Args:
            paper_id: ArXiv paper ID

        Returns:
            Dictionary with summary information
        """
        try:
            # Get paper analysis
            analysis = await self.analyze_paper(paper_id)

            # Generate summary with Gemini
            summary_prompt = f"""
Analyze this academic paper and provide a comprehensive summary. Use external sources to provide additional context about the research area, related work, and significance.

**Paper Content:**
{analysis['text_content'][:8000]}

**Please provide:**
1. **Title and Authors** (if available)
2. **Main Topic**: What is the paper about? Include background from external sources about this research area.
3. **Key Contributions**: What are the main contributions?
4. **Methodology**: What methods/approaches are used? Reference similar approaches from literature.
5. **Key Findings**: What are the main results?
6. **Significance**: Why is this work important? Compare with recent developments in the field.
7. **Keywords**: 5-7 relevant keywords

Format your response in clear sections with markdown. Reference external sources when providing context.
"""

            tools = [Tool(url_context=UrlContext()), Tool(google_search=GoogleSearch())]

            logger.info(f"📝 Generating summary for paper {paper_id}")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=summary_prompt,
                config=GenerateContentConfig(tools=tools),
            )

            # Format summary with citations
            summary_text = self._extract_text_from_response(response)

            summary = {
                "paper_id": paper_id,
                "summary": summary_text,
                "statistics": analysis["statistics"],
                "preview": analysis["preview"],
                # "grounding_metadata": getattr(response, 'grounding_metadata', None),
            }

            logger.info(f"✅ Generated summary")
            return summary

        except Exception as e:
            logger.error(f"❌ Error generating summary: {e}")
            raise

    async def get_annotated_pdf_info(self, paper_id: str) -> Dict[str, Any]:
        """
        Get information about annotated PDF from OpenDataLoader

        Args:
            paper_id: ArXiv paper ID

        Returns:
            Dictionary with annotated PDF information
        """
        try:
            # Import PDF processor
            from .pdf_processor import extract_with_full_features

            # Get PDF path
            pdf_path = Path(f"temp/papers/{paper_id}.pdf")

            if not pdf_path.exists():
                raise FileNotFoundError(f"PDF not found: {pdf_path}")

            # Extract with annotations
            logger.info(f"📑 Creating annotated PDF for {paper_id}")
            extraction_result = extract_with_full_features(
                str(pdf_path),
                generate_markdown=True,
                generate_html=False,
                generate_annotated_pdf=True,
                output_dir=f"temp/saras/{paper_id}",
            )

            # Check for annotated PDF
            annotated_pdf_path = extraction_result.get("annotated_pdf_path")

            info = {
                "paper_id": paper_id,
                "has_annotated_pdf": annotated_pdf_path is not None,
                "annotated_pdf_path": annotated_pdf_path,
                "original_pdf_path": str(pdf_path),
                "statistics": {
                    "total_pages": extraction_result.get("num_pages", 0),
                    "extraction_formats": extraction_result.get("formats", []),
                },
            }

            logger.info(f"✅ Annotated PDF info retrieved")
            return info

        except Exception as e:
            logger.error(f"❌ Error getting annotated PDF info: {e}")
            raise

    async def search_in_paper(self, paper_id: str, search_query: str) -> Dict[str, Any]:
        """
        Search for specific content within a paper

        Args:
            paper_id: ArXiv paper ID
            search_query: Search query

        Returns:
            Dictionary with search results
        """
        try:
            # Get paper analysis
            analysis = await self.analyze_paper(paper_id)

            # Simple text search
            text_content = analysis["text_content"].lower()
            search_query_lower = search_query.lower()

            # Find all occurrences
            occurrences = []
            start = 0
            while True:
                pos = text_content.find(search_query_lower, start)
                if pos == -1:
                    break

                # Get context (100 chars before and after)
                context_start = max(0, pos - 100)
                context_end = min(
                    len(text_content), pos + len(search_query_lower) + 100
                )
                context = analysis["text_content"][context_start:context_end]

                occurrences.append(
                    {
                        "position": pos,
                        "context": context,
                    }
                )

                start = pos + 1

            # Use Gemini to provide intelligent search results
            if occurrences:
                search_prompt = f"""
Based on the paper content, provide insights about the search query: "{search_query}". Also search for additional context and recent developments related to this topic.

**Found {len(occurrences)} occurrences in the paper.**

**Sample contexts:**
{chr(10).join([f"- ...{occ['context']}..." for occ in occurrences[:3]])}

**Please provide:**
1. What role does "{search_query}" play in this paper?
2. Key insights related to "{search_query}"
3. Relevant sections or findings
4. Recent developments in this area (from external sources)

Keep it concise and informative. Reference external sources when providing additional context.
"""
                tools = [
                    Tool(url_context=UrlContext()),
                    Tool(google_search=GoogleSearch()),
                ]

                response = self.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=search_prompt,
                    config=GenerateContentConfig(tools=tools),
                )

                # Format insights with citations
                insights_text = self._extract_text_from_response(response)
            else:
                insights_text = f"'{search_query}' was not found in the paper."

            results = {
                "paper_id": paper_id,
                "search_query": search_query,
                "total_occurrences": len(occurrences),
                "occurrences": occurrences[:10],  # Return first 10
                "insights": insights_text,
                "grounding_metadata": (
                    getattr(response, "grounding_metadata", None)
                    if occurrences
                    else None
                ),
            }

            logger.info(f"🔍 Search completed: {len(occurrences)} results")
            return results

        except Exception as e:
            logger.error(f"❌ Error searching paper: {e}")
            raise

    async def search_with_grounding(
        self, paper_id: str, question: str, urls: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Enhanced search with explicit grounding and comprehensive citations

        Args:
            paper_id: ArXiv paper ID
            question: Search question
            urls: Optional list of URLs to include in context

        Returns:
            Dictionary with grounded search results and citations
        """
        try:
            # Get paper analysis
            analysis = await self.analyze_paper(paper_id)

            # Enhanced prompt with grounding context
            grounded_prompt = f"""
You are SARAS (Smart Academic Research Assistant Service). Answer the following question about the research paper, using both the paper content and additional information from web search and URL context.

**Paper ID:** {paper_id}
**Paper Content (excerpt):**
{analysis['text_content'][:6000]}

**Question:** {question}

**Instructions:**
1. First, answer based on the paper content
2. Then, provide additional context using grounded search results and URL context
3. Clearly distinguish between information from the paper vs. external sources
4. Reference specific sources when making claims
5. If conflicting information exists, explain the differences
6. Ensure comprehensive coverage by searching for related work and recent developments

{f"**Additional URLs to consider:** {', '.join(urls)}" if urls else ""}

Provide a comprehensive, well-sourced answer with proper attribution:
"""

            # Configure tools
            tools = [Tool(google_search=GoogleSearch()), Tool(url_context=UrlContext())]

            logger.info(f"🔍 Performing grounded search for: {question[:50]}...")
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=grounded_prompt,
                config=GenerateContentConfig(tools=tools),
            )

            # Format answer with comprehensive citations
            answer_text = self._extract_text_from_response(response)

            results = {
                "paper_id": paper_id,
                "question": question,
                "answer": answer_text,
                "grounding_metadata": getattr(response, "grounding_metadata", None),
                "paper_statistics": analysis["statistics"],
                "urls_provided": urls or [],
            }

            logger.info(f"✅ Grounded search completed")
            return results

        except Exception as e:
            logger.error(f"❌ Error in grounded search: {e}")
            raise


# Singleton instance
_saras_instance: Optional[SarasService] = None


def get_saras_service(gemini_api_key: str) -> SarasService:
    """Get or create SARAS service instance"""
    global _saras_instance
    if _saras_instance is None:
        _saras_instance = SarasService(gemini_api_key)
    return _saras_instance
