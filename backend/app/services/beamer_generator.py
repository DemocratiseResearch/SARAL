import os
import json
from typing import Dict, List
from pathlib import Path

def create_beamer_presentation(paper_id: str, scripts_data: dict, metadata: dict, image_assignments: dict = None):
    """Create a complete Beamer presentation with bullet points - Fixed slide length issue."""
    
    # Load scripts data
    sections = scripts_data.get("sections", {})
    title_intro = scripts_data.get("title_intro_script", "")
    
    # Create LaTeX content
    latex_content = generate_beamer_latex(metadata, sections, title_intro, image_assignments or {})
    
    # Save LaTeX file
    latex_dir = f"temp/latex/{paper_id}"
    os.makedirs(latex_dir, exist_ok=True)
    latex_file = os.path.join(latex_dir, f"{paper_id}_presentation.tex")
    
    with open(latex_file, 'w', encoding='utf-8') as f:
        f.write(latex_content)
    
    return latex_file

def generate_beamer_latex(metadata: dict, sections: dict, title_intro: str, image_assignments: dict):
    """Generate complete Beamer LaTeX with bullet points - FIXED: No longer creates 30+ slides."""
    
    latex_content = f"""\\documentclass[aspectratio=169]{{beamer}}

% Theme and packages
\\usepackage{{graphicx}}
\\usepackage{{amsmath}}
\\usepackage{{amsfonts}}
\\usepackage{{amssymb}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}

% Use theme - try to load from multiple locations
\\makeatletter
\\@ifpackagelater{{}} {{}} {{}}
\\makeatother

% Try different theme paths
\\IfFileExists{{beamerthemeSimpleDarkBlue.sty}}{{\\usetheme{{SimpleDarkBlue}}}}{{
\\IfFileExists{{temp/latex_template/beamerthemeSimpleDarkBlue.sty}}{{
\\usepackage{{temp/latex_template/beamerthemeSimpleDarkBlue}}
}}{{
% Fallback to default theme
\\usetheme{{Madrid}}
\\usecolortheme{{seahorse}}
}}
}}

% Title information
\\title{{{escape_latex(metadata.get('title', 'Research Presentation'))}}}
\\author{{{escape_latex(metadata.get('authors', 'Author'))}}}
\\date{{{escape_latex(metadata.get('date', '2024'))}}}

\\begin{{document}}

% Title slide
\\begin{{frame}}
\\titlepage
\\end{{frame}}

"""

    # Add section slides - Use actual sections from the script (supports all complexity modes)
    # Get section names from the actual data, preserving their order
    section_names = list(sections.keys())
    
    # Try to maintain a logical order if sections are not ordered
    # Define preferred order for known sections
    preferred_order = ["Introduction", "Background", "Key Findings", "Methodology", "Results", "Analysis", "Discussion", "Conclusion"]
    
    # Sort sections based on preferred order
    def get_order_index(section_name):
        try:
            return preferred_order.index(section_name)
        except ValueError:
            return len(preferred_order)  # Put unknown sections at the end
    
    section_names_sorted = sorted(section_names, key=get_order_index)
    
    for section_name in section_names_sorted:
        if section_name in sections:
            section_data = sections[section_name]
            
            # Handle both old and new data structures
            if isinstance(section_data, dict):
                bullet_points = section_data.get("bullet_points", [])
                assigned_image = section_data.get("assigned_image")
            else:
                bullet_points = []
                assigned_image = None
            
            latex_content += f"""
% {section_name} slide
\\begin{{frame}}{{{section_name}}}
"""
            
            # Add image if assigned
            if assigned_image:
                latex_content += f"""\\begin{{columns}}
\\begin{{column}}{{0.6\\textwidth}}
"""
            
            # Add bullet points - REMOVED [<+->] overlay to prevent slide multiplication
            if bullet_points:
                latex_content += """\\begin{itemize}
"""
                for bullet in bullet_points:
                    # Ensure bullet is a string and escape it properly
                    bullet_text = str(bullet) if bullet else "No content"
                    latex_content += f"\\item {escape_latex(bullet_text)}\n"
                    
                latex_content += """\\end{itemize}
"""
            else:
                # Fallback content if no bullet points
                latex_content += f"""\\begin{{itemize}}
\\item Key points about {section_name.lower()} will be presented here
\\end{{itemize}}
"""
            
            # Close columns and add image
            if assigned_image:
                latex_content += f"""\\end{{column}}
\\begin{{column}}{{0.4\\textwidth}}
\\begin{{center}}
\\includegraphics[width=\\textwidth,height=0.7\\textheight,keepaspectratio]{{images/{assigned_image}}}
\\end{{center}}
\\end{{column}}
\\end{{columns}}
"""
            
            latex_content += """\\end{frame}

"""

    latex_content += """\\end{document}"""
    
    return latex_content

def escape_latex(text: str) -> str:
    """Escape special LaTeX characters properly."""
    if not text:
        return ""
    
    text = str(text)  # Ensure it's a string
    
    # Order matters for replacements
    replacements = [
        ('\\', '\\textbackslash{}'),
        ('{', '\\{'),
        ('}', '\\}'),
        ('$', '\\$'),
        ('&', '\\&'),
        ('%', '\\%'),
        ('#', '\\#'),
        ('^', '\\textasciicircum{}'),
        ('_', '\\_'),
        ('~', '\\textasciitilde{}'),
    ]
    
    for char, replacement in replacements:
        text = text.replace(char, replacement)
    
    return text
