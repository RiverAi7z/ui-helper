export async function saveGifToDirectory(
  project: FileSystemDirectoryHandle,
  dataUrl: string,
  filename: string,
): Promise<string> {
  const helperDirectory = await project.getDirectoryHandle(".ui-helper", {
    create: true,
  });
  const recordingsDirectory = await helperDirectory.getDirectoryHandle(
    "recordings",
    { create: true },
  );
  const ignoreFile = await helperDirectory.getFileHandle(".gitignore", {
    create: true,
  });
  const ignoreWriter = await ignoreFile.createWritable();
  await ignoreWriter.write("*\n!.gitignore\n");
  await ignoreWriter.close();

  const gifFile = await recordingsDirectory.getFileHandle(filename, {
    create: true,
  });
  const writer = await gifFile.createWritable();
  await writer.write(await (await fetch(dataUrl)).blob());
  await writer.close();
  return `.ui-helper/recordings/${filename}`;
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for non-secure local development origins.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.documentElement.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Unable to copy feedback to the clipboard");
}
