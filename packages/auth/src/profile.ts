export type DeleteProfileSteps = {
  /** Paths of the files the profile owns. Runs first: the row delete cascades them away. */
  listFiles: () => Promise<string[]>;
  deleteRow: () => Promise<void>;
  removeFiles: (paths: string[]) => Promise<void>;
};

/**
 * Delete a profile and the files it stored. Each step throws on failure.
 *
 * The row goes first, so a failed delete leaves the profile's files intact. If
 * removing files then fails the profile is still gone, so that is logged rather
 * than reported as a failed delete.
 */
export async function deleteProfileWithFiles({
  listFiles,
  deleteRow,
  removeFiles,
}: DeleteProfileSteps): Promise<{ error?: string }> {
  let paths: string[];
  try {
    paths = await listFiles();
    await deleteRow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Delete failed' };
  }

  if (paths.length) {
    try {
      await removeFiles(paths);
    } catch (error) {
      console.error(`Orphaned ${paths.length} stored file(s):`, error);
    }
  }
  return {};
}
