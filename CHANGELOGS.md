# CHANGELOGS

## ppt-output

### Added
- PowerPoint (.pptx) slide generation pipeline alongside the existing Beamer/PDF workflow.
- Backend endpoint for downloading generated PowerPoint files and client-side controls to trigger the download.
- Persistent storage of PPT assets and image assignments so slide previews remain in sync with downloaded decks.

### Updated
- Slide generation service to reuse assigned figures inside PPT exports and to better handle section ordering.
- Backend dependencies to include packages required for PPT creation.
