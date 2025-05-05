var pc = null;
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var videoElement;

// 数字人缩小后的宽度（单位：像素）
window.digitalHumanWidth = 320;

// 数字人位置模式：0=随机位置，1=始终左下角，2=始终右下角，3=左右交替
window.digitalHumanPositionMode = 3;

// 跟踪左右交替模式的上一次位置，true表示上次在左边，false表示上次在右边
let lastPositionWasLeft = true;

// 音频延迟变量（单位：毫秒）
let audioDelay = 0;

// 背景颜色（RGB）
// var bgColorRGB = { r: 49, g: 188, b: 120 };
let bgColorRGB = null;

// 绿幕容差
let tolerance = 50;

// 抗锯齿强度
let antiAliasingStrength = 0;

// 数字人主体坐标
let xOffset = 0;
let yOffset = 0;

// 新增：视频高度和宽度
let customWidth = 0;
let customHeight = 0;

// 控制使用绿幕还是蓝幕的变量，true 为绿幕，false 为蓝幕
let useGreenScreen = false;

let useHSV = false;

// 新增：是否锁定比例
let isRatioLocked = false;
// 新增：视频比例
let videoRatioWidth = null;
let videoRatioHeight = null;


let ws = null;
let isWebSocketConnected = false;
let currentSystemMessageId = null;

// ASR iframe初始化和通信相关变量
let asrIframe = null;
let asrIframeReady = false;
let asrSessionId = null;

// 添加全局变量，用于跟踪对话状态
window.lastUserMessageTimestamp = 0; // 上次用户发送消息的时间戳
window.currentStreamingId = null; // 当前正在处理的流式消息ID

// Function to establish WebSocket connection
function connectWebSocket(sessionid) {
    console.log(`开始尝试建立 WebSocket 连接，sessionid: ${sessionid}`);

    // Close existing connection if any
    if (ws) {
        console.log('检测到已有 WebSocket 连接，正在关闭旧连接...');
        ws.close();
        console.log('旧的 WebSocket 连接已关闭');
    }

    // Create a new WebSocket connection
    const wsUrl = `${window.wsProtocol}://${window.host}/ws?sessionid=${sessionid}`;
    console.log(`正在尝试连接到 WebSocket 地址: ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        console.log('WebSocket 连接已成功建立');
        isWebSocketConnected = true;
        console.log(`当前 WebSocket 连接状态: ${isWebSocketConnected}`);
    };

    ws.onmessage = function (event) {
        console.log('接收到 WebSocket 消息');
        if (event.data) {
            console.log('消息内容不为空，具体内容如下:');
            console.log("event.data", event.data);
            
            try {
                // 尝试解析JSON，看是否是特殊控制消息
                const jsonData = JSON.parse(event.data);
                
                // 检查是否是新一轮对话的开始
                const isNewConversationTurn = shouldCreateNewChatItem();
                
                // 如果存在特定标记，表示这不是流式消息
                if (jsonData.type === 'system' || jsonData.complete === true) {
                    // 系统消息或完整消息，不使用流式处理
                    addChatMessage(jsonData.text || jsonData.message || event.data, 'left', false, 'szr');
                    // 非流式消息后，重置当前流ID
                    window.currentStreamingId = null;
                } else {
                    // 其他JSON消息，作为普通文本显示，使用流式处理
                    addChatMessage(jsonData.text || jsonData.message || JSON.stringify(jsonData), 'left', true, 'szr');
                }
            } catch (e) {
                // 不是JSON，作为普通文本用流式处理
                addChatMessage(event.data, 'left', true, 'szr');
            }
        } else {
            console.log('接收到的消息内容为空');
        }
    };

    ws.onclose = function (event) {
        console.log('WebSocket 连接已关闭');
        isWebSocketConnected = false;
        console.log(`当前 WebSocket 连接状态: ${isWebSocketConnected}`);
        console.log(`关闭代码: ${event.code}, 关闭原因: ${event.reason}`);

        // Try to reconnect after 5 seconds
        console.log('将在 5 秒后尝试重新连接...');
        setTimeout(function () {
            if (!isWebSocketConnected) {
                console.log('仍然处于未连接状态，开始重新连接...');
                connectWebSocket(sessionid);
            } else {
                console.log('在等待期间已重新连接，无需再次尝试');
            }
        }, 5000);
    };

    ws.onerror = function (error) {
        console.error('WebSocket 发生错误');
        console.error('错误详情:', error);
    };
}

function negotiate() {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        return fetch(`${window.protocol}://${window.host}/offer`, {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
        
        // 页面加载完成后获取下拉框选项
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        const sessionId = answer.sessionid;
        document.getElementById('sessionid').value = sessionId;
        
        // 使用返回的会话ID初始化ASR iframe
        initializeASRIframe(sessionId);
        
        // 使用返回的有效sessionId建立WebSocket连接
        console.log(`从服务器获取到sessionId: ${sessionId}，开始建立WebSocket连接`);
        connectWebSocket(sessionId);
        
        getConfigOptions();
        
        return pc.setRemoteDescription(answer);
    }).catch((e) => {
        alert(e);
    });

}

function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    pc = new RTCPeerConnection(config);
    // 设置为全局变量，便于其他函数访问
    window.pc = pc;

    // 创建一个隐藏的 video 元素用于接收视频流
    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    videoElement.crossOrigin = "anonymous"; // 处理跨域问题

    // 获取用户输入的宽度和高度
    // customWidth = parseInt(document.getElementById('width-input').value);
    // customHeight = parseInt(document.getElementById('height-input').value);

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind == 'video') {
            videoElement.srcObject = evt.streams[0];
            videoElement.addEventListener('canplaythrough', () => {
                videoElement.play();

                // 记录视频原始比例
                if (videoRatioWidth === null && videoRatioHeight === null) {
                    // 设置局部变量
                    videoRatioWidth = videoElement.videoWidth;
                    videoRatioHeight = videoElement.videoHeight;
                    
                    // 同时设置为全局变量，供HTML使用
                    window.videoRatioWidth = videoElement.videoWidth;
                    window.videoRatioHeight = videoElement.videoHeight;
                    
                    console.log("视频原始尺寸:", videoRatioWidth, "x", videoRatioHeight);
                }

                // 根据锁定比例和宽度调整高度
                if (isRatioLocked) {
                    customHeight = (customWidth / videoRatioWidth) * videoRatioHeight;
                }

                // 获取容器尺寸
                const mediaDiv = document.getElementById('media');
                const mediaDivRect = mediaDiv.getBoundingClientRect();
                const containerWidth = mediaDivRect.width;
                const containerHeight = mediaDivRect.height;
                
                // 计算合适的canvas尺寸，确保不超出容器
                let canvasWidth = customWidth && customWidth > 0 ? customWidth : videoElement.videoWidth;
                let canvasHeight = customHeight && customHeight > 0 ? customHeight : videoElement.videoHeight;
                
                // 如果超出容器，进行缩放
                if (canvasWidth > containerWidth * 0.9 || canvasHeight > containerHeight * 0.9) {
                    const scaleFactorW = (containerWidth * 0.9) / canvasWidth;
                    const scaleFactorH = (containerHeight * 0.9) / canvasHeight;
                    const scaleFactor = Math.min(scaleFactorW, scaleFactorH);
                    
                    canvasWidth = Math.floor(canvasWidth * scaleFactor);
                    canvasHeight = Math.floor(canvasHeight * scaleFactor);
                    
                    // 更新自定义尺寸，以便后续使用
                    customWidth = canvasWidth;
                    customHeight = canvasHeight;
                    
                    // 更新滑块值
                    const customWidthSlider = document.getElementById('customWidthSlider');
                    const customWidthValue = document.getElementById('customWidthValue');
                    const customHeightSlider = document.getElementById('customHeightSlider');
                    const customHeightValue = document.getElementById('customHeightValue');
                    
                    if (customWidthSlider && customWidthValue) {
                        customWidthSlider.value = canvasWidth;
                        customWidthValue.value = canvasWidth;
                    }
                    
                    if (customHeightSlider && customHeightValue) {
                        customHeightSlider.value = canvasHeight;
                        customHeightValue.value = canvasHeight;
                    }
                }

                // 设置 canvas 尺寸
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                
                // 设置Canvas尺寸样式
                canvas.style.width = canvasWidth + 'px';
                canvas.style.height = canvasHeight + 'px';
                
                // 居中Canvas
                const centerX = (containerWidth - canvasWidth) / 2;
                const centerY = (containerHeight - canvasHeight) / 2;
                canvas.style.left = centerX + 'px';
                canvas.style.top = centerY + 'px';
                
                // 同步更新位置滑块
                const xOffsetSlider = document.getElementById('xOffsetSlider');
                const xOffsetValue = document.getElementById('xOffsetValue');
                const yOffsetSlider = document.getElementById('yOffsetSlider');
                const yOffsetValue = document.getElementById('yOffsetValue');
                
                if (xOffsetSlider && xOffsetValue) {
                    xOffsetSlider.value = centerX;
                    xOffsetValue.value = centerX;
                }
                
                if (yOffsetSlider && yOffsetValue) {
                    yOffsetSlider.value = centerY;
                    yOffsetValue.value = centerY;
                }
                
                console.log('Video loaded and canvas centered at:', centerX, centerY);

                // 开始绘制视频帧
                requestAnimationFrame(drawFrame);
            });
        } else {
            // 处理音频流，应用延迟
            const audioStream = evt.streams[0];
            const audioElement = document.getElementById('audio');
            
            // 如果设置了音频延迟且大于0
            if (audioDelay > 0) {
                console.log(`应用音频延迟: ${audioDelay}秒`);
                // 创建音频上下文
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // 创建源节点
                const source = audioContext.createMediaStreamSource(audioStream);
                
                // 创建延迟节点
                const delayNode = audioContext.createDelay(50); // 最大延迟时间50秒
                delayNode.delayTime.value = audioDelay; // 延迟时间已经是秒为单位
                
                // 创建目标节点
                const destination = audioContext.createMediaStreamDestination();
                
                // 连接节点
                source.connect(delayNode);
                delayNode.connect(destination);
                
                // 将处理后的流设置为音频元素的源
                audioElement.srcObject = destination.stream;
                
                // 新增：为延迟后的音频流添加ASR处理
                setupAudioRecognition(destination.stream);
            } else {
                // 没有延迟，直接设置音频源
                audioElement.srcObject = audioStream;
                
                // 新增：为原始音频流添加ASR处理
                // setupAudioRecognition(audioStream);
            }
        }
    });

    document.getElementById('start').style.display = 'none';
    
    document.getElementById('stop').style.display = 'inline-block';

    negotiate();

    connectToOCServer();

}

