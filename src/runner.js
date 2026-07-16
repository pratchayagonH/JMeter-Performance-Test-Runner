const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { JMeterReportAnalyzer } = require('capture-jmeter-report/src/index.js');

let chromium = null;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  chromium = null;
}

const DEFAULT_SELECTION_MODE = 'b';
const DEFAULT_THRESHOLD = 1000;
const DEFAULT_TARGET_LABEL = 'Custom';
const LEGACY_MYSQL_DRIVER = 'com.mysql.jdbc.Driver';
const MODERN_MYSQL_DRIVER = 'com.mysql.cj.jdbc.Driver';
const LOG_FLUSH_INTERVAL_MS = 75;

function sanitizeTargetKey(targetKey) {
  return String(targetKey || 'default')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase() || 'default';
}

function sanitizeReportLabel(label) {
  return String(label || 'report').replace(/[^\w\-_.]/g, '_');
}

function resolveReportLocation(location) {
  const normalizedLocation = String(location || '').replace(/[\\/]+$/, '');
  const locationPath = path.resolve(normalizedLocation);

  if (fs.existsSync(locationPath) && fs.statSync(locationPath).isDirectory()) {
    return {
      locationPath,
      folderName: path.basename(locationPath),
      searchLocation: path.dirname(locationPath)
    };
  }

  return {
    locationPath,
    folderName: path.basename(locationPath),
    searchLocation: path.dirname(locationPath) || process.cwd()
  };
}

function findImmediateReportFolders(locationPath, folderName) {
  if (!fs.existsSync(locationPath) || !fs.statSync(locationPath).isDirectory()) {
    return [];
  }

  return fs.readdirSync(locationPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== `${folderName}_result`)
    .map((entry) => path.join(locationPath, entry.name))
    .filter((folderPath) => fs.existsSync(path.join(folderPath, 'index.html')));
}

async function collectMatchingReportFolders(analyzer, locationPath, folderName) {
  const directReportFolders = findImmediateReportFolders(locationPath, folderName);

  if (directReportFolders.length > 0) {
    return directReportFolders;
  }

  return analyzer.findMatchingFolders(folderName);
}

async function populateFolderStats(analyzer, matchingFolders) {
  const folderStats = await Promise.all(matchingFolders.map(async (folderPath) => {
    const indexFile = path.join(folderPath, 'index.html');

    if (!fs.existsSync(indexFile)) {
      return null;
    }

    const stats = await analyzer.parseStatisticsTable(indexFile);

    if (Object.keys(stats).length === 0) {
      return null;
    }

    return { folderPath, stats };
  }));

  folderStats.filter(Boolean).forEach(({ folderPath, stats }) => {
    analyzer.foldersData[folderPath] = stats;
  });
}

async function highlightStatisticsRow(page, label) {
  return page.evaluate((targetLabel) => {
    const rows = Array.from(document.querySelectorAll('#statisticsTable tr'));
    let matched = false;

    rows.forEach((row) => {
      row.style.border = '';
      row.style.backgroundColor = '';

      const firstCell = row.querySelector('td:first-child');
      if (!firstCell) {
        return;
      }

      if (firstCell.textContent.trim() === targetLabel) {
        row.style.border = '3px solid #bd0404';
        row.style.backgroundColor = 'rgba(189, 4, 4, 0.1)';
        matched = true;
      }
    });

    return matched;
  }, label);
}

async function waitForStatisticsRow(page, label) {
  try {
    await page.waitForFunction((targetLabel) => {
      return Array.from(document.querySelectorAll('#statisticsTable tr td:first-child'))
        .some((cell) => cell.textContent.trim() === targetLabel);
    }, label, { timeout: 3000 });

    return true;
  } catch (error) {
    return false;
  }
}

