import { copyFile, mkdir, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const webviewAssets = {
  name: 'webview-assets',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await mkdir('dist/webview', { recursive: true });
      await Promise.all([
        copyFile('webview/index.html', 'dist/webview/index.html'),
        copyFile('webview/style.css', 'dist/webview/style.css'),
      ]);
    });
  },
};

await rm('dist', { recursive: true, force: true });

const contexts = await Promise.all([
  esbuild.context({
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    external: ['vscode'],
    logLevel: 'info',
  }),
  esbuild.context({
    entryPoints: ['webview/main.ts'],
    outfile: 'dist/webview/main.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    logLevel: 'info',
    plugins: [webviewAssets],
  }),
]);

if (watch) {
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));
}
