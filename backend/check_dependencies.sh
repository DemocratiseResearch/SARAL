#!/bin/bash
# SARAL Backend System Dependencies Verification Script
# Run this script to check if all required dependencies are installed

echo "=========================================="
echo "SARAL Backend Dependencies Check"
echo "=========================================="
echo ""

check_command() {
    local cmd=$1
    local version_flag=$2
    local required=$3
    
    if command -v $cmd &> /dev/null; then
        echo "✅ $cmd: $(which $cmd)"
        if [ ! -z "$version_flag" ]; then
            echo "   Version: $($cmd $version_flag 2>&1 | head -n 1)"
        fi
    else
        if [ "$required" = "required" ]; then
            echo "❌ $cmd: NOT FOUND (REQUIRED)"
        else
            echo "⚠️  $cmd: NOT FOUND (OPTIONAL)"
        fi
    fi
    echo ""
}

# Check required dependencies
echo "Required Dependencies:"
echo "----------------------"
check_command "ffmpeg" "--version" "required"
check_command "pdflatex" "--version" "required"
check_command "xelatex" "--version" "required"
check_command "pdftoppm" "-v" "required"
check_command "pdfinfo" "-version" "required"

# Check LibreOffice/soffice
if command -v soffice &> /dev/null; then
    echo "✅ soffice: $(which soffice)"
    soffice --version 2>&1 | head -n 1
elif command -v libreoffice &> /dev/null; then
    echo "✅ libreoffice: $(which libreoffice)"
    libreoffice --version 2>&1 | head -n 1
elif [[ -f "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]]; then
    echo "✅ LibreOffice: /Applications/LibreOffice.app/Contents/MacOS/soffice"
    /Applications/LibreOffice.app/Contents/MacOS/soffice --version 2>&1 | head -n 1
else
    echo "❌ LibreOffice/soffice: NOT FOUND (REQUIRED)"
fi
echo ""

# Check optional dependencies
echo "Optional Dependencies:"
echo "----------------------"
check_command "tectonic" "--version" "optional"

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="

required_missing=0
if ! command -v ffmpeg &> /dev/null; then ((required_missing++)); fi
if ! command -v pdflatex &> /dev/null; then ((required_missing++)); fi
if ! command -v xelatex &> /dev/null; then ((required_missing++)); fi
if ! command -v pdftoppm &> /dev/null; then ((required_missing++)); fi
if ! command -v pdfinfo &> /dev/null; then ((required_missing++)); fi
if ! command -v soffice &> /dev/null && ! command -v libreoffice &> /dev/null && ! [[ -f "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]]; then
    ((required_missing++))
fi

if [ $required_missing -eq 0 ]; then
    echo "✅ All required dependencies are installed!"
    echo ""
    echo "You can now run the SARAL backend."
else
    echo "❌ $required_missing required dependencies are missing."
    echo ""
    echo "To install missing dependencies:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  Run: ./install_dependencies_macos.sh"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "  Run: ./install_dependencies_linux.sh"
    fi
    echo ""
    echo "Or refer to SYSTEM_DEPENDENCIES.md for manual installation."
fi

echo ""