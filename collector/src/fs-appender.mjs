// collector/src/fs-appender.mjs — Local filesystem appender (dev / soak testing)

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Creates an appender that appends gzip members to files under a root dir.
 *
 * @param {string} rootDir — base directory (created on demand)
 * @returns {{ append: Function }}
 */
export function createFsAppender(rootDir) {
    return {
        async append(path, buf) {
            const fullPath = join(rootDir, path);
            await mkdir(dirname(fullPath), { recursive: true });
            await appendFile(fullPath, buf);
        },
    };
}
