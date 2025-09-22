const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // File selection methods
  selectJMeter: () => ipcRenderer.invoke('open-jmeter'),
  selectJMXs: () => ipcRenderer.invoke('open-jmx'),
  selectExportDir: () => ipcRenderer.invoke('open-export'),
  
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  
  // Job execution
  runJobs: (config) => ipcRenderer.invoke('run-jmeter', config),
  cancelRun: () => ipcRenderer.invoke('cancel-run'),
  
  // Progress and log event listeners
  onProgress: (callback) => {
    ipcRenderer.on('progress', (event, progressData) => {
      callback(progressData);
    });
  },
  
  onLog: (callback) => {
    ipcRenderer.on('log', (event, logData) => {
      callback(logData);
    });
  },
  
  onJobComplete: (callback) => {
    ipcRenderer.on('job-complete', (event, result) => {
      callback(result);
    });
  },
  
  onJobError: (callback) => {
    ipcRenderer.on('job-error', (event, error) => {
      callback(error);
    });
  },
  
  // Remove event listeners (cleanup)
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});