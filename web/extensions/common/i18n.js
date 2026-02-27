// PM Manager i18n module
import { api } from "/scripts/api.js";
import { registerPMSettings, getEffectiveLocale } from "./pm_settings.js";

let translations = {};
let currentLocale = 'en';
let isLoaded = false;
let loadPromise = null;
let localeChangeListeners = [];

// Wait for ComfyUI app to be ready
async function waitForComfyApp() {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.app && window.app.ui && window.app.ui.settings) {
            resolve(window.app);
            return;
        }

        // Poll for app availability
        const checkInterval = setInterval(() => {
            if (typeof window !== 'undefined' && window.app && window.app.ui && window.app.ui.settings) {
                clearInterval(checkInterval);
                resolve(window.app);
            }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve(null);
        }, 5000);
    });
}

// Get current locale from ComfyUI or PM Manager settings
async function getCurrentLocale() {
    // Wait for ComfyUI to be ready
    const app = await waitForComfyApp();

    // Method 1: Check PM Manager's own locale setting
    if (app && app.ui && app.ui.settings) {
        const pmLocale = app.ui.settings.getSettingValue('PMManager.Locale');
        if (pmLocale && pmLocale !== 'auto') {
            return pmLocale;
        }
    }

    // Method 2: Check ComfyUI's locale setting
    if (app && app.ui && app.ui.settings) {
        const locale = app.ui.settings.getSettingValue('Comfy.Locale');
        if (locale) {
            return locale;
        }
    }

    // Method 3: Check localStorage
    const comfySettings = localStorage.getItem('Comfy.Settings');
    if (comfySettings) {
        try {
            const settings = JSON.parse(comfySettings);
            if (settings['Comfy.Locale']) {
                return settings['Comfy.Locale'];
            }
        } catch (e) {
            console.warn('[PM Manager] Failed to parse Comfy.Settings:', e);
        }
    }

    // Method 4: Check document lang
    if (document.documentElement.lang) {
        return document.documentElement.lang;
    }

    return 'en';
}

