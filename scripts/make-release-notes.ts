import * as readline from "readline";
import { TruffleColors } from "../src/packages/colors";
import yargs from "yargs";
import { execSync } from "child_process";
import { exit } from "process";
import {
  getBackToLink,
  getChangelogHead,
  getCommitsMd,
  getFuturePlansHead,
  getIssueGroupMarkdown,
  getKnownIssuesHead,
  getIssueSectionMarkdown,
  getMdBody,
  getSectionMd,
  getSectionTableContent,
  getTocMd,
  getHighlightsMd
} from "./release-notes-data";

const chalk = require("chalk");

const validReleaseBranches = [
  "beta",
  "alpha",
  "rc",
  "develop",
  "master",
  "release-notes-automation"
];

const COMMAND_NAME = "make-release-notes";
const GH_REPO = "trufflesuite/ganache";

const COLORS = {
  Bold: "\x1b[1m",
  Reset: "\x1b[0m",
  FgRed: "\x1b[31m"
};

const issueSection = [
  {
    pretty: "Known Issues",
    url: "known-issues",
    groups: [
      {
        name: "Top Priority",
        priorities: ["priority1 🚨"],
        labels: ["bug"]
      },
      {
        name: "Coming Soon™",
        priorities: ["priority2 ⚠️"],
        labels: ["bug"]
      }
    ]
  },
  {
    pretty: "Future Plans",
    url: "future-plans",
    groups: [
      {
        name: "Top Priority",
        priorities: ["priority1 🚨"],
        labels: ["enhancement"]
      },
      {
        name: "Coming Soon™",
        priorities: ["priority2 ⚠️"],
        labels: ["enhancement"]
      }
    ]
  }
];

const getArgv = () => {
  const npmConfigArgv = process.env["npm_config_argv"];
  if (npmConfigArgv) {
    // handle `npm run make-release version`
    // convert original npm args into a command
    // make-release <version>
    return JSON.parse(npmConfigArgv).original.slice(1);
  } else {
    // handle `ts-node ./scripts/make-release.ts version`
    const args = [...process.argv].slice(2);
    args.unshift(COMMAND_NAME);
    return args;
  }
};

const argv = yargs(getArgv())
  .command(`${COMMAND_NAME}`, "", yargs => {
    yargs
      .option("releaseVersion", {
        default: "TEST_VERSION",
        require: false
      })
      .option("branch", {
        default: function getCurrentBranch() {
          return execSync("git rev-parse --abbrev-ref HEAD", {
            encoding: "utf8"
          }).trim();
        },
        require: false
      })
      .option("highlights", {
        default: true,
        require: false
      });
    return yargs.usage(
      chalk`{hex("${TruffleColors.porsche}").bold Create a release markdown template}`
    );
  })
  .version(false)
  .help(false)
  .fail((msg, err, yargs) => {
    // we use a custom `fail` fn so that NPM doesn't print its own giant error message.
    if (err) throw err;

    console.error(yargs.help().toString().replace("\n\n\n", "\n"));
    console.error();
    console.error(msg);
    process.exit(0);
  }).argv;

process.stdout.write(`${COLORS.Reset}`);

const getCommitMetrics = (branch: string) => {
  const numStat = execSync(`git diff "${branch}"..develop --numstat`, {
    encoding: "utf8"
  }).split("\n");
  const files = new Set();
  const metrics = {
    commitCount: 0,
    additionCount: 0,
    deletionCount: 0,
    fileCount: 0
  };
  numStat.forEach(line => {
    if (!line) return;
    const [added, deleted, file] = line.split(/\t/g);
    metrics.additionCount += parseInt(added, 10);
    metrics.deletionCount += parseInt(deleted, 10);
    files.add(file);
  });
  metrics.fileCount = files.size;
  return metrics;
};

