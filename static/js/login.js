// DOM元素
document.addEventListener('DOMContentLoaded', function() {
    // 获取页面元素
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const isLoginPage = !!loginForm;
    const isRegisterPage = !!registerForm;
    
    // 背景Canvas初始化
    initBackgroundCanvas();
    
    // 表单事件监听器
    if (isLoginPage) {
        initLoginPage();
    }
    
    if (isRegisterPage) {
        initRegisterPage();
    }
    
    // 初始化密码显示/隐藏按钮
    initPasswordToggle();
    
    // 初始化输入框焦点特效
    initInputFocusEffects();
    
    // 添加按钮光晕动画
    initButtonAnimation();
});

// 初始化登录页面
function initLoginPage() {
    const loginButton = document.getElementById('login-button');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    // 初始化默认用户
    initDefaultUser();
    
    // 登录按钮点击事件
    loginButton.addEventListener('click', function() {
        animateButtonClick(this);
        handleLogin();
    });
    
    // 键盘回车事件
    passwordInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            animateButtonClick(loginButton);
            handleLogin();
        }
    });
}

// 初始化注册页面
function initRegisterPage() {
    const registerButton = document.getElementById('register-button');
    const usernameInput = document.getElementById('reg-username');
    const emailInput = document.getElementById('reg-email');
    const passwordInput = document.getElementById('reg-password');
    const confirmPasswordInput = document.getElementById('reg-confirm-password');
    
    // 初始化默认用户
    initDefaultUser();
    
    // 注册按钮点击事件
    registerButton.addEventListener('click', function() {
        animateButtonClick(this);
        handleRegister();
    });
    
    // 键盘回车事件
    confirmPasswordInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            animateButtonClick(registerButton);
            handleRegister();
        }
    });
}

// 按钮点击动画
function animateButtonClick(button) {
    // 添加点击时的缩放效果
    button.classList.add('btn-click');
    
    // 创建波纹效果
    const ripple = document.createElement('span');
    ripple.classList.add('btn-ripple');
    button.appendChild(ripple);
    
    // 设置波纹位置
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = '50%';
    ripple.style.top = '50%';
    ripple.style.transform = 'translate(-50%, -50%) scale(0)';
    
    // 触发动画
    setTimeout(() => {
        ripple.style.transform = 'translate(-50%, -50%) scale(1)';
        ripple.style.opacity = '0';
    }, 10);
    
    // 动画结束后移除元素
    setTimeout(() => {
        button.classList.remove('btn-click');
        ripple.remove();
    }, 600);
}

// 初始化按钮动画
function initButtonAnimation() {
    // 为所有按钮添加悬浮态光晕效果
    const buttons = document.querySelectorAll('.btn-primary');
    
    buttons.forEach(button => {
        // 添加自定义样式
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        
        // 创建光晕元素
        const glow = document.createElement('div');
        glow.classList.add('btn-glow');
        
        // 添加光晕样式
        const style = document.createElement('style');
        style.textContent = `
            .btn-glow {
                position: absolute;
                top: -20%;
                left: -20%;
                width: 140%;
                height: 140%;
                background: radial-gradient(circle, rgba(100, 181, 246, 0.8) 0%, rgba(33, 150, 243, 0) 70%);
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                z-index: -1;
                border-radius: 50%;
            }
            
            .btn-primary:hover .btn-glow {
                opacity: 0.5;
                animation: glowPulse 2s infinite;
            }
            
            .btn-click {
                transform: scale(0.98);
            }
            
            .btn-ripple {
                position: absolute;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                pointer-events: none;
                opacity: 1;
                transition: transform 0.6s, opacity 0.6s;
            }
            
            @keyframes glowPulse {
                0% { transform: scale(0.8); opacity: 0.3; }
                50% { transform: scale(1.2); opacity: 0.5; }
                100% { transform: scale(0.8); opacity: 0.3; }
            }
        `;
        
        document.head.appendChild(style);
        button.appendChild(glow);
    });
}

