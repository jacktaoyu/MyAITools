import { Worker } from "node:worker_threads"
import { BM25_B, BM25_K1, STOP_WORDS } from "./BmsAutosarRetrievalConstants"

const workerCode = `
const STOP_WORDS = new Set(${JSON.stringify([...STOP_WORDS])});
const BM25_K1 = ${BM25_K1};
const BM25_B = ${BM25_B};

function tokenize(text) {
	return text
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function computeBm25Index(texts) {
	const docs = texts.map(tokenize);
	const vocabulary = Array.from(new Set(docs.flat()));
	const numDocs = docs.length;
	const docLengths = docs.map((tokens) => tokens.length);
	const totalTerms = docLengths.reduce((sum, len) => sum + len, 0);
	const avgdl = numDocs === 0 ? 0 : totalTerms / numDocs;

	const idf = vocabulary.map((term) => {
		const docsWithTerm = docs.filter((tokens) => tokens.includes(term)).length;
		return Math.log((numDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
	});

	const termFrequencies = docs.map((tokens) => {
		const freq = new Map();
		tokens.forEach((token) => {
			freq.set(token, (freq.get(token) ?? 0) + 1);
		});
		return vocabulary.map((term) => freq.get(term) ?? 0);
	});

	return { vocabulary, idf, termFrequencies, docLengths, avgdl, numDocs };
}

function computeBm25Scores(index, query) {
	const queryTokens = tokenize(query);
	const tokenCounts = new Map();
	queryTokens.forEach((token) => {
		tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
	});

	const scores = new Array(index.numDocs).fill(0);
	for (const [token, count] of tokenCounts.entries()) {
		const termIndex = index.vocabulary.indexOf(token);
		if (termIndex === -1) {
			continue;
		}
		const idf = index.idf[termIndex];
		for (let docIndex = 0; docIndex < index.numDocs; docIndex++) {
			const tf = index.termFrequencies[docIndex][termIndex];
			if (tf === 0) {
				continue;
			}
			const docLen = index.docLengths[docIndex];
			const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / index.avgdl));
			scores[docIndex] += idf * ((tf * (BM25_K1 + 1)) / denom) * count;
		}
	}
	return scores;
}

const { parentPort } = require("worker_threads");
parentPort.once("message", ({ texts, query }) => {
	const index = computeBm25Index(texts);
	const response = { index };
	if (query) {
		response.scores = computeBm25Scores(index, query);
	}
	parentPort.postMessage(response);
});
`;

export interface Bm25Index {
	vocabulary: string[]
	idf: number[]
	termFrequencies: number[][]
	docLengths: number[]
	avgdl: number
	numDocs: number
}

interface Bm25WorkerResult {
	index: Bm25Index
	scores?: number[]
}

/**
 * Computes a BM25 lexical index off the main thread.
 *
 * Useful when the knowledge base is large enough that building the vocabulary
 * and term frequency matrix would otherwise block the extension host event loop.
 */
export function computeBm25IndexInWorker(texts: string[]): Promise<Bm25Index> {
	return runWorker<Bm25WorkerResult>(texts, undefined).then(({ index }) => index)
}

/**
 * Computes BM25 relevance scores off the main thread.
 */
export function computeBm25ScoresInWorker(texts: string[], query: string): Promise<number[]> {
	return runWorker<Bm25WorkerResult>(texts, query).then((result) => result.scores ?? [])
}

function runWorker<T>(texts: string[], query: string | undefined): Promise<T> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(workerCode, { eval: true })
		let settled = false

		const cleanup = () => {
			settled = true
			worker.terminate().catch(() => {})
		}

		worker.on("message", (message: T) => {
			if (!settled) {
				cleanup()
				resolve(message)
			}
		})

		worker.on("error", (error) => {
			if (!settled) {
				cleanup()
				reject(error)
			}
		})

		worker.on("messageerror", (error) => {
			if (!settled) {
				cleanup()
				reject(error)
			}
		})

		worker.on("exit", (code) => {
			if (!settled) {
				cleanup()
				reject(new Error(`BMS AUTOSAR retrieval worker exited unexpectedly (code ${code})`))
			}
		})

		worker.postMessage({ texts, query })
	})
}
