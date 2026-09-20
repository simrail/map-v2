import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import webfontDownload from "vite-plugin-webfont-dl";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		webfontDownload([
			"https://fonts.googleapis.com/css2?family=Saira:wght@700;800;900&family=Source+Code+Pro:wght@400;500;600;700;800&display=swap",
		]),
		ViteImageOptimizer({}),
	],
});
