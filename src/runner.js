const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

  isRunning = true;
  shouldCancel = false;
  
  // Calculate total number of runs
  const totalRuns = filesConfig.reduce((sum, config) => sum + config.rounds, 0);
  let completedRuns = 0;

  try {
    // Iterate through each file
    for (let fileIndex = 0; fileIndex < filesConfig.length; fileIndex++) {
      if (shouldCancel) break;

      const fileConfig = filesConfig[fileIndex];
      const { path: filePath, thread, rampup, loop, rounds } = fileConfig;
      const basename = path.basename(filePath, '.jmx');

      // Send file start notification
      webContents.send('progress', {
        overallPct: Math.round((completedRuns / totalRuns) * 100),
        fileIndex,
        roundIndex: 0,
        totalRuns,
        completedRuns,
        currentFile: basename,
        status: 'starting'
      });

      // Iterate through each round for this file
      for (let round = 1; round <= rounds; round++) {
        if (shouldCancel) break;

        try {
          await runSingleJob(
            jmeterPath,
            exportPath,
            filePath,
            basename,
            { thread, rampup, loop },
            round,
            fileIndex,
            round - 1, // roundIndex is 0-based
            totalRuns,
            completedRuns
          );

          completedRuns++;

          // Send progress update
          webContents.send('progress', {
            overallPct: Math.round((completedRuns / totalRuns) * 100),
            fileIndex,
            roundIndex: round,
            totalRuns,
            completedRuns,
            currentFile: basename,
            status: 'running'
          });

        } catch (error) {
          // Send error notification but continue with next round
          webContents.send('job-error', {
            fileIndex,
            roundIndex: round - 1,
            error: error.message,
            file: basename,
            round
          });

          completedRuns++; // Still count as completed (failed)
        }
      }
    }

    // Send completion notification
    webContents.send('job-complete', {
      success: !shouldCancel,
      totalRuns,
      completedRuns,
      cancelled: shouldCancel
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
 * @param {string} exportPath - Base export directory
 * @param {string} filePath - Path to .jmx file
 * @param {string} basename - Base name of file (without extension)
 * @param {Object} params - JMeter parameters {thread, rampup, loop}
 * @param {number} round - Current round number
 * @param {number} fileIndex - Current file index
 * @param {number} roundIndex - Current round index (0-based)
 * @param {number} totalRuns - Total number of runs
 * @param {number} completedRuns - Number of completed runs
 */
function runSingleJob(jmeterPath, exportPath, filePath, basename, params, round, fileIndex, roundIndex, totalRuns, completedRuns) {
  return new Promise((resolve, reject) => {
    if (shouldCancel) {
      reject(new Error('Job cancelled'));
      return;
    }

    const { thread, rampup, loop } = params;
    
    // Prepare output paths
    const outLog = path.join(exportPath, `${basename}_R${round}.log`);
    const outDir = path.join(exportPath, `${basename}_R${round}`);

    try {
      // Clean/create output directory
      if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outDir, { recursive: true });

      // Prepare JMeter command arguments
      const args = [
        '-n',                           // Non-GUI mode
        '-t', filePath,                 // Test plan file
        `-Jthread=${thread}`,           // Thread count parameter
        `-Jrampup=${rampup}`,          // Ramp-up period parameter
        `-Jloop=${loop}`,              // Loop count parameter
        '-l', outLog,                  // Results log file
        '-e',                          // Generate report dashboard
        '-o', outDir                   // Output folder for report dashboard
      ];

      // Send log message about starting
      webContents.send('log', {
        fileIndex,
        roundIndex,
        text: `Starting ${basename} Round ${round} with ${thread} threads, ${rampup}s ramp-up, ${loop} loops...\n`,
        isStdErr: false,
        timestamp: new Date().toISOString()
      });

      // Spawn JMeter process
      currentJob = spawn(jmeterPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, pipe stdout and stderr
        env: process.env
      });

      let hasExited = false;

      // Handle stdout
      currentJob.stdout.on('data', (data) => {
        const text = data.toString();
        webContents.send('log', {
          fileIndex,
          roundIndex,
          text,
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
          text,
          isStdErr: true,
          timestamp: new Date().toISOString()
        });
      });

      // Handle process exit
      currentJob.on('close', (code, signal) => {
        if (hasExited) return;
        hasExited = true;

        const logMsg = signal 
          ? `Process terminated by signal ${signal}\n`
          : `Process exited with code ${code}\n`;

        webContents.send('log', {
          fileIndex,
          roundIndex,
          text: logMsg,
          isStdErr: code !== 0,
          timestamp: new Date().toISOString()
        });

        if (code === 0) {
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
          text: `Process error: ${error.message}\n`,
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