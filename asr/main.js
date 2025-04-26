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

// 全局配置变量
window._asrPauseDelay = 500;    // 默认暂停延迟时间(毫秒)
window._asrResumeDelay = 1500;  // 默认恢复延迟时间(毫秒)

// 全局函数，允许从外部暂停ASR录音
window.pauseASRRecording = function() {
    if (!isRecordingPaused && rec) {
        const pauseDelay = window._asrPauseDelay || 500; // 使用配置的延迟或默认值
        console.log(`ASR录音被外部暂停请求，${pauseDelay/1000}秒后执行`);
        
        // 延迟配置的时间后执行暂停，给数字人停顿提供缓冲时间
        setTimeout(() => {
            // 再次检查是否仍需要暂停（可能在延迟期间已经被恢复）
            if (!isRecordingPaused && rec) {
                console.log("ASR录音被外部暂停");
                isRecordingPaused = true;
                // 暂停录音处理但不关闭连接
                rec.pause();
                info_div.innerHTML = "<span style='color:#ff9f1c'>⚠️ 检测到声音播放，语音识别已暂停</span>";
            }
        }, pauseDelay);
    }
};

// 全局函数，允许从外部恢复ASR录音
window.resumeASRRecording = function() {
    if (isRecordingPaused && rec) {
        console.log("ASR录音被外部恢复");
        isRecordingPaused = false;
        isPendingPause = false; // 重置挂起暂停标志
        
        // 恢复录音处理
        rec.resume();
        info_div.innerHTML = "<span style='color:#2ec4b6'>✓ 语音识别已恢复，可以说话了</span>";
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
    },
    
    // 设置音频监测配置
    setAudioConfig: function(config) {
        if (!config || typeof config !== 'object') {
            return { success: false, message: '配置参数格式错误' };
        }
        
        // 设置音量阈值
        if (typeof config.volumeThreshold === 'number') {
            audioVolumeThreshold = config.volumeThreshold;
            console.log(`音量阈值已更新为: ${audioVolumeThreshold}`);
            
            // 保存到本地存储
            try {
                localStorage.setItem('audioVolumeThreshold', audioVolumeThreshold);
            } catch (e) {
                console.error("保存音量阈值设置失败:", e);
            }
        }
        
        // 设置暂停延迟时间（毫秒）
        if (typeof config.pauseDelay === 'number' && config.pauseDelay >= 0) {
            window._asrPauseDelay = config.pauseDelay;
            console.log(`暂停延迟已更新为: ${window._asrPauseDelay}毫秒`);
        }
        
        // 设置恢复延迟时间（毫秒）
        if (typeof config.resumeDelay === 'number' && config.resumeDelay >= 0) {
            window._asrResumeDelay = config.resumeDelay;
            console.log(`恢复延迟已更新为: ${window._asrResumeDelay}毫秒`);
        }
        
        return { 
            success: true, 
            message: '音频配置已更新',
            currentConfig: {
                volumeThreshold: audioVolumeThreshold,
                pauseDelay: window._asrPauseDelay || 500,
                resumeDelay: window._asrResumeDelay || 1500
            }
        };
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
                
            case 'set_audio_config':
                response = { 
                    type: 'asr_response', 
                    action: 'set_audio_config',
                    result: window.ASRBridge.setAudioConfig(data.config || {})
                };
                break;
        }
        
        // 发送响应给父窗口
        if (event.source) {
            event.source.postMessage(response, '*');
        }
    }
});

// 音频状态变量
var lastAudioVolumeTime = 0; // 上次检测到高音量的时间
var lastAudioLowTime = 0;    // 上次检测到低音量的时间
var audioVolumeThreshold = 20; // 音量阈值，可根据实际情况调整
var isPendingPause = false;  // 是否正在等待暂停
var audioCheckInterval = null;
var audioContext = null;
var audioAnalyser = null;
var audioDataArray = null;
var isAudioMonitoring = false;

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

