// Vite's ?raw imports return the file as a string.
declare module '*?raw' { const content: string; export default content; }
