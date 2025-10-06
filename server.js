const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "https://openrouter.ai", "https://api.openrouter.ai"],
            imgSrc: ["'self'", "data:", "https:", "blob:"]
        }
    }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// API key validation middleware
const validateApiKey = (req, res, next) => {
    const apiKey = req.body.apiKey;
    
    if (!apiKey) {
        return res.status(400).json({ 
            success: false,
            error: 'API key is required' 
        });
    }

    if (apiKey.length < 20) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid API key format' 
        });
    }

    req.apiKey = apiKey;
    next();
};

// Enhanced system instructions
const SYSTEM_INSTRUCTIONS = {
    'deepseek/deepseek-chat': `You are SmartChat AI. You will always introduce yourself as SmartChat Ai made by a developer named Kevo Loves. Format responses with:
- Use *bold* for emphasis
- Use \`code\` for inline code
- Use \`\`\`language\ncode\n\`\`\` for code blocks
- Use > for blockquotes
- Use - for lists
- Be concise but helpful`,

    'deepseek/deepseek-coder': `You are Deep SmartChat Coder. You will always introduce yourself as SmartChat Coder made by a developer named Kevo Loves. Format responses with:
- Use *bold* for important concepts
- Always use proper code formatting
- Explain complex code with comments
- Provide practical examples`,

    'openai/gpt-4': `You are SmartChat GPT-4. You will always introduce yourself as SmartChat GPT-4 made by a developer named Kevo Loves. Format responses clearly using:
* Bold text for key points
\`Inline code\` for technical terms
\`\`\`Code blocks for examples\`\`\`
> Quotes for important notes
- Bullet points for lists`,

    'default': `You are a helpful SmartChat AI assistant. You will always introduce yourself as SmartChat Ai made by a developer named Kevo Loves. Use markdown-style formatting:
* Bold* for emphasis
\`code\` for technical terms
\`\`\`blocks for code
> for quotes
- for lists`
};

// Model configuration
const MODEL_CONFIG = {
    'deepseek/deepseek-chat': {
        name: 'DeepSeek Chat',
        supportsImages: false,
        supportsJson: true,
        maxTokens: 4096
    },
    'deepseek/deepseek-coder': {
        name: 'DeepSeek Coder',
        supportsImages: false,
        supportsJson: true,
        maxTokens: 4096
    },
    'openai/gpt-4': {
        name: 'GPT-4',
        supportsImages: true,
        supportsJson: true,
        maxTokens: 8192
    },
    'openai/dall-e-3': {
        name: 'DALL-E 3',
        supportsImages: true,
        supportsJson: false,
        maxTokens: 1000
    },
    'anthropic/claude-3-sonnet': {
        name: 'Claude 3 Sonnet',
        supportsImages: true,
        supportsJson: true,
        maxTokens: 4096
    }
};

// API Routes

// Get available models
app.get('/api/models', (req, res) => {
    res.json({
        success: true,
        models: MODEL_CONFIG,
        instructions: SYSTEM_INSTRUCTIONS
    });
});

// Enhanced chat endpoint
app.post('/api/chat', validateApiKey, async (req, res) => {
    try {
        const { messages, model, format, options = {} } = req.body;
        const apiKey = req.apiKey;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                success: false,
                error: 'Messages array is required' 
            });
        }

        const modelConfig = MODEL_CONFIG[model] || MODEL_CONFIG['deepseek/deepseek-chat'];
        
        const chatMessages = [
            {
                role: 'system',
                content: SYSTEM_INSTRUCTIONS[model] || SYSTEM_INSTRUCTIONS.default
            },
            ...messages
        ];

        const requestBody = {
            model: model,
            messages: chatMessages,
            max_tokens: options.maxTokens || modelConfig.maxTokens,
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.9,
            stream: false
        };

        if (modelConfig.supportsJson && format === 'json') {
            requestBody.response_format = { type: 'json_object' };
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
                'X-Title': 'AI Chat'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 401) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Invalid API key' 
                });
            } else if (response.status === 429) {
                return res.status(429).json({ 
                    success: false,
                    error: 'Rate limit exceeded' 
                });
            } else {
                return res.status(response.status).json({ 
                    success: false,
                    error: 'AI service error' 
                });
            }
        }

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const result = {
                success: true,
                content: data.choices[0].message.content,
                usage: data.usage,
                model: data.model
            };

            if (format === 'json') {
                try {
                    result.json = JSON.parse(data.choices[0].message.content);
                } catch (e) {
                    result.json = null;
                }
            }

            res.json(result);
        } else {
            throw new Error('Invalid response format');
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Service temporarily unavailable' 
        });
    }
});

// Image generation endpoint
app.post('/api/generate-image', validateApiKey, async (req, res) => {
    try {
        const { prompt, model = 'openai/dall-e-3', size = '1024x1024', quality = 'standard', apiKey } = req.body;

        if (!prompt) {
            return res.status(400).json({ 
                success: false,
                error: 'Prompt is required' 
            });
        }

        const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
                'X-Title': 'AI Image Generator'
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                size: size,
                quality: quality,
                n: 1
            })
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false,
                error: 'Image generation failed' 
            });
        }

        const data = await response.json();
        
        if (data.data && data.data[0] && data.data[0].url) {
            res.json({
                success: true,
                imageUrl: data.data[0].url,
                revisedPrompt: data.data[0].revised_prompt,
                model: data.model
            });
        } else {
            throw new Error('Invalid response format');
        }

    } catch (error) {
        console.error('Image generation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Image generation failed' 
        });
    }
});

// Validate API key endpoint
app.post('/api/validate-key', validateApiKey, async (req, res) => {
    try {
        const apiKey = req.apiKey;

        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (response.ok) {
            res.json({ 
                success: true,
                message: 'API key is valid' 
            });
        } else {
            res.status(401).json({ 
                success: false,
                error: 'Invalid API key' 
            });
        }

    } catch (error) {
        console.error('API key validation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Validation service unavailable' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Server ready - configure your API key in settings',
        platform: 'Termux/Android'
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Termux AI Server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:3000 in your browser`);
    console.log(`✅ No problematic dependencies - ready to use!`);
});
