import { pbkdf2Sync, randomBytes } from "crypto";

const ALGORITHM = "pbkdf2_sha256";
const ITERATIONS = 310_000;

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This script must be run in an interactive terminal.");
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let value = "";

  return await new Promise((resolve, reject) => {
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    }

    function onData(char) {
      if (char === "\u0003") {
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }

      if (char === "\r" || char === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }

      if (char === "\b" || char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    }

    process.stdin.on("data", onData);
  });
}

const password = await readHidden("Owner password: ");
const confirmation = await readHidden("Confirm password: ");

if (!password || password.length < 12) {
  throw new Error("Use an owner password with at least 12 characters.");
}

if (password !== confirmation) {
  throw new Error("Passwords did not match.");
}

const salt = randomBytes(16).toString("base64url");
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("base64url");

process.stdout.write(`${ALGORITHM}$${ITERATIONS}$${salt}$${hash}\n`);
