/**
 * Copyright FunASR (https://github.com/alibaba-damo-academy/FunASR). All Rights
 * Reserved. MIT License  (https://opensource.org/licenses/MIT)
 */
/* 2022-2023 by zhaoming,mali aihealthx.com */


// 连接; 定义socket连接类对象与语音对象
var wsconnecter = new WebSocketConnectMethod({msgHandle:getJsonMessage,stateHandle:getConnState});
var audioBlob;

// 添加sessionId支持
var currentSessionId = null;

// 录音; 定义录音对象,wav格式
var rec = Recorder({
	type:"pcm",
	bitRate:16,
	sampleRate:16000,
	onProcess:recProcess
});

// 添加录音状态控制变量
var isRecordingPaused = false;
var isRec = false; // 定义isRec变量，初始为false

// 添加音频音量监测变量
var lastAudioVolumeTime = 0; // 上次检测到高音量的时间
var lastLowVolumeTime = 0; // 上次检测到低音量的时间
var audioVolumeThreshold = 20; // 音量阈值，可根据实际情况调整
var micMuteTimeout = null; // 麦克风静音超时计时器
var audioCheckInterval = null;
var audioContext = null;
var audioAnalyser = null;
var audioDataArray = null;
var isAudioMonitoring = false;

// 配置参数
var micMuteDuration = 3000; // 麦克风静音持续时间(毫秒)
var recoveryCheckInterval = 100; // 恢复检查间隔(毫秒)

addMicMuteDurationControl();

// 全局函数，允许从外部暂停ASR录音
window.pauseASRRecording = function() {
    if (!isRecordingPaused && rec) {
        console.log("麦克风已暂时静音");
        isRecordingPaused = true;
        // 暂停录音处理但不关闭连接
        rec.pause();
        info_div.innerHTML = "<span style='color:#ff9f1c'>⚠️ 检测到声音播放，麦克风已临时静音</span>";
        
        // 设置自动恢复计时器
        if (micMuteTimeout) {
            clearTimeout(micMuteTimeout);
        }
        
        micMuteTimeout = setTimeout(function() {
            // 时间到后自动恢复
            if (isRecordingPaused) {
                window.resumeASRRecording();
                console.log("麦克风静音时间结束，自动恢复");
            }
        }, micMuteDuration);
    }
};

// 全局函数，允许从外部恢复ASR录音
window.resumeASRRecording = function() {
    if (isRecordingPaused && rec) {
        console.log("麦克风已恢复");
        isRecordingPaused = false;
        // 恢复录音处理
        rec.resume();
        info_div.innerHTML = "<span style='color:#2ec4b6'>✓ 麦克风已恢复，请说话...</span>";
        
        // 清除任何待处理的恢复计时器
        if (micMuteTimeout) {
            clearTimeout(micMuteTimeout);
            micMuteTimeout = null;
        }
    }
};

// 暴露给外部调用的方法集合
window.ASRBridge = {
    // 初始化ASR服务和建立WebSocket连接
    init: function(sessionId, serverUrl) {
        console.log(`初始化ASR服务: sessionId=${sessionId}`);
        
        // 存储sessionId
        currentSessionId = sessionId;
        
        // 如果提供了服务器URL，则设置
        if (serverUrl) {
            document.getElementById('wssip').value = serverUrl;
        }
        
        return { 
            success: true, 
            message: '初始化成功', 
            sessionId: currentSessionId 
        };
    },
    
    // 开始录音识别
    start: function() {
        console.log('外部调用: 开始语音识别');
        if (!currentSessionId) {
            return { success: false, message: '未初始化SessionID' };
        }
        
        start();
        return { success: true, message: '开始识别' };
    },
    
    // 停止录音识别
    stop: function() {
        console.log('外部调用: 停止语音识别');
        clear();
        return { success: true, message: '停止识别' };
    },
    
    // 暂停录音
    pause: function() {
        window.pauseASRRecording();
        return { success: true, message: '暂停识别' };
    },
    
    // 恢复录音
    resume: function() {
        window.resumeASRRecording();
        return { success: true, message: '恢复识别' };
    },
    
    // 获取当前SessionID
    getSessionId: function() {
        return currentSessionId;
    },
    
    // 获取当前识别结果
    getResult: function() {
        const resultArea = document.getElementById('varArea');
        return resultArea ? resultArea.value : '';
    },
    
    // 设置热词
    setHotwords: function(hotwords) {
        if (typeof hotwords === 'string') {
            document.getElementById('varHot').value = hotwords;
            return { success: true, message: '设置热词成功' };
        }
        return { success: false, message: '热词格式错误' };
    },
    
    // 清空识别结果
    clearResult: function() {
        document.getElementById('varArea').value = '';
        return { success: true, message: '清空结果成功' };
    }
};

// 添加消息监听器，处理来自父窗口的控制命令
window.addEventListener('message', function(event) {
    // 可以根据需要验证消息来源
    // if (event.origin !== expectedOrigin) return;
    
    const data = event.data;
    
    if (!data || typeof data !== 'object') return;
    
    // 处理ASR控制命令
    if (data.type === 'asr_control') {
        console.log("收到控制命令:", data.action);
        
        let response = { type: 'asr_response', success: false, message: '未知命令' };
        
        switch (data.action) {
            case 'init':
                response = { 
                    type: 'asr_response', 
                    action: 'init',
                    result: window.ASRBridge.init(data.sessionId, data.serverUrl)
                };
                break;
                
            case 'start':
                response = { 
                    type: 'asr_response', 
                    action: 'start',
                    result: window.ASRBridge.start()
                };
                break;
                
            case 'stop':
                response = { 
                    type: 'asr_response', 
                    action: 'stop',
                    result: window.ASRBridge.stop()
                };
                break;
                
            case 'pause':
                response = { 
                    type: 'asr_response', 
                    action: 'pause',
                    result: window.ASRBridge.pause()
                };
                break;
                
            case 'resume':
                response = { 
                    type: 'asr_response', 
                    action: 'resume',
                    result: window.ASRBridge.resume()
                };
                break;
                
            case 'get_result':
                response = { 
                    type: 'asr_response', 
                    action: 'get_result',
                    result: { 
                        success: true, 
                        text: window.ASRBridge.getResult() 
                    }
                };
                break;
                
            case 'clear_result':
                response = { 
                    type: 'asr_response', 
                    action: 'clear_result',
                    result: window.ASRBridge.clearResult()
                };
                break;
                
            case 'set_hotwords':
                response = { 
                    type: 'asr_response', 
                    action: 'set_hotwords',
                    result: window.ASRBridge.setHotwords(data.hotwords)
                };
                break;
        }
        
        // 发送响应给父窗口
        if (event.source) {
            event.source.postMessage(response, '*');
        }
    }
});

