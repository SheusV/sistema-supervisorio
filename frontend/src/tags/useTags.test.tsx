import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTags } from "./useTags";
import { frame } from "../test/fixture";
class FakeSocket {
  static sockets: FakeSocket[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    FakeSocket.sockets.push(this);
  }
  close() {
    this.onclose?.();
  }
  sendFrame(sequence: number) {
    this.onmessage?.({ data: JSON.stringify(frame(sequence)) });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeSocket.sockets = [];
});
it("reconnects, accepts reset sequences after restart and rejects stale streams", () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const { result, unmount } = renderHook(useTags);
  act(() => FakeSocket.sockets[0].sendFrame(20));
  expect(result.current.connection).toBe("live");
  act(() => FakeSocket.sockets[0].sendFrame(19));
  expect(result.current.snapshot?.sequence).toBe(20);
  act(() => vi.advanceTimersByTime(6000));
  expect(result.current.connection).not.toBe("live");
  act(() => vi.advanceTimersByTime(1000));
  act(() => FakeSocket.sockets[1].sendFrame(0));
  expect(result.current.connection).toBe("live");
  expect(result.current.snapshot?.sequence).toBe(0);
  unmount();
  const count = FakeSocket.sockets.length;
  act(() => vi.advanceTimersByTime(20000));
  expect(FakeSocket.sockets).toHaveLength(count);
});
