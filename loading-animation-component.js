// 高科技透明圆形扩散过渡效果组件
class LoadingAnimation {
    constructor(options = {}) {
        // 默认配置
        this.options = {
            loadingText: options.loadingText || '系统初始化中',
            onComplete: options.onComplete || null,
            parentSelector: options.parentSelector || 'body',
            autoStart: options.autoStart !== undefined ? options.autoStart : true,
            duration: options.duration || 800,
            particleInterval: options.particleInterval || 30,
            customStyles: options.customStyles || null
        };
        
        // 保存DOM引用
        this.elements = {};
        
        // 初始化
        this.init();
        
        // 如果设置了自动开始，则立即开始加载
        if (this.options.autoStart) {
            this.startLoading();
        }
    }
    
    // 初始化组件
    init() {
        // 创建并注入样式
        this.injectStyles();
        
        // 创建DOM结构
        this.createDOM();
        
        // 初始化电路线和粒子
        this.initCircuitLines();
        this.initParticles();
    }
    
    // 注入必要的CSS样式
    injectStyles() {
        // 如果样式已经存在，不再重复注入
        if (document.getElementById('loading-animation-styles')) {
            return;
        }
        
        const styleEl = document.createElement('style');
        styleEl.id = 'loading-animation-styles';
        styleEl.textContent = `
            /* 加载层 - 位于顶层 */
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 10, 20, 0.9);
                z-index: 1000;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
            }

            /* 科技网格背景 */
            .grid-background {
                position: absolute;
                width: 200%;
                height: 200%;
                background-image: 
                    linear-gradient(rgba(18, 75, 126, 0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(18, 75, 126, 0.1) 1px, transparent 1px);
                background-size: 20px 20px;
                transform: rotate(45deg) scale(1.5);
                opacity: 0.6;
                animation: gridMove 20s linear infinite;
            }

            /* 电路线 */
            .circuit-lines {
                position: absolute;
                width: 100%;
                height: 100%;
            }

            .circuit-line {
                position: absolute;
                height: 2px;
                background: linear-gradient(90deg, 
                    rgba(6, 182, 212, 0) 0%, 
                    rgba(6, 182, 212, 0.7) 50%, 
                    rgba(6, 182, 212, 0) 100%);
                opacity: 0;
                animation: fadeInOut 4s infinite;
            }

            /* 中央加载指示器 */
            .loading-center {
                position: relative;
                width: 120px;
                height: 120px;
                z-index: 10;
            }

            .loading-circle {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 2px solid rgba(6, 182, 212, 0.5);
                animation: pulseRing 2s linear infinite;
            }

            .loading-circle:nth-child(1) {
                animation-delay: 0s;
            }

            .loading-circle:nth-child(2) {
                animation-delay: 0.4s;
            }

            .loading-circle:nth-child(3) {
                animation-delay: 0.8s;
            }

            .loading-core {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 60px;
                height: 60px;
                background: radial-gradient(circle, rgba(6, 182, 212, 0.8) 0%, rgba(6, 182, 212, 0) 70%);
                border-radius: 50%;
                animation: pulseCore 2s ease-in-out infinite;
            }

            .scanner {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 150%;
                height: 2px;
                background: linear-gradient(90deg, 
                    rgba(6, 182, 212, 0) 0%, 
                    rgba(6, 182, 212, 0.8) 50%, 
                    rgba(6, 182, 212, 0) 100%);
                transform-origin: center;
                animation: rotateScan 2s linear infinite;
            }

            .loading-text {
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 14px;
                color: #06b6d4;
                white-space: nowrap;
                text-transform: uppercase;
                letter-spacing: 3px;
            }

            .loading-percentage {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 20px;
                font-weight: bold;
                color: #fff;
            }

            /* 浮动粒子 */
            .particles {
                position: absolute;
                width: 100%;
                height: 100%;
            }

            .particle {
                position: absolute;
                background-color: rgba(6, 182, 212, 0.6);
                border-radius: 50%;
                opacity: 0;
                animation: floatParticle 3s ease-in-out infinite;
            }

            /* 透明裁剪遮罩 - 关键效果 */
            .transition-mask {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 10, 20, 0.9);
                -webkit-mask-image: radial-gradient(circle at center, transparent 0, #000 0);
                mask-image: radial-gradient(circle at center, transparent 0, #000 0);
                transform: scale(1);
                transition: all 0.01s linear;
            }

            /* 边缘发光效果 */
            .reveal-edge {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 0;
                height: 0;
                border-radius: 50%;
                box-shadow: 0 0 40px 10px rgba(6, 182, 212, 0.8);
                opacity: 0;
                z-index: 999;
                transform: translate(-50%, -50%);
                pointer-events: none;
            }

            /* 像素粒子效果容器 */
            .pixel-particles-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1001;
                pointer-events: none;
            }

            /* 像素粒子样式 */
            .pixel-particle {
                position: absolute;
                background-color: #06b6d4;
                width: 4px;
                height: 4px;
                opacity: 0;
                transform: scale(0);
                z-index: 1001;
            }

            /* 动画定义 */
            @keyframes pulseRing {
                0% {
                    transform: scale(0.7);
                    opacity: 0.3;
                }
                50% {
                    transform: scale(1);
                    opacity: 0.8;
                }
                100% {
                    transform: scale(0.7);
                    opacity: 0.3;
                }
            }

            @keyframes pulseCore {
                0%, 100% {
                    opacity: 0.5;
                    transform: translate(-50%, -50%) scale(0.8);
                }
                50% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1.2);
                }
            }

            @keyframes rotateScan {
                0% {
                    transform: translate(-50%, -50%) rotate(0deg);
                }
                100% {
                    transform: translate(-50%, -50%) rotate(360deg);
                }
            }

            @keyframes fadeInOut {
                0%, 100% {
                    opacity: 0;
                }
                50% {
                    opacity: 0.8;
                }
            }

            @keyframes floatParticle {
                0% {
                    transform: translateY(0) translateX(0);
                    opacity: 0;
                }
                25% {
                    opacity: 0.8;
                }
                75% {
                    opacity: 0.4;
                }
                100% {
                    transform: translateY(-100px) translateX(20px);
                    opacity: 0;
                }
            }

            @keyframes gridMove {
                0% {
                    transform: rotate(45deg) translateY(0) scale(1.5);
                }
                100% {
                    transform: rotate(45deg) translateY(-100px) scale(1.5);
                }
            }
        `;
        
        // 添加自定义样式
        if (this.options.customStyles) {
            styleEl.textContent += this.options.customStyles;
        }
        
        document.head.appendChild(styleEl);
    }
    
