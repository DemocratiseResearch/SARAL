import os
import logging
from pathlib import Path
import uuid
import time

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings 
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError

# ⭐️ IMPORT THE MULTI-QUERY RETRIEVER ⭐️
from langchain.retrievers.multi_query import MultiQueryRetriever

from app.services.pdf_processor import process_pdf_file
from fastapi import UploadFile, HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the persistent directory for vector stores
VECTOR_STORE_DIR = "temp/vector_stores"
Path(VECTOR_STORE_DIR).mkdir(parents=True, exist_ok=True)

# Initialize the local embedding model once.
try:
    logger.info("Loading local sentence transformer model...")
    embedding_function = SentenceTransformerEmbeddings(
        model_name="BAAI/bge-large-en-v1.5" 
    )
    logger.info("✅ Model loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load sentence transformer model: {e}", exc_info=True)
    embedding_function = None

@retry(
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    retry_error_callback=lambda retry_state: logger.error(
        f"Embedding failed after {retry_state.attempt_number} attempts: {retry_state.outcome.exception()}"
    )
)
def add_texts_with_retry(vector_store, texts):
    """A wrapper function to add texts to ChromaDB with retry logic."""
    vector_store.add_texts(texts=texts)


def process_pdf_and_create_store(file: UploadFile, gemini_api_key: str) -> str:
    """
    Processes an uploaded PDF, creates a Chroma vector store, and persists it.
    """
    if embedding_function is None:
        raise HTTPException(status_code=500, detail="Embedding model is not available.")

    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    
    try:
        logger.info(f"Starting vector store creation for chat with paper_id: {paper_id}")

        os.makedirs(temp_dir, exist_ok=True)
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            buffer.write(file.file.read())

        # 1. Process PDF to extract text
        paper_info = process_pdf_file(pdf_path, paper_id)
        text_file_path = paper_info.get("text_file_path")
        
        if not text_file_path or not os.path.exists(text_file_path):
            raise Exception("Text extraction failed.")

        with open(text_file_path, "r", encoding="utf-8") as f:
            document_text = f.read()
            
        # 2. Split Text into Chunks
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = text_splitter.split_text(document_text)
        logger.info(f"Document split into {len(chunks)} chunks.")

        # 3. Create and Persist Chroma Vector Store in Batches
        persist_directory = os.path.join(VECTOR_STORE_DIR, paper_id)
        
        vector_store = Chroma(
            embedding_function=embedding_function,
            persist_directory=persist_directory
        )
        
        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}...")
            
            try:
                add_texts_with_retry(vector_store, batch)
            except RetryError as e:
                 raise Exception(f"Failed to add texts to vector store after multiple retries: {e}")

            time.sleep(0.5)

        vector_store.persist()
        logger.info(f"✅ Successfully created vector store for chat paper_id: {paper_id} at {persist_directory}")
        return paper_id

    except Exception as e:
        logger.error(f"Failed to create vector store for paper_id {paper_id}: {e}", exc_info=True)
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise e


def get_conversational_chain(paper_id: str, gemini_api_key: str):
    """
    Loads an existing vector store and builds a smarter conversational RAG chain.
    """
    if embedding_function is None:
        raise HTTPException(status_code=500, detail="Embedding model is not available.")

    persist_directory = os.path.join(VECTOR_STORE_DIR, paper_id)
    
    if not os.path.exists(persist_directory):
        logger.error(f"Vector store for paper_id {paper_id} not found.")
        return None

    vector_store = Chroma(
        persist_directory=persist_directory,
        embedding_function=embedding_function
    )
    
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True
    )
    
    custom_prompt_template = """You are a helpful and knowledgeable research assistant. Your task is to answer the user's question based on the provided document excerpts.

1.  **Prioritize the Document:** First, carefully analyze the provided context from the research paper. Formulate your primary answer based directly on this information.
2.  **Supplement with General Knowledge:** After answering based on the document, you may supplement your answer with your own general knowledge to provide more context, define key terms, or elaborate on concepts mentioned in the paper.
3.  **Be Factual:** If the document does not contain the answer, state that and then try to answer using your general knowledge if appropriate.

Context from the document:
{context}

Based on the context and your general knowledge, answer the following question.

Question: {question}
Helpful Answer:"""
    
    QA_PROMPT = PromptTemplate(
        template=custom_prompt_template, input_variables=["context", "question"]
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=gemini_api_key, temperature=0.2)
    
    # ⭐️ UPGRADE the retriever to use MultiQueryRetriever ⭐️
    retriever_from_llm = MultiQueryRetriever.from_llm(
        retriever=vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 5}),
        llm=llm
    )
    
    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever_from_llm, # Use the new multi-query retriever
        memory=memory,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT}
    )
    
    return chain

