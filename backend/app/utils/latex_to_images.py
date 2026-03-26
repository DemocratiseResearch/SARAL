# #!/usr/bin/env python3

# import os
# import tempfile
# import subprocess
# import shutil
# import sys
# from pdf2image import convert_from_path
# from pathlib import Path
# from app.utils.timing import track_performance

# def check_poppler():
#     """Check if poppler-utils are installed by trying to run pdftoppm"""
#     try:
#         result = subprocess.run(['pdftoppm', '-v'],
#                               stdout=subprocess.PIPE,
#                               stderr=subprocess.PIPE,
#                               text=True)
#         return result.returncode == 0
#     except FileNotFoundError:
#         return False

# def check_pdflatex():
#     """Check if pdflatex is installed and provide installation instructions if missing"""
#     try:
#         result = subprocess.run(['pdflatex', '--version'],
#                               stdout=subprocess.PIPE,
#                               stderr=subprocess.PIPE,
#                               text=True)
#         return result.returncode == 0
#     except FileNotFoundError:
#         print("\nError: pdflatex is not installed or not in the PATH.")
#         return False

# @track_performance
# def compile_latex(tex_file, output_dir):
#     """Compile the LaTeX file to PDF using pdflatex"""
    
#     # First check if pdflatex is available
#     if not check_pdflatex():
#         print("LaTeX compilation failed: pdflatex is not installed.")
#         return None

#     # Get directory of the tex file for compilation
#     tex_dir = os.path.dirname(os.path.abspath(tex_file))
#     tex_filename = os.path.basename(tex_file)

#     # Create a temporary directory for compilation
#     with tempfile.TemporaryDirectory() as temp_dir:
#         print(f"Created temp directory for LaTeX compilation: {temp_dir}")

#         # Copy the TeX file to the temp directory
#         shutil.copy2(tex_file, os.path.join(temp_dir, tex_filename))
#         print(f"Copied {tex_file} to {os.path.join(temp_dir, tex_filename)}")

#         # Copy the theme style files from known locations
#         theme_files = [
#             'beamerthemeSimpleDarkBlue.sty',
#             'beamerfontthemeSimpleDarkBlue.sty',
#             'beamercolorthemeSimpleDarkBlue.sty',
#             'beamerinnerthemeSimpleDarkBlue.sty'
#         ]

#         # Try to find and copy theme files from various locations
#         theme_found = False
#         theme_paths = [
#             os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'latex_template'),
#             'latex_template',
#             os.path.join('..', 'latex_template'),
#             tex_dir,
#             os.path.join(tex_dir, 'latex_template'),
#             os.path.join(os.path.dirname(tex_dir), 'latex_template'),
#             'temp/latex_template'  # Add our temp directory
#         ]

#         for theme_path in theme_paths:
#             if os.path.exists(theme_path):
#                 print(f"Found potential theme directory: {theme_path}")
#                 for theme_file in theme_files:
#                     source_file = os.path.join(theme_path, theme_file)
#                     if os.path.exists(source_file):
#                         # Copy theme file to temp directory
#                         dest_file = os.path.join(temp_dir, theme_file)
#                         print(f"Copying theme file: {source_file} -> {dest_file}")
#                         shutil.copy2(source_file, dest_file)
#                         theme_found = True

#                 # If theme files were found in this directory, we don't need to check others
#                 if theme_found:
#                     print(f"Successfully found and copied theme files from {theme_path}")
#                     break

#         if not theme_found:
#             print("Warning: Could not find theme files. LaTeX compilation may fail.")

#         # Copy all files from tex_dir as a fallback
#         print(f"Copying all files from {tex_dir} as fallback...")
#         for item in os.listdir(tex_dir):
#             source_item = os.path.join(tex_dir, item)
#             dest_item = os.path.join(temp_dir, item)
#             try:
#                 if os.path.isfile(source_item) and not os.path.exists(dest_item):
#                     shutil.copy2(source_item, dest_item)
#                 elif os.path.isdir(source_item) and not os.path.exists(dest_item):
#                     shutil.copytree(source_item, dest_item)
#             except Exception as e:
#                 print(f"Error copying {source_item}: {e}")

#         # List files in temp directory
#         print("Files in temporary directory:")
#         for root, dirs, files in os.walk(temp_dir):
#             rel_path = os.path.relpath(root, temp_dir)
#             path_display = rel_path if rel_path != '.' else ''
#             for file in files:
#                 print(f" - {os.path.join(path_display, file)}")