    // 创建DOM结构
    createDOM() {
        // 创建加载遮罩层
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.id = 'loadingOverlay';
        
        // 科技网格背景
        const gridBackground = document.createElement('div');
        gridBackground.className = 'grid-background';
        
        // 电路线
        const circuitLines = document.createElement('div');
        circuitLines.className = 'circuit-lines';
        circuitLines.id = 'circuitLines';
        
        // 粒子效果
        const particles = document.createElement('div');
        particles.className = 'particles';
        particles.id = 'particles';
        
        // 像素粒子容器
        const pixelParticlesContainer = document.createElement('div');
        pixelParticlesContainer.className = 'pixel-particles-container';
        pixelParticlesContainer.id = 'pixelParticlesContainer';
        
        // 中央加载指示器
        const loadingCenter = document.createElement('div');
        loadingCenter.className = 'loading-center';
        
        // 加载圆环
        for (let i = 0; i < 3; i++) {
            const circle = document.createElement('div');
            circle.className = 'loading-circle';
            loadingCenter.appendChild(circle);
        }
        
        // 加载核心
        const loadingCore = document.createElement('div');
        loadingCore.className = 'loading-core';
        loadingCenter.appendChild(loadingCore);
        
        // 扫描线
        const scanner = document.createElement('div');
        scanner.className = 'scanner';
        loadingCenter.appendChild(scanner);
        
        // 百分比
        const percentage = document.createElement('div');
        percentage.className = 'loading-percentage';
        percentage.id = 'percentage';
        percentage.textContent = '0%';
        loadingCenter.appendChild(percentage);
        
        // 加载文本
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.textContent = this.options.loadingText;
        loadingCenter.appendChild(loadingText);
        
        // 透明裁剪遮罩
        const transitionMask = document.createElement('div');
        transitionMask.className = 'transition-mask';
        transitionMask.id = 'transitionMask';
        
        // 边缘发光效果
        const revealEdge = document.createElement('div');
        revealEdge.className = 'reveal-edge';
        revealEdge.id = 'revealEdge';
        
        // 将所有元素添加到加载遮罩层
        loadingOverlay.appendChild(gridBackground);
        loadingOverlay.appendChild(circuitLines);
        loadingOverlay.appendChild(particles);
        loadingOverlay.appendChild(pixelParticlesContainer);
        loadingOverlay.appendChild(loadingCenter);
        loadingOverlay.appendChild(transitionMask);
        loadingOverlay.appendChild(revealEdge);
        
        // 将加载遮罩层添加到父元素
        const parent = document.querySelector(this.options.parentSelector);
        if (parent) {
            parent.appendChild(loadingOverlay);
        } else {
            document.body.appendChild(loadingOverlay);
        }
        
        // 保存DOM引用
        this.elements = {
            loadingOverlay,
            transitionMask,
            revealEdge,
            percentageElement: percentage,
            circuitLines,
            particles,
            pixelParticlesContainer,
            loadingCore
        };
    }
    
