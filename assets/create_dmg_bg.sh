#!/bin/bash

# Create DMG background for JMeter Performance Test Runner
# Using the existing SVG and converting to PNG

cd /Users/2201839/Documents/tests/JMeter-Performance-Test-Runner/assets

echo "Creating DMG background..."

# Try qlmanage first (QuickLook)
if command -v qlmanage >/dev/null 2>&1; then
    echo "Using qlmanage to convert SVG..."
    qlmanage -t -s 1080 -o . dmg_bg_correct.svg 2>/dev/null
    if [ -f "dmg_bg_correct.svg.png" ]; then
        # Resize to exact dimensions needed
        sips -z 380 540 dmg_bg_correct.svg.png --out dmg-background.png 2>/dev/null
        rm -f dmg_bg_correct.svg.png
        echo "✅ DMG background created using qlmanage!"
        ls -la dmg-background.png
        exit 0
    fi
fi

# Try using webkit2png if available
if command -v webkit2png >/dev/null 2>&1; then
    echo "Using webkit2png..."
    webkit2png --width=540 --height=380 --fullsize dmg_bg_correct.svg
    if [ -f "dmg_bg_correct.svg-full.png" ]; then
        mv dmg_bg_correct.svg-full.png dmg-background.png
        echo "✅ DMG background created using webkit2png!"
        ls -la dmg-background.png
        exit 0
    fi
fi

# Create a simple solid color background as fallback
echo "Creating fallback background..."
sips -c 380 540 --setProperty format png /System/Library/ColorSync/Profiles/sRGB\ Profile.icc dmg-background.png 2>/dev/null

if [ -f "dmg-background.png" ]; then
    echo "✅ Basic DMG background created!"
    ls -la dmg-background.png
else
    echo "❌ Failed to create DMG background"
    exit 1
fi