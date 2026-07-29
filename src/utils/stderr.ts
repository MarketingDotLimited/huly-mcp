export const writeStderrLine = (message: string): void => {
  process.stderr.write(message.replace(/\n?$/, "\n"))
}