// 新增一个标志，用于判断是否是第一帧
let isFirstFrame = true;

function drawFrame() {
    if (videoElement.paused || videoElement.ended) {
        return;
    }

    // 根据锁定比例和宽度调整高度
    if (isRatioLocked) {
        customHeight = (customWidth / videoRatioWidth) * videoRatioHeight;
    }

    // 更新 canvas 尺寸 - 使用与视频加载时相同的逻辑
    canvas.width = customWidth && customWidth > 0 ? customWidth : videoElement.videoWidth;
    canvas.height = customHeight && customHeight > 0 ? customHeight : videoElement.videoHeight;

    // 绘制视频帧到 canvas
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // 获取 canvas 上的像素数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    if (isFirstFrame) {
        const colorCount = {};
        let maxCount = 0;
        // 统计每种颜色的出现次数
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const colorKey = `${r}-${g}-${b}`;
            if (!colorCount[colorKey]) {
                colorCount[colorKey] = 0;
            }
            colorCount[colorKey]++;
            if (colorCount[colorKey] > maxCount) {
                maxCount = colorCount[colorKey];
                bgColorRGB = { r, g, b };
            }
        }
        isFirstFrame = false;
    }

    const bgColorHSV = rgbToHsv(bgColorRGB.r, bgColorRGB.g, bgColorRGB.b);


    // 绿幕抠图
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 将当前像素颜色转换为 HSV
        const pixelHSV = rgbToHsv(r, g, b);

        // 检查是否在绿幕颜色范围内
        if (
            // r >= Math.max(0, bgColorRGB.r - tolerance) && r <= Math.min(255, bgColorRGB.r + tolerance) &&
            // g >= Math.max(0, bgColorRGB.g - tolerance) && g <= Math.min(255, bgColorRGB.g + tolerance) &&
            // b >= Math.max(0, bgColorRGB.b - tolerance) && b <= Math.min(255, bgColorRGB.b + tolerance)
            pixelHSV.h >= Math.max(0, bgColorHSV.h - tolerance) && pixelHSV.h <= Math.min(360, bgColorHSV.h + tolerance) &&
            pixelHSV.s >= Math.max(0, bgColorHSV.s - tolerance) && pixelHSV.s <= Math.min(100, bgColorHSV.s + tolerance) &&
            pixelHSV.v >= Math.max(0, bgColorHSV.v - tolerance) && pixelHSV.v <= Math.min(100, bgColorHSV.v + tolerance)
        ) {
            // 设置透明度为 0
            data[i + 3] = 0;
        }
    }

    // 应用改进的抗锯齿
    if (antiAliasingStrength > 0) {
        applyAntiAliasing(imageData, canvas.width, canvas.height, antiAliasingStrength);
    }

    // 将处理后的像素数据放回 canvas
    ctx.putImageData(imageData, 0, 0);

    // 控制数字人主体坐标
    if (xOffset!== 0 || yOffset!== 0) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, xOffset, yOffset);
    }

    // 继续绘制下一帧
    requestAnimationFrame(drawFrame);
}

// 边缘抗锯齿处理的改进版本
function applyAntiAliasing(imageData, width, height, strength) {
    if (strength <= 0) return imageData; // 如果强度为0，不做任何处理

    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data); // 创建副本避免处理过程中的干扰

    // 边缘检测和平滑化
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            if (data[index + 3] > 0) { // 只处理不完全透明的像素
                // 检查周围像素
                let transparentNeighbors = 0;
                let totalAlpha = 0;
                let countNeighbors = 0;

                const neighbors = [
                    [-1, -1], [-1, 0], [-1, 1],
                    [0, -1],           [0, 1],
                    [1, -1],  [1, 0],  [1, 1]
                ];

                for (const [dx, dy] of neighbors) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const neighborIndex = (ny * width + nx) * 4;
                        countNeighbors++;

                        if (data[neighborIndex + 3] === 0) {
                            transparentNeighbors++;
                        } else {
                            totalAlpha += data[neighborIndex + 3];
                        }
                    }
                }

                // 边缘像素处理 - 使用加权平均法平滑边缘
                if (transparentNeighbors > 0) {
                    // 计算新的透明度 - 结合当前透明度和邻居平均透明度
                    const avgAlpha = countNeighbors > 0 ? totalAlpha / (countNeighbors - transparentNeighbors) : 0;
                    const currentAlpha = data[index + 3];

                    // 根据透明邻居数量和抗锯齿强度调整当前像素的透明度
                    // 强度越高，边缘越平滑但可能更模糊
                    const blendFactor = (transparentNeighbors / 8) * (strength / 30);
                    const newAlpha = Math.max(0, currentAlpha * (1 - blendFactor));

                    tempData[index + 3] = newAlpha;
                }
            }
        }
    }

    // 将处理后的数据复制回原始数组
    for (let i = 0; i < data.length; i++) {
        data[i] = tempData[i];
    }

    return imageData;
}

// 示例：调整抗锯齿强度
function adjustAntiAliasingStrength(newStrength) {
    antiAliasingStrength = newStrength;
}

