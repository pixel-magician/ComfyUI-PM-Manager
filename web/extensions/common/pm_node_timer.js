import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { t } from "./i18n.js";

/**
 * PM Manager Node Timer Extension
 * 显示节点运行时间，包括子图节点
 */

// 存储节点开始时间
const nodeStartTimes = new Map();
let lastExecutingNodeId = null;

// 调试模式
const DEBUG = false;
function log(...args) {
    if (DEBUG) console.log('[PM Timer]', ...args);
}

// 获取设置值
function getNodeTimerEnabled() {
    if (app.ui && app.ui.settings) {
        const value = app.ui.settings.getSettingValue('PMManager.ShowNodeTimer');
        return value !== false; // 默认开启
    }
    return true;
}

// 获取所有节点（包括子图内的节点）
function getAllNodes() {
    const nodes = [];
    
    // 添加主图节点
    if (app.graph && app.graph._nodes) {
        nodes.push(...app.graph._nodes);
        
        // 添加子图内节点
        for (const node of app.graph._nodes) {
            if (node.subgraph && node.subgraph._nodes) {
                nodes.push(...node.subgraph._nodes);
            }
        }
    }
    
    return nodes;
}

// 从所有可能的图中查找节点
function findNodeById(nodeId) {
    if (!nodeId) return null;
    
    // 处理子图节点 ID 格式（可能包含 : 分隔符）
    const idStr = String(nodeId);
    const idParts = idStr.split(':');
    const id = parseInt(idParts[idParts.length - 1]);
    
    if (isNaN(id)) {
        log('Invalid node ID:', nodeId);
        return null;
    }
    
    log('Looking for node:', id, 'from original:', nodeId);
    
    // 首先尝试在主图中查找
    if (app.graph) {
        const node = app.graph.getNodeById(id);
        if (node) {
            log('Found node in main graph:', id);
            return node;
        }
        
        // 遍历所有子图
        for (const n of app.graph._nodes || []) {
            if (n.subgraph && n.subgraph._nodes) {
                const subNode = n.subgraph.getNodeById(id);
                if (subNode) {
                    log('Found node in subgraph:', id, 'parent:', n.id);
                    return subNode;
                }
            }
        }
    }
    
    // 如果上面没找到，遍历所有节点
    for (const node of getAllNodes()) {
        if (node.id === id) {
            log('Found node by iteration:', id);
            return node;
        }
    }
    
    log('Node not found:', id);
    return null;
}

// 统一的时间标签样式配置
const TIMER_STYLE = {
    padding: 6,
    height: 18,
    fontSize: 10,
    borderRadius: 4,
    yOffset: -20,  // 相对于节点标题的偏移
    bgColor: "rgba(0, 150, 0, 0.85)",
    borderColor: "rgba(0, 200, 0, 0.9)",
    textColor: "#ffffff",
    oldBgColor: "rgba(100, 100, 100, 0.85)",
    oldBorderColor: "rgba(120, 120, 120, 0.9)",
    oldTextColor: "#cccccc"
};

