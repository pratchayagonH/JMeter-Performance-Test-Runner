// Global state
let selectedFiles = [];
let currentSettings = {};
let isRunning = false;

// DOM element references
const elements = {
  jmeterPath: document.getElementById('jmeter-path'),
  exportPath: document.getElementById('export-path'),
  browseJmeter: document.getElementById('browse-jmeter'),
  browseExport: document.getElementById('browse-export'),
  selectJmx: document.getElementById('select-jmx'),
  fileCountText: document.getElementById('file-count-text'),
  totalRuns: document.getElementById('total-runs'),
  filesTableBody: document.getElementById('files-table-body'),
  runTests: document.getElementById('run-tests'),
  cancelTests: document.getElementById('cancel-tests'),
  clearLogs: document.getElementById('clear-logs'),
  progressText: document.getElementById('progress-text'),
  overallProgress: document.getElementById('overall-progress'),
  progressPercentage: document.getElementById('progress-percentage'),
  logOutput: document.getElementById('log-output'),
  logContainer: document.getElementById('log-container'),
  autoScroll: document.getElementById('auto-scroll'),
  exportLogs: document.getElementById('export-logs'),
  statusMessages: document.getElementById('status-messages'),
  loadingOverlay: document.getElementById('loading-overlay')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  setupIpcListeners();
  updateUI();
  
  addLogEntry('Application started successfully', 'info');
});

// Load settings from main process
async function loadSettings() {
  try {
    const result = await window.api.getSettings();
    if (result.success) {
      currentSettings = result.settings;
      elements.jmeterPath.value = currentSettings.jmeterPath || '';
      elements.exportPath.value = currentSettings.exportPath || '';
    }
  } catch (error) {
    addLogEntry(`Failed to load settings: ${error.message}`, 'error');
  }
}

// Setup event listeners for UI elements
function setupEventListeners() {
  // File selection
  elements.browseJmeter.addEventListener('click', selectJMeterExecutable);
  elements.browseExport.addEventListener('click', selectExportDirectory);
  elements.selectJmx.addEventListener('click', selectJMXFiles);
  
  // Test execution
  elements.runTests.addEventListener('click', runTests);
  elements.cancelTests.addEventListener('click', cancelTests);
  
  // Log controls
  elements.clearLogs.addEventListener('click', clearLogs);
  elements.exportLogs.addEventListener('click', exportLogs);
  
  // Auto-scroll checkbox
  elements.autoScroll.addEventListener('change', () => {
    if (elements.autoScroll.checked) {
      scrollToBottom();
    }
  });
}

// Setup IPC listeners for main process communication
function setupIpcListeners() {
  // Progress updates
  window.api.onProgress((progressData) => {
    updateProgress(progressData);
  });
  
  // Log updates
  window.api.onLog((logData) => {
    addLogEntry(logData.text, logData.isStdErr ? 'error' : 'info', logData.timestamp);
  });
  
  // Job completion
  window.api.onJobComplete((result) => {
    handleJobComplete(result);
  });
  
  // Job errors
  window.api.onJobError((error) => {
    handleJobError(error);
  });
}

// Select JMeter executable
async function selectJMeterExecutable() {
  showLoading();
  try {
    const result = await window.api.selectJMeter();
    if (result.success && result.path) {
      elements.jmeterPath.value = result.path;
      currentSettings.jmeterPath = result.path;
      addLogEntry(`JMeter executable selected: ${result.path}`, 'success');
      updateUI();
    } else if (result.error) {
      showStatusMessage(result.error, 'error');
    }
  } catch (error) {
    showStatusMessage(`Failed to select JMeter: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// Select export directory
async function selectExportDirectory() {
  showLoading();
  try {
    const result = await window.api.selectExportDir();
    if (result.success && result.path) {
      elements.exportPath.value = result.path;
      currentSettings.exportPath = result.path;
      addLogEntry(`Export directory selected: ${result.path}`, 'success');
      updateUI();
    } else if (result.error) {
      showStatusMessage(result.error, 'error');
    }
  } catch (error) {
    showStatusMessage(`Failed to select export directory: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// Select JMX test files
async function selectJMXFiles() {
  showLoading();
  try {
    const result = await window.api.selectJMXs();
    if (result.success && result.files) {
      selectedFiles = result.files.map(file => ({
        ...file,
        thread: 1,    // Default values
        rampup: 1,
        loop: 50,
        rounds: 3,
        progress: 0,
        status: 'ready'
      }));
      
      updateFilesTable();
      updateUI();
      
      addLogEntry(`Selected ${selectedFiles.length} test file(s)`, 'success');
      
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          addLogEntry(`Warning: ${error}`, 'warning');
        });
      }
    } else if (result.error) {
      showStatusMessage(result.error, 'error');
    }
  } catch (error) {
    showStatusMessage(`Failed to select files: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// Update the files table with selected files
function updateFilesTable() {
  const tbody = elements.filesTableBody;
  tbody.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="file-name" title="${file.path}">${file.name}</td>
      <td><input type="number" class="param-input" data-file="${index}" data-param="thread" value="${file.thread}" min="1" max="1000"></td>
      <td><input type="number" class="param-input" data-file="${index}" data-param="rampup" value="${file.rampup}" min="1" max="3600"></td>
      <td><input type="number" class="param-input" data-file="${index}" data-param="loop" value="${file.loop}" min="1" max="10000"></td>
      <td><input type="number" class="param-input" data-file="${index}" data-param="rounds" value="${file.rounds}" min="1" max="10"></td>
      <td>
        <div class="file-progress">
          <div class="file-progress-bar">
            <div class="file-progress-fill" data-file="${index}"></div>
          </div>
          <span class="file-progress-text" data-file="${index}">0/0</span>
        </div>
      </td>
      <td><span class="file-status" data-file="${index}">${file.status}</span></td>
    `;
    tbody.appendChild(row);
  });
  
  // Add event listeners for parameter inputs
  tbody.querySelectorAll('.param-input').forEach(input => {
    input.addEventListener('change', updateFileParameter);
  });
  
  updateTotalRuns();
}

