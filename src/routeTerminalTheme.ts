export const ANSI_RESET = "\u001b[0m";
export const ANSI_BLUE = "\u001b[38;5;39m";
export const ANSI_ORANGE = "\u001b[38;5;214m";
export const ANSI_GREEN = "\u001b[38;5;46m";
export const ANSI_WHITE = "\u001b[38;5;15m";

export function colorText(text: string, ansiColor: string): string {
  return `${ansiColor}${text}${ANSI_RESET}`;
}

export function renderTitleLines(writeLine: (text: string) => void): void {
  writeLine(
    colorText(
      " _   _    _    __     ___ ____    _  _____ ___  ____  ",
      ANSI_WHITE,
    ),
  );
  writeLine(
    colorText(
      "| \\ | |  / \\   \\ \\   / / |_ _/ ___|  / \\|_   _/ _ \\|  _ \\ ",
      ANSI_WHITE,
    ),
  );
  writeLine(
    colorText(
      "|  \\| | / _ \\   \\ \\ / /   | | |  _  / _ \\ | || | | | |_) |",
      ANSI_WHITE,
    ),
  );
  writeLine(
    colorText(
      "| |\\\\  |/ ___ \\   \\ V /    | | |_| |/ ___ \\| || |_| |  _ < ",
      ANSI_WHITE,
    ),
  );
  writeLine(
    colorText(
      "|_| \\_/_/   \\_\\   \\_/    |___\\____/_/   \\_\\_| \\___/|_| \\_\\",
      ANSI_WHITE,
    ),
  );
  writeLine("");
}

export function renderInstructionBox(
  writeLine: (text: string) => void,
  messages: string[],
): void {
  const width = Math.max(...messages.map((message) => message.length));
  const horizontal = "-".repeat(width + 2);

  writeLine(`${ANSI_ORANGE}+${horizontal}+${ANSI_RESET}`);

  for (const message of messages) {
    const padding = " ".repeat(width - message.length);
    writeLine(
      `${ANSI_ORANGE}|${ANSI_WHITE} ${message}${padding} ${ANSI_ORANGE}|${ANSI_RESET}`,
    );
  }

  writeLine(`${ANSI_ORANGE}+${horizontal}+${ANSI_RESET}`);
  writeLine("");
}
