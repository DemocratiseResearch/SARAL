"""
SARAS Chat Routes
Smart Academic Research Assistant Service endpoints
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import logging
from pathlib import Path

from ..services.saras_service import get_saras_service
from ..routes.api_keys import get_api_keys

router = APIRouter()
logging.basicConfig(level=logging.INFO)


class ChatRequest(BaseModel):
    paper_id: str
    question: str
    context: Optional[str] = None


class SearchRequest(BaseModel):
    paper_id: str
    search_query: str


class ChatResponse(BaseModel):
    success: bool
    question: str
    answer: str
    paper_id: str
    paper_statistics: dict
    message: str


class SummaryResponse(BaseModel):
    success: bool
    paper_id: str
    summary: str
    statistics: dict
    preview: str
    message: str


class AnalysisResponse(BaseModel):
    success: bool
    paper_id: str
    text_preview: str
    markdown_preview: str
    metadata: dict
    statistics: dict
    elements: Optional[dict] = None
    annotated_pdf_path: Optional[str] = None
    message: str


class AnnotatedPDFResponse(BaseModel):
    success: bool
    paper_id: str
    has_annotated_pdf: bool
    annotated_pdf_path: Optional[str]
    original_pdf_path: str
    statistics: dict
    message: str


class SearchResponse(BaseModel):
    success: bool
    paper_id: str
    search_query: str
    total_occurrences: int
    occurrences: List[dict]
    insights: str
    message: str


@router.post("/chat", response_model=ChatResponse)
async def chat_with_saras(
    request: ChatRequest,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Chat with SARAS about a specific paper
    Ask questions and get intelligent answers based on paper content
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        logging.info(f"💬 SARAS chat request for paper: {request.paper_id}")
        logging.info(f"💬 Question: {request.question}")

        saras = get_saras_service(api_keys["gemini_key"])

        result = await saras.chat(
            paper_id=request.paper_id,
            question=request.question,
            context=request.context,
        )

        return ChatResponse(
            success=True,
            question=result["question"],
            answer=result["answer"],
            paper_id=result["paper_id"],
            paper_statistics=result["paper_statistics"],
            message="Answer generated successfully",
        )

    except FileNotFoundError as e:
        logging.error(f"❌ Paper not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"❌ Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary/{paper_id}", response_model=SummaryResponse)
async def get_paper_summary(
    paper_id: str,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Get comprehensive summary of a paper
    Includes title, contributions, methodology, findings, and significance
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        logging.info(f"📝 Generating summary for paper: {paper_id}")

        saras = get_saras_service(api_keys["gemini_key"])
        result = await saras.get_paper_summary(paper_id)

        return SummaryResponse(
            success=True,
            paper_id=result["paper_id"],
            summary=result["summary"],
            statistics=result["statistics"],
            preview=result["preview"],
            message="Summary generated successfully",
        )

    except FileNotFoundError as e:
        logging.error(f"❌ Paper not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"❌ Summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyze/{paper_id}", response_model=AnalysisResponse)
async def analyze_paper(
    paper_id: str,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Analyze paper and extract content using OpenDataLoader
    Returns text, markdown, and metadata
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        logging.info(f"📄 Analyzing paper: {paper_id}")

        saras = get_saras_service(api_keys["gemini_key"])
        result = await saras.analyze_paper(paper_id)

        return AnalysisResponse(
            success=True,
            paper_id=result["paper_id"],
            text_preview=result["preview"],
            markdown_preview=result["markdown_content"][:1000] + "...",
            metadata=result.get("metadata", {}),
            statistics=result["statistics"],
            elements=result.get("elements", {}),
            annotated_pdf_path=result.get("annotated_pdf_path"),
            message="Paper analyzed successfully",
        )

    except FileNotFoundError as e:
        logging.error(f"❌ Paper not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"❌ Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/annotated-pdf/{paper_id}", response_model=AnnotatedPDFResponse)
async def get_annotated_pdf_info(
    paper_id: str,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Get information about annotated PDF generated by OpenDataLoader
    The annotated PDF includes visual markers and structure annotations
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        logging.info(f"📑 Getting annotated PDF info for: {paper_id}")

        saras = get_saras_service(api_keys["gemini_key"])
        result = await saras.get_annotated_pdf_info(paper_id)

        return AnnotatedPDFResponse(
            success=True,
            paper_id=result["paper_id"],
            has_annotated_pdf=result["has_annotated_pdf"],
            annotated_pdf_path=result["annotated_pdf_path"],
            original_pdf_path=result["original_pdf_path"],
            statistics=result["statistics"],
            message="Annotated PDF info retrieved successfully",
        )

    except FileNotFoundError as e:
        logging.error(f"❌ Paper not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"❌ Annotated PDF error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-annotated/{paper_id}")
async def download_annotated_pdf(
    paper_id: str,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Download annotated PDF file
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        saras = get_saras_service(api_keys["gemini_key"])
        result = await saras.get_annotated_pdf_info(paper_id)

        if not result["has_annotated_pdf"]:
            raise HTTPException(
                status_code=404, detail="Annotated PDF not available for this paper"
            )

        annotated_path = Path(result["annotated_pdf_path"])

        if not annotated_path.exists():
            raise HTTPException(status_code=404, detail="Annotated PDF file not found")

        return FileResponse(
            str(annotated_path),
            media_type="application/pdf",
            filename=f"{paper_id}_annotated.pdf",
        )

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Download error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=SearchResponse)
async def search_in_paper(
    request: SearchRequest,
    api_keys: dict = Depends(get_api_keys),
):
    """
    Search for specific content within a paper
    Returns occurrences and AI-generated insights
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for SARAS"
            )

        logging.info(
            f"🔍 Searching in paper {request.paper_id} for: {request.search_query}"
        )

        saras = get_saras_service(api_keys["gemini_key"])
        result = await saras.search_in_paper(
            paper_id=request.paper_id, search_query=request.search_query
        )

        return SearchResponse(
            success=True,
            paper_id=result["paper_id"],
            search_query=result["search_query"],
            total_occurrences=result["total_occurrences"],
            occurrences=result["occurrences"],
            insights=result["insights"],
            message=f"Found {result['total_occurrences']} occurrences",
        )

    except FileNotFoundError as e:
        logging.error(f"❌ Paper not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.error(f"❌ Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
