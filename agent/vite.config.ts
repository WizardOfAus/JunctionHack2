import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [flue()],
	// The Koti app (app/) uses 5173, so the agent dev server uses 5180.
	server: { host: '127.0.0.1', port: 5180, strictPort: true },
});
