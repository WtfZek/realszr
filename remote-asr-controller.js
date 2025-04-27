/**
 * 远程ASR控制器
 * 用于远程连接到目标系统并通过语音控制前端项目
 */

class RemoteASRController {
    constructor(options = {}) {
        // 配置选项
        this.options = {
            targetUrl: options.targetUrl || '', // 目标系统URL
            wsServerUrl: options.wsServerUrl || '', // WebSocket服务器URL
            debug: options.debug === true,
            onReady: options.onReady || null,
            onConnected: options.onConnected || null,
            onDisconnected: options.onDisconnected || null,
            onRecognitionResult: options.onRecognitionResult || null,
            onDigitalHumanResponse: options.onDigitalHumanResponse || null,
            onError: options.onError || null
        };

        // 初始化状态
        this.connected = false;
        this.sessionId = null;
        this.wsConnection = null;
        this.recognizing = false;
        
        // 远程iframe引用
        this.remoteFrame = null;
        
        // 自动初始化
        if (options.autoInit !== false) {
            this.init();
        }
    }
    
    /**
     * 初始化控制器
     */
    init() {
        this.log('初始化远程ASR控制器...');
        
        // 创建远程iframe
        this._createRemoteFrame();
        
        // 添加消息监听
        window.addEventListener('message', this._handleMessage.bind(this));
        
        // 触发就绪回调
        if (typeof this.options.onReady === 'function') {
            this.options.onReady(this);
        }
    }
    
    /**
     * 创建远程iframe
     * @private
     */
    _createRemoteFrame() {
        // 如果已经存在，则不重复创建
        if (this.remoteFrame) return;
        
        // 创建iframe元素
        this.remoteFrame = document.createElement('iframe');
        this.remoteFrame.style.width = '1px';
        this.remoteFrame.style.height = '1px';
        this.remoteFrame.style.position = 'absolute';
        this.remoteFrame.style.top = '-1000px';
        this.remoteFrame.style.left = '-1000px';
        this.remoteFrame.style.opacity = '0';
        this.remoteFrame.style.pointerEvents = 'none';
        this.remoteFrame.allow = 'microphone';
        
        // 如果提供了目标URL，则设置
        if (this.options.targetUrl) {
            this.remoteFrame.src = this.options.targetUrl;
        }
        
        // 添加到文档
        document.body.appendChild(this.remoteFrame);
        this.log('远程iframe已创建');
    }
    
    /**
     * 连接到目标系统
     * @param {string} sessionId - 会话ID，必须与目标系统后端一致
     * @param {string} url - 可选的目标系统URL
     * @returns {Promise} - 连接结果
     */
    connect(sessionId, url = null) {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                return resolve({ success: true, message: '已连接' });
            }
            
            // 保存会话ID
            this.sessionId = sessionId;
            
            // 如果提供了URL，则设置iframe的src
            if (url) {
                this.options.targetUrl = url;
                this.remoteFrame.src = url;
            } else if (this.options.targetUrl) {
                this.remoteFrame.src = this.options.targetUrl;
            } else {
                return reject(new Error('未提供目标URL'));
            }
            
            // 等待iframe加载完成
            const loadHandler = () => {
                this.log('远程iframe加载完成，发送连接请求');
                
                // 发送初始化命令
                this._sendCommand({
                    type: 'asr_control',
                    action: 'init',
                    sessionId: sessionId,
                    serverUrl: this.options.wsServerUrl || null
                });
                
                // 移除加载事件监听器
                this.remoteFrame.removeEventListener('load', loadHandler);
                
                // 设置超时
                const timeout = setTimeout(() => {
                    reject(new Error('连接请求超时'));
                }, 10000);
                
                // 等待响应的一次性处理器
                this._onceMessageOfType('asr_response', data => {
                    clearTimeout(timeout);
                    
                    if (data.action === 'init' && data.result && data.result.success) {
                        this.connected = true;
                        
                        // 触发连接回调
                        if (typeof this.options.onConnected === 'function') {
                            this.options.onConnected({
                                sessionId: this.sessionId
                            });
                        }
                        
                        resolve(data.result);
                    } else {
                        reject(new Error(data.result ? data.result.message : '连接失败'));
                    }
                });
            };
            
