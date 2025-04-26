# WebSocket 桥接与 iframe 通信解决方案

该解决方案提供了一套完整的框架，用于实现调用端与被调用端（iframe）之间的通信，并确保与后端的 WebSocket 连接使用相同的 sessionId，保持会话一致性。

## 功能特点

1. **会话一致性**：确保调用端与被调用端建立的 WebSocket 链接标识与后端会话 ID 一致
2. **iframe 方法调用**：允许调用端安全地调用被调用端 iframe 中的方法
3. **语音识别控制**：提供完整的语音识别控制 API，包括开始、停止、暂停、恢复等
4. **事件通知**：实时接收识别结果和状态变更通知
5. **无需命令行启动**：设计为在 nginx 等静态服务器环境下可直接运行，无需额外命令行启动
6. **智能延迟识别控制**：提供可配置的延迟暂停/恢复机制，优化数字人对话体验

## 文件结构

- `asr/` - 被调用端代码
  - `index.html` - 被调用端主页面
  - `main.js` - 被调用端主要逻辑和 API
  - `ws-bridge.js` - WebSocket 桥接服务
  - 其他支持文件 (recorder-core.js, wav.js, pcm.js 等)
- `iframe-client.js` - 调用端的客户端接口
- `iframe-demo.html` - 使用示例
- `README.md` - 本文档

## 快速开始

### 1. 被调用端配置

1. 确保 `asr/` 目录下的所有文件都已部署到 web 服务器，如 nginx
2. 确保已引入 `ws-bridge.js` 脚本

### 2. 调用端接入

1. 在调用端页面引入客户端脚本：

```html
<script src="iframe-client.js"></script>
```

2. 添加 iframe 元素：

```html
<iframe id="asr-iframe" src="path/to/asr/index.html" allow="microphone"></iframe>
```

3. 初始化客户端并连接：

```javascript
// 初始化客户端
const client = new IframeClient({
    iframeSelector: '#asr-iframe',
    debug: true,
    onReady: function() {
        console.log('WebSocket桥接服务已就绪');
    },
    onResult: function(result, sessionId) {
        console.log('收到识别结果:', result);
    }
});

// 连接（使用与后端相同的会话ID）
client.connect('12345')
    .then(result => {
        console.log('连接成功:', result);
        
        // 开始语音识别
        return client.start();
    })
    .then(result => {
        console.log('开始识别:', result);
    })
    .catch(error => {
        console.error('操作失败:', error);
    });
```

4. 配置音频监测和延迟设置（可选）:

```javascript
// 设置音频配置参数，优化识别体验
client.setAudioConfig({
    volumeThreshold: 15,    // 音量阈值，1-100，默认为20
    pauseDelay: 500,        // 暂停延迟时间，单位毫秒，默认为500
    resumeDelay: 1500       // 恢复延迟时间，单位毫秒，默认为1500
})
.then(result => {
    console.log('音频配置已设置:', result);
})
.catch(error => {
    console.error('设置失败:', error);
});
```

## API 文档

### IframeClient

#### 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| iframeSelector | String | '#asr-iframe' | iframe 元素的选择器 |
| autoInit | Boolean | true | 是否自动初始化 |
| debug | Boolean | false | 是否开启调试日志 |
| onReady | Function | null | WebSocket 桥接服务就绪时的回调 |
| onMessage | Function | null | 收到 WebSocket 消息时的回调 |
| onResult | Function | null | 收到识别结果时的回调 |
| onStatusChange | Function | null | 连接状态变更时的回调 |
| onError | Function | null | 发生错误时的回调 |

#### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| init() | 无 | Boolean | 初始化客户端 |
| connect(sessionId, serverUrl) | sessionId: 会话ID<br>serverUrl: WebSocket服务器URL（可选） | Promise | 与被调用端建立连接 |
| disconnect() | 无 | Promise | 断开与被调用端的连接 |
| start() | 无 | Promise | 开始语音识别 |
| stop() | 无 | Promise | 停止语音识别 |
| pause() | 无 | Promise | 暂停语音识别 |
| resume() | 无 | Promise | 恢复语音识别 |
| getResult() | 无 | Promise | 获取当前识别结果 |
| clearResult() | 无 | Promise | 清空识别结果 |
| setHotwords(hotwords) | hotwords: 热词文本 | Promise | 设置热词 |
| setAudioConfig(config) | config: 音频配置对象 | Promise | 设置音频检测配置 |

## 示例代码

请参考 `iframe-demo.html` 文件，其中包含完整的使用示例。

## 延迟控制原理

系统实现了智能延迟控制机制，优化数字人对话与语音识别的交互体验：

1. **暂停延迟**：当检测到声音播放（数字人说话）时，不会立即暂停语音识别，而是等待配置的延迟时间（默认0.5秒）后再暂停。这可以防止数字人短暂停顿时错误地暂停识别。

2. **恢复延迟**：当检测到声音停止播放后，系统会等待配置的恢复延迟时间（默认1.5秒）后才恢复语音识别。这可以防止数字人短暂停顿后继续说话时，识别被过早恢复。

3. **动态配置**：可以通过 `setAudioConfig` 方法调整这些延迟时间，以适应不同场景的需求。

## 注意事项

1. 确保调用端和被调用端使用相同的 sessionId，这是确保会话一致性的关键
2. 必须确保 iframe 具有访问麦克风的权限（使用 `allow="microphone"` 属性）
3. 对于跨域部署场景，需要正确设置 CORS 策略
4. 根据数字人的对话特点调整暂停/恢复延迟时间，以获得最佳体验

## 故障排除

- **iframe 连接失败**：检查 iframe 是否正确加载，以及 WebSocket 桥接服务是否已初始化
- **麦克风权限问题**：确保用户已授权 iframe 访问麦克风
- **跨域问题**：检查 CORS 策略是否正确配置
- **识别停顿问题**：如果遇到语音识别与数字人对话之间有明显停顿，可以尝试调整暂停/恢复延迟参数

## 高级用法

### 自定义事件处理

```javascript
const client = new IframeClient({
    onResult: function(result, sessionId) {
        // 处理识别结果
        document.getElementById('result').textContent = result;
    },
    onStatusChange: function(data) {
        // 处理状态变更
        const statusEl = document.getElementById('status');
        statusEl.textContent = data.status;
        statusEl.className = data.status;
    }
});
```

### 错误处理

```javascript
client.start()
    .then(result => {
        console.log('开始识别成功');
    })
    .catch(error => {
        console.error('开始识别失败:', error);
        // 显示错误消息
        showErrorMessage(error.message);
    });
```

### 自定义延迟设置

根据不同场景调整暂停/恢复延迟时间：

```javascript
// 数字人短句对话场景 - 使用较短的延迟
client.setAudioConfig({
    pauseDelay: 300,   // 较短的暂停延迟
    resumeDelay: 800   // 较短的恢复延迟
});

// 数字人长句对话场景 - 使用较长的延迟
client.setAudioConfig({
    pauseDelay: 800,   // 较长的暂停延迟
    resumeDelay: 2000  // 较长的恢复延迟
});
```

## 兼容性

- 支持所有现代浏览器（Chrome, Firefox, Safari, Edge）
- 不支持 Internet Explorer 