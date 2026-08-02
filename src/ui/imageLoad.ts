export interface LoadedImage {
  dataUri: string;
  naturalW: number;
  naturalH: number;
}

/** Read an image File/Blob into a data URI plus its natural pixel size. */
export function loadImageFile(file: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUri = reader.result as string;
      const img = new Image();
      img.onload = () =>
        resolve({ dataUri, naturalW: img.naturalWidth, naturalH: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUri;
    };
    reader.readAsDataURL(file);
  });
}
