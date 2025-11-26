const Store = require('electron-store');

// Initialize electron-store with default values
const store = new Store({
  defaults: {
    jmeterPath: '',     // Last selected JMeter executable path
    exportPath: '',     // Last selected export directory path
    reportSelectionMode: 'bi', // Default report capture mode (best individual)
    windowBounds: {     // Optional: remember window size/position
      width: 1200,
      height: 800,
      x: undefined,
      y: undefined
    }
  }
});

/**
 * Get all settings or return defaults if store is empty
 * @returns {Object} Settings object with jmeterPath, exportPath, etc.
 */
function getSettings() {
  return {
    jmeterPath: store.get('jmeterPath', ''),
    exportPath: store.get('exportPath', ''),
    reportSelectionMode: store.get('reportSelectionMode', 'bi'),
    windowBounds: store.get('windowBounds', {
      width: 1200,
      height: 800,
      x: undefined,
      y: undefined
    })
  };
}

/**
 * Set a specific setting value
 * @param {string} key - Setting key (e.g., 'jmeterPath', 'exportPath')
 * @param {any} value - Setting value
 */
function setSetting(key, value) {
  store.set(key, value);
}

/**
 * Get a specific setting value
 * @param {string} key - Setting key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Setting value
 */
function getSetting(key, defaultValue = null) {
  return store.get(key, defaultValue);
}

/**
 * Clear all settings (reset to defaults)
 */
function clearSettings() {
  store.clear();
}

/**
 * Check if a setting exists
 * @param {string} key - Setting key
 * @returns {boolean} True if setting exists
 */
function hasSetting(key) {
  return store.has(key);
}

module.exports = {
  getSettings,
  setSetting,
  getSetting,
  clearSettings,
  hasSetting
};
