class AdvancedAIChat {
    constructor() {
        this.currentChatId = null;
        this.chats = new Map();
        this.isGenerating = false;
        this.currentMode = 'chat';
        this.jsonMode = false;
        this.uploadedImage = null;
        this.currentPreviewImage = null;
        this.userApiKey = null;
        this.initializeApp();
    }

    initializeApp() {
        this.loadUserSettings();
        this.loadChats();
        this.attachEventListeners();
        this.updateChatHistory();
        this.checkServerStatus();
        this.setMode('chat');
        
        // Show API key modal if not configured
        if (!this.userApiKey) {
            setTimeout(() => this.openApiKeyModal(), 1000);
        }
    }

    loadUserSettings() {
        this.userApiKey = localStorage.getItem('user_api_key');
    }

    saveUserSettings() {
        if (this.userApiKey) {
            localStorage.setItem('user_api_key', this.userApiKey);
        }
    }

    attachEventListeners() {
        // Chat management
        document.getElementById('newChatBtn').addEventListener('click', () => this.createNewChat());
        document.getElementById('clearChatBtn').addEventListener('click', () => this.clearCurrentChat());
        document.getElementById('jsonModeBtn').addEventListener('click', () => this.toggleJsonMode());
        
        // Send buttons
        document.getElementById('sendButton').addEventListener('click', () => this.sendMessage());
        document.getElementById('generateImageBtn').addEventListener('click', () => this.generateImage());
        document.getElementById('editImageBtn').addEventListener('click', () => this.editImage());
        
        // Mode switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.setMode(mode);
            });
        });

        // Message input
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        messageInput.addEventListener('input', () => this.autoResizeTextarea());

        // Formatting buttons
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.applyFormatting(e.currentTarget.dataset.format);
            });
        });

        // File management
        document.getElementById('filesBtn').addEventListener('click', () => this.openFilesModal());
        document.getElementById('closeFiles').addEventListener('click', () => this.closeFilesModal());
        document.getElementById('fileUpload').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('uploadBtn').addEventListener('click', () => this.triggerFileUpload());

        // Image handling
        document.getElementById('uploadArea').addEventListener('click', () => this.triggerImageUpload());
        document.getElementById('imageUpload').addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('closeImage').addEventListener('click', () => this.closeImageModal());
        document.getElementById('downloadImage').addEventListener('click', () => this.downloadCurrentImage());

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openApiKeyModal());
        document.getElementById('closeApiKey').addEventListener('click', () => this.closeApiKeyModal());
        document.getElementById('saveApiKey').addEventListener('click', () => this.saveApiKey());

        // Mobile menu
        document.getElementById('menuToggle').addEventListener('click', () => this.toggleSidebar());

        // Model change
        document.getElementById('modelSelect').addEventListener('change', () => this.onModelChange());

        // Close modals on outside click
        document.getElementById('filesModal').addEventListener('click', (e) => {
            if (e.target.id === 'filesModal') this.closeFilesModal();
        });
        document.getElementById('imageModal').addEventListener('click', (e) => {
            if (e.target.id === 'imageModal') this.closeImageModal();
        });
        document.getElementById('apiKeyModal').addEventListener('click', (e) => {
            if (e.target.id === 'apiKeyModal') this.closeApiKeyModal();
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        
        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        document.getElementById('chatInput').classList.toggle('active', mode === 'chat');
        document.getElementById('imageInput').classList.toggle('active', mode === 'image');
        document.getElementById('editInput').classList.toggle('active', mode === 'edit');

        // Clear input fields when switching modes
        if (mode !== 'chat') {
            document.getElementById('messageInput').value = '';
        }
        if (mode !== 'image') {
            document.getElementById('imagePrompt').value = '';
        }
        if (mode !== 'edit') {
            document.getElementById('editPrompt').value = '';
        }
    }

    toggleJsonMode() {
        this.jsonMode = !this.jsonMode;
        const btn = document.getElementById('jsonModeBtn');
        btn.classList.toggle('active', this.jsonMode);
        btn.title = this.jsonMode ? 'JSON Mode: ON' : 'JSON Mode: OFF';
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            this.updateServerStatus();
        } catch (error) {
            const statusElement = document.getElementById('serverStatus');
            statusElement.innerHTML = '<i class="fas fa-circle" style="color: #ef4444"></i><span>Server Offline</span>';
        }
    }

    updateServerStatus() {
        const statusElement = document.getElementById('serverStatus');
        if (this.userApiKey) {
            statusElement.innerHTML = '<i class="fas fa-circle" style="color: #10b981"></i><span>Ready - API Key Configured</span>';
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle" style="color: #f59e0b"></i><span>API Key Required</span>';
        }
    }

    openApiKeyModal() {
        document.getElementById('apiKeyModal').style.display = 'block';
        document.getElementById('userApiKey').value = this.userApiKey || '';
    }

    closeApiKeyModal() {
        document.getElementById('apiKeyModal').style.display = 'none';
    }

    async saveApiKey() {
        const apiKeyInput = document.getElementById('userApiKey');
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showToast('Please enter your API key');
            return;
        }

        this.showToast('Validating API key...');
        
        try {
            const response = await fetch('/api/validate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });

            const data = await response.json();
            
            if (data.success) {
                this.userApiKey = apiKey;
                this.saveUserSettings();
                this.closeApiKeyModal();
                this.showToast('✅ API key validated and saved!');
                this.updateServerStatus();
            } else {
                throw new Error(data.error || 'Invalid API key');
            }
        } catch (error) {
            this.showToast(`❌ ${error.message}`);
        }
    }

    createNewChat() {
        const chatId = 'chat_' + Date.now();
        const chat = {
            id: chatId,
            title: 'New Chat',
            messages: [],
            mode: this.currentMode,
            createdAt: new Date().toISOString()
        };
        
        this.chats.set(chatId, chat);
        this.currentChatId = chatId;
        this.saveChats();
        this.updateChatHistory();
        this.displayMessages();
        this.updateChatTitle('New Chat');
        this.toggleSidebar(false);
    }

    loadChats() {
        const savedChats = localStorage.getItem('ai_chats');
        const savedCurrentChat = localStorage.getItem('current_chat_id');
        
        if (savedChats) {
            try {
                const chatsArray = JSON.parse(savedChats);
                this.chats = new Map(chatsArray.map(chat => [chat.id, chat]));
            } catch (e) {
                console.error('Error loading chats:', e);
                this.chats = new Map();
            }
        }
        
        if (savedCurrentChat && this.chats.has(savedCurrentChat)) {
            this.currentChatId = savedCurrentChat;
        } else if (this.chats.size > 0) {
            this.currentChatId = Array.from(this.chats.keys())[0];
        } else {
            this.createNewChat();
        }
    }

    saveChats() {
        const chatsArray = Array.from(this.chats.values());
        localStorage.setItem('ai_chats', JSON.stringify(chatsArray));
        localStorage.setItem('current_chat_id', this.currentChatId);
    }

    updateChatHistory() {
        const chatHistory = document.getElementById('chatHistory');
        chatHistory.innerHTML = '';
        
        const chatsArray = Array.from(this.chats.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        chatsArray.forEach(chat => {
            const chatElement = document.createElement('div');
            chatElement.className = `chat-item ${chat.id === this.currentChatId ? 'active' : ''}`;
            
            let typeIcon = 'fa-comment';
            if (chat.messages.some(m => m.type === 'image')) typeIcon = 'fa-image';
            else if (chat.messages.some(m => m.type === 'edit')) typeIcon = 'fa-edit';
            
            chatElement.innerHTML = `
                <i class="fas ${typeIcon}"></i>
                <span>${this.truncateText(chat.title, 20)}</span>
            `;
            chatElement.addEventListener('click', () => this.switchChat(chat.id));
            chatHistory.appendChild(chatElement);
        });
    }

    switchChat(chatId) {
        this.currentChatId = chatId;
        this.saveChats();
        this.updateChatHistory();
        this.displayMessages();
        this.updateChatTitle(this.chats.get(chatId).title);
        this.toggleSidebar(false);
    }

    updateChatTitle(title) {
        document.getElementById('currentChatTitle').textContent = title;
    }

    displayMessages() {
        const chatMessages = document.getElementById('chatMessages');
        const currentChat = this.chats.get(this.currentChatId);
        
        if (!currentChat || currentChat.messages.length === 0) {
            chatMessages.innerHTML = this.getWelcomeMessage();
            return;
        }
        
        chatMessages.innerHTML = '';
        currentChat.messages.forEach(message => {
            this.addMessageToDisplay(message.role, message.content, message.type, false);
        });
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    getWelcomeMessage() {
        return `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h2>Welcome to AI Studio</h2>
                <p>Chat with AI, generate images, or edit existing ones</p>
                <div class="feature-grid">
                    <div class="feature-card">
                        <i class="fas fa-comments"></i>
                        <h4>AI Chat</h4>
                        <p>Conversations with advanced formatting</p>
                    </div>
                    <div class="feature-card">
                        <i class="fas fa-image"></i>
                        <h4>Image Generation</h4>
                        <p>Create images from text prompts</p>
                    </div>
                    <div class="feature-card">
                        <i class="fas fa-edit"></i>
                        <h4>Image Editing</h4>
                        <p>Modify and enhance images</p>
                    </div>
                </div>
            </div>
        `;
    }

    async sendMessage() {
        if (this.isGenerating) return;

        if (!this.userApiKey) {
            this.showToast('Please configure your API key first');
            this.openApiKeyModal();
            return;
        }

        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message) return;

        this.addMessage('user', message, 'text');
        messageInput.value = '';
        this.autoResizeTextarea();

        this.showTypingIndicator();

        try {
            const response = await this.generateAIResponse(message);
            this.removeTypingIndicator();
            await this.typeMessage(response, 'assistant', 'text');
            
            this.updateChatTitleFromFirstMessage(message);
            
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('assistant', `Error: ${error.message}`, 'text');
        }
    }

    async generateImage() {
        if (this.isGenerating) return;

        if (!this.userApiKey) {
            this.showToast('Please configure your API key first');
            this.openApiKeyModal();
            return;
        }

        const prompt = document.getElementById('imagePrompt').value.trim();
        const size = document.getElementById('imageSize').value;
        const quality = document.getElementById('imageQuality').value;
        
        if (!prompt) {
            this.showToast('Please enter an image description');
            return;
        }

        this.addMessage('user', `Generate image: ${prompt}`, 'image_generation');
        document.getElementById('imagePrompt').value = '';

        this.showTypingIndicator();

        try {
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt, 
                    size, 
                    quality,
                    apiKey: this.userApiKey
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `Image generation failed: ${response.statusText}`);
            }

            if (!data.success) {
                throw new Error(data.error || 'Image generation failed');
            }

            this.removeTypingIndicator();
            this.addImageMessage(data.imageUrl, prompt, 'assistant');
            this.updateChatTitleFromFirstMessage(`Image: ${prompt}`);
            
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('assistant', `Image generation failed: ${error.message}`, 'text');
        }
    }

    async editImage() {
        if (this.isGenerating || !this.uploadedImage) return;

        if (!this.userApiKey) {
            this.showToast('Please configure your API key first');
            this.openApiKeyModal();
            return;
        }

        const prompt = document.getElementById('editPrompt').value.trim();
        
        if (!prompt) {
            this.showToast('Please describe how to edit the image');
            return;
        }

        const formData = new FormData();
        formData.append('image', this.uploadedImage.file);
        formData.append('prompt', prompt);
        formData.append('apiKey', this.userApiKey);

        this.addMessage('user', `Edit image: ${prompt}`, 'image_edit');

        this.showTypingIndicator();

        try {
            const response = await fetch('/api/edit-image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `Image editing failed: ${response.statusText}`);
            }

            if (!data.success) {
                throw new Error(data.error || 'Image editing failed');
            }

            this.removeTypingIndicator();
            this.addImageMessage(data.imageUrl, `Edited: ${prompt}`, 'assistant');
            this.updateChatTitleFromFirstMessage(`Edited: ${prompt}`);
            
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('assistant', `Image editing failed: ${error.message}`, 'text');
        }
    }

    async generateAIResponse(userMessage) {
        const model = document.getElementById('modelSelect').value;
        const currentChat = this.chats.get(this.currentChatId);
        const messages = currentChat.messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));

        const requestBody = {
            messages: messages,
            model: model,
            apiKey: this.userApiKey
        };

        if (this.jsonMode) {
            requestBody.format = 'json';
        }

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.userApiKey = null;
                    localStorage.removeItem('user_api_key');
                    this.openApiKeyModal();
                    throw new Error('API key invalid. Please update your API key.');
                }
                throw new Error(data.error || `Request failed: ${response.statusText}`);
            }

            if (!data.success) {
                throw new Error(data.error || 'Request failed');
            }

            return data.content;

        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    addMessage(role, content, type = 'text') {
        const currentChat = this.chats.get(this.currentChatId);
        currentChat.messages.push({ role, content, type });
        this.saveChats();
        this.addMessageToDisplay(role, content, type, true);
    }

    addMessageToDisplay(role, content, type = 'text', animate = true) {
        const chatMessages = document.getElementById('chatMessages');
        
        // Remove welcome message if present
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        const avatar = role === 'user' ? 
            '<i class="fas fa-user"></i>' : 
            '<i class="fas fa-robot"></i>';

        let messageContent = '';
        
        if (type === 'image' || type === 'image_generation' || type === 'image_edit') {
            messageContent = this.createImageMessage(content, type === 'image_generation' ? 'Generated Image' : 'Edited Image');
        } else {
            messageContent = `<div class="message-content">${this.formatMessage(content)}</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            ${messageContent}
        `;

        chatMessages.appendChild(messageElement);
        
        if (animate) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    addImageMessage(imageUrl, caption, role) {
        const currentChat = this.chats.get(this.currentChatId);
        currentChat.messages.push({ 
            role, 
            content: imageUrl, 
            type: 'image',
            caption: caption 
        });
        this.saveChats();
        this.addMessageToDisplay(role, imageUrl, 'image', true);
    }

    createImageMessage(imageUrl, caption) {
        return `
            <div class="image-message">
                <img src="${imageUrl}" alt="${caption}" onclick="app.previewImage('${imageUrl}')">
                <div class="image-caption">${caption}</div>
            </div>
        `;
    }

    formatMessage(content) {
        if (!content) return '';
        
        // Enhanced formatting
        let formatted = content
            // Bold text
            .replace(/\*(\*?[^*]+\*?)\*/g, '<strong class="bold-text">$1</strong>')
            // Italic text
            .replace(/_([^_]+)_/g, '<em class="italic-text">$1</em>')
            // Strikethrough
            .replace(/~([^~]+)~/g, '<del class="strike-text">$1</del>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Code blocks
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="language-tag">${lang}</span>
                        <button class="copy-btn" onclick="app.copyCode(this)">Copy</button>
                    </div>
                    <pre><code>${this.escapeHtml(code.trim())}</code></pre>
                </div>
            `;
        });

        // Blockquotes
        formatted = formatted.replace(/^> (.*$)/gim, '<blockquote class="quote-block">$1</blockquote>');
        
        // Lists
        formatted = formatted.replace(/^- (.*$)/gim, '<li class="list-item">$1</li>');
        formatted = formatted.replace(/(<li class="list-item">.*<\/li>)/g, '<ul class="styled-list">$1</ul>');
        
        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    applyFormatting(type) {
        const textarea = document.getElementById('messageInput');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        
        let formattedText = '';
        const wrappers = {
            bold: ['*', '*'],
            italic: ['_', '_'],
            code: ['`', '`'],
            quote: ['> ', '']
        };

        if (wrappers[type]) {
            const [startWrapper, endWrapper] = wrappers[type];
            formattedText = startWrapper + selectedText + endWrapper;
        }

        textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + formattedText.length, start + formattedText.length);
        this.autoResizeTextarea();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    copyCode(button) {
        const codeBlock = button.closest('.code-block');
        const code = codeBlock.querySelector('code').textContent;
        
        navigator.clipboard.writeText(code).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.background = '#10b981';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        });
    }

    previewImage(imageUrl) {
        document.getElementById('modalImage').src = imageUrl;
        document.getElementById('imageModal').style.display = 'block';
        this.currentPreviewImage = imageUrl;
    }

    downloadCurrentImage() {
        if (this.currentPreviewImage) {
            const link = document.createElement('a');
            link.href = this.currentPreviewImage;
            link.download = 'ai-generated-image.png';
            link.click();
        }
    }

    closeImageModal() {
        document.getElementById('imageModal').style.display = 'none';
        this.currentPreviewImage = null;
    }

    showTypingIndicator() {
        this.isGenerating = true;
        const chatMessages = document.getElementById('chatMessages');
        
        const typingElement = document.createElement('div');
        typingElement.className = 'message ai';
        typingElement.id = 'typing-indicator';
        typingElement.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(typingElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    removeTypingIndicator() {
        this.isGenerating = false;
        const typingElement = document.getElementById('typing-indicator');
        if (typingElement) {
            typingElement.remove();
        }
    }

    async typeMessage(content, role, type) {
        const chatMessages = document.getElementById('chatMessages');
        
        if (type === 'image') {
            this.addImageMessage(content, 'Generated Image', role);
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        messageElement.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content" id="streaming-content"></div>
        `;
        
        chatMessages.appendChild(messageElement);
        
        const contentElement = messageElement.querySelector('#streaming-content');
        let displayedContent = '';
        
        for (let i = 0; i < content.length; i++) {
            if (!this.isGenerating) break;
            
            displayedContent += content[i];
            contentElement.innerHTML = this.formatMessage(displayedContent);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            const char = content[i];
            let delay = 10;
            if (char === '\n') delay = 50;
            if (char === '.' || char === '!' || char === '?') delay = 100;
            
            await this.delay(delay);
        }
        
        contentElement.innerHTML = this.formatMessage(content);
        contentElement.removeAttribute('id');
        this.addMessage(role, content, type);
    }

    // File Management Methods
    async openFilesModal() {
        await this.loadFiles();
        document.getElementById('filesModal').style.display = 'block';
    }

    closeFilesModal() {
        document.getElementById('filesModal').style.display = 'none';
    }

    async loadFiles() {
        try {
            const response = await fetch('/api/files');
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load files');
            }
            
            const filesGrid = document.getElementById('filesGrid');
            filesGrid.innerHTML = '';
            
            if (data.files && data.files.length > 0) {
                data.files.forEach(file => {
                    const fileElement = document.createElement('div');
                    fileElement.className = 'file-item';
                    fileElement.innerHTML = `
                        ${file.isImage ? 
                            `<img src="${file.path}" alt="${file.filename}" class="file-thumbnail">` :
                            `<div class="file-thumbnail" style="display: flex; align-items: center; justify-content: center; background: var(--accent-purple);">
                                <i class="fas fa-file" style="font-size: 2rem;"></i>
                            </div>`
                        }
                        <div class="file-name">${file.filename}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    `;
                    fileElement.addEventListener('click', () => this.previewFile(file));
                    filesGrid.appendChild(fileElement);
                });
            } else {
                filesGrid.innerHTML = '<p style="text-align: center; color: var(--text-gray);">No files uploaded yet</p>';
            }
        } catch (error) {
            console.error('Error loading files:', error);
            const filesGrid = document.getElementById('filesGrid');
            filesGrid.innerHTML = `<p style="text-align: center; color: var(--error);">Error loading files: ${error.message}</p>`;
        }
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        for (let file of files) {
            await this.uploadFile(file);
        }
        await this.loadFiles();
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            if (!data.success) {
                throw new Error(data.error || 'Upload failed');
            }

            this.showToast('File uploaded successfully');
        } catch (error) {
            this.showToast('Upload failed: ' + error.message);
        }
    }

    triggerFileUpload() {
        document.getElementById('fileUpload').click();
    }

    triggerImageUpload() {
        document.getElementById('imageUpload').click();
    }

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.uploadedImage = {
                file: file,
                url: URL.createObjectURL(file)
            };
            
            document.getElementById('imagePreview').src = this.uploadedImage.url;
            document.getElementById('editOptions').style.display = 'block';
            document.getElementById('uploadArea').style.display = 'none';
        }
    }

    previewFile(file) {
        if (file.isImage) {
            this.previewImage(file.path);
        } else {
            // Handle non-image files
            window.open(file.path, '_blank');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateChatTitleFromFirstMessage(firstMessage) {
        const currentChat = this.chats.get(this.currentChatId);
        if (currentChat.messages.length === 2 && currentChat.title === 'New Chat') {
            const newTitle = this.truncateText(firstMessage, 25);
            currentChat.title = newTitle;
            this.updateChatTitle(newTitle);
            this.updateChatHistory();
            this.saveChats();
        }
    }

    onModelChange() {
        const model = document.getElementById('modelSelect').value;
        console.log('Model changed to:', model);
    }

    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.currentMode === 'chat') {
                this.sendMessage();
            }
        }
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    clearCurrentChat() {
        if (this.chats.has(this.currentChatId)) {
            this.chats.get(this.currentChatId).messages = [];
            this.saveChats();
            this.displayMessages();
        }
    }

    toggleSidebar(force) {
        const sidebar = document.querySelector('.sidebar');
        if (force !== undefined) {
            sidebar.classList.toggle('active', force);
        } else {
            sidebar.classList.toggle('active');
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--accent-purple);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 1000;
            font-size: 0.875rem;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AdvancedAIChat();
});
