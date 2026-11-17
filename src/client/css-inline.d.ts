/** Raw stylesheet text imported by the Client bundle (resolved by tsdown). */
declare module "*.css?raw" {
  const css: string;
  export default css;
}