#         # Run pdflatex in the temporary directory - RUN TWICE for references
#         print(f"Running pdflatex on {tex_filename} in {temp_dir}")
        
#         # First run
#         process1 = subprocess.run([
#             'pdflatex',
#             '-interaction=nonstopmode',
#             tex_filename
#         ],
#         cwd=temp_dir,
#         capture_output=True,
#         text=True
#         )
        
#         # Second run for references
#         process2 = subprocess.run([
#             'pdflatex',
#             '-interaction=nonstopmode',
#             tex_filename
#         ],
#         cwd=temp_dir,
#         capture_output=True,
#         text=True
#         )

#         # Show compilation output for debugging
#         print("\nLaTeX compilation output (first run):")
#         print(process1.stdout)
        
#         print("\nLaTeX compilation output (second run):")
#         print(process2.stdout)

#         # Check if PDF was actually created (this is the key fix)
#         pdf_filename = os.path.splitext(tex_filename)[0] + '.pdf'
#         pdf_path = os.path.join(temp_dir, pdf_filename)
        
#         if not os.path.exists(pdf_path):
#             print(f"Error: PDF file was not created at {pdf_path}")
#             print("LaTeX compilation stderr (first run):")
#             print(process1.stderr)
#             print("LaTeX compilation stderr (second run):")
#             print(process2.stderr)
#             return None

#         # Check if the PDF has content (size > 0)
#         if os.path.getsize(pdf_path) == 0:
#             print(f"Error: PDF file is empty at {pdf_path}")
#             return None

#         # Copy the PDF to the output directory for preservation
#         output_pdf = os.path.join(output_dir, pdf_filename)
#         shutil.copy2(pdf_path, output_pdf)
#         print(f"PDF created successfully: {output_pdf}")

#         return output_pdf

# def convert_pdf_to_images(pdf_file, output_dir, dpi=300):
#     """Convert the PDF to images, one per page/slide"""
    
#     if not os.path.exists(output_dir):
#         os.makedirs(output_dir)

#     if not os.path.exists(pdf_file):
#         print(f"Error: PDF file not found at {pdf_file}")
#         return []

#     # Create images subdirectory
#     images_dir = os.path.join(output_dir, "images")
#     os.makedirs(images_dir, exist_ok=True)

#     try:
#         # Convert PDF to images
#         images = convert_from_path(pdf_file, dpi=dpi)

#         # Save images
#         base_filename = os.path.splitext(os.path.basename(pdf_file))[0]
#         image_paths = []

#         for i, image in enumerate(images):
#             image_path = os.path.join(images_dir, f"slide_{i:03d}.png")
#             print(image_path)
#             image.save(image_path, "PNG")
#             image_paths.append(image_path)
#             print(f"Created: {image_path}")

#         return image_paths

#     except Exception as e:
#         print(f"Error converting PDF to images: {str(e)}")
#         return []








import os
import tempfile
import subprocess
import shutil
import sys
from pdf2image import convert_from_path
from pathlib import Path
from app.utils.timing import track_performance

