/**
 * Copyright FunASR (https://github.com/alibaba-damo-academy/FunASR). All Rights
 * Reserved. MIT License  (https://opensource.org/licenses/MIT)
 */
/* 2022-2023 by zhaoming,mali aihealthx.com */


// 连接; 定义socket连接类对象与语音对象
var wsconnecter = new WebSocketConnectMethod({msgHandle:getJsonMessage,stateHandle:getConnState});
var audioBlob;

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

// 全局函数，允许从外部暂停ASR录音
window.pauseASRRecording = function() {
    if (!isRecordingPaused && rec) {
        console.log("ASR录音被外部暂停");
        isRecordingPaused = true;
        // 暂停录音处理但不关闭连接
        rec.pause();
        info_div.innerHTML = "<span style='color:#ff9f1c'>⚠️ 检测到声音播放，语音识别已暂停</span>";
    }
};

// 全局函数，允许从外部恢复ASR录音
window.resumeASRRecording = function() {
    if (isRecordingPaused && rec) {
        console.log("ASR录音被外部恢复");
        isRecordingPaused = false;
        // 恢复录音处理
        rec.resume();
        info_div.innerHTML = "<span style='color:#2ec4b6'>✓ 语音识别已恢复，可以说话了</span>";
    }
};

// 添加消息监听器，处理来自父窗口的控制命令
window.addEventListener('message', function(event) {
    // 可以根据需要验证消息来源
    // if (event.origin !== expectedOrigin) return;
    
    if (event.data && event.data.type === 'asr_control') {
        console.log("收到控制命令:", event.data.action);
        
        if (event.data.action === 'pause') {
            window.pauseASRRecording();
        } else if (event.data.action === 'resume') {
            window.resumeASRRecording();
        }
    }
});

// 添加音频音量监测变量
var lastAudioVolumeTime = 0;
var audioVolumeThreshold = 20; // 音量阈值，可根据实际情况调整
var audioCheckInterval = null;
var audioContext = null;
var audioAnalyser = null;
var audioDataArray = null;
var isAudioMonitoring = false;

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

