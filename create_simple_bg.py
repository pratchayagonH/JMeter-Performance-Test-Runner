#!/usr/bin/env python3

# Create a simple DMG background PNG without external dependencies
import struct
import zlib

def create_dmg_background():
    width, height = 540, 380
    
    # Create RGBA image data for a light gradient background
    img_data = bytearray()
    
    for y in range(height):
        # PNG requires a filter byte at the start of each row
        img_data.append(0)  # No filter
        
        for x in range(width):
            # Create a subtle vertical gradient from light gray to white
            gray_value = min(255, 248 + int((255 - 248) * y / height))
            
            # RGBA pixel (light gray with full opacity)
            img_data.extend([gray_value, gray_value, gray_value, 255])
    
    # Compress the image data
    compressed_data = zlib.compress(bytes(img_data))
    
    # PNG helper functions
    def crc32(data):
        return struct.pack('>I', zlib.crc32(data) & 0xffffffff)
    
    def make_chunk(chunk_type, data):
        length = struct.pack('>I', len(data))
        crc = crc32(chunk_type + data)
        return length + chunk_type + data + crc
    
    # Create PNG file structure
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk (image header)
    ihdr_data = struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    ihdr_chunk = make_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (compressed image data)
    idat_chunk = make_chunk(b'IDAT', compressed_data)
    
    # IEND chunk (end of image)
    iend_chunk = make_chunk(b'IEND', b'')
    
    # Combine all chunks
    png_data = png_signature + ihdr_chunk + idat_chunk + iend_chunk
    
    # Write to file
    output_path = '/Users/2201839/Documents/tests/JMeter-Performance-Test-Runner/assets/dmg-background.png'
    
    try:
        with open(output_path, 'wb') as f:
            f.write(png_data)
        print(f"✅ DMG background created: {output_path}")
        print(f"   Dimensions: {width}x{height} pixels")
        print(f"   File size: {len(png_data)} bytes")
        return True
    except Exception as e:
        print(f"❌ Error creating file: {e}")
        return False

if __name__ == '__main__':
    create_dmg_background()