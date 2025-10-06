const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

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
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// Enhanced system instructions
const SYSTEM_INSTRUCTIONS = {
    'deepseek/deepseek-chat': `You are DeepSeek AI, a helpful assistant. Format your responses with:
- Use *bold* for emphasis
- Use \`code\` for inline code
- Use \`\`\`language\ncode\n\`\`\` for code blocks
- Use > for blockquotes
- Use - for lists
- Be concise but helpful`,

    'deepseek/deepseek-coder': `You are DeepSeek Coder, specialized in programming. Format responses with:
- Use *bold* for important concepts
- Always use proper code formatting
- Explain complex code with comments
- Provide practical examples
- Include error handling where relevant`,

    'openai/gpt-4': `You are GPT-4. Format responses clearly using:
* Bold text for key points
\`Inline code\` for technical terms
\`\`\`
Code blocks for examples
\`\`\`
> Quotes for important notes
- Bullet points for lists`,

    'default': `You are a helpful AI assistant. Use markdown-style formatting:
* Bold* for emphasis
\`code\` for technical terms
\`\`\`blocks for code
> for quotes
- for lists`
};

// Model configuration with capabilities
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

// Enhanced chat endpoint with JSON mode support
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model, format, options = {} } = req.body;
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                success: false,
                error: 'Server configuration error: API key not configured' 
            });
        }

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                success: false,
                error: 'Messages array is required' 
            });
        }

        const modelConfig = MODEL_CONFIG[model] || MODEL_CONFIG['deepseek/deepseek-chat'];
        
        // Prepare messages with system instruction
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

        // Add JSON mode if supported and requested
        if (modelConfig.supportsJson && format === 'json') {
            requestBody.response_format = { type: 'json_object' };
        }

        console.log('Sending request to OpenRouter:', { model, messageCount: messages.length });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
                'X-Title': 'Advanced AI Chat'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            return res.status(response.status).json({ 
                success: false,
                error: `AI service error: ${response.statusText}` 
            });
        }

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const result = {
                success: true,
                content: data.choices[0].message.content,
                usage: data.usage,
                model: data.model
            };

            // If JSON was requested, try to parse it
            if (format === 'json') {
                try {
                    result.json = JSON.parse(data.choices[0].message.content);
                } catch (e) {
                    console.warn('JSON parsing failed:', e.message);
                    result.json = null;
                }
            }

            res.json(result);
        } else {
            throw new Error('Invalid response format from AI service');
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Image generation endpoint
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, model = 'openai/dall-e-3', size = '1024x1024', quality = 'standard' } = req.body;
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                success: false,
                error: 'Server configuration error: API key not configured' 
            });
        }

        if (!prompt) {
            return res.status(400).json({ 
                success: false,
                error: 'Prompt is required for image generation' 
            });
        }

        console.log('Generating image with prompt:', prompt);

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
            const errorText = await response.text();
            console.error('Image generation error:', response.status, errorText);
            return res.status(response.status).json({ 
                success: false,
                error: `Image generation failed: ${response.statusText}` 
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
            throw new Error('Invalid response format from image generation service');
        }

    } catch (error) {
        console.error('Image generation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Image generation failed',
            details: error.message 
        });
    }
});

// Image editing endpoint
app.post('/api/edit-image', upload.single('image'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                success: false,
                error: 'Server configuration error: API key not configured' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'Image file is required' 
            });
        }

        if (!prompt) {
            return res.status(400).json({ 
                success: false,
                error: 'Prompt is required for image editing' 
            });
        }

        console.log('Editing image with prompt:', prompt);

        // For OpenRouter, we need to send the image as base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');

        const requestBody = {
            model: 'openai/dall-e-2',
            image: `data:image/png;base64,${base64Image}`,
            prompt: prompt,
            n: 1,
            size: '1024x1024'
        };

        const response = await fetch('https://openrouter.ai/api/v1/images/edits', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
                'X-Title': 'AI Image Editor'
            },
            body: JSON.stringify(requestBody)
        });

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Image editing error:', response.status, errorText);
            return res.status(response.status).json({ 
                success: false,
                error: `Image editing failed: ${response.statusText}` 
            });
        }

        const data = await response.json();
        
        if (data.data && data.data[0] && data.data[0].url) {
            res.json({
                success: true,
                imageUrl: data.data[0].url,
                model: data.model
            });
        } else {
            throw new Error('Invalid response format from image editing service');
        }

    } catch (error) {
        console.error('Image editing error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Image editing failed',
            details: error.message 
        });
    }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        // Process image if it's an image file
        let processedFile = req.file;
        const isImage = /^image\//.test(req.file.mimetype);

        let thumbnailFilename = null;

        if (isImage) {
            // Create thumbnail
            thumbnailFilename = `thumb-${req.file.filename}`;
            const thumbnailPath = path.join('uploads', thumbnailFilename);
            
            await sharp(req.file.path)
                .resize(200, 200, { fit: 'inside' })
                .toFile(thumbnailPath);
        }

        res.json({
            success: true,
            file: {
                originalName: req.file.originalname,
                filename: req.file.filename,
                path: `/uploads/${req.file.filename}`,
                size: req.file.size,
                mimetype: req.file.mimetype,
                thumbnail: thumbnailFilename ? `/uploads/${thumbnailFilename}` : null,
                uploadedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'File upload failed',
            details: error.message 
        });
    }
});

// File download endpoint - FIXED to return proper JSON
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false,
                error: 'File not found' 
            });
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ 
                    success: false,
                    error: 'File download failed' 
                });
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            success: false,
            error: 'File download failed',
            details: error.message 
        });
    }
});

// Get uploaded files list
app.get('/api/files', (req, res) => {
    try {
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ 
                success: true,
                files: [] 
            });
        }

        const files = fs.readdirSync(uploadsDir)
            .filter(file => !file.startsWith('thumb-'))
            .map(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    path: `/uploads/${file}`,
                    size: stats.size,
                    uploadedAt: stats.birthtime,
                    isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
                };
            });

        res.json({ 
            success: true,
            files 
        });
    } catch (error) {
        console.error('Files list error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Could not retrieve files list',
            details: error.message 
        });
    }
});

// Delete file endpoint
app.delete('/api/files/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);
        const thumbPath = path.join(__dirname, 'uploads', `thumb-${filename}`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false,
                error: 'File not found' 
            });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
        }

        res.json({ 
            success: true, 
            message: 'File deleted successfully' 
        });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false,
            error: 'File deletion failed',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const apiKeyConfigured = !!process.env.OPENROUTER_API_KEY;
    const uploadsAvailable = fs.existsSync(uploadsDir);
    
    res.json({ 
        success: true,
        status: 'OK', 
        apiKeyConfigured: apiKeyConfigured,
        uploadsAvailable: uploadsAvailable,
        timestamp: new Date().toISOString(),
        models: Object.keys(MODEL_CONFIG)
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        details: error.message 
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found'
    });
});

// Startup validation
if (!process.env.OPENROUTER_API_KEY) {
    console.warn('⚠️  WARNING: OPENROUTER_API_KEY environment variable is not set!');
    console.warn('   Create a .env file with: OPENROUTER_API_KEY=your_key_here');
}

app.listen(PORT, () => {
    console.log(`🚀 Advanced AI Server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your browser`);
    console.log(`🖼️  Image uploads directory: ${uploadsDir}`);
    
    if (process.env.OPENROUTER_API_KEY) {
        console.log('✅ OpenRouter API key is configured');
    } else {
        console.log('❌ OpenRouter API key is NOT configured');
    }
});