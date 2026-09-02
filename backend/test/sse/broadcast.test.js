import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { registerClient, broadcast, clientCount, _resetForTests } from "../../src/sse/broadcast.js";

function makeFakeResponse() {
  const res = new EventEmitter();
  res.written = [];
  res.write = (chunk) => res.written.push(chunk);
  return res;
}

beforeEach(() => {
  _resetForTests();
});

describe("SSE broadcast", () => {
  it("registers a client and delivers a broadcast event to it as an SSE frame", () => {
    const res = makeFakeResponse();
    registerClient(res);
    expect(clientCount()).toBe(1);

    broadcast({ type: "meal_logged", meal: { id: "1" } });

    expect(res.written).toHaveLength(1);
    expect(res.written[0]).toBe('data: {"type":"meal_logged","meal":{"id":"1"}}\n\n');
  });

  it("removes a client on close so it stops receiving events", () => {
    const res = makeFakeResponse();
    registerClient(res);
    res.emit("close");
    expect(clientCount()).toBe(0);

    broadcast({ type: "meal_deleted", meal: { id: "1" } });
    expect(res.written).toHaveLength(0);
  });

  it("broadcasts to every registered client", () => {
    const res1 = makeFakeResponse();
    const res2 = makeFakeResponse();
    registerClient(res1);
    registerClient(res2);

    broadcast({ type: "meal_updated", meal: { id: "2" } });

    expect(res1.written).toHaveLength(1);
    expect(res2.written).toHaveLength(1);
  });
});