    // 初始化电路线
    initCircuitLines() {
        const { circuitLines } = this.elements;
        
        // 创建电路线
        for (let i = 0; i < 20; i++) {
            const line = document.createElement('div');
            line.className = 'circuit-line';
            line.style.top = Math.random() * 100 + '%';
            line.style.width = (30 + Math.random() * 50) + '%';
            line.style.left = Math.random() * 100 + '%';
            line.style.animationDelay = (Math.random() * 4) + 's';
            line.style.height = (1 + Math.random() * 2) + 'px';
            circuitLines.appendChild(line);
        }
    }
    
    // 初始化粒子
    initParticles() {
        const { particles } = this.elements;
        
        // 创建粒子
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.width = (2 + Math.random() * 4) + 'px';
            particle.style.height = particle.style.width;
            particle.style.animationDelay = (Math.random() * 3) + 's';
            particles.appendChild(particle);
        }
    }
    
    // 开始加载动画
    startLoading() {
        const { percentageElement } = this.elements;
        
        // 模拟加载过程
        let progress = 0;
        this.loadingInterval = setInterval(() => {
            // 进度递增
            progress += Math.random() * 5 + 3;
            
            if (progress >= 100) {
                progress = 100;
                clearInterval(this.loadingInterval);
                
                // 加载完成，开始透明圆形扩散效果
                this.startTransition();
            }
            
            // 更新显示的百分比
            percentageElement.textContent = Math.floor(progress) + '%';
        }, 50);
    }
    
    // 创建一个像素粒子
    createPixelParticle(x, y, delay, size, duration, distance) {
        const { pixelParticlesContainer } = this.elements;
        
        const particle = document.createElement('div');
        particle.className = 'pixel-particle';
        
        // 随机选择像素粒子的颜色
        const colors = [
            '#06b6d4', // 蓝青色
            '#3b82f6', // 蓝色
            '#06d6a0', // 青绿色
            '#0ea5e9', // 亮蓝色
            '#22d3ee'  // 浅蓝色
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        // 设置随机大小（像素化效果）
        const pixelSize = size || (3 + Math.floor(Math.random() * 5));
        particle.style.width = `${pixelSize}px`;
        particle.style.height = `${pixelSize}px`;
        particle.style.backgroundColor = color;
        
        // 设置位置
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        
        // 添加到容器
        pixelParticlesContainer.appendChild(particle);
        
        // 计算动画方向（从中心往外扩散）
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // 计算从中心到粒子的角度
        const angle = Math.atan2(y - centerY, x - centerX);
        
        // 计算移动距离
        const moveDistance = distance || (30 + Math.random() * 60);
        const endX = x + Math.cos(angle) * moveDistance;
        const endY = y + Math.sin(angle) * moveDistance;
        
        // 设置动画
        setTimeout(() => {
            // 初始显示
            particle.style.opacity = 0.9;
            particle.style.transform = 'scale(1)';
            
            // 添加过渡
            particle.style.transition = `all ${duration || 0.8}s ease-out`;
            
            // 设置随机结束位置
            setTimeout(() => {
                particle.style.transform = `translate(${endX - x}px, ${endY - y}px) scale(${Math.random() * 0.5})`;
                particle.style.opacity = 0;
                
                // 动画结束后移除粒子
                setTimeout(() => {
                    particle.remove();
                }, duration * 1000 || 800);
            }, 10);
        }, delay);
        
        return particle;
    }
    
    // 在圆周上创建粒子
    createPixelParticlesOnCircle(centerX, centerY, radius, count) {
        for (let i = 0; i < count; i++) {
            // 在圆周上计算位置
            const angle = (Math.PI * 2 / count) * i;
            const deviation = (Math.random() * 10) - 5; // 随机偏离圆周一点
            const x = centerX + Math.cos(angle) * (radius + deviation);
            const y = centerY + Math.sin(angle) * (radius + deviation);
            
            // 随机大小，小概率更大的粒子
            let size;
            const chance = Math.random();
            if (chance > 0.9) {
                size = 8 + Math.floor(Math.random() * 4); // 10%概率生成大粒子
            } else if (chance > 0.7) {
                size = 5 + Math.floor(Math.random() * 3); // 20%概率生成中等粒子
            } else {
                size = 2 + Math.floor(Math.random() * 3); // 70%概率生成小粒子
            }
            
            // 随机延迟
            const delay = Math.random() * 100;
            
            // 随机速度
            const duration = 0.8 + Math.random() * 1.2;
            
            // 随机移动距离，基于粒子大小
            const distance = 20 + (size * 5) + Math.random() * 40;
            
            this.createPixelParticle(x, y, delay, size, duration, distance);
        }
    }
    
    // 透明圆形扩散过渡效果
    startTransition() {
        const { loadingOverlay, transitionMask, revealEdge, loadingCore } = this.elements;
        
        // 隐藏中心圆形光源
        loadingCore.style.display = 'none';
        
        // 显示发光边缘效果
        revealEdge.style.opacity = '1';
        revealEdge.style.width = '10px';
        revealEdge.style.height = '10px';
        
        let revealSize = 0;
        const maxSize = Math.max(window.innerWidth, window.innerHeight) * 2;
        const duration = this.options.duration; // 透明化过渡持续时间(毫秒)
        const startTime = Date.now();
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // 像素粒子生成的阈值和间隔
        let lastParticleRadius = 0;
        const particleInterval = this.options.particleInterval; // 每增加指定px半径就生成一批粒子
        
        const animate = () => {
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            
            // 使用缓动函数让动画更自然
            const easedProgress = this.easeInOutQuad(progress);
            revealSize = easedProgress * maxSize;
            
            // 更新遮罩的径向渐变
            const maskSize = revealSize / 2;
            transitionMask.style.webkitMaskImage = `radial-gradient(circle at center, transparent ${maskSize}px, #000 ${maskSize}px)`;
            transitionMask.style.maskImage = `radial-gradient(circle at center, transparent ${maskSize}px, #000 ${maskSize}px)`;
            
            // 更新发光边缘
            revealEdge.style.width = `${revealSize}px`;
            revealEdge.style.height = `${revealSize}px`;
            
            // 在边缘生成像素粒子
            const currentRadius = revealSize / 2;
            if (currentRadius - lastParticleRadius >= particleInterval) {
                // 根据当前半径的大小确定粒子数量，半径越大，粒子越多
                const baseCount = Math.min(40, Math.floor(currentRadius / 20));
                // 计算实际的粒子数量，随机略有变化
                const particleCount = baseCount + Math.floor(Math.random() * 10);
                
                // 在当前圆的边缘创建一组像素粒子
                this.createPixelParticlesOnCircle(centerX, centerY, currentRadius, particleCount);
                
                // 更新最后生成粒子的半径
                lastParticleRadius = currentRadius;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // 过渡完成，移除加载层
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                    
                    // 如果设置了完成回调，则调用
                    if (typeof this.options.onComplete === 'function') {
                        this.options.onComplete();
                    }
                }, 200);
            }
        };
        
        // 开始动画
        requestAnimationFrame(animate);
    }
    
    // 缓动函数
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    
    // 手动设置加载进度
    setProgress(progress) {
        if (this.elements.percentageElement) {
            this.elements.percentageElement.textContent = Math.floor(progress) + '%';
            
            if (progress >= 100) {
                clearInterval(this.loadingInterval);
                this.startTransition();
            }
        }
    }
    
    // 手动完成加载并开始过渡
    completeLoading() {
        clearInterval(this.loadingInterval);
        this.setProgress(100);
        this.startTransition();
    }
    
    // 销毁组件
    destroy() {
        // 清除定时器
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
        }
        
        // 移除DOM
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.remove();
        }
    }
}

// 导出组件
export default LoadingAnimation; 