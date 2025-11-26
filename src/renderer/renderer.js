// Global state
let selectedFiles = [];
let currentSettings = {};
let isRunning = false;
const REPORT_SELECTION_DEFAULT = 'bi';
const REPORT_TYPE_LABELS = {
  b: 'Best',
  w: 'Worst',
  bi: 'Best Individual',
  wi: 'Worst Individual'
};
const TARGET_PRESETS = {
  '1tps': { label: '1 TPS', thread: 1, rampup: 1, loop: 50, threshold: 1000 },
  '30tps': { label: '30 TPS', thread: 30, rampup: 1, loop: 120, threshold: 3000 }
};
const TARGET_OPTIONS = {
  '1tps': { label: TARGET_PRESETS['1tps'].label, sequence: ['1tps'] },
  '30tps': { label: TARGET_PRESETS['30tps'].label, sequence: ['30tps'] },
  all: { label: 'All', sequence: ['1tps', '30tps'] }
};
const TARGET_DEFAULT = '1tps';

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
  reportTypeGroup: document.getElementById('report-type-group')
};

function resolveTargetSequence(targetKey) {
  const option = TARGET_OPTIONS[targetKey];
  if (option && Array.isArray(option.sequence) && option.sequence.length > 0) {
    return option.sequence.slice();
  }
  return TARGET_OPTIONS[TARGET_DEFAULT].sequence.slice();
}

function getTargetsForFile(file) {
  if (file && Array.isArray(file.targetSequence) && file.targetSequence.length > 0) {
    return file.targetSequence.slice();
  }
  return resolveTargetSequence(file?.target || TARGET_DEFAULT);
}

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
      currentSettings.reportSelectionMode = currentSettings.reportSelectionMode || REPORT_SELECTION_DEFAULT;
      updateReportTypeSelection(currentSettings.reportSelectionMode);
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

  getReportTypeInputs().forEach((input) => {
    input.addEventListener('change', handleReportTypeChange);
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
  }
}

// Select export directory
async function selectExportDirectory() {
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
  }
}