            this.remoteFrame.addEventListener('load', loadHandler);
        });
    }
    
    /**
     * 断开与目标系统的连接
     * @returns {Promise} - 断开结果
     */
    disconnect() {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                return resolve({ success: true, message: '未连接' });
            }
            
            // 发送停止命令
            this._sendCommand({
                type: 'asr_control',
                action: 'stop'
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'stop') {
                    this.connected = false;
                    this.recognizing = false;
                    
                    // 触发断开回调
                    if (typeof this.options.onDisconnected === 'function') {
                        this.options.onDisconnected();
                    }
                    
                    resolve(data.result);
                }
            });
        });
    }
    
    /**
     * 开始语音识别
     * @returns {Promise} - 开始结果
     */
    startRecognition() {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                return reject(new Error('未连接'));
            }
            
            if (this.recognizing) {
                return resolve({ success: true, message: '已在识别中' });
            }
            
            // 发送开始命令
            this._sendCommand({
                type: 'asr_control',
                action: 'start'
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'start') {
                    if (data.result && data.result.success) {
                        this.recognizing = true;
                        resolve(data.result);
                    } else {
                        reject(new Error(data.result ? data.result.message : '开始识别失败'));
                    }
                }
            });
        });
    }
    
    /**
     * 停止语音识别
     * @returns {Promise} - 停止结果
     */
    stopRecognition() {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                return reject(new Error('未连接'));
            }
            
            if (!this.recognizing) {
                return resolve({ success: true, message: '未在识别中' });
            }
            
            // 发送停止命令
            this._sendCommand({
                type: 'asr_control',
                action: 'stop'
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'stop') {
                    this.recognizing = false;
                    resolve(data.result);
                }
            });
        });
    }
    
    /**
     * 暂停语音识别
     * @returns {Promise} - 暂停结果
     */
    pauseRecognition() {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.recognizing) {
                return reject(new Error('未连接或未在识别中'));
            }
            
            // 发送暂停命令
            this._sendCommand({
                type: 'asr_control',
                action: 'pause'
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'pause') {
                    resolve(data.result);
                }
            });
        });
    }
    
    /**
     * 恢复语音识别
     * @returns {Promise} - 恢复结果
     */
    resumeRecognition() {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.recognizing) {
                return reject(new Error('未连接或未在识别中'));
            }
            
            // 发送恢复命令
            this._sendCommand({
                type: 'asr_control',
                action: 'resume'
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'resume') {
                    resolve(data.result);
                }
            });
        });
    }
    
    /**
     * 设置音频配置
     * @param {Object} config - 配置对象
     * @returns {Promise} - 设置结果
     */
    setAudioConfig(config) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                return reject(new Error('未连接'));
            }
            
            // 发送配置命令
            this._sendCommand({
                type: 'asr_control',
                action: 'set_audio_config',
                config: config
            });
            
            // 等待响应的一次性处理器
            this._onceMessageOfType('asr_response', data => {
                if (data.action === 'set_audio_config') {
                    resolve(data.result);
                }
            });
        });
    }
    
    /**
     * 发送人工语音识别结果到后端
     * @param {string} text - 识别文本
     * @returns {Promise} - 发送结果
     */
    sendToDigitalHuman(text) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.sessionId) {
                return reject(new Error('未连接或未设置会话ID'));
            }
            
            // 构建请求URL
            const serverUrl = new URL(this.options.targetUrl);
            const apiUrl = `${serverUrl.protocol}//${serverUrl.hostname}:8018/human`; 
            
            // 发送请求到数字人接口
            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    type: 'chat',
                    interrupt: true,
                    sessionid: parseInt(this.sessionId)
                })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.log('数字人响应:', data);
                if (typeof this.options.onDigitalHumanResponse === 'function') {
                    this.options.onDigitalHumanResponse(data);
                }
                resolve(data);
            })
            .catch(error => {
                this.error('发送到数字人失败:', error);
                reject(error);
            });
        });
    }
    
    /**
     * 处理来自iframe的消息
     * @param {MessageEvent} event - 消息事件
     * @private
     */
    _handleMessage(event) {
        // 检查消息来源是否是我们的iframe
        if (!this.remoteFrame || event.source !== this.remoteFrame.contentWindow) {
            return;
        }
        
        const data = event.data;
        if (!data || typeof data !== 'object') {
            return;
        }
        
        this.log('收到消息:', data);
        
        // 处理识别结果
        if (data.type === 'asr_result') {
            if (typeof this.options.onRecognitionResult === 'function') {
                this.options.onRecognitionResult(data.result, data.sessionId);
            }
            
            // 自动发送到数字人（如果配置了）
            if (this.options.autoSendToDigitalHuman) {
                this.sendToDigitalHuman(data.result)
                    .catch(error => this.error('自动发送到数字人失败:', error));
            }
        }
        
        // 处理WebSocket桥接就绪消息
        if (data.type === 'ws_bridge_ready') {
            this.log('WebSocket桥接服务已就绪');
        }
        
        // 触发消息处理回调
        if (data.type in this._messageHandlers) {
            this._messageHandlers[data.type].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    this.error('消息处理器错误:', error);
                }
            });
        }
    }
    
    /**
     * 发送命令到iframe
     * @param {Object} command - 命令对象
     * @private
     */
    _sendCommand(command) {
        if (!this.remoteFrame || !this.remoteFrame.contentWindow) {
            this.error('无法发送命令，iframe不可用');
            return false;
        }
        
        try {
            this.remoteFrame.contentWindow.postMessage(command, '*');
            this.log('发送命令:', command);
            return true;
        } catch (error) {
            this.error('发送命令失败:', error);
            return false;
        }
    }
    
    // 消息处理器
    _messageHandlers = {};
    
    /**
     * 注册一次性消息类型处理器
     * @param {string} type - 消息类型
     * @param {Function} handler - 处理函数
     * @private
     */
    _onceMessageOfType(type, handler) {
        if (!this._messageHandlers[type]) {
            this._messageHandlers[type] = [];
        }
        
        this._messageHandlers[type].push(function onceHandler(data) {
            // 调用传入的处理器
            handler(data);
            
            // 从处理器列表中移除自身
            const index = this._messageHandlers[type].indexOf(onceHandler);
            if (index !== -1) {
                this._messageHandlers[type].splice(index, 1);
            }
        }.bind(this));
    }
    
    /**
     * 日志输出
     * @private
     */
    log(...args) {
        if (this.options.debug) {
            console.log('[RemoteASR]', ...args);
        }
    }
    
    /**
     * 错误输出
     * @private
     */
    error(...args) {
        console.error('[RemoteASR]', ...args);
        
        if (typeof this.options.onError === 'function') {
            this.options.onError(args.join(' '));
        }
    }
}

// 导出为全局对象
window.RemoteASRController = RemoteASRController; 