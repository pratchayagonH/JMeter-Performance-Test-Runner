#!/usr/bin/env python3
"""
DMG Background Generator for JMeter Performance Test Runner
Creates a professional 540x380 background image for macOS DMG installer
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("PIL/Pillow not available. Please install it with: pip3 install Pillow")

import os
import sys

def create_dmg_background():
    """Create a professional DMG background image"""
    if not PIL_AVAILABLE:
        return False
    
    # DMG background dimensions from package.json
    width, height = 540, 380
    
    # Create a new image with a light gradient background
    img = Image.new('RGB', (width, height), color='#f8f9fa')
    draw = ImageDraw.Draw(img)
    
    # Create a subtle gradient background
    for y in range(height):
        # Create a subtle vertical gradient from light gray to very light gray
        alpha = y / height
        color_value = int(248 + (255 - 248) * alpha)  # From #f8f9fa to #ffffff
        draw.line([(0, y), (width, y)], fill=(color_value, color_value, color_value))
    
    # Add some subtle geometric elements to make it more professional
    # Add subtle circles/dots pattern
    for x in range(50, width, 100):
        for y in range(50, height, 80):
            # Very light gray circles
            draw.ellipse([x-2, y-2, x+2, y+2], fill='#e9ecef', outline=None)
    
    # Add a subtle header area
    header_height = 60
    draw.rectangle([0, 0, width, header_height], fill='#ffffff', outline=None)
    
    # Add a very subtle border
    draw.rectangle([0, 0, width-1, height-1], fill=None, outline='#dee2e6', width=1)
    
    # Try to add text - handle font gracefully
    try:
        # Try to use system fonts (macOS)
        title_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
        subtitle_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    except:
        try:
            # Fallback for Linux
            title_font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 24)
            subtitle_font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 14)
        except:
            # Use default font if no system fonts available
            title_font = ImageFont.load_default()
            subtitle_font = ImageFont.load_default()
    
    # Add title text
    title_text = 'JMeter Performance Test Runner'
    subtitle_text = 'Drag application to Applications folder to install'
    
    # Calculate text positions for centering
    try:
        title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
        title_width = title_bbox[2] - title_bbox[0]
        title_x = (width - title_width) // 2
        
        subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=subtitle_font)
        subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
        subtitle_x = (width - subtitle_width) // 2
    except:
        # Fallback positioning if textbbox not available
        title_x = width // 4
        subtitle_x = width // 6
    
    # Draw the text
    draw.text((title_x, 15), title_text, fill='#495057', font=title_font)
    draw.text((subtitle_x, 320), subtitle_text, fill='#6c757d', font=subtitle_font)
    
    # Add subtle visual indicators for drag zones
    # Left zone (app icon area) - position (110, 280) from package.json
    left_x, left_y = 110, 280
    draw.ellipse([left_x-40, left_y-40, left_x+40, left_y+40], fill=None, outline='#ced4da', width=2)
    
    # Right zone (Applications folder) - position (380, 280) from package.json  
    right_x, right_y = 380, 280
    draw.ellipse([right_x-40, right_y-40, right_x+40, right_y+40], fill=None, outline='#ced4da', width=2)
    
    # Add arrow between the zones
    arrow_y = 280
    draw.line([(left_x+50, arrow_y), (right_x-50, arrow_y)], fill='#adb5bd', width=2)
    # Arrow head
    draw.line([(right_x-60, arrow_y-8), (right_x-50, arrow_y)], fill='#adb5bd', width=2)
    draw.line([(right_x-60, arrow_y+8), (right_x-50, arrow_y)], fill='#adb5bd', width=2)
    
    # Save the image
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, 'assets', 'dmg-background.png')
    
    try:
        img.save(output_path, 'PNG', optimize=True)
        print(f'✅ DMG background created successfully at: {output_path}')
        print(f'   Dimensions: {width}x{height} pixels')
        print(f'   Optimized for DMG installer with drag zones at (110,280) and (380,280)')
        return True
    except Exception as e:
        print(f'❌ Error saving image: {e}')
        return False

def create_html_template():
    """Create an HTML template that can be screenshotted as fallback"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(script_dir, 'dmg-background-template.html')
    
    html_content = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DMG Background Template</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        }
        
        .dmg-background {
            width: 540px;
            height: 380px;
            background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%);
            position: relative;
            border: 1px solid #dee2e6;
            overflow: hidden;
        }
        
        .header {
            height: 60px;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid #e9ecef;
        }
        
        .title {
            font-size: 24px;
            font-weight: 600;
            color: #495057;
            margin: 0;
        }
        
        .content {
            position: relative;
            height: 320px;
        }
        
        .drop-zone {
            position: absolute;
            width: 80px;
            height: 80px;
            border: 2px dashed #ced4da;
            border-radius: 50%;
            top: 200px;
        }
        
        .app-zone {
            left: 70px;
        }
        
        .applications-zone {
            right: 70px;
        }
        
        .arrow {
            position: absolute;
            top: 240px;
            left: 50%;
            transform: translateX(-50%);
            width: 200px;
            height: 2px;
            background: #adb5bd;
        }
        
        .arrow::after {
            content: '';
            position: absolute;
            right: -8px;
            top: -4px;
            width: 0;
            height: 0;
            border-left: 8px solid #adb5bd;
            border-top: 4px solid transparent;
            border-bottom: 4px solid transparent;
        }
        
        .instruction {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 14px;
            color: #6c757d;
            text-align: center;
            white-space: nowrap;
        }
        
        .dots {
            position: absolute;
            width: 100%;
            height: 100%;
            opacity: 0.3;
        }
        
        .dot {
            position: absolute;
            width: 4px;
            height: 4px;
            background: #e9ecef;
            border-radius: 50%;
        }
    </style>
