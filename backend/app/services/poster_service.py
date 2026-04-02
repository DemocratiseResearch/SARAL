
# import os
# import shutil
# import uuid
# import sys
# import subprocess
# import logging
# import json
# import re
# from pathlib import Path
# from typing import Optional, Dict, Any
# from app.utils.timing import track_performance

# from fastapi import HTTPException

# # Configure logging
# logger = logging.getLogger(__name__)

# class PosterService:
#     @track_performance
#     def __init__(self):
#         self.base_dir = Path(__file__).resolve().parent / "paper2poster_core"
#         self.p2p_root = self.base_dir / "Paper2Poster"
#         self.posterbuilder_root = self.base_dir / "posterbuilder"
        
#         # Ensure roots exist
#         if not self.p2p_root.exists():
#             raise RuntimeError(f"Paper2Poster root not found at {self.p2p_root}")
    
#     @track_performance
#     async def generate_poster(
#         self, 
#         paper_id: str, 
#         pdf_path: str,
#         conference_venue: Optional[str] = None,
#         assets_dir: Optional[str] = None,
#         api_key: Optional[str] = None
#     ) -> Dict[str, Any]:
#         """
#         Generates a poster from a PDF.
#         """
#         run_id = f"{paper_id}_{uuid.uuid4().hex[:6]}"
#         # Use absolute path for work_dir to avoid confusion
#         work_dir = Path(f"temp/runs/{run_id}").resolve()
#         work_dir.mkdir(parents=True, exist_ok=True)
        
#         logger.info(f"Starting poster generation for {paper_id} in {work_dir}")
        
#         try:
#             # 1. Prepare Workspace
#             # Copy PDF to proper structure: input/paper/paper.pdf
#             # new_pipeline.py extracts poster_name from path[-2], so structure matters!
#             input_dir = self.p2p_root / "input" / "paper"
#             input_dir.mkdir(parents=True, exist_ok=True)
#             input_pdf = input_dir / "paper.pdf"
#             shutil.copy2(pdf_path, input_pdf)
            
#             # Use relative path from p2p_root like original pipeline does
#             relative_pdf_path = input_pdf.relative_to(self.p2p_root)
            
#             # 2. Run PosterAgent (Content Generation)
#             # We run this as a subprocess to keep the environment clean and leverage the existing script structure.
#             env = os.environ.copy()
#             env["PYTHONPATH"] = f"{self.p2p_root}:{env.get('PYTHONPATH', '')}"
#             env["OPENAI_API_KEY"] = "dummy" # wei_utils might check for it, but won't use it if we select gemini
#             # Ensure Google Key is present (already in env usually)
#             if api_key:
#                 env["GEMINI_API_KEY"] = api_key
#                 env["GOOGLE_API_KEY"] = api_key
            
#             cmd = [
#                 sys.executable, "-m", "PosterAgent.new_pipeline",
#                 f"--poster_path={relative_pdf_path}",
#                 "--model_name_t=gemini",
#                 "--model_name_v=gemini",
#                 "--poster_width_inches=48",
#                 "--poster_height_inches=36",
#                 "--max_workers=2" # Reduce workers for stability
#             ]
            
#             if conference_venue:
#                 cmd.append(f"--conference_venue={conference_venue}")
                
#             logger.info(f"Running Content Generation: {' '.join(cmd)}")
#             result = subprocess.run(
#                 cmd,
#                 cwd=str(self.p2p_root), # Run from Paper2Poster dir so relative paths work
#                 env=env,
#                 capture_output=True,
#                 text=True
#             )
            
#             if result.returncode != 0:
#                 logger.error(f"PosterAgent Failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}")
#                 raise HTTPException(status_code=500, detail=f"Content generation failed: {result.stderr[-500:]}")
            
#             logger.info("Content Generation Complete.")

#             # 2.5: Copy and rename files for posterbuilder
#             # new_pipeline.py creates files in self.p2p_root with specific naming
#             # build_poster.py expects different names in P2P_WORK_DIR
#             # poster_name is derived from the parent directory of the PDF: input/paper/paper.pdf -> "paper"
#             poster_name = "paper"  # Matches our directory structure
#             tag = "<gemini_gemini>"  # Model tag used in file names
            
#             # Source files (created by new_pipeline in p2p_root)
#             src_raw_content = self.p2p_root / "contents" / f"{tag}_{poster_name}_raw_content.json"
#             src_tree_split = self.p2p_root / "tree_splits" / f"{tag}_{poster_name}_tree_split_0.json"
#             src_images_json = self.p2p_root / f"{tag}_images_and_tables" / f"{poster_name}_images.json"
            
