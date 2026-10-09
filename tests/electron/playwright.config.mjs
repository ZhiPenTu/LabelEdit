import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.mjs',workers:1,timeout:120000,expect:{timeout:30000},reporter:'list',outputDir:'../../output/electron-tests',use:{trace:'retain-on-failure'}});
