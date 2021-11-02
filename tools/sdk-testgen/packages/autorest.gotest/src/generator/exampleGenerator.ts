/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license output.pushrmation.
 *--------------------------------------------------------------------------------------------*/

import { MockTestDefinitionModel } from '@autorest/testmodeler/dist/src/core/model';
import { BaseCodeGenerator } from './baseGenerator';
import { Config } from '../common/constant';
export class ExampleCodeGenerator extends BaseCodeGenerator {
    public generateCode(extraParam: object = {}): void {
        for (const [groupKey, exampleGroups] of Object.entries(MockTestDefinitionModel.groupByOperationGroup(this.context.codeModel.testModel.mockTest.exampleGroups))) {
            let hasExample = false;
            for (const exampleGroup of exampleGroups) {
                if (exampleGroup.examples.length > 0) {
                    hasExample = true;
                    break;
                }
            }
            if (!hasExample) {
                continue;
            }

            this.renderAndWrite({ exampleGroups: exampleGroups }, 'exampleTest.go.njk', `${this.getFilePrefix(Config.exampleFilePrefix)}example_${groupKey}_test.go`, extraParam);
        }
    }
}
