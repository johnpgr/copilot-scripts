export function log(message: string, level: "info" | "error" = "info") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]: ${message}`);
}