// Update file parameter when input changes
function updateFileParameter(event) {
  const fileIndex = parseInt(event.target.dataset.file);
  const paramName = event.target.dataset.param;
  const value = parseInt(event.target.value);
  
  if (selectedFiles[fileIndex] && value > 0) {
    selectedFiles[fileIndex][paramName] = value;
    updateTotalRuns();
  }
}

// Update total runs calculation
function updateTotalRuns() {
  const total = selectedFiles.reduce((sum, file) => sum + file.rounds, 0);
  elements.totalRuns.textContent = `Total Runs: ${total}`;
  elements.fileCountText.textContent = `${selectedFiles.length} file(s) selected`;
}

// Update UI state based on current configuration
function updateUI() {
  const hasJMeter = currentSettings.jmeterPath && currentSettings.jmeterPath.length > 0;
  const hasExport = currentSettings.exportPath && currentSettings.exportPath.length > 0;
  const hasFiles = selectedFiles.length > 0;
  
  elements.runTests.disabled = !hasJMeter || !hasExport || !hasFiles || isRunning;
  elements.cancelTests.disabled = !isRunning;
  
  // Update button states
  if (isRunning) {
    elements.runTests.textContent = '⏳ Running...';
    elements.runTests.classList.add('running');
  } else {
    elements.runTests.textContent = '▶️ Run Tests';
    elements.runTests.classList.remove('running');
  }
}

// Run the JMeter tests
async function runTests() {
  if (isRunning) return;
  
  showLoading();
  isRunning = true;
  updateUI();
  
  try {
    // Prepare configuration
    const config = {
      jmeterPath: currentSettings.jmeterPath,
      exportPath: currentSettings.exportPath,
      filesConfig: selectedFiles.map(file => ({
        path: file.path,
        thread: file.thread,
        rampup: file.rampup,
        loop: file.loop,
        rounds: file.rounds
      }))
    };
    
    addLogEntry('Starting test execution...', 'info');
    elements.progressText.textContent = 'Initializing tests...';
    
    const result = await window.api.runJobs(config);
    if (!result.success) {
      throw new Error(result.error);
    }
    
  } catch (error) {
    addLogEntry(`Failed to start tests: ${error.message}`, 'error');
    showStatusMessage(`Failed to start tests: ${error.message}`, 'error');
    isRunning = false;
    updateUI();
  } finally {
    hideLoading();
  }
}

// Cancel running tests
async function cancelTests() {
  try {
    const result = await window.api.cancelRun();
    if (result.success) {
      addLogEntry('Cancellation requested...', 'warning');
    }
  } catch (error) {
    addLogEntry(`Failed to cancel: ${error.message}`, 'error');
  }
}

