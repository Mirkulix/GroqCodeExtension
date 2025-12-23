import * as vscode from 'vscode';

export interface AgentProfile {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    icon?: string;
}

export class AgentManager {
    private static readonly STORAGE_KEY = 'groqAgents';
    private static readonly ACTIVE_AGENT_KEY = 'groqActiveAgentId';

    constructor(private context: vscode.ExtensionContext) {
        // Initialize default agent if none exist
        if (this.getAgents().length === 0) {
            this.saveAgent({
                id: 'default',
                name: 'General Assistant',
                description: 'The default Groq coding assistant.',
                systemPrompt: `You are Groq Code Assistant, an expert AI coding partner.
You help developers write, debug, and understand code directly in VS Code.
Be concise, accurate, and provide code blocks with language identifiers.
When asked to edit code, provide the full corrected block.`,
                icon: 'robot'
            });
            this.setActiveAgent('default');
        }
    }

    public getAgents(): AgentProfile[] {
        return this.context.globalState.get<AgentProfile[]>(AgentManager.STORAGE_KEY) || [];
    }

    public getAgent(id: string): AgentProfile | undefined {
        return this.getAgents().find(a => a.id === id);
    }

    public async saveAgent(agent: AgentProfile) {
        const agents = this.getAgents();
        const index = agents.findIndex(a => a.id === agent.id);
        if (index >= 0) {
            agents[index] = agent;
        } else {
            agents.push(agent);
        }
        await this.context.globalState.update(AgentManager.STORAGE_KEY, agents);
    }

    public async deleteAgent(id: string) {
        let agents = this.getAgents();
        agents = agents.filter(a => a.id !== id);
        await this.context.globalState.update(AgentManager.STORAGE_KEY, agents);
    }

    public getActiveAgentId(): string | undefined {
        return this.context.globalState.get<string>(AgentManager.ACTIVE_AGENT_KEY);
    }

    public getActiveAgent(): AgentProfile | undefined {
        const id = this.getActiveAgentId();
        if (!id) return undefined;
        return this.getAgent(id);
    }

    public async setActiveAgent(id: string) {
        await this.context.globalState.update(AgentManager.ACTIVE_AGENT_KEY, id);
        // Also update the VS Code config systemPrompt for compatibility with existing logic
        const agent = this.getAgent(id);
        if (agent) {
             await vscode.workspace.getConfiguration('groqCode').update('systemPrompt', agent.systemPrompt, vscode.ConfigurationTarget.Global);
        }
    }
}