// 统一的时间标签绘制函数（在节点坐标系中）
function drawTimerLabel(ctx, text, isExecuting = false, isOld = false) {
    const { padding, height, fontSize, borderRadius, yOffset, bgColor, borderColor, textColor, oldBgColor, oldBorderColor, oldTextColor } = TIMER_STYLE;
    
    ctx.save();
    
    // 测量文本宽度
    ctx.font = `${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + padding * 2;
    
    // 在节点左上角绘制时间标签
    const x = 4;
    const y = -LiteGraph.NODE_TITLE_HEIGHT + yOffset;
    
    // 确定使用的颜色
    let useBgColor, useBorderColor, useTextColor;
    if (isExecuting) {
        useBgColor = "rgba(200, 150, 0, 0.85)";
        useBorderColor = "rgba(255, 200, 0, 0.9)";
        useTextColor = textColor;
    } else if (isOld) {
        useBgColor = oldBgColor;
        useBorderColor = oldBorderColor;
        useTextColor = oldTextColor;
    } else {
        useBgColor = bgColor;
        useBorderColor = borderColor;
        useTextColor = textColor;
    }
    
    // 绘制背景圆角矩形
    ctx.fillStyle = useBgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, height, borderRadius);
    ctx.fill();
    
    // 绘制边框
    ctx.strokeStyle = useBorderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 绘制文本
    ctx.fillStyle = useTextColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + boxWidth / 2, y + height / 2);
    
    ctx.restore();
    
    return boxWidth;
}

// 在全局坐标系中绘制时间标签
function drawTimerLabelGlobal(ctx, node, text, isExecuting = false) {
    const { padding, height, fontSize, borderRadius, yOffset, bgColor, borderColor, textColor } = TIMER_STYLE;
    
    ctx.save();
    
    // 测量文本宽度
    ctx.font = `${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + padding * 2;
    
    // 计算节点在全局坐标系中的位置
    let nodeX = 0, nodeY = 0;
    
    // 尝试不同的方式获取节点位置
    if (node.pos && Array.isArray(node.pos)) {
        nodeX = node.pos[0];
        nodeY = node.pos[1];
    } else if (node.pos && typeof node.pos === 'object') {
        nodeX = node.pos.x || 0;
        nodeY = node.pos.y || 0;
    }
    
    // 如果位置无效，尝试 getBounding
    if ((isNaN(nodeX) || isNaN(nodeY)) && node.getBounding) {
        const bounds = node.getBounding();
        if (bounds) {
            nodeX = bounds.x || bounds[0] || 0;
            nodeY = bounds.y || bounds[1] || 0;
        }
    }
    
    // 考虑 canvas 的缩放和平移变换
    const transform = ctx.getTransform();
    const scale = Math.sqrt(transform.a * transform.a + transform.b * transform.b) || 1;
    
    const x = nodeX + 4;
    const y = nodeY + yOffset;
    
    if (isNaN(x) || isNaN(y)) {
        log('Invalid position for node:', node.id, 'pos:', node.pos);
        ctx.restore();
        return 0;
    }
    
    // 重置变换矩阵，在屏幕坐标系中绘制
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // 将节点坐标转换为屏幕坐标
    const screenX = transform.a * x + transform.c * y + transform.e;
    const screenY = transform.b * x + transform.d * y + transform.f;
    
    // 绘制背景圆角矩形
    ctx.fillStyle = isExecuting ? "rgba(200, 150, 0, 0.85)" : bgColor;
    ctx.beginPath();
    ctx.roundRect(screenX, screenY, boxWidth, height, borderRadius);
    ctx.fill();
    
    // 绘制边框
    ctx.strokeStyle = isExecuting ? "rgba(255, 200, 0, 0.9)" : borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 绘制文本
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, screenX + boxWidth / 2, screenY + height / 2);
    
    ctx.restore();
    
    return boxWidth;
}

// 绘制节点时间
function drawNodeTime(ctx, node, timeSeconds) {
    if (!timeSeconds || timeSeconds <= 0) return;
    if (!getNodeTimerEnabled()) return;
    
    const text = timeSeconds.toFixed(2) + "s";
    drawTimerLabel(ctx, text);
}

// 绘制子图节点内部节点的时间
function drawSubgraphNodeTime(ctx, node, timeSeconds) {
    if (!timeSeconds || timeSeconds <= 0) return;
    if (!getNodeTimerEnabled()) return;
    
    const text = timeSeconds.toFixed(2) + "s";
    drawTimerLabel(ctx, text);
}

// 绘制子图节点本身的时间（GroupNode）
function drawGroupNodeTime(ctx, node, timeSeconds) {
    if (!timeSeconds || timeSeconds <= 0) return;
    if (!getNodeTimerEnabled()) return;
    
    const text = timeSeconds.toFixed(2) + "s";
    drawTimerLabel(ctx, text);
}

// 检查节点是否是子图节点（GroupNode）
function isGroupNode(node) {
    if (!node) return false;
    
    // 检查各种可能的属性
    if (node.comfyClass === 'GroupNode' || node.type === 'GroupNode' || node.type === 'Graph/GroupNode') {
        return true;
    }
    
    // 检查 properties
    if (node.properties) {
        if (node.properties['GroupNode'] || node.properties['isGroupNode']) {
            return true;
        }
    }
    
    // 检查是否有 subgraph 对象
    if (node.subgraph && typeof node.subgraph === 'object') {
        // 确保 subgraph 是一个有效的 LGraph 实例（有 _nodes 属性）
        if (node.subgraph._nodes && Array.isArray(node.subgraph._nodes)) {
            return true;
        }
    }
    
    // 检查节点标题或名称
    if (node.title && (node.title.includes('Group') || node.title.includes('子图'))) {
        // 进一步检查是否有子图特征
        if (node.subgraph) return true;
    }
    
    return false;
}

