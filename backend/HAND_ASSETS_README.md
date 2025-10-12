# Hand Assets Required for Whiteboard Animation

## 📁 Required Files

Place these files in: `backend/app/images/`

### 1. drawing-hand.png

- **Description:** Image of a hand holding a pen/marker
- **Format:** PNG with transparency
- **Recommended Size:** 200x200 pixels
- **Position:** Hand should be pointing/drawing from left side
- **Background:** Transparent (alpha channel)

### 2. hand-mask.png

- **Description:** Alpha mask for the hand image
- **Format:** Grayscale PNG
- **Size:** Same as drawing-hand.png (200x200px)
- **Content:**
  - White (255) where hand is visible
  - Black (0) where transparent
  - Use for proper alpha blending

## 🎨 How to Create/Obtain

### Option 1: Use Stock Images

Free sources:

- **Unsplash**: <https://unsplash.com/s/photos/hand-drawing>
- **Pexels**: <https://www.pexels.com/search/hand%20drawing/>
- **Pixabay**: <https://pixabay.com/images/search/hand%20writing/>

### Option 2: Generate with AI

```bash
# Use DALL-E, Midjourney, or Stable Diffusion
Prompt: "Hand holding a pen, drawing on whiteboard, side view, 
white background, professional, clean, high contrast"
```

### Option 3: Create Your Own

1. Take photo of your hand holding a pen
2. Remove background using:
   - <https://www.remove.bg/>
   - Photoshop
   - GIMP (free)

3. Create mask:
   - Convert to grayscale
   - Threshold to binary
   - Save as hand-mask.png

## 📐 Specifications

### drawing-hand.png

```
Format: PNG
Color Mode: RGBA (with alpha channel)
Dimensions: 200x200px (or larger, will be resized)
DPI: 72-150
File Size: < 500KB
Background: Transparent
Content: Hand with pen, oriented left-to-right
```

### hand-mask.png

```
Format: PNG
Color Mode: Grayscale
Dimensions: Same as drawing-hand.png
DPI: Same as drawing-hand.png
Content: 
  - White pixels where hand exists
  - Black pixels for transparency
```

## 🔧 Quick Setup (Temporary)

If you don't have hand assets yet, the system will work without them!

**Without hand assets:**

- Animation still generates
- Shows drawing effect
- No hand overlay
- Warning logged: "Hand assets not found"

**To add later:**

1. Create directory: `mkdir -p backend/app/images`
2. Add hand assets
3. Restart server (if needed)

## 🎯 Example Directory Structure

```
backend/
├── app/
│   ├── images/              # ← Create this directory
│   │   ├── drawing-hand.png  # ← Add this file
│   │   └── hand-mask.png     # ← Add this file
│   │
│   ├── services/
│   │   └── whiteboard_service.py  # Uses hand assets
│   └── ...
```

## ✅ Verification

Test if hand assets are loaded:

```python
import os
import cv2

HAND_IMAGE_PATH = "backend/app/images/drawing-hand.png"
HAND_MASK_PATH = "backend/app/images/hand-mask.png"

# Check files exist
print(f"Hand image exists: {os.path.exists(HAND_IMAGE_PATH)}")
print(f"Hand mask exists: {os.path.exists(HAND_MASK_PATH)}")

# Load and verify
hand = cv2.imread(HAND_IMAGE_PATH)
mask = cv2.imread(HAND_MASK_PATH, cv2.IMREAD_GRAYSCALE)

if hand is not None and mask is not None:
    print(f"✅ Hand image: {hand.shape}")
    print(f"✅ Hand mask: {mask.shape}")
else:
    print("❌ Failed to load hand assets")
```

## 🎨 Advanced: Custom Hand Styles

You can create multiple hand assets for different styles:

```
backend/app/images/
├── drawing-hand.png      # Default
├── hand-mask.png
├── pencil-hand.png       # Pencil style
├── pencil-mask.png
├── marker-hand.png       # Marker style
├── marker-mask.png
└── crayon-hand.png       # Crayon style
    └── crayon-mask.png
```

Update `whiteboard_service.py` to support multiple styles:

```python
HAND_STYLES = {
    "pen": ("drawing-hand.png", "hand-mask.png"),
    "pencil": ("pencil-hand.png", "pencil-mask.png"),
    "marker": ("marker-hand.png", "marker-mask.png"),
}
```

## 📝 Notes

1. **Performance:** Larger hand images require more processing. Keep under 300x300px.
2. **Quality:** Higher resolution looks better but increases processing time.
3. **Style:** Clean, simple hand images work best for educational videos.
4. **Position:** Hand should enter from left side for natural drawing motion.
5. **Lighting:** Consistent lighting makes masking easier and cleaner.

## 🤝 Contributing Hand Assets

If you create high-quality hand assets, consider:

1. Sharing them in the project repository
2. Creating a pull request with assets
3. Adding to an "assets" folder for community use

---

**Status:** ⚠️ User must provide these assets  
**Priority:** Medium (system works without them)  
**Impact:** Enhances visual quality significantly