function adjustAudioDelay(newDelay) {
    // 更新延迟值（已转换为秒）
    const oldDelay = audioDelay;
    audioDelay = newDelay;
    
    console.log(`音频延迟已设置为: ${audioDelay}秒`);
    
    // 获取音频元素
    const audioElement = document.getElementById('audio');
    if (!audioElement || !audioElement.srcObject) {
        console.log("没有活动的音频流，设置将应用于下一次启动");
        return;
    }
    
    try {
        // 是否正在播放
        const wasPlaying = !audioElement.paused;
        
        // 记录当前时间
        const currentTime = audioElement.currentTime;
        
        // 暂停当前音频
        audioElement.pause();
        
        // 获取当前流
        const currentStream = audioElement.srcObject;
        
        // 如果当前正在使用未处理的原始流，需创建新的音频上下文
        if (audioDelay > 0) {
            // 创建新的音频上下文
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 检查是否有音轨可用
            if (currentStream.getAudioTracks && currentStream.getAudioTracks().length > 0) {
                // 创建新的MediaStream，只包含音频轨道
                const newStream = new MediaStream(currentStream.getAudioTracks());
                const source = audioContext.createMediaStreamSource(newStream);
                
                // 创建延迟节点
                const delayNode = audioContext.createDelay(50); // 最大延迟50秒
                delayNode.delayTime.value = audioDelay; // 已确保是秒为单位
                
                // 创建目标节点
                const destination = audioContext.createMediaStreamDestination();
                
                // 连接节点
                source.connect(delayNode);
                delayNode.connect(destination);
                
                // 更新音频元素的源
                audioElement.srcObject = destination.stream;
            } else {
                console.error("无法获取音频轨道，可能是一个已处理过的流");
                
                // 尝试重新从PC获取流
                const pc = window.pc;
                if (pc && pc.getReceivers) {
                    const audioReceiver = pc.getReceivers().find(r => r.track && r.track.kind === 'audio');
                    if (audioReceiver && audioReceiver.track) {
                        console.log("从PC重新获取原始音频流");
                        const stream = new MediaStream([audioReceiver.track]);
                        
                        // 创建新的音频上下文
                        const newSource = audioContext.createMediaStreamSource(stream);
                        
                        // 创建延迟节点
                        const newDelayNode = audioContext.createDelay(50);
                        newDelayNode.delayTime.value = audioDelay;
                        
                        // 创建目标节点
                        const newDestination = audioContext.createMediaStreamDestination();
                        
                        // 连接节点
                        newSource.connect(newDelayNode);
                        newDelayNode.connect(newDestination);
                        
                        // 更新音频元素的源
                        audioElement.srcObject = newDestination.stream;
                    }
                }
            }
        } else {
            // 无延迟时，尝试恢复原始流
            try {
                if (currentStream.getAudioTracks && currentStream.getAudioTracks().length > 0) {
                    const originalStream = new MediaStream(currentStream.getAudioTracks());
                    audioElement.srcObject = originalStream;
                } else {
                    console.log("尝试从PC获取原始音频流");
                    // 尝试从PC获取原始流
                    const pc = window.pc;
                    if (pc && pc.getReceivers) {
                        const audioReceiver = pc.getReceivers().find(r => r.track && r.track.kind === 'audio');
                        if (audioReceiver && audioReceiver.track) {
                            const stream = new MediaStream([audioReceiver.track]);
                            audioElement.srcObject = stream;
                        }
                    }
                }
            } catch (e) {
                console.error("恢复原始流失败:", e);
            }
        }
        
        // 如果之前在播放，继续播放
        if (wasPlaying) {
            audioElement.play().catch(e => console.error('重新播放失败:', e));
        }
    } catch (error) {
        console.error("应用新的延迟设置时出错:", error);
    }
}

function stop() {
    document.getElementById('stop').style.display = 'none';
    // 显示 start 按钮
    document.getElementById('start').style.display = 'block';

    // 清空 canvas
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 停止并隐藏 videoElement
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement.style.display = 'none';
    }
    
    // 使用cleanupResources函数关闭连接和清理资源
    // 不保存会话数据，因为这是用户主动停止
    cleanupResources({ saveSessionData: false });

    disconnectFromServer();
    
    // 不再需要下面的代码，因为cleanupResources已经处理了
    // // 关闭WebSocket连接
    // if (ws) {
    //     console.log('正在关闭WebSocket连接...');
    //     try {
    //         ws.close();
    //         isWebSocketConnected = false;
    //         console.log('WebSocket连接已关闭');
    //     } catch (e) {
    //         console.error('关闭WebSocket连接时出错:', e);
    //     }
    // }
    //
    // // close peer connection
    // setTimeout(() => {
    //     pc.close();
    // }, 500);
}

// RGB 转 HSV 函数
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, v = max;

    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, v: v * 100 };
}

// 示例：控制数字人主体坐标
function moveDigitalHuman(x, y) {
    xOffset = x;
    yOffset = y;
}

// 示例：调整绿幕容差
function adjustGreenScreenTolerance(newTolerance) {
    tolerance = newTolerance;
}

// 获取元素
const chatModal = document.getElementById('chat-modal');
const showChatModalButton = document.getElementById('show-chat-modal');
// const closeChatModalButton = document.getElementById('close-chat-modal');
const chatContent = document.getElementById('chat-content');


// 关闭对话记录弹窗
// closeChatModalButton.addEventListener('click', function() {
//     chatModal.style.display = 'none';
//     isChatModalOpen = false;
// });

/**
 * 向聊天窗口添加文本消息
 * @param {string} message - 要显示的文本消息
 * @param {string|boolean} position - 消息位置
 *   - 'left' 或 false: 显示在左侧（接收者）
 *   - 'right' 或 true: 显示在右侧（发送者）
 * @param {boolean} isStreaming - 是否为流式消息，默认为false
 */
function addChatMessage(message, position, isStreaming = false, type) {

    // 将 position 参数转换为布尔值，可以是字符串 'left'/'right' 或布尔值 false/true
    // 'left' 或 false 表示左侧消息（接收者）
    // 'right' 或 true 表示右侧消息（发送者）
    const isSender = position === 'right' || position === true;
    
    // 首先尝试在当前文档中查找chat-content元素
    let chatContent = document.getElementById('chat-content');
    // 如果当前文档中没有找到，并且当前窗口是嵌入的，则尝试在父窗口中查找
    if (!chatContent && window.parent && window.parent !== window) {
        try {
            chatContent = window.parent.document.getElementById('chat-content');
            console.log('在父窗口找到chat-content元素');
        } catch (e) {
            console.error('尝试访问父窗口时出错:', e);
            return; // 如果找不到聊天内容区域，直接返回
        }
    }
    
    if (!chatContent) {
        console.error('无法找到chat-content元素，请确保正确设置了聊天框的ID');
        return;
    }
    
    // 如果是用户发送的消息，记录时间戳并重置当前流ID
    if (isSender) {
        window.lastUserMessageTimestamp = Date.now();
        window.currentStreamingId = null; // 用户发送消息后，重置流ID，下一个系统消息将创建新的对话框
        
        // 非流式消息，直接创建新的聊天项
        createNewChatItem(chatContent, message, isSender, false, type);
    } else {
        // 处理系统（左侧）消息
        if (isStreaming) {
            // 检查是否需要创建新的对话框
            const shouldCreateNewItem = shouldCreateNewChatItem();
            console.log('shouldCreateNewItem', shouldCreateNewItem);
            
            if (shouldCreateNewItem) {
                // 需要创建新对话框
                const newItem = createNewChatItem(chatContent, message, isSender, true, type);
                // 为新创建的流式消息生成唯一ID
                window.currentStreamingId = 'stream-' + Date.now();
                newItem.setAttribute('data-stream-id', window.currentStreamingId);
            } else {
                // 查找最后一个匹配的流式聊天项
                const lastChatItem = findLastStreamingChatItem(chatContent);
                
                if (lastChatItem) {
                    // 找到了流式聊天项，更新其内容
                    updateChatItemWithTypingEffect(lastChatItem, message);
                } else {
                    // 没有找到匹配的流式聊天项，创建一个新的
                    const newItem = createNewChatItem(chatContent, message, isSender, true, type);
                    // 为新创建的流式消息生成唯一ID
                    window.currentStreamingId = 'stream-' + Date.now();
                    newItem.setAttribute('data-stream-id', window.currentStreamingId);
                }
            }
        } else {
            // 非流式消息，强制创建新的聊天项
            createNewChatItem(chatContent, message, isSender, false, type);
            // 非流式消息后，重置当前流ID
            window.currentStreamingId = null;
        }
    }
    
    // 将滚动条滚动到最底部
    chatContent.scrollTop = chatContent.scrollHeight;
}

/**
 * 判断是否应该创建新的聊天项
 * @returns {boolean} - 如果应该创建新聊天项，返回true
 */
function shouldCreateNewChatItem() {
    // 如果没有当前流ID，说明需要创建新的聊天项
    console.log('当前流ID：', window.currentStreamingId);
    if (!window.currentStreamingId) {
        return true;
    }
    
    // 如果用户在短时间内发送了新消息，也需要创建新的聊天项
    // const timeSinceLastUserMessage = Date.now() - window.lastUserMessageTimestamp;
    // 如果用户在5秒内发送过消息，后续的系统消息应该创建新的聊天项
    // if (timeSinceLastUserMessage < 5000) {
    //     return true;
    // }
    
    // 其他情况可以继续使用当前流
    return false;
}

/**
 * 查找最后一个流式消息聊天项
 * @param {HTMLElement} chatContent - 聊天内容容器
 * @returns {HTMLElement|null} - 找到的聊天项或null
 */
