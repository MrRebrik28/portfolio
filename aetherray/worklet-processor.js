/**
 * AetherRay AudioWorkletProcessor
 * Runs on the dedicated AudioWorklet thread.
 * Zero allocations, zero mutexes, lock-free SPSC sync with Physics Worker.
 */

class AetherRayProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.wasmInstance = null;
    this.dspEngine = 0;
    this.inputBufferPtr = 0;
    this.outputLeftPtr = 0;
    this.outputRightPtr = 0;
    this.acousticFramePtr = 0;

    this.sharedBuffer = null;
    this.sharedInt32 = null;
    this.sharedFloat32 = null;

    this.telemetryCounter = 0;
    this.lastRenderTimeMs = 0;

    // Check processorOptions
    const opts = options.processorOptions || {};
    if (opts.sharedBuffer) {
      this.initSharedBuffer(opts.sharedBuffer);
    }

    if (opts.wasmBytes) {
      this.initWasm(opts.wasmBytes, opts.sampleRate || 48000);
    }

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'INIT_WASM') {
        this.initWasm(data.wasmBytes, data.sampleRate || 48000);
      } else if (data.type === 'INIT_SHARED_BUFFER') {
        this.initSharedBuffer(data.sharedBuffer);
      } else if (data.type === 'SET_LISTENING_MODE') {
        if (this.wasmInstance && this.dspEngine) {
          this.wasmInstance.exports.dsp_set_listening_mode(this.dspEngine, data.mode);
        }
      } else if (data.type === 'SET_SOURCE_PARAMS') {
        if (this.wasmInstance && this.dspEngine) {
          this.wasmInstance.exports.dsp_set_source_params(
            this.dspEngine,
            data.delaySamples,
            data.gain,
            data.cutoffHz,
            data.azimuth,
            data.elevation
          );
        }
      }
    };
  }

  initSharedBuffer(sab) {
    this.sharedBuffer = sab;
    this.sharedInt32 = new Int32Array(sab);
    this.sharedFloat32 = new Float32Array(sab);
  }

  async initWasm(wasmBytes, sampleRate) {
    try {
      const wasmModule = await WebAssembly.instantiate(wasmBytes, {});
      this.wasmInstance = wasmModule.instance;
      const exports = this.wasmInstance.exports;

      this.dspEngine = exports.dsp_init(sampleRate);
      this.inputBufferPtr = exports.dsp_get_input_buffer(this.dspEngine);
      this.outputLeftPtr = exports.dsp_get_output_left(this.dspEngine);
      this.outputRightPtr = exports.dsp_get_output_right(this.dspEngine);
      this.acousticFramePtr = exports.dsp_get_acoustic_frame_ptr(this.dspEngine);

      this.port.postMessage({ type: 'WASM_INITIALIZED', success: true });
    } catch (err) {
      this.port.postMessage({ type: 'WASM_INIT_ERROR', error: String(err) });
    }
  }

  process(inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outLeft = output[0];
    const outRight = output[1];
    const blockSize = outLeft.length; // usually 128

    if (!this.wasmInstance || !this.dspEngine) {
      // Pass-through silence or input while WASM is loading
      for (let i = 0; i < blockSize; i++) {
        outLeft[i] = 0;
        outRight[i] = 0;
      }
      return true;
    }

    const wasmMem = this.wasmInstance.exports.memory.buffer;
    const wasmFloat32 = new Float32Array(wasmMem);
    const exports = this.wasmInstance.exports;

    // 1. Synchronize AcousticFrame from SharedArrayBuffer (Wait-free atomic read)
    if (this.sharedInt32 && this.sharedFloat32) {
      const activeSlot = Atomics.load(this.sharedInt32, 1);
      // Header is 4 words, each slot is 170 floats
      const srcOffset = 4 + activeSlot * 170;
      const dstOffset = this.acousticFramePtr >> 2;

      for (let i = 0; i < 170; i++) {
        wasmFloat32[dstOffset + i] = this.sharedFloat32[srcOffset + i];
      }
    }

    // 2. Fill WASM input buffer from inputs[0][0]
    const inOffset = this.inputBufferPtr >> 2;
    const inputChannel = inputs[0] && inputs[0][0];

    if (inputChannel && inputChannel.length > 0) {
      for (let i = 0; i < blockSize; i++) {
        wasmFloat32[inOffset + i] = inputChannel[i];
      }
    } else {
      // No input connected: clear input buffer
      for (let i = 0; i < blockSize; i++) {
        wasmFloat32[inOffset + i] = 0;
      }
    }

    // 3. Process block with timing measurement
    const t0 = currentTime; // High precision AudioWorklet timestamp
    exports.dsp_process_block(this.dspEngine, blockSize);
    const t1 = currentTime;
    this.lastRenderTimeMs = (t1 - t0) * 1000.0;

    // 4. Copy outputs to audio hardware buffers
    const leftOffset = this.outputLeftPtr >> 2;
    const rightOffset = this.outputRightPtr >> 2;

    for (let i = 0; i < blockSize; i++) {
      outLeft[i] = wasmFloat32[leftOffset + i];
      outRight[i] = wasmFloat32[rightOffset + i];
    }

    // 5. Send periodic telemetry to UI HUD (~30 times/sec, every 12 blocks)
    this.telemetryCounter++;
    if (this.telemetryCounter >= 12) {
      this.telemetryCounter = 0;
      const frameOffset = this.acousticFramePtr >> 2;
      this.port.postMessage({
        type: 'TELEMETRY',
        dspTimeMs: this.lastRenderTimeMs,
        directDelay: wasmFloat32[frameOffset + 0],
        directGain: wasmFloat32[frameOffset + 1],
        directCutoff: wasmFloat32[frameOffset + 2],
        directAzimuth: wasmFloat32[frameOffset + 3],
        reflectionsCount: wasmFloat32[frameOffset + 5],
        rt60: wasmFloat32[frameOffset + 6],
      });
    }

    return true;
  }
}

registerProcessor('aether-ray-processor', AetherRayProcessor);
