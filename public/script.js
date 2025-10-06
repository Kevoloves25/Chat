class AdvancedAIChat {
    constructor() {
        this.currentChatId = null;
        this.chats = new Map();
        this.isGenerating = false;
        this.currentMode = 'chat';
        this.jsonMode = false;
        this.userApiKey = null;
        this.currentPreviewImage = null;
        this.initializeApp();
    }

    initializeApp() {
        this.loadUserSettings();
        this.loadChats();
        this.attachEventListeners();
        this.updateChatHistory();
        this.checkServerStatus();
        this.setMode('chat');
        
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
        
        // Mode switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.setMode(mode);
            });
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openApiKeyModal());
        document.getElementById('closeApiKey').addEventListener('click', () => this.closeApiKeyModal());
        document.getElementById('saveApiKey').addEventListener('click', () => this.saveApiKey());

        // Image handling
        document.getElementById('closeImage').addEventListener('click', () => this.closeImageModal());
        document.getElementById('downloadImage').addEventListener('click', () => this.downloadCurrentImage());

        // Mobile menu
        document.getElementById('menuToggle').addEventListener('click', () => this.toggleSidebar());

        // Model change
        document.getElementById('modelSelect').addEventListener('change', () => this.onModelChange());

        // Close modals on outside click
        document.getElementById('apiKeyModal').addEventListener('click', (e) => {
            if (e.target.id === 'apiKeyModal') this.closeApiKeyModal();
        });
        document.getElementById('imageModal').addEventListener('click', (e) => {
            if (e.target.id === 'imageModal') this.closeImageModal();
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        document.getElementById('chatInput').classList.toggle('active', mode === 'chat');
        document.getElementById('imageInput').classList.toggle('active', mode === 'image');

        if (mode !== 'chat') {
            document.getElementById('messageInput').value = '';
        }
        if (mode !== 'image') {
            document.getElementById('imagePrompt').value = '';
        }
    }

    toggleJsonMode() {
        this.jsonMode = !this.jsonMode;
        const btn = document.getElementById('jsonModeBtn');
        btn.classList.toggle('active', this.jsonMode);
        this.showToast(this.jsonMode ? 'JSON Mode Enabled' : 'JSON Mode Disabled');
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/health');
            await response.json();
            this.updateServerStatus();
        } catch (error) {
            const statusElement = document.getElementById('serverStatus');
            statusElement.innerHTML = '<i class="fas fa-circle" style="color: #ef4444"></i><span>Server Offline</span>';
        }
    }

    updateServerStatus() {
        const statusElement = document.getElementById('serverStatus');
        if (this.userApiKey) {
            statusElement.innerHTML = '<i class="fas fa-circle" style="color: #10b981"></i><span>Ready</span>';
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
                this.showToast('✅ API key saved!');
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
                <h2>Welcome to AI Chat</h2>
                <p>Chat with AI or generate images</p>
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

        // Add user message to display only
        this.addMessageToDisplay('user', message, 'text', true);
        messageInput.value = '';
        this.autoResizeTextarea();

        this.showTypingIndicator();

        try {
            const response = await this.generateAIResponse(message);
            this.removeTypingIndicator();
            
            // Add AI response to both display and storage
            this.addMessage('assistant', response, 'text');
            
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

        // Add user message to display only
        this.addMessageToDisplay('user', `Generate image: ${prompt}`, 'image_generation', true);
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
                throw new Error(data.error || 'Image generation failed');
            }

            if (!data.success) {
                throw new Error(data.error || 'Image generation failed');
            }

            this.removeTypingIndicator();
            
            // Add image to both display and storage
            this.addMessage('assistant', data.imageUrl, 'image', data.revisedPrompt || prompt);
            
            this.updateChatTitleFromFirstMessage(`Image: ${prompt}`);
            
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('assistant', `Image generation failed: ${error.message}`, 'text');
        }
    }

    async generateAIResponse(userMessage) {
        const model = document.getElementById('modelSelect').value;
        const currentChat = this.chats.get(this.currentChatId);
        
        // Prepare messages for API (only stored messages)
        const messages = currentChat.messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // Add the new user message to the API request
        messages.push({
            role: 'user',
            content: userMessage
        });

        const requestBody = {
            messages: messages,
            model: model,
            apiKey: this.userApiKey
        };

        if (this.jsonMode) {
            requestBody.format = 'json';
        }

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
            throw new Error(data.error || 'Request failed');
        }

        if (!data.success) {
            throw new Error(data.error || 'Request failed');
        }

        return data.content;
    }

    addMessage(role, content, type = 'text', caption = null) {
        const currentChat = this.chats.get(this.currentChatId);
        const messageData = { role, content, type };
        if (caption) messageData.caption = caption;
        
        currentChat.messages.push(messageData);
        this.saveChats();
        
        // Only add to display if it's not already displayed
        if (role === 'assistant') {
            this.addMessageToDisplay(role, content, type, true, caption);
        }
    }

    addMessageToDisplay(role, content, type = 'text', animate = true, caption = null) {
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
        
        if (type === 'image') {
            messageContent = this.createImageMessage(content, caption || 'Generated Image');
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
        
        let formatted = content
            .replace(/\*(\*?[^*]+\*?)\*/g, '<strong class="bold-text">$1</strong>')
            .replace(/_([^_]+)_/g, '<em class="italic-text">$1</em>')
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
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

        formatted = formatted.replace(/^> (.*$)/gim, '<blockquote class="quote-block">$1</blockquote>');
        formatted = formatted.replace(/^- (.*$)/gim, '<li class="list-item">$1</li>');
        formatted = formatted.replace(/(<li class="list-item">.*<\/li>)/g, '<ul class="styled-list">$1</ul>');
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
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
        // Model changed - you can add specific behavior here
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
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AdvancedAIChat();
});
