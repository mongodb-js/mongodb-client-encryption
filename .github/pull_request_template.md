### Description

#### Summary of Changes

<!-- Please describe the changes in this PR in a high-level overview. -->
<!-- NOTE: This library provides encryption functionality for the MongoDB Node.js driver, it is not intended to be consumed in isolation. For changes to this library, please see the `mongodb` package: https://github.com/mongodb/node-mongodb-native -->

##### Notes for Reviewers

<!-- 
If there is any additional context on the changes in the PR that reviewers might find helpful, feel free to make notes in this section.

Otherwise, feel free to remove this section.
-->

#### What is the motivation for this change?

<!--
Remove this section if there is an associated Jira ticket explaining the motivation for this change. If there is not, please fill this section out with 
information explaining why this change is valuable.
-->

### Release Highlight

<!--
Contributors: please leave the release notes section for the Node driver team to fill in. The following instructions are for maintainers.

Fill in a highlight ONLY for user-visible changes: bug fixes users hit, security fixes, behavior changes. Routine dependency bumps and internal refactors should leave it empty.

Start the highlight with a `### ` heading.

NOTE: nothing in this repo reads this section automatically. Whoever cuts the release must copy it into the release PR body by hand before merging.
-->

<!-- RELEASE_HIGHLIGHT_START -->

<!-- ### Release notes highlight -->

<!-- RELEASE_HIGHLIGHT_END -->

### Double check the following

- [ ] Lint is passing (`npm run check:lint`)
- [ ] Self-review completed using the [steps outlined here](https://github.com/mongodb/node-mongodb-native/blob/HEAD/CONTRIBUTING.md#reviewer-guidelines)
- [ ] PR title follows the [correct format](https://www.conventionalcommits.org/en/v1.0.0/): `type(NODE-xxxx)[!]: description`
  - Example: `feat(NODE-1234)!: rewriting everything in coffeescript`
- [ ] Changes are covered by tests
- [ ] New TODOs have a related JIRA ticket
