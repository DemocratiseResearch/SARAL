from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Any, Optional

from app.services.rag_service import process_pdf_and_create_store, get_conversational_chain
from app.routes.api_keys import get_api_keys

router = APIRouter()

conversation_chains = {}

class ChatUploadResponse(BaseModel):
    paper_id: str
    filename: str

class AskRequest(BaseModel):
    question: str

class AskWithContextRequest(BaseModel):
    question: str
    context: str

class AskResponse(BaseModel):
    answer: str
    context: Optional[List[str]] = None

@router.post("/upload", response_model=ChatUploadResponse)
async def upload_for_chat(
    file: UploadFile = File(...),
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to upload a PDF file specifically for the chat feature.
    Creates and persists a vector store.
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed for chat.")

    try:
        paper_id = process_pdf_and_create_store(file, api_keys["gemini_key"])
        return ChatUploadResponse(paper_id=paper_id, filename=file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF for chat: {str(e)}")


@router.post("/{paper_id}/ask", response_model=AskResponse)
async def ask_question(
    paper_id: str,
    request: AskRequest,
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to ask a question to the conversational RAG chain.
    """
    try:
        # Get or create conversational chain for this paper_id
        if paper_id not in conversation_chains:
            chain = get_conversational_chain(paper_id, api_keys["gemini_key"])
            if not chain:
                raise HTTPException(status_code=404, detail="Chat session not found for this paper.")
            conversation_chains[paper_id] = chain
        else:
            chain = conversation_chains[paper_id]

        # Use the chain's built-in memory for conversation context
        result = chain.invoke({
            "question": request.question
        })
        # Gather retrieved context snippets (if available)
        context_snippets: List[str] = []
        source_docs = result.get("source_documents", []) if isinstance(result, dict) else []
        for doc in source_docs[:5]:  # limit to top 5 chunks
            text = getattr(doc, 'page_content', None)
            if text:
                snippet = text.strip()
                if len(snippet) > 800:
                    snippet = snippet[:800] + "…"
                context_snippets.append(snippet)

        return AskResponse(answer=result["answer"], context=context_snippets or None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get answer: {str(e)}")

@router.post("/{paper_id}/ask_with_context", response_model=AskResponse)
async def ask_with_context(
    paper_id: str,
    request: AskWithContextRequest,
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to ask a question to the conversational RAG chain with additional context.
    """
    try:
        if paper_id not in conversation_chains:
            chain = get_conversational_chain(paper_id, api_keys["gemini_key"])
            if not chain:
                raise HTTPException(status_code=404, detail="Chat session not found for this paper.")
            conversation_chains[paper_id] = chain
        else:
            chain = conversation_chains[paper_id]

        # Modify the prompt to include the context
        prompt_with_context = f"Given the following context from a PDF, please answer the question.\n\nContext:\n---\n{request.context}\n---\n\nQuestion: {request.question}"

        result = chain.invoke({
            "question": prompt_with_context
        })

        context_snippets: List[str] = []
        source_docs = result.get("source_documents", []) if isinstance(result, dict) else []
        for doc in source_docs[:5]:
            text = getattr(doc, 'page_content', None)
            if text:
                snippet = text.strip()
                if len(snippet) > 800:
                    snippet = snippet[:800] + "…"
                context_snippets.append(snippet)

        return AskResponse(answer=result["answer"], context=context_snippets or None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get answer with context: {str(e)}")
