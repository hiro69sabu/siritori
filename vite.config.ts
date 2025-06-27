import path from 'path';
import { defineConfig } from 'vite';

// `loadEnv` と `mode` は不要になるため、削除します
export default defineConfig(() => {
    return {
      // `define` ブロックを完全に削除しました。
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
