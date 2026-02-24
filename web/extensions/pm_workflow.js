import { app } from "/scripts/app.js";

function getComfyUserHeader() {
    try {
        if (window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api) {
            const apiObj = window.comfyAPI.api.api;
            if (apiObj.user) {
                return apiObj.user;
            }
        }
    } catch (e) {
    }
    
    try {
        const user = localStorage.getItem('comfy-user');
        if (user) {
            return user;
        }
    } catch (e) {
    }
    
    return null;
}

function fetchWithUser(url, options = {}) {
    const headers = new Headers(options.headers || {});
    
    const comfyUser = getComfyUserHeader();
    if (comfyUser) {
        headers.set('comfy-user', comfyUser);
    }
    
    return fetch(url, {
        ...options,
        headers
    });
}

class PMWorkflowDialog {
    constructor() {
        this.dialog = null;
        this.items = [];
        this.currentPath = '';
        this.contextMenu = null;
        this.currentContextItem = null;
        this.promptDialog = null;
        this.confirmDialog = null;
        this.promptCallback = null;
        this.confirmCallback = null;
        this.init();
    }

    init() {
        this.createContextMenu();
        
        this.dialog = document.createElement('div');
        this.dialog.id = 'pm-workflow-dialog';
        this.dialog.style.cssText = 'position: fixed; inset: 0; z-index: 9999; display: none;';
        this.dialog.innerHTML = `
            <style>
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .pm-dialog-content {
                    animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .pm-overlay {
                    animation: fadeIn 0.2s ease;
                }
                .pm-context-menu {
                    position: fixed;
                    z-index: 10000;
                    min-width: 180px;
                    background: var(--comfy-menu-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                    padding: 4px;
                    display: none;
                }
                .pm-context-menu.show {
                    display: block;
                    animation: fadeIn 0.1s ease;
                }
                .pm-context-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 14px;
                    cursor: pointer;
                    border-radius: 6px;
                    transition: all 0.15s ease;
                    color: var(--fg);
                    font-size: 14px;
                }
                .pm-context-menu-item:hover {
                    background: var(--comfy-input-bg);
                }
                .pm-context-menu-item.danger {
                    color: #ef4444;
                }
                .pm-context-menu-item.danger:hover {
                    background: rgba(239, 68, 68, 0.1);
                }
                .pm-context-menu-divider {
                    height: 1px;
                    background: var(--border-color);
                    margin: 4px 0;
                }
                .pm-context-menu-icon {
                    width: 18px;
                    height: 18px;
                    flex-shrink: 0;
                }
            </style>
            <div class="pm-overlay fixed inset-0 bg-black/60 backdrop-blur-sm" id="pm-workflow-overlay"></div>
            <div class="flex items-center justify-center min-h-screen p-4" style="position: relative; z-index: 1; pointer-events: none;">
                <div class="pm-dialog-content relative bg-gradient-to-br from-[var(--comfy-menu-bg)] to-[var(--comfy-input-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden" style="max-width: 90vw; width: 1500px; max-height: 85vh; pointer-events: auto;">
                    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--comfy-input-bg)]/30 to-transparent">
                        <div class="flex items-center gap-3">
                                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                                </svg>
                            <div>
                                <h2 class="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">PM 工作流管理器</h2>
                                <p class="text-xs text-[var(--fg-light)]">管理和预览您的工作流</p>
                            </div>
                        </div>
                        <button id="pm-workflow-close" class="p-2 hover:bg-[var(--comfy-input-bg)] rounded-xl transition-all duration-300 hover:scale-110 hover:shadow-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="pm-workflow-breadcrumb" class="px-6 py-3 border-b border-[var(--border-color)] flex items-center gap-2 text-sm flex-shrink-0 bg-[var(--comfy-input-bg)]/20">
                    </div>
                    <div class="p-4 overflow-y-auto flex-grow">
                        <div id="pm-workflow-list" class="grid grid-cols-5 gap-4">
                            <div class="text-center py-8 text-[var(--fg-light)]">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.dialog);
        
        const closeBtn = this.dialog.querySelector('#pm-workflow-close');
        const overlay = this.dialog.querySelector('#pm-workflow-overlay');
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });
        overlay.addEventListener('click', () => this.close());
    }

    async loadItems(path = '') {
        try {
            const url = path ? `/pm_workflow/list?path=${encodeURIComponent(path)}` : '/pm_workflow/list';
            const response = await fetchWithUser(url);
            const data = await response.json();
            this.items = data.items || [];
            this.currentPath = data.current_path || '';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            const listEl = this.dialog.querySelector('#pm-workflow-list');
            listEl.innerHTML = '<div class="text-center py-8 text-red-500">加载失败</div>';
        }
    }

    renderBreadcrumb() {
        const breadcrumbEl = this.dialog.querySelector('#pm-workflow-breadcrumb');
        const parts = this.currentPath ? this.currentPath.split(/[/\\]/) : [];
        
        let html = '<div class="flex items-center gap-1">';
        html += `<svg class="w-4 h-4 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
        </svg>`;
        
        if (parts.length > 0) {
            html += `<button class="breadcrumb-item px-3 py-1 rounded-lg hover:bg-[var(--comfy-input-bg)] transition-all duration-200 text-[var(--fg-light)] hover:text-[var(--fg)]" data-path="">根目录</button>`;
            html += `<svg class="w-4 h-4 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>`;
        } else {
            html += `<span class="px-3 py-1 rounded-lg bg-[var(--comfy-input-bg)] text-[var(--fg)] font-medium">根目录</span>`;
        }
        