// 检查节点是否在子图内部
function isNodeInSubgraph(node) {
    if (!node) return false;
    
    // 检查节点的 graph 是否是子图
    if (node.graph && node.graph !== app.graph) {
        return true;
    }
    
    // 检查节点是否属于 GroupNode（子图）
    const parent = node.getParent ? node.getParent() : null;
    if (parent) return true;
    
    // 检查节点是否有 subgraph 上下文
    if (node.flags && node.flags.subgraph) return true;
    
    // 检查节点是否在子图列表中
    if (app.graph && app.graph._nodes) {
        for (const n of app.graph._nodes) {
            if (n.subgraph && n.subgraph._nodes) {
                for (const subNode of n.subgraph._nodes) {
                    if (subNode.id === node.id) return true;
                }
            }
        }
    }
    
    return false;
}

// 获取节点所在的子图节点
function getParentGroupNode(node) {
    if (!node) return null;
    
    // 如果节点有 graph，检查是否是子图
    if (node.graph && node.graph !== app.graph) {
        // 查找这个子图属于哪个 GroupNode
        if (app.graph && app.graph._nodes) {
            for (const n of app.graph._nodes) {
                if (n.subgraph === node.graph) {
                    log('Found parent by graph match:', n.id);
                    return n;
                }
            }
        }
    }
    
    // 尝试获取父节点
    const parent = node.getParent ? node.getParent() : null;
    if (parent && isGroupNode(parent)) {
        log('Found parent by getParent:', parent.id);
        return parent;
    }
    
    // 检查节点是否在子图列表中
    if (app.graph && app.graph._nodes) {
        for (const n of app.graph._nodes) {
            if (n.subgraph && n.subgraph._nodes) {
                for (const subNode of n.subgraph._nodes) {
                    if (subNode.id === node.id) {
                        log('Found parent by iteration:', n.id);
                        return n;
                    }
                }
            }
        }
    }
    
    return null;
}

// 绘制正在执行的指示器
function drawExecutingIndicator(ctx, node) {
    if (!getNodeTimerEnabled()) return;
    
    const startTime = nodeStartTimes.get(String(node.id));
    if (!startTime) return;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const text = elapsed.toFixed(1) + "s";
    drawTimerLabel(ctx, text, true);
    
    // 请求重绘以更新计时
    requestAnimationFrame(() => {
        if (node.pmIsExecuting) {
            node.setDirtyCanvas(true, false);
        }
    });
}

// 标记所有节点的时间数据为旧的
function clearAllNodeTimes() {
    for (const node of getAllNodes()) {
        node.pmIsExecuting = false;
        if (node.pmExecutionTime) {
            node.pmExecutionTimeIsOld = true;
        }
        if (node.pmSubgraphTime) {
            node.pmSubgraphTimeIsOld = true;
        }
    }
}