// 初始化音量控制
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

    // 初始化手动暂停/恢复按钮
    // ... existing code ...
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
        const resumeDelay = window._asrResumeDelay || 1500; // 使用配置的恢复延迟或默认值
        
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
        
        // 音量超过阈值逻辑
        if (averageVolume > audioVolumeThreshold) {
            // 音量超过阈值，记录时间
            lastAudioVolumeTime = now;
            
            // 如果当前不在暂停状态，且没有挂起的暂停请求，创建一个暂停请求
            if (!isRecordingPaused && !isPendingPause) {
                isPendingPause = true;
                console.log("检测到高音量，准备暂停语音识别");
                
                // 调用已优化的pauseASRRecording函数，其内部有动态配置的延迟
                window.pauseASRRecording();
            }
        } 
        // 音量低于阈值逻辑
        else {
            // 更新最后一次低音量时间
            lastAudioLowTime = now;
            
            // 如果持续低音量超过配置的时间，且当前处于暂停状态，则恢复录音
            if (isRecordingPaused && (now - lastAudioVolumeTime > resumeDelay)) {
                isPendingPause = false; // 清除任何挂起的暂停请求
                window.resumeASRRecording();
                console.log(`持续检测到低音量${resumeDelay/1000}秒，恢复语音识别`);
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

async function is_speaking() {
	const response = await fetch('http://192.168.3.100:8018/is_speaking', {
		body: JSON.stringify({
			sessionid: 0,
		}),
		headers: {
			'Content-Type': 'application/json'
		},
		method: 'POST'
	  });
	const data = await response.json();
	console.log('is_speaking res:',data);
	return data.data;
}

async function waitSpeakingEnd() {
    try {
        console.log("暂停录音，等待数字人响应");
        rec.pause(); // 暂停录音而不是停止
        isRecordingPaused = true;
        
        let speakingDetected = false;
        let maxWaitTime = 10; // 最大等待时间（秒）
        
        // 等待数字人开始讲话，最长等待10秒
        for(let i = 0; i < maxWaitTime; i++) {
            try {
                const response = await fetch('http://192.168.3.100:8018/is_speaking', {
                    body: JSON.stringify({
                        sessionid: 0,
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    method: 'POST'
                });
                
                if(!response.ok) {
                    console.error("检查说话状态失败:", response.status);
                    break;
                }
                
                const data = await response.json();
                console.log('is_speaking res:', data);
                
                if(data.data === true) {
                    speakingDetected = true;
                    info_div.innerHTML = '<span style="color:#4361ee">🔄 数字人正在回应...</span>';
                    break;
                }
                
                await sleep(1000);
            } catch(e) {
                console.error("检查说话状态出错:", e);
                break;
            }
        }
        
        if (!speakingDetected) {
            console.log("未检测到数字人说话，恢复录音");
            rec.resume();
            isRecordingPaused = false;
            info_div.innerHTML = '<span style="color:#ff9f1c">⚠️ 未检测到数字人响应，已恢复录音</span>';
            return;
        }
        
        // 等待数字人讲话结束，设置超时保护
        let waitEndTimeout = setTimeout(() => {
            console.log("等待数字人结束说话超时");
            if(isRecordingPaused) {
                rec.resume();
                isRecordingPaused = false;
                info_div.innerHTML = '<span style="color:#2ec4b6">✓ 录音已恢复，请说话...</span>';
            }
        }, 30000); // 30秒超时保护
        
        while(true) {
            try {
                const response = await fetch('http://192.168.3.100:8018/is_speaking', {
                    body: JSON.stringify({
                        sessionid: 0,
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    method: 'POST'
                });
                
                if(!response.ok) {
                    console.error("检查说话结束状态失败:", response.status);
                    break;
                }
                
                const data = await response.json();
                
                if(data.data === false) {
                    console.log("数字人已停止说话");
                    break;
                }
                
                await sleep(1000);
            } catch(e) {
                console.error("检查说话结束状态出错:", e);
                break;
            }
        }
        
        clearTimeout(waitEndTimeout);
        
        // 等待一小段时间再恢复录音
        await sleep(1000);
        
        // 恢复录音
        if(isRecordingPaused) {
            rec.resume();
            isRecordingPaused = false;
            info_div.innerHTML = '<span style="color:#2ec4b6">✓ 数字人回应完毕，录音已恢复，请说话...</span>';
        }
    } catch(e) {
        console.error("waitSpeakingEnd 函数出错:", e);
        // 确保出错时也能恢复录音
        if(isRecordingPaused) {
            rec.resume();
            isRecordingPaused = false;
            info_div.innerHTML = '<span style="color:#ff9f1c">⚠️ 出现错误，录音已恢复</span>';
        }
    }
}
// 语音识别结果; 对jsonMsg数据解析,将识别结果附加到编辑框中
function getJsonMessage(jsonMsg) {
    console.log("收到JSON消息:", jsonMsg);
    
    try {
        var reMessage = jsonMsg.data;
        var jsonMessage = JSON.parse(reMessage); // 解析json字符串
        
        console.log("解析后的消息: " + jsonMessage['text']);

        var rectxt = "" + jsonMessage['text'];
        var asrmodel = jsonMessage['mode'];
        var is_final = jsonMessage['is_final'];
        var timestamp = jsonMessage['timestamp'];

        // 检查识别文本的长度，防止显示区域过满
        var maxTextLength = 500; // 最大字符数
        if (rec_text.length > maxTextLength) {
            // 文本过长时清空之前的内容
            rec_text = "";
            offline_text = "";
            console.log("识别文本已超过最大长度，已自动清空");
        }
        
        if (asrmodel == "2pass-offline" || asrmodel == "offline") {
            // 清理文本中的多余空格
            const cleanResult = rectxt.replace(/ +/g, "");
            
            if (!cleanResult || cleanResult.trim() === '') {
                console.log("接收到空的识别结果，跳过处理");
                return;
            }
            
            offline_text = offline_text + cleanResult + '\n';
            rec_text = offline_text;

            // 获取当前时间
            var now = new Date();
            var timeString = now.getHours().toString().padStart(2, '0') + ':' +
                now.getMinutes().toString().padStart(2, '0') + ':' +
                now.getSeconds().toString().padStart(2, '0');

            // 调用onASRResult处理识别结果
            console.log("最终识别结果:", cleanResult);
            onASRResult(cleanResult);

            // 使用try-catch防止后端接口调用错误影响前端
            try {
                // 获取会话ID
                const sessionId = currentSessionId || 0;
                console.log("使用会话ID:", sessionId);
                
                // 调用后端接口
                fetch('http://192.168.3.100:8018/human', {
                    body: JSON.stringify({
                        text: cleanResult,
                        type: 'chat',
                        interrupt: false,
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
                        console.log('识别文本发送成功:', cleanResult);
                        info_div.innerHTML = '<span style="color:#2ec4b6">✓ 文本已发送 [' + timeString + ']</span>';
                    }
                    return response.json().catch(e => null);
                })
                .then(data => {
                    if (data) console.log('后端返回数据:', data);
                })
                .catch(error => {
                    console.error('请求失败:', error);
                    info_div.innerHTML = '<span style="color:#f72585">❌ 后端连接失败，请检查网络</span>';
                });
            } catch (e) {
                console.error("调用后端接口失败:", e);
                info_div.innerHTML = '<span style="color:#f72585">❌ 调用接口出错: ' + e.message + '</span>';
            }
        } else {
            rec_text = rec_text + rectxt;
        }
        
        var varArea = document.getElementById('varArea');
        varArea.value = rec_text;
        
        // 通知父窗口识别结果更新
        notifyResultUpdate(rec_text);
        
        if (isfilemode == true && is_final == true) {
            console.log("call stop ws!");
            play_file();
            wsconnecter.wsStop();

            info_div.innerHTML = "请点击连接";

            btnStart.disabled = true;
            btnStop.disabled = true;
            btnConnect.disabled = false;
        }
    } catch (e) {
        console.error("处理消息错误:", e);
        info_div.innerHTML = "解析异常: " + e.message;
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
    info_div.innerHTML='<span style="color:#4361ee">🔄 正在处理识别结果，请稍候...</span>';

    // 停止音频监测
    stopAudioMonitoring();

    if(isfilemode == false) {
        btnStop.disabled = true;
        btnStart.disabled = true;
        btnConnect.disabled = true;
        
        //wait 3s for asr result
        setTimeout(function() {
            console.log("关闭WebSocket连接");
            wsconnecter.wsStop();
            btnConnect.disabled = false;
            info_div.innerHTML='<span style="color:#4361ee">ℹ️ 识别已停止，点击"连接"重新开始</span>';
        }, 3000);
        
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
        var chunk_size = 960; // for asr chunk_size [5, 10, 5]
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
function addChatMessage(message, position) {
    // 将 position 参数转换为布尔值，可以是字符串 'left'/'right' 或布尔值 false/true
    // 'left' 或 false 表示左侧消息（接收者）
    // 'right' 或 true 表示右侧消息（发送者）
    const isSender = position === 'right' || position === true;
    
    // 创建消息ID，便于防重复
    const timestamp = new Date().getTime();
    const messageId = `msg_${timestamp}`;
    
    // 先添加到当前页面的聊天窗口
    addChatMessageToDOM(message, isSender, messageId);
    
    // 使用广播服务发送消息到所有页面
    if (window.chatBroadcastService) {
        window.chatBroadcastService.broadcastMessage(message, isSender ? 'right' : 'left');
    }
}

/**
 * 在DOM中添加聊天消息
 * @param {string} message - 消息内容
 * @param {boolean} isSender - 是否是发送者
 * @param {string} messageId - 消息ID，用于防重复
 */
function addChatMessageToDOM(message, isSender, messageId) {
    try {
        // 检查消息是否已存在，避免重复
        if (messageId) {
            const existingMessage = document.querySelector(`[data-message-id="${messageId}"]`);
            if (existingMessage) {
                console.log('消息已存在，跳过显示:', messageId);
                return;
            }
        }
        
        const chatItem = document.createElement('div');
        chatItem.classList.add('chat-item');
        chatItem.classList.add(isSender ? 'sender' : 'receiver');
        
        // 添加消息ID，用于防重复
        if (messageId) {
            chatItem.setAttribute('data-message-id', messageId);
        }
        
        // 使用 flex 布局让 avatar 和 messageContainer 处于同一行
        chatItem.style.display = 'flex';
        chatItem.style.alignItems = 'start'; // 垂直顶部对齐
        chatItem.style.marginBottom = '10px'; // 为每个聊天项添加底部间距

        // 创建头像图片元素
        const avatar = document.createElement('img');
        avatar.src = '../static/audio.png'; // 尝试相对路径
        avatar.onerror = function() {
            // 如果加载失败，尝试其他路径
            avatar.src = './static/audio.png';
            avatar.onerror = function() {
                avatar.src = '/static/audio.png';
                avatar.onerror = null; // 防止无限循环
            };
        };
        avatar.style.width = '24px';
        avatar.style.height = '24px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '10px';

        // 创建一个容器来包裹头像和消息
        const messageContainer = document.createElement('div');
        messageContainer.style.display = 'flex';
        messageContainer.style.alignItems = 'end';
        messageContainer.style.fontSize = '12px';
        messageContainer.style.fontFamily = '宋体';
        messageContainer.style.border = '1px solid #dcdcdc';
        messageContainer.style.borderRadius = '8px';
        messageContainer.style.backgroundColor = '#ffffff';
        messageContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
        messageContainer.style.padding = '10px';
        messageContainer.style.maxWidth = '80%'; // 限制消息容器的最大宽度

        // 将头像和消息添加到容器中
        if (isSender) {
            messageContainer.appendChild(document.createTextNode(message));
            chatItem.style.justifyContent = 'flex-end'; // 发送者消息右对齐
            avatar.style.marginLeft = '10px'; // 发送者头像右侧间距
            avatar.style.marginRight = 0; // 移除发送者头像左侧间距
        } else {
            messageContainer.appendChild(document.createTextNode(message));
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

        // 查找本地的chat-content元素
        let chatContent = document.getElementById('chat-content');
        
        // 如果本地没有，则创建一个
        if (!chatContent) {
            chatContent = document.createElement('div');
            chatContent.id = 'chat-content';
            chatContent.style.maxHeight = '300px';
            chatContent.style.overflow = 'auto';
            chatContent.style.margin = '10px 0';
            chatContent.style.padding = '10px';
            chatContent.style.border = '1px solid #dcdcdc';
            chatContent.style.borderRadius = '8px';
            
            // 添加到页面中
            const container = document.querySelector('.asr-container') || document.body;
            container.appendChild(chatContent);
        }
        
        // 添加消息到聊天内容区域
        chatContent.appendChild(chatItem);
        
        // 将滚动条滚动到最底部
        chatContent.scrollTop = chatContent.scrollHeight;
    } catch (e) {
        console.error('添加消息到DOM失败:', e);
    }
}

// 监听 ASR 识别结果
function onASRResult(result) {
    if (!result || typeof result !== 'string' || result.trim() === '') {
        console.log('收到空的ASR结果，跳过处理');
        return;
    }
    
    console.log('收到ASR结果:', result);
    
    // 确保结果是字符串并且非空
    const cleanResult = result.trim();
    if (cleanResult) {
        // 使用addChatMessage添加到聊天窗口，它会触发广播服务
        addChatMessage(cleanResult, 'left');
        
        // 注意：调用/human接口已经在getJsonMessage函数中完成
        // 且webrtcapi-asr.html也已经注册了处理器来响应广播的消息
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
    
    // 订阅广播消息，用于接收其他页面发来的消息
    if (window.chatBroadcastService) {
        window.chatBroadcastService.subscribe(function(data) {
            // 仅处理其他页面发来的消息，避免重复显示
            const isCurrentMessage = document.querySelector(`[data-message-id="${data.id}"]`);
            if (!isCurrentMessage) {
                addChatMessageToDOM(data.message, data.position === 'right');
            }
        });
        
        // 加载已存储的消息
        const storedMessages = window.chatBroadcastService.getStoredMessages();
        if (storedMessages && storedMessages.length > 0) {
            // 最多显示最新的10条消息
            const recentMessages = storedMessages.slice(-10);
            recentMessages.forEach(msg => {
                addChatMessageToDOM(msg.message, msg.position === 'right');
            });
        }
    }
    
    console.log("ASR页面初始化完成");
};


