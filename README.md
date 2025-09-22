# JMeter Electron Runner

A modern, cross-platform GUI application for running JMeter performance tests with real-time monitoring, built with Electron and Node.js.

![JMeter Runner](https://img.shields.io/badge/JMeter-Performance%20Testing-orange)
![Electron](https://img.shields.io/badge/Electron-Cross%20Platform-blue)
![Node.js](https://img.shields.io/badge/Node.js-Backend-green)

## ✨ Features

- **🎯 Easy JMeter Integration**: Browse and select your JMeter executable with persistent settings
- **📁 Multi-File Support**: Select and configure multiple .jmx test files simultaneously
- **⚙️ Flexible Configuration**: Customize thread count, ramp-up time, loops, and rounds for each test file
- **📊 Real-Time Monitoring**: Live progress tracking with overall and per-file progress indicators
- **📝 Live Logging**: Real-time stdout/stderr output from JMeter processes
- **🎛️ Queue Management**: Serial execution of tests with graceful cancellation support
- **💾 Persistent Settings**: Automatic saving of JMeter path and export directory preferences
- **🎨 Modern UI**: Clean, responsive interface with dark theme
- **🔒 Secure Architecture**: Built with Electron security best practices

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **JMeter** installed on your system (Unix/Linux/macOS)
- **.jmx test files** to run

### Installation & Running

1. **Clone or extract the project:**
   ```bash
   cd jmeter-electron-runner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

   Or for development mode with DevTools:
   ```bash
   npm run dev
   ```

## 📖 Usage Guide

### Initial Setup

1. **Select JMeter Executable:**
   - Click "Browse" next to "JMeter Executable"
   - Navigate to your JMeter installation (typically `/path/to/jmeter/bin/jmeter`)
   - The path will be saved for future sessions

2. **Choose Export Directory:**
   - Click "Browse" next to "Export Directory"
   - Select where you want test reports and logs to be saved
   - Directory will be remembered between sessions

### Configuring Tests

1. **Select Test Files:**
   - Click "📁 Select JMX Test Files"
   - Choose one or more .jmx files from your file system
   - Files appear in the configuration table

2. **Configure Parameters** (for each file):
   - **Threads**: Number of concurrent virtual users (default: 1)
   - **Ramp-up**: Time in seconds to reach full thread count (default: 1)
   - **Loops**: Number of iterations per thread (default: 50)
   - **Rounds**: Number of times to execute the entire test (default: 3)

### Running Tests

1. **Start Execution:**
   - Click "▶️ Run Tests" when configuration is complete
   - Tests execute serially: File1 (Round 1, 2, 3...), then File2 (Round 1, 2, 3...), etc.

2. **Monitor Progress:**
   - Overall progress bar shows completion percentage
   - Per-file progress indicates rounds completed
   - Live logs display JMeter output in real-time

3. **Control Execution:**
   - Click "⏹️ Cancel" to stop the current test
   - Use "🗑️ Clear Logs" to clean the log output

### Generated Output

For each test run, the following files are created in your export directory:

```
export_directory/
├── testfile1_R1.log          # JMeter results log (Round 1)
├── testfile1_R1/             # HTML dashboard report (Round 1)
│   ├── index.html
│   └── ... (dashboard files)
├── testfile1_R2.log          # Round 2 results
├── testfile1_R2/             # Round 2 dashboard
└── ...
```

## 🛠️ JMeter Command Template

The application executes JMeter using this command structure:

```bash
{jmeter_executable} -n -t {file_path} \
  -Jthread={JThread} \
  -Jrampup={JRampup} \
  -Jloop={JLoop} \
  -l {export_path}/{file_basename}_R{round}.log \
  -e -o {export_path}/{file_basename}_R{round}
```

Where:
- `-n`: Non-GUI mode
- `-t`: Test plan file path
- `-Jthread`, `-Jrampup`, `-Jloop`: User-defined parameters
- `-l`: Results log file location
- `-e -o`: Generate HTML dashboard report

## ⚙️ Configuration & Settings

### Persistent Settings

The application automatically saves these settings between sessions:

- **JMeter Executable Path**: Location of your JMeter binary
- **Export Directory**: Where reports and logs are saved
- **Window Preferences**: Size and position (optional)

Settings are stored using `electron-store` in the user's application data directory:

- **macOS**: `~/Library/Application Support/jmeter-electron-runner/`
- **Linux**: `~/.config/jmeter-electron-runner/`
- **Windows**: `%APPDATA%\jmeter-electron-runner\`

### Default Values

When you select new test files, they're automatically configured with:

- **Threads (JThread)**: 1
- **Ramp-up (JRampup)**: 1 second
- **Loops (JLoop)**: 50
- **Rounds**: 3

## 🔧 Development

### Project Structure

```
jmeter-electron-runner/
├── package.json              # Dependencies and scripts
├── README.md                 # This file
└── src/
    ├── main.js               # Main Electron process
    ├── preload.js            # Security-focused IPC bridge
    ├── runner.js             # JMeter execution logic
    ├── settings.js           # Persistent settings management
    └── renderer/
        ├── index.html        # UI layout
        ├── renderer.js       # UI logic and event handling
        └── styles.css        # Modern dark theme styling
```

### Architecture

- **Main Process** (`main.js`): Handles file system operations, process spawning, and window management
- **Renderer Process** (`renderer/`): Provides the user interface with secure IPC communication
- **Preload Script** (`preload.js`): Exposes a minimal, safe API via `contextBridge`
- **Runner Module** (`runner.js`): Manages JMeter process execution, queuing, and progress tracking
- **Settings Module** (`settings.js`): Handles persistent configuration storage

### Security Features

- ✅ `contextIsolation: true`
- ✅ `nodeIntegration: false`
- ✅ Preload script with minimal API exposure
- ✅ Input validation and sanitization
- ✅ No shell execution (uses `spawn` with argument arrays)

## 🐛 Troubleshooting

### Common Issues

**"JMeter executable is not accessible"**
- Ensure you've selected the actual `jmeter` executable file, not the directory
- Check file permissions (executable bit must be set)
- On macOS/Linux, the file should be in `/path/to/jmeter/bin/jmeter`

**"Export directory is not writable"**
- Verify you have write permissions to the selected directory
- Try selecting a different directory (e.g., your Documents folder)

**"Process failed with exit code X"**
- Check the live logs for JMeter error messages
- Verify your .jmx files are valid JMeter test plans
- Ensure JMeter parameters (thread, rampup, loop) are referenced correctly in your test plan

**Tests don't start**
- Confirm JMeter path, export directory, and test files are all selected
- Check that .jmx files exist and are readable
- Look for error messages in the application logs

### Log Export

Use the "Export Logs" button to save execution logs to a text file for debugging or sharing.

## 📋 Requirements

### System Requirements

- **Operating System**: macOS, Linux (Unix-like systems)
- **Node.js**: Version 16 or higher
- **JMeter**: Any recent version with command-line support
- **Memory**: 512MB+ available RAM
- **Disk Space**: Sufficient space for test results and reports

### JMeter Test Plan Requirements

Your .jmx files should reference the passed parameters:

```xml
<!-- Example: Use the parameters in your test plan -->
<stringProp name="ThreadGroup.num_threads">${__P(thread,1)}</stringProp>
<stringProp name="ThreadGroup.ramp_time">${__P(rampup,1)}</stringProp>
<stringProp name="LoopController.loops">${__P(loop,1)}</stringProp>
```

## 📄 License

MIT License - feel free to use, modify, and distribute as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**Happy Performance Testing! 🚀**