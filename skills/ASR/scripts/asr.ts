import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

function resolveSafePath(userPath: string, baseDir: string = process.cwd()): string {
	const resolvedBase = path.resolve(baseDir);
	const resolved = path.resolve(resolvedBase, userPath);
	const relative = path.relative(resolvedBase, resolved);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`Path is outside the allowed directory: ${userPath}`);
	}
	return resolved;
}

async function main(inputFile: string) {
	let safeInputFile: string;
	try {
		safeInputFile = resolveSafePath(inputFile);
	} catch (err: any) {
		console.error(err?.message || err);
		return;
	}

	if (!fs.existsSync(safeInputFile)) {
		console.error(`Audio file not found: ${inputFile}`);
        return;
	}

	try {
		const zai = await ZAI.create();

		const audioBuffer = fs.readFileSync(safeInputFile);
		const file_base64 = audioBuffer.toString('base64');

		const result = await zai.audio.asr.create({ file_base64 });

		console.log('Transcription result:');
		console.log(result.text ?? JSON.stringify(result, null, 2));
	} catch (err: any) {
		console.error('ASR failed:', err?.message || err);
	}
}

main('./output.wav');

