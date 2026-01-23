/**
 * Password input utilities
 *
 * Provides secure password prompting for CLI operations.
 */

import * as readline from 'readline';

/**
 * Prompt for a password from stdin with hidden input
 *
 * @param prompt - The prompt message to display
 * @param hidden - Whether to hide the input (default: true)
 * @returns The entered password
 */
export async function promptPassword(prompt: string = 'Password: ', hidden: boolean = true): Promise<string> {
  // For TTY with hidden input, use raw mode to prevent echo
  if (hidden && process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      // Write prompt to stderr to avoid buffering issues
      process.stderr.write(prompt);

      // Store original raw mode state
      const wasRaw = process.stdin.isRaw;

      // Enable raw mode to capture keystrokes without echoing
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      let password = '';

      const cleanup = () => {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(wasRaw || false);
        process.stdin.pause();
        process.stderr.write('\n');
      };

      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            cleanup();
            resolve(password);
            break;

          case '\u0003': // Ctrl+C
            cleanup();
            reject(new Error('Password entry cancelled'));
            break;

          case '\u007F': // Backspace (macOS/Linux)
          case '\b': // Backspace (Windows)
            if (password.length > 0) {
              password = password.slice(0, -1);
            }
            break;

          default:
            // Only accept printable characters
            if (char.charCodeAt(0) >= 32) {
              password += char;
            }
            break;
        }
      };

      process.stdin.on('data', onData);
    });
  }

  // Non-TTY or non-hidden mode - use readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Prompt for a password with confirmation
 *
 * @param prompt - The prompt message for the first entry
 * @param confirmPrompt - The prompt message for confirmation
 * @returns The confirmed password
 * @throws Error if passwords don't match
 */
export async function promptPasswordWithConfirm(
  prompt: string = 'Password: ',
  confirmPrompt: string = 'Confirm password: '
): Promise<string> {
  const password = await promptPassword(prompt);
  const confirm = await promptPassword(confirmPrompt);

  if (password !== confirm) {
    throw new Error('Passwords do not match');
  }

  return password;
}

/**
 * Prompt for a yes/no confirmation
 *
 * @param prompt - The prompt message to display
 * @returns true if user confirms, false otherwise
 */
export async function promptConfirm(prompt: string): Promise<boolean> {
  const rl = await import('readline');
  const readline = rl.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    readline.question(prompt, (answer) => {
      readline.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}