// 当识别结果更新时发送给父窗口
function notifyResultUpdate(result) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'asr_result',
            sessionId: currentSessionId,
            result: result
        }, '*');
    }
}

// 修改音量阈值的函数
function updateVolumeThreshold(newThreshold) {
    audioVolumeThreshold = newThreshold;
    console.log("音量阈值已更新为:", audioVolumeThreshold);
    // 保存到localStorage以便页面刷新后保留设置
    try {
        localStorage.setItem('audioVolumeThreshold', audioVolumeThreshold);
    } catch (e) {
        console.error("保存音量阈值设置失败:", e);
    }
}

// 从localStorage获取保存的阈值设置
function loadVolumeThreshold() {
    try {
        const savedThreshold = localStorage.getItem('audioVolumeThreshold');
        if (savedThreshold !== null) {
            audioVolumeThreshold = parseInt(savedThreshold, 10);
            console.log("已从存储加载音量阈值:", audioVolumeThreshold);
            // 更新UI
            const thresholdSlider = document.getElementById('threshold-slider');
            const thresholdDisplay = document.getElementById('threshold-value-display');
            if (thresholdSlider && thresholdDisplay) {
                thresholdSlider.value = audioVolumeThreshold;
                thresholdDisplay.textContent = audioVolumeThreshold;
            }
        }
    } catch (e) {
        console.error("加载音量阈值设置失败:", e);
    }
}

// 加载保存的设置
function loadSavedSettings() {
    // 检查本地存储中是否有保存的设置
    // 1. 检查音量阈值设置
    const savedThreshold = localStorage.getItem('volume-threshold');
    if (savedThreshold !== null) {
        // 根据阈值设置开关状态
        const thresholdValue = parseInt(savedThreshold);
        audioVolumeThreshold = thresholdValue; // 设置全局阈值变量
        
        // 阈值为1时开关打开，否则关闭
        const isToggleOn = thresholdValue === 1;
        const thresholdToggle = document.getElementById('speaker-detection-toggle');
        const thresholdSlider = document.getElementById('threshold-slider');
        const thresholdDisplay = document.getElementById('threshold-value-display');
        
        if (thresholdToggle) thresholdToggle.checked = isToggleOn;
        if (thresholdSlider) thresholdSlider.value = thresholdValue;
        if (thresholdDisplay) thresholdDisplay.textContent = thresholdValue;
        
        console.log("已从存储加载音量阈值设置:", thresholdValue, isToggleOn ? "开启" : "关闭");
    } else {
        // 默认设置
        audioVolumeThreshold = 1; // 默认开启
        console.log("使用默认音量阈值设置: 1 (开启)");
    }

    // 可以在这里添加其他设置的加载
}

// 添加音量阈值控制UI和麦克风静音持续时间控制
function initVolumeControls() {
    // 替换音量滑块逻辑为开关逻辑
    const thresholdToggle = document.getElementById('speaker-detection-toggle');
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdDisplay = document.getElementById('threshold-value-display');
    
    // 设置开关事件监听
    thresholdToggle.addEventListener('change', function() {
        // 根据开关状态设置阈值
        const thresholdValue = this.checked ? 1 : 100;
        thresholdSlider.value = thresholdValue;
        thresholdDisplay.textContent = thresholdValue;
        
        // 保存设置到本地存储
        localStorage.setItem('volume-threshold', thresholdValue);
        
        // 更新实时音量监测阈值
        if (rec && rec.audioContext) {
            audioVolumeThreshold = thresholdValue;
            console.log(`音量阈值已更新为: ${audioVolumeThreshold}`);
        }
    });
    
    // 初始化开关状态
    if (thresholdToggle.checked) {
        audioVolumeThreshold = 1;
    } else {
        audioVolumeThreshold = 100;
    }
    thresholdDisplay.textContent = audioVolumeThreshold;
    thresholdSlider.value = audioVolumeThreshold;
    
    // 保持与滑块控件的兼容性，但隐藏了滑块
    thresholdSlider.addEventListener('input', function() {
        const value = parseInt(this.value);
        thresholdDisplay.textContent = value;
        audioVolumeThreshold = value;
        
        // 根据滑块值更新开关状态
        thresholdToggle.checked = value === 1;
        
        // 保存设置到本地存储
        localStorage.setItem('volume-threshold', value);
    });

    // 添加麦克风静音时间控制
}

// 添加麦克风静音持续时间控制UI
function addMicMuteDurationControl() {
    const controlsContainer = document.querySelector('.control-section');
    if (!controlsContainer) return;
    
    // 创建包装器
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '10px';
    
    // 创建标签
    const label = document.createElement('div');
    label.style.display = 'flex';
    label.style.justifyContent = 'space-between';
    label.style.marginBottom = '5px';
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '麦克风静音时间 (毫秒)';
    titleSpan.style.fontWeight = '500';
    
    const valueSpan = document.createElement('span');
    valueSpan.id = 'mute-duration-value';
    valueSpan.textContent = micMuteDuration;
    
    label.appendChild(titleSpan);
    label.appendChild(valueSpan);
    
    // 创建滑块
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '500';
    slider.max = '3000';
    slider.step = '100';
    slider.value = micMuteDuration;
    slider.style.width = '100%';
    slider.id = 'mute-duration-slider';
    
    // 加载保存的设置
    try {
        const savedDuration = localStorage.getItem('mic-mute-duration');
        if (savedDuration) {
            micMuteDuration = parseInt(savedDuration);
            slider.value = micMuteDuration;
            valueSpan.textContent = micMuteDuration;
        }
    } catch (e) {
        console.error('加载麦克风静音时间设置失败:', e);
    }
    
    // 添加滑块事件监听
    slider.addEventListener('input', function() {
        const value = parseInt(this.value);
        valueSpan.textContent = value;
        micMuteDuration = value;
        
        // 保存设置
        try {
            localStorage.setItem('mic-mute-duration', value);
        } catch (e) {
            console.error('保存麦克风静音时间设置失败:', e);
        }
        
        console.log(`麦克风静音时间已更新为: ${value}毫秒`);
    });
    
    // 添加到DOM
    wrapper.appendChild(label);
    wrapper.appendChild(slider);
    
    // 添加描述
    const description = document.createElement('div');
    description.style.fontSize = '12px';
    description.style.color = '#666';
    description.style.marginTop = '5px';
    description.textContent = '检测到声音时麦克风静音多长时间';
    
    wrapper.appendChild(description);
    
    // 插入到控制区域
    if (controlsContainer.firstChild) {
        controlsContainer.insertBefore(wrapper, controlsContainer.firstChild);
    } else {
        controlsContainer.appendChild(wrapper);
    }
}

