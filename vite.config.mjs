import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const info={
 version:pkg.version,
 build:process.env.GITHUB_RUN_NUMBER||'local',
 commit:(process.env.GITHUB_SHA||'local').slice(0,7),
 builtAt:new Date().toISOString()
};
export default defineConfig({base:'./',define:{__GROT_BUILD__:JSON.stringify(info)}});