async function captureReportScreenshotsWithPlaywright(reportsBySourceFolder) {
  if (!chromium) {
    throw new Error('Playwright is not available');
  }

  const successfulScreenshots = new Set();
  let browser = null;

  browser = await chromium.launch({ headless: true });

  try {
    for (const [sourceFolder, sourceReports] of reportsBySourceFolder.entries()) {
      const indexFile = path.join(sourceFolder, 'index.html');

      if (!fs.existsSync(indexFile)) {
        continue;
      }

      const page = await browser.newPage();

      try {
        await page.goto(`file://${path.resolve(indexFile)}`);
        await page.waitForSelector('#statisticsTable', { timeout: 10000 });

        const table = page.locator('#statisticsTable');

        for (const report of sourceReports) {
          const rowReady = await waitForStatisticsRow(page, report.label);

          if (!rowReady) {
            continue;
          }

          const foundRow = await highlightStatisticsRow(page, report.label);

          if (!foundRow) {
            continue;
          }

          await table.screenshot({ path: report.screenshotPath });
          successfulScreenshots.add(report.screenshotPath);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return successfulScreenshots;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForElectronStatisticsTable(contents, timeoutMs = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const tableReady = await contents.executeJavaScript(
      'Boolean(document.querySelector("#statisticsTable"))',
      true
    );

    if (tableReady) {
      return true;
    }

    await delay(100);
  }

  return false;
}

async function waitForElectronStatisticsRow(contents, label, timeoutMs = 3000) {
  const start = Date.now();
  const serializedLabel = JSON.stringify(label);

  while (Date.now() - start < timeoutMs) {
    const rowReady = await contents.executeJavaScript(`
      Array.from(document.querySelectorAll('#statisticsTable tr td:first-child'))
        .some((cell) => cell.textContent.trim() === ${serializedLabel})
    `, true);

    if (rowReady) {
      return true;
    }

    await delay(100);
  }

  return false;
}

async function highlightElectronStatisticsRow(contents, label) {
  const serializedLabel = JSON.stringify(label);

  return contents.executeJavaScript(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#statisticsTable tr'));
      let matched = false;

      rows.forEach((row) => {
        row.style.border = '';
        row.style.backgroundColor = '';

        const firstCell = row.querySelector('td:first-child');
        if (!firstCell) {
          return;
        }

        if (firstCell.textContent.trim() === ${serializedLabel}) {
          row.style.border = '3px solid #bd0404';
          row.style.backgroundColor = 'rgba(189, 4, 4, 0.1)';
          matched = true;
        }
      });

      return matched;
    })()
  `, true);
}

async function waitForElectronPaint(contents) {
  await contents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    })
  `, true);
}

async function getElectronStatisticsTableBounds(contents) {
  return contents.executeJavaScript(`
    (() => {
      const table = document.querySelector('#statisticsTable');
      if (!table) {
        return null;
      }

      document.documentElement.style.background = '#ffffff';
      document.body.style.background = '#ffffff';
      table.scrollIntoView({ block: 'start', inline: 'nearest' });

      const rect = table.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1400;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1000;
      const x = Math.max(0, Math.floor(rect.left));
      const y = Math.max(0, Math.floor(rect.top));

      return {
        x,
        y,
        width: Math.max(1, Math.min(Math.ceil(rect.width), viewportWidth - x)),
        height: Math.max(1, Math.min(Math.ceil(rect.height), viewportHeight - y))
      };
    })()
  `, true);
}

async function captureReportScreenshotsWithElectron(reportsBySourceFolder) {
  const successfulScreenshots = new Set();

  for (const [sourceFolder, sourceReports] of reportsBySourceFolder.entries()) {
    const indexFile = path.join(sourceFolder, 'index.html');

    if (!fs.existsSync(indexFile)) {
      continue;
    }

    const captureWindow = new BrowserWindow({
      show: false,
      width: 1600,
      height: 1200,
      backgroundColor: '#ffffff',
      paintWhenInitiallyHidden: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        sandbox: true
      }
    });

    try {
      await captureWindow.loadFile(indexFile);
      const contents = captureWindow.webContents;
      const tableReady = await waitForElectronStatisticsTable(contents);

      if (!tableReady) {
        continue;
      }

      for (const report of sourceReports) {
        const rowReady = await waitForElectronStatisticsRow(contents, report.label);

        if (!rowReady) {
          continue;
        }

        const foundRow = await highlightElectronStatisticsRow(contents, report.label);

        if (!foundRow) {
          continue;
        }

        await waitForElectronPaint(contents);
        const tableBounds = await getElectronStatisticsTableBounds(contents);

        if (!tableBounds) {
          continue;
        }

        await waitForElectronPaint(contents);
        const image = await contents.capturePage(tableBounds);
        fs.writeFileSync(report.screenshotPath, image.toPNG());
        successfulScreenshots.add(report.screenshotPath);
      }
    } finally {
      if (!captureWindow.isDestroyed()) {
        captureWindow.destroy();
      }
    }
  }

  return successfulScreenshots;
}

async function captureReportScreenshots(reports) {
  const reportsBySourceFolder = new Map();

  reports.forEach((report) => {
    if (!report.sourceFolder || !report.screenshotPath) {
      return;
    }

    const sourceReports = reportsBySourceFolder.get(report.sourceFolder) || [];
    sourceReports.push(report);
    reportsBySourceFolder.set(report.sourceFolder, sourceReports);
  });

  if (reportsBySourceFolder.size === 0) {
    return { successfulScreenshots: new Set(), error: null };
  }

  try {
    return {
      successfulScreenshots: await captureReportScreenshotsWithPlaywright(reportsBySourceFolder),
      error: null
    };
  } catch (playwrightError) {
    try {
      return {
        successfulScreenshots: await captureReportScreenshotsWithElectron(reportsBySourceFolder),
        error: null
      };
    } catch (electronError) {
      electronError.message = `${electronError.message} (Playwright fallback reason: ${playwrightError.message})`;
      return { successfulScreenshots: new Set(), error: electronError };
    }
  }
}

function prepareJmxTestPlan(filePath, tempDir, runStamp) {
  const planContent = fs.readFileSync(filePath, 'utf8');
  const legacyDriverMatches = planContent.match(/com\.mysql\.jdbc\.Driver/g) || [];

  if (legacyDriverMatches.length === 0) {
    return {
      planPath: filePath,
      normalizedLegacyMySqlDriver: false,
      replacementCount: 0
    };
  }

  const normalizedPlanPath = path.join(
    tempDir,
    `${path.basename(filePath, path.extname(filePath))}-${runStamp}.jmx`
  );
  const normalizedPlanContent = planContent.replace(
    /com\.mysql\.jdbc\.Driver/g,
    MODERN_MYSQL_DRIVER
  );

  fs.writeFileSync(normalizedPlanPath, normalizedPlanContent, 'utf8');

  return {
    planPath: normalizedPlanPath,
    normalizedLegacyMySqlDriver: true,
    replacementCount: legacyDriverMatches.length
  };
}

async function captureReport(options) {
  const location = options?.location;
  const output = options?.output;
  const selectionMode = options?.type || DEFAULT_SELECTION_MODE;
  const threshold = Number.isFinite(Number(options?.threshold))
    ? Number(options.threshold)
    : DEFAULT_THRESHOLD;
  const targetLabel = String(options?.targetLabel || DEFAULT_TARGET_LABEL).trim() || DEFAULT_TARGET_LABEL;

  if (!location) {
    throw new Error('Report location is required');
  }

  if (!output) {
    throw new Error('Report output path is required');
  }

  const { locationPath, folderName, searchLocation } = resolveReportLocation(location);
  const analyzer = new JMeterReportAnalyzer(searchLocation, output, selectionMode, threshold, targetLabel);
  const matchingFolders = await collectMatchingReportFolders(analyzer, locationPath, folderName);

  if (matchingFolders.length === 0) {
    throw new Error(`No folders found containing '${folderName}' in ${searchLocation}`);
  }

  await populateFolderStats(analyzer, matchingFolders);

  if (Object.keys(analyzer.foldersData).length === 0) {
    throw new Error('No valid JMeter reports found');
  }

  const outputDir = path.join(output, `${folderName}_result`);

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  let selectedData = {};
  let selectedFolder = null;

  if (selectionMode === 'b') {
    [selectedFolder, selectedData] = analyzer.selectBestFolder();
  } else if (selectionMode === 'w') {
    [selectedFolder, selectedData] = analyzer.selectWorstFolder();
  } else if (selectionMode === 'bi') {
    selectedData = analyzer.selectBestIndividual();
  } else if (selectionMode === 'wi') {
    selectedData = analyzer.selectWorstIndividual();
  } else {
    throw new Error(`Unsupported report selection mode: ${selectionMode}`);
  }

  const reports = [];

  for (const [label, data] of Object.entries(selectedData)) {
    const safeLabel = sanitizeReportLabel(label);
    const htmlPath = path.join(outputDir, `${safeLabel}.html`);
    const screenshotPath = path.join(outputDir, `${safeLabel}.png`);
    const sourceFolder = ['bi', 'wi'].includes(selectionMode)
      ? data.source_folder || selectedFolder
      : selectedFolder;

    await analyzer.generateHtmlFile(label, data, folderName, outputDir);

    reports.push({
      label,
      htmlPath,
      screenshotPath,
      sourceFolder,
      min: data.min,
      max: data.max,
      pct95: data['95th_pct']
    });
  }

  const screenshotResult = await captureReportScreenshots(reports);
  const successfulScreenshots = screenshotResult.successfulScreenshots;

  return {
    outputDir,
    selectionMode,
    threshold,
    targetLabel,
    screenshotError: screenshotResult.error,
    reports: reports.map((report) => ({
      ...report,
      screenshotPath: report.screenshotPath && successfulScreenshots.has(report.screenshotPath)
        ? report.screenshotPath
        : null
    }))
  };
}

let webContents = null;
let currentJob = null;
let isRunning = false;
let shouldCancel = false;
let pendingLogs = [];
let logFlushTimer = null;

function hasWebContents() {
  return Boolean(webContents && !webContents.isDestroyed());
}

function sendIpc(channel, payload) {
  if (!hasWebContents()) {
    return;
  }

  webContents.send(channel, payload);
}

function flushQueuedLogs() {
  if (pendingLogs.length === 0) {
    return;
  }

  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }

  if (!hasWebContents()) {
    pendingLogs = [];
    return;
  }

  const mergedLogs = [];

  pendingLogs.forEach((entry) => {
    const lastEntry = mergedLogs[mergedLogs.length - 1];

    if (
      lastEntry &&
      lastEntry.fileIndex === entry.fileIndex &&
      lastEntry.roundIndex === entry.roundIndex &&
      lastEntry.isStdErr === entry.isStdErr
    ) {
      lastEntry.text += entry.text;
      lastEntry.timestamp = entry.timestamp;
      return;
    }

    mergedLogs.push({ ...entry });
  });

  pendingLogs = [];
  mergedLogs.forEach((entry) => {
    sendIpc('log', entry);
  });
}