function findLastStreamingChatItem(chatContent) {
    // 如果没有当前流ID，返回null
    if (!window.currentStreamingId) {
        return null;
    }
    
    const chatItems = chatContent.querySelectorAll('.chat-item');
    if (chatItems.length === 0) return null;
    
    // 从后向前查找匹配的聊天项
    for (let i = chatItems.length - 1; i >= 0; i--) {
        const item = chatItems[i];
        // 检查是否是接收者消息
        if (item.classList.contains('receiver')) {
            // 检查是否是当前流ID的消息
            if (item.getAttribute('data-stream-id') === window.currentStreamingId) {
                return item;
            }
        }
    }
    
    return null;
}


/**
 * 使用打字机效果更新聊天项内容
 * @param {HTMLElement} chatItem - 要更新的聊天项
 * @param {string} message - 新消息内容
 */
function updateChatItemWithTypingEffect(chatItem, message) {
    // 找到消息容器（第一个div元素）
    const messageContainer = chatItem.querySelector('div:not(img)');
    if (!messageContainer) return;
    
    // 获取当前已显示的文本
    const currentText = messageContainer.textContent || '';
    
    // 如果新消息与当前文本的前缀相同，只添加新部分
    if (message.startsWith(currentText)) {
        const newPart = message.slice(currentText.length);
        if (!newPart) return; // 没有新内容
        
        // 使用打字机效果添加新部分
        let index = 0;
        const typingInterval = setInterval(() => {
            if (index < newPart.length) {
                messageContainer.textContent += newPart[index];
                index++;
            } else {
                clearInterval(typingInterval);
            }
        }, 30); // 调整速度
    } else {
        // 如果不是延续，不替换文本，而是追加新消息
        // 避免重复添加已有内容，尝试找出共同部分
        let commonPrefixLength = 0;
        const minLength = Math.min(currentText.length, message.length);
        
        // 查找共同前缀的长度
        for (let i = 0; i < minLength; i++) {
            if (currentText[i] === message[i]) {
                commonPrefixLength++;
            } else {
                break;
            }
        }
        
        // 只追加新的部分
        const newContent = message.slice(commonPrefixLength);
        if (newContent) {
            // 直接追加新内容，不使用打字效果以避免延迟
            messageContainer.textContent += newContent;
        }
    }
}

/**
 * 创建新的聊天项
 * @param {HTMLElement} chatContent - 聊天内容容器
 * @param {string} message - 消息内容
 * @param {boolean} isSender - 是否为发送者消息
 * @param {boolean} isStreaming - 是否为流式
 * @returns {HTMLElement} - 创建的聊天项元素
 */
function createNewChatItem(chatContent, message, isSender, isStreaming = false, type) {
    const chatItem = document.createElement('div');
    chatItem.classList.add('chat-item');
    chatItem.classList.add(isSender ? 'sender' : 'receiver');
    
    // 标记流式消息状态
    chatItem.setAttribute('data-streaming', isStreaming ? 'true' : 'false');
    
    // 使用 flex 布局让 avatar 和 messageContainer 处于同一行
    chatItem.style.display = 'flex';
    chatItem.style.alignItems = 'start'; // 垂直顶部对齐
    chatItem.style.marginBottom = '10px'; // 为每个聊天项添加底部间距

    // 创建头像图片元素
    const avatar = document.createElement('img');
    // 替换为switch参数type来决定头像
    switch (type) {
        case 'audio':
            avatar.src = './static/audio.png';
            break;
        case 'text':
            avatar.src = './static/text.png';
            break;
        case 'image':
            avatar.src = './static/image.png';
            break;
        case 'video':
            avatar.src = './static/video.png';
            break;
        default:
            avatar.src = './static/szr.png';
            break;
    }
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '10px';

    // 创建一个容器来包裹头像和消息
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.alignItems = 'end';
    messageContainer.style.fontSize = '12px';
    messageContainer.style.fontFamily = 'ChillLongCangKaiMidum'; // 应用自定义字体
    messageContainer.style.border = '1px solid #dcdcdc';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.backgroundColor = '#ffffff';
    messageContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    messageContainer.style.padding = '10px';
    messageContainer.style.maxWidth = '80%'; // 限制消息容器的最大宽度

    // 添加消息文本
    messageContainer.textContent = message;

    // 设置对齐方式和添加元素
    if (isSender) {
        chatItem.style.justifyContent = 'flex-end'; // 发送者消息右对齐
        avatar.style.marginLeft = '10px'; // 发送者头像右侧间距
        avatar.style.marginRight = 0; // 移除发送者头像左侧间距
        
        chatItem.appendChild(messageContainer);
        chatItem.appendChild(avatar);
    } else {
        chatItem.style.justifyContent = 'flex-start'; // 接收者消息左对齐
        
        chatItem.appendChild(avatar);
        chatItem.appendChild(messageContainer);
    }

    // 添加到聊天内容区域
    chatContent.appendChild(chatItem);
    
    return chatItem;
}

/**
 * 向聊天窗口添加媒体消息
 * @param {string} mediaSource - 媒体源URL或HTML内容
 * @param {string} mediaType - 媒体类型，可选值：'image'、'audio'、'video'、'html'
 * @param {string|boolean} position - 消息位置
 *   - 'left' 或 false: 显示在左侧（接收者）
 *   - 'right' 或 true: 显示在右侧（发送者）
 */
function addChatMedia(mediaSource, mediaType, position, type) {
    // 将 position 参数转换为布尔值，可以是字符串 'left'/'right' 或布尔值 false/true
    // 'left' 或 false 表示左侧消息（接收者）
    // 'right' 或 true 表示右侧消息（发送者）
    const isSender = position === 'right' || position === true;
    
    const chatItem = document.createElement('div');
    chatItem.classList.add('chat-item');
    chatItem.classList.add(isSender ? 'sender' : 'receiver');
    // 使用 flex 布局让 avatar 和 messageContainer 处于同一行
    chatItem.style.display = 'flex';
    chatItem.style.alignItems = 'start'; // 垂直顶部对齐
    chatItem.style.marginBottom = '10px'; // 为每个聊天项添加底部间距

    // 创建头像图片元素
    const avatar = document.createElement('img');
    avatar.src = './static/media.png';
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '10px';

    // 创建一个容器来包裹头像和消息
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.alignItems = 'center';
    messageContainer.style.justifyContent = 'center';
    messageContainer.style.fontFamily = '宋体';
    messageContainer.style.border = '1px solid #dcdcdc';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.backgroundColor = '#ffffff';
    messageContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    messageContainer.style.padding = '10px';
    messageContainer.style.maxWidth = '80%'; // 限制消息容器的最大宽度

    // 根据媒体类型添加不同的元素
    switch (mediaType.toLowerCase()) {
        case 'image':
            // 创建图片元素
            const imgElement = document.createElement('img');
            imgElement.src = mediaSource;
            imgElement.style.maxWidth = '100%';
            imgElement.style.maxHeight = '200px';
            imgElement.style.borderRadius = '4px';
            
            // 添加点击放大查看功能
            imgElement.style.cursor = 'pointer';
            imgElement.onclick = function() {
                const fullImg = document.createElement('div');
                fullImg.style.position = 'fixed';
                fullImg.style.top = '0';
                fullImg.style.left = '0';
                fullImg.style.width = '100%';
                fullImg.style.height = '100%';
                fullImg.style.backgroundColor = 'rgba(0,0,0,0.8)';
                fullImg.style.display = 'flex';
                fullImg.style.justifyContent = 'center';
                fullImg.style.alignItems = 'center';
                fullImg.style.zIndex = '9999';
                
                const img = document.createElement('img');
                img.src = mediaSource;
                img.style.maxWidth = '90%';
                img.style.maxHeight = '90%';
                img.style.objectFit = 'contain';
                
                fullImg.appendChild(img);
                document.body.appendChild(fullImg);
                
                fullImg.onclick = function() {
                    document.body.removeChild(fullImg);
                };
            };
            
            messageContainer.appendChild(imgElement);
            break;
            
        case 'audio':
            // 创建音频播放器元素
            const audioElement = document.createElement('audio');
            audioElement.src = mediaSource;
            audioElement.controls = true;
            audioElement.style.maxWidth = '100%';
            audioElement.style.borderRadius = '4px';
            
            messageContainer.appendChild(audioElement);
            break;
            
        case 'video':
            // 创建视频播放器元素
            const videoElement = document.createElement('video');
            videoElement.src = mediaSource;
            videoElement.controls = true;
            videoElement.style.maxWidth = '100%';
            videoElement.style.maxHeight = '200px';
            videoElement.style.borderRadius = '4px';
            
            messageContainer.appendChild(videoElement);
            break;
            
        case 'html':
            // 处理HTML内容
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = mediaSource;
            contentDiv.style.maxWidth = '100%';
            
            // 安全处理：移除所有脚本标签
            const scripts = contentDiv.getElementsByTagName('script');
            for (let i = scripts.length - 1; i >= 0; i--) {
                scripts[i].parentNode.removeChild(scripts[i]);
            }
            
            // 确保所有链接在新窗口打开
            const links = contentDiv.getElementsByTagName('a');
            for (let i = 0; i < links.length; i++) {
                links[i].setAttribute('target', '_blank');
                links[i].setAttribute('rel', 'noopener noreferrer');
            }
            
            messageContainer.appendChild(contentDiv);
            break;
            
        default:
            // 默认处理为纯文本
            messageContainer.appendChild(document.createTextNode('不支持的媒体类型: ' + mediaType));
    }

    // 设置对齐方式
    if (isSender) {
        chatItem.style.justifyContent = 'flex-end'; // 发送者消息右对齐
        avatar.style.marginLeft = '10px'; // 发送者头像右侧间距
        avatar.style.marginRight = 0; // 移除发送者头像左侧间距
    } else {
        chatItem.style.justifyContent = 'flex-start'; // 接收者消息左对齐
    }

    // 将容器添加到聊天项中
    if (isSender) {
        chatItem.appendChild(messageContainer);
        chatItem.appendChild(avatar);
    } else {
        chatItem.appendChild(avatar);
        chatItem.appendChild(messageContainer);
    }

    // 首先尝试在当前文档中查找chat-content元素
    let chatContent = document.getElementById('chat-content');
    // 如果当前文档中没有找到，并且当前窗口是嵌入的，则尝试在父窗口中查找
    if (!chatContent && window.parent && window.parent !== window) {
        try {
            chatContent = window.parent.document.getElementById('chat-content');
            console.log('在父窗口找到chat-content元素');
        } catch (e) {
            console.error('尝试访问父窗口时出错:', e);
        }
    }

    if (chatContent) {
        chatContent.appendChild(chatItem);
        // 将滚动条滚动到最底部
        chatContent.scrollTop = chatContent.scrollHeight;
    } else {
        console.error('无法找到chat-content元素，请确保正确设置了聊天框的ID');
    }
}

