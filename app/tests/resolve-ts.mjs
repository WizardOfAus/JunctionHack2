// Resolve the app's bundler-style imports for Node's type-stripping test runner.
import { register } from 'node:module';
register('./resolve-ts-loader.mjs', import.meta.url);
