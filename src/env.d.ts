/// <reference types="vite/client" />

declare module 'virtual:display-dex' {
  const data: import('./domain/dex').DisplayDexData;
  export default data;
}
