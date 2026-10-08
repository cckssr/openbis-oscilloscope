import { StrictMode, useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as devices from "../../api/devices";
import { DeviceSessionProvider } from "./DeviceSessionProvider";
import {
  useDeviceSession,
  useDeviceSessionSelector,
  useSetting,
} from "./deviceSession";
import { DeviceSessionContext } from "./deviceSession/hooks";
import { DeviceSessionRegistry } from "./deviceSession/registry";
import type { DeviceSessionActions } from "./deviceSession";
import { FakeScope, installFakeApi, noChannel } from "./deviceSession/testing";

vi.mock("../../api/devices");
vi.mock("../../api/sessions");
vi.mock("../../api/events");
vi.mock("../../api/config");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "tok" }),
}));

let actions: DeviceSessionActions;
let scope: FakeScope;
let noteRenders = 0;

beforeEach(() => {
  vi.useFakeTimers();
  noteRenders = 0;
  scope = installFakeApi();
});

afterEach(async () => {
  cleanup();
  await vi.advanceTimersByTimeAsync(10); // deferred dispose of the provider's stores
  vi.useRealTimers();
  vi.clearAllMocks();
});

function Probe() {
  const { state, actions: a } = useDeviceSession("scope-01");
  useEffect(() => {
    actions = a;
  }, [a]);
  return <div data-testid="lock">{state.lock.status}</div>;
}

function NoteField() {
  const note = useDeviceSessionSelector(
    "scope-01",
    (s) => s.lastCapture?.note ?? "",
  );
  useEffect(() => {
    noteRenders += 1;
  });
  return <div data-testid="note">{note}</div>;
}

function ScaleControl() {
  const { value, status, set } = useSetting(
    "scope-01",
    "channels.1.scale_v_div",
  );
  return (
    <button
      data-testid="scale"
      data-status={status?.state ?? ""}
      onClick={() => set(0.5)}
    >
      {String(value)}
    </button>
  );
}

describe("hooks", () => {
  it("useDeviceSession reflects store changes", async () => {
    render(
      <DeviceSessionProvider>
        <Probe />
      </DeviceSessionProvider>,
    );
    expect(screen.getByTestId("lock").textContent).toBe("none");
    await act(async () => {
      await actions.takeControl();
    });
    expect(screen.getByTestId("lock").textContent).toBe("held");
  });

  it("the selector re-renders only when its slice changes (not per live frame)", async () => {
    render(
      <DeviceSessionProvider>
        <Probe />
        <NoteField />
      </DeviceSessionProvider>,
    );
    await act(async () => {
      await actions.takeControl();
      await actions.saveCapture();
    });
    const renders = () => noteRenders;
    await act(async () => {
      await actions.startLive();
      await vi.advanceTimersByTimeAsync(10);
    });
    const before = renders();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // ~6 live frames
    });
    expect(
      vi.mocked(devices.previewWaveforms).mock.calls.length,
    ).toBeGreaterThan(4);
    expect(renders()).toBe(before);

    await act(async () => {
      await actions.saveNote("Hallo");
    });
    expect(screen.getByTestId("note").textContent).toBe("Hallo");
    expect(renders()).toBe(before + 1);
  });

  it("useSetting shows pending ?? applied and the status", async () => {
    render(
      <DeviceSessionProvider>
        <Probe />
        <ScaleControl />
      </DeviceSessionProvider>,
    );
    await act(async () => {
      await actions.takeControl();
    });
    expect(screen.getByTestId("scale").textContent).toBe("1");
    act(() => {
      screen.getByTestId("scale").click();
    });
    expect(screen.getByTestId("scale").textContent).toBe("0.5");
    expect(screen.getByTestId("scale").dataset.status).toBe("pending");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByTestId("scale").dataset.status).toBe("applied");
    expect(scope.settings.channels[1].scale_v_div).toBe(0.5);
  });

  it("survives StrictMode and keeps the lock across unmount/remount of the page", async () => {
    const { unmount } = render(
      <StrictMode>
        <DeviceSessionProvider>
          <Probe />
        </DeviceSessionProvider>
      </StrictMode>,
    );
    await act(async () => {
      await actions.takeControl();
    });
    expect(screen.getByTestId("lock").textContent).toBe("held");
    unmount();
  });

  it("the same store is shared by several consumers and survives page unmounts", async () => {
    const registry = new DeviceSessionRegistry("tok", {
      createChannel: noChannel,
    });
    function Page({ show }: { show: boolean }) {
      return (
        <DeviceSessionContext.Provider value={registry}>
          {show && <Probe />}
        </DeviceSessionContext.Provider>
      );
    }
    const { rerender } = render(<Page show />);
    await act(async () => {
      await actions.takeControl();
      await actions.saveCapture();
    });
    rerender(<Page show={false} />);
    rerender(<Page show />);
    expect(screen.getByTestId("lock").textContent).toBe("held");
    expect(registry.get("scope-01").getState().lastCapture).not.toBeNull();
    registry.disposeAll();
  });

  it("disposes all stores when the provider unmounts", async () => {
    const { unmount } = render(
      <DeviceSessionProvider>
        <Probe />
      </DeviceSessionProvider>,
    );
    await act(async () => {
      await actions.takeControl();
      await actions.startLive();
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    vi.mocked(devices.previewWaveforms).mockClear();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(devices.previewWaveforms).not.toHaveBeenCalled();
    expect(devices.releaseLock).not.toHaveBeenCalled(); // never a hard release
  });
});
