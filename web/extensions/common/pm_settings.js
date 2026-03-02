// PM Manager Settings
// 注册 ComfyUI 设置选项

import { app } from "/scripts/app.js";
import { reloadTranslations, currentLocale, t, onLocaleChange } from "./i18n.js";

// 等待 ComfyUI 准备好
async function waitForComfyApp() {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.app && window.app.ui && window.app.ui.settings) {
            resolve(window.app);
            return;
        }

        const checkInterval = setInterval(() => {
            if (typeof window !== 'undefined' && window.app && window.app.ui && window.app.ui.settings) {
                clearInterval(checkInterval);
                resolve(window.app);
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkInterval);
            resolve(null);
        }, 5000);
    });
}

// 存储设置定义，用于动态更新
let settingsDefinition = null;
let nodeTimerSettingDefinition = null;

// 注册 PM Manager 设置
export async function registerPMSettings() {
    const app = await waitForComfyApp();
    if (!app || !app.ui || !app.ui.settings) {
        console.warn('[PM Manager] Cannot register settings - app not ready');
        return;
    }

    console.log('[PM Manager] Registering settings...');

    // 创建设置定义
    settingsDefinition = {
        id: 'PMManager.Locale',
        name: t('pmManagerLanguage', 'PM Manager Language'),
        tooltip: t('pmManagerLanguageDesc', 'Select the display language for PM Manager plugin'),
        category: ['PM Manager', t('language', 'Language')],
        type: 'combo',
        options: [
            { value: 'auto', text: t('autoFollowComfyUI', 'Auto (Follow ComfyUI)') },
            { value: 'en', text: t('english', 'English') },
            { value: 'zh', text: t('simplifiedChinese', 'Simplified Chinese') }
        ],
        defaultValue: 'auto',
        onChange: (value) => {
            console.log('[PM Manager] Language setting changed to:', value);
            // 触发重新加载翻译
            if (value !== 'auto') {
                reloadTranslations(value);
            } else {
                // 如果是 auto，跟随 ComfyUI 的语言设置
                const comfyLocale = app.ui.settings.getSettingValue('Comfy.Locale') || 'en';
                reloadTranslations(comfyLocale);
            }
        }
    };

    // 注册语言设置
    app.ui.settings.addSetting(settingsDefinition);

    // 监听语言变化，动态更新设置显示
    onLocaleChange((locale) => {
        updateSettingsUI(app);
    });

    // 创建节点计时器设置定义
    nodeTimerSettingDefinition = {
        id: 'PMManager.ShowNodeTimer',
        name: t('showNodeExecutionTime', 'Show Node Execution Time'),
        tooltip: t('showNodeExecutionTimeDesc', 'Display execution time on nodes'),
        category: ['PM Manager', t('nodeTimer', 'Node Timer')],
        type: 'boolean',
        defaultValue: true
    };

    // 注册节点计时器设置
    app.ui.settings.addSetting(nodeTimerSettingDefinition);

    console.log('[PM Manager] Settings registered');
}

// 更新设置 UI 显示
function updateSettingsUI(app) {
    if (!settingsDefinition) return;

    // 更新语言设置定义
    settingsDefinition.name = t('pmManagerLanguage', 'PM Manager Language');
    settingsDefinition.tooltip = t('pmManagerLanguageDesc', 'Select the display language for PM Manager plugin');
    settingsDefinition.category = ['PM Manager', t('language', 'Language')];
    settingsDefinition.options = [
        { value: 'auto', text: t('autoFollowComfyUI', 'Auto (Follow ComfyUI)') },
        { value: 'en', text: t('english', 'English') },
        { value: 'zh', text: t('simplifiedChinese', 'Simplified Chinese') }
    ];

    // 更新节点计时器设置定义
    if (nodeTimerSettingDefinition) {
        nodeTimerSettingDefinition.name = t('showNodeExecutionTime', 'Show Node Execution Time');
        nodeTimerSettingDefinition.tooltip = t('showNodeExecutionTimeDesc', 'Display execution time on nodes');
        nodeTimerSettingDefinition.category = ['PM Manager', t('nodeTimer', 'Node Timer')];
    }

    // 触发设置面板刷新（如果 ComfyUI 支持）
    if (app.ui.settings.settingsLookup) {
        // 更新语言设置
        const localeSetting = app.ui.settings.settingsLookup['PMManager.Locale'];
        if (localeSetting) {
            localeSetting.name = settingsDefinition.name;
            localeSetting.tooltip = settingsDefinition.tooltip;
            localeSetting.category = settingsDefinition.category;
            localeSetting.options = settingsDefinition.options;
        }

        // 更新节点计时器设置
        const timerSetting = app.ui.settings.settingsLookup['PMManager.ShowNodeTimer'];
        if (timerSetting && nodeTimerSettingDefinition) {
            timerSetting.name = nodeTimerSettingDefinition.name;
            timerSetting.tooltip = nodeTimerSettingDefinition.tooltip;
            timerSetting.category = nodeTimerSettingDefinition.category;
        }

        // 尝试刷新设置面板
        refreshSettingsPanel();
    }
}

// 刷新设置面板显示
function refreshSettingsPanel() {
    const settingsElement = document.querySelector('#comfy-settings');
    if (!settingsElement) return;

    // 更新语言设置显示
    const localeRow = settingsElement.querySelector('[data-setting-id="PMManager.Locale"]');
    if (localeRow) {
        const label = localeRow.querySelector('.setting-label');
        if (label) {
            label.textContent = t('pmManagerLanguage', 'PM Manager Language');
            label.title = t('pmManagerLanguageDesc', 'Select the display language for PM Manager plugin');
        }
        const select = localeRow.querySelector('select');
        if (select) {
            const options = select.querySelectorAll('option');
            const optionTexts = [
                t('autoFollowComfyUI', 'Auto (Follow ComfyUI)'),
                t('english', 'English'),
                t('simplifiedChinese', 'Simplified Chinese')
            ];
            options.forEach((opt, index) => {
                if (optionTexts[index]) {
                    opt.textContent = optionTexts[index];
                }
            });
        }
    }

    // 更新节点计时器设置显示
    const timerRow = settingsElement.querySelector('[data-setting-id="PMManager.ShowNodeTimer"]');
    if (timerRow) {
        const label = timerRow.querySelector('.setting-label');
        if (label) {
            label.textContent = t('showNodeExecutionTime', 'Show Node Execution Time');
            label.title = t('showNodeExecutionTimeDesc', 'Display execution time on nodes');
        }
    }

    // 更新分类标题
    const categoryHeaders = settingsElement.querySelectorAll('.settings-category-header');
    categoryHeaders.forEach(header => {
        const text = header.textContent;
        if (text.includes('Node Timer') || text.includes('节点计时器')) {
            header.textContent = t('nodeTimer', 'Node Timer');
        }
        if (text.includes('Language') || text.includes('语言')) {
            header.textContent = t('language', 'Language');
        }
    });
}

// 获取当前有效的语言设置
export function getEffectiveLocale() {
    if (typeof window === 'undefined' || !window.app || !window.app.ui || !window.app.ui.settings) {
        return 'en';
    }

    const pmLocale = window.app.ui.settings.getSettingValue('PMManager.Locale');

    if (pmLocale && pmLocale !== 'auto') {
        return pmLocale;
    }

    // 跟随 ComfyUI 的语言设置
    return window.app.ui.settings.getSettingValue('Comfy.Locale') || 'en';
}