// 注册扩展
app.registerExtension({
    name: "ComfyUI.PMManager.NodeTimer",
    
    setup() {
        log('Setting up PM Node Timer extension');
        
        // 直接在 LGraphNode 原型上添加绘制逻辑
        const origOnDrawForeground = LiteGraph.LGraphNode.prototype.onDrawForeground;
        LiteGraph.LGraphNode.prototype.onDrawForeground = function(ctx) {
            // 调用原始方法
            if (origOnDrawForeground) {
                origOnDrawForeground.call(this, ctx);
            }
            
            // 绘制时间标签
            if (!getNodeTimerEnabled()) return;
            
            // 如果正在执行，优先显示正在执行的时间
            if (this.pmIsExecuting) {
                const startTime = nodeStartTimes.get(String(this.id));
                if (startTime) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const text = elapsed.toFixed(1) + "s";
                    drawTimerLabel(ctx, text, true);
                }
            }
            // 如果节点有子图累计时间
            else if (this.pmSubgraphTime && this.pmSubgraphTime > 0) {
                const text = this.pmSubgraphTime.toFixed(2) + "s";
                const isOld = this.pmSubgraphTimeIsOld || false;
                drawTimerLabel(ctx, text, false, isOld);
            }
            // 如果节点有普通执行时间
            else if (this.pmExecutionTime && this.pmExecutionTime > 0) {
                const text = this.pmExecutionTime.toFixed(2) + "s";
                const isOld = this.pmExecutionTimeIsOld || false;
                drawTimerLabel(ctx, text, false, isOld);
            }
        };
        
        // 在 LGraphNode 原型上添加 serialize 方法支持
        const origSerialize = LiteGraph.LGraphNode.prototype.serialize;
        LiteGraph.LGraphNode.prototype.serialize = function() {
            const data = origSerialize ? origSerialize.call(this) : {};
            // 保存时间数据
            if (this.pmExecutionTime) {
                data.pmExecutionTime = this.pmExecutionTime;
                data.pmExecutionTimeIsOld = this.pmExecutionTimeIsOld || false;
            }
            if (this.pmSubgraphTime) {
                data.pmSubgraphTime = this.pmSubgraphTime;
                data.pmSubgraphTimeIsOld = this.pmSubgraphTimeIsOld || false;
            }
            return data;
        };
        
        // 在 LGraphNode 原型上添加 configure 方法支持
        const origConfigure = LiteGraph.LGraphNode.prototype.configure;
        LiteGraph.LGraphNode.prototype.configure = function(data) {
            if (origConfigure) {
                origConfigure.call(this, data);
            }
            // 恢复时间数据并标记为旧的
            if (data.pmExecutionTime) {
                this.pmExecutionTime = data.pmExecutionTime;
                this.pmExecutionTimeIsOld = true;
            }
            if (data.pmSubgraphTime) {
                this.pmSubgraphTime = data.pmSubgraphTime;
                this.pmSubgraphTimeIsOld = true;
            }
        };
        
        // 监听执行开始事件 - 清除所有节点的时间
        api.addEventListener("execution_start", (data) => {
            log('execution_start', data);
            clearAllNodeTimes();
            nodeStartTimes.clear();
            lastExecutingNodeId = null;
        });
        
        // 监听执行进度事件
        api.addEventListener("executing", (data) => {
            log('executing', data);
            
            // 处理不同的事件数据格式
            let nodeId = null;
            if (data?.detail) {
                nodeId = data.detail;
            } else if (data?.node) {
                nodeId = data.node;
            } else if (typeof data === 'number' || typeof data === 'string') {
                nodeId = data;
            }
            
            if (!nodeId) return;
            
            const currentTime = Date.now();
            
            // 处理上一个节点
            if (lastExecutingNodeId && lastExecutingNodeId !== nodeId) {
                const lastNode = findNodeById(lastExecutingNodeId);
                if (lastNode) {
                    const startTime = nodeStartTimes.get(String(lastNode.id));
                    if (startTime) {
                        const duration = (currentTime - startTime) / 1000;
                        const node = lastNode;
                        // 设置新的执行时间，清除旧标记
                        node.pmExecutionTime = duration;
                        node.pmExecutionTimeIsOld = false;
                        node.pmIsExecuting = false;
                        
                        log('Node finished:', node.id, 'time:', node.pmExecutionTime);
                        
                        // 如果是子图内的节点，设置父节点的总时间
                        const parentGroup = getParentGroupNode(node);
                        if (parentGroup) {
                            // 初始化子图时间或累加
                            if (!parentGroup.pmSubgraphTime) parentGroup.pmSubgraphTime = 0;
                            // 检查是否是旧的子图时间
                            if (parentGroup.pmSubgraphTimeIsOld) {
                                // 如果是旧的，直接设置新时间
                                parentGroup.pmSubgraphTime = duration;
                            } else {
                                // 如果是新的，继续累加
                                parentGroup.pmSubgraphTime += duration;
                            }
                            // 清除旧标记
                            parentGroup.pmSubgraphTimeIsOld = false;
                            log('Added to parent group:', parentGroup.id, 'total:', parentGroup.pmSubgraphTime);
                            // 触发父节点重绘以显示时间
                            parentGroup.setDirtyCanvas(true, true);
                        }
                        
                        node.setDirtyCanvas(true, true);
                    }
                }
            }
            
            // 处理当前节点
            const node = findNodeById(nodeId);
            if (node) {
                node.pmIsExecuting = true;
                nodeStartTimes.set(String(node.id), currentTime);
                node.setDirtyCanvas(true, false);
                log('Node executing:', node.id);
                lastExecutingNodeId = String(node.id);
            } else {
                lastExecutingNodeId = nodeId;
            }
        });
        
        // 监听执行完成事件
        api.addEventListener("executed", (data) => {
            log('executed', data);
            
            let nodeId = null;
            if (data?.detail?.node) {
                nodeId = data.detail.node;
            } else if (data?.node) {
                nodeId = data.node;
            }
            
            if (nodeId) {
                const node = findNodeById(nodeId);
                if (node) {
                    const nodeKey = String(node.id);
                    if (lastExecutingNodeId === nodeKey) {
                        const startTime = nodeStartTimes.get(nodeKey);
                        if (startTime) {
                            const duration = (Date.now() - startTime) / 1000;
                            node.pmExecutionTime = duration;
                            node.pmExecutionTimeIsOld = false;
                            node.pmIsExecuting = false;
                            
                            log('Node executed:', node.id, 'time:', node.pmExecutionTime);
                            
                            // 如果是子图内的节点，设置父节点的总时间
                            const parentGroup = getParentGroupNode(node);
                            if (parentGroup) {
                                // 初始化子图时间或累加
                                if (!parentGroup.pmSubgraphTime) parentGroup.pmSubgraphTime = 0;
                                // 检查是否是旧的子图时间
                                if (parentGroup.pmSubgraphTimeIsOld) {
                                    // 如果是旧的，直接设置新时间
                                    parentGroup.pmSubgraphTime = duration;
                                } else {
                                    // 如果是新的，继续累加
                                    parentGroup.pmSubgraphTime += duration;
                                }
                                // 清除旧标记
                                parentGroup.pmSubgraphTimeIsOld = false;
                                // 触发父节点重绘以显示时间
                                parentGroup.setDirtyCanvas(true, true);
                            }
                            
                            node.setDirtyCanvas(true, true);
                        }
                        nodeStartTimes.delete(nodeKey);
                        lastExecutingNodeId = null;
                    }
                }
            }
        });
    },
    
    beforeRegisterNodeDef(nodeType, nodeData) {
        // 保存原始的 onDrawForeground 方法
        const origDrawForeground = nodeType.prototype.onDrawForeground;
        
        // 重写 onDrawForeground 方法来绘制时间
        nodeType.prototype.onDrawForeground = function(ctx) {
            // 调用原始方法
            if (origDrawForeground) {
                origDrawForeground.apply(this, arguments);
            }
            
            // 绘制时间标签
            if (!getNodeTimerEnabled()) return;
            
            // 如果正在执行，优先显示正在执行的时间
            if (this.pmIsExecuting) {
                const startTime = nodeStartTimes.get(String(this.id));
                if (startTime) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const text = elapsed.toFixed(1) + "s";
                    drawTimerLabel(ctx, text, true);
                }
            }
            // 如果节点有子图累计时间
            else if (this.pmSubgraphTime && this.pmSubgraphTime > 0) {
                const text = this.pmSubgraphTime.toFixed(2) + "s";
                const isOld = this.pmSubgraphTimeIsOld || false;
                drawTimerLabel(ctx, text, false, isOld);
            }
            // 如果节点有普通执行时间
            else if (this.pmExecutionTime && this.pmExecutionTime > 0) {
                const text = this.pmExecutionTime.toFixed(2) + "s";
                const isOld = this.pmExecutionTimeIsOld || false;
                drawTimerLabel(ctx, text, false, isOld);
            }
        };
        
        // 保存原始的 serialize 方法
        const origSerialize = nodeType.prototype.serialize;
        nodeType.prototype.serialize = function() {
            const data = origSerialize ? origSerialize.call(this) : {};
            // 保存时间数据
            if (this.pmExecutionTime) {
                data.pmExecutionTime = this.pmExecutionTime;
                data.pmExecutionTimeIsOld = this.pmExecutionTimeIsOld || false;
            }
            if (this.pmSubgraphTime) {
                data.pmSubgraphTime = this.pmSubgraphTime;
                data.pmSubgraphTimeIsOld = this.pmSubgraphTimeIsOld || false;
            }
            return data;
        };
        
        // 保存原始的 configure 方法
        const origConfigure = nodeType.prototype.configure;
        nodeType.prototype.configure = function(data) {
            if (origConfigure) {
                origConfigure.call(this, data);
            }
            // 恢复时间数据并标记为旧的
            if (data.pmExecutionTime) {
                this.pmExecutionTime = data.pmExecutionTime;
                this.pmExecutionTimeIsOld = true;
            }
            if (data.pmSubgraphTime) {
                this.pmSubgraphTime = data.pmSubgraphTime;
                this.pmSubgraphTimeIsOld = true;
            }
        };
    },
    
    // 支持保存/加载执行时间数据
    loadedGraphNode(node) {
        // 加载时标记时间数据为旧的（如果有的话）
        node.pmIsExecuting = false;
        if (node.pmExecutionTime) {
            node.pmExecutionTimeIsOld = true;
        }
        if (node.pmSubgraphTime) {
            node.pmSubgraphTimeIsOld = true;
        }
    }
});

console.log("[PM Manager] Node Timer extension loaded");
