#!/bin/bash

# Simple DMG background creator using macOS built-in tools
# Creates a 540x380 PNG file for JMeter Performance Test Runner

cd /Users/2201839/Documents/tests/JMeter-Performance-Test-Runner/assets

echo "Creating DMG background using macOS tools..."

# Create a simple gradient background using Python (no external dependencies)
python3 << 'PYTHON_SCRIPT'
import struct
import zlib

def create_png(width, height):
    """Create a simple PNG file with specified dimensions"""
    
    # Create RGBA data (light gray background)
    img_data = []
    for y in range(height):
        # Create a subtle vertical gradient
        gray_value = 248 + int((255 - 248) * y / height)
        row_data = [2]  # PNG filter type (Up filter)
        for x in range(width):
            # RGBA values (light gray with full opacity)
            row_data.extend([gray_value, gray_value, gray_value, 255])
        img_data.extend(row_data)
    
    # Compress the image data
    compressor = zlib.compressobj()
    compressed_data = compressor.compress(bytes(img_data))
    compressed_data += compressor.flush()
    
    # Create PNG chunks
    def crc32(data):
        return struct.pack('>I', zlib.crc32(data) & 0xffffffff)
    
    def make_chunk(chunk_type, data):
        return struct.pack('>I', len(data)) + chunk_type + data + crc32(chunk_type + data)
    
    # PNG signature
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk (Image header)
    ihdr_data = struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    ihdr_chunk = make_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (Image data)
    idat_chunk = make_chunk(b'IDAT', compressed_data)
    
    # IEND chunk (Image end)
    iend_chunk = make_chunk(b'IEND', b'')
    
    # Combine all parts
    png_data = png_signature + ihdr_chunk + idat_chunk + iend_chunk
    
    return png_data

# Create 540x380 PNG
width, height = 540, 380
png_data = create_png(width, height)

# Write to file
with open('dmg-background.png', 'wb') as f:
    f.write(png_data)

print(f"Created basic PNG: {width}x{height} pixels")
PYTHON_SCRIPT

# Check if the file was created
if [ -f "dmg-background.png" ]; then
    echo "✅ DMG background created successfully!"
    ls -la dmg-background.png
    
    # Try to get dimensions
    if command -v sips >/dev/null 2>&1; then
        echo "Image info:"
        sips -g pixelWidth -g pixelHeight dmg-background.png 2>/dev/null || echo "Could not get image dimensions"
    fi
else
    echo "❌ Failed to create DMG background"
    exit 1
fi

echo ""
echo "🎉 DMG background is ready for use!"
echo "The image is positioned for the DMG installer with:"
echo "  - App icon area at (110, 280)"
echo "  - Applications folder at (380, 280)"
echo "  - Window size: 540x380 pixels"