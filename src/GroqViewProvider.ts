import * as vscode from 'vscode';
import Groq from 'groq-sdk';
import * as path from 'path';
import { MemorySystem } from './MemorySystem';
import { ToolEngine, ToolCall } from './ToolEngine';
import { AgentManager } from './AgentManager';
import { ChatHistoryManager, ChatSession, ChatMessage } from './ChatHistoryManager';

export class GroqViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'groq.chatView';

	private _webviews: Set<vscode.Webview> = new Set();
    private _memory: MemorySystem;
    private _tools: ToolEngine;
    private _pendingToolCalls: Map<string, ToolCall> = new Map();
    private _currentSession?: ChatSession;
    private _currentMessages: ChatMessage[] = [];

	constructor(
		private readonly _extensionUri: vscode.Uri,
        private readonly _agentManager: AgentManager,
        private readonly _historyManager: ChatHistoryManager
	) { 
        this._memory = new MemorySystem();
        this._tools = new ToolEngine();
        // Start a new session by default
        this._startNewSession();
    }

    private _startNewSession() {
        this._currentSession = this._historyManager.createSession();
        this._currentMessages = [];
        this._historyManager.saveSession(this._currentSession);
    }

    public async loadSession(sessionId: string) {
        const session = this._historyManager.getSession(sessionId);
        if (session) {
            this._currentSession = session;
            this._currentMessages = session.messages;
            
            // Reload UI
            this.clearChat();
            for (const msg of this._currentMessages) {
                if (msg.role === 'user') {
                    this.postMessageToWebview({ type: 'addResponse', value: msg.content, isUser: true });
                } else if (msg.role === 'assistant') {
                    this.postMessageToWebview({ type: 'addResponse', value: msg.content, isUser: false });
                }
            }
        }
    }

    public startNewChat() {
        this._startNewSession();
        this.clearChat();
    }

    public getMemoryStatus(): string {
        return this._memory.getStatus();
    }

    public reindexWorkspace() {
        this._memory.scanWorkspace();
    }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._setupWebview(webviewView.webview);
	}

    public createChatPanel() {
        const panel = vscode.window.createWebviewPanel(
            GroqViewProvider.viewType,
            'Groq Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [this._extensionUri],
                retainContextWhenHidden: true
            }
        );
        
        this._setupWebview(panel.webview);
        
        // Ensure panel is disposed correctly
        panel.onDidDispose(() => {
            this._webviews.delete(panel.webview);
        });
    }

    private _setupWebview(webview: vscode.Webview) {
        this._webviews.add(webview);

		webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webview.html = this._getHtmlForWebview(webview);

        // Send active agent info
        const activeAgent = this._agentManager.getActiveAgent();
        if (activeAgent) {
            setTimeout(() => {
                webview.postMessage({ type: 'agentChanged', value: activeAgent.name });
            }, 500);
        }

        // Restore current chat history to this new view
        if (this._currentMessages.length > 0) {
             // Delay slightly to ensure UI is ready
            setTimeout(() => {
                webview.postMessage({ type: 'clearChat' });
                for (const msg of this._currentMessages) {
                    if (msg.role === 'user') {
                        webview.postMessage({ type: 'addResponse', value: msg.content, isUser: true });
                    } else if (msg.role === 'assistant') {
                        webview.postMessage({ type: 'addResponse', value: msg.content, isUser: false });
                    }
                }
            }, 200);
        }

		webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'sendMessage':
                    await this.handleUserMessage(data.value);
					break;
                case 'setApiKey':
                    vscode.commands.executeCommand('groq.setApiKey');
                    break;
                case 'selectModel':
                    vscode.commands.executeCommand('groq.selectModel');
                    break;
				case 'confirmTool':
                    await this.handleToolConfirmation(data.id, true);
                    break;
                case 'rejectTool':
                    await this.handleToolConfirmation(data.id, false);
                    break;
			}
		});
    }

    public postMessageToWebview(message: any) {
        for (const webview of this._webviews) {
            webview.postMessage(message);
        }
    }

	public clearChat() {
        for (const webview of this._webviews) {
            webview.postMessage({ type: 'clearChat' });
        }
	}
	
	public notifyModelChange(model: string) {
        for (const webview of this._webviews) {
            webview.postMessage({ type: 'modelChanged', value: model });
        }
	}

    public async selectModel() {
        const apiKey = vscode.workspace.getConfiguration('groqCode').get<string>('apiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('Please set your Groq API Key first.');
            return;
        }

        try {
            const groq = new Groq({ apiKey: apiKey, dangerouslyAllowBrowser: true });
            const models = await groq.models.list();
            
            if (!models.data) {
                throw new Error('No models returned from Groq API');
            }

            const modelItems = models.data
                .map((m: any) => ({
                    label: m.id,
                    description: m.context_window ? `Context: ${m.context_window}` : '',
                    detail: m.owned_by
                }));

            const selected = await vscode.window.showQuickPick(modelItems, {
                placeHolder: 'Select a Groq Model (fetched live from API)',
                title: 'Available Groq Models'
            });

            if (selected) {
                await vscode.workspace.getConfiguration('groqCode').update('model', selected.label, vscode.ConfigurationTarget.Global);
                this.notifyModelChange(selected.label);
                vscode.window.showInformationMessage(`Switched to model: ${selected.label}`);
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to fetch models: ${error.message}`);
        }
    }

    private async handleUserMessage(userMessage: string) {
		const apiKey = vscode.workspace.getConfiguration('groqCode').get<string>('apiKey');
        const model = vscode.workspace.getConfiguration('groqCode').get<string>('model') || 'llama3-70b-8192';

		if (!apiKey) {
			this.postMessageToWebview({ type: 'addResponse', value: 'Please set your Groq API Key first via the settings icon.' });
			return;
		}

		try {
			// Context gathering
			const editor = vscode.window.activeTextEditor;
			let contextInfo = "";
			if (editor) {
				const selection = editor.selection;
				const text = editor.document.getText(selection.isEmpty ? undefined : selection);
				if (text) {
					contextInfo = `\n\nActive Editor Context:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``;
				}
			}
            
            // Add workspace structure context
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                contextInfo += `\n\nWorkspace Root: ${workspaceFolders[0].uri.fsPath}`;
            }

            // Retrieve relevant memory/files (RAG)
            this.postMessageToWebview({ type: 'addResponse', value: '(Searching workspace memory...)' });
            const retrievedContext = this._memory.retrieveContext(userMessage);
            if (retrievedContext) {
                contextInfo += retrievedContext;
                console.log('Added retrieved context to prompt');
            }

            const configSystemPrompt = vscode.workspace.getConfiguration('groqCode').get<string>('systemPrompt') || "You are an advanced AI coding assistant.";

            const toolSystemPrompt = `
${configSystemPrompt}

When you need to perform an action (like creating files, reading files, or running commands), you MUST use a specific XML format.

Available Tools:
1. create_file(path: string, content: string) - Create or overwrite a file.
2. read_file(path: string) - Read file content.
3. list_files(path: string) - List files in a directory.
4. run_command(command: string) - Run a shell command.

To use a tool, output a block like this:
<tool_code>
{
    "tool": "create_file",
    "params": {
        "path": "src/hello.ts",
        "content": "console.log('Hello');"
    }
}
</tool_code>

You can use multiple tools in sequence. Wait for the result after using a tool.
Always verify file paths before writing.
`;

			const messages: any[] = [
				{ role: "system", content: toolSystemPrompt + "\n" + contextInfo },
				...this._currentMessages.map(m => ({ role: m.role, content: m.content })),
				{ role: "user", content: userMessage }
			];

            // Save user message to history
            if (this._currentSession) {
                this._currentMessages.push({ role: 'user', content: userMessage, timestamp: Date.now() });
                this._currentSession.messages = this._currentMessages;
                this._currentSession.lastModified = Date.now();
                // Update title if it's the first message
                if (this._currentMessages.length === 1) {
                    this._currentSession.title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
                }
                this._historyManager.saveSession(this._currentSession);
            }

			const groq = new Groq({ apiKey: apiKey, dangerouslyAllowBrowser: true });
			
			const chatCompletion = await groq.chat.completions.create({
				messages: messages,
				model: model,
				temperature: 0.5,
				max_tokens: 4096,
				top_p: 1,
				stream: true,
				stop: null
			});

			let fullResponse = "";
            let buffer = "";

			for await (const chunk of chatCompletion) {
				const content = chunk.choices[0]?.delta?.content || "";
				fullResponse += content;
                buffer += content;
				this.postMessageToWebview({ type: 'addResponseChunk', value: content });
			}

            // Save assistant response to history
            if (this._currentSession) {
                this._currentMessages.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
                this._currentSession.messages = this._currentMessages;
                this._currentSession.lastModified = Date.now();
                this._historyManager.saveSession(this._currentSession);
            }

            // Check for tool calls in the full response
            this.detectAndRequestTools(fullResponse);

		} catch (error: any) {
			this.postMessageToWebview({ type: 'addResponse', value: `Error: ${error.message}` });
		}
	}

    private detectAndRequestTools(response: string) {
        const toolRegex = /<tool_code>([\s\S]*?)<\/tool_code>/g;
        let match;
        while ((match = toolRegex.exec(response)) !== null) {
            try {
                const jsonStr = match[1];
                const toolCall = JSON.parse(jsonStr);
                // Add an ID to track this specific call
                toolCall.id = Date.now().toString() + Math.random().toString().slice(2);
                
                this._pendingToolCalls.set(toolCall.id, toolCall);

                this.postMessageToWebview({ 
                    type: 'requestToolConfirmation', 
                    tool: toolCall 
                });
            } catch (e) {
                console.error('Failed to parse tool call', e);
            }
        }
    }

    private async handleToolConfirmation(id: string, confirmed: boolean) {
        const toolCall = this._pendingToolCalls.get(id);
        if (!toolCall) {
            this.postMessageToWebview({ type: 'addResponse', value: `Error: Tool call expired or invalid.` });
            return;
        }
        
        // Remove from pending
        this._pendingToolCalls.delete(id);

        if (confirmed) {
            this.postMessageToWebview({ type: 'addResponse', value: `\n\n*Executing tool: ${toolCall.tool}...*` });
            const result = await this._tools.executeTool(toolCall);
            this.postMessageToWebview({ type: 'addResponse', value: `\n\n*Tool Result:*\n\`\`\`\n${result}\n\`\`\`` });
        } else {
            this.postMessageToWebview({ type: 'addResponse', value: `\n\n*Tool execution cancelled.*` });
        }
    }

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
		const currentModel = vscode.workspace.getConfiguration('groqCode').get<string>('model') || 'llama3-70b-8192';

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>Groq Chat</title>
			</head>
			<body>
				<div class="header">
					<div class="model-selector" id="model-display" title="Click to change model">${currentModel}</div>
					<div class="icon-btn" id="settings-btn" title="Groq Settings" role="button">
						<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM8 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z"/></svg>
					</div>
				</div>
				<div class="chat-container" id="chat-container">
					<div class="message system">Welcome to Groq Code Assistant!</div>
				</div>
				<div class="input-container">
					<textarea id="message-input" placeholder="Ask Groq... (Shift+Enter for new line)"></textarea>
					<button id="send-button">Send</button>
				</div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}
