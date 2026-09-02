const clients = new Set();

export function registerClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

export function clientCount() {
  return clients.size;
}

// Test-only: SSE clients are process-global state, so tests must reset it
// between cases instead of re-importing the module.
export function _resetForTests() {
  clients.clear();
}
