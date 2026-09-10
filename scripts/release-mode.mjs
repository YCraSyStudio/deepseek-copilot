const TAG_REF_PREFIX = "refs/tags/";
const RELEASE_BRANCH_REF = "refs/heads/main";
const RELEASE_SUBJECT = /^release:\s/i;

/**
 * Decides whether a workflow run has to publish a release and which tag it targets.
 *
 * A pushed `v*` tag always publishes. So does a push to `main` whose commit subject starts with
 * `release:`, with the tag derived from the version being released, so cutting a release no longer
 * needs a tag that a human has to create before the gates run.
 */
export function resolveReleaseMode({ eventName, ref, headCommitMessage, version }) {
  const tagRef = tagRefName(ref);
  if (tagRef) {
    return { release: true, tag: tagRef, reason: "v-tag" };
  }
  if (eventName === "push" && ref === RELEASE_BRANCH_REF && RELEASE_SUBJECT.test(commitSubject(headCommitMessage))) {
    return { release: true, tag: `v${releaseVersion(version)}`, reason: "release-commit" };
  }
  return { release: false, tag: "", reason: "none" };
}

function tagRefName(ref) {
  const value = typeof ref === "string" ? ref : "";
  if (!value.startsWith(TAG_REF_PREFIX)) {
    return "";
  }
  const name = value.slice(TAG_REF_PREFIX.length);
  return /^v\d/.test(name) ? name : "";
}

function commitSubject(message) {
  const value = typeof message === "string" ? message : "";
  return value.split(/\r?\n/, 1)[0].trim();
}

function releaseVersion(version) {
  const value = typeof version === "string" ? version.trim() : "";
  if (!/^\d+\.\d+\.\d+/.test(value)) {
    throw new Error(`package.json version "${value}" cannot name a release tag.`);
  }
  return value.replace(/^v/, "");
}
