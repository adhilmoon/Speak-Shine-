# Implementation Plan: Video Feedback Optimization

## Overview

Incrementally harden the existing `ai/feedback.js` pipeline by adding five orthogonal improvements: progress notifications, deduplication cache, API timeouts, parallel frame extraction (hardened), and feedback message chunking. All changes are confined to the `ai/` directory and small additions to `index.js`.

## Tasks

- [x] 1. Create `ai/pipeline.js` — timeout wrapper and stage logger
  - Implement `withTimeout(promise, ms, label)` that races the given promise against a `setTimeout` rejection; the rejection message must include `label` and the timeout value
  - Implement `startStage(stageName)` that logs `[PIPELINE] <name> START ts=<epoch>` on call and returns `{ end(err?) }` which logs `[PIPELINE] <name> DONE|FAIL elapsed=<ms>` (FAIL + error message when `err` is provided)
  - Export `TRANSCRIBE_TIMEOUT_MS`, `SPEECH_TIMEOUT_MS`, `VISUAL_TIMEOUT_MS` constants (defaults 60 000 / 45 000 / 45 000) that read from `process.env` with numeric fallback
  - _Requirements: 3.1, 3.2, 3.3, 7.1, 7.2, 7.3, 7.4_

  - [ ] 1.1 Write property test for stage logger format (Property 12)
    - **Property 12: Stage logger emits stage name and non-negative elapsed time**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Use `fc.string()` for stage name and `fc.nat()` for start time; capture console output and assert it contains the stage name and a non-negative elapsed value

  - [ ] 1.2 Write unit tests for `withTimeout`
    - Verify it resolves with the promise value when the promise settles before the timeout
    - Verify it rejects with a timeout error when the promise takes longer than `ms`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Create `ai/dedupCache.js` — in-memory deduplication cache
  - Implement `hashBuffer(buffer)` using `crypto.createHash('sha256')` returning a hex digest
  - Implement `markProcessing(hash)`, `storeResult(hash, result)`, `getCacheEntry(hash)`, and `evict(hash)` operating on a module-level `Map`
  - `storeResult` must schedule TTL eviction via `setTimeout` using `CACHE_TTL_MS` (default 300 000, env-overridable)
  - Export `dedupCache` (the Map), `CACHE_TTL_MS`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.1 Write property test for hash consistency (Property 3)
    - **Property 3: Hash consistency**
    - **Validates: Requirements 2.1**
    - Use `fc.uint8Array()` — same buffer hashes identically twice; two buffers with different content produce different hashes

  - [ ]* 2.2 Write property test for dedup cache round-trip (Property 4)
    - **Property 4: Dedup cache round-trip**
    - **Validates: Requirements 2.4**
    - Use `fc.string()` for feedback text and `fc.hexaString({ minLength: 64, maxLength: 64 })` for hash; store then retrieve and assert exact equality

  - [ ]* 2.3 Write unit tests for dedup cache lifecycle
    - Verify `markProcessing` sets state to `'processing'`
    - Verify `storeResult` stores the result string and `getCacheEntry` returns it
    - Verify `evict` removes the entry
    - Verify TTL eviction fires after `CACHE_TTL_MS` using fake timers (`vi.useFakeTimers` or equivalent)
    - _Requirements: 2.2, 2.3, 2.5_

- [ ] 3. Checkpoint — Ensure `pipeline.js` and `dedupCache.js` tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add `chunkMessage` and `sendChunks` helpers to `index.js`
  - Implement `chunkMessage(text, maxLen = 4000)`: split `text` into an array of strings each `≤ maxLen` characters, splitting only at `\n` boundaries; a single line longer than `maxLen` must be emitted as its own chunk
  - Implement `sendChunks(sock, jid, chunks, mentions = [])`: iterate `chunks` in order and call `safeSend` for each
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 4.1 Write property test for chunking content preservation (Property 8)
    - **Property 8: Chunking preserves content**
    - **Validates: Requirements 5.1, 5.3**
    - Use `fc.string()` — `chunks.join('')` must equal the original string exactly

  - [ ]* 4.2 Write property test for chunk size limit (Property 9)
    - **Property 9: All chunks respect the size limit**
    - **Validates: Requirements 5.1, 5.4**
    - Use `fc.string()` and `fc.integer({ min: 1, max: 8000 })` for limit — every chunk must satisfy `chunk.length ≤ limit`

  - [ ]* 4.3 Write property test for newline-boundary splitting (Property 10)
    - **Property 10: Chunks split only at newline boundaries**
    - **Validates: Requirements 5.2**
    - Use `fc.array(fc.string()).map(lines => lines.join('\n'))` — no chunk (except the last or an oversized single line) should end with a non-`\n` character mid-content

  - [ ]* 4.4 Write unit tests for `chunkMessage` edge cases
    - `chunkMessage("")` returns `[""]`
    - String ≤ 4000 chars returns a single-element array
    - String with no newlines longer than limit is emitted as one chunk
    - _Requirements: 5.1, 5.4_

