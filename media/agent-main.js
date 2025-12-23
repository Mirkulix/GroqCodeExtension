(function() {
    const vscode = acquireVsCodeApi();
    
    // Elements
    const agentList = document.getElementById('agent-list');
    const agentForm = document.getElementById('agent-form');
    const newAgentBtn = document.getElementById('new-agent-btn');
    const saveBtn = document.getElementById('save-agent-btn');
    const cancelBtn = document.getElementById('cancel-agent-btn');
    
    // Form Inputs
    const idInput = document.getElementById('agent-id');
    const nameInput = document.getElementById('agent-name');
    const descInput = document.getElementById('agent-description');
    const promptInput = document.getElementById('agent-prompt');
    const formTitle = document.getElementById('form-title');

    let agents = [];
    let activeId = null;

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateState':
                agents = message.agents;
                activeId = message.activeId;
                renderAgents();
                break;
        }
    });

    // Initial Request
    vscode.postMessage({ type: 'refresh' });

    function renderAgents() {
        agentList.innerHTML = '';
        agents.forEach(agent => {
            const el = document.createElement('div');
            el.className = `agent-card ${agent.id === activeId ? 'active' : ''}`;
            el.innerHTML = `
                <div class="agent-info">
                    <div class="agent-name">${agent.name} ${agent.id === activeId ? '✅' : ''}</div>
                    <div class="agent-desc">${agent.description}</div>
                </div>
                <div class="agent-actions">
                    ${agent.id !== activeId ? `<button class="activate-btn" onclick="activateAgent('${agent.id}', '${agent.name}')">Use</button>` : '<span class="active-badge">Active</span>'}
                    <button class="edit-btn" onclick="editAgent('${agent.id}')">✏️</button>
                    ${agent.id !== 'default' ? `<button class="delete-btn" onclick="deleteAgent('${agent.id}')">🗑️</button>` : ''}
                </div>
            `;
            agentList.appendChild(el);
        });
    }

    // Global handlers for dynamic HTML
    window.activateAgent = (id, name) => {
        vscode.postMessage({ type: 'activateAgent', id, name });
    };

    window.editAgent = (id) => {
        const agent = agents.find(a => a.id === id);
        if (agent) {
            showForm(agent);
        }
    };

    window.deleteAgent = (id) => {
        if (confirm('Are you sure you want to delete this agent?')) {
            vscode.postMessage({ type: 'deleteAgent', id });
        }
    };

    function showForm(agent = null) {
        agentList.style.display = 'none';
        newAgentBtn.style.display = 'none';
        agentForm.classList.remove('hidden');

        if (agent) {
            formTitle.textContent = 'Edit Agent';
            idInput.value = agent.id;
            nameInput.value = agent.name;
            descInput.value = agent.description;
            promptInput.value = agent.systemPrompt;
        } else {
            formTitle.textContent = 'New Agent';
            idInput.value = '';
            nameInput.value = '';
            descInput.value = '';
            promptInput.value = '';
        }
    }

    function hideForm() {
        agentForm.classList.add('hidden');
        agentList.style.display = 'block';
        newAgentBtn.style.display = 'block';
    }

    newAgentBtn.addEventListener('click', () => {
        showForm();
    });

    cancelBtn.addEventListener('click', () => {
        hideForm();
    });

    saveBtn.addEventListener('click', () => {
        const name = nameInput.value;
        const description = descInput.value;
        const systemPrompt = promptInput.value;
        let id = idInput.value;

        if (!name || !systemPrompt) {
            return;
        }

        if (!id) {
            id = Date.now().toString();
        }

        vscode.postMessage({
            type: 'saveAgent',
            value: {
                id,
                name,
                description,
                systemPrompt
            }
        });

        hideForm();
    });

})();
