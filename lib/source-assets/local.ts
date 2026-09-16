import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";

import type {
  PastPaperAssetDescriptor,
} from "@/lib/source-assets/repository";

export function resolvePrivateSourceAssetPath(
  privateSourcesRoot: string,
  asset: PastPaperAssetDescriptor,
): string {
  if (
    !asset.storagePath.trim() ||
    isAbsolute(asset.storagePath) ||
    /^(?:https?|ftp):\/\//i.test(
      asset.storagePath,
    )
  ) {
    throw new Error(
      "private source asset path must be relative",
    );
  }

  const root = resolve(privateSourcesRoot);
  const target = resolve(
    root,
    asset.storagePath,
  );
  const fromRoot = relative(root, target);

  if (
    !fromRoot ||
    fromRoot.startsWith("..") ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(
      "private source asset escapes its configured root",
    );
  }

  return target;
}
