(function() {
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const modelDisplay = document.getElementById('model-display');
    const settingsBtn = document.getElementById('settings-btn');

    let currentResponseElement = null;

    function addMessage(text, type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.innerText = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return div;
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text) {
            addMessage(text, 'user');
            vscode.postMessage({ type: 'sendMessage', value: text });
            messageInput.value = '';
            currentResponseElement = null;
            messageInput.focus();
        }
    }

    sendButton.addEventListener('click', sendMessage);
    
    if (modelDisplay) {
        modelDisplay.addEventListener('click', () => {
            vscode.postMessage({ type: 'selectModel' });
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'setApiKey' });
        });
    }

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'addResponse':
                if (message.isUser) {
                    addMessage(message.value, 'user');
                } else {
                    currentResponseElement = addMessage(message.value, 'assistant');
                }
                break;
            case 'updateResponse':
                if (currentResponseElement) {
                    currentResponseElement.innerText = message.value;
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                } else {
                     currentResponseElement = addMessage(message.value, 'assistant');
                }
                break;
            case 'error':
                if (currentResponseElement) {
                    currentResponseElement.remove(); // Remove the "..." placeholder
                }
                if (message.code === 'MISSING_API_KEY') {
                    const div = document.createElement('div');
                    div.className = 'message system error';
                    div.innerHTML = `
                        <p>Groq API Key is missing.</p>
                        <button id="set-api-key-btn">Set API Key</button>
                    `;
                    chatContainer.appendChild(div);
                    document.getElementById('set-api-key-btn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'setApiKey' });
                    });
                } else {
                    addMessage(message.value, 'system error');
                }
                chatContainer.scrollTop = chatContainer.scrollHeight;
                break;
            case 'clearChat':
                chatContainer.innerHTML = '<div class="message system">Chat cleared.</div>';
                break;
            case 'modelChanged':
                if (modelDisplay) {
                    modelDisplay.innerText = message.value;
                }
                break;
            case 'requestToolConfirmation':
                showToolConfirmation(message.tool);
                break;
        }
    });

    function showToolConfirmation(toolCall) {
        const div = document.createElement('div');
        div.className = 'tool-confirmation';
        div.innerHTML = `
            <div class="tool-header">⚡ Tool Request: <strong>${toolCall.tool}</strong></div>
            <pre class="tool-params">${JSON.stringify(toolCall.params, null, 2)}</pre>
            <div class="tool-actions">
                <button class="confirm-btn" onclick="confirmTool('${toolCall.tool}', '${toolCall.id}')">Run</button>
                <button class="reject-btn" onclick="rejectTool('${toolCall.tool}', '${toolCall.id}')">Reject</button>
            </div>
        `;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    window.confirmTool = (tool, id) => {
        vscode.postMessage({ type: 'confirmTool', tool: tool, id: id });
        // Remove buttons to prevent double-click
        const btn = document.activeElement;
        if (btn && btn.parentElement) btn.parentElement.innerHTML = '<em>Confirmed</em>';
    };

    window.rejectTool = (tool, id) => {
        vscode.postMessage({ type: 'rejectTool', tool: tool, id: id });
        const btn = document.activeElement;
        if (btn && btn.parentElement) btn.parentElement.innerHTML = '<em>Rejected</em>';
    };
})();