#             # Destination files (what build_poster expects)
#             (work_dir / "contents").mkdir(parents=True, exist_ok=True)
#             dst_raw_content = work_dir / "poster_content.json"
#             dst_tree_split = work_dir / "arrangement.json"
#             dst_fig_caption = work_dir / "figure_caption.json"
            
#             # Copy the files and clean them
            
#             # Helper to clean text
#             def clean_text(text):
#                 if not isinstance(text, str): return text
                
#                 # 1. Remove control characters (like \u001c) which break LaTeX
#                 text = ''.join(c for c in text if c.isprintable() or c in '\n\t ')
                
#                 # 2. ANSI codes
#                 text = re.sub(r'\x1b\[[0-9;]*m', '', text)
#                 text = re.sub(r'\[\d+m', '', text)
                
                
#                 # 3. Strip LaTeX color commands completely (keep content)
#                 # \textcolor{red}{text} -> text
#                 text = re.sub(r'\\textcolor\{[^}]+\}\{(.*?)\}', r'\1', text)
                
#                 # Also handle the \u001c explicit artifact if it wasn't caught
#                 text = text.replace('\u001c', '')
                
#                 # 4. Unicode superscripts/subscripts map REMOVED
#                 # We trust XeLaTeX to handle unicode chars or we accept they might be missing.
#                 # Converting to LaTeX commands ($^2$) causes "formatted messed up" because build_poster escapes them.
                
#                 return text

#             def recursive_clean(obj):
#                 if isinstance(obj, str): return clean_text(obj)
#                 if isinstance(obj, list): return [recursive_clean(x) for x in obj]
#                 if isinstance(obj, dict): return {k: recursive_clean(v) for k,v in obj.items()}
#                 return obj

#             if src_raw_content.exists():
#                 with open(src_raw_content, 'r') as f:
#                     content_data = json.load(f)
                
#                 cleaned_data = recursive_clean(content_data)
                
#                 with open(dst_raw_content, 'w') as f:
#                     json.dump(cleaned_data, f, indent=2)
                
#                 shutil.copy2(dst_raw_content, work_dir / "contents" / "poster_content.json")
#                 logger.info(f"Copied and cleaned raw content: {src_raw_content} -> {dst_raw_content}")
#             else:
#                 logger.warning(f"Raw content not found: {src_raw_content}")
                
#             if src_tree_split.exists():
#                 with open(src_tree_split, 'r') as f:
#                     tree_data = json.load(f)
#                 cleaned_tree = recursive_clean(tree_data)
                
#                 with open(dst_tree_split, 'w') as f:
#                     json.dump(cleaned_tree, f, indent=2)
                
#                 shutil.copy2(dst_tree_split, work_dir / "contents" / "arrangement.json")
#                 logger.info(f"Copied and cleaned tree split: {src_tree_split} -> {dst_tree_split}")
#             else:
#                 logger.warning(f"Tree split not found: {src_tree_split}")
                
#             if src_images_json.exists():
#                 with open(src_images_json, 'r') as f:
#                     images_data = json.load(f)
                
#                 cleaned_images = recursive_clean(images_data)
                
#                 with open(dst_fig_caption, 'w') as f:
#                     json.dump(cleaned_images, f, indent=2)
                
#                 shutil.copy2(dst_fig_caption, work_dir / "contents" / "figure_caption.json")
#                 logger.info(f"Copied and cleaned images json: {src_images_json} -> {dst_fig_caption}")
#             else:
#                 logger.warning(f"Images json not found: {src_images_json}")
            
#             # COPY IMAGES DIRECTORY (Critical for images to show up)
#             # Logic: verify which folder exists and copy it to work_dir/<tag>_images_and_tables
#             src_images_dir = self.p2p_root / f"{tag}_images_and_tables"
#             if src_images_dir.exists():
#                 dst_images_dir = work_dir / f"{tag}_images_and_tables"
#                 if dst_images_dir.exists():
#                     shutil.rmtree(dst_images_dir)
#                 shutil.copytree(src_images_dir, dst_images_dir)
#                 # verify contents
#                 files_in_images = list(dst_images_dir.rglob('*.*'))
#                 logger.info(f"Copied images directory: {src_images_dir} -> {dst_images_dir}. Found {len(files_in_images)} files.")
#             else:
#                 logger.warning(f"Images directory not found: {src_images_dir}")

#             # 3. Run PosterBuilder (Layout & Rendering)
#             # We execute build_poster.py as a subprocess too, injecting the env vars we refactored.
            
