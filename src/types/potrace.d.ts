declare module "potrace" {
  export function trace(
    file: string | Buffer,
    options: Record<string, unknown>,
    cb: (err: Error | null, svg: string) => void,
  ): void;
  const potrace: { trace: typeof trace };
  export default potrace;
}