</head>
<body>
    <div class="dmg-background">
        <div class="header">
            <h1 class="title">JMeter Performance Test Runner</h1>
        </div>
        <div class="content">
            <div class="dots">
                <div class="dot" style="left: 50px; top: 50px;"></div>
                <div class="dot" style="left: 150px; top: 50px;"></div>
                <div class="dot" style="left: 250px; top: 50px;"></div>
                <div class="dot" style="left: 350px; top: 50px;"></div>
                <div class="dot" style="left: 450px; top: 50px;"></div>
                <div class="dot" style="left: 50px; top: 130px;"></div>
                <div class="dot" style="left: 150px; top: 130px;"></div>
                <div class="dot" style="left: 250px; top: 130px;"></div>
                <div class="dot" style="left: 350px; top: 130px;"></div>
                <div class="dot" style="left: 450px; top: 130px;"></div>
            </div>
            <div class="drop-zone app-zone"></div>
            <div class="drop-zone applications-zone"></div>
            <div class="arrow"></div>
            <div class="instruction">Drag application to Applications folder to install</div>
        </div>
    </div>
    
    <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; font-family: monospace; font-size: 12px;">
        <h3>Instructions:</h3>
        <p>1. Take a screenshot of the gray box above (exactly 540x380 pixels)</p>
        <p>2. Save it as "dmg-background.png" in the assets folder</p>
        <p>3. The drag zones align with coordinates (110,280) and (380,280) from package.json</p>
    </div>
</body>
</html>'''
    
    try:
        with open(html_path, 'w') as f:
            f.write(html_content)
        print(f'✅ HTML template created at: {html_path}')
        print(f'   Open this file in a browser and take a 540x380 screenshot')
        return True
    except Exception as e:
        print(f'❌ Error creating HTML template: {e}')
        return False

if __name__ == '__main__':
    print("DMG Background Generator for JMeter Performance Test Runner")
    print("=" * 60)
    
    if PIL_AVAILABLE:
        success = create_dmg_background()
        if success:
            print("\n🎉 DMG background generated successfully!")
        else:
            print("\n⚠️  PIL method failed, creating HTML template as fallback...")
            create_html_template()
    else:
        print("⚠️  PIL/Pillow not available, creating HTML template...")
        create_html_template()
        print("\n💡 To install Pillow for automatic generation:")
        print("   pip3 install Pillow")
        print("   python3 create_dmg_background.py")