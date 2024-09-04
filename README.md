# SabaccUI CLI

[![npm version](https://img.shields.io/npm/v/sabaccui.svg)](https://www.npmjs.com/package/sabaccui)
[![npm downloads](https://img.shields.io/npm/dt/sabaccui.svg)](https://www.npmjs.com/package/sabaccui)
[![GitHub issues](https://img.shields.io/github/issues/coderscantina/sabaccui-cli.svg?style=flat-square)](https://github.com/coderscantina/sabaccui-cli/issues)

SabaccUI is a powerful CLI tool designed to streamline your UI development process. Whether you're building a small project or a galaxy-spanning application, SabaccUI has got you covered!

## Installation

Make sure you have Node.js `>= 18.0.0` installed. Then run:

```sh
npm install -g sabaccui
```

## Commands

### login

Log in to your SabaccUI account:

```sh
sabaccui login
```

### logout

Log out from your SabaccUI account:

```sh
sabaccui logout
```

### buy

Purchase a SabaccUI license key:

```sh
sabaccui buy
```

### license

Enter and activate your SabaccUI license key:

```sh
sabaccui license
```

### configure

Retrieve your global SabaccUI settings:

```sh
sabaccui config
```

Retrieve a specific SabaccUI setting:

```sh
sabaccui config <key>
```

Set a SabaccUI setting:

```sh
sabaccui config <key> <value>
```

#### Available Settings

| Key | Default | Description                                                   |
| --- |---------|---------------------------------------------------------------|
| `certificateSources.cert` | `null`  | Path to a SSL certificate file to be linked into the project. |
| `certificateSources.key`  | `null`  | Path to a SSL key file to be linked into the project.         |

### init

Initialize a new SabaccUI project:

```sh
sabaccui init <project-name> [template]
```

Options:
- `-p, --path <path>`: Specify the project path
- '-s, --space <space>`: Specify the Storyblok space ID'

### setup

Setup SabaacUI in an existing project:

```sh
sabaccui setup
```

### templates

List all available project templates:

```sh
sabaccui templates
```

### components

List all available components:

```sh
sabaccui components
```

### add

Add a new component to your project:

```sh
sabaccui add <component-name>
```

Options:
- `-p, --path <path>`: Specify the project path
- '-s, --space <space>`: Specify the Storyblok space ID'

## Examples

```sh
# Log in to SabaccUI
sabaccui login

# Initialize a new project
sabaccui init my-project startup

# List available components
sabaccui components

# Add a component to your project
sabaccui add button -p ./my-awesome-ui
```