// 开始监测音频音量
function startAudioMonitoring() {
    if (isAudioMonitoring) return;
    
    try {
        // 不再尝试直接访问parent.document
        // 改为通过消息传递与父窗口通信
        console.log("开始初始化音频监测 - 安全模式");
        
        // 设置消息监听器来接收父窗口的音量数据
        window.addEventListener('message', function(event) {
            // 确保消息来源安全（可以根据实际部署调整）
            // if (event.origin !== "期望的父窗口来源") return;
            
            if (event.data && event.data.type === 'audio_volume') {
                // 收到音量数据
                const volumeData = event.data.volume;
                handleExternalVolumeData(volumeData);
            }
        });
        
        // 通知父窗口我们已准备好接收音频数据
        try {
            window.parent.postMessage({ type: 'asr_ready' }, '*');
            console.log("已向父窗口发送准备就绪消息");
        } catch (e) {
            console.error("向父窗口发送消息失败:", e);
        }
        
        isAudioMonitoring = true;
        console.log("音频音量监测已启动(安全模式)");
    } catch (e) {
        console.error("音频监测初始化失败:", e);
        // 使用备用方法 - 仅使用本地控制
        setupLocalControls();
    }
}

// 处理从父窗口接收到的音量数据
function handleExternalVolumeData(volumeData) {
    if (!isAudioMonitoring) return;
    
    try {
        const averageVolume = volumeData.average || 0;
        const now = Date.now();
        
        // 更新音量指示器
        var volumeBar = document.getElementById('audio-volume-bar');
        if (volumeBar) {
            volumeBar.style.width = Math.min(100, averageVolume) + '%';
            
            // 根据音量调整颜色
            if (averageVolume < 20) {
                volumeBar.style.backgroundColor = '#2ec4b6'; // 绿色 - 低音量
            } else if (averageVolume > audioVolumeThreshold) {
                volumeBar.style.backgroundColor = '#f72585'; // 红色 - 高音量
            } else {
                volumeBar.style.backgroundColor = '#ff9f1c'; // 黄色 - 中等音量
            }
        }
        
        // 根据音量暂停/恢复录音 - 新的逻辑
        if (averageVolume > audioVolumeThreshold) {
            // 检测到声音，暂时静音麦克风
            lastAudioVolumeTime = now; // 记录上次高音量时间
            
            // 只有当麦克风未静音时才执行静音操作
            if (!isRecordingPaused) {
                window.pauseASRRecording(); // 这会启动自动恢复计时器
                console.log(`检测到声音输出 (${averageVolume.toFixed(1)}), 麦克风临时静音`);
            }
        } else {
            // 低音量状态 - 如果当前被暂停且超过自动恢复时间，则恢复
            if (isRecordingPaused && now - lastAudioVolumeTime > micMuteDuration) {
                // 只有在自动计时器到期后才尝试恢复
                if (!micMuteTimeout) {
                    window.resumeASRRecording();
                    console.log("检测到持续无声，恢复麦克风");
                }
            }
        }
    } catch (e) {
        console.error("音量数据处理出错:", e);
    }
}

// 设置本地控制（不依赖父窗口）
function setupLocalControls() {
    console.log("使用本地控制模式");
    
    // 更新暂停/恢复按钮状态
    const pauseButton = document.getElementById('manual-pause-button');
    if (pauseButton) {
        pauseButton.style.display = 'block';
    }
}

// 停止音频监测
function stopAudioMonitoring() {
    if (audioCheckInterval) {
        clearInterval(audioCheckInterval);
        audioCheckInterval = null;
    }
    
    if (audioContext) {
        try {
            audioContext.close();
        } catch (e) {
            console.error("关闭音频上下文失败:", e);
        }
        audioContext = null;
        audioAnalyser = null;
        audioDataArray = null;
    }
    
    isAudioMonitoring = false;
    console.log("音频音量监测已停止");
}

// 创建音频音量指示器
function createLocalVolumeIndicator() {
    if (!document.getElementById('audio-volume-indicator')) {
        console.log("创建音频音量指示器");
        
        var volumeIndicator = document.createElement('div');
        volumeIndicator.id = 'audio-volume-indicator';
        volumeIndicator.style.cssText = 'margin-top:5px;background:#f0f0f0;border-radius:4px;height:6px;width:100%;overflow:hidden;';
        
        var volumeBar = document.createElement('div');
        volumeBar.id = 'audio-volume-bar';
        volumeBar.style.cssText = 'background:#2ec4b6;height:100%;width:0%;transition:width 0.1s;';
        
        volumeIndicator.appendChild(volumeBar);
        
        var volumeLabel = document.createElement('div');
        volumeLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:2px;';
        volumeLabel.textContent = '扬声器音量';
        
        var container = document.createElement('div');
        container.style.cssText = 'margin-bottom:20px;';
        container.appendChild(volumeLabel);
        container.appendChild(volumeIndicator);
        
        info_div.parentNode.insertBefore(container, info_div.nextSibling);
    }
}
 
