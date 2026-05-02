// Must be imported FIRST in main.ts — sets thread limits before any
// module triggers native addon initialization.
// Defaults of "all cores" for ONNX / libuv / LanceDB starve the Electron
// main-process event loop, causing 22–62 s unresponsive periods observed
// via the lag monitor.
process.env.ORT_INTRA_OP_NUM_THREADS = process.env.ORT_INTRA_OP_NUM_THREADS || '1'
process.env.ORT_INTER_OP_NUM_THREADS = process.env.ORT_INTER_OP_NUM_THREADS || '1'
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2'
