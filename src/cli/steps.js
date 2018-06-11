const github = require('../lib/github');
const {
  getPRByPrompt,
  getCommitsInPR,
  getCommitByPrompt,
  getCommitBySha,
  getBranchesByPrompt,
  doBackportVersions,
  handleErrors,
  maybeSetupRepo
} = require('./cliService');

async function initSteps(options) {
  const [owner, repoName] = options.upstream.split('/');
  github.setAccessToken(options.accessToken);

  try {
    let commits;
    if (options.sha) {
      commits = await getCommitBySha({ owner, repoName, sha: options.sha });
    } else if (options.fromPr) {
      let pr;
      if (options.pr) {
        pr = options.pr;
      } else {
        pr = await getPRByPrompt(owner, repoName);
      }
      commits = await getCommitsInPR({
        owner,
        repoName,
        pr,
        multipleCommits: options.multipleCommits
      });
    } else {
      commits = await getCommitByPrompt({
        owner,
        repoName,
        author: options.own ? options.username : null,
        multipleCommits: options.multipleCommits
      });
    }

    const branches = await getBranchesByPrompt(
      options.branches,
      options.multipleBranches
    );

    await maybeSetupRepo(owner, repoName, options.username);
    await doBackportVersions({
      owner,
      repoName,
      commits,
      branches,
      username: options.username,
      labels: options.labels
    });
  } catch (e) {
    handleErrors(e);
  }
}

module.exports = initSteps;
