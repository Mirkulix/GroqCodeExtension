import * as vscode from 'vscode';
import { GroqViewProvider } from './GroqViewProvider';
import { AgentBuilderProvider } from './AgentBuilderProvider';
import { AgentManager } from './AgentManager';
import { ChatHistoryManager } from './ChatHistoryManager';
import { HistoryTreeProvider } from './HistoryViewProvider';
import Groq from 'groq-sdk';

export function activate(context: vscode.ExtensionContext) {
    const agentManager = new AgentManager(context);
    const historyManager = new ChatHistoryManager(context);
    
	const provider = new GroqViewProvider(context.extensionUri, agentManager, historyManager);
	const agentProvider = new AgentBuilderProvider(context.extensionUri, agentManager);
    const historyProvider = new HistoryTreeProvider(historyManager);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(GroqViewProvider.viewType, provider),
        vscode.window.registerWebviewViewProvider(AgentBuilderProvider.viewType, agentProvider),
        vscode.window.registerTreeDataProvider('groq.historyView', historyProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('groq.clearChat', () => {
			provider.clearChat();
		}),
        vscode.commands.registerCommand('groq.newChat', () => {
            provider.startNewChat();
        }),
        vscode.commands.registerCommand('groq.loadChat', (sessionId: string) => {
            provider.loadSession(sessionId);
        }),
        vscode.commands.registerCommand('groq.deleteChat', async (item: any) => {
            if (item && item.sessionId) {
                await historyManager.deleteSession(item.sessionId);
            }
        }),
        vscode.commands.registerCommand('groq.openEditorChat', () => {
            provider.createChatPanel();
        })
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('groq.setApiKey', async () => {
			const apiKey = await vscode.window.showInputBox({
				placeHolder: 'Enter your Groq API Key (gsk_...)',
				prompt: 'You can get your API key from https://console.groq.com/keys',
				ignoreFocusOut: true,
				password: true
			});

			if (apiKey) {
				await vscode.workspace.getConfiguration('groqCode').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('Groq API Key saved successfully!');
				// Notify provider to update view if needed (though it reads config on demand usually)
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('groq.selectModel', async () => {
			if (provider) {
                await provider.selectModel();
            }
		}),

        vscode.commands.registerCommand('groq.checkMemory', () => {
            if (provider) {
                vscode.window.showInformationMessage(provider.getMemoryStatus());
            }
        }),

        vscode.commands.registerCommand('groq.reindex', () => {
            if (provider) {
                provider.reindexWorkspace();
            }
        })
	);
}

export function deactivate() {}
