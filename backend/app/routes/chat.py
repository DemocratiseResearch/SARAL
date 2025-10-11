from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Any

from app.services.rag_service import process_pdf_and_create_store, get_conversational_chain
from app.routes.api_keys import get_api_keys

router = APIRouter()

class ChatUploadResponse(BaseModel):
    paper_id: str
    filename: str

class AskRequest(BaseModel):
    question: str
    chat_history: List[Any]

class AskResponse(BaseModel):
    answer: str

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
        chain = get_conversational_chain(paper_id, api_keys["gemini_key"])
        if not chain:
            raise HTTPException(status_code=404, detail="Chat session not found for this paper.")

        result = chain.invoke({
            "question": request.question, 
            "chat_history": request.chat_history
        })
        
        return AskResponse(answer=result["answer"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get answer: {str(e)}")