// 监听表单提交事件，添加发送的对话内容
const echoForm = document.getElementById('echo-form');
echoForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const message = document.getElementById('message').value;
    
    if (!message.trim()) return; // 不发送空消息
    
    // 将用户消息显示为右侧消息(发送者)，不使用流式处理
    // currentSystemMessageId = null;
    addChatMessage(message, 'right', false, 'text');
    
    // 更新最后一次用户消息的时间戳
    window.lastUserMessageTimestamp = Date.now();
    
    // 用户发送新消息后，强制重置当前流ID
    window.currentStreamingId = null;
    
    console.log('发送消息:', message);
    console.log('sessionid:', document.getElementById('sessionid').value);
    
    // 使用全局变量控制请求参数
    const messageType = window.messageType || 'chat';
    const interrupt = window.messageInterrupt !== undefined ? window.messageInterrupt : true;
    
    console.log(`消息类型: ${messageType}, 打断: ${interrupt}`);
    
    // 发送消息到服务器
    fetch(`${window.protocol}://${window.host}/human`, {
        body: JSON.stringify({
            text: message,
            type: messageType,
            interrupt: interrupt,
            sessionid: parseInt(document.getElementById('sessionid').value),
        }),
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            console.error('发送消息失败:', response.status);
            // 可以在聊天窗口中添加错误提示
            addChatMessage('消息发送失败，请重试', 'left', false, 'szr');
        }
        return response.text().catch(() => null);
    })
    .catch(error => {
        console.error('请求发生错误:', error);
        // 可以在聊天窗口中添加错误提示
        addChatMessage('网络错误，或数字人未开启，请检查连接', 'left', false, 'szr');
    });
    
    // 清空输入框
    document.getElementById('message').value = '';
});

// 示例：模拟 ASR 结果
// setInterval(() => {
//     onASRResult('这是一个模拟的语音识别结果');
// }, 5000);

            

/**
 * 测试添加各种媒体消息的函数
 */
function testChatMedia() {
    // 测试图片消息 - 放在左侧
    addChatMedia('https://fsai2025.oss-cn-shanghai.aliyuncs.com/upload/20250413/72cc239f0c8b7c6d71c1bb10da104d05.png', 'image', 'left');
    
    // 500毫秒后添加一个右侧的图片消息
    // setTimeout(() => {
    //     addChatMedia('https://fsai2025.oss-cn-shanghai.aliyuncs.com/upload/20250413/72cc239f0c8b7c6d71c1bb10da104d05.png', 'image', 'right');
    // }, 500);
    
    // 测试音频消息 - 放在左侧
    setTimeout(() => {
        addChatMedia('https://www.w3schools.com/html/horse.mp3', 'audio', 'left');
    }, 1000);
    
    // 测试音频消息 - 放在右侧
    // setTimeout(() => {
    //     addChatMedia('https://www.w3schools.com/html/horse.mp3', 'audio', 'right');
    // }, 1500);
    
    // 测试视频消息 - 放在左侧
    setTimeout(() => {
        addChatMedia('https://www.w3schools.com/html/movie.mp4', 'video', 'left');
    }, 2000);
    

    // 测试视频消息 - 放在左侧
    // setTimeout(() => {
    //     addChatMedia('https://www.w3schools.com/html/movie.mp4', 'video', 'right');
    // }, 2500);

    // 测试HTML内容 - 放在左侧
    setTimeout(() => {
        const htmlContent = `
            <div style="color: blue; font-weight: bold;">
                这是<span style="color:red">富文本</span>消息
                <ul>
                    <li>支持HTML格式</li>
                    <li>可以包含列表</li>
                    <li>和其他HTML元素</li>
                </ul>
                <a href="https://www.example.com">示例链接</a>
            </div>
        `;
        addChatMedia(htmlContent, 'html', 'left');
    }, 3000);
    
    // 测试HTML内容 - 放在右侧
    // setTimeout(() => {
    //     const htmlContent = `
    //         <div style="color: green; font-weight: bold;">
    //             右侧<span style="color:purple">富文本</span>消息
    //             <ul>
    //                 <li>支持不同样式</li>
    //                 <li>可以放在右侧</li>
    //             </ul>
    //         </div>
    //     `;
    //     addChatMedia(htmlContent, 'html', 'right');
    // }, 3500);
}

// 如需测试，可以在浏览器控制台中调用testChatMedia()函数
// addChatMedia('https://fsai2025.oss-cn-shanghai.aliyuncs.com/upload/20250413/72cc239f0c8b7c6d71c1bb10da104d05.png', 'image', false);

// 添加全局计时器变量
let techPlayerAutoCloseTimer = null;

/**
 * 在科技感播放框中显示媒体内容
 * @param {string} url - 媒体URL
 * @param {string} type - 媒体类型，'image' 或 'video'
 * @param {number} displayTime - 图片显示时间（秒），默认5秒
 * @param {boolean} alignLeft - 是否左对齐播放框，默认根据上一次位置交替
 */
