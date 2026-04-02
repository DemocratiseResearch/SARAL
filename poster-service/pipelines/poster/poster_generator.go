package poster

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"saral_go_poster/common"
)

// PosterGenerator handles poster content generation and compilation
type PosterGenerator struct {
	OutputDir string
	Template  *PosterTemplate
}

// NewPosterGenerator creates a new poster generator
func NewPosterGenerator(outputDir string) *PosterGenerator {
	return &PosterGenerator{
		OutputDir: outputDir,
		Template:  NewPosterTemplate(),
	}
}

// SetColumns sets the number of columns for the poster
func (g *PosterGenerator) SetColumns(n int) {
	if n >= 1 && n <= 3 {
		g.Template.NumColumns = n
	}
}

// SetDimensions sets custom poster dimensions
func (g *PosterGenerator) SetDimensions(width, height int) {
	g.Template.Width = width
	g.Template.Height = height
}

// GeneratePoster creates the poster from content and images
func (g *PosterGenerator) GeneratePoster(content *common.PosterContent, imagePaths []string, outputName string) (string, error) {
	// Ensure output directory exists
	if err := os.MkdirAll(g.OutputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output directory: %w", err)
	}

	// Copy required theme files
	if err := g.setupThemeFiles(); err != nil {
		return "", fmt.Errorf("failed to setup theme files: %w", err)
	}

	// Generate LaTeX content
	latexContent := g.Template.GenerateLatex(content, imagePaths)

	// Write LaTeX file
	texFile := filepath.Join(g.OutputDir, outputName+".tex")
	if err := os.WriteFile(texFile, []byte(latexContent), 0644); err != nil {
		return "", fmt.Errorf("failed to write tex file: %w", err)
	}

	// Compile to PDF
	pdfPath, err := g.compileLatex(texFile)
	if err != nil {
		return "", err
	}

	return pdfPath, nil
}

// setupThemeFiles creates the beamer theme files needed for the poster
func (g *PosterGenerator) setupThemeFiles() error {
	// Create beamerthemegemini.sty
	geminiTheme := `% Gemini theme
% Simplified version without Cambridge branding

\ProvidesPackage{beamerthemegemini}

\mode<presentation>

% Requirement
\RequirePackage{tikz}
\RequirePackage{xcolor}

% Colors
\definecolor{geminiblue}{HTML}{355C7D}
\definecolor{geminiaccent}{HTML}{6C5B7B}
\definecolor{geminibg}{HTML}{F5F5F5}

% Set colors
\setbeamercolor{headline}{fg=white,bg=geminiblue}
\setbeamercolor{footline}{fg=white,bg=geminiblue}
\setbeamercolor{block title}{fg=white,bg=geminiblue}
\setbeamercolor{block body}{fg=black,bg=white}
\setbeamercolor{title}{fg=white}
\setbeamercolor{author}{fg=white}
\setbeamercolor{itemize item}{fg=geminiblue}
\setbeamercolor{itemize subitem}{fg=geminiaccent}

% Fonts
\setbeamerfont{headline title}{size=\VeryHuge,series=\bfseries}
\setbeamerfont{headline author}{size=\Large}
\setbeamerfont{block title}{size=\large,series=\bfseries}
\setbeamerfont{block body}{size=\normalsize}

% Itemize
\setbeamertemplate{itemize item}{\textbullet}
\setbeamertemplate{itemize subitem}{\textbullet}

% Block
\setbeamertemplate{block begin}{
  \vskip1em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex]{block title}%
    \usebeamerfont{block title}\insertblocktitle
  \end{beamercolorbox}%
  \vskip-0.5em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex,vmode]{block body}%
    \usebeamerfont{block body}%
}
\setbeamertemplate{block end}{
  \end{beamercolorbox}
  \vskip1em
}

% Alert block
\setbeamercolor{block title alerted}{fg=white,bg=geminiaccent}
\setbeamertemplate{block alerted begin}{
  \vskip1em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex]{block title alerted}%
    \usebeamerfont{block title}\insertblocktitle
  \end{beamercolorbox}%
  \vskip-0.5em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex,vmode]{block body}%
    \usebeamerfont{block body}%
}
\setbeamertemplate{block alerted end}{
  \end{beamercolorbox}
  \vskip1em
}

% Headline
\setbeamertemplate{headline}{
  \leavevmode
  \begin{beamercolorbox}[wd=\paperwidth]{headline}
    \centering
    \vskip2ex
    \usebeamerfont{headline title}\usebeamercolor[fg]{title}\inserttitle\\[1ex]
    \usebeamerfont{headline author}\usebeamercolor[fg]{author}\insertauthor\\[1ex]
    \usebeamerfont{headline institutr}\usebeamercolor[fg]{author}\insertinstitute
    \vskip2ex
  \end{beamercolorbox}
}

\mode<all>
`

	// Create beamercolorthemegemini.sty
	geminiColor := `% Gemini color theme
\ProvidesPackage{beamercolorthemegemini}

\mode<presentation>

\definecolor{geminiblue}{HTML}{355C7D}
\definecolor{geminiaccent}{HTML}{6C5B7B}
\definecolor{geminibg}{HTML}{FFFFFF}

\setbeamercolor{background canvas}{bg=geminibg}
\setbeamercolor{headline}{fg=white,bg=geminiblue}
\setbeamercolor{footline}{fg=white,bg=geminiblue}
\setbeamercolor{title}{fg=white}
\setbeamercolor{author}{fg=white}
\setbeamercolor{block title}{fg=white,bg=geminiblue}
\setbeamercolor{block body}{fg=black,bg=white}
\setbeamercolor{itemize item}{fg=geminiblue}
\setbeamercolor{itemize subitem}{fg=geminiaccent}
\setbeamercolor{enumerate item}{fg=geminiblue}

\mode<all>
`

	// Write theme files
	if err := os.WriteFile(filepath.Join(g.OutputDir, "beamerthemegemini.sty"), []byte(geminiTheme), 0644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(g.OutputDir, "beamercolorthemegemini.sty"), []byte(geminiColor), 0644); err != nil {
		return err
	}

	return nil
}

// compileLatex compiles the LaTeX file to PDF using pdflatex
func (g *PosterGenerator) compileLatex(texFile string) (string, error) {
	// Get absolute paths
	absOutputDir, err := filepath.Abs(g.OutputDir)
	if err != nil {
		return "", fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Get just the filename (tex file is in the output dir)
	texBaseName := filepath.Base(texFile)

	// Run pdflatex twice for proper referencing
	for i := 0; i < 2; i++ {
		cmd := exec.Command("pdflatex",
			"-interaction=nonstopmode",
			"-output-directory", absOutputDir,
			texBaseName,
		)
		// Run from the directory containing the tex file
		cmd.Dir = absOutputDir

		output, err := cmd.CombinedOutput()
		if err != nil && i == 1 {
			// Only fail on second attempt
			fmt.Printf("pdflatex output: %s\n", string(output))
			return "", fmt.Errorf("pdflatex failed: %w", err)
		}
	}

	baseName := strings.TrimSuffix(texBaseName, ".tex")
	pdfPath := filepath.Join(absOutputDir, baseName+".pdf")

	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		return "", fmt.Errorf("PDF not generated")
	}

	return pdfPath, nil
}
