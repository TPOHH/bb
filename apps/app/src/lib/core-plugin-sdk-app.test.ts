// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import * as corePluginSdkApp from "./core-plugin-sdk-app";
import * as lazyCorePluginSdkApp from "./core-plugin-sdk-app-lazy";
import { pluginSdkAppImplementation } from "./plugin-sdk-app-impl";

describe("core plugin SDK bindings", () => {
  it.each([
    ["eager", corePluginSdkApp],
    ["lazy", lazyCorePluginSdkApp],
  ])(
    "binds core's %s modules to the same members plugins reach through the runtime",
    (_kind, binding) => {
      const runtimeMembers = new Map<string, unknown>(
        Object.entries(pluginSdkAppImplementation),
      );
      for (const [name, member] of Object.entries(binding)) {
        expect(runtimeMembers.get(name), name).toBe(member);
      }
    },
  );
});