function showMediaInTechPlayer(url, type, displayTime = 5, alignLeft) {
    // 先清除可能存在的自动关闭计时器
    if (techPlayerAutoCloseTimer) {
        clearTimeout(techPlayerAutoCloseTimer);
        techPlayerAutoCloseTimer = null;
    }
    
    // 获取播放框和内容区域
    const player = document.getElementById('tech-media-player');
    const content = player.querySelector('.tech-media-content');
    const playerInner = player.querySelector('.tech-media-player-inner');
    
    // 清空现有内容
    content.innerHTML = '';
    
    // 获取数字人画布
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('找不到数字人画布元素');
        return;
    }
    
    // 创建媒体元素
    let mediaElement;
    if (type === 'image') {
        mediaElement = document.createElement('img');
        mediaElement.src = url;
    } else if (type === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = url;
        mediaElement.autoplay = true;
        mediaElement.controls = true;
        // 添加视频播放结束事件监听器
        mediaElement.addEventListener('ended', function() {
            console.log('视频播放结束，自动关闭播放器');
            closeTechMediaPlayer();
        });
    } else {
        console.error('不支持的媒体类型:', type);
        return;
    }
    
    // 添加媒体元素到播放框
    content.appendChild(mediaElement);
    
    // 当媒体加载完成后，设置尺寸和位置
    mediaElement.onload = mediaElement.onloadedmetadata = function() {
        // 获取原始媒体比例
        const mediaWidth = this.naturalWidth || this.videoWidth;
        const mediaHeight = this.naturalHeight || this.videoHeight;
        const aspectRatio = mediaWidth / mediaHeight;
        
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 根据媒体比例设置播放框尺寸
        let playerWidth, playerHeight;
        if (aspectRatio > 1) { // 宽大于高
            // 宽度占屏幕的3/5，高度根据比例确定
            playerWidth = windowWidth * 0.6;
            playerHeight = playerWidth / aspectRatio;
        } else { // 高大于宽
            // 高度占屏幕的80%，宽度根据比例确定
            playerHeight = windowHeight * 0.8;
            playerWidth = playerHeight * aspectRatio;
        }
        
        // 设置播放框尺寸
        playerInner.style.width = `${playerWidth}px`;
        playerInner.style.height = `${playerHeight}px`;
        
        // 根据数字人位置模式决定数字人位置
        let digitalHumanOnLeft = false;
        
        // 根据位置模式设置数字人位置
        switch(window.digitalHumanPositionMode) {
            case 1: // 始终左下角
                digitalHumanOnLeft = true;
                console.log('数字人固定放置在左下角');
                break;
            case 2: // 始终右下角
                digitalHumanOnLeft = false;
                console.log('数字人固定放置在右下角');
                break;
            case 3: // 左右交替
                // 与上次位置相反
                digitalHumanOnLeft = !lastPositionWasLeft;
                console.log(`数字人交替放置在${digitalHumanOnLeft ? '左' : '右'}下角`);
                // 更新位置记录
                lastPositionWasLeft = digitalHumanOnLeft;
                break;
            case 0: // 随机位置
            default:
                digitalHumanOnLeft = Math.random() > 0.5;
                console.log(`随机决定数字人放在${digitalHumanOnLeft ? '左' : '右'}下角`);
                break;
        }
        
        // 获取媒体容器
        const mediaDiv = document.getElementById('media');
        if (!mediaDiv) {
            console.error('找不到media容器元素');
            return;
        }
        
        // 设置播放框位置
        playerInner.style.position = 'absolute';
        
        // 根据数字人位置和播放框宽度决定播放框位置
        if (playerWidth <= (windowWidth - 2 * window.digitalHumanWidth)) {
            // 如果播放框足够小，则居中显示
            const leftPosition = (windowWidth - playerWidth) / 2;
            playerInner.style.left = `${leftPosition}px`;
            playerInner.style.right = 'auto';
        } else {
            // 如果播放框较大，则根据数字人位置放在另一侧
            if (digitalHumanOnLeft) {
                // 数字人在左侧，播放框在右侧居中
                const rightAreaWidth = windowWidth - window.digitalHumanWidth;
                const leftPosition = window.digitalHumanWidth + (rightAreaWidth - playerWidth) / 2;
                playerInner.style.left = `${leftPosition}px`;
                playerInner.style.right = 'auto';
            } else {
                // 数字人在右侧，播放框在左侧居中
                const leftAreaWidth = windowWidth - window.digitalHumanWidth;
                const leftPosition = (leftAreaWidth - playerWidth) / 2;
                playerInner.style.left = `${leftPosition}px`;
                playerInner.style.right = 'auto';
            }
        }
        
        // 添加active类以显示播放框
        player.classList.add('active');
        
        // 使用moveDigitalHumanForMedia移动数字人到对应位置
        moveDigitalHumanForMedia(canvas, digitalHumanOnLeft);
    };
    
    // 图片加载失败处理
    mediaElement.onerror = function() {
        console.error('媒体加载失败:', url);
        closeTechMediaPlayer();
    };
    
    // 如果是图片，设置自动关闭定时器
    if (type === 'image' && displayTime > 0) {
        techPlayerAutoCloseTimer = setTimeout(function() {
            console.log(`图片显示${displayTime}秒后自动关闭`);
            closeTechMediaPlayer();
        }, displayTime * 1000);
    }
}

/**
 * 关闭科技感播放框
 */
function closeTechMediaPlayer() {
    // 清除自动关闭计时器
    if (techPlayerAutoCloseTimer) {
        clearTimeout(techPlayerAutoCloseTimer);
        techPlayerAutoCloseTimer = null;
    }
    
    const player = document.getElementById('tech-media-player');
    const canvas = document.getElementById('canvas');
    
    if (!player || !canvas) return;
    
    // 移除active类，触发淡出动画
    player.classList.remove('active');
    
    // 恢复数字人原始样式
    if (canvas.originalStyle) {
        // 添加过渡动画
        canvas.style.transition = 'all 0.5s ease-in-out';
        
        // 恢复原始样式
        Object.keys(canvas.originalStyle).forEach(key => {
            canvas.style[key] = canvas.originalStyle[key];
        });
        
        // 动画结束后清除transition
        setTimeout(() => {
            canvas.style.transition = '';
            delete canvas.originalStyle;
        }, 500);
    }
    
    // 清空媒体内容
    setTimeout(() => {
        const content = player.querySelector('.tech-media-content');
        if (content) content.innerHTML = '';
    }, 500);
}

// 页面完全加载后的处理
window.onload = function() {
    console.log('Window 已完全加载');
    
    // 为测试按钮添加事件监听器
    const testChatMediaButton = document.getElementById('test-chat-media');
    if (testChatMediaButton) {
        console.log('找到测试按钮，添加点击事件');
        testChatMediaButton.addEventListener('click', function() {
            console.log('点击了测试按钮');
            // 确保聊天对话框已打开
            const chatModal = document.getElementById('chat-modal');
            if (chatModal && window.getComputedStyle(chatModal).display === 'none') {
                const showChatModalButton = document.getElementById('show-chat-modal');
                if (showChatModalButton) {
                    showChatModalButton.click();
                }
            }
            
            // 测试添加媒体消息
            testChatMedia();
        });
    }
    
    // 为测试媒体播放框按钮添加事件监听器
    const testMediaPlayerBtn = document.getElementById('test-media-player-btn');
    if (testMediaPlayerBtn) {
        testMediaPlayerBtn.addEventListener('click', function() {
            console.log('点击了测试媒体播放框按钮');
            
            // 随机选择图片或视频进行测试
            const isVideo = Math.random() > 0.5;
            const isOne = Math.random() > 0.5;
            
            if (isVideo) {
                // 测试视频
                if (isOne) {
                    window.showMediaContentInPlayer('./static/videos/tcq.mp4', 'video');
                } else {
                    window.showMediaContentInPlayer('./static/videos/outup.mp4', 'video');
                }
            } else {
                // 测试图片
                if (isOne) {
                    window.showMediaContentInPlayer('https://fsai2025.oss-cn-shanghai.aliyuncs.com/upload/20250413/72cc239f0c8b7c6d71c1bb10da104d05.png', 'image', 5);
                } else {
                    window.showMediaContentInPlayer('./static/sz-bg1.png', 'image', 5);
                }
            }
        });
    }
    
    // 为媒体播放框关闭按钮添加事件监听器
    const techPlayerCloseBtn = document.querySelector('.tech-player-close');
    if (techPlayerCloseBtn) {
        techPlayerCloseBtn.addEventListener('click', closeTechMediaPlayer);
    }
    
    // 尝试查找聊天内容容器
    const chatContent = document.getElementById('chat-content');
    if (chatContent) {
        console.log('Window.onload: 在当前窗口找到chat-content');
    } else if (window.parent && window.parent !== window) {
        try {
            const parentChatContent = window.parent.document.getElementById('chat-content');
            if (parentChatContent) {
                console.log('Window.onload: 在父窗口找到chat-content');
            } else {
                console.error('Window.onload: 在父窗口中也找不到chat-content');
            }
        } catch (e) {
            console.error('Window.onload: 访问父窗口出错', e);
        }
    } else {
        console.error('Window.onload: 无法找到chat-content元素');
    }
};

/**
 * 处理语音识别结果
 * @param {string} result - 语音识别得到的文本结果
 */
// function onASRResult(result) {
//     if (!result || typeof result !== 'string' || !result.trim()) {
//         console.log('收到空的ASR结果，跳过处理');
//         return;
//     }
    
//     // 将识别结果作为右侧消息显示（用户说的话）
//     // currentSystemMessageId = null;
//     addChatMessage(result, 'right', false);
    
//     // 更新最后一次用户消息的时间戳
//     window.lastUserMessageTimestamp = Date.now();
    
//     // 用户发送新消息后，强制重置当前流ID
//     window.currentStreamingId = null;
    