        let currentPath = '';
        parts.forEach((part, index) => {
            if (part) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (index === parts.length - 1) {
                    html += `<span class="px-3 py-1 rounded-lg bg-[var(--comfy-input-bg)] text-[var(--fg)] font-medium">${part}</span>`;
                } else {
                    html += `<button class="breadcrumb-item px-3 py-1 rounded-lg hover:bg-[var(--comfy-input-bg)] transition-all duration-200 text-[var(--fg-light)] hover:text-[var(--fg)]" data-path="${currentPath}">${part}</button>`;
                    html += `<svg class="w-4 h-4 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>`;
                }
            }
        });
        
        html += '</div>';
        breadcrumbEl.innerHTML = html;
        
        breadcrumbEl.querySelectorAll('.breadcrumb-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.dataset.path;
                this.loadItems(path);
            });
        });
    }

    renderItems() {
        const listEl = this.dialog.querySelector('#pm-workflow-list');
        
        if (this.items.length === 0) {
            listEl.innerHTML = '<div class="col-span-5 text-center py-8 text-[var(--fg-light)]">暂无内容</div>';
        } else {
            listEl.innerHTML = this.items.map((item, index) => {
                const isFolder = item.type === 'folder';
                let previewUrl = '';
                if (item.has_preview) {
                    const pathParts = item.path.split(/[/\\]/);
                    const filename = pathParts.pop();
                    let previewName;
                    if (isFolder) {
                        previewName = '.' + filename + '.png';
                    } else {
                        previewName = '.' + filename.replace(/\.json$/, '') + '.png';
                    }
                    pathParts.push(previewName);
                    const dotPngPath = pathParts.join('/');
                    previewUrl = `/pm_workflow/preview/${encodeURIComponent(dotPngPath)}?t=${Date.now()}`;
                }
                
                return `
                    <div class="card group relative bg-[var(--comfy-menu-bg)] rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1 flex flex-col" data-path="${item.path}" data-type="${item.type}" style="animation: fadeInUp 0.5s ease forwards; animation-delay: ${index * 0.05}s; opacity: 0; border: 1px solid rgba(255,255,255,0.2);">
                        <div class="aspect-square bg-[var(--comfy-input-bg)] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                            ${isFolder && item.has_preview 
                                ? `<div class="w-full h-full relative">
                                    <img src="${previewUrl}" alt="${item.name}" class="w-full h-full object-cover">
                                    <div class="absolute inset-0 bg-black/20"></div>
                                    <div class="absolute top-2 left-2">
                                        <div class="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center" style="box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3);">
                                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                                            </svg>
                                        </div>
                                    </div>
                                </div>`
                                : isFolder 
                                    ? `<div class="w-full h-full flex items-center justify-center">
                                        <svg class="w-16 h-16 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                                        </svg>
                                    </div>`
                                    : item.has_preview 
                                        ? `<img src="${previewUrl}" alt="${item.name}" class="w-full h-full object-cover">`
                                        : `<div class="w-full h-full bg-[var(--comfy-input-bg)] flex items-center justify-center">
                                            <span class="text-[var(--fg-light)] text-sm">暂无预览</span>
                                        </div>`
                            }
                            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div class="w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        ${isFolder 
                                            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'
                                            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>'
                                        }
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center justify-center px-2 flex-shrink-0" style="aspect-ratio: 4/1;">
                            <p class="text-sm font-medium truncate w-full text-center">${item.name}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        listEl.querySelectorAll('.card').forEach((card, index) => {
            card.addEventListener('click', () => {
                const path = card.dataset.path;
                const type = card.dataset.type;
                
                if (type === 'folder') {
                    this.loadItems(path);
                } else {
                    this.loadWorkflow(path);
                }
            });
            
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const item = this.items[index];
                this.showContextMenu(e.clientX, e.clientY, item);
            });
        });
        
        listEl.addEventListener('contextmenu', (e) => {
            if (e.target === listEl || e.target.classList.contains('col-span-5')) {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.clientX, e.clientY, null);
            }
        });
    }

    async loadWorkflow(path) {
        try {
            const response = await fetchWithUser(`/pm_workflow/load/${encodeURIComponent(path)}`);
            const workflowData = await response.json();
            
            if (workflowData) {
                const filename = path.split(/[/\\]/).pop();
                const workflowName = filename.endsWith('.json') ? filename.slice(0, -5) : filename;
                
                workflowData.extra = workflowData.extra || {};
                workflowData.extra.workflow_name = workflowName;
                workflowData.extra.workflow_path = path;
                
                await app.loadGraphData(workflowData, true, true, workflowName);
                
                if (app.graph) {
                    app.graph.extra = app.graph.extra || {};
                    app.graph.extra.workflow_name = workflowName;
                    app.graph.extra.workflow_path = path;
                }
                
                if (app.workflowManager) {
                    app.workflowManager.currentWorkflowName = workflowName;
                }
                
                this.close();
            }
        } catch (error) {
            alert('加载工作流失败');
        }
    }

    async show() {
        this.dialog.style.display = 'block';
        await this.loadItems('');
    }

    close() {
        this.dialog.style.display = 'none';
        this.hideContextMenu();
    }

    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'pm-context-menu';
        this.setupContextMenuEvents();
    }

    updateContextMenu(isItemMenu) {
        if (isItemMenu) {
            this.contextMenu.innerHTML = `
                <div class="pm-context-menu-item" data-action="rename">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    重命名
                </div>
                <div class="pm-context-menu-item" data-action="replace-preview">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    替换预览图
                </div>
                <div class="pm-context-menu-divider"></div>
                <div class="pm-context-menu-item danger" data-action="delete">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    删除
                </div>
            `;
        } else {
            this.contextMenu.innerHTML = `
                <div class="pm-context-menu-item" data-action="new-folder">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                    </svg>
                    新建文件夹
                </div>
                <div class="pm-context-menu-item" data-action="new-workflow">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                    </svg>
                    新建工作流
                </div>
            `;
        }
        
        this.contextMenu.querySelectorAll('.pm-context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
            });
        });
        document.body.appendChild(this.contextMenu);
    }

    createPromptDialog() {
        this.promptDialog = document.createElement('div');
        this.promptDialog.className = 'pm-prompt-dialog fixed inset-0 flex items-center justify-center';
        this.promptDialog.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: none;';
        this.promptDialog.innerHTML = `
            <div class="pm-prompt-overlay fixed inset-0 bg-black/50" style="z-index: 1;"></div>
            <div class="pm-prompt-content relative border border-[var(--border-color)] rounded-xl shadow-2xl p-6 w-full max-w-md" style="z-index: 2; background-color: var(--comfy-menu-bg);">
                <h3 class="text-lg font-bold mb-4 text-[var(--fg)]" id="pm-prompt-title">重命名</h3>
                <p class="text-sm text-[var(--fg-light)] mb-4" id="pm-prompt-message"></p>
                <input type="text" id="pm-prompt-input" class="w-full px-4 py-2 rounded-lg bg-[var(--comfy-input-bg)] border border-[var(--border-color)] text-[var(--fg)] mb-4 focus:outline-none focus:border-purple-500">
                <div class="flex justify-end gap-3">
                    <button id="pm-prompt-cancel" class="px-4 py-2 rounded-lg hover:bg-[var(--comfy-input-bg)] text-[var(--fg-light)] transition-colors">取消</button>
                    <button id="pm-prompt-confirm" class="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.promptDialog);

        const cancelBtn = this.promptDialog.querySelector('#pm-prompt-cancel');
        const confirmBtn = this.promptDialog.querySelector('#pm-prompt-confirm');
        const input = this.promptDialog.querySelector('#pm-prompt-input');

        cancelBtn.addEventListener('click', () => this.hidePromptDialog());
        confirmBtn.addEventListener('click', () => {
            if (this.promptCallback) {
                this.promptCallback(input.value);
            }
            this.hidePromptDialog();
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });
        this.promptDialog.querySelector('.pm-prompt-overlay').addEventListener('click', () => this.hidePromptDialog());
    }

    showPromptDialog(title, message, defaultValue, callback) {
        if (!this.promptDialog) {
            this.createPromptDialog();
        }
        
        this.promptDialog.querySelector('#pm-prompt-title').textContent = title;
        this.promptDialog.querySelector('#pm-prompt-message').textContent = message;
        const input = this.promptDialog.querySelector('#pm-prompt-input');
        input.value = defaultValue || '';
        this.promptCallback = callback;
        this.promptDialog.style.display = 'flex';
        input.focus();
        input.select();
    }

    hidePromptDialog() {
        if (this.promptDialog) {
            this.promptDialog.style.display = 'none';
        }
        this.promptCallback = null;
    }

    createConfirmDialog() {
        this.confirmDialog = document.createElement('div');
        this.confirmDialog.className = 'pm-confirm-dialog fixed inset-0 flex items-center justify-center';
        this.confirmDialog.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: none;';
        this.confirmDialog.innerHTML = `
            <div class="pm-confirm-overlay fixed inset-0 bg-black/50" style="z-index: 1;"></div>
            <div class="pm-confirm-content relative border border-[var(--border-color)] rounded-xl shadow-2xl p-6 w-full max-w-md" style="z-index: 2; background-color: var(--comfy-menu-bg);">
                <h3 class="text-lg font-bold mb-4 text-[var(--fg)]" id="pm-confirm-title">确认</h3>
                <p class="text-sm text-[var(--fg-light)] mb-6" id="pm-confirm-message"></p>
                <div class="flex justify-end gap-3">
                    <button id="pm-confirm-cancel" class="px-4 py-2 rounded-lg hover:bg-[var(--comfy-input-bg)] text-[var(--fg-light)] transition-colors">取消</button>
                    <button id="pm-confirm-confirm" class="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">删除</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.confirmDialog);

        const cancelBtn = this.confirmDialog.querySelector('#pm-confirm-cancel');
        const confirmBtn = this.confirmDialog.querySelector('#pm-confirm-confirm');

        cancelBtn.addEventListener('click', () => this.hideConfirmDialog());
        confirmBtn.addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback(true);
            }
            this.hideConfirmDialog();
        });
        this.confirmDialog.querySelector('.pm-confirm-overlay').addEventListener('click', () => this.hideConfirmDialog());
    }

    showConfirmDialog(title, message, confirmText, callback) {
        if (!this.confirmDialog) {
            this.createConfirmDialog();
        }
        
        this.confirmDialog.querySelector('#pm-confirm-title').textContent = title;
        this.confirmDialog.querySelector('#pm-confirm-message').textContent = message;
        this.confirmDialog.querySelector('#pm-confirm-confirm').textContent = confirmText || '确定';
        this.confirmCallback = callback;
        this.confirmDialog.style.display = 'flex';
    }

    hideConfirmDialog() {
        if (this.confirmDialog) {
            this.confirmDialog.style.display = 'none';
        }
        this.confirmCallback = null;
    }

    setupContextMenuEvents() {
        document.addEventListener('click', (e) => {
            if (this.contextMenu.classList.contains('show') && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        document.addEventListener('contextmenu', (e) => {
            if (this.contextMenu.classList.contains('show') && !this.dialog.contains(e.target) && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
    }

    showContextMenu(x, y, item = null) {
        if (item) {
            this.updateContextMenu(true);
            this.currentContextItem = item;
        } else {
            this.updateContextMenu(false);
            this.currentContextItem = null;
        }
        
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.style.display = 'block';
        
        const rect = this.contextMenu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) {
            this.contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (y + rect.height > window.innerHeight) {
            this.contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
        
        this.contextMenu.classList.add('show');
    }

    hideContextMenu() {
        this.contextMenu.classList.remove('show');
        this.contextMenu.style.display = 'none';
        this.currentContextItem = null;
    }

    async handleContextMenuAction(action) {
        const item = this.currentContextItem;
        
        this.hideContextMenu();
        
        switch (action) {
            case 'rename':
                await this.renameItem(item);
                break;
            case 'replace-preview':
                await this.replacePreview(item);
                break;
            case 'delete':
                await this.deleteItem(item);
                break;
            case 'new-folder':
                this.createNewFolder();
                break;
            case 'new-workflow':
                this.createNewWorkflow();
                break;
        }
    }

    renameItem(item) {
        const oldName = item.name;
        const isWorkflow = item.type === 'workflow';
        const currentNameWithoutExt = isWorkflow ? oldName : oldName;
        
        this.showPromptDialog('重命名', '请输入新名称:', currentNameWithoutExt, async (newName) => {
            if (!newName || newName.trim() === '' || newName.trim() === currentNameWithoutExt) return;
            
            let newFilename = newName.trim();
            if (isWorkflow && !newFilename.endsWith('.json')) {
                newFilename += '.json';
            }
            
            try {
                const response = await fetchWithUser('/pm_workflow/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        old_path: item.path,
                        new_name: newFilename
                    })
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
                    
                    if (app.extensionManager && app.extensionManager.workflow && app.extensionManager.workflow.syncWorkflows) {
                        app.extensionManager.workflow.syncWorkflows();
                    }
                } else {
                    const errorText = await response.text();
                    this.showPromptDialog('错误', '重命名失败: ' + errorText, '', () => {});
                }
            } catch (error) {
                console.error('Rename error:', error);
                this.showPromptDialog('错误', '重命名失败: ' + error.message, '', () => {});
            }
        });
    }

    deleteItem(item) {
        const confirmMsg = item.type === 'folder' 
            ? `确定要删除文件夹 "${item.name}" 及其所有内容吗？` 
            : `确定要删除工作流 "${item.name}" 吗？`;
        
        this.showConfirmDialog('确认删除', confirmMsg, '删除', async (confirmed) => {
            if (!confirmed) return;
            
            try {
                const response = await fetchWithUser(`/pm_workflow/delete/${encodeURIComponent(item.path)}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
                    
                    if (app.extensionManager && app.extensionManager.workflow && app.extensionManager.workflow.syncWorkflows) {
                        app.extensionManager.workflow.syncWorkflows();
                    }
                } else {
                    const errorText = await response.text();
                    this.showPromptDialog('错误', '删除失败: ' + errorText, '', () => {});
                }
            } catch (error) {
                console.error('Delete error:', error);
                this.showPromptDialog('错误', '删除失败: ' + error.message, '', () => {});
            }
        });
    }

    async replacePreview(item) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const formData = new FormData();
            formData.append('path', item.path);
            formData.append('image', file);
            
            try {
                const headers = new Headers();
                const comfyUser = getComfyUserHeader();
                if (comfyUser) {
                    headers.set('comfy-user', comfyUser);
                }
                
                const response = await fetch('/pm_workflow/replace_preview', {
                    method: 'POST',
                    headers,
                    body: formData
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
                    
                    if (app.extensionManager && app.extensionManager.workflow && app.extensionManager.workflow.syncWorkflows) {
                        app.extensionManager.workflow.syncWorkflows();
                    }
                } else {
                    const errorText = await response.text();
                    alert('替换预览图失败: ' + errorText);
                }
            } catch (error) {
                console.error('Replace preview error:', error);
                alert('替换预览图失败: ' + error.message);
            }
        };
        
        input.click();
    }

    createNewFolder() {
        this.showPromptDialog('新建文件夹', '请输入文件夹名称:', '新建文件夹', async (name) => {
            if (!name || name.trim() === '') return;
            
            const folderName = name.trim();
            
            try {
                const response = await fetchWithUser('/pm_workflow/new_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: this.currentPath,
                        name: folderName
                    })
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
                    
                    if (app.extensionManager && app.extensionManager.workflow && app.extensionManager.workflow.syncWorkflows) {
                        app.extensionManager.workflow.syncWorkflows();
                    }
                } else {
                    const errorText = await response.text();
                    this.showPromptDialog('错误', '创建文件夹失败: ' + errorText, '', () => {});
                }
            } catch (error) {
                console.error('Create folder error:', error);
                this.showPromptDialog('错误', '创建文件夹失败: ' + error.message, '', () => {});
            }
        });
    }

    createNewWorkflow() {
        this.showPromptDialog('新建工作流', '请输入工作流名称:', '新建工作流', async (name) => {
            if (!name || name.trim() === '') return;
            
            let workflowName = name.trim();
            if (!workflowName.endsWith('.json')) {
                workflowName += '.json';
            }
            
            try {
                const response = await fetchWithUser('/pm_workflow/new_workflow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: this.currentPath,
                        name: workflowName
                    })
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
                    
                    if (app.extensionManager && app.extensionManager.workflow && app.extensionManager.workflow.syncWorkflows) {
                        app.extensionManager.workflow.syncWorkflows();
                    }
                } else {
                    const errorText = await response.text();
                    this.showPromptDialog('错误', '创建工作流失败: ' + errorText, '', () => {});
                }
            } catch (error) {
                console.error('Create workflow error:', error);
                this.showPromptDialog('错误', '创建工作流失败: ' + error.message, '', () => {});
            }
        });
    }
}

