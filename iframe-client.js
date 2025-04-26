/**
 * iframe客户端接口
 * 用于调用端与被调用端的iframe通信
 */

class IframeClient {
    constructor(options = {}) {
        // 配置选项
        this.options = {
            iframeSelector: options.iframeSelector || '#asr-iframe',
            autoInit: options.autoInit !== false, // 默认自动初始化
            debug: options.debug === true,
            onReady: options.onReady || null,
            onMessage: options.onMessage || null,
            onResult: options.onResult || null,
            onStatusChange: options.onStatusChange || null,
            onError: options.onError || null
        };

        // 初始化状态
        this.iframe = null;
        this.isReady = false;
        this.sessionId = null;
        this.status = 'disconnected';
        
        // 消息处理队列
        this.messageQueue = [];
        this.messageHandlers = {};
        
        // 自动初始化
        if (this.options.autoInit) {
            this.init();
        }
    }

    /**
     * 初始化iframe通信
     */
    init() {
        this.log('初始化iframe客户端...');
        
        // 获取iframe元素
        this.iframe = document.querySelector(this.options.iframeSelector);
        
        if (!this.iframe) {
            this.error('找不到iframe元素: ' + this.options.iframeSelector);
            return false;
        }
        
        // 设置消息监听器
        window.addEventListener('message', this._handleMessage.bind(this));
        
        // 检查iframe是否已加载
        if (this.iframe.contentWindow) {
            this.log('iframe已存在，等待就绪...');
        } else {
            this.error('iframe内容窗口不可用');
            return false;
        }
        
        return true;
    }

    /**
     * 与被调用端建立连接
     * @param {string} sessionId - 会话ID，必须与后端使用的sessionId一致
     * @param {string} serverUrl - 可选的WebSocket服务器URL
     * @returns {Promise} - 返回连接结果的Promise
     */
    connect(sessionId, serverUrl = null) {
        return new Promise((resolve, reject) => {
            if (!this.iframe || !this.iframe.contentWindow) {
                reject(new Error('iframe不可用'));
                return;
            }
            
            this.sessionId = sessionId;
            
            // 注册一次性消息处理器等待连接响应
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'init') {
                    if (data.result && data.result.success) {
                        this.status = 'connected';
                        this.isReady = true;
                        
                        if (typeof this.options.onStatusChange === 'function') {
                            this.options.onStatusChange({
                                status: this.status,
                                sessionId: this.sessionId
                            });
                        }
                        
                        resolve(data.result);
                    } else {
                        this.status = 'error';
                        reject(new Error(data.result ? data.result.message : '连接失败'));
                    }
                }
            });
            