// Load translations from ComfyUI i18n API
async function loadTranslations(targetLocale = null) {
    if (isLoaded && !targetLocale) return Promise.resolve();
    if (loadPromise && !targetLocale) return loadPromise;

    const doLoad = async () => {
        try {
            // Add cache-busting parameter to avoid browser cache
            const cacheBuster = `?_=${Date.now()}`;
            const response = await api.fetchApi('/i18n' + cacheBuster, {
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await response.json();

            // Get current locale (wait for ComfyUI to be ready)
            const locale = targetLocale || await getCurrentLocale();
            currentLocale = locale;

            // Extract PM Manager translations
            if (data && data[locale]) {
                translations = data[locale];
                console.log('[PM Manager] Loaded translations for locale:', locale, 'Keys:', Object.keys(translations).slice(0, 20));
            } else {
                console.warn('[PM Manager] No translations found for locale:', locale);
                // Fallback to English if current locale not found
                if (data && data['en']) {
                    translations = data['en'];
                }
            }

            isLoaded = true;

            // Notify listeners
            localeChangeListeners.forEach(listener => {
                try {
                    listener(locale);
                } catch (e) {
                    console.error('[PM Manager] Error in locale change listener:', e);
                }
            });

            return translations;
        } catch (error) {
            console.error('[PM Manager] Failed to load translations:', error);
        }
    };

    if (!targetLocale) {
        loadPromise = doLoad();
        return loadPromise;
    }
    return doLoad();
}

// Update all PM Manager button widgets in ComfyUI nodes
function updateNodeButtonWidgets() {
    if (typeof window !== 'undefined' && window.app && window.app.graph) {
        window.app.graph._nodes.forEach(node => {
            if (node.widgets) {
                node.widgets.forEach(widget => {
                    if (widget.type === 'button' && widget._pmLabelKey) {
                        const newLabel = t(widget._pmLabelKey, widget._pmLabelDefault);
                        widget.name = newLabel;
                        widget.label = newLabel;
                    }
                });
            }
        });
        // Trigger canvas redraw
        window.app.graph.setDirtyCanvas(true, true);
    }
}

// Reload translations for a specific locale
export async function reloadTranslations(locale) {
    currentLocale = locale;
    isLoaded = false;
    loadPromise = null;
    await loadTranslations(locale);

    // Update all node button widgets
    updateNodeButtonWidgets();
}

// Add locale change listener
export function onLocaleChange(listener) {
    localeChangeListeners.push(listener);
    return () => {
        const index = localeChangeListeners.indexOf(listener);
        if (index > -1) {
            localeChangeListeners.splice(index, 1);
        }
    };
}

// Get translation by key
// ComfyUI flattens the translation files, so keys are directly in translations object
export function t(key, defaultValue = '') {
    // Try to get directly from translations (ComfyUI flattens the structure)
    if (translations[key]) {
        return translations[key];
    }

    // Debug: log missing translation keys
    if (key === 'filter' || key === 'all' || key === 'image' || key === 'audio' || key === 'video' || key === 'folder') {
        console.log('[PM Manager] Translation not found for key:', key, 'Current locale:', currentLocale, 'Available keys count:', Object.keys(translations).length);
    }

    // Return default value or key
    return defaultValue || key;
}

// Async version of t() for when we need to ensure translations are loaded
export async function tAsync(key, defaultValue = '') {
    await loadTranslations();
    return t(key, defaultValue);
}

// Get node definition translation
export function getNodeTranslation(nodeId, field = 'display_name') {
    // Node definitions are also flattened in ComfyUI
    if (translations[nodeId]) {
        const nodeDef = translations[nodeId];

        if (field === 'display_name') {
            return nodeDef.display_name || nodeId;
        }

        if (field === 'description') {
            return nodeDef.description || '';
        }

        if (field.startsWith('inputs.')) {
            const inputName = field.replace('inputs.', '');
            if (nodeDef.inputs && nodeDef.inputs[inputName]) {
                return nodeDef.inputs[inputName].name || inputName;
            }
        }

        if (field.startsWith('outputs.')) {
            const outputIdx = field.replace('outputs.', '');
            if (nodeDef.outputs && nodeDef.outputs[outputIdx]) {
                return nodeDef.outputs[outputIdx].name || `output_${outputIdx}`;
            }
        }
    }

    return nodeId;
}

// Setup locale change monitoring
async function setupLocaleMonitoring() {
    const app = await waitForComfyApp();
    if (!app || !app.ui || !app.ui.settings) {
        console.warn('[PM Manager] Cannot setup locale monitoring - app not ready');
        return;
    }

    // Poll for locale changes (only when PMManager.Locale is 'auto')
    let lastKnownComfyLocale = app.ui.settings.getSettingValue('Comfy.Locale') || 'en';
    let lastKnownPMLocale = app.ui.settings.getSettingValue('PMManager.Locale') || 'auto';

    setInterval(() => {
        const pmLocale = app.ui.settings.getSettingValue('PMManager.Locale') || 'auto';
        const comfyLocale = app.ui.settings.getSettingValue('Comfy.Locale') || 'en';

        // Check if PM Manager locale setting changed
        if (pmLocale !== lastKnownPMLocale) {
            lastKnownPMLocale = pmLocale;
            if (pmLocale === 'auto') {
                reloadTranslations(comfyLocale);
            } else {
                reloadTranslations(pmLocale);
            }
            return;
        }

        // Only check ComfyUI locale if PM Manager is set to 'auto'
        if (pmLocale === 'auto' && comfyLocale !== lastKnownComfyLocale) {
            lastKnownComfyLocale = comfyLocale;
            reloadTranslations(comfyLocale);
        }
    }, 1000);
}

// Initialize translations on module load
const initPromise = loadTranslations();

// Register settings and setup monitoring
registerPMSettings();
setupLocaleMonitoring();

// Re-export for convenience
export { loadTranslations, currentLocale, initPromise };
