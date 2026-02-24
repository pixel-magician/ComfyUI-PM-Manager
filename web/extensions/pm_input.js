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

class PMInputDialog {
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
        this.filterType = 'all';
        this.hideEmptyFolders = false;
        this.selectionCallback = null;
        this.init();
    }

    init() {
        this.createContextMenu();
        
        this.dialog = document.createElement('div');
        this.dialog.id = 'pm-input-dialog';
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
            <div class="pm-overlay fixed inset-0 bg-black/60 backdrop-blur-sm" id="pm-input-overlay"></div>
            <div class="flex items-center justify-center min-h-screen p-4" style="position: relative; z-index: 1; pointer-events: none;">
                <div class="pm-dialog-content relative bg-gradient-to-br from-[var(--comfy-menu-bg)] to-[var(--comfy-input-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden" style="max-width: 90vw; width: 1500px; max-height: 85vh; pointer-events: auto;">
                    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--comfy-input-bg)]/30 to-transparent">
                        <div class="flex items-center gap-3">
                                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            <div>
                                <h2 class="text-xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent">PM 输入管理器</h2>
                                <p class="text-xs text-[var(--fg-light)]">管理您的输入资源（图片、音频、视频）</p>
                            </div>
                        </div>
                        <button id="pm-input-close" class="p-2 hover:bg-[var(--comfy-input-bg)] rounded-xl transition-all duration-300 hover:scale-110 hover:shadow-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="pm-input-breadcrumb" class="px-6 py-3 border-b border-[var(--border-color)] flex items-center gap-2 text-sm flex-shrink-0 bg-[var(--comfy-input-bg)]/20">
                    </div>
                    <div class="px-6 py-2 border-b border-[var(--border-color)] flex items-center gap-4 flex-shrink-0 bg-[var(--comfy-input-bg)]/10">
                        <span class="text-sm text-[var(--fg-light)]">筛选:</span>
                        <select id="pm-input-filter" class="px-3 py-1 rounded-lg text-sm bg-[var(--comfy-input-bg)] text-[var(--fg)] border-none outline-none cursor-pointer">
                            <option value="all" ${this.filterType === 'all' ? 'selected' : ''}>全部</option>
                            <option value="image" ${this.filterType === 'image' ? 'selected' : ''}>图片</option>
                            <option value="audio" ${this.filterType === 'audio' ? 'selected' : ''}>音频</option>
                            <option value="video" ${this.filterType === 'video' ? 'selected' : ''}>视频</option>
                        </select>
                    </div>
                    <div class="p-4 overflow-y-auto flex-grow">
                        <div id="pm-input-list" class="grid grid-cols-5 gap-4">
                            <div class="text-center py-8 text-[var(--fg-light)]">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.dialog);

        const closeBtn = this.dialog.querySelector('#pm-input-close');
        const overlay = this.dialog.querySelector('#pm-input-overlay');

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });
        overlay.addEventListener('click', () => this.close());

        this.setupFilterSelect();
    }

    setupFilterSelect() {
        const filterSelect = this.dialog.querySelector('#pm-input-filter');
        filterSelect.addEventListener('change', () => {
            this.filterType = filterSelect.value;
            this.renderItems();
        });
    }

    async loadItems(path = '') {
        try {
            const url = path ? `/pm_input/list?path=${encodeURIComponent(path)}` : '/pm_input/list';
            const response = await fetchWithUser(url);
            const data = await response.json();
            this.items = data.items || [];
            this.currentPath = data.current_path || '';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            const listEl = this.dialog.querySelector('#pm-input-list');
            listEl.innerHTML = '<div class="text-center py-8 text-red-500">加载失败</div>';
        }
    }

    renderBreadcrumb() {
        const breadcrumbEl = this.dialog.querySelector('#pm-input-breadcrumb');
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

    folderHasContent(item) {
        // 检查文件夹是否有内容
        if (item.has_content !== undefined) {
            return item.has_content;
        }
        // 备用检查
        for (const subItem of this.items) {
            if (subItem.path.startsWith(item.path + '/') && subItem.path !== item.path) {
                return true;
            }
        }
        return false;
    }

    renderItems() {
        const listEl = this.dialog.querySelector('#pm-input-list');

        let filteredItems = this.items;
        if (this.filterType !== 'all') {
            filteredItems = this.items.filter(item => {
                if (item.type === 'folder') return true;
                return item.type === this.filterType;
            });
        }
        
        // 如果需要隐藏空文件夹，过滤掉没有内容的文件夹
        if (this.hideEmptyFolders) {
            filteredItems = filteredItems.filter(item => {
                if (item.type !== 'folder') return true;
                // 检查文件夹是否有内容
                return this.folderHasContent(item);
            });
        }

        if (filteredItems.length === 0) {
            listEl.innerHTML = '<div class="col-span-5 text-center py-8 text-[var(--fg-light)]">暂无内容</div>';
        } else {
            listEl.innerHTML = filteredItems.map((item, index) => {
                const isFolder = item.type === 'folder';
                let iconColor = 'text-[var(--fg-light)]';
                let iconSvg = '';
                let previewUrl = '';
                
                if (isFolder && item.has_preview) {
                    const pathParts = item.path.split(/[/\\]/);
                    const filename = pathParts.pop();
                    const previewName = '.' + filename + '.png';
                    pathParts.push(previewName);
                    const dotPngPath = pathParts.join('/');
                    previewUrl = `/pm_input/preview/${encodeURIComponent(dotPngPath)}?t=${Date.now()}`;
                } else if (item.type === 'image') {
                    previewUrl = `/pm_input/preview/${encodeURIComponent(item.path)}?t=${Date.now()}`;
                } else if (item.type === 'video') {
                    previewUrl = `/pm_input/preview/${encodeURIComponent(item.path)}?t=${Date.now()}`;
                }
                
                if (isFolder) {
                    iconColor = 'text-yellow-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>';
                } else if (item.type === 'image') {
                    iconColor = 'text-green-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>';
                } else if (item.type === 'audio') {
                    iconColor = 'text-purple-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 18V5l12-3v13M9 18c0 0 1.56 0 2.55-.588C12.54 16.824 13 15.919 13 15s-.46-1.824-1.45-2.412C10.56 12 9 12 9 12v6zm12-3c0 0-1.56 0-2.55.588C17.46 16.176 17 17.081 17 18s.46 1.824 1.45 2.412C18.44 21 20 21 20 21v-6z"></path>';
                } else if (item.type === 'video') {
                    iconColor = 'text-orange-400';
                    iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
                }
                
                return `
                    <div class="card group relative bg-[var(--comfy-menu-bg)] rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-1 flex flex-col" data-path="${item.path}" data-type="${item.type}" style="animation: fadeInUp 0.5s ease forwards; animation-delay: ${index * 0.05}s; opacity: 0; border: 1px solid rgba(255,255,255,0.2);">
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
                                    : item.type === 'image'
                                        ? `<img src="${previewUrl}" alt="${item.name}" class="w-full h-full object-cover">`
                                        : item.type === 'audio'
                                            ? `<div class="w-full h-full bg-gradient-to-br from-slate-800 via-purple-900/30 to-slate-800 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                                                <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 pointer-events-none"></div>
                                                <div class="relative z-10 flex flex-col items-center w-full">
                                                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-purple-500/30">
                                                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 18V5l12-3v13M9 18c0 0 1.56 0 2.55-.588C12.54 16.824 13 15.919 13 15s-.46-1.824-1.45-2.412C10.56 12 9 12 9 12v6zm12-3c0 0-1.56 0-2.55.588C17.46 16.176 17 17.081 17 18s.46 1.824 1.45 2.412C18.44 21 20 21 20 21v-6z"></path>
                                                        </svg>
                                                    </div>
                                                    <div class="pm-audio-player w-full" data-path="${item.path}">
                                                        <div class="flex items-center justify-center gap-3 mb-3">
                                                            <button class="pm-audio-play-btn w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all duration-200 hover:scale-105">
                                                                <svg class="pm-audio-play-icon w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M8 5v14l11-7z"/>
                                                                </svg>
                                                                <svg class="pm-audio-pause-icon w-5 h-5 text-white hidden" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                                                </svg>
                                                            </button>
                                                            <span class="pm-audio-time text-xs text-gray-300 font-mono">0:00 / 0:00</span>
                                                        </div>
                                                        <div class="pm-audio-progress w-full rounded-full cursor-pointer mb-3 relative group" style="height: 6px; background-color: rgba(255, 255, 255, 0.15);">
                                                            <div class="pm-audio-progress-bar rounded-full relative" style="width: 0%; height: 6px; background: linear-gradient(90deg, #a855f7, #6366f1);">
                                                                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"></div>
                                                            </div>
                                                        </div>
                                                        <div class="flex items-center justify-center gap-2">
                                                            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                                                            </svg>
                                                            <input type="range" class="pm-audio-volume w-20 cursor-pointer" min="0" max="100" value="100" style="height: 4px; background: rgba(255, 255, 255, 0.15); accent-color: #60a5fa; border-radius: 2px;">
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>`
                                            : item.type === 'video'
                                                ? `<video class="w-full h-full object-cover pm-video-preview" src="${previewUrl}" muted loop playsinline autoplay></video>`
                                                : `<div class="w-full h-full bg-[var(--comfy-input-bg)] flex items-center justify-center">
                                                    <svg class="w-16 h-16 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        ${iconSvg}
                                                    </svg>
                                                </div>`
                            }
                            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-1">
                                <button class="pm-input-download-btn w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center border-0" title="下载">
                                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                    </svg>
                                </button>
                                <button class="pm-input-info-btn w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center border-0" title="详细信息">
                                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="flex flex-col items-start px-3 py-3 flex-shrink-0" style="min-height: 64px;">
                            <p class="text-base font-medium text-[var(--fg)] truncate w-full text-left mb-2">${item.name}</p>
                            <span class="text-xs text-[var(--fg-light)] text-left px-2 py-1 rounded-md bg-black/30">${item.type}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        listEl.querySelectorAll('.card').forEach((card) => {
            const path = card.dataset.path;
            const item = filteredItems.find(i => i.path === path);

            card.addEventListener('click', (e) => {
                if (e.target.closest('.pm-input-info-btn')) {
                    return;
                }
                if (e.target.closest('.pm-input-download-btn')) {
                    return;
                }
                const type = card.dataset.type;

                if (type === 'folder') {
                    this.loadItems(path);
                } else if (this.selectionCallback && type === 'image') {
                    this.selectionCallback(item.path);
                    this.close();
                } else if (type === 'image' || type === 'video') {
                    this.openPreview(path);
                }
            });

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.clientX, e.clientY, item);
            });

            const infoBtn = card.querySelector('.pm-input-info-btn');
            if (infoBtn) {
                infoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showInfoDialog(item);
                });
            }

            const downloadBtn = card.querySelector('.pm-input-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.downloadItem(item);
                });
            }

            const audioPlayer = card.querySelector('.pm-audio-player');
            if (audioPlayer) {
                this.setupAudioPlayer(audioPlayer, item.path);
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

    openPreview(path) {
        const previewUrl = `/pm_input/preview/${encodeURIComponent(path)}`;
        window.open(previewUrl, '_blank');
    }

    setupAudioPlayer(playerEl, path) {
        const audioUrl = `/pm_input/preview/${encodeURIComponent(path)}`;
        const audio = new Audio(audioUrl);
        const playBtn = playerEl.querySelector('.pm-audio-play-btn');
        const playIcon = playerEl.querySelector('.pm-audio-play-icon');
        const pauseIcon = playerEl.querySelector('.pm-audio-pause-icon');
        const timeEl = playerEl.querySelector('.pm-audio-time');
        const progressBar = playerEl.querySelector('.pm-audio-progress');
        const progressFill = playerEl.querySelector('.pm-audio-progress-bar');
        const volumeSlider = playerEl.querySelector('.pm-audio-volume');

        let isPlaying = false;

        // 全局音频管理器
        if (!window.pmGlobalAudioManager) {
            window.pmGlobalAudioManager = {
                currentPlaying: null,
                stopAll: function() {
                    if (this.currentPlaying) {
                        this.currentPlaying.stop();
                    }
                }
            };
        }

        const stopThisAudio = () => {
            audio.pause();
            audio.currentTime = 0;
            isPlaying = false;
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            progressFill.style.width = '0%';
        };

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const updateProgress = () => {
            if (audio.duration) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progressFill.style.width = `${percent}%`;
                timeEl.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
            }
        };

        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isPlaying) {
                audio.pause();
                playIcon.classList.remove('hidden');
                pauseIcon.classList.add('hidden');
                isPlaying = false;
                window.pmGlobalAudioManager.currentPlaying = null;
            } else {
                // 停止其他正在播放的音频
                window.pmGlobalAudioManager.stopAll();
                // 播放当前音频
                audio.play();
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
                isPlaying = true;
                window.pmGlobalAudioManager.currentPlaying = { stop: stopThisAudio };
            }
        });

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', () => {
            timeEl.textContent = `0:00 / ${formatTime(audio.duration)}`;
        });
        audio.addEventListener('ended', () => {
            isPlaying = false;
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            progressFill.style.width = '0%';
            timeEl.textContent = `0:00 / ${formatTime(audio.duration || 0)}`;
        });

        // 进度条拖动功能
        let isDragging = false;

        const updateProgressFromEvent = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left);
            let percent = (x - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            return percent;
        };

        const handleStart = (e) => {
            e.stopPropagation();
            if (!audio.duration) return;
            isDragging = true;
            const percent = updateProgressFromEvent(e);
            audio.currentTime = percent * audio.duration;
            progressFill.style.width = `${percent * 100}%`;
        };

        const handleMove = (e) => {
            if (!isDragging || !audio.duration) return;
            e.stopPropagation();
            e.preventDefault();
            const percent = updateProgressFromEvent(e);
            audio.currentTime = percent * audio.duration;
            progressFill.style.width = `${percent * 100}%`;
            timeEl.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        };

        const handleEnd = () => {
            isDragging = false;
        };

        // 鼠标事件
        progressBar.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);

        // 触摸事件（移动端支持）
        progressBar.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);

        volumeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            audio.volume = e.target.value / 100;
        });

        playerEl._audio = audio;
    }

    async show(options = {}) {
        this.hideEmptyFolders = options.hideEmptyFolders || false;
        this.selectionCallback = options.selectionCallback || null;
        if (options.fixedFilter) {
            this.filterType = options.fixedFilter;
        } else {
            this.filterType = 'all';
        }
        this.dialog.style.display = 'block';
        await this.loadItems('');
    }

    close() {
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
                <div class="pm-context-menu-item" data-action="download">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    下载
                </div>
                <div class="pm-context-menu-item" data-action="rename">
                    <svg class="pm-context-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    重命名
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
                <input type="text" id="pm-prompt-input" class="w-full px-4 py-2 rounded-lg bg-[var(--comfy-input-bg)] border border-[var(--border-color)] text-[var(--fg)] mb-4 focus:outline-none focus:border-green-500">
                <div class="flex justify-end gap-3">
                    <button id="pm-prompt-cancel" class="px-4 py-2 rounded-lg hover:bg-[var(--comfy-input-bg)] text-[var(--fg-light)] transition-colors">取消</button>
                    <button id="pm-prompt-confirm" class="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 text-white hover:opacity-90 transition-opacity">确定</button>
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
            case 'download':
                this.downloadItem(item);
                break;
            case 'rename':
                await this.renameItem(item);
                break;
            case 'delete':
                await this.deleteItem(item);
                break;
            case 'new-folder':
                this.createNewFolder();
                break;
        }
    }

    downloadItem(item) {
        if (!item || item.type === 'folder') return;
        
        const downloadUrl = `/pm_input/preview/${encodeURIComponent(item.path)}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    renameItem(item) {
        const oldName = item.name;
        
        this.showPromptDialog('重命名', '请输入新名称:', oldName, async (newName) => {
            if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
            
            try {
                const response = await fetchWithUser('/pm_input/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        old_path: item.path,
                        new_name: newName.trim()
                    })
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
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
            : `确定要删除文件 "${item.name}" 吗？`;
        
        this.showConfirmDialog('确认删除', confirmMsg, '删除', async (confirmed) => {
            if (!confirmed) return;
            
            try {
                const response = await fetchWithUser(`/pm_input/delete/${encodeURIComponent(item.path)}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
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

    createNewFolder() {
        this.showPromptDialog('新建文件夹', '请输入文件夹名称:', '新建文件夹', async (name) => {
            if (!name || name.trim() === '') return;
            
            const folderName = name.trim();
            
            try {
                const response = await fetchWithUser('/pm_input/new_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: this.currentPath,
                        name: folderName
                    })
                });
                
                if (response.ok) {
                    await this.loadItems(this.currentPath);
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

    async showInfoDialog(item) {
        try {
            const response = await fetchWithUser(`/pm_input/info/${encodeURIComponent(item.path)}`);
            const info = await response.json();
            
            if (!this.infoDialog) {
                this.createInfoDialog();
            }
            
            let html = `
                <div class="grid grid-cols-2 gap-4">
                    <div class="info-card p-4">
                        <p class="text-sm text-[var(--fg-light)] mb-1">名称</p>
                        <p class="text-[var(--fg)] font-medium">${info.name}</p>
                    </div>
                    <div class="info-card p-4">
                        <p class="text-sm text-[var(--fg-light)] mb-1">类型</p>
                        <p class="text-[var(--fg)] font-medium">${info.type}</p>
                    </div>
            `;
            
            if (info.size) {
                html += `
                    <div class="info-card p-4">
                        <p class="text-sm text-[var(--fg-light)] mb-1">大小</p>
                        <p class="text-[var(--fg)] font-medium">${info.size}</p>
                    </div>
                `;
            }
            
            if (info.extension) {
                html += `
                    <div class="info-card p-4">
                        <p class="text-sm text-[var(--fg-light)] mb-1">扩展名</p>
                        <p class="text-[var(--fg)] font-medium">${info.extension}</p>
                    </div>
                `;
            }
            
            if (info.created_time) {
                html += `
                    <div class="info-card p-4 col-span-2">
                        <p class="text-sm text-[var(--fg-light)] mb-1">创建时间</p>
                        <p class="text-[var(--fg)] font-medium">${info.created_time}</p>
                    </div>
                `;
            }
            
            if (info.modified_time) {
                html += `
                    <div class="info-card p-4 col-span-2">
                        <p class="text-sm text-[var(--fg-light)] mb-1">修改时间</p>
                        <p class="text-[var(--fg)] font-medium">${info.modified_time}</p>
                    </div>
                `;
            }
            
            if (info.file_count !== undefined) {
                html += `
                    <div class="info-card p-4">
                        <p class="text-sm text-[var(--fg-light)] mb-1">文件数量</p>
                        <p class="text-[var(--fg)] font-medium">${info.file_count}</p>
                    </div>
                `;
            }
            
            html += '</div>';

            this.infoDialog.querySelector('#pm-info-body').innerHTML = html;
            this.infoDialog.style.display = 'flex';
        } catch (error) {
            console.error('Get info error:', error);
        }
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
                    border-color: rgba(34, 197, 94, 0.4);
                    box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
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
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center shadow-lg">
                            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent" id="pm-info-title">详细信息</h3>
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

    hideInfoDialog() {
        if (this.infoDialog) {
            this.infoDialog.style.display = 'none';
        }
    }
}

const pmInputDialog = new PMInputDialog();

app.registerExtension({
    name: "ComfyUI.PMInput",
    
    init() {
    },
    
    dialog: pmInputDialog,
    
    setup() {
        const insertButton = () => {
            const existingTab = document.getElementById('pm-input-tab');
            if (existingTab) {
                existingTab.remove();
            }
            
            const sidebarGroups = document.querySelectorAll('.sidebar-item-group');
            
            if (sidebarGroups.length > 0) {
                const firstGroup = sidebarGroups[0];
                
                const pmModelButton = document.getElementById('pm-model-tab');
                
                if (pmModelButton) {
                    const pmButton = pmModelButton.cloneNode(true);
                    pmButton.id = 'pm-input-tab';
                    
                    const label = pmButton.querySelector('.side-bar-button-label');
                    if (label) {
                        label.textContent = 'PM输入';
                    }
                    
                    const iconEl = pmButton.querySelector('.side-bar-button-icon, svg');
                    if (iconEl) {
                        iconEl.outerHTML = '<svg class="side-bar-button-icon" style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>';
                    }
                    
                    pmButton.onclick = function() {
                        pmInputDialog.show();
                    };
                    
                    if (pmModelButton.nextSibling) {
                        firstGroup.insertBefore(pmButton, pmModelButton.nextSibling);
                    } else {
                        firstGroup.appendChild(pmButton);
                    }
                } else {
                    return false;
                }
                return true;
            }
            return false;
        };
        
        if (insertButton()) {
            return;
        }
        
        const observer = new MutationObserver((mutations, obs) => {
            if (insertButton()) {
                obs.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            insertButton();
        }, 1000);
    }
});
