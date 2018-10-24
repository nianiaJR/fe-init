'use strict';
const fs = require('fs')
const inquirer = require('inquirer');
const path = require('path')
const mkdirp = require('mkdirp')
const downloadGitRepo = require('download-git-repo')
const ora = require('ora')
const glob = require('glob')
const urllib = require('urllib');
const defaultMapping = require('../package.json').boilerplates

require('colors')

module.exports = class Command {
    constructor() {
        this.cwd = process.cwd()
        this.boilerplate = {}
        this.targetDir = ''
        this.name = ''
        this.desc = ''
        this.httpClient = urllib.create()
        this.boilerplateMapping = {}
    }

    async curl(url, options) {
        return await this.httpClient.request(url, options)
    }

    async run(cwd, args) {
        // 从远程加载最新的模板来选择
        try {
            const res = await this.curl(`http://gitlab.example.com/api/v4/projects/1632/repository/files/package.json/raw?ref=master`, {
                method: 'GET',
                dataType: 'json',
                headers: {
                    'PRIVATE-TOKEN': 'test'
                },
            })
            this.boilerplateMapping = res.data.boilerplates
        } catch (_) {
            this.boilerplateMapping = defaultMapping
        }

        const dirInfo = await this.askTargetDir()
        if (!dirInfo) {
            return
        }
        this.targetDir = dirInfo.path
        this.dirName = dirInfo.name
        this.name = await this.askName()
        this.boilerplate = await this.askForBoilerplateType()
        this.desc = await this.askDescription()
        await this.download()
    }

    async askTargetDir() {
        const { dir } = await inquirer.prompt({
            name: 'dir',
            type: 'input',
            message: '请输入项目目录',
            default: '.'
        })

        // 目录不存在创建目录
        if (!fs.existsSync(dir)) {
            mkdirp.sync(dir)
        }

        const files = fs.readdirSync(dir).filter(name => name[0] !== '.');
        if (files.length !== 0) {
            this.log('当前项目不为空，无法进行脚手架初始化')
            return false
        }


        return {
            path: path.join(this.cwd, dir),
            name: dir
        }
    }

    async askName() {
        const { name }= await inquirer.prompt({
            name: 'name',
            type: 'input',
            message: '请输入项目名称',
            default: this.dirName
        })

        return name
    }

    async askDescription() {
        const { desc } = await inquirer.prompt({
            name: 'desc',
            type: 'input',
            message: '请输入项目描述',
            default: this.name
        })

        return desc
    }

    async askForBoilerplateType() {
        const choices = Object.keys(this.boilerplateMapping).map(key => {
            const item = this.boilerplateMapping[key]
            return {
                name: `${key} - ${item.desc}`,
                value: item
            }
        })

        const { boilerplate }= await inquirer.prompt({
            name: 'boilerplate',
            type: 'list',
            message: '请选择适合项目的脚手架',
            choices,
            pageSize: choices.length
        })

        return boilerplate
    }

    replaceFileVariables(content, scope, templateName) {
        const contentWithName = content.toString().replace(new RegExp(templateName, 'g'), scope.name)
        return contentWithName.toString().replace(/(\\)?{{ *(\w+) *}}/g, (block, skip, key) => {
            if (skip) {
                return block.substring(skip.length);
            }
            return scope.hasOwnProperty(key) ? scope[key] : block;
        })
    }

    async download() {
        const spinner = ora('正在下载模板')
        spinner.start()
        const { org } = this.boilerplate
        downloadGitRepo(org, this.targetDir, { clone: true }, err => {
            if (err) {
                spinner.fail()
                this.log(`下载失败：${e.message}`.red)
            } else {
                spinner.succeed()
                this.log('下载完成'.green)
                const files = glob.sync('**/*', { cwd: this.targetDir, dot: true, nodir: true });
                files.forEach(
                    fileName => {
                      const fullFileName = `${this.targetDir}/${fileName}`
                      if (fs.existsSync(fullFileName)) {
                        const content = fs.readFileSync(fullFileName, "utf8");
                        fs.writeFileSync(fullFileName, this.replaceFileVariables(content, {
                            name: this.name,
                            description: this.desc
                        }, this.boilerplate.name), "utf8");
                      }
                    }
                )
                this.log('完成相应模板参数替换'.green)
            }
        })
    }

    async log(message) {
        console.log('[fe-init]'.blue + message);
    }
}
