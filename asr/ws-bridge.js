/**
 * WebSocket桥接服务 
 * 用于建立调用端与被调用端之间的通信，并与后端保持会话一致性
 */

// 存储WebSocket连接和会话ID的映射关系
const connections = new Map();

// 是否已初始化
let isInitialized = false;

// 后端WebSocket连接
let backendWs = null;

// 聊天消息广播系统
// 用于在不同页面之间同步聊天消息

// 全局变量：是否在页面加载时清空历史消息，默认为true
window.shouldClearHistoryOnLoad = true;

class ChatBroadcastService {
    constructor() {
        this.channelName = 'chat-broadcast-channel';
        this.localStorage = window.localStorage;
        this.subscribers = [];
        this.messageProcessors = []; // 添加消息处理器数组
        
        // 初始化监听
        this.initListeners();
        
        // 如果设置了清空历史，则在初始化时清空
        if (window.shouldClearHistoryOnLoad) {
            this.clearAllMessages();
            console.log('页面加载时已清空历史对话消息');
        }
        
        console.log('ChatBroadcastService 初始化完成');
    }
    
    // 清空所有消息历史
    clearAllMessages() {
        try {
            this.localStorage.removeItem(this.channelName);
            this.localStorage.removeItem(this.channelName + '_latest');
            console.log('已清空所有历史对话消息');
        } catch (e) {
            console.error('清空历史对话消息失败:', e);
        }
    }
    
    // 初始化事件监听器
    initListeners() {
        // 监听localStorage变化 - 修复为同时监听列表和最新消息
        window.addEventListener('storage', (event) => {
            // 监听单条消息的变化
            if (event.key === this.channelName + '_latest') {
                try {
                    const data = JSON.parse(event.newValue);
                    if (data && data.message) {
                        console.log('收到最新消息:', data);
                        
                        // 设置消息来源为远程，表示来自其他页面
                        data.source = 'remote';
                        
                        // 通知订阅者
                        this.notifySubscribers(data);
                        
                        // 交给处理器处理
                        this.processMessage(data);
                    }
                } catch (e) {
                    console.error('解析最新消息失败:', e);
                }
            }
            // 保持对完整列表的监听
            else if (event.key === this.channelName) {
                try {
                    const messages = JSON.parse(event.newValue);
                    if (messages && messages.length > 0) {
                        const latestMsg = messages[messages.length - 1];
                        console.log('收到消息列表更新，最新消息:', latestMsg);
                    }
                } catch (e) {
                    console.error('解析消息列表失败:', e);
                }
            }
        });
        
        // 清理旧消息
        this.cleanupOldMessages();
    }
    
    // 广播消息到所有页面
    broadcastMessage(message, position) {
        const timestamp = new Date().getTime();
        const data = {
            id: `msg_${timestamp}`,
            message: message,
            position: position,
            timestamp: timestamp,
            source: 'local' // 标记消息来源为本地
        };
        
        try {
            // 将消息存入localStorage
            const messages = this.getStoredMessages();
            messages.push(data);
            
            // 最多保留最新的30条消息
            if (messages.length > 30) {
                messages.shift();
            }
            
            // 关键修复：直接设置单个消息，以确保触发storage事件
            this.localStorage.setItem(this.channelName + '_latest', JSON.stringify(data));
            
            // 再更新完整消息列表
            this.localStorage.setItem(this.channelName, JSON.stringify(messages));
            
            // 通知当前页面的订阅者，但不处理本地发出的消息
            this.notifySubscribers(data);
        } catch (e) {
            console.error('广播消息失败:', e);
        }
    }
    
    // 添加消息处理器
    addMessageProcessor(processor) {
        if (typeof processor === 'function') {
            this.messageProcessors.push(processor);
            return true;
        }
        return false;
    }
    
    // 处理消息
    processMessage(data) {
        // 只有来自其他页面的消息才交给处理器处理
        // 本地页面发出的消息已经在 addChatMessageToDOM 中处理过，无需重复处理
        if (data.source !== 'local') {
            this.messageProcessors.forEach(processor => {
                try {
                    processor(data);
                } catch (e) {
                    console.error('消息处理器错误:', e);
                }
            });
        }
    }
    
    // 获取存储的消息
    getStoredMessages() {
        try {
            const data = this.localStorage.getItem(this.channelName);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('获取存储的消息失败:', e);
            return [];
        }
    }
    
    // 清理超过1小时的旧消息
    cleanupOldMessages() {
        try {
            const messages = this.getStoredMessages();
            const now = new Date().getTime();
            const oneHourAgo = now - (60 * 60 * 1000);
            
            const filteredMessages = messages.filter(msg => msg.timestamp > oneHourAgo);
            
            if (filteredMessages.length !== messages.length) {
                this.localStorage.setItem(this.channelName, JSON.stringify(filteredMessages));
                console.log(`已清理 ${messages.length - filteredMessages.length} 条旧消息`);
            }
        } catch (e) {
            console.error('清理旧消息失败:', e);
        }
    }
    
    // 订阅消息通知
    subscribe(callback) {
        if (typeof callback === 'function') {
            this.subscribers.push(callback);
            return true;
        }
        return false;
    }
    
    // 取消订阅
    unsubscribe(callback) {
        const index = this.subscribers.indexOf(callback);
        if (index !== -1) {
            this.subscribers.splice(index, 1);
            return true;
        }
        return false;
    }
    
