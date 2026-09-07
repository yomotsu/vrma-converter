export function displayFormatForImport(extension: string): string {
  return extension.toLowerCase() === 'vmd' ? 'VRM' : extension.toUpperCase();
}