var sampleBuf = new Int16Array();
// 定义按钮响应事件
var btnStart;
var btnStop;
var btnConnect;
var wsslink;
var rec_text = "";  // for online rec asr result
var offline_text = ""; // for offline rec asr result
var info_div;
var upfile;

var isfilemode = false;  // if it is in file mode
var file_ext = "";
var file_sample_rate = 16000; //for wav file sample rate
var file_data_array;  // array to save file data
var totalsend = 0;

// var now_ipaddress=window.location.href;
// now_ipaddress=now_ipaddress.replace("https://","wss://");
// now_ipaddress=now_ipaddress.replace("static/index.html","");
// var localport=window.location.port;
// now_ipaddress=now_ipaddress.replace(localport,"10095");
// document.getElementById('wssip').value=now_ipaddress;

function addresschange()
{   
    // 确保wsslink已经定义
    if (!wsslink) {
        wsslink = document.getElementById('wsslink');
        if (!wsslink) {
            console.error("找不到wsslink元素");
            return;
        }
    }
    
    var Uri = document.getElementById('wssip').value; 
    document.getElementById('info_wslink').innerHTML="点此处手工授权（IOS手机）";
    Uri=Uri.replace(/wss/g,"https");
    console.log("addresschange uri=",Uri);
    
    wsslink.onclick=function(){
        window.open(Uri, '_blank');
    }
}

// from https://github.com/xiangyuecn/Recorder/tree/master
var readWavInfo=function(bytes){
	//读取wav文件头，统一成44字节的头
	if(bytes.byteLength<44){
		return null;
	};
	var wavView=bytes;
	var eq=function(p,s){
		for(var i=0;i<s.length;i++){
			if(wavView[p+i]!=s.charCodeAt(i)){
				return false;
			};
		};
		return true;
	};
	
	if(eq(0,"RIFF")&&eq(8,"WAVEfmt ")){
 
		var numCh=wavView[22];
		if(wavView[20]==1 && (numCh==1||numCh==2)){//raw pcm 单或双声道
			var sampleRate=wavView[24]+(wavView[25]<<8)+(wavView[26]<<16)+(wavView[27]<<24);
			var bitRate=wavView[34]+(wavView[35]<<8);
			var heads=[wavView.subarray(0,12)],headSize=12;//head只保留必要的块
			//搜索data块的位置
			var dataPos=0; // 44 或有更多块
			for(var i=12,iL=wavView.length-8;i<iL;){
				if(wavView[i]==100&&wavView[i+1]==97&&wavView[i+2]==116&&wavView[i+3]==97){//eq(i,"data")
					heads.push(wavView.subarray(i,i+8));
					headSize+=8;
					dataPos=i+8;break;
				}
				var i0=i;
				i+=4;
				i+=4+wavView[i]+(wavView[i+1]<<8)+(wavView[i+2]<<16)+(wavView[i+3]<<24);
				if(i0==12){//fmt 
					heads.push(wavView.subarray(i0,i));
					headSize+=i-i0;
				}
			}
			if(dataPos){
				var wavHead=new Uint8Array(headSize);
				for(var i=0,n=0;i<heads.length;i++){
					wavHead.set(heads[i],n);n+=heads[i].length;
				}
				return {
					sampleRate:sampleRate
					,bitRate:bitRate
					,numChannels:numCh
					,wavHead44:wavHead
					,dataPos:dataPos
				};
			};
		};
	};
	return null;
};

// 设置upfile的onchange处理函数
function setupUpfileHandlers() {
    if (!upfile) {
        console.error("upfile元素未定义");
        return;
    }
    
    upfile.onchange = function () {
        var len = this.files.length;  
        for(let i = 0; i < len; i++) {
            let fileAudio = new FileReader();
            fileAudio.readAsArrayBuffer(this.files[i]);  
 
            file_ext = this.files[i].name.split('.').pop().toLowerCase();
            var audioblob;
            fileAudio.onload = function() {
                audioblob = fileAudio.result;
                file_data_array = audioblob;
                if (info_div) info_div.innerHTML = '请点击连接进行识别';
            }

            fileAudio.onerror = function(e) {
                console.log('error' + e);
            }
        }
        
        // for wav file, we get the sample rate
        if(file_ext == "wav") {
            for(let i = 0; i < len; i++) {
                let fileAudio = new FileReader();
                fileAudio.readAsArrayBuffer(this.files[i]);  
                fileAudio.onload = function() {
                    audioblob = new Uint8Array(fileAudio.result);
 
                    // for wav file, we can get the sample rate
                    var info = readWavInfo(audioblob);
                    console.log(info);
                    if (info) file_sample_rate = info.sampleRate;
                }
            }
        }
    };
}

function play_file()
{
		  var audioblob=new Blob( [ new Uint8Array(file_data_array)] , {type :"audio/wav"});
		  var audio_record = document.getElementById('audio_record');
		  audio_record.src =  (window.URL||webkitURL).createObjectURL(audioblob); 
          audio_record.controls=true;
		  //audio_record.play();  //not auto play
}
function start_file_send()
{
		sampleBuf=new Uint8Array( file_data_array );
 
		var chunk_size=960; // for asr chunk_size [5, 10, 5]
 

 
		
 
		while(sampleBuf.length>=chunk_size){
			
		    sendBuf=sampleBuf.slice(0,chunk_size);
			totalsend=totalsend+sampleBuf.length;
			sampleBuf=sampleBuf.slice(chunk_size,sampleBuf.length);
			wsconnecter.wsSend(sendBuf);
 
		 
		}
 
		stop();

 

}
 
	
function on_recoder_mode_change()
{
            var item = null;
            var obj = document.getElementsByName("recoder_mode");
            for (var i = 0; i < obj.length; i++) { //遍历Radio 
                if (obj[i].checked) {
                    item = obj[i].value;  
					break;
                }
		    

           }
		    if(item=="mic")
			{
				document.getElementById("mic_mode_div").style.display = 'block';
				document.getElementById("rec_mode_div").style.display = 'none';
 
 
		        btnStart.disabled = true;
		        btnStop.disabled = true;
		        btnConnect.disabled=false;
				isfilemode=false;
			}
			else
			{
				document.getElementById("mic_mode_div").style.display = 'none';
				document.getElementById("rec_mode_div").style.display = 'block';
 
		        btnStart.disabled = true;
		        btnStop.disabled = true;
		        btnConnect.disabled=true;
			    isfilemode=true;
				info_div.innerHTML='请点击选择文件';
			    
	 
			}
}


