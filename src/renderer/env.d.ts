/// <reference types="vite/client" />
import type { ArcAPI } from '@shared/ipc';

declare global {
  interface Window {
    arc: ArcAPI;
  }
}

export {};
