import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Paperclip, Send, Stethoscope, ChevronDown, FileImage } from 'lucide-react';
import './JeevanChat.css';

const WELCOME_MESSAGE = {
    id: 'welcome',
    role: 'bot',
    content: `Hello! I'm <strong>JeevanAlert AI</strong>, your medical imaging assistant powered by MedGemma. You can upload X-rays, radiology reports, or dermoscopic images, and I'll help you interpret findings, answer clinical questions, and provide insights.\n\nHow can I assist you today?`,
    time: new Date(),
};

// Fallback responses when streaming is unavailable
const FALLBACK_RESPONSES = [
    "I can help you analyze medical images. Please upload an X-ray, CT scan, or radiology report for interpretation.",
    "I'm designed to assist with medical imaging analysis. Could you share more details about the case you'd like me to review?",
    "I can interpret findings from X-rays, CT scans, and DICOM files. Feel free to upload an image or describe the clinical scenario.",
    "Based on your query, I recommend uploading the relevant imaging study so I can provide a more detailed analysis.",
    "I'm here to support clinical decision-making. Please share the imaging data or describe the findings you'd like me to evaluate.",
];

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function JeevanChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([WELCOME_MESSAGE]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [streamingMessageId, setStreamingMessageId] = useState(null);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const toggleChat = () => setIsOpen(prev => !prev);

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text && !selectedFile) return;

        const capturedFile = selectedFile;

        // Add user message
        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text || (capturedFile ? `Uploaded: ${capturedFile.name}` : ''),
            time: new Date(),
            file: capturedFile?.name || null,
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setSelectedFile(null);
        setIsTyping(true);

        // Pre-create an empty bot message that will be grown token-by-token
        const botMsgId = (Date.now() + 1).toString();
        setMessages(prev => [
            ...prev,
            { id: botMsgId, role: 'bot', content: '', time: new Date(), isStreaming: true },
        ]);
        setStreamingMessageId(botMsgId);

        try {
            const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
            const formData = new FormData();
            formData.append('message', text || 'Analyze this image');
            if (capturedFile) formData.append('image', capturedFile);

            const response = await fetch(`${API_BASE}/chat/`, {
                method: 'POST',
                body: formData,
                // Do NOT set Content-Type — browser sets multipart boundary automatically
            });

            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Split on SSE frame boundary (double newline)
                const frames = buffer.split('\n\n');
                buffer = frames.pop(); // keep any incomplete frame

                for (const frame of frames) {
                    for (const line of frame.split('\n')) {
                        if (!line.startsWith('data: ')) continue;
                        let event;
                        try {
                            event = JSON.parse(line.slice(6));
                        } catch {
                            continue;
                        }

                        if (event.type === 'status') {
                            // Show status as italic placeholder while still "typing"
                            setMessages(prev => prev.map(m =>
                                m.id === botMsgId
                                    ? { ...m, content: `<em>${event.content}</em>` }
                                    : m
                            ));

                        } else if (event.type === 'token') {
                            setIsTyping(false); // first token: hide bouncing dots
                            setMessages(prev => prev.map(m => {
                                if (m.id !== botMsgId) return m;
                                // Clear any italic status text on first real token
                                const base = m.content.startsWith('<em>') ? '' : m.content;
                                return { ...m, content: base + event.content, isStreaming: true };
                            }));

                        } else if (event.type === 'done') {
                            setIsTyping(false);
                            setMessages(prev => prev.map(m =>
                                m.id === botMsgId ? { ...m, isStreaming: false } : m
                            ));
                            setStreamingMessageId(null);

                        } else if (event.type === 'error') {
                            setIsTyping(false);
                            setMessages(prev => prev.map(m =>
                                m.id === botMsgId
                                    ? { ...m, content: `Error: ${event.content}`, isStreaming: false }
                                    : m
                            ));
                            setStreamingMessageId(null);
                        }
                    }
                }
            }

        } catch (err) {
            // Graceful fallback — remove the empty streaming message, add static fallback
            setIsTyping(false);
            setStreamingMessageId(null);
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== botMsgId);
                const fallback = FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
                return [
                    ...filtered,
                    { id: Date.now().toString(), role: 'bot', content: fallback, time: new Date() },
                ];
            });
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) setSelectedFile(file);
        // Reset so same file can be re-selected
        e.target.value = '';
    };

    return (
        <>
            {/* ---- Chat Popup ---- */}
            <div className={`jeevanalert-chat-popup${isOpen ? ' visible' : ''}`}>
                {/* Header */}
                <div className="jeevanalert-chat-header">
                    <div className="jeevanalert-header-icon">
                        <Stethoscope size={20} />
                    </div>
                    <div className="jeevanalert-header-info">
                        <p className="jeevanalert-header-title">JeevanAlert AI</p>
                        <p className="jeevanalert-header-subtitle">Medical Imaging Assistant</p>
                    </div>
                    <button className="jeevanalert-header-close" onClick={() => setIsOpen(false)} aria-label="Close chat">
                        <X size={18} />
                    </button>
                </div>

                {/* Messages */}
                <div className="jeevanalert-chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`jeevanalert-message ${msg.role}`}>
                            {msg.role === 'bot' && (
                                <div className="jeevanalert-message-sender">
                                    <span className={`jeevanalert-sender-dot${msg.isStreaming ? ' streaming' : ''}`} />
                                    <span className="jeevanalert-sender-name">JeevanAlert AI</span>
                                </div>
                            )}
                            <div
                                className={`jeevanalert-message-bubble${msg.isStreaming ? ' streaming' : ''}`}
                                dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }}
                            />
                            <span className="jeevanalert-message-time">{formatTime(msg.time)}</span>
                        </div>
                    ))}

                    {/* Bouncing dots only before first token arrives */}
                    {isTyping && !streamingMessageId && (
                        <div className="jeevanalert-message bot">
                            <div className="jeevanalert-message-sender">
                                <span className="jeevanalert-sender-dot" />
                                <span className="jeevanalert-sender-name">JeevanAlert AI</span>
                            </div>
                            <div className="jeevanalert-typing">
                                <span className="jeevanalert-typing-dot" />
                                <span className="jeevanalert-typing-dot" />
                                <span className="jeevanalert-typing-dot" />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="jeevanalert-chat-input-area">
                    {selectedFile && (
                        <div className="jeevanalert-file-preview">
                            <FileImage size={14} />
                            <span className="jeevanalert-file-preview-name">{selectedFile.name}</span>
                            <button className="jeevanalert-file-remove" onClick={() => setSelectedFile(null)} aria-label="Remove file">
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    <div className="jeevanalert-input-row">
                        <input
                            ref={inputRef}
                            className="jeevanalert-chat-input"
                            type="text"
                            placeholder="Ask about X-rays, radiology reports..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={!!streamingMessageId}
                        />
                        <input
                            ref={fileInputRef}
                            className="jeevanalert-file-input"
                            type="file"
                            accept="image/*,.dcm,.dicom,.pdf"
                            onChange={handleFileSelect}
                        />
                        <button
                            className="jeevanalert-input-btn jeevanalert-attach-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!!streamingMessageId}
                            aria-label="Attach file"
                        >
                            <Paperclip size={18} />
                        </button>
                        <button
                            className="jeevanalert-input-btn jeevanalert-send-btn"
                            onClick={handleSend}
                            disabled={!!streamingMessageId || (!inputValue.trim() && !selectedFile)}
                            aria-label="Send message"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="jeevanalert-chat-footer">
                    <span>Powered by MedGemma · Supports X-rays · CT scans · Radiology reports</span>
                </div>
            </div>

            {/* ---- Floating Action Button ---- */}
            <button className={`jeevanalert-fab${isOpen ? ' open' : ''}`} onClick={toggleChat} aria-label="Toggle JeevanAlert AI chat">
                <span className="jeevanalert-fab-icon">
                    <MessageCircle size={16} />
                </span>
                JeevanAlert AI
                <ChevronDown size={14} className="jeevanalert-fab-chevron" />
            </button>
        </>
    );
}