// Update progress display
function updateProgress(progressData) {
  const { overallPct, fileIndex, roundIndex, totalRuns, completedRuns, currentFile, status } = progressData;
  
  // Update overall progress
  const progressFill = elements.overallProgress.querySelector('.progress-fill');
  progressFill.style.width = `${overallPct}%`;
  elements.progressPercentage.textContent = `${overallPct}%`;
  
  // Update progress text
  if (currentFile) {
    elements.progressText.textContent = `Running ${currentFile} (Round ${roundIndex + 1}) - ${completedRuns}/${totalRuns} completed`;
  } else {
    elements.progressText.textContent = `${completedRuns}/${totalRuns} runs completed`;
  }
  
  // Update file-specific progress
  if (fileIndex >= 0 && fileIndex < selectedFiles.length) {
    const file = selectedFiles[fileIndex];
    const fileProgressFill = document.querySelector(`[data-file="${fileIndex}"].file-progress-fill`);
    const fileProgressText = document.querySelector(`[data-file="${fileIndex}"].file-progress-text`);
    const fileStatus = document.querySelector(`[data-file="${fileIndex}"].file-status`);
    
    if (fileProgressFill && fileProgressText && fileStatus) {
      const fileProgress = Math.round((roundIndex / file.rounds) * 100);
      fileProgressFill.style.width = `${fileProgress}%`;
      fileProgressText.textContent = `${roundIndex}/${file.rounds}`;
      fileStatus.textContent = status || 'running';
      fileStatus.className = `file-status ${status || 'running'}`;
    }
  }
}

// Handle job completion
function handleJobComplete(result) {
  isRunning = false;
  updateUI();
  
  if (result.success) {
    addLogEntry(`✅ All tests completed successfully! (${result.completedRuns}/${result.totalRuns})`, 'success');
    elements.progressText.textContent = 'All tests completed';
    
    // Mark all files as completed
    selectedFiles.forEach((file, index) => {
      const fileStatus = document.querySelector(`[data-file="${index}"].file-status`);
      if (fileStatus) {
        fileStatus.textContent = 'completed';
        fileStatus.className = 'file-status completed';
      }
    });
  } else if (result.cancelled) {
    addLogEntry('❌ Tests cancelled by user', 'warning');
    elements.progressText.textContent = 'Tests cancelled';
  } else {
    addLogEntry('❌ Tests completed with errors', 'error');
    elements.progressText.textContent = 'Completed with errors';
  }
}

// Handle job errors
function handleJobError(error) {
  if (error.fatal) {
    addLogEntry(`❌ Fatal error: ${error.error}`, 'error');
    isRunning = false;
    updateUI();
  } else if (error.fileIndex >= 0) {
    const fileName = selectedFiles[error.fileIndex]?.name || 'Unknown file';
    addLogEntry(`❌ Error in ${fileName} Round ${error.round}: ${error.error}`, 'error');
    
    // Update file status
    const fileStatus = document.querySelector(`[data-file="${error.fileIndex}"].file-status`);
    if (fileStatus) {
      fileStatus.textContent = 'error';
      fileStatus.className = 'file-status error';
    }
  } else {
    addLogEntry(`❌ Error: ${error.error}`, 'error');
  }
}

// Add log entry to the log output
function addLogEntry(message, type = 'info', timestamp = null) {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  logEntry.innerHTML = `
    <span class="timestamp">[${time}]</span>
    <span class="message">${escapeHtml(message)}</span>
  `;
  
  elements.logOutput.appendChild(logEntry);
  
  // Auto-scroll if enabled
  if (elements.autoScroll.checked) {
    scrollToBottom();
  }
  
  // Limit log entries to prevent memory issues
  const logEntries = elements.logOutput.children;
  if (logEntries.length > 1000) {
    elements.logOutput.removeChild(logEntries[0]);
  }
}

// Clear log output
function clearLogs() {
  elements.logOutput.innerHTML = '';
  addLogEntry('Logs cleared', 'info');
}

// Export logs to file
async function exportLogs() {
  const logs = Array.from(elements.logOutput.children)
    .map(entry => entry.textContent)
    .join('\n');
  
  try {
    // Create a downloadable file
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `jmeter-runner-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    
    URL.revokeObjectURL(url);
    addLogEntry('Logs exported successfully', 'success');
  } catch (error) {
    addLogEntry(`Failed to export logs: ${error.message}`, 'error');
  }
}

// Scroll to bottom of log container
function scrollToBottom() {
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
}

// Show status message
function showStatusMessage(message, type = 'info') {
  const messageEl = document.createElement('div');
  messageEl.className = `status-message ${type}`;
  messageEl.textContent = message;
  
  elements.statusMessages.appendChild(messageEl);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.parentNode.removeChild(messageEl);
    }
  }, 5000);
}

// Show loading overlay
function showLoading() {
  elements.loadingOverlay.classList.remove('hidden');
}

// Hide loading overlay
function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Handle window close - cleanup
window.addEventListener('beforeunload', () => {
  window.api.removeAllListeners('progress');
  window.api.removeAllListeners('log');
  window.api.removeAllListeners('job-complete');
  window.api.removeAllListeners('job-error');
});