    // 通知所有订阅者
    notifySubscribers(data) {
        this.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error('通知订阅者失败:', e);
            }
        });
    }
}

// 创建全局实例
window.chatBroadcastService = new ChatBroadcastService();

// 提供控制历史清理的全局函数
window.setClearHistoryOnLoad = function(shouldClear) {
    window.shouldClearHistoryOnLoad = shouldClear;
    console.log(`设置页面加载时${shouldClear ? '清空' : '保留'}历史对话消息`);
    
    // 保存设置到localStorage
    try {
        localStorage.setItem('shouldClearHistoryOnLoad', shouldClear);
    } catch (e) {
        console.error('保存清空历史设置失败:', e);
    }
};

// 初始化WebSocket桥接服务
function initWsBridge() {
    if (isInitialized) return;
    
    // 监听来自父窗口的消息
    window.addEventListener('message', handleParentMessage);
    
    // 向父窗口发送就绪消息
    notifyReady();
    
    isInitialized = true;
    console.log('WebSocket桥接服务已初始化');
}

// 向父窗口发送就绪消息
function notifyReady() {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'ws_bridge_ready',
            source: 'ws-bridge'
        }, '*');
        console.log('已向父窗口发送就绪消息');
    }
}

// 处理来自父窗口的消息
function handleParentMessage(event) {
    // 可以根据需要验证消息来源
    // if (event.origin !== expectedOrigin) return;
    
    const data = event.data;
    
    if (!data || typeof data !== 'object') return;
    
    // 处理连接请求
    if (data.type === 'ws_connect' && data.sessionId) {
        connectToBackend(data.sessionId, event.source);
    }
    
    // 处理发送消息请求
    if (data.type === 'ws_send' && data.sessionId && data.message) {
        sendToBackend(data.sessionId, data.message);
    }
    
    // 处理断开连接请求
    if (data.type === 'ws_disconnect' && data.sessionId) {
        disconnectFromBackend(data.sessionId);
    }
}

// 连接到后端WebSocket服务
function connectToBackend(sessionId, source) {
    // 如果已存在相同sessionId的连接，先断开
    if (connections.has(sessionId)) {
        disconnectFromBackend(sessionId);
    }
    
    // 构建WebSocket URL，使用传入的sessionId
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // 这里假设后端WebSocket服务器端口是8018，根据实际情况调整
    const wsUrl = `${protocol}//${host}:8018/ws?sessionid=${sessionId}`;
    
    try {
        // 创建到后端的WebSocket连接
        const ws = new WebSocket(wsUrl);
        
        // 存储连接信息
        connections.set(sessionId, {
            ws: ws,
            source: source,
            status: 'connecting'
        });
        
        // 设置WebSocket事件处理
        ws.onopen = () => {
            console.log(`后端WebSocket连接已建立: sessionId=${sessionId}`);
            connections.get(sessionId).status = 'connected';
            
            // 向调用端发送连接成功消息
            source.postMessage({
                type: 'ws_status',
                sessionId: sessionId,
                status: 'connected'
            }, '*');
        };
        
        ws.onmessage = (event) => {
            console.log(`收到后端消息: sessionId=${sessionId}`, event.data);
            
            // 向调用端转发消息
            source.postMessage({
                type: 'ws_message',
                sessionId: sessionId,
                data: event.data
            }, '*');
        };
        
        ws.onclose = () => {
            console.log(`后端WebSocket连接已关闭: sessionId=${sessionId}`);
            
            // 向调用端发送连接关闭消息
            source.postMessage({
                type: 'ws_status',
                sessionId: sessionId,
                status: 'disconnected'
            }, '*');
            
            // 清理连接
            connections.delete(sessionId);
        };
        
        ws.onerror = (error) => {
            console.error(`后端WebSocket连接错误: sessionId=${sessionId}`, error);
            
            // 向调用端发送错误消息
            source.postMessage({
                type: 'ws_error',
                sessionId: sessionId,
                error: '连接错误'
            }, '*');
        };
        
    } catch (error) {
        console.error(`创建WebSocket连接失败: sessionId=${sessionId}`, error);
        
        // 向调用端发送错误消息
        source.postMessage({
            type: 'ws_error',
            sessionId: sessionId,
            error: '创建连接失败'
        }, '*');
    }
}

// 向后端发送消息
function sendToBackend(sessionId, message) {
    const connection = connections.get(sessionId);
    
    if (connection && connection.ws && connection.status === 'connected') {
        connection.ws.send(message);
        console.log(`向后端发送消息: sessionId=${sessionId}`, message);
        return true;
    } else {
        console.error(`发送失败，连接不存在或未连接: sessionId=${sessionId}`);
        return false;
    }
}

// 断开与后端的连接
function disconnectFromBackend(sessionId) {
    const connection = connections.get(sessionId);
    
    if (connection && connection.ws) {
        connection.ws.close();
        connections.delete(sessionId);
        console.log(`已断开后端连接: sessionId=${sessionId}`);
        return true;
    }
    
    return false;
}

// 获取当前会话状态
function getConnectionStatus(sessionId) {
    const connection = connections.get(sessionId);
    return connection ? connection.status : 'disconnected';
}

// 导出的API
window.WsBridge = {
    init: initWsBridge,
    isReady: () => isInitialized,
    getStatus: getConnectionStatus
};

// 自动初始化
initWsBridge(); 