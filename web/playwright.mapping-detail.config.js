import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', testMatch:['mapping-detail.spec.js','metrics.spec.js'], workers:1, timeout:20000,
  use:{baseURL:'http://127.0.0.1:4191',viewport:{width:1400,height:920},screenshot:'only-on-failure'},
  webServer:{command:'npm run build && npm run dev -- --port 4191 --strictPort',url:'http://127.0.0.1:4191',timeout:45000},
});