function queueLog(payload) {
  if (!hasWebContents()) {
    return;
  }

  pendingLogs.push(payload);

  if (logFlushTimer) {
    return;
  }

  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    flushQueuedLogs();
  }, LOG_FLUSH_INTERVAL_MS);
}

function formatErrorForLog(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.stack) {
    return error.stack;
  }

  return error.message || String(error);
}

function buildCaptureErrorSummary({ file, targetLabel, targetKey, stage, error }) {
  return {
    program: 'capture-jmeter-report',
    file,
    target: targetKey,
    targetLabel,
    stage,
    message: error?.message || String(error || 'Unknown error'),
    details: formatErrorForLog(error)
  };
}

/**
 * Initialize the runner with webContents for progress updates
 * @param {Object} mainWebContents - Main window's webContents for IPC
 */
function init(mainWebContents) {
  webContents = mainWebContents;
  pendingLogs = [];

  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
}

/**
 * Run JMeter jobs serially based on configuration
 * @param {string} jmeterPath - Path to JMeter executable
 * @param {string} exportPath - Base export directory path
 * @param {Array} filesConfig - Array of file configurations
 */
async function runJobs(jmeterPath, exportPath, filesConfig) {
  if (isRunning) {
    throw new Error('Jobs are already running');
  }

  function buildTargetConfigs(config) {
    if (Array.isArray(config.targets) && config.targets.length > 0) {
      return config.targets.map((target) => ({
        key: target.key || config.target || 'custom',
        label: target.label || target.key || DEFAULT_TARGET_LABEL,
        thread: Number.isFinite(Number(target.thread)) ? Number(target.thread) : Number(config.thread) || 1,
        rampup: Number.isFinite(Number(target.rampup)) ? Number(target.rampup) : Number(config.rampup) || 1,
        loop: Number.isFinite(Number(target.loop)) ? Number(target.loop) : Number(config.loop) || 1
      }));
    }

    return [{
      key: config.target || 'custom',
      label: config.targetLabel || config.target || DEFAULT_TARGET_LABEL,
      thread: Number(config.thread) || 1,
      rampup: Number(config.rampup) || 1,
      loop: Number(config.loop) || 1
    }];
  }

  isRunning = true;
  shouldCancel = false;
  
  // Calculate total number of runs
  const totalRuns = filesConfig.reduce((sum, config) => {
    const rounds = Number(config.rounds) || 1;
    const targets = buildTargetConfigs(config);
    return sum + (rounds * targets.length);
  }, 0);
  let completedRuns = 0;
  const analysisResults = [];
  const captureErrors = [];

  try {
    // Iterate through each file
    for (let fileIndex = 0; fileIndex < filesConfig.length; fileIndex++) {
      if (shouldCancel) break;

      const fileConfig = filesConfig[fileIndex];
      const filePath = fileConfig.path;
      const rounds = Number(fileConfig.rounds) || 1;
      const targetConfigs = buildTargetConfigs(fileConfig);
      const targetCount = targetConfigs.length;
      const basename = path.basename(filePath, '.jmx');
      const selectionMode = fileConfig.reportSelectionMode || DEFAULT_SELECTION_MODE;
      const baseThreshold = Number(fileConfig.reportThreshold) || DEFAULT_THRESHOLD;
      const captureDisabled = fileConfig.reportEnabled === false;

      for (let targetIndex = 0; targetIndex < targetCount; targetIndex++) {
        if (shouldCancel) break;

        const targetConfig = targetConfigs[targetIndex];
        const targetKey = sanitizeTargetKey(targetConfig.key);
        const targetLabel = targetConfig.label || DEFAULT_TARGET_LABEL;
        const targetBasePath = path.join(exportPath, `${basename}_${targetKey}`);

        if (fs.existsSync(targetBasePath)) {
          fs.rmSync(targetBasePath, { recursive: true, force: true });
        }
        fs.mkdirSync(targetBasePath, { recursive: true });

        if (hasWebContents()) {
          sendIpc('progress', {
            overallPct: Math.round((completedRuns / totalRuns) * 100),
            fileIndex,
            roundIndex: 0,
            totalRuns,
            completedRuns,
            currentFile: basename,
            targetIndex,
            targetCount,
            targetLabel,
            status: 'starting'
          });
        }

        // Iterate through each round for this file/target combination
        for (let round = 1; round <= rounds; round++) {
          if (shouldCancel) break;

          try {
            await runSingleJob(
              jmeterPath,
              targetBasePath,
              filePath,
              basename,
              {
                thread: targetConfig.thread,
                rampup: targetConfig.rampup,
                loop: targetConfig.loop
              },
              round,
              fileIndex,
              round - 1, // roundIndex is 0-based count of completed rounds
              targetConfig,
              targetIndex
            );

            completedRuns++;

            // Send progress update
            if (hasWebContents()) {
              sendIpc('progress', {
                overallPct: Math.round((completedRuns / totalRuns) * 100),
                fileIndex,
                roundIndex: round,
                totalRuns,
                completedRuns,
                currentFile: basename,
                status: 'running',
                targetIndex,
                targetCount,
                targetLabel
              });
            }

          } catch (error) {
            // Send error notification but continue with next round
            flushQueuedLogs();
            sendIpc('job-error', {
              fileIndex,
              roundIndex: round - 1,
              targetIndex,
              targetLabel,
              error: error.message,
              file: basename,
              round
            });

            completedRuns++; // Still count as completed (failed)
          }
        }

        if (shouldCancel) break;

        if (captureDisabled) {
          if (targetIndex === 0 && hasWebContents()) {
            queueLog({
              fileIndex,
              text: `Report analysis skipped for ${basename} (report capture disabled).\n`,
              isStdErr: false,
              timestamp: new Date().toISOString()
            });
          }

          if (hasWebContents()) {
            sendIpc('progress', {
              overallPct: Math.round((completedRuns / totalRuns) * 100),
              fileIndex,
              roundIndex: rounds,
              totalRuns,
              completedRuns,
              currentFile: basename,
              status: 'completed',
              targetIndex,
              targetCount,
              targetLabel
            });
          }
          continue;
        }

        try {
          const targetThreshold = Number.isFinite(Number(targetConfig.threshold))
            ? Number(targetConfig.threshold)
            : baseThreshold;

          if (hasWebContents()) {
            queueLog({
              fileIndex,
              text: `Analyzing reports for ${basename} [${targetLabel}] using selection "${selectionMode}" (threshold ${targetThreshold} ms)...\n`,
              isStdErr: false,
              timestamp: new Date().toISOString()
            });
          }

          const reportResult = await captureReport({
            location: targetBasePath,
            output: targetBasePath,
            type: selectionMode,
            threshold: targetThreshold,
            targetLabel
          });

          if (reportResult.screenshotError) {
            const screenshotCaptureError = buildCaptureErrorSummary({
              file: basename,
              targetLabel,
              targetKey: targetConfig.key || fileConfig.target || 'custom',
              stage: 'screenshot',
              error: reportResult.screenshotError
            });
            captureErrors.push(screenshotCaptureError);

            if (hasWebContents()) {
              queueLog({
                fileIndex,
                text: `capture-jmeter-report screenshot failed for ${basename} [${targetLabel}]: ${screenshotCaptureError.message}\n`,
                isStdErr: true,
                timestamp: new Date().toISOString()
              });
            }
          }

          analysisResults.push({
            file: basename,
            target: targetConfig.key || fileConfig.target || 'custom',
            targetLabel,
            outputDir: reportResult.outputDir,
            selectionMode: reportResult.selectionMode,
            threshold: reportResult.threshold,
            reportCount: Array.isArray(reportResult.reports) ? reportResult.reports.length : 0
          });

          if (hasWebContents()) {
            queueLog({
              fileIndex,
              text: `Report analysis complete for ${basename} [${targetLabel}] (threshold ${targetThreshold} ms). Results saved to ${reportResult.outputDir}\n`,
              isStdErr: false,
              timestamp: new Date().toISOString()
            });
          }

          if (hasWebContents()) {
            sendIpc('progress', {
              overallPct: Math.round((completedRuns / totalRuns) * 100),
              fileIndex,
              roundIndex: rounds,
              totalRuns,
              completedRuns,
              currentFile: basename,
              status: 'completed',
              targetIndex,
              targetCount,
              targetLabel
            });
          }
        } catch (analysisError) {
          const captureError = buildCaptureErrorSummary({
            file: basename,
            targetLabel,
            targetKey: targetConfig.key || fileConfig.target || 'custom',
            stage: 'analysis',
            error: analysisError
          });
          captureErrors.push(captureError);

          if (hasWebContents()) {
            queueLog({
              fileIndex,
              text: `capture-jmeter-report analysis failed for ${basename} [${targetLabel}]: ${captureError.message}\n`,
              isStdErr: true,
              timestamp: new Date().toISOString()
            });
            sendIpc('progress', {
              overallPct: Math.round((completedRuns / totalRuns) * 100),
              fileIndex,
              roundIndex: rounds,
              totalRuns,
              completedRuns,
              currentFile: basename,
              status: 'error',
              targetIndex,
              targetCount,
              targetLabel
            });
          }
        }
      }

      if (shouldCancel) {
        break;
      }
    }

    // Send completion notification
    flushQueuedLogs();
    sendIpc('job-complete', {
      success: !shouldCancel && captureErrors.length === 0,
      totalRuns,
      completedRuns,
      cancelled: shouldCancel,
      reports: analysisResults,
      captureErrors
    });

  } catch (error) {
    flushQueuedLogs();
    sendIpc('job-error', {
      error: error.message,
      fatal: true
    });
  } finally {
    flushQueuedLogs();
    isRunning = false;
    currentJob = null;
    shouldCancel = false;
  }
}

