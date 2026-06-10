const ALLOWED_TASK_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_TASK_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

type UploadLike = {
  name: string;
  type: string;
};

export function taskImageExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function isAllowedTaskImageUpload(file: UploadLike): boolean {
  return ALLOWED_TASK_IMAGE_TYPES.has(file.type)
    && ALLOWED_TASK_IMAGE_EXTENSIONS.has(taskImageExtension(file.name));
}
