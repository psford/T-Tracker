// collector/src/sse-parser.mjs — Incremental SSE stream parser (pure)
//
// Parses text/event-stream chunks fed incrementally (chunks may split lines
// or events arbitrarily). Emits { event, data } records on each blank-line
// dispatch, per the SSE spec subset the MBTA V3 streaming API uses.

/**
 * Creates an incremental SSE parser.
 *
 * @param {Function} onDispatch — callback({ event: string, data: string })
 * @returns {{ feed: Function, reset: Function }}
 */
export function createSseParser(onDispatch) {
    let buffer = '';
    let eventType = '';
    let dataLines = [];

    function processLine(line) {
        if (line === '') {
            // Blank line — dispatch accumulated event
            if (dataLines.length > 0) {
                onDispatch({
                    event: eventType || 'message',
                    data: dataLines.join('\n'),
                });
            }
            eventType = '';
            dataLines = [];
            return;
        }
        if (line.startsWith(':')) {
            return; // comment / keep-alive
        }
        const colonIdx = line.indexOf(':');
        const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
        let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
        if (value.startsWith(' ')) {
            value = value.slice(1);
        }
        if (field === 'event') {
            eventType = value;
        } else if (field === 'data') {
            dataLines.push(value);
        }
        // 'id' and 'retry' fields are ignored — not used by this collector
    }

    return {
        /**
         * Feed a chunk of stream text into the parser.
         * @param {string} chunk
         */
        feed(chunk) {
            buffer += chunk;
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                let line = buffer.slice(0, newlineIdx);
                buffer = buffer.slice(newlineIdx + 1);
                if (line.endsWith('\r')) {
                    line = line.slice(0, -1);
                }
                processLine(line);
            }
        },

        /**
         * Reset parser state (call on reconnect so a partial event from a
         * dropped connection never bleeds into the next one).
         */
        reset() {
            buffer = '';
            eventType = '';
            dataLines = [];
        },
    };
}
