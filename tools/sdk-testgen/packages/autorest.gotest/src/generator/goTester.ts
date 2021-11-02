/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license output.pushrmation.
 *--------------------------------------------------------------------------------------------*/

import * as _ from 'lodash';
import * as path from 'path';
import { ArraySchema, ChoiceSchema, DateTimeSchema, DictionarySchema, GroupProperty, Metadata, ObjectSchema, Parameter, Schema, SchemaType } from '@autorest/codemodel';
import { Config, TargetMode, variableDefaults } from '../common/constant';
import {
    ExampleModel,
    ExampleParameter,
    ExampleValue,
    MockTestDefinitionModel,
    TestCodeModel,
    TestCodeModeler,
    TestDefinitionModel,
    TestScenarioModel,
    TestStepArmTemplateDeploymentModel,
    TestStepRestCallModel,
} from '@autorest/testmodeler/dist/src/core/model';
import { Helper } from '@autorest/testmodeler/dist/src/util/helper';
import { Host } from '@autorest/extension-base';
import { ImportManager } from '@autorest/go/dist/generator/imports';
import { OavStepType } from '@autorest/testmodeler/dist/src/common/constant';
import { TestConfig } from '@autorest/testmodeler/dist/src/common/testConfig';
import { TestGenerator } from './testGenerator';
import { TestStep } from 'oav/dist/lib/testScenario/testResourceTypes';
import { generateReturnsInfo, getAPIParametersSig, getClientParametersSig, getSchemaResponse } from '../util/codegenBridge';


export async function processRequest(host: Host): Promise<void> {
    const session = await TestCodeModeler.getSessionFromHost(host);
    const config = await session.getValue('');
    if (_.get(config, Config.exportCodemodel, false)) {
        Helper.addCodeModelDump(session, 'go-tester-pre.yaml');
    }
    const generator = await new GoTestGenerator(host, session.model, new TestConfig(config));
    generator.genRenderData();
    const extraParam = { copyright: await Helper.getCopyright(session) };
    if (_.get(config, Config.generateMockTest, true)) {
        await generator.generateMockTest('mockTest.go.njk', extraParam);
    }
    if (_.get(config, Config.generateSdkExample, false)) {
        generator.generateExample('exampleTest.go.njk', extraParam);
    }
    if (_.get(config, Config.generateScenarioTest, false)) {
        await generator.generateScenarioTest('scenarioTest.go.njk', extraParam);
    }
    await Helper.outputToModelerfour(host, session);
    if (_.get(config, Config.exportCodemodel, false)) {
        Helper.addCodeModelDump(session, 'go-tester.yaml');
    }
    Helper.dump(host);
}

export class GoTestGenerator extends TestGenerator {
    importManager: ImportManager;
    definedVariables: Record<string, string> = {};

    public constructor(public host: Host, public codeModel: TestCodeModel, public testConfig: TestConfig) {
        super(host, codeModel, testConfig);
    }



    public getScenarioTestFilename(testDef: TestDefinitionModel): string {
        const file = path.basename(testDef._filePath);
        const filename = file.split('.').slice(0, -1).join('.');
        return `scenario/${this.getFilePrefix(Config.testFilePrefix)}${filename}_test.go`;
    }

    

}
