import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('production ES5 Seerr error identity', () => {
    it('preserves the domain error identity used to recover an expired proxy session', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/apps/modern/features/client/seerr/api.ts'), 'utf8');
        const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS } }).outputText;
        const compiledExports = {} as { SeerrError: new (status: number) => Error & { status: number } };
        // eslint-disable-next-line sonarjs/code-eval -- Only this repository's fixed API source is compiled; imports are stubbed and no external input is executed.
        runInNewContext(compiled, { exports: compiledExports, require: () => ({ isAxiosError: () => false }), Error });
        const expired = new compiledExports.SeerrError(401);
        expect(expired).toBeInstanceOf(Error);
        expect(expired).toBeInstanceOf(compiledExports.SeerrError);
        expect(expired.status).toBe(401);
    });
});