const pmDialog = new PMWorkflowDialog();

app.registerExtension({
    name: "ComfyUI.PMWorkflow",
    
    init() {
    },
    
    setup() {
        setTimeout(function() {
            const existingTab = document.getElementById('pm-workflow-tab');
            if (existingTab) {
                existingTab.remove();
            }
            
            const sidebarGroups = document.querySelectorAll('.sidebar-item-group');
            
            if (sidebarGroups.length > 0) {
                const firstGroup = sidebarGroups[0];
                
                const allButtons = firstGroup.querySelectorAll('button');
                let referenceButton = null;
                
                for (let i = 0; i < allButtons.length; i++) {
                    if (allButtons[i].textContent && allButtons[i].textContent.indexOf('工作流') !== -1) {
                        referenceButton = allButtons[i];
                        break;
                    }
                }
                
                if (referenceButton) {
                    // 添加分隔线
                    const divider = document.createElement('div');
                    divider.style.cssText = 'height: 1px; background-color: rgba(255, 255, 255, 0.2); margin: 8px 16px; width: calc(100% - 32px);';
                    firstGroup.appendChild(divider);
                    
                    const pmButton = referenceButton.cloneNode(true);
                    pmButton.id = 'pm-workflow-tab';
                    
                    const label = pmButton.querySelector('.side-bar-button-label');
                    if (label) {
                        label.textContent = 'PM工作流';
                    }
                    
                    const iconEl = pmButton.querySelector('.side-bar-button-icon, i');
                    if (iconEl) {
                        iconEl.outerHTML = '<svg class="side-bar-button-icon" style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>';
                    }
                    
                    pmButton.onclick = function() {
                        pmDialog.show();
                    };
                    
                    firstGroup.appendChild(pmButton);
                } else {
                    // 添加分隔线
                    const divider = document.createElement('div');
                    divider.style.cssText = 'height: 1px; background-color: rgba(255, 255, 255, 0.2); margin: 8px 16px; width: calc(100% - 32px);';
                    firstGroup.appendChild(divider);
                    
                    const pmButton = document.createElement('button');
                    pmButton.id = 'pm-workflow-tab';
                    pmButton.className = 'relative inline-flex items-center justify-center gap-2 whitespace-nowrap appearance-none font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-[var(--comfy-menu-bg)] p-2 h-auto min-w-[40px] min-h-[40px] border-none';
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'side-bar-button-content';
                    
                    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    iconSvg.setAttribute('class', 'side-bar-button-icon');
                    iconSvg.setAttribute('style', 'width: 20px; height: 20px;');
                    iconSvg.setAttribute('fill', 'none');
                    iconSvg.setAttribute('stroke', 'currentColor');
                    iconSvg.setAttribute('viewBox', '0 0 24 24');
                    iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>';
                    
                    const label = document.createElement('span');
                    label.className = 'side-bar-button-label';
                    label.textContent = 'PM工作流';
                    
                    contentDiv.appendChild(iconSvg);
                    contentDiv.appendChild(label);
                    pmButton.appendChild(contentDiv);
                    
                    pmButton.onclick = function() {
                        pmDialog.show();
                    };
                    
                    firstGroup.appendChild(pmButton);
                }
            }
        }, 800);
    }
});
