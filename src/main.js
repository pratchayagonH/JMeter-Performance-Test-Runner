const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getSettings, setSetting } = require('./settings');
const runner = require('./runner');

let mainWindow;

function createWindow() {
  // Create the browser window with security best practices
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,           // Security: disable node integration
      contextIsolation: true,           // Security: enable context isolation
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false         // Security: disable remote module
    },
    icon: path.join(__dirname, 'assets/icon.png') // Optional: add app icon
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Initialize runner with main window for progress updates
  runner.init(mainWindow.webContents);
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for renderer process communication

// Handle JMeter executable selection
ipcMain.handle('open-jmeter', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select JMeter Executable',
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['*'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const jmeterPath = result.filePaths[0];
      
      // Validate that the selected file is executable
      try {
        const stats = fs.statSync(jmeterPath);
        if (!stats.isFile()) {
          throw new Error('Selected path is not a file');
        }
        
        // Check if file is executable (Unix permissions)
        fs.accessSync(jmeterPath, fs.constants.F_OK | fs.constants.X_OK);
        
        // Save the path for future use
        setSetting('jmeterPath', jmeterPath);
        return { success: true, path: jmeterPath };
      } catch (error) {
        return { 
          success: false, 
          error: 'Selected file is not executable. Please select the JMeter executable file.' 
        };
      }
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle JMX files selection (multiple files)
ipcMain.handle('open-jmx', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select JMX Test Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'JMeter Test Files', extensions: ['jmx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      // Validate all selected files
      const validFiles = [];
      const errors = [];

      for (const filePath of result.filePaths) {
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile() && path.extname(filePath).toLowerCase() === '.jmx') {
            validFiles.push({
              path: filePath,
              name: path.basename(filePath),
              basename: path.basename(filePath, '.jmx')
            });
          } else {
            errors.push(`${path.basename(filePath)}: Not a valid JMX file`);
          }
        } catch (error) {
          errors.push(`${path.basename(filePath)}: ${error.message}`);
        }
      }

      return { 
        success: true, 
        files: validFiles,
        errors: errors.length > 0 ? errors : null
      };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle export directory selection
ipcMain.handle('open-export', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Export Reports Directory',
      properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const exportPath = result.filePaths[0];
      
      try {
        // Validate directory is writable
        fs.accessSync(exportPath, fs.constants.W_OK);
        
        // Save the path for future use
        setSetting('exportPath', exportPath);
        return { success: true, path: exportPath };
      } catch (error) {
        return { 
          success: false, 
          error: 'Selected directory is not writable. Please choose a different directory.' 
        };
      }
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle settings retrieval
ipcMain.handle('get-settings', async () => {
  try {
    return { success: true, settings: getSettings() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle individual setting updates
ipcMain.handle('set-setting', async (event, key, value) => {
  try {
    setSetting(key, value);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle JMeter job execution
ipcMain.handle('run-jmeter', async (event, config) => {
  try {
    const { jmeterPath, exportPath, filesConfig } = config;
    
    // Validate configuration
    if (!jmeterPath || !exportPath || !filesConfig || filesConfig.length === 0) {
      return { success: false, error: 'Invalid configuration provided' };
    }

    // Validate JMeter executable
    try {
      fs.accessSync(jmeterPath, fs.constants.F_OK | fs.constants.X_OK);
    } catch (error) {
      return { success: false, error: 'JMeter executable is not accessible' };
    }

    // Validate export directory
    try {
      fs.accessSync(exportPath, fs.constants.W_OK);
    } catch (error) {
      return { success: false, error: 'Export directory is not writable' };
    }

    // Start the job runner
    await runner.runJobs(jmeterPath, exportPath, filesConfig);
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle job cancellation
ipcMain.handle('cancel-run', async () => {
  try {
    runner.cancelRun();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle app quit gracefully
app.on('before-quit', () => {
  runner.cancelRun();
});