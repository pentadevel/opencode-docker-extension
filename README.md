# OpenCode Wrapper Extension

A VSCode extension that runs NuShell scripts interactively with a native-looking terminal interface beside your editor.

## Features

- 🖥️ **Real Terminal Experience** - Full PTY (pseudoterminal) with interactive shell
- ⌨️ **Direct Keyboard Input** - Type directly into the terminal, just like a real terminal
- 🎨 **VSCode Theme Integration** - Matches your VSCode theme colors
- 📁 **Runs in Background** - No visible terminal window, process runs silently
- ⚡ **Real-time I/O** - Live output streaming with full terminal capabilities
- 🔧 **Full Terminal Features** - Supports Ctrl+C, arrow keys, backspace, and more

## Usage

### Running Interactive NuShell Script

1. Open Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
2. Type "OpenCode: Run in Current Directory"
3. **Select a script**:
   - If only one `.nu` file exists, it runs automatically
   - If multiple `.nu` files exist, choose from the list
   - If no `.nu` files found, browse for a file
4. Interactive terminal panel opens beside your editor
5. Script runs and shows output in real-time
6. **Type directly into the terminal** - it works just like a real terminal:
   - Type your responses and press Enter
   - Use Backspace, arrow keys, Ctrl+C, etc.
   - All keyboard input is sent directly to the shell
7. Continue interacting with the script naturally

**Note:** Extension does NOT auto-start. You must manually trigger it via command palette.

## Development

### Prerequisites

- Node.js (v20+)
- npm
- VSCode
- OpenCode CLI tool

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Press `F5` to run the extension in debug mode

### Build

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

## Extension Structure

```
.
├── src/
│   └── extension.ts        # Main extension logic (runs opencode)
├── resources/
│   └── icon.svg            # Extension icon
├── .vscode/
│   ├── launch.json         # Debug configuration
│   └── tasks.json          # Build tasks
├── package.json            # Extension manifest
└── tsconfig.json           # TypeScript configuration
```

## Commands

- `nullshell.runScript` - Manually run OpenCode in current directory

## Requirements

- **NuShell** must be installed on your system
- The `nu` command must be available in your PATH
- Install from: https://www.nushell.sh/

## Configuration

The extension works out of the box:
1. Create any `.nu` script in your workspace
2. Open the workspace in VSCode
3. Trigger via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Type "OpenCode: Run in Current Directory"
5. Select your script (or it auto-runs if only one exists)
6. Interactive terminal panel opens beside your editor

## How It Works

1. User triggers command via Command Palette
2. Extension searches for `.nu` files in workspace:
   - **One file**: Runs automatically
   - **Multiple files**: Shows quick pick menu
   - **No files**: Opens file browser
3. Extension creates webview panel with real terminal interface (opens beside editor)
4. Spawns `nu <script>` process using **node-pty** (PTY/pseudoterminal)
5. Working directory is set to the script's folder
6. PTY provides full terminal capabilities (TTY emulation)
7. Captures all terminal output in real-time and displays it
8. **Interactive Mode**:
   - User types directly into the terminal (no separate input field)
   - Each keystroke is sent to the PTY
   - Supports special keys (Enter, Backspace, Ctrl+C, arrow keys, etc.)
   - Process receives input exactly like a real terminal
9. Session stays alive until script completes or panel is closed

## Future Enhancements

- [ ] Configurable command via settings
- [ ] Custom arguments support
- [ ] Multiple workspace support
- [ ] Command history

## Contributing

Feel free to open issues and pull requests!

## License

MIT
