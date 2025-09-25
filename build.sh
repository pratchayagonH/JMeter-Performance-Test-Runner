#!/bin/bash

# JMeter Performance Test Runner - Cross-Platform Build Script
# This script builds the application for both macOS and Windows

set -e  # Exit on any error

echo "🚀 JMeter Performance Test Runner - Cross-Platform Build Script"
echo "================================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   macOS: brew install node"
    echo "   Or download from: https://nodejs.org/"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not available. Please ensure Node.js is properly installed."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🔨 Building applications..."

# Create dist directory if it doesn't exist
mkdir -p dist

# Build for all platforms
echo "🍎 Building for macOS..."
npm run build:mac

echo "🪟 Building for Windows..."
npm run build:win

echo ""
echo "🎉 Build completed successfully!"
echo ""
echo "📁 Output files can be found in the dist/ directory:"
ls -la dist/

echo ""
echo "📖 For more build options, see BUILD.md"