// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version?: string };

export const API_VERSION_NUMBER = pkg?.version ?? '1.0.0';
export const API_VERSION = `v${API_VERSION_NUMBER}`;