/**
 * Run a single JMeter job
 * @param {string} jmeterPath - Path to JMeter executable
 * @param {string} exportPath - Target-specific base export directory
 * @param {string} filePath - Path to .jmx file
 * @param {string} basename - Base name of file (without extension)
 * @param {Object} params - JMeter parameters {thread, rampup, loop}
 * @param {number} round - Current round number
 * @param {number} fileIndex - Current file index
 * @param {number} roundIndex - Current round index (0-based)
 * @param {Object} targetConfig - Target configuration { key, label, thread, rampup, loop }
 * @param {number} targetIndex - Current target index (0-based)
 */
function runSingleJob(jmeterPath, exportPath, filePath, basename, params, round, fileIndex, roundIndex, targetConfig = null, targetIndex = 0) {
  return new Promise((resolve, reject) => {
    if (shouldCancel) {
      reject(new Error('Job cancelled'));
      return;
    }

    const { thread, rampup, loop } = params;
    const targetKey = sanitizeTargetKey(targetConfig?.key);
    const targetLabel = targetConfig?.label || DEFAULT_TARGET_LABEL;
    const targetSuffix = targetConfig ? `_${targetKey}` : '';

    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }
    
    // Prepare output paths
    const runStamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const basePrefix = `${basename}${targetSuffix}_R${round}`;
    const outDirName = `${basePrefix}_${runStamp}`;
    const outLogName = `${basePrefix}_${runStamp}.log`;
    const outLog = path.join(exportPath, outLogName);
    const outDir = path.join(exportPath, outDirName);
    const jmeterLogPath = path.join(exportPath, `jmeter-${runStamp}.log`);
    const jmeterTempDir = path.join(exportPath, `temp-${runStamp}`);

    try {
      // Ensure fresh directories for this run
      fs.mkdirSync(outDir, { recursive: true });
      fs.mkdirSync(jmeterTempDir, { recursive: true });
      const preparedTestPlan = prepareJmxTestPlan(filePath, jmeterTempDir, runStamp);

      // Prepare JMeter command arguments
      const args = [
        '-n',                           // Non-GUI mode
        '-t', preparedTestPlan.planPath, // Test plan file
        `-Jthread=${thread}`,           // Thread count parameter
        `-Jrampup=${rampup}`,          // Ramp-up period parameter
        `-Jloop=${loop}`,              // Loop count parameter
        '-l', outLog,                  // Results log file
        '-j', jmeterLogPath,           // Writable location for JMeter log
        `-Jjmeter.reportgenerator.temp_dir=${jmeterTempDir}`, // Writable temp dir for report generator
        '-e',                          // Generate report dashboard
        '-o', outDir                   // Output folder for report dashboard
      ];

      // Send log message about starting
      queueLog({
        fileIndex,
        roundIndex,
        text: `Starting ${basename} [${targetLabel}] Round ${round} with ${thread} threads, ${rampup}s ramp-up, ${loop} loops...\n`,
        isStdErr: false,
        timestamp: new Date().toISOString()
      });

      if (preparedTestPlan.normalizedLegacyMySqlDriver) {
        queueLog({
          fileIndex,
          roundIndex,
          text: `Normalized ${preparedTestPlan.replacementCount} deprecated MySQL JDBC driver reference(s) in a temporary test plan copy: ${LEGACY_MYSQL_DRIVER} -> ${MODERN_MYSQL_DRIVER}\n`,
          isStdErr: false,
          timestamp: new Date().toISOString()
        });
      }

      // Determine the correct JMeter executable for the platform
      let actualJMeterPath = jmeterPath;
      const isWindows = process.platform === 'win32';
      
      // On Windows, append .bat if not already present
      if (isWindows && !jmeterPath.toLowerCase().endsWith('.bat')) {
        actualJMeterPath = jmeterPath + '.bat';
      }
      
      // Set JMETER_HOME environment variable
      // Extract JMeter home directory (parent of bin directory)
      const jmeterBinDir = path.dirname(actualJMeterPath);
      const jmeterHome = path.dirname(jmeterBinDir);
      
      const processEnv = {
        ...process.env,
        JMETER_HOME: jmeterHome
      };
      
      // Spawn JMeter process
      currentJob = spawn(actualJMeterPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, pipe stdout and stderr
        env: processEnv,
        cwd: exportPath,                 // Force a writable working directory
        shell: isWindows                 // Use shell on Windows to handle .bat files
      });

      let hasExited = false;

      // Handle stdout
      currentJob.stdout.on('data', (data) => {
        const text = data.toString();
        queueLog({
          fileIndex,
          roundIndex,
          text: `[${targetLabel}] ${text}`,
          isStdErr: false,
          timestamp: new Date().toISOString()
        });
      });

      // Handle stderr
      currentJob.stderr.on('data', (data) => {
        const text = data.toString();
        queueLog({
          fileIndex,
          roundIndex,
          text: `[${targetLabel}] ${text}`,
          isStdErr: true,
          timestamp: new Date().toISOString()
        });
      });

      // Handle process exit
      currentJob.on('close', (code, signal) => {
        if (hasExited) return;
        hasExited = true;

        const logMsg = signal 
          ? `Process [${targetLabel}] terminated by signal ${signal}\n`
          : `Process [${targetLabel}] exited with code ${code}\n`;

        queueLog({
          fileIndex,
          roundIndex,
          text: logMsg,
          isStdErr: code !== 0,
          timestamp: new Date().toISOString()
        });

        if (code === 0) {
          try {
            fs.rmSync(jmeterTempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            queueLog({
              fileIndex,
              roundIndex,
              text: `Warning: Unable to clean temp directory ${jmeterTempDir}: ${cleanupError.message}\n`,
              isStdErr: true,
              timestamp: new Date().toISOString()
            });
          }
          flushQueuedLogs();
          resolve();
        } else {
          flushQueuedLogs();
          reject(new Error(`JMeter process failed with exit code ${code}`));
        }
      });

      // Handle process errors
      currentJob.on('error', (error) => {
        if (hasExited) return;
        hasExited = true;

        queueLog({
          fileIndex,
          roundIndex,
          text: `Process [${targetLabel}] error: ${error.message}\n`,
          isStdErr: true,
          timestamp: new Date().toISOString()
        });

        flushQueuedLogs();
        reject(error);
      });

      // Handle cancellation
      if (shouldCancel) {
        currentJob.kill('SIGTERM');
        setTimeout(() => {
          if (currentJob && !currentJob.killed) {
            currentJob.kill('SIGKILL');
          }
        }, 5000); // Force kill after 5 seconds
      }

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Cancel the currently running job
 */
function cancelRun() {
  shouldCancel = true;
  
  if (currentJob && !currentJob.killed) {
    // Try graceful termination first
    currentJob.kill('SIGTERM');
    
    // Force kill after 5 seconds if process doesn't exit
    setTimeout(() => {
      if (currentJob && !currentJob.killed) {
        currentJob.kill('SIGKILL');
        queueLog({
          text: 'Force killed JMeter process after timeout\n',
          isStdErr: true,
          timestamp: new Date().toISOString()
        });
      }
    }, 5000);
  }

  // Send cancellation notification
  if (hasWebContents()) {
    flushQueuedLogs();
    sendIpc('job-complete', {
      success: false,
      cancelled: true,
      message: 'Jobs cancelled by user'
    });
  }
}

/**
 * Check if jobs are currently running
 * @returns {boolean} True if jobs are running
 */
function isJobRunning() {
  return isRunning;
}

module.exports = {
  init,
  runJobs,
  cancelRun,
  isJobRunning
};