function getHotwords(){
	
	var obj = document.getElementById("varHot");

	if(typeof(obj) == 'undefined' || obj==null || obj.value.length<=0){
	  return null;
	}
	let val = obj.value.toString();
  
	console.log("hotwords="+val);
	let items = val.split(/[(\r\n)\r\n]+/);  //split by \r\n
	var jsonresult = {};
	const regexNum = /^[0-9]*$/; // test number
	for (item of items) {
  
		let result = item.split(" ");
		if(result.length>=2 && regexNum.test(result[result.length-1]))
		{ 
			var wordstr="";
			for(var i=0;i<result.length-1;i++)
				wordstr=wordstr+result[i]+" ";
  
			jsonresult[wordstr.trim()]= parseInt(result[result.length-1]);
		}
	}
	console.log("jsonresult="+JSON.stringify(jsonresult));
	return  JSON.stringify(jsonresult);

}
function getAsrMode(){

            var item = null;
            var obj = document.getElementsByName("asr_mode");
            for (var i = 0; i < obj.length; i++) { //遍历Radio 
                if (obj[i].checked) {
                    item = obj[i].value;  
					break;
                }
		    

           }
            if(isfilemode)
			{
				item= "offline";
			}
		   console.log("asr mode"+item);
		   
		   return item;
}
		   
function handleWithTimestamp(tmptext,tmptime)
{
	console.log( "tmptext: " + tmptext);
	console.log( "tmptime: " + tmptime);
    if(tmptime==null || tmptime=="undefined" || tmptext.length<=0)
	{
		return tmptext;
	}
	tmptext=tmptext.replace(/。|？|，|、|\?|\.|\ /g, ","); // in case there are a lot of "。"
	var words=tmptext.split(",");  // split to chinese sentence or english words
	var jsontime=JSON.parse(tmptime); //JSON.parse(tmptime.replace(/\]\]\[\[/g, "],[")); // in case there are a lot segments by VAD
	var char_index=0; // index for timestamp
	var text_withtime="";
	for(var i=0;i<words.length;i++)
	{   
	if(words[i]=="undefined"  || words[i].length<=0)
	{
		continue;
	}
    console.log("words===",words[i]);
	console.log( "words: " + words[i]+",time="+jsontime[char_index][0]/1000);
	if (/^[a-zA-Z]+$/.test(words[i]))
	{   // if it is english
		text_withtime=text_withtime+jsontime[char_index][0]/1000+":"+words[i]+"\n";
		char_index=char_index+1;  //for english, timestamp unit is about a word
	}
	else{
        // if it is chinese
		text_withtime=text_withtime+jsontime[char_index][0]/1000+":"+words[i]+"\n";
		char_index=char_index+words[i].length; //for chinese, timestamp unit is about a char
	}
	}
	return text_withtime;
	

}

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

async function waitSpeakingEnd() {
    // 简化函数，跳过等待数字人响应的过程
    console.log("跳过等待数字人响应过程");
    
    // 如果正在暂停状态，立即恢复录音
    if(isRecordingPaused) {
        rec.resume();
        isRecordingPaused = false;
        info_div.innerHTML = '<span style="color:#2ec4b6">✓ 录音已恢复，请说话...</span>';
    }
    
    return;
}

// 语音识别结果; 对jsonMsg数据解析,将识别结果附加到编辑框中
// 语音识别结果; 对jsonMsg数据解析,将识别结果附加到编辑框中
function getJsonMessage( jsonMsg ) {
	//console.log(jsonMsg);
	console.log( "message: " + JSON.parse(jsonMsg.data)['text'] );


	var rectxt=""+JSON.parse(jsonMsg.data)['text'];
	var asrmodel=JSON.parse(jsonMsg.data)['mode'];
	var is_final=JSON.parse(jsonMsg.data)['is_final'];
	var timestamp=JSON.parse(jsonMsg.data)['timestamp'];

    // 检查识别文本的长度，防止显示区域过满
    var maxTextLength = 500; // 最大字符数
    if (rec_text.length > maxTextLength) {
        // 文本过长时清空之前的内容
        rec_text = "";
        offline_text = "";
        console.log("识别文本已超过最大长度，已自动清空");
    }

	if(asrmodel=="2pass-offline" || asrmodel=="offline")
	{
		// offline_text=offline_text+rectxt.replace(/ +/g,"")+'\n'; //handleWithTimestamp(rectxt,timestamp); //rectxt; //.replace(/ +/g,"");
        offline_text = rectxt.replace(/ +/g,"")+'\n';
		rec_text=offline_text;

        // 获取当前时间
        var now = new Date();
        var timeString = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0') + ':' +
            now.getSeconds().toString().padStart(2, '0');

        // 在发送请求前暂停麦克风录音 - 与音量检测使用相同的麦克风静音时间
        if (!isRecordingPaused && rec) {
            console.log("发送消息，麦克风临时静音");
            isRecordingPaused = true;
            // 暂停录音处理但不关闭连接
            rec.pause();
            info_div.innerHTML = "<span style='color:#ff9f1c'>⚠️ 正在处理您的请求，麦克风已临时静音</span>";
            
            // 设置自动恢复计时器
            if (micMuteTimeout) {
                clearTimeout(micMuteTimeout);
            }
            
            micMuteTimeout = setTimeout(function() {
                // 时间到后自动恢复
                if (isRecordingPaused) {
                    window.resumeASRRecording();
                    console.log("麦克风静音时间结束，自动恢复");
                }
            }, micMuteDuration);
        }

        onASRResult(rectxt.replace(/ +/g,""));

		// 注释掉聊天消息显示以减少资源消耗
		// addChatMessage(rectxt.replace(/ +/g,""), 'right', false);
	}
	else
	{
		rec_text=rec_text+rectxt; //.replace(/ +/g,"");
	}
	var varArea=document.getElementById('varArea');
	
	varArea.value=rec_text;

    // 仅在最终结果时调用 onASRResult

	console.log( "offline_text: " + asrmodel+","+offline_text);
	console.log( "rec_text: " + rec_text);
	if (isfilemode==true && is_final==true){
		console.log("call stop ws!");
		play_file();
		wsconnecter.wsStop();
        
		info_div.innerHTML="请点击连接";
 
		btnStart.disabled = true;
		btnStop.disabled = true;
		btnConnect.disabled=false;
	}
}