//     console.log('发送ASR识别结果:', result);
    
//     // 语音识别结果也发送到服务器
//     const sessionId = parseInt(document.getElementById('sessionid').value);
//     fetch('http://192.168.3.100:8018/human', {
//         body: JSON.stringify({
//             text: result,
//             type: 'chat',
//             interrupt: true,
//             sessionid: sessionId,
//         }),
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         method: 'POST'
//     })
//     .catch(error => {
//         console.error('发送ASR结果失败:', error);
//     });
// }

// 新增：处理数字人音频数据并传递给ASR识别的函数
function setupAudioRecognition(audioStream) {
    try {
        console.log("设置数字人音频识别功能");
        
        // 创建音频上下文
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 创建源节点
        const source = audioContext.createMediaStreamSource(audioStream);
        
        // 创建分析器节点用于实时获取音频数据
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        // 创建脚本处理器节点以处理音频数据
        const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        // 连接节点
        source.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
        
        // 通过ScriptProcessor获取音频数据并发送到ASR iframe
        scriptProcessor.onaudioprocess = function(audioProcessingEvent) {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // 转换为Int16Array以便ASR处理
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                // 将[-1,1]的float值转换为[-32768,32767]的int16值
                int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32767)));
            }
            
            // 获取ASR iframe并发送数据
            const asrIframe = document.querySelector('#asr-iframe');
            if (asrIframe && asrIframe.contentWindow) {
                asrIframe.contentWindow.postMessage({
                    type: 'digital_human_audio',
                    audio: int16Data
                }, '*');
            }
        };
        
        console.log("数字人音频识别设置完成");
    } catch (e) {
        console.error("设置数字人音频识别失败:", e);
    }
}

// 添加消息监听器，处理来自ASR iframe的控制命令
window.addEventListener('message', function(event) {
    // 校验消息来源和类型
    if (!event.data || typeof event.data !== 'object') return;
    
    // 处理重置流ID的消息
    if (event.data.type === 'reset_streaming_id' && event.data.source === 'asr_iframe') {
        console.log('收到ASR iframe发来的重置流ID消息');
        // 重置当前流ID变量
        window.currentStreamingId = null;
        window.lastUserMessageTimestamp = Date.now(); // 更新最后用户消息时间戳
        console.log('已重置window.currentStreamingId和更新window.lastUserMessageTimestamp');
    }
    
    // 处理来自ASR框架的其他消息
    if (event.data.type === 'digital_human_audio') {
        // 处理数字人音频数据...
        // 这段代码保持原样
    } else if (event.data.type === 'digital_human_asr_ready') {
        console.log("ASR iframe准备就绪，可开始传输数字人音频数据");
    } else if (event.data.type === 'asr_ready') {
        console.log("ASR iframe已准备好接收音量数据");
    } else if (event.data.type === 'asr_result') {
        // 处理ASR结果
        if (event.data.text) {
            onASRResult(event.data.text);
        }
    }
});

/**
 * 初始化ASR iframe并建立通信
 * @param {string} sessionId - 当前会话ID
 */
function initializeASRIframe(sessionId) {
    console.log(`初始化ASR iframe，会话ID: ${sessionId}`);

    // 设置会话ID
    asrSessionId = sessionId;
    
    // 获取ASR iframe
    asrIframe = document.getElementById('asr-iframe');
    if (!asrIframe) {
        console.error('找不到ASR iframe元素');
        return;
    }
    
    // 设置iframe事件监听
    window.addEventListener('message', handleASRIframeMessage);
    
    // 检查iframe是否已准备好
    if (asrIframeReady) {
        sendSessionIdToASRIframe(sessionId);
    } else {
        console.log('ASR iframe尚未准备好，等待准备就绪消息');
    }
}

/**
 * 处理来自ASR iframe的消息
 * @param {MessageEvent} event - 消息事件
 */
function handleASRIframeMessage(event) {
    // 可以根据需要验证消息来源
    // if (event.origin !== expectedOrigin) return;
    
    if (!event.data || !event.data.type) return;
    
    switch (event.data.type) {
        case 'asr_iframe_ready':
            console.log('ASR iframe已准备就绪');
            asrIframeReady = true;
            
            // 如果已有会话ID，发送给iframe
            if (asrSessionId) {
                sendSessionIdToASRIframe(asrSessionId);
            }
            break;
            
        case 'asr_result':
            // 处理ASR结果
            console.log('收到ASR结果:', event.data.text);
            if (event.data.text) {
                onASRResult(event.data.text);
            }
            break;
            
        case 'asr_ws_connected':
            console.log(`ASR WebSocket已连接，sessionId: ${event.data.sessionId}`);
            break;
            
        case 'asr_ws_disconnected':
            console.log(`ASR WebSocket已断开，sessionId: ${event.data.sessionId}, 代码: ${event.data.code}`);
            break;
            
        case 'asr_ws_error':
            console.error(`ASR WebSocket错误，sessionId: ${event.data.sessionId}, 错误: ${event.data.error}`);
            break;
            
        case 'digital_human_asr_ready':
            console.log('数字人ASR处理模块已准备就绪');
            break;
    }
}

/**
 * 向ASR iframe发送会话ID
 * @param {string} sessionId - 会话ID
 */
function sendSessionIdToASRIframe(sessionId) {
    if (!asrIframe || !asrIframe.contentWindow) {
        console.error('ASR iframe不可用，无法发送会话ID');
        return;
    }
    
    try {
        asrIframe.contentWindow.postMessage({
            type: 'set_session_id',
            sessionId: sessionId
        }, '*');
        console.log(`已向ASR iframe发送会话ID: ${sessionId}`);
    } catch (e) {
        console.error('向ASR iframe发送会话ID时出错:', e);
    }
}

/**
 * 发送控制命令到ASR iframe
 * @param {string} action - 控制动作，'connect'|'pause'|'resume'|'close'
 * @param {Object} params - 附加参数
 */
function sendControlToASRIframe(action, params = {}) {
    if (!asrIframe || !asrIframe.contentWindow) {
        console.error('ASR iframe不可用，无法发送控制命令');
        return;
    }
    
    try {
        const message = {
            type: `asr_${action}`,
            ...params
        };
        
        asrIframe.contentWindow.postMessage(message, '*');
        console.log(`已向ASR iframe发送控制命令: ${action}`, params);
    } catch (e) {
        console.error(`向ASR iframe发送${action}命令时出错:`, e);
    }
}

// 添加页面生命周期事件处理，确保在页面关闭或刷新时清理资源
window.addEventListener('beforeunload', function(event) {
    // 如果有未保存的数据，可以提示用户
    // 在某些浏览器中，返回一个非空字符串会显示确认对话框
    // 但现代浏览器出于安全考虑，大多忽略自定义消息
    if (isWebSocketConnected || (pc && pc.connectionState !== 'closed')) {
        const message = '您有正在进行的会话，离开页面将会中断连接。确定要离开吗？';
        event.returnValue = message;  // 兼容 Chrome
        return message;  // 兼容 Firefox
    }
    
    // 无论如何都执行资源清理
    cleanupResources();
});

window.addEventListener('unload', function() {
    // 页面实际卸载时执行，不能阻止卸载过程
    cleanupResources();
});

// 资源清理函数，在页面卸载前执行
function cleanupResources(options = {}) {
    console.log('执行资源清理...');
    const { saveSessionData = false } = options;
    
    // 保存会话数据（如果需要）
    if (saveSessionData) {
        try {
            const sessionData = {
                sessionId: document.getElementById('sessionid').value,
                timestamp: new Date().toISOString(),
                messages: []
            };
            
            // 获取聊天内容
            const chatContent = document.getElementById('chat-content');
            if (chatContent) {
                // 保存聊天记录
                const chatItems = chatContent.querySelectorAll('.chat-item');
                chatItems.forEach(item => {
                    const isSender = item.classList.contains('sender');
                    const messageDiv = item.querySelector('div:not(img)');
                    const message = messageDiv ? messageDiv.textContent : '';
                    
                    sessionData.messages.push({
                        text: message,
                        isSender
                    });
                });
            }
            
            // 将会话数据保存到localStorage
            localStorage.setItem('lastSessionData', JSON.stringify(sessionData));
            console.log('会话数据已保存到localStorage');
        } catch (e) {
            console.error('保存会话数据失败:', e);
        }
    }
    
    // 关闭WebSocket连接
    if (ws && isWebSocketConnected) {
        console.log('正在关闭WebSocket连接...');
        try {
            ws.close();
            isWebSocketConnected = false;
        } catch (e) {
            console.error('关闭WebSocket连接时出错:', e);
        }
    }
    
    // 关闭WebRTC连接
    if (pc) {
        console.log('正在关闭WebRTC连接...');
        try {
            // 停止所有轨道
            if (videoElement && videoElement.srcObject) {
                const tracks = videoElement.srcObject.getTracks();
                tracks.forEach(track => track.stop());
                videoElement.srcObject = null;
            }
            
            // 关闭音频元素
            const audioElement = document.getElementById('audio');
            if (audioElement && audioElement.srcObject) {
                const tracks = audioElement.srcObject.getTracks();
                tracks.forEach(track => track.stop());
                audioElement.srcObject = null;
            }
            
            // 关闭对等连接
            pc.close();
            console.log('WebRTC连接已关闭');
        } catch (e) {
            console.error('关闭WebRTC连接时出错:', e);
        }
    }
    
    console.log('资源清理完成');
    return true;
}

