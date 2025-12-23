import * as vscode from 'vscode';
import { AgentManager, AgentProfile } from './AgentManager';

export class AgentBuilderProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'groq.agentBuilderView';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
        private readonly _agentManager: AgentManager
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Send initial agent list after a brief delay to ensure script is ready
        setTimeout(() => this._updateWebview(), 500);

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'saveAgent':
					await this._agentManager.saveAgent(data.value);
                    this._updateWebview();
                    vscode.window.showInformationMessage(`Agent "${data.value.name}" saved.`);
					break;
                case 'deleteAgent':
                    await this._agentManager.deleteAgent(data.id);
                    this._updateWebview();
                    vscode.window.showInformationMessage('Agent deleted.');
                    break;
                case 'activateAgent':
                    await this._agentManager.setActiveAgent(data.id);
                    this._updateWebview();
                    vscode.window.showInformationMessage(`Agent "${data.name}" activated.`);
                    break;
                case 'refresh':
                    this._updateWebview();
                    break;
			}
		});
	}

    private _updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateState',
                agents: this._agentManager.getAgents(),
                activeId: this._agentManager.getActiveAgentId()
            });
        }
    }

	private _getHtmlForWebview(webview: vscode.Webview) {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'agent-style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'agent-main.js'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
				<title>Agent Manager</title>
			</head>
			<body>
				<div class="container">
                    <h2>Agent Manager</h2>
                    
                    <div id="agent-list" class="agent-list">
                        <!-- Agents injected here -->
                    </div>

                    <button id="new-agent-btn" class="secondary-btn" style="width: 100%; margin-top: 10px;">+ New Agent</button>

                    <div id="agent-form" class="agent-form hidden">
                        <h3 id="form-title">Edit Agent</h3>
                        <input type="hidden" id="agent-id">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="agent-name" placeholder="Agent Name">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" id="agent-description" placeholder="Short description">
                        </div>
                        <div class="form-group">
                            <label>System Prompt</label>
                            <textarea id="agent-prompt" rows="8" placeholder="You are an expert..."></textarea>
                        </div>
                        <div class="form-actions">
                            <button id="save-agent-btn">Save</button>
                            <button id="cancel-agent-btn" class="secondary-btn">Cancel</button>
                        </div>
                    </div>
				</div>
                <script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}
