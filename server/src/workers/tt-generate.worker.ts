import { parentPort, workerData } from 'worker_threads';
import { generate } from '../timetable-core';
import type { Model } from '../timetable-core';

/**
 * Runs the generator off the main thread. The main thread can't message us while generate()
 * is busy, so cancellation goes through a shared memory flag instead.
 */
const { model, timeLimitMs, seed, stopFlag } = workerData as {
	model: Model;
	timeLimitMs: number;
	seed?: number;
	stopFlag: SharedArrayBuffer;
};

const stop = new Int32Array(stopFlag);

try {
	const result = generate(model, {
		timeLimitMs,
		...(seed !== undefined ? { seed } : {}),
		onProgress: (p) => parentPort?.postMessage({ type: 'progress', progress: p }),
		shouldStop: () => Atomics.load(stop, 0) === 1
	});
	parentPort?.postMessage({ type: 'done', result });
} catch (err) {
	parentPort?.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
}
