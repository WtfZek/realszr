var pc = null;
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var videoElement;

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
                    videoRatioWidth = videoElement.videoWidth;
                    videoRatioHeight = videoElement.videoHeight;
                }

                // 根据锁定比例和宽度调整高度
                if (isRatioLocked) {
                    customHeight = (customWidth / videoRatioWidth) * videoRatioHeight;
                }

                // 设置 canvas 尺寸 - 当宽高为0或null时使用原始视频尺寸
                canvas.width = customWidth && customWidth > 0 ? customWidth : videoElement.videoWidth;
                canvas.height = customHeight && customHeight > 0 ? customHeight : videoElement.videoHeight;

                // 开始绘制视频帧
                requestAnimationFrame(drawFrame);
            });
        } else {
            document.getElementById('audio').srcObject = evt.streams[0];
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

    // 更新 canvas 尺寸
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