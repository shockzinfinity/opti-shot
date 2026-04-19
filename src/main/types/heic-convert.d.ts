declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer
    format: 'JPEG' | 'PNG'
    quality?: number
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>
  export default convert
}
