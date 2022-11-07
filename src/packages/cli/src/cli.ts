#!/usr/bin/env node

import type Readline from "readline";
import Ganache, { ServerStatus } from "@ganache/core";
import { parseArgs } from "./args";
import EthereumFlavor from "@ganache/ethereum";
import type { EthereumProvider } from "@ganache/ethereum";
import { CliOptionsConfig, load } from "@ganache/flavor";

const logAndForceExit = (messages: any[], exitCode = 0) => {
  // https://nodejs.org/api/process.html#process_process_exit_code
  // writes to process.stdout in Node.js are sometimes asynchronous and may occur over
  // multiple ticks of the Node.js event loop. Calling process.exit(), however, forces
  // the process to exit before those additional writes to stdout can be performed.
  // se we set stdout to block in order to successfully log before exiting
  if ((process.stdout as any)._handle) {
    (process.stdout as any)._handle.setBlocking(true);
  }
  try {
    messages.forEach(message => console.log(message));
  } catch (e) {
    console.log(e);
  }

  // force the process to exit
  process.exit(exitCode);
};

const version = process.env.VERSION || "DEV";
const cliVersion = process.env.CLI_VERSION || "DEV";
const coreVersion = process.env.CORE_VERSION || "DEV";

const detailedVersion = `ganache v${version} (@ganache/cli: ${cliVersion}, @ganache/core: ${coreVersion})`;

const argv = parseArgs(detailedVersion);

let flavor = argv.flavor;

// TODO: we need a way of applying the default overrides from the _flavor_, if
// there is one
const { server: cliSettings } = CliOptionsConfig.normalize(argv);

console.log(detailedVersion);

let server: ReturnType<typeof Ganache.server>;
try {
  server = Ganache.server(argv);
} catch (error: any) {
  console.error(error.message);
  process.exit(1);
}

let started = false;
process.on("uncaughtException", function (e) {
  if (started) {
    logAndForceExit([e], 1);
  } else {
    logAndForceExit([e.stack], 1);
  }
});

let receivedShutdownSignal: boolean = false;
const handleSignal = async (signal: NodeJS.Signals) => {
  console.log(`\nReceived shutdown signal: ${signal}`);
  closeHandler();
};
const closeHandler = async () => {
  try {
    // graceful shutdown
    switch (server.status) {
      case ServerStatus.opening:
        receivedShutdownSignal = true;
        console.log("Server is currently starting; waiting…");
        return;
      case ServerStatus.open:
        console.log("Shutting down…");
        await server.close();
        console.log("Server has been shut down");
        break;
    }
    // don't just call `process.exit()` here, as we don't want to hide shutdown
    // errors behind a forced shutdown. Note: `process.exitCode` doesn't do
    // anything other than act as a place to anchor this comment :-)
    process.exitCode = 0;
  } catch (err: any) {
    logAndForceExit(
      [
        "\nReceived an error while attempting to shut down the server: ",
        err.stack || err
      ],
      1
    );
  }
};

// See http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js
if (process.platform === "win32") {
  const rl = (require("readline") as typeof Readline)
    .createInterface({
      input: process.stdin,
      output: process.stdout
    })
    .on("SIGINT", () => {
      // we must "close" the RL interface otherwise the process will think we
      // are still listening
      // https://nodejs.org/api/readline.html#readline_event_sigint
      rl.close();
      handleSignal("SIGINT");
    });
}

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);
process.on("SIGHUP", handleSignal);

async function startGanache(err: Error) {
  if (err) {
    console.log(err);
    process.exitCode = 1;
    return;
  } else if (receivedShutdownSignal) {
    closeHandler();
    return;
  }
  started = true;

  if (flavor === "ethereum") {
    EthereumFlavor.initialize(server.provider as EthereumProvider, cliSettings);
  } else {
    await load(flavor).initialize(server.provider, cliSettings);
  }
}
console.log("Starting RPC server");
server.listen(cliSettings.port, cliSettings.host, startGanache);
