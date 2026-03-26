import os
import re
from pathlib import Path
from typing import List, Dict
from app.utils.timing import track_performance

@track_performance
def find_tex_file(directory):
    """Find the main .tex file in a directory."""
    tex_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.tex'):
                tex_files.append(os.path.join(root, file))
    
    if not tex_files:
        raise FileNotFoundError("No .tex files found in the directory")
    
    # Prefer main.tex or files with \documentclass
    for tex_file in tex_files:
        try:
            with open(tex_file, 'r', encoding='utf-8') as f:
                content = f.read()
                if '\\documentclass' in content:
                    return tex_file
        except:
            continue
    
    # Return the first .tex file found
    return tex_files[0]

@track_performance
def find_image_references(tex_file_path):
    """Find image references in LaTeX file."""
    image_refs = []
    
    try:
        with open(tex_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find \includegraphics commands
        includegraphics_pattern = r'\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}'
        matches = re.findall(includegraphics_pattern, content)
        image_refs.extend(matches)
        
        # Find \figure and \begin{figure} environments
        figure_pattern = r'\\begin\{figure\}.*?\\end\{figure\}'
        figure_matches = re.findall(figure_pattern, content, re.DOTALL)
        
        for figure in figure_matches:
            img_matches = re.findall(includegraphics_pattern, figure)
            image_refs.extend(img_matches)
            
    except Exception as e:
        print(f"Error finding image references: {e}")
    
    return list(set(image_refs))  # Remove duplicates

@track_performance
def find_image_files(directory, image_refs):
    """Find actual image files in the directory."""
    image_files = []
    image_extensions = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg']
    
    # Search for all image files in directory
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_lower = file.lower()
            if any(file_lower.endswith(ext) for ext in image_extensions):
                full_path = os.path.join(root, file)
                
                # Convert PDF to PNG if needed
                if file_lower.endswith('.pdf'):
                    try:
                        png_path = os.path.splitext(full_path)[0] + '.png'
                        # Use pdf2image or similar library to convert PDF to PNG
                        convert_pdf_to_png(full_path, png_path)
                        if os.path.exists(png_path):
                            image_files.append(png_path)
                        else:
                            image_files.append(full_path)  # Fall back to PDF if conversion fails
                    except Exception as e:
                        print(f"Error converting PDF to PNG: {e}")
                        image_files.append(full_path)  # Fall back to PDF
                else:
                    image_files.append(full_path)
    
    # If we have specific references, try to match them
    if image_refs:
        matched_files = []
        for ref in image_refs:
            ref_name = os.path.basename(ref)
            ref_name_no_ext = os.path.splitext(ref_name)[0]
            
            for img_file in image_files:
                img_name = os.path.basename(img_file)
                img_name_no_ext = os.path.splitext(img_name)[0]
                
                if (ref_name in img_name or 
                    ref_name_no_ext in img_name_no_ext or
                    img_name_no_ext in ref_name_no_ext):
                    matched_files.append(img_file)
                    break
        
        if matched_files:
            return matched_files
    
    return image_files

@track_performance
def convert_pdf_to_png(pdf_path, png_path):
    """Convert PDF file to PNG using pdf2image."""
    try:
        from pdf2image import convert_from_path
        
        # Convert the first page of the PDF to PNG
        images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=1)
        if images:
            images[0].save(png_path, 'PNG')
            print(f"Successfully converted {pdf_path} to {png_path}")
            return True
        return False
    except ImportError:
        print("pdf2image library not installed. Please install with: pip install pdf2image")
        return False
    except Exception as e:
        print(f"Error during PDF to PNG conversion: {e}")
        return False

@track_performance
def extract_image_captions(tex_file_path):
    """Extract image captions from LaTeX file."""
    captions = {}
    
    try:
        with open(tex_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find figure environments with captions
        figure_pattern = r'\\begin\{figure\}(.*?)\\end\{figure\}'
        figures = re.findall(figure_pattern, content, re.DOTALL)
        
        for i, figure in enumerate(figures):
            caption_match = re.search(r'\\caption\{([^}]+)\}', figure)
            if caption_match:
                captions[f"figure_{i}"] = caption_match.group(1)
                
    except Exception as e:
        print(f"Error extracting captions: {e}")
    
    return captions

@track_performance
def create_placeholder_image():
    """Create a placeholder image if no images are found."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        
        placeholder_dir = "temp/images"
        Path(placeholder_dir).mkdir(parents=True, exist_ok=True)
        placeholder_path = os.path.join(placeholder_dir, "placeholder.png")
        
        placeholder = Image.new('RGB', (800, 600), color='#f0f0f0')
        draw = ImageDraw.Draw(placeholder)
        
        try:
            font = ImageFont.truetype("Arial", 20)
        except:
            font = ImageFont.load_default()
            
        draw.text((350, 280), "No Image Available", fill='#333333', font=font)
        placeholder.save(placeholder_path)
        
        return [placeholder_path]
    except Exception as e:
        print(f"Could not create placeholder image: {e}")
        return []
        placeholder_dir = "temp/images"
        Path(placeholder_dir).mkdir(parents=True, exist_ok=True)
        placeholder_path = os.path.join(placeholder_dir, "placeholder.png")
        
        placeholder = Image.new('RGB', (800, 600), color='#f0f0f0')
        draw = ImageDraw.Draw(placeholder)
        
        try:
            font = ImageFont.truetype("Arial", 20)
        except:
            font = ImageFont.load_default()
            
        draw.text((350, 280), "No Image Available", fill='#333333', font=font)
        placeholder.save(placeholder_path)
        
        return [placeholder_path]
    except Exception as e:
        print(f"Could not create placeholder image: {e}")
        return []
