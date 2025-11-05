import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

let terminalPanel: vscode.WebviewPanel | undefined;
let childProcess: ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenCode wrapper extension is now active');

    // Register command to run nu script
    let runCmd = vscode.commands.registerCommand('nullshell.runScript', async () => {
        runNuScript(context);
    });

    context.subscriptions.push(runCmd);
}

async function runNuScript(context: vscode.ExtensionContext) {
    try {
        console.log('runNuScript called');
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        console.log('Workspace path:', workspacePath);

        // Find all .nu files in workspace
        console.log('Searching for .nu files...');
        const nuFiles = await vscode.workspace.findFiles('**/*.nu', '**/node_modules/**');
        console.log('Found .nu files:', nuFiles.length);

    let scriptPath: string;

    if (nuFiles.length === 0) {
        // No .nu files found, let user browse
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'NuShell Scripts': ['nu']
            },
            title: 'Select a NuShell script to run'
        });

        if (!result || result.length === 0) {
            vscode.window.showInformationMessage('No script selected');
            return;
        }

        scriptPath = result[0].fsPath;
    } else if (nuFiles.length === 1) {
        // Only one .nu file, use it directly
        scriptPath = nuFiles[0].fsPath;
    } else {
        // Multiple .nu files, let user pick
        const items = nuFiles.map(file => ({
            label: path.basename(file.fsPath),
            description: vscode.workspace.asRelativePath(file),
            filePath: file.fsPath
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a NuShell script to run'
        });

        if (!selected) {
            vscode.window.showInformationMessage('No script selected');
            return;
        }

        scriptPath = selected.filePath;
    }

    // Create or show terminal panel
    if (terminalPanel) {
        terminalPanel.reveal(vscode.ViewColumn.Beside);
        // Update title with script name
        terminalPanel.title = `NuShell: ${path.basename(scriptPath)}`;
    } else {
        terminalPanel = vscode.window.createWebviewPanel(
            'nuTerminal',
            `NuShell: ${path.basename(scriptPath)}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        terminalPanel.webview.html = getTerminalHTML();

        terminalPanel.onDidDispose(() => {
            if (childProcess) {
                childProcess.kill();
            }
            terminalPanel = undefined;
            childProcess = undefined;
        });

        // Handle messages from webview (user input)
        terminalPanel.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'input' && childProcess && childProcess.stdin) {
                    // Send user input to the process
                    childProcess.stdin.write(message.text);
                }
            },
            undefined,
            context.subscriptions
        );
    }

    // Kill existing process if any
    if (childProcess) {
        childProcess.kill();
        childProcess = undefined;
    }

    // Use script's directory as working directory
    const scriptDir = path.dirname(scriptPath);

    // Create environment with extended PATH
    // VSCode marketplace extensions don't always have Homebrew paths in their PATH
    const env = { ...process.env };
    const additionalPaths = [
        '/opt/homebrew/bin',  // Homebrew on Apple Silicon
        '/usr/local/bin',     // Homebrew on Intel Mac
        '/usr/bin',           // System binaries
    ];

    // Add additional paths to PATH if they're not already included
    const currentPath = env.PATH || '';
    const pathsToAdd = additionalPaths.filter(p => !currentPath.includes(p));
    if (pathsToAdd.length > 0) {
        env.PATH = pathsToAdd.join(':') + (currentPath ? ':' + currentPath : '');
        console.log('Extended PATH:', env.PATH);
    }

    // Find nu executable in common locations
    const nuPaths = [
        '/opt/homebrew/bin/nu',  // Homebrew on Apple Silicon
        '/usr/local/bin/nu',     // Homebrew on Intel Mac
        '/usr/bin/nu',           // System binaries
    ];

    let nuExecutable = 'nu';  // fallback to PATH resolution

    // Check which path exists and use it
    for (const nuPath of nuPaths) {
        try {
            if (fs.existsSync(nuPath)) {
                nuExecutable = nuPath;
                console.log('Found nu at:', nuPath);
                break;
            }
        } catch (e) {
            // Continue checking other paths
        }
    }

    // Clear previous output and send initial info
    terminalPanel.webview.postMessage({
        type: 'clear'
    });

    terminalPanel.webview.postMessage({
        type: 'output',
        text: `Running: ${scriptPath}\r\nWorking Directory: ${scriptDir}\r\n\r\n`
    });

    // Spawn the process using child_process
    try {
        childProcess = spawn(nuExecutable, [scriptPath], {
            cwd: scriptDir,
            env: env,
            shell: false
        });

        console.log('Process spawned with PID:', childProcess.pid);

        // Capture stdout
        if (childProcess.stdout) {
            childProcess.stdout.on('data', (data: Buffer) => {
                const text = data.toString();
                console.log('stdout:', text);
                terminalPanel?.webview.postMessage({
                    type: 'output',
                    text: text
                });
            });
        }

        // Capture stderr
        if (childProcess.stderr) {
            childProcess.stderr.on('data', (data: Buffer) => {
                const text = data.toString();
                console.log('stderr:', text);
                terminalPanel?.webview.postMessage({
                    type: 'output',
                    text: text
                });
            });
        }

        // Handle process exit
        childProcess.on('exit', (code: number | null, signal: string | null) => {
            console.log(`Process exited with code ${code}, signal ${signal}`);
            terminalPanel?.webview.postMessage({
                type: 'output',
                text: `\r\n\r\nProcess exited with code: ${code}\r\n`
            });
            childProcess = undefined;
        });

        // Handle process errors
        childProcess.on('error', (err: Error) => {
            console.error('Process error:', err);
            terminalPanel?.webview.postMessage({
                type: 'output',
                text: `\r\n\r\nError: ${err.message}\r\n`
            });
            vscode.window.showErrorMessage(`Failed to run script: ${err.message}`);
        });

    } catch (error) {
        console.error('Error spawning process:', error);
        vscode.window.showErrorMessage(`Failed to spawn process: ${error}`);
    }

    } catch (error) {
        console.error('Error in runNuScript:', error);
        vscode.window.showErrorMessage(`Failed to run NuShell script: ${error}`);
    }
}

function getTerminalHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NuShell Output</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background-color: var(--vscode-terminal-background);
            height: 100vh;
            overflow: hidden;
        }

        #terminal {
            width: 100%;
            height: 100%;
            padding: 10px;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>

    <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
    <script>
        const vscode = acquireVsCodeApi();

        // Create xterm instance
        const term = new Terminal({
            cursorBlink: false,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: getComputedStyle(document.body).getPropertyValue('--vscode-terminal-background') || '#1e1e1e',
                foreground: getComputedStyle(document.body).getPropertyValue('--vscode-terminal-foreground') || '#cccccc'
            },
            scrollback: 10000,
            disableStdin: false
        });

        // Add fit addon
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Open terminal in the container
        term.open(document.getElementById('terminal'));
        fitAddon.fit();

        // Handle window resize
        window.addEventListener('resize', () => {
            fitAddon.fit();
        });

        // Handle user input from terminal
        term.onData(data => {
            vscode.postMessage({
                type: 'input',
                text: data
            });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'output') {
                term.write(message.text);
            } else if (message.type === 'clear') {
                term.clear();
            }
        });

        // Focus terminal
        term.focus();
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (childProcess) {
        childProcess.kill();
    }
    if (terminalPanel) {
        terminalPanel.dispose();
    }
}