// 添加主动保存会话的函数，可以在UI中调用
window.saveAndCleanup = function() {
    // 保存会话数据并清理资源
    return cleanupResources({ saveSessionData: true });
};

// 获取下拉框选项
async function getConfigOptions() {
    try {
        console.log(`${window.protocol}://${window.host}/get_config`+`已发送`);
        const response = await fetch(`${window.protocol}://${window.host}/get_config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionid: parseInt(document.getElementById('sessionid').value),
            }),
        });
        if (!response.ok) {
            throw new Error('网络响应异常');
        }
        const data = await response.json();
        // 清空下拉框原有选项
        configSelect.innerHTML = '';
        // 添加新选项
        data.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            configSelect.appendChild(optionElement);
        });
    } catch (error) {
        console.error('获取配置选项时出错:', error);
    }
}

function connectToOCServer() {
    const wsUrl = `${window.wsProtocol}://192.168.3.188:8000/ws/client`;
    // const wsUrl = `${window.wsProtocol}://${window.host}/ws/client`;

    console.log('有问题的ws链接:', wsUrl);
    
    // 关闭现有连接
    if (originControllerSocket && originControllerSocket.readyState === WebSocket.OPEN) {
        originControllerSocket.close();
    }
    
    originControllerSocket = new WebSocket(wsUrl);

    const statusElement = document.getElementById('info_div');
    
    originControllerSocket.onopen = () => {
        // addMessage('系统', '正在连接到服务器...', 'system');
        statusElement.textContent = '状态: 正在连接...';
        // statusElement.className = 'status';
    };
    
    originControllerSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        console.log("收到的远控ws消息：", data);
        
        if (data.type === 'connected') {
            clientId = data.client_id;
            console.log('已连接到服务器，客户机ID:', clientId);
            // clientIdElement.textContent = clientId;
            // addMessage('系统', `已连接到服务器，客户机ID: ${clientId}`, 'system');
            statusElement.innerHTML = `已连接到服务器<br>客户机ID: <span style="color:#2196f3; font-weight:bold;">${clientId}</span>`;
            // statusElement.className = 'status status-connected';
        } else if (data.type === 'disconnecting') {
            // addMessage('系统', '正在断开与服务器的连接...', 'system');
            statusElement.textContent = '正在断开与服务器的连接...';
        } else if (data.type === 'message') {
            // 处理消息
            let newType = window.messageType;
            if (data.new_type === 'echo' || data.new_type === 'chat') {
                newType = data.new_type;
            }
            // addMessage(`用户 ${data.user_id}`, data.message, 'user-message');
            // statusElement.textContent = `用户yi ${data.user_id}: ${data.message}`;

            // console.log("data.message",data.message)

            addChatMessage(data.message, 'right', false, 'audio');

            // 更新最后一次用户消息的时间戳
            window.lastUserMessageTimestamp = Date.now();

            // 用户发送新消息后，强制重置当前流ID
            window.currentStreamingId = null;

            console.log('发送消息:', message);
            console.log('sessionid:', document.getElementById('sessionid').value);

            // 发送消息到服务器
            fetch(`${window.protocol}://${window.host}/human`, {
                body: JSON.stringify({
                    text: data.message,
                    type: newType,
                    interrupt: window.messageInterrupt,
                    sessionid: parseInt(document.getElementById('sessionid').value),
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST'
            })
            .then(response => {
                if (!response.ok) {
                    console.error('发送消息失败:', response.status);
                    // 可以在聊天窗口中添加错误提示
                    addChatMessage('消息发送失败，请重试', 'left', false, 'szr');
                }
                return response.text().catch(() => null);
            })
            .catch(error => {
                console.error('请求发生错误:', error);
                // 可以在聊天窗口中添加错误提示
                addChatMessage('网络错误，或数字人未开启，请检查连接', 'left', false, 'szr');
            });
        }
    };
    
    originControllerSocket.onclose = () => {
        // addMessage('系统', '与服务器的连接已关闭', 'system');
        statusElement.textContent = '状态: 未连接';
        // statusElement.className = 'status status-disconnected';
        // clientIdElement.textContent = '未分配';
        clientId = null;
    };
    
    originControllerSocket.onerror = (error) => {
        // addMessage('系统', '连接错误', 'system');
        statusElement.textContent = '状态: 连接错误';
        console.error('WebSocket错误:', error);
    };
}



function disconnectFromServer() {
    // 添加状态检查，确保连接已打开
    if (originControllerSocket && originControllerSocket.readyState === WebSocket.OPEN) {
        try {
            originControllerSocket.send(JSON.stringify({
                disconnect: true,
                client_id: clientId  // 发送客户端ID以便服务器正确识别
            }));
            console.log('已发送断开连接请求');
        } catch (e) {
            console.error('发送断开连接请求失败:', e);
        }
    } else {
        console.warn('WebSocket连接未打开，无法发送断开请求');
        // 如果连接未打开，直接更新UI状态
        document.getElementById('info_div').textContent = '状态: 未连接';
    }
}

/**
 * 对外暴露的方法，用于在科技感播放框中显示图片或视频
 * @param {string} url - 媒体URL
 * @param {string} type - 媒体类型('image'或'video')
 * @param {number} displayTime - 图片显示时间(秒)，默认5秒，仅对图片有效
 * @param {boolean} alignLeft - 是否左对齐播放框，不指定则交替
 */
window.showMediaContentInPlayer = function(url, type = 'image', displayTime = 5, alignLeft) {
    if (!url) {
        console.error('URL不能为空');
        return;
    }
    
    // 检查媒体类型
    if (type !== 'image' && type !== 'video') {
        console.error('不支持的媒体类型:', type);
        return;
    }
    
    // 确保displayTime为有效数字
    displayTime = typeof displayTime === 'number' && displayTime > 0 ? displayTime : 5;
    
    // 播放媒体
    showMediaInTechPlayer(url, type, displayTime, alignLeft);
};

/**
 * 移动数字人到媒体播放框的相对位置
 * @param {HTMLElement} canvas - 数字人画布元素
 * @param {boolean} digitalHumanOnLeft - 数字人是否放在左侧
 */
function moveDigitalHumanForMedia(canvas, digitalHumanOnLeft) {
    // 获取media容器
    const mediaDiv = document.getElementById('media');
    if (!mediaDiv) {
        console.error('找不到media容器元素');
        return;
    }
    
    const mediaDivRect = mediaDiv.getBoundingClientRect();
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    
    // 首先保存原始样式，方便还原
    if (!canvas.originalStyle) {
        canvas.originalStyle = {
            position: canvas.style.position,
            top: canvas.style.top,
            left: canvas.style.left,
            width: canvas.style.width,
            height: canvas.style.height,
            transform: canvas.style.transform,
            zIndex: canvas.style.zIndex
        };
    }
    
    // 使用全局变量控制数字人宽度并保持原始宽高比
    const aspectRatio = canvasWidth / canvasHeight;
    const fixedHeight = window.digitalHumanWidth / aspectRatio;
    
    // 根据位置计算具体坐标
    let left, top;
    
    if (digitalHumanOnLeft) {
        // 数字人在左下角
        left = 0;
        top = mediaDivRect.height - fixedHeight;
    } else {
        // 数字人在右下角
        left = mediaDivRect.width - window.digitalHumanWidth;
        top = mediaDivRect.height - fixedHeight;
    }
    
    // 应用样式变化
    canvas.style.position = 'absolute';
    canvas.style.zIndex = '1000';
    canvas.style.width = `${window.digitalHumanWidth}px`;
    canvas.style.height = `${fixedHeight}px`;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.transition = 'all 0.5s ease-in-out';
}
