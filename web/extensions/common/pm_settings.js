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

    console.log('[PM Manager] Settings registered');
}

// 更新设置 UI 显示
function updateSettingsUI(app) {
    if (!settingsDefinition) return;

    // 更新设置定义
    settingsDefinition.name = t('pmManagerLanguage', 'PM Manager Language');
    settingsDefinition.tooltip = t('pmManagerLanguageDesc', 'Select the display language for PM Manager plugin');
    settingsDefinition.category = ['PM Manager', t('language', 'Language')];
    settingsDefinition.options = [
        { value: 'auto', text: t('autoFollowComfyUI', 'Auto (Follow ComfyUI)') },
        { value: 'en', text: t('english', 'English') },
        { value: 'zh', text: t('simplifiedChinese', 'Simplified Chinese') }
    ];

    // 触发设置面板刷新（如果 ComfyUI 支持）
    if (app.ui.settings.settingsLookup && app.ui.settings.settingsLookup['PMManager.Locale']) {
        const setting = app.ui.settings.settingsLookup['PMManager.Locale'];
        setting.name = settingsDefinition.name;
        setting.tooltip = settingsDefinition.tooltip;
        setting.category = settingsDefinition.category;
        setting.options = settingsDefinition.options;

        // 尝试刷新设置面板
        const settingsElement = document.querySelector('#comfy-settings');
        if (settingsElement) {
            // 找到对应的设置项并更新文本
            const settingRow = settingsElement.querySelector('[data-setting-id="PMManager.Locale"]');
            if (settingRow) {
                const label = settingRow.querySelector('.setting-label');
                if (label) {
                    label.textContent = settingsDefinition.name;
                    if (settingsDefinition.tooltip) {
                        label.title = settingsDefinition.tooltip;
                    }
                }
                // 更新选项文本
                const select = settingRow.querySelector('select');
                if (select) {
                    const options = select.querySelectorAll('option');
                    settingsDefinition.options.forEach((opt, index) => {
                        if (options[index]) {
                            options[index].textContent = opt.text;
                        }
                    });
                }
            }
        }
    }
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
