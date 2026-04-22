# Requirements Document

## Introduction

The video feedback pipeline in the WhatsApp speaking-English bot currently processes user-submitted videos through a sequential chain: download → extract audio → transcribe + visual analysis (parallel) → speech analysis → format → send. The full pipeline can take 30–90 seconds with no user-visible progress, no protection against duplicate submissions, no timeout safety net, and a feedback message that can exceed WhatsApp's practical message length. This feature optimizes the pipeline for perceived and actual performance, reliability, and user experience.

## Glossary

- **Pipeline**: The ordered sequence of steps that transforms a raw WhatsApp video into a formatted feedback message.
- **Bot**: The WhatsApp bot built on Baileys that manages the speaking-English group.
- **User**: A WhatsApp group member who submits a speaking video.
- **Progress_Message**: A WhatsApp message sent to the group while the pipeline is running, informing the user that their video is being processed.
- **Status_Update**: An edit or replacement of the Progress_Message to reflect the current pipeline stage.
- **Deduplication_Cache**: An in-memory store that maps a video's content hash to its in-progress or completed feedback result, preventing duplicate processing.
- **Chunk**: A sub-string of the full feedback message that fits within WhatsApp's practical per-message character limit.
- **Timeout**: A maximum wall-clock duration after which a pending API call is considered failed and a fallback path is taken.
- **Partial_Result**: A feedback message constructed from whichever pipeline stages succeeded when one or more optional stages timed out or errored.
- **Frame**: A single JPEG image extracted from the video at a specific timestamp for visual analysis.
- **Groq_API**: The external API used for Whisper transcription and Llama speech/visual analysis.
- **Gemini_API**: An alternative external vision API (currently unused but referenced in legacy comments).

---

## Requirements

### Requirement 1: Progress Notifications

**User Story:** As a group member, I want to receive an immediate acknowledgement when I submit a video, so that I know the bot received it and is working on my feedback.

#### Acceptance Criteria

1. WHEN a video message is received by the Bot, THE Bot SHALL send a Progress_Message to the group within 2 seconds of receiving the video, before any processing begins.
2. WHEN the pipeline advances to the audio extraction stage, THE Bot SHALL update the Progress_Message to indicate that audio is being extracted.
3. WHEN the pipeline advances to the transcription and visual analysis stage, THE Bot SHALL update the Progress_Message to indicate that analysis is in progress.
4. WHEN the pipeline advances to the speech scoring stage, THE Bot SHALL update the Progress_Message to indicate that scoring is in progress.
5. WHEN the pipeline completes successfully, THE Bot SHALL delete or replace the Progress_Message with the final feedback message.
6. IF the pipeline fails with an unrecoverable error, THEN THE Bot SHALL replace the Progress_Message with a user-friendly error message that does not expose internal stack traces.

---

### Requirement 2: Duplicate Video Deduplication

**User Story:** As a bot operator, I want the bot to skip reprocessing a video that is already being processed or was recently processed, so that API costs and processing time are not wasted on identical submissions.

#### Acceptance Criteria

1. WHEN a video is received, THE Deduplication_Cache SHALL compute a hash of the video's media key or file content within 500ms.
2. WHILE a video with a given hash is being processed, THE Bot SHALL not start a second pipeline run for the same hash and SHALL notify the User that their video is already being processed.
3. WHEN a pipeline run completes for a given hash, THE Deduplication_Cache SHALL retain the result for 300 seconds.
4. WHEN a video with a hash matching a cached result is received within the retention window, THE Bot SHALL return the cached feedback result without re-running the pipeline.
5. WHEN the retention window for a cached result expires, THE Deduplication_Cache SHALL remove the entry.

---

### Requirement 3: API Timeout Handling

**User Story:** As a bot operator, I want every external API call to have a maximum wait time, so that a slow or unresponsive API does not stall the pipeline indefinitely.

#### Acceptance Criteria

1. THE Bot SHALL apply a configurable timeout to the Groq Whisper transcription call, with a default of 60 seconds.
2. THE Bot SHALL apply a configurable timeout to the Groq Llama speech analysis call, with a default of 45 seconds.
3. THE Bot SHALL apply a configurable timeout to the Groq Vision visual analysis call, with a default of 45 seconds.
4. IF the transcription call exceeds its timeout, THEN THE Bot SHALL throw a timeout error and abort the pipeline, sending the User a message indicating the transcription service is unavailable.
5. IF the visual analysis call exceeds its timeout, THEN THE Bot SHALL log the timeout, skip the visual section of the feedback, and continue the pipeline with a Partial_Result.
6. IF the speech analysis call exceeds its timeout, THEN THE Bot SHALL throw a timeout error and abort the pipeline, sending the User a message indicating the scoring service is unavailable.

---

### Requirement 4: Parallel Frame Extraction

**User Story:** As a developer, I want video frames to be extracted concurrently rather than sequentially, so that the visual analysis stage completes faster.

#### Acceptance Criteria

1. WHEN frame extraction is requested for N timestamps, THE Bot SHALL spawn all N ffmpeg frame-extraction processes concurrently using Promise.all.
2. WHEN all frame extraction processes complete, THE Bot SHALL collect only the frames that succeeded and discard null results.
3. IF all frame extraction processes fail, THEN THE Bot SHALL skip visual analysis and return null from the analyzeVideo function.
4. THE Bot SHALL extract exactly 3 frames per video by default, at evenly distributed timestamps across the video duration.

---

### Requirement 5: Feedback Message Chunking

**User Story:** As a group member, I want to receive the full feedback even when it is long, so that no part of my evaluation is silently cut off by WhatsApp.

#### Acceptance Criteria

1. WHEN the formatted feedback message exceeds 4000 characters, THE Bot SHALL split the message into Chunks of at most 4000 characters each.
2. WHEN splitting into Chunks, THE Bot SHALL split only at newline boundaries so that no line is broken mid-sentence.
3. WHEN sending multiple Chunks, THE Bot SHALL send each Chunk as a separate WhatsApp message in the same chat, in order.
4. WHEN the formatted feedback message is 4000 characters or fewer, THE Bot SHALL send it as a single message without splitting.

---

### Requirement 6: Graceful Partial Results

**User Story:** As a group member, I want to receive whatever feedback the bot could generate even if one analysis stage fails, so that I still get useful information from a successful partial run.

#### Acceptance Criteria

1. WHEN the visual analysis stage fails or times out, THE Bot SHALL include all audio-based feedback sections in the response and SHALL omit the visual sections without displaying an error to the User.
2. WHEN the visual analysis stage fails or times out, THE Bot SHALL append a brief note to the feedback message indicating that visual analysis was unavailable.
3. WHEN the transcription stage succeeds but the speech analysis stage fails, THE Bot SHALL send the User a message that includes the raw transcript and a note that scoring was unavailable.
4. IF both the transcription stage and the visual analysis stage fail, THEN THE Bot SHALL send the User a message stating that the video could not be analyzed and suggesting they resubmit.

---

### Requirement 7: Pipeline Observability

**User Story:** As a developer, I want structured timing logs for each pipeline stage, so that I can identify bottlenecks and monitor performance over time.

#### Acceptance Criteria

1. WHEN each pipeline stage starts, THE Bot SHALL log the stage name and start timestamp to the console.
2. WHEN each pipeline stage completes, THE Bot SHALL log the stage name and elapsed duration in milliseconds.
3. WHEN a pipeline stage fails, THE Bot SHALL log the stage name, elapsed duration, and error message.
4. WHEN the full pipeline completes or fails, THE Bot SHALL log the total elapsed duration from video receipt to feedback sent.