(async function () {
  const misc = { slug: "build", pretty: "Miscellaneous", url: "miscellaneous" };
  const details = {
    breaking: {
      slug: "breaking",
      pretty: "Breaking Changes",
      url: "breaking-changes"
    },
    feat: { slug: "feat", pretty: "New Features", url: "new-features" },
    fix: { slug: "fix", pretty: "Fixes", url: "fixes" },
    build: misc,
    chore: misc,
    ci: misc,
    docs: misc,
    style: misc,
    refactor: misc,
    perf: misc,
    test: misc
  } as const;
  type Type = keyof typeof details;
  type Section = { type: Type; subject: string; pr: string; body: string };
  const types = Object.keys(details) as Type[];

  const version = argv.releaseVersion as string;
  const branch = argv.branch as string;
  const includeHighlights = argv.highlights === "false" ? false : true;

  if (!validReleaseBranches.includes(branch))
    throw new Error(
      `You must be on a valid branch (${validReleaseBranches.join(", ")})`
    );

  const output = execSync(`git log "${branch}"..develop --pretty=format:%s`, {
    encoding: "utf8"
  });

  const metrics = getCommitMetrics(branch);

  const commits = output.split("\n").reverse();
  metrics.commitCount = commits.length;

  async function parse() {
    const sections: Map<keyof typeof details, Section[]> = new Map();
    const commitData = [];
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      let [_, _type, scope, comment, pr] = commit.split(
        /^([a-z]+)(\(.+\))?:(.*?)(?:\(#(\d.+)\))?$/i
      );
      const type = (_type ? _type.trim().toLowerCase() : undefined) as Type;

      if (types.includes(type)) {
        const { slug } = details[type as Type];

        const ghData = pr
          ? JSON.parse(
              execSync(
                `gh pr view ${pr} --json author,body --repo ${GH_REPO}`,
                {
                  encoding: "utf8"
                }
              )
            )
          : "";
        const author = ghData && ghData.author ? ghData.author.login : "";
        const body =
          ghData && ghData.body
            ? ghData.body.replace("\r\n", "<br/>")
            : "DESCRIPTION";

        const scopeMd = scope ? `${scope}` : "";
        const prMd = pr ? `(#${pr})` : "";
        const subjectSansPr = `${type}${scopeMd}: ${comment.trim()}`;
        const subject = `${subjectSansPr} ${prMd}`;

        const section: Section[] = sections.get(slug as Type) || [];
        if (pr && author) {
          commitData.push({ subject: subjectSansPr, pr, author });
        }
        section.push({ type, subject, pr, body });
        sections.set(slug as Type, section);
      } else {
        while (true) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const question = (q: string) => {
            return new Promise(resolve => {
              rl.question(q, resolve);
            });
          };
          const answer = (await question(
            "No matching semantic type for commit:\n" +
              commit +
              "\n\nIgnore commit? (I) or (C)ancel?\n"
          )) as any;
          rl.close();
          if (answer.toLowerCase() === "i") {
            console.log("ignoring commit");
            break;
          } else if (answer.toLowerCase() === "c") {
            throw new Error("User cancelled");
          }
        }
      }
    }
    const ordered: Map<Type, Section[]> = new Map();
    for (const type of types) {
      if (sections.has(type)) {
        ordered.set(type, sections.get(type)!);
      }
    }
    return { sections: ordered, commits: commitData };
  }

  try {
    const { sections, commits } = await parse();

    const sectionTableContents: string[] = [];
    const sectionMarkdown: string[] = [];
    const changelogMarkdown: string[] = [];

    if (includeHighlights) {
      sectionTableContents.push(
        getSectionTableContent(version, "highlights", "Highlights")
      );
      sectionMarkdown.push(getHighlightsMd(version));
    }
    for (const [slug, section] of sections) {
      const typeDeets = details[slug];
      const url = typeDeets.url;
      const pretty = typeDeets.pretty;

      sectionTableContents.push(getSectionTableContent(version, url, pretty));

      const tocMarkdown: string[] = [];
      const commitsMarkdown: string[] = [];
      const printToc = section.length > 1;
      section.forEach(({ subject, body }, i) => {
        if (printToc) {
          tocMarkdown.push(getTocMd(subject, version, url, i));
        }
        const backToLink = printToc ? getBackToLink(version, url, pretty) : "";
        commitsMarkdown.push(
          getCommitsMd(subject, version, url, i, body) + backToLink
        );
      });

      sectionMarkdown.push(
        getSectionMd(version, url, pretty, commitsMarkdown, tocMarkdown)
      );
    }

    // make changelog
    for (const commit of commits) {
      changelogMarkdown.push(
        ` - #${commit.pr} ${commit.subject} (@${commit.author})`
      );
    }
    sectionMarkdown.push(
      getSectionMd(version, "changelog", "Changelog", changelogMarkdown)
    );

    sectionTableContents.push(getChangelogHead(version));

    // make known issues and future plans
    for (const section of issueSection) {
      const issueSectionMarkdown: string[] = [];
      let hasMatch = true;
      for (const group of section.groups) {
        const quotedLabelSearch = group.labels.join('\\",\\"');
        const issueGroup: { number: number; title: string }[] = [];
        for (const priority of group.priorities) {
          const cmd = `gh issue list --json number,title --search "label:\\"${priority}\\" label:\\"${quotedLabelSearch}\\""`;
          const ghData = JSON.parse(execSync(cmd, { encoding: "utf8" }));
          issueGroup.push(...ghData);
        }
        // if this group in the section doesn't have data, we need to know not to print headers for the next group in the section
        if (issueGroup.length === 0) {
          hasMatch = false;
        } else {
          if (hasMatch) {
            issueSectionMarkdown.push(getIssueGroupMarkdown(group.name));
          }
          for (const issue of issueGroup) {
            const { number, title } = issue;
            issueSectionMarkdown.push(
              getIssueSectionMarkdown(title, number.toString())
            );
          }
        }
      }
      sectionMarkdown.push(
        getSectionMd(version, section.url, section.pretty, issueSectionMarkdown)
      );
    }

    sectionTableContents.push(getKnownIssuesHead(version));

    // make future plans
    sectionTableContents.push(getFuturePlansHead(version));

    let markdown = getMdBody(
      version,
      sectionTableContents,
      metrics,
      sectionMarkdown
    );

    require("fs").writeFileSync("my-draft.md", markdown, { encoding: "utf8" });
  } catch (e) {
    console.error(e);
    exit(1);
  }
})();
