# Build Instructions for JMeter Performance Test Runner

This document provides instructions for building the JMeter Performance Test Runner application for macOS and Windows.

## Prerequisites

1. **Node.js (Latest LTS)**: Install Node.js from [nodejs.org](https://nodejs.org/) or using package managers:
   - macOS: `brew install node`
   - Windows: Download installer from nodejs.org

2. **Dependencies**: Run the following command to install all required dependencies:
   ```bash
   npm install
   ```

## Build Commands

The following npm scripts are available for building the application:

### Development
- `npm start` - Start the application in development mode
- `npm run dev` - Start with development flags

### Building for Distribution

#### Build for Current Platform
```bash
npm run build
```

#### Build for macOS Only
```bash
npm run build:mac
```
This creates:
- `.dmg` file for easy installation
- `.zip` file for manual installation
- Supports both Intel (x64) and Apple Silicon (arm64) architectures

#### Build for Windows Only
```bash
npm run build:win
```
This creates:
- `.exe` installer using NSIS
- `.zip` file for portable version
- Supports both 64-bit (x64) and 32-bit (ia32) architectures

#### Build for Both Platforms
```bash
npm run build:all
# or
npm run dist
```

### Other Useful Commands
- `npm run pack` - Package without creating installers (for testing)
- `npm run postinstall` - Install app dependencies (runs automatically after npm install)

## Build Output

All built files will be placed in the `dist/` directory:

```
dist/
├── JMeter Performance Test Runner-0.1.0.dmg          # macOS installer
├── JMeter Performance Test Runner-0.1.0-mac.zip      # macOS portable
├── JMeter Performance Test Runner Setup 0.1.0.exe    # Windows installer
└── JMeter Performance Test Runner-0.1.0-win.zip      # Windows portable
```

## Application Icons

The build configuration expects the following icon files in the `assets/` directory:

- `icon.icns` - macOS app icon (512x512 pixels minimum)
- `icon.ico` - Windows app icon (256x256 pixels minimum)
- `dmg-background.png` - Background image for macOS DMG installer (540x380 pixels)

You can create these icons from a high-resolution PNG using online converters or tools like:
- [iConvert Icons](https://iconverticons.com/)
- [CloudConvert](https://cloudconvert.com/)

## Cross-Platform Building

### Building Windows Apps on macOS
Electron-builder supports building Windows applications on macOS without additional setup.

### Building macOS Apps on Windows
Building macOS applications on Windows requires additional setup and may not work reliably. It's recommended to build macOS apps on a Mac.

## Troubleshooting

### Common Issues

1. **Build fails with "Cannot find icon"**
   - Ensure icon files exist in the `assets/` directory
   - Temporarily comment out the icon references in `package.json` to build without icons

2. **"electron-builder not found" error**
   - Run `npm install` to install all dependencies
   - Ensure electron-builder is listed in devDependencies

3. **Permission errors on macOS**
   - The built app may need to be signed for distribution
   - For development, users can right-click and select "Open" to bypass Gatekeeper

4. **Antivirus software blocking Windows builds**
   - Some antivirus software may flag Electron apps
   - Add the project directory to antivirus exclusions during build

## Code Signing (Optional)

For production distribution, you may want to code sign your applications:

### macOS
Add to the `mac` section in `package.json`:
```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)"
}
```

### Windows
Add to the `win` section in `package.json`:
```json
"win": {
  "certificateFile": "path/to/certificate.p12",
  "certificatePassword": "password"
}
```

## Auto-Update (Optional)

To enable auto-updates, you can integrate with services like:
- [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater)
- GitHub Releases
- Custom update servers

Add the `publish` configuration to enable auto-updates:
```json
"publish": {
  "provider": "github",
  "owner": "your-username",
  "repo": "your-repo"
}
```