// 初始化音量相关控件
function initVolumeControls() {
    // 加载保存的阈值设置
    loadVolumeThreshold();
    
    // 为滑块添加事件监听器
    const thresholdSlider = document.getElementById('threshold-slider');
    if (thresholdSlider) {
        thresholdSlider.addEventListener('input', function() {
            const newValue = parseInt(this.value, 10);
            updateVolumeThreshold(newValue);
            const thresholdDisplay = document.getElementById('threshold-value-display');
            if (thresholdDisplay) {
                thresholdDisplay.textContent = newValue;
            }
        });
    }
    
    // 为手动暂停/恢复按钮添加事件监听器
    const pauseButton = document.getElementById('manual-pause-button');
    if (pauseButton) {
        pauseButton.addEventListener('click', function() {
            if (isRecordingPaused) {
                window.resumeASRRecording();
                this.textContent = '暂停识别';
                this.style.background = '#ff9f1c';
            } else {
                window.pauseASRRecording();
                this.textContent = '恢复识别';
                this.style.background = '#2ec4b6';
            }
        });
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
        
        // console.log("当前音频音量:", averageVolume);
        
        // 根据音量暂停/恢复录音
        if (averageVolume > audioVolumeThreshold) {
            // 音量超过阈值，暂停录音
            if (!isRecordingPaused) {
                window.pauseASRRecording();
                console.log("音量过高，暂停语音识别");
            }
            lastAudioVolumeTime = Date.now();
        } else if (Date.now() - lastAudioVolumeTime > 1000) { 
            // 音量低于阈值且持续1秒，恢复录音
            if (isRecordingPaused) {
                window.resumeASRRecording();
                console.log("音量已恢复正常，继续语音识别");
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
 
var sampleBuf=new Int16Array();
// 定义按钮响应事件
var btnStart = document.getElementById('btnStart');
btnStart.onclick = record;
var btnStop = document.getElementById('btnStop');
btnStop.onclick = stop;
btnStop.disabled = true;
btnStart.disabled = true;
 
btnConnect= document.getElementById('btnConnect');
btnConnect.onclick = start;

var awsslink= document.getElementById('wsslink');

 
var rec_text="";  // for online rec asr result
var offline_text=""; // for offline rec asr result
var info_div = document.getElementById('info_div');

var upfile = document.getElementById('upfile');

 

var isfilemode=false;  // if it is in file mode
var file_ext="";
var file_sample_rate=16000; //for wav file sample rate
var file_data_array;  // array to save file data
 
var totalsend=0;


// var now_ipaddress=window.location.href;
// now_ipaddress=now_ipaddress.replace("https://","wss://");
// now_ipaddress=now_ipaddress.replace("static/index.html","");
// var localport=window.location.port;
// now_ipaddress=now_ipaddress.replace(localport,"10095");
// document.getElementById('wssip').value=now_ipaddress;
addresschange();
function addresschange()
{   
	
    var Uri = document.getElementById('wssip').value; 
	document.getElementById('info_wslink').innerHTML="点此处手工授权（IOS手机）";
	Uri=Uri.replace(/wss/g,"https");
	console.log("addresschange uri=",Uri);
	
	awsslink.onclick=function(){
		window.open(Uri, '_blank');
		}
	
}

upfile.onclick=function()
{
		btnStart.disabled = true;
		btnStop.disabled = true;
		btnConnect.disabled=false;
	
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

upfile.onchange = function () {
　　　　　　var len = this.files.length;  
            for(let i = 0; i < len; i++) {

                let fileAudio = new FileReader();
                fileAudio.readAsArrayBuffer(this.files[i]);  
 
				file_ext=this.files[i].name.split('.').pop().toLowerCase();
                var audioblob;
                fileAudio.onload = function() {
                audioblob = fileAudio.result;
 
				 
				 file_data_array=audioblob;
 
                  
                 info_div.innerHTML='请点击连接进行识别';
 
                }

　　　　　　　　　　fileAudio.onerror = function(e) {
　　　　　　　　　　　　console.log('error' + e);
　　　　　　　　　　}
            }
			// for wav file, we  get the sample rate
			if(file_ext=="wav")
            for(let i = 0; i < len; i++) {

                let fileAudio = new FileReader();
                fileAudio.readAsArrayBuffer(this.files[i]);  
                fileAudio.onload = function() {
                audioblob = new Uint8Array(fileAudio.result);
 
				// for wav file, we can get the sample rate
				var info=readWavInfo(audioblob);
				   console.log(info);
				   file_sample_rate=info.sampleRate;
	 
 
                }

　　　　　　 
            }
 
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
	const response = await fetch('http://192.168.3.100:8010/is_speaking', {
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
                const response = await fetch('http://192.168.3.100:8010/is_speaking', {
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
                const response = await fetch('http://192.168.3.100:8010/is_speaking', {
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
		offline_text=offline_text+rectxt.replace(/ +/g,"")+'\n'; //handleWithTimestamp(rectxt,timestamp); //rectxt; //.replace(/ +/g,"");
		rec_text=offline_text;

        // 获取当前时间
        var now = new Date();
        var timeString = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0') + ':' +
            now.getSeconds().toString().padStart(2, '0');


        onASRResult(rectxt.replace(/ +/g,""));

		fetch('http://192.168.3.100:8010/human', {
            body: JSON.stringify({
                text: rectxt.replace(/ +/g,""),
                type: 'chat',
                interrupt: false,
                sessionid: 0, // 默认会话ID，如果需要可以从页面获取
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

        // 不再等待数字人响应
        // waitSpeakingEnd();
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
    if (connState === 0) { //on open
        info_div.innerHTML='<span style="color:#2ec4b6">✓ 连接成功！语音识别已启动，系统会自动暂停/恢复识别</span>';
        
        if (isfilemode == true) {
            info_div.innerHTML='<span style="color:#4361ee">🔄 请耐心等待，大文件识别需要较长时间...</span>';
			start_file_send();
        } else {
			btnStart.disabled = false;
			btnStop.disabled = true;
            btnConnect.disabled = true;
            
            // 创建本地音量指示器与控制器
            createLocalVolumeIndicator();
            initVolumeControls();
            
            // 启动音频监测
            setTimeout(function() {
                startAudioMonitoring();
            }, 1000);
        }
    } else if (connState === 1) {
		//stop();
    } else if (connState === 2) {
		stop();
        console.log('connecttion error');
		 
        alert("连接地址" + document.getElementById('wssip').value + "失败，请检查asr地址和端口。或试试界面上手动授权，再连接。");
		btnStart.disabled = true;
		btnStop.disabled = true;
        btnConnect.disabled = false;
        
        info_div.innerHTML='<span style="color:#f72585">❌ 连接失败，请点击连接按钮重试</span>';
        stopAudioMonitoring(); // 停止音频监测
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

// 修改stop函数，停止音频监测
function stop() {
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
}

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

// 添加对话内容到弹窗
function addChatMessage(message, isSender) {
    const chatItem = window.parent.document.createElement('div');
    chatItem.classList.add('chat-item');
    chatItem.classList.add(isSender ? 'sender' : 'receiver');
    // 使用 flex 布局让 avatar 和 messageContainer 处于同一行
    chatItem.style.display = 'flex';
    chatItem.style.alignItems = 'start'; // 垂直顶部对齐
    chatItem.style.marginBottom = '10px'; // 为每个聊天项添加底部间距

    // 创建头像图片元素
    const avatar = window.parent.document.createElement('img');
    avatar.src = './static/audio.png';
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '10px';

    // 创建一个容器来包裹头像和消息
    const messageContainer = window.parent.document.createElement('div');
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
        messageContainer.appendChild(window.parent.document.createTextNode(message));
        chatItem.style.justifyContent = 'flex-end'; // 发送者消息右对齐
        avatar.style.marginLeft = '10px'; // 发送者头像右侧间距
        avatar.style.marginRight = 0; // 移除发送者头像左侧间距
    } else {
        messageContainer.appendChild(window.parent.document.createTextNode(message));
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

    const chatContent = window.parent.document.getElementById('chat-content');
    chatContent.appendChild(chatItem);

    // 将滚动条滚动到最底部
    chatContent.scrollTop = chatContent.scrollHeight;
}

// 监听 ASR 识别结果（假设 ASR 结果通过某种方式传递到这里）
// 这里只是示例，需要根据实际情况修改
function onASRResult(result) {
    addChatMessage('' + result);
}

// 页面初始化
window.onload = function() {
    // 加载保存的设置
    // loadSettings();
    
    // 初始化音量控制
    initVolumeControls();
    
    // document.addEventListener('keydown', (e) => {
    //     if (e.code === 'Space') {
    //         handleSpaceKey(e);
    //     }
    // });
    //
    // $('#btnConnect').on('click', startASR);
    // $('#selectModels').on('change', setDefaultValuesForModel);
    // $('#rtAddHotWord').on('click', addHotWord);
    // $("#rtHotWordDelete").on('click', deleteHotWord);
    
    // ... existing code ...
};
