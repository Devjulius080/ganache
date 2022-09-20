import { FlavorName } from "@ganache/flavors/typings";
import assert from "assert";
import args, { createFlatChildArgs } from "../src/args";
import { StartArgs } from "../src/types";

describe.only("args", () => {
  describe.only("createFlatChildArgs", () => {
    it("should flatten a simple object", () => {
      const input = {
        a: "value-a",
        b: "value-b"
      } as any as StartArgs<FlavorName>;

      const result = createFlatChildArgs(input);

      assert.deepStrictEqual(result, ["--a=value-a", "--b=value-b"]);
    });

    it("should flatten a namespaced object", () => {
      const input = {
        a: {
          aa: "value-aa"
        },
        b: {
          bb: "value-bb"
        }
      } as any as StartArgs<FlavorName>;

      const result = createFlatChildArgs(input);
      assert.deepStrictEqual(result, ["--a.aa=value-aa", "--b.bb=value-bb"]);
    });
  });

  describe("detach", () => {
    const versionString = "Version string";
    const isDocker = false;

    const detachModeArgs = [
      "--detach",
      "--D",
      "--😈",
      "--detach=true",
      "--D=true",
      "--😈=true"
    ];
    const notDetachModeArgs = [
      "--no-detach",
      "--no-D",
      "--no-😈",
      "--detach=false",
      "--D=false",
      "--😈=false"
    ];

    it("defaults to false when no arg provided", () => {
      const rawArgs = [];
      const options = args(versionString, isDocker, rawArgs);

      assert.strictEqual(
        options.action,
        "start",
        `Expected "options.detach" to be false when no argument is provided`
      );
    });

    detachModeArgs.forEach(arg => {
      it(`is true with ${arg}`, () => {
        const rawArgs = [arg];
        const options = args(versionString, false, rawArgs);

        assert.strictEqual(
          options.action,
          "start-detached",
          `Expected "options.detach" to be true with arg ${arg}`
        );
      });
    });

    notDetachModeArgs.forEach(arg => {
      it(`is false with ${arg}`, () => {
        const rawArgs = [arg];
        const options = args(versionString, false, rawArgs);

        assert.strictEqual(
          options.action,
          "start",
          `Expected "options.detach" to be false with arg ${arg}`
        );
      });
    });
  });
});