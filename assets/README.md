# Application Assets

This directory contains the assets needed for building the JMeter Performance Test Runner application.

## Files Included

### Application Icons ✅
- **icon.icns** - macOS application icon (1024x1024 pixels)
- **icon.ico** - Windows application icon (256x256 pixels)

### DMG Background ✅  
- **dmg-background.png** - Background image for macOS DMG installer (540x380 pixels)

## DMG Background Details

The `dmg-background.png` file is used by electron-builder when creating the macOS DMG installer. It provides a professional appearance to the installation process.

### Current Background Features:
- **Size**: 540x380 pixels (matches DMG window size in package.json)
- **Style**: Light gradient background
- **Format**: PNG with RGB color space
- **Purpose**: Provides backdrop for drag-and-drop installation

### DMG Layout Configuration
The DMG installer is configured in `package.json` with these positions:
- **App Icon**: Position (110, 280) - left side
- **Applications Folder**: Position (380, 280) - right side
- **Background**: Covers entire 540x380 window

### Customizing the Background

You have several options to customize the DMG background:

#### Option 1: Use the HTML Template
1. Open `dmg-background-template.html` in a web browser
2. Take a screenshot (540x380 pixels)
3. Save as `dmg-background.png` in this directory

#### Option 2: Use the Python Script
```bash
# If you have PIL/Pillow installed
python3 create_dmg_background.py
```

#### Option 3: Create Your Own
- Create a 540x380 PNG image
- Use light colors to ensure good contrast with icons
- Avoid busy patterns in the drop zones (positions mentioned above)
- Test the appearance with your app icon

### DMG Installation Flow

When users open the DMG:
1. They see the background image
2. Your app icon appears on the left
3. Applications folder shortcut appears on the right  
4. Users drag the app to Applications to install

## Creating Custom Icons

If you want to replace the existing icons:

### macOS Icons (ICNS)
```bash
# Create iconset folder structure
mkdir MyIcon.iconset

# Add PNG files of different sizes (16x16 to 1024x1024)
# Then convert to ICNS
iconutil -c icns MyIcon.iconset
```

### Windows Icons (ICO)
Use online converters or ImageMagick:
```bash
convert icon.png -resize 256x256 icon.ico
```

### Recommended Icon Sizes
- **Source**: 1024x1024 PNG (high quality)
- **macOS**: Will be automatically scaled to all needed sizes
- **Windows**: 256x256 is sufficient for most cases

## Build Integration

These assets are automatically included in the build process:
- Icons are referenced in the `build.mac.icon` and `build.win.icon` sections of `package.json`
- DMG background is used in the `build.dmg.background` configuration
- All files are copied to the appropriate locations during the build process

## Troubleshooting

### Missing Icons Error
If you get "Cannot find icon" errors during build:
1. Verify files exist in this directory
2. Check file permissions (should be readable)
3. Temporarily comment out icon references in `package.json` for testing

### DMG Background Not Showing
1. Verify `dmg-background.png` exists and is exactly 540x380 pixels
2. Check that the file is a valid PNG
3. Ensure file permissions allow reading

### File Size Considerations
- Keep images reasonably sized (under 1MB each)
- DMG background should be under 100KB for fast loading
- Icons are typically small once converted to proper formats