            // 发送初始化消息到iframe
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'init',
                sessionId: sessionId,
                serverUrl: serverUrl
            }, '*');
            
            this.log(`正在连接，sessionId: ${sessionId}`);
        });
    }
    
    /**
     * 断开与被调用端的连接
     */
    disconnect() {
        if (!this.iframe || !this.iframe.contentWindow) {
            return Promise.reject(new Error('iframe不可用'));
        }
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'stop') {
                    this.status = 'disconnected';
                    
                    if (typeof this.options.onStatusChange === 'function') {
                        this.options.onStatusChange({
                            status: this.status,
                            sessionId: this.sessionId
                        });
                    }
                    
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'stop'
            }, '*');
            
            this.log('正在断开连接...');
        });
    }
    
    /**
     * 开始语音识别
     */
    start() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'start') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'start'
            }, '*');
            
            this.log('开始语音识别');
        });
    }
    
    /**
     * 停止语音识别
     */
    stop() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'stop') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'stop'
            }, '*');
            
            this.log('停止语音识别');
        });
    }
    
    /**
     * 暂停语音识别
     */
    pause() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'pause') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'pause'
            }, '*');
            
            this.log('暂停语音识别');
        });
    }
    
    /**
     * 恢复语音识别
     */
    resume() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'resume') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'resume'
            }, '*');
            
            this.log('恢复语音识别');
        });
    }
    
    /**
     * 获取当前识别结果
     */
    getResult() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'get_result') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'get_result'
            }, '*');
        });
    }
    
    /**
     * 清空识别结果
     */
    clearResult() {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'clear_result') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'clear_result'
            }, '*');
            
            this.log('清空识别结果');
        });
    }
    
    /**
     * 设置热词
     * @param {string} hotwords - 热词文本
     */
    setHotwords(hotwords) {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'set_hotwords') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'set_hotwords',
                hotwords: hotwords
            }, '*');
            
            this.log('设置热词');
        });
    }
    
    /**
     * 设置音频监测配置
     * @param {Object} config - 配置参数
     * @param {number} [config.volumeThreshold] - 音量阈值(1-100)
     * @param {number} [config.pauseDelay] - 暂停延迟时间(毫秒)
     * @param {number} [config.resumeDelay] - 恢复延迟时间(毫秒)
     */
    setAudioConfig(config) {
        if (!this._checkReady()) return Promise.reject(new Error('客户端未就绪'));
        
        return new Promise((resolve, reject) => {
            this._registerOneTimeHandler('asr_response', data => {
                if (data.action === 'set_audio_config') {
                    resolve(data.result);
                }
            });
            
            this.iframe.contentWindow.postMessage({
                type: 'asr_control',
                action: 'set_audio_config',
                config: config
            }, '*');
            
            this.log('设置音频配置:', config);
        });
    }
    
    /**
     * 处理来自iframe的消息
     * @private
     */
    _handleMessage(event) {
        // 忽略非对象消息或来源不是我们的iframe
        if (!event.data || typeof event.data !== 'object' || 
            !this.iframe || event.source !== this.iframe.contentWindow) {
            return;
        }
        
        const data = event.data;
        
        // 调试日志
        this.log('收到消息:', data);
        
        // 处理WebSocket桥接就绪消息
        if (data.type === 'ws_bridge_ready' && data.source === 'ws-bridge') {
            this.log('WebSocket桥接服务已就绪');
            
            if (typeof this.options.onReady === 'function') {
                this.options.onReady();
            }
        }
        
        // 处理来自WebSocket桥接的状态消息
        if (data.type === 'ws_status') {
            this.status = data.status;
            
            if (typeof this.options.onStatusChange === 'function') {
                this.options.onStatusChange({
                    status: this.status,
                    sessionId: data.sessionId
                });
            }
        }
        
        // 处理来自WebSocket桥接的消息
        if (data.type === 'ws_message') {
            if (typeof this.options.onMessage === 'function') {
                this.options.onMessage(data.data, data.sessionId);
            }
        }
        
        // 处理来自WebSocket桥接的错误
        if (data.type === 'ws_error') {
            if (typeof this.options.onError === 'function') {
                this.options.onError(data.error, data.sessionId);
            }
        }
        
        // 处理ASR结果
        if (data.type === 'asr_result') {
            if (typeof this.options.onResult === 'function') {
                this.options.onResult(data.result, data.sessionId);
            }
        }
        
        // 处理ASR响应
        if (data.type === 'asr_response') {
            // 调用注册的一次性处理器
            if (this.messageHandlers[data.type]) {
                const handlers = this.messageHandlers[data.type];
                for (let i = 0; i < handlers.length; i++) {
                    handlers[i](data);
                }
                // 清空处理器
                this.messageHandlers[data.type] = [];
            }
        }
    }
    
    /**
     * 注册一次性消息处理器
     * @param {string} type - 消息类型
     * @param {function} handler - 处理函数
     * @private
     */
    _registerOneTimeHandler(type, handler) {
        if (!this.messageHandlers[type]) {
            this.messageHandlers[type] = [];
        }
        this.messageHandlers[type].push(handler);
    }
    
    /**
     * 检查客户端是否就绪
     * @private
     */
    _checkReady() {
        if (!this.iframe || !this.iframe.contentWindow) {
            this.error('iframe不可用');
            return false;
        }
        
        if (!this.isReady) {
            this.error('客户端未初始化或未连接');
            return false;
        }
        
        return true;
    }
    
    /**
     * 日志输出
     * @private
     */
    log(...args) {
        if (this.options.debug) {
            console.log('[IframeClient]', ...args);
        }
    }
    
    /**
     * 错误输出
     * @private
     */
    error(...args) {
        console.error('[IframeClient]', ...args);
        
        if (typeof this.options.onError === 'function') {
            this.options.onError(args.join(' '));
        }
    }
}

// 导出为全局对象
window.IframeClient = IframeClient; 