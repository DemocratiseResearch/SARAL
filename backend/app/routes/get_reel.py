from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
import os
import fitz  # PyMuPDF for PDF text extraction
import re
import google.generativeai as genai
from sarvamai import SarvamAI
import tempfile

router = APIRouter()


