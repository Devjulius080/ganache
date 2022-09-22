import assert from "assert";
import args, { createFlatChildArgs, expandArgs } from "../src/args";

describe("args", () => {
  describe("createFlatChildArgs()", () => {
    it("should flatten a simple object", () => {
      const input = {
        a: "value-a",
        b: "value-b"
      };

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
      };

      const result = createFlatChildArgs(input);
      assert.deepStrictEqual(result, ["--a.aa=value-aa", "--b.bb=value-bb"]);
    });
  });

  describe("expandArgs()", () => {
    it("should expand arguments with namespaces", () => {
      const input = {
        "namespace.name": "value",
        "namespace.name2": "value2",
        "namespace2.name": "namespace2"
      };

      const result = expandArgs(input);

      assert.deepStrictEqual(result, {
        namespace: {
          name: "value",
          name2: "value2"
        },
        namespace2: {
          name: "namespace2"
        }
      });
    });

    it("should remove arguments without namespaces", () => {
      const input = {
        "namespace.name": "value",
        name: "no namespace"
      };

      const result = expandArgs(input);

      assert.deepStrictEqual(result, {
        namespace: {
          name: "value"
        }
      });
    });

    it("should remove arguments who are kebab-cased", () => {
      const input = {
        "namespace.name": "value",
        "namespace.kebab-case": "value",
        "kebab-namespace.name": "value"
      };

      const result = expandArgs(input);

      assert.deepStrictEqual(result, {
        namespace: { name: "value" }
      });
    });
  });

  describe("parse args", () => {
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
});
