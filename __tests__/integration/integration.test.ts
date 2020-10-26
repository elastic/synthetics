import { spawn } from 'child_process';
import { symlinkSync } from 'fs';
import { join } from 'path';
import {dirSync as mkTmpDirSync, DirSyncObject} from 'tmp';
import { promisify } from 'util';

describe("integration tests", () => {
    let tmpDir: DirSyncObject;
    beforeEach(() => {
        // @ts-ignore the types for this class are far more strict than required
        tmpDir = mkTmpDirSync()
    });
    afterEach(() => {
        // @ts-ignore the types for this class are far more strict than required
        tmpDir.removeCallback();
    })

    it.skip("should run the docs example", async () => {
        const exampleDir = join(tmpDir.name, 'elastic-docs');
        symlinkSync(exampleDir, join(__dirname, '../../examples/elastic-docs'));
        console.log("created", exampleDir);
        const process = spawn(`npx @elastic/synthetics ${exampleDir}`)
        console.log("will run", exampleDir)
    })
});