#             # Prepare env for builder
#             builder_env = env.copy()
#             builder_env["P2P_ROOT_DIR"] = str(self.base_dir) # Root for locating sibling folders if needed
#             builder_env["P2P_WORK_DIR"] = str(work_dir)      # Where to find inputs (json) and write outputs
            
#             builder_cmd = [
#                 sys.executable, 
#                 str(self.posterbuilder_root / "build_poster.py")
#             ]
            
#             logger.info(f"Running Layout Generation: {' '.join(builder_cmd)}")
#             builder_result = subprocess.run(
#                 builder_cmd,
#                 cwd=str(work_dir),
#                 env=builder_env,
#                 capture_output=True,
#                 text=True
#             )
            
#             logger.info(f"PosterBuilder Output:\nSTDOUT: {builder_result.stdout}\nSTDERR: {builder_result.stderr}")

#             if builder_result.returncode != 0:
#                 logger.error(f"PosterBuilder Failed:\nSTDOUT: {builder_result.stdout}\nSTDERR: {builder_result.stderr}")
#                 raise HTTPException(status_code=500, detail=f"Poster assembly failed: {builder_result.stderr[-500:]}")
                
#             # 3.5: Copy Template Files
#             # Ensure the template files (like beamerthemegemini.sty) are in the latex_proj directory
#             template_dir = self.base_dir / "template"
#             latex_dir = work_dir / "latex_proj"
            
#             if template_dir.exists() and latex_dir.exists():
#                 for item in template_dir.iterdir():
#                     dst_path = latex_dir / item.name
#                     if item.is_dir():
#                         if dst_path.exists(): shutil.rmtree(dst_path)
#                         shutil.copytree(item, dst_path)
#                     else:
#                         shutil.copy2(item, dst_path)
#                 logger.info(f"Copied template files to {latex_dir}")
#             else:
#                 logger.warning(f"Template dir {template_dir} or latex dir {latex_dir} missing.")

#             # 4. Compile PDF (Optional - build_poster might output .tex, we need pdf)
#             # build_poster.py outputs to latex_proj/poster_output_fix.tex
#             # We need to compile it.
#             # Assuming 'tectonic' or 'pdflatex' is available. `paper2poster` used tectonic.
            
#             latex_dir = work_dir / "latex_proj"
#             tex_file = latex_dir / "poster_output_fix.tex"
            
#             if not tex_file.exists():
#                 raise HTTPException(status_code=500, detail="Tex file was not created.")
                
#             # Try compiling
#             pdf_path = self._compile_pdf(latex_dir, tex_file, env)
            
#             return {
#                 "status": "success",
#                 "pdf_path": str(pdf_path) if pdf_path else None,
#                 "tex_path": str(tex_file),
#                 "work_dir": str(work_dir) # Keep for debugging or downloading assets
#             }
            
#         except Exception as e:
#             logger.exception("Poster generation failed")
#             raise HTTPException(status_code=500, detail=str(e))

#     @track_performance
#     def _compile_pdf(self, latex_dir: Path, tex_file: Path, env: Dict) -> Optional[Path]:
#         """Attempt to compile PDF using tectonic or pdflatex."""
#         # Check for tectonic
#         if shutil.which("tectonic"):
#             cmd = ["tectonic", str(tex_file)]
#             logger.info("Compiling with tectonic...")
#             subprocess.run(cmd, cwd=str(latex_dir), env=env, check=False)
#             pdf = latex_dir / "poster_output_fix.pdf"
#             if pdf.exists(): return pdf
            
#         # Fallback to pdflatex/xelatex
#         if shutil.which("xelatex"):
#             cmd = ["xelatex", "-interaction=nonstopmode", str(tex_file)]
#             logger.info("Compiling with xelatex...")
#             subprocess.run(cmd, cwd=str(latex_dir), env=env, check=False)
#             pdf = latex_dir / "poster_output_fix.pdf"
#             if pdf.exists(): return pdf
            
#         logger.warning("Could not compile PDF. Tex file is available.")
#         return None

# poster_service = PosterService()


import httpx
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from app.workers.poster_worker import GoPosterClient
logger = logging.getLogger(__name__)
class PosterService:
    """Proxy service for Go poster generation."""
    def __init__(self):
        self.go_client = GoPosterClient()
    async def generate_poster(
        self,
        paper_id: str,
        pdf_path: str,
        conference_venue: Optional[str] = None,
        assets_dir: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generates a poster by calling the Go service.
        Note: conference_venue, assets_dir, api_key are ignored (Go service doesn't use them)
        """
        output_dir = f"temp/posters/{paper_id}"
        result = await self.go_client.generate_poster(
            pdf_path=pdf_path,
            output_dir=output_dir
        )
        return result
poster_service = PosterService()