// 连接状态响应
function getConnState(connState) {
    // 确保DOM元素已初始化
    if (!info_div) {
        info_div = document.getElementById('info_div');
        if (!info_div) return; // 如果还不存在，直接返回
    }
    
    if (!btnStart) btnStart = document.getElementById('btnStart');
    if (!btnStop) btnStop = document.getElementById('btnStop');
    if (!btnConnect) btnConnect = document.getElementById('btnConnect');
    
    if (connState === 0) { //on open
        info_div.innerHTML='<span style="color:#2ec4b6">✓ 连接成功！语音识别已启动，系统会自动暂停/恢复识别</span>';
        
        if (isfilemode == true) {
            info_div.innerHTML='<span style="color:#4361ee">🔄 请耐心等待，大文件识别需要较长时间...</span>';
			start_file_send();
        } else {
            if (btnStart) btnStart.disabled = false;
			if (btnStop) btnStop.disabled = true;
            if (btnConnect) btnConnect.disabled = true;
            
            // 创建本地音量指示器与控制器
            createLocalVolumeIndicator();
            initVolumeControls();
            
            // 启动音频监测
            setTimeout(function() {
                startAudioMonitoring();
            }, 1000);
        }
    } else if (connState === 1) {
		stop();
    } else if (connState === 2) {
		stop();
        console.log('connecttion error');
        
        if (info_div) {
            info_div.innerHTML='<span style="color:#f72585">❌ 连接失败，请点击连接按钮重试</span>';
        }
        
        // 使用setTimeout确保弹窗不会导致UI线程阻塞
        setTimeout(function() {
            // 检查是否在iframe中，如果是，可能不需要弹窗
            if (window.parent !== window) {
                console.error("连接地址" + document.getElementById('wssip').value + "失败，请检查ASR地址和端口");
            } else {
                alert("连接地址" + document.getElementById('wssip').value + "失败，请检查asr地址和端口。或试试界面上手动授权，再连接。");
            }
        }, 100);
        
        // 更新按钮状态
        if (btnStart) btnStart.disabled = true;
		if (btnStop) btnStop.disabled = true;
        if (btnConnect) btnConnect.disabled = false;
        
        // 停止音频监测
        stopAudioMonitoring();
    }
}

function record() {
    // 添加音量显示指示器到页面
    if (!document.getElementById('volume-indicator')) {
        var volumeIndicator = document.createElement('div');
        volumeIndicator.id = 'volume-indicator';
        volumeIndicator.style.cssText = 'margin-top:10px;background:#f0f0f0;border-radius:4px;height:10px;width:100%;overflow:hidden;';
        
        var volumeBar = document.createElement('div');
        volumeBar.id = 'volume-bar';
        volumeBar.style.cssText = 'background:#2ec4b6;height:100%;width:0%;transition:width 0.1s;';
        
        volumeIndicator.appendChild(volumeBar);
        
        // 添加麦克风音量标签
        var volumeLabel = document.createElement('div');
        volumeLabel.style.cssText = 'font-size:12px;color:#666;margin-bottom:2px;';
        volumeLabel.textContent = '麦克风音量';
        
        var container = document.createElement('div');
        container.style.cssText = 'margin-bottom:20px;';
        container.appendChild(volumeLabel);
        container.appendChild(volumeIndicator);
        
        info_div.parentNode.insertBefore(container, info_div.nextSibling);
    }
    
    // 打开麦克风并启动录音 - 原始实现
    rec.open(function() {
        rec.start();
        console.log("开始录音");
        btnStart.disabled = true;
        btnStop.disabled = false;
        btnConnect.disabled = true;
        info_div.innerHTML = '<span style="color:#2ec4b6">✓ 录音已开始，请说话...</span>';
    });
}

// 确保startly函数全局可访问
window.startly = function() {
    start();
    record();
};

// 确保stop函数全局可访问
window.stop = function() {
    var chunk_size = new Array(5, 10, 5);
    var request = {
        "chunk_size": chunk_size,
        "wav_name": "h5",
        "is_speaking": false,
        "chunk_interval": 10,
        "mode": getAsrMode(),
    };
    console.log(request);
    
    if(sampleBuf.length > 0) {
        wsconnecter.wsSend(sampleBuf);
        console.log("发送数据长度: " + sampleBuf.length);
        sampleBuf = new Int16Array();
    }
 
    wsconnecter.wsSend(JSON.stringify(request));
 
    // 控件状态更新
    isRec = false;
    info_div.innerHTML='<span style="color:#4361ee">ℹ️ 识别已停止，点击"连接"重新开始</span>';

    // 停止音频监测
    stopAudioMonitoring();
    

    if(isfilemode == false) {
        btnStop.disabled = true;
        btnStart.disabled = true;
        btnConnect.disabled = false;
        
        // 立即关闭WebSocket连接，不等待3秒
        console.log("立即关闭WebSocket连接");
        wsconnecter.wsStop();
        
        rec.stop(function(blob, duration) {
            console.log("录音数据:", blob);
            var audioBlob = Recorder.pcm2wav(
                data = {sampleRate: 16000, bitRate: 16, blob: blob},
                function(theblob, duration) {
                    console.log("WAV音频:", theblob);
                    var audio_record = document.getElementById('audio_record');
                    audio_record.src = (window.URL || webkitURL).createObjectURL(theblob);
                    audio_record.controls = true;
                },
                function(msg) {
                    console.log("WAV转换错误:", msg);
                }
            );
        }, function(errMsg) {
            console.log("录音停止错误: " + errMsg);
        });
    }
};

