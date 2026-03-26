// src/components/common/UnifiedHeader.jsx
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiMenu, FiX } from "react-icons/fi";
import ThemeToggle from "./ThemeToggle";
import { PuzzlePiece24Regular } from "@fluentui/react-icons";

const UnifiedHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isLanding = location.pathname === "/";

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  };

  const handleSectionClick = (id) => {
    if (!isLanding) {
      navigate("/");
      setTimeout(() => scrollToSection(id), 120);
    } else {
      scrollToSection(id);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ================= DESKTOP LAYOUT ================= */}
        <div className="hidden lg:block">
          <div className="flex items-center justify-between h-20">
            
            {/* LEFT: Logo + Title + ANRF */}
            <Link to="/" className="flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 bg-neutral-900 dark:bg-white rounded-xl flex items-center justify-center">
                <span className="text-white dark:text-neutral-900 font-bold text-base">
                  SA
                </span>
              </div>

              <div className="flex flex-col leading-tight">
                <span className="text-lg font-bold text-neutral-900 dark:text-white whitespace-nowrap">
                  Saral AI
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  Supported by {" "}
                  <a
                    href="https://www.anrfonline.in/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    ANRF
                  </a>
                </span>
              </div>
            </Link>

            {/* CENTER: Navigation */}
            <nav className="flex items-center gap-1 mx-4">
              <button
                onClick={() =>
                  location.pathname === "/"
                    ? window.scrollTo({ top: 0, behavior: "smooth" })
                    : navigate("/")
                }
                className="px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap transition-colors"
              >
                Home
              </button>

              <button
                onClick={() => handleSectionClick("how-it-works")}
                className="px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap transition-colors"
              >
                How It Works
              </button>

              <button
                onClick={() => handleSectionClick("features")}
                className="px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap transition-colors"
              >
                Features
              </button>
              
              <button
                onClick={() => handleSectionClick("testimonials")}
                className="px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap transition-colors"
              >
                Testimonials
              </button>

              <Link
                to="/about"
                className="px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap transition-colors"
              >
                About
              </Link>

              <div className="ml-2">
                <ThemeToggle />
              </div>
            </nav>

            {/* RIGHT: CTA */}
            <a
              href="/arxiv-plugin.zip"
              download
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all flex-shrink-0 whitespace-nowrap"
            >
              <PuzzlePiece24Regular className="w-4 h-4" />
              Download Saral Extension (arXiv)
            </a>
          </div>
        </div>

        {/* ================= TABLET LAYOUT (md to lg) ================= */}
        <div className="hidden md:block lg:hidden">
          <div className="flex flex-col py-3 gap-3">
            {/* Top Row: Logo + ANRF + Menu Button */}
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-neutral-900 dark:bg-white rounded-xl flex items-center justify-center">
                  <span className="text-white dark:text-neutral-900 font-bold text-sm">
                    SA
                  </span>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">
                    Saral AI
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Supported by {" "}
                    <a
                      href="https://www.anrfonline.in/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      ANRF
                    </a>
                  </span>
                </div>
              </Link>

              <button
                onClick={() => setOpen(!open)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white transition-colors"
              >
                {open ? <FiX size={22} /> : <FiMenu size={22} />}
              </button>
            </div>

            {/* Mobile Menu for Tablet */}
            {open && (
              <div className="pb-2 space-y-1 border-t border-neutral-200 dark:border-neutral-800 pt-2">
                <button
                  onClick={() => {
                    if (location.pathname === "/") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      navigate("/");
                    }
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Home
                </button>

                <button
                  onClick={() => handleSectionClick("how-it-works")}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  How It Works
                </button>

                <button
                  onClick={() => handleSectionClick("features")}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Features
                </button>

                <button
                  onClick={() => handleSectionClick("testimonials")}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Testimonials
                </button>

                <Link
                  to="/about"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  About
                </Link>

                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>

                <div className="pt-2">
                  <a
                    href="/arxiv-plugin.zip"
                    download
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all"
                  >
                    <PuzzlePiece24Regular className="w-4 h-4" />
                    Download Saral Extension (arXiv)
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= MOBILE LAYOUT ================= */}
        <div className="md:hidden">
          <div className="flex items-center justify-between h-16 relative">
            {/* Logo - Left */}
            <Link to="/" className="flex items-center gap-2 z-10">
              <div className="w-8 h-8 bg-neutral-900 dark:bg-white rounded-lg flex items-center justify-center">
                <span className="text-white dark:text-neutral-900 font-bold text-xs">
                  SA
                </span>
              </div>
              <span className="text-base font-bold text-neutral-900 dark:text-white">
                Saral AI
              </span>
            </Link>

            {/* ANRF Badge - Center (Absolute positioning) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-100 dark:border-indigo-800/50 pointer-events-none">
              <span className="text-[9px] text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                Supported by {" "}
                <a
                  href="https://www.anrfonline.in/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors pointer-events-auto"
                >
                  ANRF
                </a>
              </span>
            </div>

            {/* Menu Button - Right */}
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white transition-colors z-10"
            >
              {open ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
          </div>

          {/* Mobile Menu Dropdown */}
          {open && (
            <div className="pb-4 pt-2 space-y-1 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => {
                  if (location.pathname === "/") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } else {
                    navigate("/");
                  }
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Home
              </button>

              <button
                onClick={() => handleSectionClick("how-it-works")}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                How It Works
              </button>

              <button
                onClick={() => handleSectionClick("features")}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Features
              </button>

              <button
                onClick={() => handleSectionClick("testimonials")}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Testimonials
              </button>

              <Link
                to="/about"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                About
              </Link>

              {/* Theme Toggle */}
              <div className="flex items-center justify-between px-4 py-2.5 mt-2">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Theme
                </span>
                <ThemeToggle />
              </div>

              {/* Mobile CTA */}
              <div className="pt-2">
                <a
                  href="/arxiv-plugin.zip"
                  download
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all"
                  onClick={() => setOpen(false)}
                >
                  <PuzzlePiece24Regular className="w-4 h-4" />
                  Download Saral Extension (arXiv)
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default UnifiedHeader;