def check_poppler():
    """Check if poppler-utils are installed by trying to run pdftoppm"""
    try:
        result = subprocess.run(['pdftoppm', '-v'],
                              stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE,
                              text=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False



def check_xelatex():
    """Check if xelatex is installed"""
    try:
        result = subprocess.run(['xelatex', '--version'],
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                text=True)
        return result.returncode == 0
    except FileNotFoundError:
        print("Error: xelatex is not installed or not in PATH.")
        return False


@track_performance
def compile_latex(tex_file, output_dir):
    """Compile the LaTeX file to PDF using xelatex (supports Hindi/Devanagari)"""

    if not check_xelatex():
        print("LaTeX compilation failed: xelatex is not installed.")
        return None

    tex_dir = os.path.dirname(os.path.abspath(tex_file))
    tex_filename = os.path.basename(tex_file)

    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"Created temp directory for LaTeX compilation: {temp_dir}")

        # Copy the TeX file to the temp directory
        shutil.copy2(tex_file, os.path.join(temp_dir, tex_filename))
        print(f"Copied {tex_file} to {os.path.join(temp_dir, tex_filename)}")

        # Theme files to look for
        theme_files = [
            'beamerthemeSimpleDarkBlue.sty',
            'beamerfontthemeSimpleDarkBlue.sty',
            'beamercolorthemeSimpleDarkBlue.sty',
            'beamerinnerthemeSimpleDarkBlue.sty'
        ]

        # Search paths for theme files
        theme_paths = [
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'latex_template'),
            'latex_template',
            os.path.join('..', 'latex_template'),
            tex_dir,
            os.path.join(tex_dir, 'latex_template'),
            os.path.join(os.path.dirname(tex_dir), 'latex_template'),
            'temp/latex_template'
        ]

        theme_found = False
        for theme_path in theme_paths:
            if os.path.exists(theme_path):
                print(f"Found potential theme directory: {theme_path}")
                for theme_file in theme_files:
                    source_file = os.path.join(theme_path, theme_file)
                    if os.path.exists(source_file):
                        dest_file = os.path.join(temp_dir, theme_file)
                        print(f"Copying theme file: {source_file} -> {dest_file}")
                        shutil.copy2(source_file, dest_file)
                        theme_found = True

                if theme_found:
                    print(f"Successfully found and copied theme files from {theme_path}")
                    break

        if not theme_found:
            print("Warning: Could not find theme files. Falling back to default theme.")

        # Copy all remaining files from tex_dir as fallback
        print(f"Copying all files from {tex_dir} as fallback...")
        for item in os.listdir(tex_dir):
            source_item = os.path.join(tex_dir, item)
            dest_item = os.path.join(temp_dir, item)
            try:
                if os.path.isfile(source_item) and not os.path.exists(dest_item):
                    shutil.copy2(source_item, dest_item)
                elif os.path.isdir(source_item) and not os.path.exists(dest_item):
                    shutil.copytree(source_item, dest_item)
            except Exception as e:
                print(f"Error copying {source_item}: {e}")

        # List files in temp directory for debugging
        print("Files in temporary directory:")
        for root, dirs, files in os.walk(temp_dir):
            rel_path = os.path.relpath(root, temp_dir)
            path_display = rel_path if rel_path != '.' else ''
            for file in files:
                print(f"  - {os.path.join(path_display, file)}")

        print(f"Running xelatex on {tex_filename} in {temp_dir}")

        # Run xelatex TWICE — first pass generates .aux, second resolves references
        for run_number in range(1, 3):
            process = subprocess.run(
                [
                    'xelatex',
                    '-interaction=nonstopmode',
                    f'-output-directory={temp_dir}',
                    tex_filename
                ],
                cwd=temp_dir,
                capture_output=True,
                text=True
            )
            print(f"\nxelatex run {run_number} stdout (last 3000 chars):")
            print(process.stdout[-3000:])

            if run_number == 2:
                # Only check stderr on final run
                if process.returncode != 0:
                    print(f"\nxelatex run {run_number} stderr:")
                    print(process.stderr[-3000:])

        # Verify PDF was created
        pdf_filename = os.path.splitext(tex_filename)[0] + '.pdf'
        pdf_path = os.path.join(temp_dir, pdf_filename)

        if not os.path.exists(pdf_path):
            print(f"Error: PDF file was not created at {pdf_path}")
            print("Full stderr from last run:")
            print(process.stderr)
            return None

        if os.path.getsize(pdf_path) == 0:
            print(f"Error: PDF file is empty at {pdf_path}")
            return None

        # Copy PDF to the output directory
        os.makedirs(output_dir, exist_ok=True)
        output_pdf = os.path.join(output_dir, pdf_filename)
        shutil.copy2(pdf_path, output_pdf)
        print(f"PDF created successfully: {output_pdf}")

        return output_pdf


def convert_pdf_to_images(pdf_file, output_dir, dpi=300):
    """Convert the PDF to images, one per page/slide"""
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    if not os.path.exists(pdf_file):
        print(f"Error: PDF file not found at {pdf_file}")
        return []

    # Create images subdirectory
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    try:
        # Convert PDF to images
        images = convert_from_path(pdf_file, dpi=dpi)

        # Save images
        base_filename = os.path.splitext(os.path.basename(pdf_file))[0]
        image_paths = []

        for i, image in enumerate(images):
            image_path = os.path.join(images_dir, f"slide_{i:03d}.png")
            print(image_path)
            image.save(image_path, "PNG")
            image_paths.append(image_path)
            print(f"Created: {image_path}")

        return image_paths

    except Exception as e:
        print(f"Error converting PDF to images: {str(e)}")
        return []