// 初始化输入框焦点特效
function initInputFocusEffects() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
    
    inputs.forEach(input => {
        const parent = input.parentElement;
        
        // 创建输入框动画样式
        const style = document.createElement('style');
        style.textContent = `
            .input-highlight {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                width: 0;
                background: linear-gradient(to right, var(--primary-color), var(--accent-color));
                transition: width 0.3s ease;
                border-radius: 2px;
                z-index: 1;
            }
            
            .input-focus .icon {
                color: var(--accent-color) !important;
                transform: scale(1.1);
                transition: all 0.3s ease;
            }
        `;
        document.head.appendChild(style);
        
        // 创建高亮元素
        const highlight = document.createElement('div');
        highlight.classList.add('input-highlight');
        parent.appendChild(highlight);
        
        // 监听焦点事件
        input.addEventListener('focus', function() {
            highlight.style.width = '100%';
            parent.classList.add('input-focus');
        });
        
        input.addEventListener('blur', function() {
            highlight.style.width = '0';
            parent.classList.remove('input-focus');
        });
    });
}

// 初始化默认用户
function initDefaultUser() {
    // 检查是否已有用户数据
    let users = localStorage.getItem('users');
    
    // 如果没有用户数据，添加默认用户
    if (!users) {
        const defaultUsers = [
            {
                username: 'suan',
                password: 'suansuan',
                email: 'suan@example.com'
            }
        ];
        localStorage.setItem('users', JSON.stringify(defaultUsers));
    }
}

// 处理登录逻辑
function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember').checked;
    
    // 重置错误信息
    resetErrorMessages();
    
    // 表单验证
    if (!username) {
        showError('username-error', '请输入用户名');
        shakeInput('username');
        return;
    }
    
    if (!password) {
        showError('password-error', '请输入密码');
        shakeInput('password');
        return;
    }
    
    // 获取用户数据
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => u.username === username);
    
    if (!user) {
        showError('username-error', '用户名不存在');
        shakeInput('username');
        return;
    }
    
    if (user.password !== password) {
        showError('password-error', '密码不正确');
        shakeInput('password');
        return;
    }
    
    // 登录成功
    if (rememberMe) {
        localStorage.setItem('lastLoginUser', username);
    }
    
    // 显示成功通知
    showNotification('登录成功，跳转中...', 'success');
    
    // 登录成功后跳转到主页
    setTimeout(() => {
        window.location.href = 'webrtcapi-asr.html';
    }, 1500);
}

// 处理注册逻辑
function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const agreeTerms = document.getElementById('agree-terms').checked;
    
    // 重置错误信息
    resetErrorMessages();
    
    // 表单验证
    if (!username) {
        showError('reg-username-error', '请输入用户名');
        shakeInput('reg-username');
        return;
    }
    
    if (username.length < 3) {
        showError('reg-username-error', '用户名至少需要3个字符');
        shakeInput('reg-username');
        return;
    }
    
    if (!email) {
        showError('reg-email-error', '请输入电子邮件');
        shakeInput('reg-email');
        return;
    }
    
    if (!validateEmail(email)) {
        showError('reg-email-error', '请输入有效的电子邮件地址');
        shakeInput('reg-email');
        return;
    }
    
    if (!password) {
        showError('reg-password-error', '请输入密码');
        shakeInput('reg-password');
        return;
    }
    
    if (password.length < 6) {
        showError('reg-password-error', '密码至少需要6个字符');
        shakeInput('reg-password');
        return;
    }
    
    if (!confirmPassword) {
        showError('reg-confirm-password-error', '请确认密码');
        shakeInput('reg-confirm-password');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('reg-confirm-password-error', '两次输入的密码不一致');
        shakeInput('reg-confirm-password');
        return;
    }
    
    if (!agreeTerms) {
        showNotification('请同意条款和条件', 'error');
        return;
    }
    
    // 从本地存储获取现有用户
    const users = JSON.parse(localStorage.getItem('users')) || [];
    
    // 检查用户名是否已存在
    if (users.some(user => user.username === username)) {
        showError('reg-username-error', '用户名已被注册');
        shakeInput('reg-username');
        return;
    }
    
    // 检查邮箱是否已存在
    if (users.some(user => user.email === email)) {
        showError('reg-email-error', '此邮箱已被注册');
        shakeInput('reg-email');
        return;
    }
    
    // 添加新用户
    users.push({
        username,
        email,
        password
    });
    
    // 保存到本地存储
    localStorage.setItem('users', JSON.stringify(users));
    
    // 显示成功通知
    showNotification('注册成功！正在跳转到登录页面...', 'success');
    
    // 注册成功后跳转到登录页面
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1500);
}

