# @atomist/sdm-pack-rcca-github

[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist/sdm-pack-rcca-github/5c16710c-8f0f-4807-b550-4a7077ed82c4)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-rcca-github.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-rcca-github)

[Atomist][atomist] software delivery machine (SDM) extension Pack 
to manage and converge GitHub resources.

See the [Atomist documentation][atomist-doc] for more information on
what SDMs are and what they can do for you using the Atomist API for
software.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Usage

### Converging GitHub Organizations

Use the Atomist CLI to create or configure your GitHub SCM provider
configuration with Atomist:

```
# To login and connect to Atomist run:
$ atomist config

# If you already have an Atomist workspace you can skip the next step:
$ atomist workspace create

# Finally run the following command to create a GitHub SCM provider:
$ atomist provider create
```

Once you created the SCM provider, you can now start converging it. To
do this, install this extension pack into your SDM:

```
$ npm install @atomist/sdm-pack-rcca-github
```

Next register the `convergeGitHub` pack in your SDM:

```typescript
import { convergeGitHub } from "@atomist/sdm-pack-rcca-github";

...
    sdm.addExtensionPacks(
        convergeGitHub(),
    );
...
```

### Polling GitHub Organization or User

This pack supports polling for SCM events against GitHub or GHE.

The following steps install and register the extension in your SDM:

```
$ npm install @atomist/sdm-pack-rcca-github
```

Next register the `convergeGitHub` pack in your SDM:

```typescript
import { watchGitHub } from "@atomist/sdm-pack-rcca-github";

...
    sdm.addExtensionPacks(
        watchGitHub({
            owner: ["atomist", "atomisthq"],
        }),
    );
...
```

The configuration can also be provided in the `client.config.json`:

```json
{
  "sdm": {
    "watch": {
      "github": {
        "token": "<your github token>",
        "owner": ["atomist", "atomisthq"],
        "user": false,
        "interval": 60000,
        "apiUrl": "https://api.github.com"        
      }
    }
  }
}
```

_Note: This extension only watches GitHub when the SDM is started in local mode `atomist start --local`_ 

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/sdm-pack-docker/issues

## Development

You will need to install [Node][node] to build and test this project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Use the following package scripts to build, test, and perform other
development tasks.

Command | Reason
------- | ------
`npm install` | install project dependencies
`npm run build` | compile, test, lint, and generate docs
`npm run lint` | run TSLint against the TypeScript
`npm run compile` | generate types from GraphQL and compile TypeScript
`npm test` | run tests
`npm run autotest` | run tests every time a file changes
`npm run clean` | remove files generated during build

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)

[atomist]: https://atomist.com/ (Atomist - Development Automation)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
