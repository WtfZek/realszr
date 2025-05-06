document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const musicPlayer = document.getElementById('music-player');
    const musicPlaylist = document.getElementById('music-playlist');
    const musicPlaylistUl = document.getElementById('music-playlist-ul');
    const musicFileInput = document.getElementById('music-file-input');
    const playSelectedBtn = document.getElementById('play-selected');
    const removeSelectedBtn = document.getElementById('remove-selected');
    const clearPlaylistBtn = document.getElementById('clear-playlist');
    const playPauseBtn = document.getElementById('play-pause');
    const prevTrackBtn = document.getElementById('prev-track');
    const nextTrackBtn = document.getElementById('next-track');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const progressSlider = document.getElementById('music-progress-slider');
    const progressBar = document.getElementById('music-progress-bar');
    const currentTimeDisplay = document.getElementById('current-time');
    const totalTimeDisplay = document.getElementById('total-time');
    const nowPlayingInfo = document.getElementById('now-playing-info');
    const loopModeSelect = document.getElementById('loop-mode');
    const loopCountInput = document.getElementById('loop-count');
    const loopIntervalInput = document.getElementById('loop-interval');
    
    // 播放列表数据
    let playlist = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let loopCounter = 0;
    let loopTimerId = null;
    let selectedItemIndex = -1; // 新增：当前选中的项目索引
    
    // 暴露全局添加音乐方法，供外部调用
    window.addMusicItem = function(musicItem) {
        // 检查是否已经存在相同名称的音乐
        const exists = playlist.some(item => item.name === musicItem.name);
        if (exists) {
            console.log(`音乐 ${musicItem.name} 已存在于播放列表中`);
            return false;
        }
        
        // 添加到播放列表
        playlist.push(musicItem);
        
        // 更新播放列表显示
        updatePlaylistDisplay();
        
        // 保存播放列表到localStorage
        savePlaylistToStorage();
        
        console.log(`已添加音乐 ${musicItem.name} 到播放列表`);
        return true;
    };
    
    // 初始化播放器
    function initPlayer() {
        // 设置音量
        musicPlayer.volume = volumeSlider.value / 100;
        
        // 音量控制
        volumeSlider.addEventListener('input', function() {
            const volume = this.value;
            musicPlayer.volume = volume / 100;
            volumeValue.textContent = volume + '%';
        });
        
        // 进度条更新
        musicPlayer.addEventListener('timeupdate', updateProgress);
        
        // 进度条拖动
        progressSlider.addEventListener('input', function() {
            const seekTime = (musicPlayer.duration * this.value) / 100;
            musicPlayer.currentTime = seekTime;
        });
        
        // 播放完成事件
        musicPlayer.addEventListener('ended', handleTrackEnd);
        
        // 播放/暂停按钮
        playPauseBtn.addEventListener('click', togglePlayPause);
        
        // 上一曲按钮
        prevTrackBtn.addEventListener('click', playPreviousTrack);
        
        // 下一曲按钮
        nextTrackBtn.addEventListener('click', playNextTrack);
        
        // 文件选择事件
        musicFileInput.addEventListener('change', handleFileSelect);
        
        // 播放选中按钮
        playSelectedBtn.addEventListener('click', function() {
            // 如果使用新UI中的选中项
            if (selectedItemIndex !== -1) {
                playTrack(selectedItemIndex);
                return;
            }
            
            // 兼容旧逻辑：使用select的选中项
            const selectedIndex = musicPlaylist.selectedIndex;
            if (selectedIndex !== -1) {
                playTrack(selectedIndex);
            }
        });
        
        // 移除选中按钮
        removeSelectedBtn.addEventListener('click', function() {
            // 如果使用新UI中的选中项
            let selectedIndex = selectedItemIndex;
            
            // 如果没有通过新UI选择，则使用select的选中项
            if (selectedIndex === -1) {
                selectedIndex = musicPlaylist.selectedIndex;
            }
            
            if (selectedIndex !== -1) {
                // 如果移除的是当前播放的曲目
                if (selectedIndex === currentTrackIndex) {
                    musicPlayer.pause();
                    isPlaying = false;
                    updatePlayPauseButton();
                    currentTrackIndex = -1;
                } else if (selectedIndex < currentTrackIndex) {
                    // 如果移除的曲目在当前播放曲目之前，需要更新索引
                    currentTrackIndex--;
                }
                
                // 从播放列表中移除
                playlist.splice(selectedIndex, 1);
                
                // 重置选中索引
                selectedItemIndex = -1;
                
                // 更新播放列表显示
                updatePlaylistDisplay();
                
                // 保存播放列表到localStorage
                savePlaylistToStorage();
            }
        });
        
        // 清空列表按钮
        clearPlaylistBtn.addEventListener('click', function() {
            playlist = [];
            currentTrackIndex = -1;
            selectedItemIndex = -1; // 重置选中索引
            musicPlayer.pause();
            isPlaying = false;
            updatePlayPauseButton();
            updatePlaylistDisplay();
            nowPlayingInfo.textContent = '未播放任何音乐';
            
            // 保存播放列表到localStorage
            savePlaylistToStorage();
        });
        
        // 不再从localStorage加载播放列表
        // loadPlaylistFromStorage();
        
        // 更新按钮图标
        updateButtonIcons();
    }
    
    // 更新按钮图标
    function updateButtonIcons() {
        // 上一曲按钮图标 - 优化居中
        prevTrackBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="19 20 9 12 19 4 19 20"></polygon>
                <line x1="5" y1="19" x2="5" y2="5"></line>
            </svg>
        `;
        
        // 下一曲按钮图标 - 优化居中
        nextTrackBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
        `;
        
        // 初始化播放/暂停按钮状态
        updatePlayPauseButton();
    }
    
    // 保存播放列表到localStorage（仅保存文件名，不再保存路径以避免安全问题）
    function savePlaylistToStorage() {
        try {
            // 保存名称
            const playlistNames = playlist.map(track => track.name);
            localStorage.setItem('music_playlist_names', JSON.stringify(playlistNames));
            
            // 不再保存文件URL和详细信息
            // localStorage.setItem('music_playlist_info', JSON.stringify(playlistUrls));
        } catch (e) {
            console.error('保存播放列表失败:', e);
        }
    }
    
    // 处理文件选择
    function handleFileSelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;
        
        // 不再检查是否有待恢复的播放列表项
        // 不再尝试匹配并恢复播放列表项
        // 直接添加所有文件到播放列表
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('audio/')) {
                playlist.push({
                    name: file.name,
                    file: file,
                    url: URL.createObjectURL(file),
                    fileInfo: {
                        name: file.name,
                        type: file.type,
                        lastModified: file.lastModified,
                        size: file.size
                    }
                });
            }
        }
        
        // 更新播放列表显示
        updatePlaylistDisplay();
        
        // 保存播放列表到localStorage
        savePlaylistToStorage();
        
        // 重置文件输入，以便可以再次选择相同的文件
        musicFileInput.value = '';
    }
    
    // 更新播放列表显示
    function updatePlaylistDisplay() {
        // 清空原始select元素
        musicPlaylist.innerHTML = '';
        
        // 清空自定义列表元素
        musicPlaylistUl.innerHTML = '';
        
        // 添加新选项
        if (playlist.length === 0) {
            // 如果播放列表为空，显示提示信息
            const emptyItem = document.createElement('li');
            emptyItem.className = 'playlist-empty-message';
            emptyItem.style.cssText = 'padding: 10px; text-align: center; color: var(--text-secondary);';
            emptyItem.textContent = '播放列表为空';
            musicPlaylistUl.appendChild(emptyItem);
        } else {
            // 添加新选项到select和自定义列表
            playlist.forEach((track, index) => {
                // 添加到原始select (用于保持兼容性)
                const option = document.createElement('option');
                option.value = index;
                option.textContent = track.name;
                if (index === currentTrackIndex) {
                    option.selected = true;
                }
                // 如果没有文件URL，标记为待恢复
                if (!track.url) {
                    option.disabled = true;
                }
                musicPlaylist.appendChild(option);
                
                // 添加到自定义列表
                const li = document.createElement('li');
                li.dataset.index = index;
                li.className = 'playlist-item';
                
                // 应用当前播放和选中状态的类
                if (index === currentTrackIndex) {
                    li.classList.add('playing');
                }
                
                if (index === selectedItemIndex) {
                    li.classList.add('selected');
                }
                
                // 如果没有文件URL，标记为待恢复
                if (!track.url) {
                    li.classList.add('pending-restore');
                }
                
                // 列表项目内容
                const nameSpan = document.createElement('span');
                nameSpan.className = 'track-name';
                nameSpan.textContent = track.name;
                li.appendChild(nameSpan);
                
                // 对于待恢复的文件，添加待恢复标记
                if (!track.url) {
                    const pendingIcon = document.createElement('span');
                    pendingIcon.className = 'pending-icon';
                    pendingIcon.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 5px;">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    `;
                    pendingIcon.title = "等待恢复文件";
                    li.appendChild(pendingIcon);
                    
                    // 待恢复的项目不能点击
                    li.style.opacity = "0.7";
                    li.style.cursor = "not-allowed";
                } else {
                    // 点击和触摸事件处理
                    function selectItem() {
                        // 更新选中状态
                        const prevSelected = musicPlaylistUl.querySelector('.playlist-item.selected');
                        if (prevSelected) {
                            prevSelected.classList.remove('selected');
                        }
                        
                        li.classList.add('selected');
                        selectedItemIndex = index;
                        
                        // 同步更新select的选中项
                        musicPlaylist.selectedIndex = index;
                    }
                    
                    // 鼠标点击事件
                    li.addEventListener('click', selectItem);
                    
                    // 移动端触摸事件增强
                    let touchStartTime = 0;
                    let touchTimeout = null;
                    
                    li.addEventListener('touchstart', function(e) {
                        touchStartTime = Date.now();
                        
                        // 300ms后视为长按，选择项目
                        touchTimeout = setTimeout(function() {
                            selectItem();
                            // 添加视觉反馈 - 使用active伪类的效果，无需设置样式
                        }, 300);
                    }, { passive: true });
                    
                    li.addEventListener('touchend', function(e) {
                        const touchDuration = Date.now() - touchStartTime;
                        
                        clearTimeout(touchTimeout);
                        
                        // 短按（小于300ms）且不是滚动操作，视为点击
                        if (touchDuration < 300) {
                            selectItem();
                        }
                        
                        // 双击播放：500ms内两次点击
                        if (li.dataset.lastTouch && Date.now() - li.dataset.lastTouch < 500) {
                            playTrack(index);
                            li.dataset.lastTouch = 0; // 重置，避免连续触发
                        } else {
                            li.dataset.lastTouch = Date.now();
                        }
                    });
                    
                    li.addEventListener('touchmove', function(e) {
                        // 如果是滚动操作，取消长按计时
                        clearTimeout(touchTimeout);
                    }, { passive: true });
                    
                    // 双击播放功能
                    li.addEventListener('dblclick', function() {
                        playTrack(index);
                    });
                }
                
                musicPlaylistUl.appendChild(li);
            });
        }
    }
    
    // 播放指定曲目
    function playTrack(index) {
        if (index < 0 || index >= playlist.length) return;
        
        // 检查是否有URL可播放
        if (!playlist[index].url) {
            nowPlayingInfo.textContent = `无法播放:「${playlist[index].name}」- 请先选择音乐文件恢复播放列表`;
            return;
        }
        
        currentTrackIndex = index;
        const track = playlist[index];
        
        // 设置音频源
        musicPlayer.src = track.url;
        musicPlayer.load();
        
        // 开始播放
        musicPlayer.play()
            .then(() => {
                isPlaying = true;
                updatePlayPauseButton();
                nowPlayingInfo.textContent = `正在播放: ${track.name}`;
                updatePlaylistDisplay();
                
                // 重置循环计数器
                loopCounter = 0;
            })
            .catch(error => {
                console.error('播放失败:', error);
                nowPlayingInfo.textContent = `播放失败: ${error.message}`;
                isPlaying = false;
                updatePlayPauseButton();
            });
    }
    
    // 播放/暂停切换
    function togglePlayPause() {
        if (playlist.length === 0) return;
        
        if (currentTrackIndex === -1) {
            // 如果没有正在播放的曲目，从列表第一首开始
            playTrack(0);
        } else {
            if (isPlaying) {
                musicPlayer.pause();
                isPlaying = false;
                updatePlayPauseButton();
            } else {
                musicPlayer.play()
                    .then(() => {
                        isPlaying = true;
                        updatePlayPauseButton();
                    })
                    .catch(error => {
                        console.error('播放失败:', error);
                    });
            }
        }
    }
    
    // 更新播放/暂停按钮状态
    function updatePlayPauseButton() {
        if (isPlaying) {
            playPauseBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            `;
        } else {
            playPauseBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            `;
        }
    }
    
    // 播放上一曲
    function playPreviousTrack() {
        if (playlist.length === 0) return;
        
        let index = currentTrackIndex - 1;
        if (index < 0) {
            index = playlist.length - 1; // 循环到最后一首
        }
        
        playTrack(index);
    }
    
    // 播放下一曲
    function playNextTrack() {
        if (playlist.length === 0) return;
        
        let index;
        const loopMode = loopModeSelect.value;
        
        if (loopMode === 'random') {
            // 随机播放
            index = Math.floor(Math.random() * playlist.length);
        } else {
            // 顺序播放
            index = currentTrackIndex + 1;
            if (index >= playlist.length) {
                index = 0; // 循环到第一首
            }
        }
        
        playTrack(index);
    }
    
    // 更新进度条
    function updateProgress() {
        if (musicPlayer.duration) {
            const percent = (musicPlayer.currentTime / musicPlayer.duration) * 100;
            progressBar.style.width = percent + '%';
            progressSlider.value = percent;
            
            // 更新时间显示
            currentTimeDisplay.textContent = formatTime(musicPlayer.currentTime);
            totalTimeDisplay.textContent = formatTime(musicPlayer.duration);
        }
    }
    
    // 格式化时间（秒 -> MM:SS）
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // 处理曲目播放结束
    function handleTrackEnd() {
        const loopMode = loopModeSelect.value;
        const loopCount = parseInt(loopCountInput.value);
        const loopInterval = parseInt(loopIntervalInput.value);
        
        // 临时设置为非播放状态
        isPlaying = false;
        updatePlayPauseButton();
        
        // 清除可能存在的定时器
        if (loopTimerId) {
            clearTimeout(loopTimerId);
            loopTimerId = null;
        }
        
        if (loopMode === 'single') {
            // 单曲循环
            loopCounter++;
            
            // 检查是否达到循环次数限制
            if (loopCount === 0 || loopCounter < loopCount) {
                // 在间隔后重新播放
                loopTimerId = setTimeout(() => {
                    musicPlayer.currentTime = 0;
                    musicPlayer.play()
                        .then(() => {
                            isPlaying = true;
                            updatePlayPauseButton();
                        })
                        .catch(error => {
                            console.error('重新播放失败:', error);
                            isPlaying = false;
                            updatePlayPauseButton();
                        });
                }, loopInterval * 1000);
            } else {
                // 循环次数已达上限，播放下一曲
                playNextTrack();
            }
        } else if (loopMode === 'list' || loopMode === 'random') {
            // 列表循环或随机播放
            // 在间隔后播放下一曲
            loopTimerId = setTimeout(() => {
                playNextTrack();
            }, loopInterval * 1000);
        } else if (loopMode === 'no-loop') {
            // 不循环，但如果不是最后一首歌，仍然播放下一首
            if (currentTrackIndex < playlist.length - 1) {
                loopTimerId = setTimeout(() => {
                    playNextTrack();
                }, loopInterval * 1000);
            } else {
                isPlaying = false;
                updatePlayPauseButton();
            }
        }
    }
    
    // 初始化播放器
    initPlayer();
}); 