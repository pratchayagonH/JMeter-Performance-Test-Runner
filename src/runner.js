const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { captureReport } = require('capture-jmeter-report');

const DEFAULT_SELECTION_MODE = 'b';
const DEFAULT_THRESHOLD = 1000;
const DEFAULT_TARGET_LABEL = 'Custom';

function sanitizeTargetKey(targetKey) {
  return String(targetKey || 'default')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase() || 'default';
}

let webContents = null;
let currentJob = null;
let isRunning = false;
let shouldCancel = false;

/**
 * Initialize the runner with webContents for progress updates
 * @param {Object} mainWebContents - Main window's webContents for IPC
 */
function init(mainWebContents) {
  webContents = mainWebContents;
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

        if (webContents) {
          webContents.send('progress', {
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
            if (webContents) {
              webContents.send('progress', {
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
            webContents.send('job-error', {
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
          if (targetIndex === 0 && webContents) {
            webContents.send('log', {
              fileIndex,
              text: `Report analysis skipped for ${basename} (report capture disabled).\n`,
              isStdErr: false,
              timestamp: new Date().toISOString()
            });
          }

          if (webContents) {
            webContents.send('progress', {
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

          if (webContents) {
            webContents.send('log', {
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
            threshold: targetThreshold
          });

          analysisResults.push({
            file: basename,
            target: targetConfig.key || fileConfig.target || 'custom',
            targetLabel,
            outputDir: reportResult.outputDir,
            selectionMode: reportResult.selectionMode,
            threshold: reportResult.threshold,
            reportCount: Array.isArray(reportResult.reports) ? reportResult.reports.length : 0
          });

          if (webContents) {
            webContents.send('log', {
              fileIndex,
              text: `Report analysis complete for ${basename} [${targetLabel}] (threshold ${targetThreshold} ms). Results saved to ${reportResult.outputDir}\n`,
              isStdErr: false,
              timestamp: new Date().toISOString()
            });
          }

          if (webContents) {
            webContents.send('progress', {
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
          if (webContents) {
            webContents.send('log', {
              fileIndex,
              text: `Report analysis failed for ${basename} [${targetLabel}]: ${analysisError.message}\n`,
              isStdErr: true,
              timestamp: new Date().toISOString()
            });
            webContents.send('progress', {
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
    webContents.send('job-complete', {
      success: !shouldCancel,
      totalRuns,
      completedRuns,
      cancelled: shouldCancel,
      reports: analysisResults
    });

  } catch (error) {
    webContents.send('job-error', {
      error: error.message,
      fatal: true
    });
  } finally {
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

      // Prepare JMeter command arguments
      const args = [
        '-n',                           // Non-GUI mode
        '-t', filePath,                 // Test plan file
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
      webContents.send('log', {
        fileIndex,
        roundIndex,
        text: `Starting ${basename} [${targetLabel}] Round ${round} with ${thread} threads, ${rampup}s ramp-up, ${loop} loops...\n`,
        isStdErr: false,
        timestamp: new Date().toISOString()
      });

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
        webContents.send('log', {
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
        webContents.send('log', {
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

        webContents.send('log', {
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
            webContents.send('log', {
              fileIndex,
              roundIndex,
              text: `Warning: Unable to clean temp directory ${jmeterTempDir}: ${cleanupError.message}\n`,
              isStdErr: true,
              timestamp: new Date().toISOString()
            });
          }
          resolve();
        } else {
          reject(new Error(`JMeter process failed with exit code ${code}`));
        }
      });

      // Handle process errors
      currentJob.on('error', (error) => {
        if (hasExited) return;
        hasExited = true;

        webContents.send('log', {
          fileIndex,
          roundIndex,
          text: `Process [${targetLabel}] error: ${error.message}\n`,
          isStdErr: true,
          timestamp: new Date().toISOString()
        });

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
        webContents.send('log', {
          text: 'Force killed JMeter process after timeout\n',
          isStdErr: true,
          timestamp: new Date().toISOString()
        });
      }
    }, 5000);
  }

  // Send cancellation notification
  if (webContents) {
    webContents.send('job-complete', {
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
