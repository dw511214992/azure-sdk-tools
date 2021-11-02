/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license output.pushrmation.
 *--------------------------------------------------------------------------------------------*/

import * as nunjucks from 'nunjucks';
import * as path from 'path';
import { variableDefaults } from '../common/constant';
import { GenerateContext } from './generateContext';
export abstract class BaseDataRender{
    public constructor(public context: GenerateContext) {}

    abstract generateRenderData(): void;
}

export abstract class BaseCodeGenerator {
    public constructor(public context: GenerateContext) {}

    abstract generateCode(extraParam: object): void;

    protected renderAndWrite(model: object, templateFileName: string, outputFileName: string, extraParam: object = {}, jsFunc: object = {}) {
        const tmplPath = path.relative(process.cwd(), path.join(`${__dirname}`, `../../src/template/${templateFileName}`));

        const output = this.render(
            tmplPath,
            {
                ...model,
                config: this.context.testConfig.config,
                ...extraParam,
                imports: this.context.importManager.text(),
                packageName: this.context.packageName,
            },
            jsFunc,
        );
        this.writeToHost(outputFileName, output);
    }

    private writeToHost(fileName: string, output: string) {
        this.context.host.WriteFile(fileName, output, undefined);
    }

    private render(templatePath: string, data: any, jsFunc: object): string {
        nunjucks.configure({ autoescape: false });
        return nunjucks.render(templatePath, {
            ...data,
            jsFunc,
        });
    }

    protected getFilePrefix(configName: string) {
        let filePrefix = this.context.testConfig.getValue(configName, variableDefaults[configName]);
        if (filePrefix.length > 0 && filePrefix[filePrefix.length - 1] !== '_') {
            filePrefix += '_';
        }
        return filePrefix;
    }
}
