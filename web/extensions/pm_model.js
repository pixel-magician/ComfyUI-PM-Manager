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

export function fetchWithUser(url, options = {}) {
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

class PMModelDialog {
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
        this.selectMode = false;
        this.targetNode = null;
        this.init();
    }

    init() {
        this.createContextMenu();
        
        this.dialog = document.createElement('div');
        this.dialog.id = 'pm-model-dialog';
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
            <div class="pm-overlay fixed inset-0 bg-black/60 backdrop-blur-sm" id="pm-model-overlay"></div>
            <div class="flex items-center justify-center min-h-screen p-4" style="position: relative; z-index: 1; pointer-events: none;">
                <div class="pm-dialog-content relative bg-gradient-to-br from-[var(--comfy-menu-bg)] to-[var(--comfy-input-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden" style="max-width: 90vw; width: 1500px; max-height: 85vh; pointer-events: auto;">
                    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--comfy-input-bg)]/30 to-transparent">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                                </svg>
                            </div>
                            <div>
                                <h2 class="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">PM 模型管理器</h2>
                                <p class="text-xs text-[var(--fg-light)]">管理您的 AI 模型文件</p>
                            </div>
                        </div>
                        <button id="pm-model-close" class="p-2 hover:bg-[var(--comfy-input-bg)] rounded-xl transition-all duration-300 hover:scale-110 hover:shadow-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="pm-model-breadcrumb" class="px-6 py-3 border-b border-[var(--border-color)] flex items-center gap-2 text-sm flex-shrink-0 bg-[var(--comfy-input-bg)]/20">
                    </div>
                    <div class="p-4 overflow-y-auto flex-grow">
                        <div id="pm-model-list" class="grid grid-cols-5 gap-4">
                            <div class="text-center py-8 text-[var(--fg-light)]">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.dialog);
        
        const closeBtn = this.dialog.querySelector('#pm-model-close');
        const overlay = this.dialog.querySelector('#pm-model-overlay');
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });
        overlay.addEventListener('click', () => this.close());
    }

    async loadItems(path = '') {
        try {
            const url = path ? `/pm_model/list?path=${encodeURIComponent(path)}` : '/pm_model/list';
            const response = await fetchWithUser(url);
            const data = await response.json();
            this.items = data.items || [];
            this.currentPath = data.current_path || '';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            const listEl = this.dialog.querySelector('#pm-model-list');
            listEl.innerHTML = '<div class="text-center py-8 text-red-500">加载失败</div>';
        }
    }

    renderBreadcrumb() {
        const breadcrumbEl = this.dialog.querySelector('#pm-model-breadcrumb');
        const parts = this.currentPath ? this.currentPath.split(/[/\\]/) : [];
        
        let html = '<div class="flex items-center gap-1">';
        html += `<svg class="w-4 h-4 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
        </svg>`;
        
        if (parts.length > 0) {
            const isRestricted = this.targetType === 'unet' || this.targetType === 'vae' || this.targetType === 'lora' || this.targetType === 'clip';
            if (isRestricted) {
                html += `<span class="px-3 py-1 rounded-lg bg-[var(--comfy-input-bg)] text-[var(--fg-light)] font-medium">根目录</span>`;
            } else {
                html += `<button class="breadcrumb-item px-3 py-1 rounded-lg hover:bg-[var(--comfy-input-bg)] transition-all duration-200 text-[var(--fg-light)] hover:text-[var(--fg)]" data-path="">根目录</button>`;
            }
            html += `<svg class="w-4 h-4 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>`;
        } else {
            html += `<span class="px-3 py-1 rounded-lg bg-[var(--comfy-input-bg)] text-[var(--fg)] font-medium">根目录</span>`;
        }
        
        let currentPath = '';
        const isRestricted = this.targetType === 'unet' || this.targetType === 'vae' || this.targetType === 'lora' || this.targetType === 'clip';
        let baseDir = 'unet';
        if (this.targetType === 'vae') {
            baseDir = 'vae';
        } else if (this.targetType === 'lora') {
            baseDir = 'loras';
        } else if (this.targetType === 'clip') {
            baseDir = 'clip';
        }
        
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
                let path = btn.dataset.path;
                
                if (isRestricted) {
                    if (path === '') {
                        return;
                    }
                    const pathParts = path.split(/[/\\]/).filter(Boolean);
                    if (pathParts[0] !== baseDir) {
                        return;
                    }
                }
                
                this.loadItems(path);
            });
        });
    }

    renderItems() {
        const listEl = this.dialog.querySelector('#pm-model-list');
        
        if (this.items.length === 0) {
            listEl.innerHTML = '<div class="col-span-5 text-center py-8 text-[var(--fg-light)]">暂无内容</div>';
        } else {
            listEl.innerHTML = this.items.map((item, index) => {
                const isFolder = item.type === 'folder';
                let iconColor = 'text-[var(--fg-light)]';
                let iconSvg = '';
                let previewUrl = '';
                
                if (item.has_preview) {
                    const pathParts = item.path.split(/[/\\]/);
                    const filename = pathParts.pop();
                    let previewName;
                    if (isFolder) {
                        previewName = filename + '.png';
                    } else {
                        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                        previewName = nameWithoutExt + '.png';
                    }
                    pathParts.push(previewName);
                    const pngPath = pathParts.join('/');
                    previewUrl = `/pm_model/preview/${encodeURIComponent(pngPath)}?t=${Date.now()}`;
                }
                
                if (isFolder) {
                    iconColor = 'text-yellow-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>';
                } else if (item.name.endsWith('.safetensors')) {
                    iconColor = 'text-purple-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>';
                } else if (item.name.endsWith('.pt') || item.name.endsWith('.pth') || item.name.endsWith('.bin')) {
                    iconColor = 'text-green-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>';
                } else if (item.name.endsWith('.ckpt')) {
                    iconColor = 'text-orange-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100 4m0-4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100 4m0-4a2 2 0 110-4m0 4v2m0-6V4"></path>';
                } else {
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>';
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
                                        <svg class="w-16 h-16 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            ${iconSvg}
                                        </svg>
                                    </div>`
                                    : item.has_preview 
                                        ? `<img src="${previewUrl}" alt="${item.name}" class="w-full h-full object-cover">`
                                        : `<div class="w-full h-full bg-[var(--comfy-input-bg)] flex items-center justify-center">
                                            <svg class="w-16 h-16 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                ${iconSvg}
                                            </svg>
                                        </div>`
                            }
                            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-1">
                                <button class="pm-model-info-btn w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center border-0" title="详细信息">
                                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="flex flex-col items-start px-3 py-3 flex-shrink-0" style="min-height: 64px;">
                            ${!isFolder && item.title ? `<p class="text-base font-semibold text-purple-400 truncate w-full text-left mb-2">${item.title}</p>` : ''}
                            ${!isFolder && !item.title ? `<p class="text-base font-medium text-[var(--fg)] truncate w-full text-left mb-2">${item.name.replace(/\.[^/.]+$/, '')}</p>` : ''}
                            ${isFolder ? '<div class="flex-grow"></div>' : ''}
                            <span class="text-xs ${!isFolder && item.title ? 'text-[var(--fg-light)]' : 'text-[var(--fg)] font-medium'} text-left px-2 py-1 rounded-md bg-black/30">${isFolder ? item.name : item.name.replace(/\.[^/.]+$/, '')}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        listEl.querySelectorAll('.card').forEach((card, index) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.pm-model-info-btn')) {
                    return;
                }
                const path = card.dataset.path;
                const type = card.dataset.type;
                
                if (type === 'folder') {
                    const isRestricted = this.targetType === 'unet' || this.targetType === 'vae' || this.targetType === 'lora' || this.targetType === 'clip';
                    let baseDir = 'unet';
                    if (this.targetType === 'vae') {
                        baseDir = 'vae';
                    } else if (this.targetType === 'lora') {
                        baseDir = 'loras';
                    } else if (this.targetType === 'clip') {
                        baseDir = 'clip';
                    }
                    
                    if (isRestricted) {
                        const targetPathParts = path.split(/[/\\]/).filter(Boolean);
                        if (targetPathParts.length === 0 || targetPathParts[0] !== baseDir) {
                            return;
                        }
                    }
                    
                    this.loadItems(path);
                } else if (this.selectMode && this.targetNode) {
                    this.selectModel(this.items[index]);
                }
            });
            
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const item = this.items[index];
                this.showContextMenu(e.clientX, e.clientY, item);
            });
            
            const infoBtn = card.querySelector('.pm-model-info-btn');
            if (infoBtn) {
                infoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const item = this.items[index];
                    this.showInfoDialog(item);
                });
            }
        });
        
        listEl.addEventListener('contextmenu', (e) => {
            if (e.target === listEl || e.target.classList.contains('col-span-5')) {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.clientX, e.clientY, null);
            }
        });
    }

    async show() {
        this.selectMode = false;
        this.targetNode = null;
        this.targetType = null;
        this.dialog.style.display = 'block';
        await this.loadItems('');
    }

    async openForUNet(node) {
        this.selectMode = true;
        this.targetNode = node;
        this.targetType = 'unet';
        this.dialog.style.display = 'block';
        await this.loadItems('unet');
    }

    async openForLora(node) {
        this.selectMode = true;
        this.targetNode = node;
        this.targetType = 'lora';
        this.dialog.style.display = 'block';
        await this.loadItems('loras');
    }

    async openForVae(node) {
        this.selectMode = true;
        this.targetNode = node;
        this.targetType = 'vae';
        this.dialog.style.display = 'block';
        await this.loadItems('vae');
    }

    async openForClip(node) {
        this.selectMode = true;
        this.targetNode = node;
        this.targetType = 'clip';
        this.dialog.style.display = 'block';
        await this.loadItems('clip');
    }

    selectModel(item) {
        if (this.targetNode && item.type === 'model') {
            const filename = item.name;
            
            this.targetNode.pm_selected_model = item;
            this.targetNode.pm_metadata = item.metadata || {};
            
            if (this.targetType === 'unet') {
                const unetNameWidget = this.targetNode.widgets.find(w => w.name === 'unet_name');
                if (unetNameWidget) {
                    unetNameWidget.value = filename;
                }
                
                if (this.targetNode.unetsWidget) {
                    const currentValue = this.targetNode.unetsWidget.value || [];
                    const modelName = item.name.replace(/\.[^/.]+$/, '');
                    const existingIndex = currentValue.findIndex(u => u.name === modelName);
                    
                    if (existingIndex === -1) {
                        const updatedValue = currentValue.map(u => ({
                            ...u,
                            selected: false
                        }));
                        updatedValue.push({
                            name: modelName,
                            active: true,
                            expanded: false,
                            locked: false,
                            selected: true
                        });
                        this.targetNode.unetsWidget.value = updatedValue;
                    } else {
                        const updatedValue = currentValue.map((u, i) => ({
                            ...u,
                            selected: i === existingIndex
                        }));
                        this.targetNode.unetsWidget.value = updatedValue;
                    }
                }
            } else if (this.targetType === 'lora') {
                const loraNameWidget = this.targetNode.widgets.find(w => w.name === 'lora_name');
                if (loraNameWidget) {
                    loraNameWidget.value = filename;
                }
                
                if (this.targetNode.lorasWidget) {
                    const currentValue = this.targetNode.lorasWidget.value || [];
                    const modelName = item.name.replace(/\.[^/.]+$/, '');
                    const existingIndex = currentValue.findIndex(l => l.name === modelName);
                    
                    if (existingIndex === -1) {
                        currentValue.push({
                            name: modelName,
                            active: true,
                            expanded: false,
                            locked: false,
                            strength: 1.0,
                            clipStrength: 1.0
                        });
                        this.targetNode.lorasWidget.value = currentValue;
                    }
                }
            } else if (this.targetType === 'vae') {
                const vaeNameWidget = this.targetNode.widgets.find(w => w.name === 'vae_name');
                if (vaeNameWidget) {
                    vaeNameWidget.value = filename;
                }
                
                if (this.targetNode.vaesWidget) {
                    const currentValue = this.targetNode.vaesWidget.value || [];
                    const modelName = item.name.replace(/\.[^/.]+$/, '');
                    const existingIndex = currentValue.findIndex(v => v.name === modelName);
                    
                    if (existingIndex === -1) {
                        const updatedValue = currentValue.map(v => ({
                            ...v,
                            selected: false
                        }));
                        updatedValue.push({
                            name: modelName,
                            active: true,
                            expanded: false,
                            locked: false,
                            selected: true
                        });
                        this.targetNode.vaesWidget.value = updatedValue;
                    } else {
                        const updatedValue = currentValue.map((v, i) => ({
                            ...v,
                            selected: i === existingIndex
                        }));
                        this.targetNode.vaesWidget.value = updatedValue;
                    }
                }
            } else if (this.targetType === 'clip') {
                const clipNameWidget = this.targetNode.widgets.find(w => w.name === 'clip_name');
                if (clipNameWidget) {
                    clipNameWidget.value = filename;
                }
                
                if (this.targetNode.clipsWidget) {
                    const currentValue = this.targetNode.clipsWidget.value || [];
                    const modelName = item.name.replace(/\.[^/.]+$/, '');
                    const existingIndex = currentValue.findIndex(c => c.name === modelName);
                    
                    if (existingIndex === -1) {
                        const updatedValue = currentValue.map(c => ({
                            ...c,
                            selected: false
                        }));
                        updatedValue.push({
                            name: modelName,
                            active: true,
                            expanded: false,
                            locked: false,
                            selected: true
                        });
                        this.targetNode.clipsWidget.value = updatedValue;
                    } else {
                        const updatedValue = currentValue.map((c, i) => ({
                            ...c,
                            selected: i === existingIndex
                        }));
                        this.targetNode.clipsWidget.value = updatedValue;
                    }
                }
            }
            
            this.close();
            app.graph.setDirtyCanvas(true, true);
        }
    }

    close() {
        this.selectMode = false;
        this.targetNode = null;
        this.targetType = null;
        this.dialog.style.display = 'none';
        this.hideContextMenu();
        this.hideInfoDialog();
    }

    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'pm-context-menu';
        this.setupContextMenuEvents();
    }

    updateContextMenu(isItemMenu) {
        if (isItemMenu) {
            this.contextMenu.innerHTML = `
                <div class="pm-context-menu-item" data-action="show-info">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    详细信息
                </div>
                <div class="pm-context-menu-divider"></div>
                <div class="pm-context-menu-item" data-action="replace-preview">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    替换预览图
                </div>
            `;
        } else {
            this.contextMenu.innerHTML = '';
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
            case 'show-info':
                this.showInfoDialog(item);
                break;
            case 'replace-preview':
                await this.replacePreview(item);
                break;
        }
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
                
                const response = await fetch('/pm_model/replace_preview', {
                    method: 'POST',
                    headers,
                    body: formData
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
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

    createInfoDialog() {
        this.infoDialog = document.createElement('div');
        this.infoDialog.className = 'pm-info-dialog fixed inset-0 flex items-center justify-center';
        this.infoDialog.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: none;';
        this.infoDialog.innerHTML = `
            <style>
                .pm-info-overlay {
                    animation: fadeIn 0.2s ease;
                }
                .pm-info-content {
                    animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .info-card {
                    background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                .info-card:hover {
                    border-color: rgba(168, 85, 247, 0.4);
                    box-shadow: 0 0 20px rgba(168, 85, 247, 0.15);
                }
                .info-item {
                    transition: all 0.2s ease;
                }
                .info-item:hover {
                    background: rgba(255,255,255,0.05);
                }
                .info-label {
                    color: var(--fg-light);
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                }
                .info-value {
                    color: var(--fg);
                    font-size: 14px;
                    font-weight: 500;
                }
            </style>
            <div class="pm-info-overlay fixed inset-0 bg-black/70 backdrop-blur-md" id="pm-info-overlay" style="z-index: 1;"></div>
            <div class="pm-info-content relative border border-[var(--border-color)] rounded-3xl shadow-2xl w-full flex flex-col overflow-hidden" style="z-index: 2; background: linear-gradient(145deg, var(--comfy-menu-bg) 0%, var(--comfy-input-bg) 100%); max-width: 600px; max-height: 85vh;">
                <div class="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-transparent via-[var(--comfy-input-bg)]/30 to-transparent">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent" id="pm-info-title">详细信息</h3>
                    </div>
                    <button id="pm-info-close" class="p-2 hover:bg-[var(--comfy-input-bg)] rounded-xl transition-all duration-300 hover:scale-110 hover:shadow-lg">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div id="pm-info-body" class="overflow-y-auto flex-grow p-6">
                    <div class="text-center py-8 text-[var(--fg-light)]">加载中...</div>
                </div>
            </div>
        `;
        document.body.appendChild(this.infoDialog);

        const closeBtn = this.infoDialog.querySelector('#pm-info-close');
        const overlay = this.infoDialog.querySelector('#pm-info-overlay');

        closeBtn.addEventListener('click', () => this.hideInfoDialog());
        overlay.addEventListener('click', () => this.hideInfoDialog());
    }

    async saveMetadata(path, metadata) {
        try {
            const response = await fetchWithUser('/pm_model/save_metadata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: path,
                    metadata: metadata
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Save metadata error:', error);
            return null;
        }
    }

    async showInfoDialog(item) {
        if (!this.infoDialog) {
            this.createInfoDialog();
        }

        this.infoDialog.style.display = 'flex';
        const bodyEl = this.infoDialog.querySelector('#pm-info-body');
        const titleEl = this.infoDialog.querySelector('#pm-info-title');
        titleEl.textContent = item.name;

        try {
            const response = await fetchWithUser(`/pm_model/info/${encodeURIComponent(item.path)}`);
            const info = await response.json();

            let html = '<div class="space-y-5">';

            let previewUrl = '';
            if (item.has_preview) {
                const pathParts = item.path.split(/[/\\]/);
                const filename = pathParts.pop();
                let previewName;
                if (info.type === 'folder') {
                    previewName = filename + '.png';
                } else {
                    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                    previewName = nameWithoutExt + '.png';
                }
                pathParts.push(previewName);
                const pngPath = pathParts.join('/');
                previewUrl = `/pm_model/preview/${encodeURIComponent(pngPath)}?t=${Date.now()}`;
            }

            if (previewUrl) {
                html += `
                    <div class="info-card">
                        <div class="aspect-video bg-gradient-to-br from-purple-900/30 to-pink-900/30 relative overflow-hidden">
                            <img src="${previewUrl}" alt="${item.name}" class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            <div class="absolute bottom-4 left-4 right-4">
                                <p class="text-white font-semibold text-sm opacity-90">预览图</p>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += '<div class="info-card">';
            html += '<div class="p-4 space-y-3">';

            if (info.type !== 'folder') {
                html += `
                    <div class="info-item rounded-lg p-3">
                        <p class="info-label mb-2">标题</p>
                        <div class="flex items-center justify-between gap-2" data-field="title">
                            <div class="flex items-center gap-2 flex-1 overflow-hidden">
                                <span class="pm-field-display text-[var(--fg)] font-medium truncate">${info.title || '-'}</span>
                            </div>
                            <button class="pm-edit-btn opacity-60 hover:opacity-100 flex-shrink-0 bg-transparent border-none outline-none cursor-pointer" title="编辑">
                                <svg class="w-5 h-5 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                </svg>
                            </button>
                            <div class="pm-field-edit hidden flex-1 flex gap-1 min-w-0">
                                <input type="text" class="pm-field-input flex-1 px-2 py-1.5 rounded bg-[var(--comfy-input-bg)] border border-[var(--border-color)] text-[var(--fg)] focus:outline-none focus:border-purple-500 text-sm" data-original="${info.title || ''}" value="${info.title || ''}" placeholder="输入标题...">
                                <button class="pm-save-btn px-2 py-1.5 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity flex-shrink-0" title="保存">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </button>
                                <button class="pm-cancel-btn px-2 py-1.5 rounded hover:bg-[var(--comfy-input-bg)] text-[var(--fg-light)] transition-colors flex-shrink-0" title="取消">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="info-item rounded-lg p-3">
                            <p class="info-label mb-2">步数</p>
                            <div class="flex items-center justify-between gap-2" data-field="steps">
                                <div class="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                                    <span class="pm-field-display text-[var(--fg)] font-medium truncate">${info.metadata?.steps || '-'}</span>
                                </div>
                                <button class="pm-edit-btn opacity-60 hover:opacity-100 flex-shrink-0 bg-transparent border-none outline-none cursor-pointer" title="编辑">
                                    <svg class="w-5 h-5 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                    </svg>
                                </button>
                                <div class="pm-field-edit hidden flex-1 flex gap-1 min-w-0">
                                    <input type="number" class="pm-field-input flex-1 px-1.5 py-1 rounded bg-[var(--comfy-input-bg)] border border-[var(--border-color)] text-[var(--fg)] focus:outline-none focus:border-purple-500 text-xs" data-original="${info.metadata?.steps || ''}" value="${info.metadata?.steps || ''}" placeholder="步数">
                                    <button class="pm-save-btn px-1.5 py-1 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity flex-shrink-0" title="保存">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </button>
                                    <button class="pm-cancel-btn px-1.5 py-1 rounded text-[var(--fg-light)] hover:text-[var(--fg)] transition-colors flex-shrink-0" title="取消">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="info-item rounded-lg p-3">
                            <p class="info-label mb-2">CFG</p>
                            <div class="flex items-center justify-between gap-2" data-field="cfg">
                                <div class="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                                    <span class="pm-field-display text-[var(--fg)] font-medium truncate">${info.metadata?.cfg || '-'}</span>
                                </div>
                                <button class="pm-edit-btn opacity-60 hover:opacity-100 flex-shrink-0 bg-transparent border-none outline-none cursor-pointer" title="编辑">
                                    <svg class="w-5 h-5 text-[var(--fg-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                    </svg>
                                </button>
                                <div class="pm-field-edit hidden flex-1 flex gap-1 min-w-0">
                                    <input type="number" step="0.1" class="pm-field-input flex-1 px-1.5 py-1 rounded bg-[var(--comfy-input-bg)] border border-[var(--border-color)] text-[var(--fg)] focus:outline-none focus:border-purple-500 text-xs" data-original="${info.metadata?.cfg || ''}" value="${info.metadata?.cfg || ''}" placeholder="CFG">
                                    <button class="pm-save-btn px-1.5 py-1 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity flex-shrink-0" title="保存">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </button>
                                    <button class="pm-cancel-btn px-1.5 py-1 rounded text-[var(--fg-light)] hover:text-[var(--fg)] transition-colors flex-shrink-0" title="取消">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="info-item rounded-lg p-3">
                    <p class="info-label mb-1">大小</p>
                    <p class="info-value">${info.size || '-'}</p>
                </div>
            `;

            html += `
                <div class="info-item rounded-lg p-3">
                    <p class="info-label mb-1">路径</p>
                    <p class="info-value text-sm break-all">${info.path || '-'}</p>
                </div>
            `;

            if (info.type === 'folder' && info.file_count !== undefined) {
                html += `
                    <div class="info-item rounded-lg p-3">
                        <p class="info-label mb-1">文件数量</p>
                        <p class="info-value">${info.file_count}</p>
                    </div>
                `;
            }

            html += `
                <div class="grid grid-cols-2 gap-3">
                    <div class="info-item rounded-lg p-3">
                        <p class="info-label mb-1">创建时间</p>
                        <p class="info-value text-sm">${info.created_time || '-'}</p>
                    </div>
                    <div class="info-item rounded-lg p-3">
                        <p class="info-label mb-1">修改时间</p>
                        <p class="info-value text-sm">${info.modified_time || '-'}</p>
                    </div>
                </div>
            `;

            html += '</div>';
            html += '</div>';
            html += '</div>';
            bodyEl.innerHTML = html;

            const self = this;
            if (info.type !== 'folder') {
                const fieldWrappers = bodyEl.querySelectorAll('[data-field]');
                
                fieldWrappers.forEach(wrapper => {
                    const field = wrapper.dataset.field;
                    const editBtn = wrapper.querySelector('.pm-edit-btn');
                    const fieldEdit = wrapper.querySelector('.pm-field-edit');
                    const fieldDisplay = wrapper.querySelector('.pm-field-display');
                    const input = wrapper.querySelector('.pm-field-input');
                    const saveBtn = wrapper.querySelector('.pm-save-btn');
                    const cancelBtn = wrapper.querySelector('.pm-cancel-btn');
                    
                    editBtn.addEventListener('click', () => {
                        editBtn.classList.add('hidden');
                        fieldDisplay.parentElement.classList.add('hidden');
                        fieldEdit.classList.remove('hidden');
                        fieldEdit.classList.add('flex');
                        input.focus();
                    });
                    
                    cancelBtn.addEventListener('click', () => {
                        input.value = input.dataset.original || '';
                        fieldEdit.classList.add('hidden');
                        fieldEdit.classList.remove('flex');
                        editBtn.classList.remove('hidden');
                        fieldDisplay.parentElement.classList.remove('hidden');
                    });
                    
                    saveBtn.addEventListener('click', async () => {
                        const newValue = input.value.trim();
                        const newMetadata = { ...info.metadata };
                        
                        if (field === 'title') {
                            newMetadata.title = newValue;
                        } else if (field === 'steps') {
                            if (newValue) {
                                newMetadata.steps = Number(newValue);
                            } else if (newMetadata.steps !== undefined) {
                                delete newMetadata.steps;
                            }
                        } else if (field === 'cfg') {
                            if (newValue) {
                                newMetadata.cfg = Number(newValue);
                            } else if (newMetadata.cfg !== undefined) {
                                delete newMetadata.cfg;
                            }
                        }
                        
                        const result = await self.saveMetadata(item.path, newMetadata);
                        if (result && result.success) {
                            await self.loadItems(self.currentPath);
                            
                            input.dataset.original = newValue;
                            fieldDisplay.textContent = newValue || '-';
                            fieldEdit.classList.add('hidden');
                            fieldEdit.classList.remove('flex');
                            editBtn.classList.remove('hidden');
                            fieldDisplay.parentElement.classList.remove('hidden');
                        }
                    });
                    
                    input.addEventListener('keypress', async (e) => {
                        if (e.key === 'Enter') {
                            saveBtn.click();
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Load info error:', error);
            bodyEl.innerHTML = '<div class="text-center py-8 text-red-500">加载失败</div>';
        }
    }

    hideInfoDialog() {
        if (this.infoDialog) {
            this.infoDialog.style.display = 'none';
        }
    }
}

const pmModelDialog = new PMModelDialog();

app.registerExtension({
    name: "ComfyUI.PMModelManager",

    pmModelDialog: pmModelDialog,

    init() {
    },

    openForUNet(node) {
        pmModelDialog.openForUNet(node);
    },

    openForLora(node) {
        pmModelDialog.openForLora(node);
    },

    openForVae(node) {
        pmModelDialog.openForVae(node);
    },

    openForClip(node) {
        pmModelDialog.openForClip(node);
    },
    
    setup() {
        const insertButton = () => {
            const existingTab = document.getElementById('pm-model-tab');
            if (existingTab) {
                existingTab.remove();
            }
            
            const sidebarGroups = document.querySelectorAll('.sidebar-item-group');
            
            if (sidebarGroups.length > 0) {
                const firstGroup = sidebarGroups[0];
                
                // Find PM workflow button first
                const pmWorkflowButton = document.getElementById('pm-workflow-tab');
                
                if (pmWorkflowButton) {
                    // Insert after PM workflow button
                    const pmButton = pmWorkflowButton.cloneNode(true);
                    pmButton.id = 'pm-model-tab';
                    
                    const label = pmButton.querySelector('.side-bar-button-label');
                    if (label) {
                        label.textContent = 'PM模型';
                    }
                    
                    pmButton.onclick = function() {
                        pmModelDialog.show();
                    };
                    
                    // Insert after workflow button
                    if (pmWorkflowButton.nextSibling) {
                        firstGroup.insertBefore(pmButton, pmWorkflowButton.nextSibling);
                    } else {
                        firstGroup.appendChild(pmButton);
                    }
                } else {
                    // Workflow button not found yet, wait for it
                    return false;
                }
                return true;
            }
            return false;
        };
        
        // Try immediately first
        if (insertButton()) {
            return;
        }
        
        // Use MutationObserver to wait for workflow button
        const observer = new MutationObserver((mutations, obs) => {
            if (insertButton()) {
                obs.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Fallback: try again after 1000ms (give workflow time to insert first)
        setTimeout(() => {
            observer.disconnect();
            insertButton();
        }, 1000);
    }
});
