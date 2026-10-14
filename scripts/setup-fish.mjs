import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const envPath = path.resolve("apps/web/.env.local");

function askHidden(question) {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		if (!stdin.isTTY) {
			const rl = readline.createInterface({ input: stdin, output: stdout });
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer.trim());
			});
			return;
		}

		stdout.write(question);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		let value = "";
		const onData = (key) => {
			if (key === "\r" || key === "\n") {
				stdin.setRawMode(false);
				stdin.pause();
				stdin.off("data", onData);
				stdout.write("\n");
				resolve(value.trim());
				return;
			}

			if (key === "\u0003") {
				stdin.setRawMode(false);
				stdin.pause();
				stdin.off("data", onData);
				stdout.write("\n");
				process.exit(130);
			}

			if (key === "\u007f") {
				if (value.length > 0) {
					value = value.slice(0, -1);
					stdout.write("\b \b");
				}
				return;
			}

			value += key;
			stdout.write("*");
		};

		stdin.on("data", onData);
	});
}

function upsertEnvValue(source, key, value) {
	const line = `${key}=${value}`;
	const regex = new RegExp(`^${key}=.*$`, "m");
	if (regex.test(source)) {
		return source.replace(regex, line);
	}
	return `${source.replace(/\s*$/, "")}\n${line}\n`;
}

const key = await askHidden("Cole sua NOVA chave Fish Audio: ");

if (!key || !key.startsWith("sk-fish-")) {
	console.error("Chave Fish Audio inválida. Nada foi salvo.");
	process.exit(1);
}

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
env = upsertEnvValue(env, "FISH_API_KEY", key);
env = upsertEnvValue(env, "FISH_TTS_MODEL", "s2.1-pro-free");

fs.mkdirSync(path.dirname(envPath), { recursive: true });
fs.writeFileSync(envPath, env, "utf8");

console.log("Fish Audio configurado em apps/web/.env.local.");
console.log("Agora reinicie o servidor com: bun dev:web");