// 错误时输入框抖动效果
function shakeInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.classList.add('shake-animation');
    
    // 添加抖动动画样式
    if (!document.getElementById('shake-style')) {
        const style = document.createElement('style');
        style.id = 'shake-style';
        style.textContent = `
            @keyframes shakeAnimation {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            
            .shake-animation {
                animation: shakeAnimation 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
                background-color: rgba(255, 61, 113, 0.05) !important;
                border-color: var(--error-color) !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    // 动画结束后移除类名
    setTimeout(() => {
        input.classList.remove('shake-animation');
    }, 600);
}

// 初始化密码切换按钮
function initPasswordToggle() {
    const togglePassword = document.getElementById('toggle-password');
    const regTogglePassword = document.getElementById('reg-toggle-password');
    
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            const passwordInput = document.getElementById('password');
            togglePasswordVisibility(passwordInput, togglePassword);
        });
    }
    
    if (regTogglePassword) {
        regTogglePassword.addEventListener('click', function() {
            const passwordInput = document.getElementById('reg-password');
            togglePasswordVisibility(passwordInput, regTogglePassword);
        });
    }
}

// 切换密码可见性
function togglePasswordVisibility(input, icon) {
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    }
}

// 显示错误消息
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// 重置所有错误消息
function resetErrorMessages() {
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(element => {
        element.textContent = '';
        element.style.display = 'none';
    });
}

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageElement = notification.querySelector('.message');
    const iconElement = notification.querySelector('.icon');
    
    // 设置消息
    messageElement.textContent = message;
    
    // 设置类型
    notification.className = 'notification ' + type;
    
    // 设置图标
    if (type === 'success') {
        iconElement.className = 'icon fas fa-check-circle';
    } else {
        iconElement.className = 'icon fas fa-exclamation-circle';
    }
    
    // 显示通知
    notification.classList.add('show');
    
    // 3秒后自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 初始化背景Canvas
function initBackgroundCanvas() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 粒子数组
    const particles = [];
    const particleCount = 100;
    
    // 鼠标位置
    let mouseX = 0;
    let mouseY = 0;
    
    // 鼠标移动事件
    document.addEventListener('mousemove', function(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    // 创建粒子
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 1;
            this.speedX = Math.random() * 3 - 1.5;
            this.speedY = Math.random() * 3 - 1.5;
            this.color = `rgba(${33 + Math.random() * 50}, ${150 + Math.random() * 50}, ${243 + Math.random() * 12}, ${0.3 + Math.random() * 0.5})`;
        }
        
        update() {
            // 添加鼠标影响力
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 100) {
                const angle = Math.atan2(dy, dx);
                const force = (100 - distance) / 100;
                this.speedX += Math.cos(angle) * force * 0.2;
                this.speedY += Math.sin(angle) * force * 0.2;
            }
            
            // 限制速度
            this.speedX = Math.max(-4, Math.min(4, this.speedX));
            this.speedY = Math.max(-4, Math.min(4, this.speedY));
            
            // 更新位置
            this.x += this.speedX;
            this.y += this.speedY;
            
            // 边界检查
            if (this.x < 0) {
                this.x = canvas.width;
            } else if (this.x > canvas.width) {
                this.x = 0;
            }
            
            if (this.y < 0) {
                this.y = canvas.height;
            } else if (this.y > canvas.height) {
                this.y = 0;
            }
            
            // 缓慢减速
            this.speedX *= 0.99;
            this.speedY *= 0.99;
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // 初始化粒子
    function initParticles() {
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }
    
    // 绘制粒子之间的连线
    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(33, 150, 243, ${(100 - distance) / 500})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }
    
    // 动画循环
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 绘制渐变背景
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(10, 25, 47, 1)');
        gradient.addColorStop(1, 'rgba(8, 27, 41, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 更新并绘制粒子
        for (let i = 0; i < particleCount; i++) {
            particles[i].update();
            particles[i].draw();
        }
        
        // 绘制连线
        drawLines();
        
        requestAnimationFrame(animate);
    }
    
    // 窗口调整大小事件
    window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    
    // 初始化并开始动画
    initParticles();
    animate();
}

// 验证邮箱格式
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
} 