function getUseITN() {
	var obj = document.getElementsByName("use_itn");
	for (var i = 0; i < obj.length; i++) {
		if (obj[i].checked) {
			return obj[i].value === "true";
		}
	}
	return false;
}

// 识别启动、停止、清空操作
function start() {
    // 清除显示
    clear();
    //控件状态更新
    console.log("isfilemode: " + isfilemode);
    
    //启动连接
    var ret = wsconnecter.wsStart();
    // 1 is ok, 0 is error
    if(ret == 1) {
        info_div.innerHTML='<span style="color:#4361ee">🔄 正在连接语音识别服务器，请稍候...</span>';
        isRec = true;
        btnStart.disabled = true;
        btnStop.disabled = true;
        btnConnect.disabled = true;
        
        return 1;
    } else {
        info_div.innerHTML='<span style="color:#f72585">❌ 连接失败，请重试</span>';
        btnStart.disabled = true;
        btnStop.disabled = true;
        btnConnect.disabled = false;
        
        return 0;
    }
}

function clear() {
    var varArea = document.getElementById('varArea');
    varArea.value = "";
    rec_text = "";
    offline_text = "";
}

// 测试麦克风访问
function testMicrophoneAccess(callback) {
    try {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(stream) {
                console.log("麦克风访问成功");
                
                // 关闭测试流
                stream.getTracks().forEach(track => track.stop());
                
                callback(true);
            })
            .catch(function(err) {
                console.error("麦克风访问失败:", err);
                callback(false);
            });
    } catch (e) {
        console.error("麦克风访问测试异常:", e);
        callback(false);
    }
}

// 修改recProcess函数，恢复原始逻辑
function recProcess(buffer, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx, asyncEnd) {
    // 如果录音已暂停，不处理
    if (isRecordingPaused) {
        return;
    }
    
    // 添加音量级别显示
    // console.log("当前音量:", powerLevel, "缓冲时长:", bufferDuration);
    
    // 更新音量指示器（如果存在）
    var volumeBar = document.getElementById('volume-bar');
    if (volumeBar) {
        volumeBar.style.width = Math.min(100, powerLevel) + '%';
        
        // 根据音量调整颜色
        if (powerLevel < 20) {
            volumeBar.style.backgroundColor = '#ff9f1c'; // 黄色警告
        } else if (powerLevel > 80) {
            volumeBar.style.backgroundColor = '#f72585'; // 红色过载
        } else {
            volumeBar.style.backgroundColor = '#2ec4b6'; // 正常绿色
        }
    }
    
    // 恢复原始处理逻辑
    if (isRec === true) {
		var data_48k = buffer[buffer.length-1];  
        var array_48k = new Array(data_48k);
        var data_16k = Recorder.SampleData(array_48k, bufferSampleRate, 16000).data;
 
		sampleBuf = Int16Array.from([...sampleBuf, ...data_16k]);
        var chunk_size = 2048; // for asr chunk_size [5, 10, 5]
        info_div.innerHTML = "" + bufferDuration/1000 + "s";
        while(sampleBuf.length >= chunk_size) {
            sendBuf = sampleBuf.slice(0, chunk_size);
            sampleBuf = sampleBuf.slice(chunk_size, sampleBuf.length);
			wsconnecter.wsSend(sendBuf);
            totalsend += sendBuf.length;
        }
    }
}


const chatContent = window.parent.document.getElementById('chat-content');

console.log('chatContent', chatContent);

/**
 * 向聊天窗口添加文本消息
 * @param {string} message - 要显示的文本消息
 * @param {string|boolean} position - 消息位置
 *   - 'left' 或 false: 显示在左侧（接收者）
 *   - 'right' 或 true: 显示在右侧（发送者）
 */
// function addChatMessage(message, position, isStreaming = false) {

//     // 将 position 参数转换为布尔值，可以是字符串 'left'/'right' 或布尔值 false/true
//     // 'left' 或 false 表示左侧消息（接收者）
//     // 'right' 或 true 表示右侧消息（发送者）
//     const isSender = position === 'right' || position === true;
    
//     // 首先尝试在当前文档中查找chat-content元素
//     let chatContent = document.getElementById('chat-content');
//     // 如果当前文档中没有找到，并且当前窗口是嵌入的，则尝试在父窗口中查找
//     if (!chatContent && window.parent && window.parent !== window) {
//         try {
//             chatContent = window.parent.document.getElementById('chat-content');
//             console.log('在父窗口找到chat-content元素');
//         } catch (e) {
//             console.error('尝试访问父窗口时出错:', e);
//             return; // 如果找不到聊天内容区域，直接返回
//         }
//     }
    
//     if (!chatContent) {
//         console.error('无法找到chat-content元素，请确保正确设置了聊天框的ID');
//         return;
//     }
    
//     // 如果是用户发送的消息，记录时间戳并重置当前流ID
//     if (isSender) {
//         window.lastUserMessageTimestamp = Date.now();
//         window.currentStreamingId = null; // 用户发送消息后，重置流ID，下一个系统消息将创建新的对话框
        
//         // 非流式消息，直接创建新的聊天项
//         createNewChatItem(chatContent, message, isSender, false);
//     } else {
//         // 非流式消息，强制创建新的聊天项
//         createNewChatItem(chatContent, message, isSender, false);
//         // 非流式消息后，重置当前流ID
//         window.currentStreamingId = null;

//     }
    
//     // 将滚动条滚动到最底部
//     chatContent.scrollTop = chatContent.scrollHeight;
// }

/**
 * 创建新的聊天项
 * @param {HTMLElement} chatContent - 聊天内容容器
 * @param {string} message - 消息内容
 * @param {boolean} isSender - 是否为发送者消息
 * @param {boolean} isStreaming - 是否为流式消息
 * @returns {HTMLElement} - 创建的聊天项元素
 */
