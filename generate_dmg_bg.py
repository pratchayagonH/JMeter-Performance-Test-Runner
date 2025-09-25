#!/usr/bin/env python3
"""
Generate DMG background for JMeter Performance Test Runner
Creates a 540x380 pixel background with professional styling
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    def create_dmg_background():
        # DMG window size from package.json
        width, height = 540, 380
        
        # Create image with gradient background
        img = Image.new('RGB', (width, height), color='#1a1a1a')
        draw = ImageDraw.Draw(img)
        
        # Create subtle gradient effect
        for y in range(height):
            alpha = int(255 * (1 - y / height) * 0.1)
            color = (26 + alpha//4, 26 + alpha//4, 26 + alpha//4)
            draw.line([(0, y), (width, y)], fill=color)
        
        # Draw subtle grid pattern
        grid_spacing = 40
        for x in range(0, width, grid_spacing):
            draw.line([(x, 0), (x, height)], fill='#2a2a2a', width=1)
        for y in range(0, height, grid_spacing):
            draw.line([(0, y), (width, y)], fill='#2a2a2a', width=1)
        
        # Add accent elements
        # Top accent bar
        draw.rectangle([0, 0, width, 3], fill='#ff6b35')
        
        # Bottom accent bar
        draw.rectangle([0, height-3, width, height], fill='#ff6b35')
        
        # JMeter brand color accents (orange)
        accent_color = '#ff6b35'
        
        # Draw some subtle geometric elements
        # Left side accent
        draw.rectangle([0, 100, 4, 280], fill=accent_color)
        
        # Right side accent
        draw.rectangle([width-4, 100, width, 280], fill=accent_color)
        
        # Add subtle circular elements for visual interest
        circle_color = '#333333'
        draw.ellipse([450, 50, 490, 90], fill=circle_color)
        draw.ellipse([460, 60, 480, 80], fill=accent_color)
        
        draw.ellipse([50, 300, 90, 340], fill=circle_color)
        draw.ellipse([60, 310, 80, 330], fill=accent_color)
        
        # Try to add text if font is available
        try:
            # Try to load a system font
            try:
                font_large = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
                font_small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
            except:
                try:
                    font_large = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
                    font_small = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 14)
                except:
                    font_large = ImageFont.load_default()
                    font_small = ImageFont.load_default()
            
            # Add title text
            text = "JMeter Performance Test Runner"
            text_color = '#cccccc'
            
            # Calculate text position (centered horizontally, in upper area)
            bbox = draw.textbbox((0, 0), text, font=font_large)
            text_width = bbox[2] - bbox[0]
            text_x = (width - text_width) // 2
            text_y = 60
            
            draw.text((text_x, text_y), text, fill=text_color, font=font_large)
            
            # Add subtitle
            subtitle = "Drag application to install"
            bbox = draw.textbbox((0, 0), subtitle, font=font_small)
            subtitle_width = bbox[2] - bbox[0]
            subtitle_x = (width - subtitle_width) // 2
            subtitle_y = 320
            
            draw.text((subtitle_x, subtitle_y), subtitle, fill='#888888', font=font_small)
            
        except Exception as e:
            print(f"Text rendering skipped: {e}")
        
        # Save the image
        output_path = '/Users/2201839/Documents/tests/JMeter-Performance-Test-Runner/assets/dmg-background.png'
        img.save(output_path, 'PNG', optimize=True)
        print(f"DMG background created: {output_path}")
        print(f"Dimensions: {width}x{height} pixels")
        
        return output_path
    
    if __name__ == "__main__":
        create_dmg_background()

except ImportError:
    print("PIL (Pillow) not available. Creating background using alternative method...")
    
    # Alternative: Create using ImageMagick or simple method
    import os
    
    def create_simple_background():
        output_path = '/Users/2201839/Documents/tests/JMeter-Performance-Test-Runner/assets/dmg-background.png'
        
        # Use ImageMagick if available
        imagemagick_cmd = f'''
        convert -size 540x380 gradient:'#1a1a1a-#2a2a2a' \\
        -fill '#ff6b35' -draw 'rectangle 0,0 540,3' \\
        -fill '#ff6b35' -draw 'rectangle 0,377 540,380' \\
        -fill '#ff6b35' -draw 'rectangle 0,100 4,280' \\
        -fill '#ff6b35' -draw 'rectangle 536,100 540,280' \\
        -fill '#cccccc' -pointsize 20 -gravity North -annotate +0+60 'JMeter Performance Test Runner' \\
        -fill '#888888' -pointsize 12 -gravity South -annotate +0+40 'Drag application to install' \\
        "{output_path}"
        '''
        
        try:
            os.system(imagemagick_cmd)
            if os.path.exists(output_path):
                print(f"DMG background created with ImageMagick: {output_path}")
                return output_path
        except:
            pass
        
        # Fallback: Use macOS sips to create a simple background
        try:
            # Create a simple colored background
            temp_file = '/tmp/temp_bg.png'
            os.system(f'sips -c 540 380 -s format png --setProperty color "#1a1a1a" /System/Library/ColorSync/Profiles/Generic\ RGB\ Profile.icc {temp_file} 2>/dev/null')
            if os.path.exists(temp_file):
                os.system(f'cp {temp_file} {output_path}')
                os.remove(temp_file)
                print(f"DMG background created with sips: {output_path}")
                return output_path
        except:
            pass
        
        print("Could not create background image. Please install PIL/Pillow or ImageMagick.")
        return None
    
    create_simple_background()