// Select JMX test files
async function selectJMXFiles() {
  try {
    const result = await window.api.selectJMXs();
    if (result.success && result.files) {
      // Stack new files with existing ones (avoid duplicates)
      const newFiles = result.files.filter(newFile => 
        !selectedFiles.some(existingFile => existingFile.path === newFile.path)
      );
      
      const duplicateCount = result.files.length - newFiles.length;
      
      // Add new files to existing selection
      const filesToAdd = newFiles.map(file => {
        const fileConfig = {
          ...file,
          target: TARGET_DEFAULT,
          rounds: 3,
          progress: 0,
          status: 'ready',
          reportEnabled: true
        };
        applyTargetPreset(fileConfig, TARGET_DEFAULT);
        return fileConfig;
      });
      
      selectedFiles.push(...filesToAdd);
      
      updateFilesTable();
      updateUI();
      
      if (newFiles.length > 0) {
        addLogEntry(`Added ${newFiles.length} new test file(s). Total: ${selectedFiles.length}`, 'success');
      }
      
      if (duplicateCount > 0) {
        addLogEntry(`Skipped ${duplicateCount} duplicate file(s)`, 'warning');
      }
      
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
  }
}

// Update the files table with selected files
function updateFilesTable() {
  const tbody = elements.filesTableBody;
  tbody.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const hasTargetOption = Boolean(TARGET_OPTIONS[file.target]);
    const targetKey = hasTargetOption ? file.target : TARGET_DEFAULT;

    if (!hasTargetOption || !Array.isArray(file.targetSequence)) {
      applyTargetPreset(file, targetKey);
    }
    const reportEnabled = file.reportEnabled !== false;
    file.reportEnabled = reportEnabled;

    const targetOptions = Object.entries(TARGET_OPTIONS)
      .map(([value, option]) => `<option value="${value}" ${value === targetKey ? 'selected' : ''}>${option.label}</option>`)
      .join('');

    const totalIterations = file.rounds * getTargetsForFile(file).length;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="file-name" title="${file.path}">${file.name}</td>
      <td>
        <select class="target-select" data-file="${index}" ${isRunning ? 'disabled' : ''}>
          ${targetOptions}
        </select>
      </td>
      <td><input type="number" class="rounds-input" data-file="${index}" value="${file.rounds}" min="1" max="10" ${isRunning ? 'disabled' : ''}></td>
      <td>
        <label class="report-toggle" title="Toggle report capture for this file">
          <input type="checkbox" class="report-checkbox" data-file="${index}" ${reportEnabled ? 'checked' : ''} ${isRunning ? 'disabled' : ''}>
          <span>${reportEnabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </td>
      <td>
        <div class="file-progress">
          <div class="file-progress-bar">
            <div class="file-progress-fill" data-file="${index}"></div>
          </div>
          <span class="file-progress-text" data-file="${index}">0/${totalIterations}</span>
        </div>
      </td>
      <td><span class="file-status" data-file="${index}">${file.status}</span></td>
      <td>
        <button class="remove-file-btn" data-file="${index}" title="Remove file" ${isRunning ? 'disabled' : ''}>
          ✕
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Add event listeners for rounds input
  tbody.querySelectorAll('.rounds-input').forEach(input => {
    input.addEventListener('change', updateFileRounds);
  });
  
  // Add event listeners for target dropdown
  tbody.querySelectorAll('.target-select').forEach(select => {
    select.addEventListener('change', updateFileTarget);
  });

  // Add event listeners for report checkbox
  tbody.querySelectorAll('.report-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateFileReport);
  });
  
  // Add event listeners for remove buttons
  tbody.querySelectorAll('.remove-file-btn').forEach(button => {
    button.addEventListener('click', removeFile);
  });
  
  updateTotalRuns();
}

// Remove a file from the selected files list
function removeFile(event) {
  if (isRunning) {
    showStatusMessage('Cannot remove files while tests are running', 'warning');
    return;
  }

  const fileIndex = parseInt(event.target.dataset.file);
  const fileName = selectedFiles[fileIndex].name;
  
  // Remove the file from the array
  selectedFiles.splice(fileIndex, 1);
  
  // Update the UI
  updateFilesTable();
  updateUI();
  
  addLogEntry(`Removed file: ${fileName}`, 'info');
  
  // Show message if no files left
  if (selectedFiles.length === 0) {
    showStatusMessage('No test files selected', 'info');
  }
}

// Update file rounds when input changes
function updateFileRounds(event) {
  const fileIndex = parseInt(event.target.dataset.file, 10);
  const value = parseInt(event.target.value, 10);
  
  if (selectedFiles[fileIndex] && value > 0) {
    selectedFiles[fileIndex].rounds = value;
    const targetCount = getTargetsForFile(selectedFiles[fileIndex]).length;
    const totalForFile = Math.max(1, value * targetCount);
    const fileProgressText = document.querySelector(`[data-file="${fileIndex}"].file-progress-text`);
    const fileProgressFill = document.querySelector(`[data-file="${fileIndex}"].file-progress-fill`);
    let completedForFile = 0;

    if (fileProgressText) {
      const [completedPart] = (fileProgressText.textContent || '').split('/');
      const parsedCompleted = parseInt(completedPart, 10);
      completedForFile = Number.isFinite(parsedCompleted) ? Math.min(parsedCompleted, totalForFile) : 0;
      fileProgressText.textContent = `${completedForFile}/${totalForFile}`;
    }

    if (fileProgressFill) {
      const progressPct = Math.round((completedForFile / totalForFile) * 100);
      fileProgressFill.style.width = `${progressPct}%`;
    }

    updateTotalRuns();
  }
}

// Update total runs calculation
function updateTotalRuns() {
  const total = selectedFiles.reduce((sum, file) => {
    const targetCount = getTargetsForFile(file).length;
    return sum + (file.rounds * targetCount);
  }, 0);
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

  getReportTypeInputs().forEach((input) => {
    input.disabled = isRunning;
  });

  document.querySelectorAll('.target-select').forEach(select => {
    select.disabled = isRunning;
  });

  document.querySelectorAll('.rounds-input').forEach(input => {
    input.disabled = isRunning;
  });

  document.querySelectorAll('.report-checkbox').forEach(input => {
    input.disabled = isRunning;
  });

  document.querySelectorAll('.remove-file-btn').forEach(button => {
    button.disabled = isRunning;
  });
}

// Run the JMeter tests
async function runTests() {
  if (isRunning) return;
  
  isRunning = true;
  updateUI();
  
  try {
    // Prepare configuration
    const config = {
      jmeterPath: currentSettings.jmeterPath,
      exportPath: currentSettings.exportPath,
      filesConfig: selectedFiles.map(file => {
        const targetKeys = getTargetsForFile(file);
        const targetConfigs = targetKeys
          .map((targetKey) => {
            const preset = TARGET_PRESETS[targetKey];
            if (!preset) return null;
            return {
              key: targetKey,
              label: preset.label,
              thread: preset.thread,
              rampup: preset.rampup,
              loop: preset.loop,
              threshold: preset.threshold
            };
          })
          .filter(Boolean);

        const primaryTarget = targetConfigs[0] || {
          key: file.target || TARGET_DEFAULT,
          label: TARGET_OPTIONS[file.target || TARGET_DEFAULT]?.label || 'Custom',
          thread: file.thread || TARGET_PRESETS[TARGET_DEFAULT].thread,
          rampup: file.rampup || TARGET_PRESETS[TARGET_DEFAULT].rampup,
          loop: file.loop || TARGET_PRESETS[TARGET_DEFAULT].loop,
          threshold: file.threshold || TARGET_PRESETS[TARGET_DEFAULT].threshold
        };

        return {
          path: file.path,
          thread: primaryTarget.thread,
          rampup: primaryTarget.rampup,
          loop: primaryTarget.loop,
          rounds: file.rounds,
          target: file.target,
          targets: targetConfigs.length > 0 ? targetConfigs : [primaryTarget],
          reportThreshold: file.threshold || TARGET_PRESETS[TARGET_DEFAULT].threshold,
          reportEnabled: file.reportEnabled !== false,
          reportSelectionMode: currentSettings.reportSelectionMode || REPORT_SELECTION_DEFAULT
        };
      })
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
  const {
    overallPct,
    fileIndex,
    roundIndex,
    totalRuns,
    completedRuns,
    currentFile,
    status,
    targetIndex = 0,
    targetCount = 1,
    targetLabel = null
  } = progressData;

  const normalizedRoundIndex = Number.isFinite(Number(roundIndex)) ? Number(roundIndex) : 0;
  const normalizedTargetIndex = Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : 0;
  const normalizedTargetCount = Number.isFinite(Number(targetCount)) && Number(targetCount) > 0
    ? Number(targetCount)
    : 1;
  
  // Update overall progress
  const progressFill = elements.overallProgress.querySelector('.progress-fill');
  progressFill.style.width = `${overallPct}%`;
  elements.progressPercentage.textContent = `${overallPct}%`;
  
  const fileRounds = fileIndex >= 0 && fileIndex < selectedFiles.length
    ? selectedFiles[fileIndex].rounds
    : 1;
  const roundDisplayValue = Math.min(fileRounds, normalizedRoundIndex + 1);

  // Update progress text
  if (currentFile) {
    const targetDisplay = targetLabel ? ` [${targetLabel}]` : '';
    elements.progressText.textContent = `Running ${currentFile}${targetDisplay} (Round ${roundDisplayValue}) - ${completedRuns}/${totalRuns} completed`;
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
      const roundsPerTarget = file.rounds;
      const totalForFile = Math.max(1, roundsPerTarget * normalizedTargetCount);
      const completedForFile = Math.min(
        totalForFile,
        (normalizedTargetIndex * roundsPerTarget) + normalizedRoundIndex
      );
      const fileProgress = Math.round((completedForFile / totalForFile) * 100);
      fileProgressFill.style.width = `${fileProgress}%`;
      fileProgressText.textContent = `${completedForFile}/${totalForFile}`;
      const statusText = status || 'running';
      fileStatus.textContent = targetLabel ? `${statusText} (${targetLabel})` : statusText;
      fileStatus.className = `file-status ${statusText}`;
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

  if (Array.isArray(result.reports) && result.reports.length > 0) {
    result.reports.forEach((reportSummary) => {
      const { file, outputDir, selectionMode, reportCount } = reportSummary;
      const targetLabel = reportSummary.targetLabel || reportSummary.target || null;
      const modeText = selectionMode ? selectionMode.toUpperCase() : 'B';
      const targetNote = targetLabel ? ` Target: ${targetLabel}.` : '';
      addLogEntry(
        `📊 Report captured for ${file || 'unknown file'} (mode: ${modeText}, entries: ${reportCount ?? 0}). Output folder: ${outputDir}.${targetNote}`,
        'info'
      );
    });
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
    const targetInfo = error.targetLabel ? ` [${error.targetLabel}]` : '';
    addLogEntry(`❌ Error in ${fileName}${targetInfo} Round ${error.round}: ${error.error}`, 'error');
    
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

function getReportTypeInputs() {
  return elements.reportTypeGroup
    ? elements.reportTypeGroup.querySelectorAll('input[name="report-type"]')
    : [];
}

function updateReportTypeSelection(mode) {
  getReportTypeInputs().forEach((input) => {
    const isSelected = input.value === mode;
    input.checked = isSelected;
    if (input.parentElement && input.parentElement.classList) {
      input.parentElement.classList.toggle('selected', isSelected);
    }
  });
}

function applyTargetPreset(file, targetKey) {
  if (!file) return;
  const sequence = resolveTargetSequence(targetKey);
  file.target = targetKey;
  file.targetSequence = sequence;

  const primaryPresetKey = sequence[0];
  const primaryPreset = TARGET_PRESETS[primaryPresetKey];

  if (primaryPreset) {
    file.thread = primaryPreset.thread;
    file.rampup = primaryPreset.rampup;
    file.loop = primaryPreset.loop;
    file.threshold = primaryPreset.threshold;
  } else if (typeof file.threshold !== 'number') {
    file.threshold = TARGET_PRESETS[TARGET_DEFAULT].threshold;
  }
}

function updateFileTarget(event) {
  const fileIndex = parseInt(event.target.dataset.file, 10);
  const targetKey = event.target.value;

  if (!selectedFiles[fileIndex]) {
    return;
  }

  if (!TARGET_PRESETS[targetKey]) {
    // Allow composite targets defined in TARGET_OPTIONS (e.g., 'all')
    const option = TARGET_OPTIONS[targetKey];
    if (!option) {
      showStatusMessage('Unknown target selected', 'error');
      return;
    }
  }

  applyTargetPreset(selectedFiles[fileIndex], targetKey);
  updateFilesTable();
  updateUI();
  const option = TARGET_OPTIONS[targetKey] || { label: targetKey };
  addLogEntry(`Set target for ${selectedFiles[fileIndex].name} to ${option.label}`, 'info');
}

function updateFileReport(event) {
  const fileIndex = parseInt(event.target.dataset.file, 10);
  const enabled = event.target.checked;

  if (!selectedFiles[fileIndex]) {
    return;
  }

  selectedFiles[fileIndex].reportEnabled = enabled;

  const label = enabled ? 'enabled' : 'disabled';
  addLogEntry(`Report capture ${label} for ${selectedFiles[fileIndex].name}`, enabled ? 'info' : 'warning');

  const statusText = enabled ? 'Enabled' : 'Disabled';
  const span = event.target.parentElement?.querySelector('span');
  if (span) {
    span.textContent = statusText;
  }
}

async function handleReportTypeChange(event) {
  const { value } = event.target;
  currentSettings.reportSelectionMode = value;
  updateReportTypeSelection(value);

  try {
    await window.api.setSetting('reportSelectionMode', value);
    const label = REPORT_TYPE_LABELS[value] || value;
    addLogEntry(`Report type set to "${label}"`, 'info');
  } catch (error) {
    addLogEntry(`Failed to save report type: ${error.message}`, 'error');
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
