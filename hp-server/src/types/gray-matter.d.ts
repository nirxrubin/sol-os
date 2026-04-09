// Minimal type declaration for gray-matter (installed at runtime, optional dependency)
declare module 'gray-matter' {
  interface GrayMatterFile {
    data: Record<string, unknown>;
    content: string;
    excerpt?: string;
  }
  function matter(input: string | Buffer): GrayMatterFile;
  namespace matter {
    function stringify(content: string, data: Record<string, unknown>): string;
  }
  export = matter;
}
