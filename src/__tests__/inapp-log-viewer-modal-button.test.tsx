import { describe, expect, it } from "@jest/globals";

import {
  resolveModalButtonPresetStyle,
  shouldUseFloatingTriggerContainer,
} from "../components/InAppLogViewerModalButton";

describe("InAppLogViewerModalButton preset style resolver", () => {
  it("returns right-bottom placement by default preset", () => {
    const presetStyle = resolveModalButtonPresetStyle("right-bottom");

    expect(presetStyle.right).toBe(0);
    expect(presetStyle.bottom).toBe(20);
  });

  it("returns right-center placement with upward translate", () => {
    const presetStyle = resolveModalButtonPresetStyle("right-center");

    expect(presetStyle.right).toBe(0);
    expect(presetStyle.top).toBe("50%");
    expect(presetStyle.transform).toEqual([{ translateY: -25 }]);
  });

  it("returns left variants when preset is left-*", () => {
    const leftBottomPresetStyle = resolveModalButtonPresetStyle("left-bottom");
    const leftCenterPresetStyle = resolveModalButtonPresetStyle("left-center");

    expect(leftBottomPresetStyle.left).toBe(0);
    expect(leftBottomPresetStyle.bottom).toBe(20);
    expect(leftCenterPresetStyle.left).toBe(0);
    expect(leftCenterPresetStyle.top).toBe("50%");
  });

  it("does not require floating wrapper when custom trigger has no preset/style override", () => {
    const shouldRenderContainer = shouldUseFloatingTriggerContainer({
      hasCustomTrigger: true,
      hasPositionPreset: false,
      hasTriggerContainerStyle: false,
    });

    expect(shouldRenderContainer).toBe(false);
  });

  it("uses floating wrapper with default trigger or explicit override inputs", () => {
    const withDefaultTrigger = shouldUseFloatingTriggerContainer({
      hasCustomTrigger: false,
      hasPositionPreset: false,
      hasTriggerContainerStyle: false,
    });
    const withPreset = shouldUseFloatingTriggerContainer({
      hasCustomTrigger: true,
      hasPositionPreset: true,
      hasTriggerContainerStyle: false,
    });
    const withContainerStyle = shouldUseFloatingTriggerContainer({
      hasCustomTrigger: true,
      hasPositionPreset: false,
      hasTriggerContainerStyle: true,
    });

    expect(withDefaultTrigger).toBe(true);
    expect(withPreset).toBe(true);
    expect(withContainerStyle).toBe(true);
  });
});
