var pc = null;
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var videoElement;

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
        return fetch('http://192.168.3.100:8010/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        document.getElementById('sessionid').value = answer.sessionid;
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
            } else {
                // 没有延迟，直接设置音频源
                audioElement.srcObject = audioStream;
            }
        }
    });

    document.getElementById('start').style.display = 'none';
    negotiate();
    document.getElementById('stop').style.display = 'inline-block';
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

    // close peer connection
    setTimeout(() => {
        pc.close();
    }, 500);
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
const closeChatModalButton = document.getElementById('close-chat-modal');
const chatContent = document.getElementById('chat-content');

// 显示对话记录弹窗
showChatModalButton.addEventListener('click', function() {
    chatModal.style.display = 'block';
});

// 关闭对话记录弹窗
closeChatModalButton.addEventListener('click', function() {
    chatModal.style.display = 'none';
});

// 添加对话内容到弹窗
function addChatMessage(message) {
    const chatItem = document.createElement('div');
    chatItem.classList.add('chat-item');
    chatItem.textContent = message;
    chatContent.appendChild(chatItem);
}

// 监听表单提交事件，添加发送的对话内容
const echoForm = document.getElementById('echo-form');
echoForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const message = document.getElementById('message').value;
    addChatMessage('发送对话: ' + message);
    console.log('获取的消息:', message);
    console.log('消息中是否包含换行符:', message.includes('\n'));
    // 原有的表单提交逻辑
    fetch('http://192.168.3.100:8010/human', {
        body: JSON.stringify({
            text: message,
            type: 'chat',
            interrupt: false,
            sessionid: parseInt(document.getElementById('sessionid').value),
        }),
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST'
    });
    document.getElementById('message').value = '';
});

// 监听 ASR 识别结果（假设 ASR 结果通过某种方式传递到这里）
// 这里只是示例，需要根据实际情况修改
function onASRResult(result) {
    addChatMessage('识别: ' + result);
}

// 示例：模拟 ASR 结果
// setInterval(() => {
//     onASRResult('这是一个模拟的语音识别结果');
// }, 5000);

