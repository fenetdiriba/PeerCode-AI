/**
 * @param {import('ws').WebSocket} ws
 * @param {unknown} message
 */
export function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
