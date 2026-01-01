#!/usr/bin/env sh

# Script to add npm global bin directory to PATH

# Detect shell (default to zsh for macOS)
if [ -n "$ZSH_VERSION" ] || [ -z "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

# Check if already in the rc file
if grep -q "npm bin -g" "$SHELL_RC" 2>/dev/null; then
    echo "✅ PATH export already exists in $SHELL_RC"
    exit 0
fi

# Add to shell rc file
echo '' >> "$SHELL_RC"
echo '# Add npm global bin to PATH' >> "$SHELL_RC"
echo 'export PATH="$(npm bin -g):$PATH"' >> "$SHELL_RC"
echo "✅ Added npm global bin to PATH in $SHELL_RC"
echo "📝 Run 'source $SHELL_RC' or restart your terminal to apply changes"