function createNewChatItem(chatContent, message, isSender, isStreaming = false) {
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
    avatar.src = './static/audio.png';
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '10px';

    // 创建一个容器来包裹头像和消息
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.alignItems = 'end';
    messageContainer.style.fontSize = '12px';
    messageContainer.style.fontFamily = '隶书';
    messageContainer.style.border = '1px solid #dcdcdc';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.backgroundColor = '#ffffff';
    messageContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    messageContainer.style.padding = '10px';
    messageContainer.style.lineHeight = '16px'; // 设置行高为16px，与12px的字体大小形成4px的行间距
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

// 监听 ASR 识别结果（假设 ASR 结果通过某种方式传递到这里）
// 这里只是示例，需要根据实际情况修改
function onASRResult(result) {
    if (!result || typeof result !== 'string' || !result.trim()) {
        console.log('收到空的ASR结果，跳过处理');
        return;
    }
    
    // 在处理ASR结果前暂停麦克风录音
    window.pauseASRRecording();
    
    // 将识别结果作为右侧消息显示（用户说的话）
    // 注释掉聊天消息显示以减少资源消耗
    // addChatMessage(result, 'right', false);
    
    console.log('发送ASR识别结果:', result);
    
    // 直接访问父窗口的全局变量
    try {
        // 确保有父窗口且能够访问
        if (window.parent && window.parent !== window) {
            // 直接设置父窗口的全局变量
            window.parent.lastUserMessageTimestamp = Date.now();
            window.parent.currentStreamingId = null;
            
            console.log('直接修改父窗口变量: lastUserMessageTimestamp =', window.parent.lastUserMessageTimestamp);
            console.log('直接修改父窗口变量: currentStreamingId =', window.parent.currentStreamingId);
        }
    } catch (e) {
        console.error('访问父窗口变量时出错:', e);
        
        // 退回到使用window.postMessage方法
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'reset_streaming_id',
                source: 'asr_iframe',
                timestamp: Date.now()
            }, '*');
            console.log('通过postMessage请求重置父窗口变量');
        }
    }
    
    // 获取sessionId
    const sessionId = parseInt(window.parent.document.getElementById('sessionid').value);
    
    // 使用人脸检测功能来验证用户
    try {
        // 检查父窗口是否有人脸检测功能
        if (window.parent.addToFaceDetectionQueue && window.parent.useFaceDetection) {
            // 将消息添加到人脸检测队列
            console.log('将ASR识别结果添加到人脸检测队列:', result);
            info_div.innerHTML = "<span style='color:#06b6d4'>⏱️ 正在进行人脸验证，请看向摄像头...</span>";
            
            // 暂停麦克风
            window.pauseASRRecording();
            // 添加到人脸检测队列
            window.parent.addToFaceDetectionQueue(result);
            
            // 在界面显示消息
            // addChatMessage(result, 'right', false, 'audio');
        } else {
            info_div.innerHTML = "<span style='color:#ff9f1c'>人脸检测功能已停用，直接发送消息</span>";
            // 回退到原来的直接发送方式
            fetch(`http://${window.parent.host}/human`, {
                body: JSON.stringify({
                    text: result,
                    type: 'chat',
                    interrupt: true,
                    sessionid: sessionId,
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST'
            })
            .then(response => {
                if (!response.ok) {
                    console.error('后端响应错误:', response.status);
                    info_div.innerHTML = '<span style="color:#f72585">❌ 发送到后端失败，状态码: ' + response.status + '</span>';
                } else {
                    console.log('识别文本发送成功');
                    window.parent.addChatMessage(result, 'right', false, 'audio');
                    // 保持麦克风静音状态，由计时器自动恢复
                }
                return response.json().catch(e => null);
            })
            .then(data => {
                if (data) console.log('后端返回数据:', data);
            })
            .catch(error => {
                console.error('请求失败:', error);
                info_div.innerHTML = '<span style="color:#f72585">❌ 后端连接失败，请检查网络</span>';

                // 如果请求失败，也考虑恢复麦克风
                if (isRecordingPaused && micMuteTimeout) {
                    clearTimeout(micMuteTimeout);
                    window.resumeASRRecording();
                }
            });
        }
    } catch (error) {
        console.error('人脸检测功能调用错误:', error);
        info_div.innerHTML = '<span style="color:#f72585">❌ 人脸检测功能错误</span>';
        
        // 如果人脸检测功能出错，恢复麦克风
        if (isRecordingPaused && micMuteTimeout) {
            clearTimeout(micMuteTimeout);
            window.resumeASRRecording();
        }
    }
}

// 页面初始化
window.onload = function() {
    // 初始化DOM元素引用
    info_div = document.getElementById('info_div');
    btnStart = document.getElementById('btnStart');
    btnStop = document.getElementById('btnStop');
    btnConnect = document.getElementById('btnConnect');
    wsslink = document.getElementById('wsslink');
    upfile = document.getElementById('upfile');
    
    // 加载保存的设置
    loadSavedSettings();
    
    // 初始化音量控制
    initVolumeControls();
    
    // 添加事件监听器
    if (btnStart) btnStart.onclick = record;
    if (btnStop) {
        btnStop.onclick = stop;
        btnStop.disabled = true;
    }
    if (btnStart) btnStart.disabled = true;
    if (btnConnect) btnConnect.onclick = start;
    
    if (upfile) {
        upfile.onclick = function() {
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = true;
            if (btnConnect) btnConnect.disabled = false;
        };
        
        // 初始化upfile的onchange事件处理
        setupUpfileHandlers();
    }
    
    // 设置地址变更处理
    addresschange();
    
    // 加载其他配置
    const speakerToggle = document.getElementById('speaker-detection-toggle');
    if (speakerToggle) {
        speakerToggle.addEventListener('change', function() {
            // 根据开关状态设置阈值
            const thresholdValue = this.checked ? 1 : 100;
            const thresholdSlider = document.getElementById('threshold-slider');
            const thresholdValueDisplay = document.getElementById('threshold-value-display');
            
            if (thresholdSlider) thresholdSlider.value = thresholdValue;
            if (thresholdValueDisplay) thresholdValueDisplay.textContent = thresholdValue;
            
            // 更新实时音量监测阈值
            audioVolumeThreshold = thresholdValue;
            
            // 保存设置
            localStorage.setItem('volume-threshold', thresholdValue);
            
            console.log(`扬声器检测已${this.checked ? '开启' : '关闭'}，阈值设为：${thresholdValue}`);
        });
    }
    
    console.log("ASR页面初始化完成");
};


