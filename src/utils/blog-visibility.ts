/**
 * Visibility filter for the blog content collection.
 *
 * A post is visible when it is not a draft AND (has no `publishedAt`
 * OR its `publishedAt` is already in the past). Posts without
 * `publishedAt` are treated as immediately visible so existing
 * content stays live without frontmatter changes.
 *
 * Pair with a daily rebuild cron so scheduled posts auto-publish on
 * their target date: the filter evaluates against `new Date()` at
 * build time, and the cron re-runs the build every day.
 */
export interface BlogPostVisibilityData {
  draft?: boolean;
  publishedAt?: Date;
}

export function isPostVisible(
  data: BlogPostVisibilityData,
  now: Date = new Date(),
): boolean {
  if (data.draft === true) return false;
  if (data.publishedAt && data.publishedAt.valueOf() > now.valueOf()) {
    return false;
  }
  return true;
}
