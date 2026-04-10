import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runUpAheadBenchmark } from '../src/debug/benchmarkDebugRunner.js';
import { UPAHEAD_BENCHMARK_THRESHOLDS } from '../benchmarks/upahead/thresholds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read from the new organized path or fallback to original
const BENCHMARKS_DIR = path.join(__dirname, '../benchmarks');
const UPAHEAD_BENCHMARKS_DIR = path.join(__dirname, '../benchmarks/upahead');

function getInputs(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('_input.json') || f.includes('_input_'))
        .map(f => path.join(dir, f));
}

function runAll() {
    let inputFiles = [...getInputs(BENCHMARKS_DIR), ...getInputs(UPAHEAD_BENCHMARKS_DIR)];

    if (inputFiles.length === 0) {
        console.log('No benchmark input files found in benchmarks/ directory.');
        return;
    }

    let globalFailed = false;

    inputFiles.forEach(inputFilePath => {
        const inputFile = path.basename(inputFilePath);
        const dir = path.dirname(inputFilePath);

        console.log(`\n========================================`);
        console.log(`Running benchmark for: ${inputFile}`);
        console.log(`========================================`);

        const rawData = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

        let expectedData = {};
        const expectedFile = inputFile.replace('_input', '_expected').replace('_input_', '_expected_');
        const expectedFileLegacy = inputFile.replace('_input', '_expected_output').replace('_input_', '_expected_output_');

        if (fs.existsSync(path.join(dir, expectedFile))) {
             expectedData = JSON.parse(fs.readFileSync(path.join(dir, expectedFile), 'utf8'));
        } else if (fs.existsSync(path.join(dir, expectedFileLegacy))) {
             expectedData = JSON.parse(fs.readFileSync(path.join(dir, expectedFileLegacy), 'utf8'));
        } else if (fs.existsSync(path.join(dir, inputFile.replace(/_input.*\.json$/, '_expected_output.json')))) {
             expectedData = JSON.parse(fs.readFileSync(path.join(dir, inputFile.replace(/_input.*\.json$/, '_expected_output.json')), 'utf8'));
        }

        const mode = inputFile.includes('online') ? 'online' : 'offline';
        const startTime = Date.now();

        const report = runUpAheadBenchmark(rawData, expectedData, {
            asOfDate: '2024-11-26T00:00:00Z',
            plannerWindowDays: 7,
            mode: mode,
            selectedCities: ['Chennai', 'Muscat', 'Trichy']
        });

        const executionMs = Date.now() - startTime;

        console.log('--- COUNTS ---');
        console.log(report.counts);
        console.log('\n--- METRICS ---');
        console.log(JSON.stringify(report.metrics, null, 2));
        console.log('\n--- DROP REPORT ---');
        console.log(report.dropReport);
        console.log('\n--- PLANNER ITEMS ---');
        console.log(report.plannerItems.map(i => i.title));
        console.log('\n--- UPAHEAD ITEMS ---');
        console.log(report.upAheadItems.map(i => i.title));

        console.log(`\n--- RUNTIME: ${executionMs}ms ---`);

        // Threshold checks
        const thresholds = UPAHEAD_BENCHMARK_THRESHOLDS[mode];
        if (thresholds) {
            const failedThresholds = [];
            const metrics = report.metrics;

            if (metrics.planner) {
                if (thresholds.plannerPrecision && metrics.planner.precision < thresholds.plannerPrecision) failedThresholds.push(`plannerPrecision: ${metrics.planner.precision} < ${thresholds.plannerPrecision}`);
                if (thresholds.plannerRecall && metrics.planner.recall < thresholds.plannerRecall) failedThresholds.push(`plannerRecall: ${metrics.planner.recall} < ${thresholds.plannerRecall}`);
                if (thresholds.plannerF1 && metrics.planner.f1 < thresholds.plannerF1) failedThresholds.push(`plannerF1: ${metrics.planner.f1} < ${thresholds.plannerF1}`);
            }
            if (metrics.upAhead) {
                if (thresholds.upAheadPrecision && metrics.upAhead.precision < thresholds.upAheadPrecision) failedThresholds.push(`upAheadPrecision: ${metrics.upAhead.precision} < ${thresholds.upAheadPrecision}`);
                if (thresholds.upAheadRecall && metrics.upAhead.recall < thresholds.upAheadRecall) failedThresholds.push(`upAheadRecall: ${metrics.upAhead.recall} < ${thresholds.upAheadRecall}`);
            }
            if (thresholds.maxExecutionMs && executionMs > thresholds.maxExecutionMs) {
                failedThresholds.push(`executionTime: ${executionMs}ms > ${thresholds.maxExecutionMs}ms`);
            }

            if (failedThresholds.length > 0) {
                console.error('\n❌ Benchmark thresholds failed:');
                failedThresholds.forEach(f => console.error(`  - ${f}`));
                globalFailed = true;
            } else {
                console.log('\n✅ All thresholds passed.');
            }
        }
    });

    if (globalFailed) {
        process.exitCode = 1;
    }
}

runAll();