- [x] 5. Harden `analyzeVideo` in `ai/analyzeVideo.js` — parallel frame extraction and null filtering
  - Replace the sequential frame extraction loop (if any) with `Promise.all(timestamps.map(ts => extractFrame(videoPath, ts)))` — already partially done; verify and formalize
  - After `Promise.all`, filter out `null` entries; if the resulting array is empty, log and return `null` from `analyzeVideo`
  - Ensure `extractFrames` always generates exactly 3 timestamps evenly distributed as `Math.max(1, Math.floor((duration * i) / (frameCount + 1)))` for `i = 1..frameCount`
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.1 Write property test for null frame filtering (Property 6)
    - **Property 6: Null frame filtering**
    - **Validates: Requirements 4.2, 4.3**
    - Use `fc.array(fc.option(fc.base64String()))` — the filtered result must contain only non-null entries in their original relative order

  - [ ]* 5.2 Write property test for frame timestamp distribution (Property 7)
    - **Property 7: Frame timestamps are evenly distributed**
    - **Validates: Requirements 4.4**
    - Use `fc.float({ min: 1, max: 3600 })` for duration and `fc.integer({ min: 1, max: 10 })` for N — timestamps must be strictly increasing, all within `[1, D]`, and evenly spaced

- [x] 6. Update `ai/feedback.js` — integrate timeouts, progress callbacks, and partial results
  - Add `opts` parameter: `{ onProgress, transcribeTimeout, speechTimeout, visualTimeout }` with defaults from `ai/pipeline.js` constants
  - Wrap `transcribe(audioPath)` with `withTimeout(transcribe(...), transcribeTimeout, 'transcription')` — on timeout, abort and throw so the caller can send the user an error
  - Wrap `analyzeVideo(videoPath)` with `withTimeout(analyzeVideo(...), visualTimeout, 'visual')` — on timeout, treat as `null` (partial result) and log; do not abort
  - Wrap `analyzeSpeech(...)` with `withTimeout(analyzeSpeech(...), speechTimeout, 'speech')` — on timeout, abort and throw
  - Call `opts.onProgress(stage)` at each pipeline transition: after download, after audio extraction, after parallel analysis starts, after scoring starts
  - Wrap each stage with `startStage` / `.end()` from `ai/pipeline.js`
  - When `visual` is `null` (timeout or extraction failure), append a brief unavailability note to the formatted feedback (e.g. `"_(Visual analysis was unavailable for this submission.)_"`)
  - When both transcription and visual fail, return a message telling the user the video could not be analyzed and to resubmit
  - Ensure `Error.stack` and internal paths are never included in user-facing strings
  - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 6.1 Write property test for visual timeout producing partial result (Property 5)
    - **Property 5: Visual timeout produces partial result with audio sections**
    - **Validates: Requirements 3.5, 6.1**
    - Use `fc.record(...)` matching the `analyzeSpeech` result shape; call `formatFeedback(result, null, user)` and assert the output is non-empty, contains the audio score section, and contains no raw error text

  - [ ]* 6.2 Write property test for null visual feedback including unavailability note (Property 11)
    - **Property 11: Null visual feedback includes unavailability note**
    - **Validates: Requirements 6.2**
    - Use `fc.record(...)` for speech result; assert formatted output contains `"visual analysis"` (case-insensitive) when visual is `null`

  - [ ]* 6.3 Write unit tests for pipeline abort paths
    - Verify pipeline aborts and returns a user-friendly string (no stack trace) when transcription times out
    - Verify pipeline aborts and returns a user-friendly string when speech analysis times out
    - Verify partial result is returned (with unavailability note) when only visual times out
    - Verify total-failure message is returned when both transcription and visual fail
    - _Requirements: 3.4, 3.5, 3.6, 6.3, 6.4_

- [x] 7. Update `index.js` — dedup check, progress message, and chunked send
  - In the video handler, download the raw buffer first (before calling `generateFeedback`) to compute the content hash via `hashBuffer`
  - Check `getCacheEntry(hash)`: if `'processing'`, reply to the user that their video is already being processed and return; if a string, send the cached feedback via `sendChunks` and return
  - Call `markProcessing(hash)` before starting the pipeline
  - Send the initial progress message immediately (within the 2-second window) and capture its `key`
  - Pass an `onProgress` callback to `generateFeedback` that calls `sock.sendMessage(chatId, { edit: progressMsgKey, text: stageText })` to update the progress message
  - After `generateFeedback` resolves, call `storeResult(hash, feedbackText)`, chunk the result with `chunkMessage`, and send via `sendChunks`
  - Delete or replace the progress message with the first chunk (avoid leaving a stale progress message)
  - On pipeline error, replace the progress message with a user-friendly error string (no stack trace); call `evict(hash)` to clear the in-progress entry
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.1 Write property test for error messages never exposing stack traces (Property 2)
    - **Property 2: Error messages never expose stack traces**
    - **Validates: Requirements 1.6**
    - Use `fc.string()` for error message text, construct an `Error`, pass through the sanitization helper; assert output contains no line matching `/ {4}at /` and does not include `Error.stack`

  - [ ]* 7.2 Write property test for stage updates containing the stage label (Property 1)
    - **Property 1: Stage updates reflect the current stage name**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - Use `fc.string()` for stage name; assert the progress message text produced by the `onProgress` callback contains that stage name

  - [ ]* 7.3 Write unit tests for dedup short-circuit paths
    - Verify that when `getCacheEntry` returns `'processing'`, no new pipeline is started and the user receives a "already processing" reply
    - Verify that when `getCacheEntry` returns a cached string, `sendChunks` is called with that string and `generateFeedback` is not called
    - _Requirements: 2.2, 2.4_

- [ ] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The PBT library is **fast-check** (`npm install --save-dev fast-check`)
- Property tests are tagged with `// Feature: video-feedback-optimization, Property <N>: <property_text>`
- Checkpoints ensure incremental validation before wiring the next layer
- All user-facing error strings must be sanitized — `Error.stack` and internal paths must never appear
