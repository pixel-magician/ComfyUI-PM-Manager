// PM Sidebar Button Helper
// 提供统一的侧边栏按钮创建和更新功能

import { t, onLocaleChange } from "./i18n.js";

// 创建侧边栏按钮
export function createSidebarButton(options) {
    const {
        id,
        labelKey,
        defaultLabel,
        iconSvg,
        onClick,
        insertAfter = null
    } = options;

    const insertButton = () => {
        // 移除已存在的按钮
        const existingTab = document.getElementById(id);
        if (existingTab) {
            existingTab.remove();
        }

        const sidebarGroups = document.querySelectorAll('.sidebar-item-group');
        if (sidebarGroups.length === 0) {
            return false;
        }

        const firstGroup = sidebarGroups[0];

        // 创建按钮容器 - 使用 ComfyUI 的按钮结构
        const pmButton = document.createElement('button');
        pmButton.id = id;
        pmButton.className = 'side-bar-button relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 hover:bg-[var(--comfy-menu-bg-hover)] p-2 h-auto min-w-[40px] min-h-[40px] border-none w-full';
        pmButton.style.cssText = 'background: transparent; color: var(--fg);';

        // 创建内容容器
        const contentDiv = document.createElement('div');
        contentDiv.className = 'side-bar-button-content flex flex-col items-center justify-center gap-1';

        // 创建图标
        const iconContainer = document.createElement('div');
        iconContainer.className = 'side-bar-button-icon-container flex items-center justify-center';
        iconContainer.style.cssText = 'width: 24px; height: 24px;';
        iconContainer.innerHTML = iconSvg;

        // 创建标签
        const labelSpan = document.createElement('span');
        labelSpan.className = 'side-bar-button-label text-xs';
        labelSpan.textContent = t(labelKey, defaultLabel);

        contentDiv.appendChild(iconContainer);
        contentDiv.appendChild(labelSpan);
        pmButton.appendChild(contentDiv);

        // 绑定点击事件
        pmButton.onclick = onClick;

        // 插入按钮
        if (insertAfter) {
            const afterElement = typeof insertAfter === 'function' ? insertAfter() : document.getElementById(insertAfter);
            if (afterElement && afterElement.nextSibling) {
                firstGroup.insertBefore(pmButton, afterElement.nextSibling);
            } else if (afterElement) {
                firstGroup.appendChild(pmButton);
            } else {
                firstGroup.appendChild(pmButton);
            }
        } else {
            firstGroup.appendChild(pmButton);
        }

        return true;
    };

    // 监听语言变化
    const unsubscribe = onLocaleChange(() => {
        const button = document.getElementById(id);
        if (button) {
            const label = button.querySelector('.side-bar-button-label');
            if (label) {
                label.textContent = t(labelKey, defaultLabel);
            }
        }
    });

    return {
        insert: insertButton,
        unsubscribe
    };
}

// 创建分隔线
export function createSidebarDivider() {
    const divider = document.createElement('div');
    divider.className = 'sidebar-divider';
    divider.style.cssText = 'height: 1px; background-color: var(--border-color); margin: 8px 16px; width: calc(100% - 32px); opacity: 0.5;';
    return divider;
}
