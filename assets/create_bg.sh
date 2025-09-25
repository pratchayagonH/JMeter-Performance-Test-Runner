#!/bin/bash

# Create a temporary plain image using built-in macOS tools
# We'll create an SVG first, then convert it

cat > temp_bg.svg << 'SVGEOF'
<svg width="540" height="380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f8f9fa;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="540" height="380" fill="url(#bg)" stroke="#dee2e6" stroke-width="1"/>
  
  <!-- Header area -->
  <rect x="0" y="0" width="540" height="60" fill="#ffffff" stroke="#e9ecef" stroke-width="0"/>
  
  <!-- Title text -->
  <text x="270" y="35" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#495057">JMeter Performance Test Runner</text>
  
  <!-- Drag zones circles -->
  <circle cx="110" cy="280" r="40" fill="none" stroke="#ced4da" stroke-width="2" stroke-dasharray="5,5"/>
  <circle cx="380" cy="280" r="40" fill="none" stroke="#ced4da" stroke-width="2" stroke-dasharray="5,5"/>
  
  <!-- Arrow -->
  <line x1="160" y1="280" x2="330" y2="280" stroke="#adb5bd" stroke-width="2"/>
  <polygon points="330,280 320,275 320,285" fill="#adb5bd"/>
  
  <!-- Instruction text -->
  <text x="270" y="340" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#6c757d">Drag application to Applications folder to install</text>
  
  <!-- Decorative dots -->
  <circle cx="50" cy="100" r="2" fill="#e9ecef"/>
  <circle cx="150" cy="100" r="2" fill="#e9ecef"/>
  <circle cx="250" cy="100" r="2" fill="#e9ecef"/>
  <circle cx="350" cy="100" r="2" fill="#e9ecef"/>
  <circle cx="450" cy="100" r="2" fill="#e9ecef"/>
  <circle cx="100" cy="170" r="2" fill="#e9ecef"/>
  <circle cx="200" cy="170" r="2" fill="#e9ecef"/>
  <circle cx="300" cy="170" r="2" fill="#e9ecef"/>
  <circle cx="400" cy="170" r="2" fill="#e9ecef"/>
</svg>
SVGEOF

# Try to convert SVG to PNG using different methods available on macOS
if command -v qlmanage >/dev/null 2>&1; then
    # Use qlmanage (QuickLook) to convert SVG to PNG
    qlmanage -t -s 540 -o . temp_bg.svg 2>/dev/null && mv temp_bg.svg.png dmg-background.png
elif command -v rsvg-convert >/dev/null 2>&1; then
    # Use rsvg-convert if available
    rsvg-convert -w 540 -h 380 temp_bg.svg -o dmg-background.png
elif command -v safari >/dev/null 2>&1; then
    echo "SVG created. Please open temp_bg.svg in Safari and take a screenshot, then save as dmg-background.png"
else
    echo "No suitable SVG converter found. SVG file created as temp_bg.svg"
fi

# Clean up
rm -f temp_bg.svg

# Check if we successfully created the PNG
if [ -f "dmg-background.png" ]; then
    echo "✅ DMG background created successfully!"
    ls -la dmg-background.png
else
    echo "⚠️  Automatic conversion failed. Please convert temp_bg.svg manually."
fi
